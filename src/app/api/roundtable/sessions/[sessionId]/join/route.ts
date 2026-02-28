import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { ROUND_TABLE_LIMITS } from "@/lib/roundtable/constants";
import { logRoundtableEvent } from "@/lib/roundtable/server";
import { parseJsonSafely, requireCaptcha, requireRateLimit, resolveActor, withGuestCookie } from "@/lib/roundtable/api";
import { reconcileSession } from "@/lib/roundtable/reconcile";
import { supabaseAdmin } from "@/lib/supabase/server";

type JoinPayload = {
  display_name?: string;
  seat_no?: number;
  captcha_token?: string;
};

type JoinErrorCode =
  | "invalid_payload"
  | "captcha_failed"
  | "rate_limited"
  | "session_not_found"
  | "session_closed"
  | "room_full"
  | "identity_conflict"
  | "seat_taken_retry_exhausted"
  | "join_failed";

type Actor = Awaited<ReturnType<typeof resolveActor>>;

const MAX_JOIN_RETRY_ATTEMPTS = 6;

const resolveSeat = (requestedSeat: number | undefined, occupied: Set<number>, maxSeats: number) => {
  if (
    Number.isInteger(requestedSeat) &&
    (requestedSeat as number) >= 1 &&
    (requestedSeat as number) <= maxSeats
  ) {
    return occupied.has(requestedSeat as number) ? null : (requestedSeat as number);
  }

  for (let seat = 1; seat <= maxSeats; seat += 1) {
    if (!occupied.has(seat)) return seat;
  }

  return null;
};

const isUniqueViolation = (error: { code?: string | null; message?: string | null } | null | undefined) => {
  const code = String(error?.code ?? "");
  if (code === "23505") return true;
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("duplicate key");
};

const isActorConflict = (error: { message?: string | null } | null | undefined) => {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    message.includes("roundtable_members_joined_session_guest_uidx") ||
    message.includes("roundtable_members_joined_session_profile_uidx")
  );
};

const actorMetadata = (actor: Actor | null) => ({
  actor_type: actor?.profileId ? "profile" : "guest",
  guest_id_hash: actor?.guestId
    ? createHash("sha256").update(actor.guestId).digest("hex").slice(0, 24)
    : null,
  profile_id: actor?.profileId ?? null,
});

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  const payload = await parseJsonSafely<JoinPayload>(request);
  if (!payload) {
    return NextResponse.json({ error: "Invalid payload.", code: "invalid_payload" }, { status: 400 });
  }

  const actor: Actor | null = await resolveActor(request, payload.display_name ?? null);
  const requestedSeatNo = Number.isInteger(payload.seat_no) ? Number(payload.seat_no) : null;

  const emitJoinAttempt = async (
    code: JoinErrorCode | "joined" | "already_joined",
    status: number,
    metadata?: Record<string, unknown>
  ) => {
    await logRoundtableEvent(
      "roundtable_join_attempt",
      {
        session_id: params.sessionId,
        requested_seat_no: requestedSeatNo,
        result_code: code,
        http_status: status,
        ...actorMetadata(actor),
        ...(metadata ?? {}),
      },
      actor?.profileId ?? null
    );
  };

  const respondError = async (
    status: number,
    code: JoinErrorCode,
    message: string,
    metadata?: Record<string, unknown>
  ) => {
    await emitJoinAttempt(code, status, metadata);
    const response = NextResponse.json({ error: message, code }, { status });
    return withGuestCookie(response, actor?.guestId ?? null);
  };

  const respondSuccess = async (
    status: number,
    member: { id: string; seat_no: number },
    code: "joined" | "already_joined",
    metadata?: Record<string, unknown>
  ) => {
    await emitJoinAttempt(code, status, {
      member_id: member.id,
      seat_no: member.seat_no,
      ...(metadata ?? {}),
    });

    await logRoundtableEvent(
      "roundtable_join_success",
      {
        session_id: params.sessionId,
        member_id: member.id,
        seat_no: member.seat_no,
        ...actorMetadata(actor),
      },
      actor?.profileId ?? null
    );

    const response = NextResponse.json({ ok: true, member_id: member.id, seat_no: member.seat_no }, { status });
    return withGuestCookie(response, actor?.guestId ?? null);
  };

  const captchaToken = (payload.captcha_token ?? "").trim();
  if (captchaToken.length) {
    const captchaValid = await requireCaptcha(request, captchaToken);
    if (!captchaValid) {
      return respondError(400, "captcha_failed", "Captcha validation failed.");
    }
  }

  const rateAllowed = await requireRateLimit({
    request,
    actionType: "roundtable_session_join",
    maxCount: ROUND_TABLE_LIMITS.joinSession.maxCount,
    windowMs: ROUND_TABLE_LIMITS.joinSession.windowMs,
    guestId: actor.guestId,
    sessionId: params.sessionId,
  });

  if (!rateAllowed) {
    return respondError(429, "rate_limited", "Rate limit exceeded.");
  }

  try {
    await reconcileSession(params.sessionId);

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("roundtable_sessions")
      .select("id, status, max_seats")
      .eq("id", params.sessionId)
      .maybeSingle();

    if (sessionError) {
      return respondError(500, "join_failed", sessionError.message);
    }

    if (!session) {
      return respondError(404, "session_not_found", "Session not found.");
    }

    if (session.status === "ended" || session.status === "cancelled") {
      return respondError(400, "session_closed", "Session is closed.");
    }

    const maxSeats = Number(session.max_seats) || 5;

    for (let attempt = 1; attempt <= MAX_JOIN_RETRY_ATTEMPTS; attempt += 1) {
      let existingQuery = supabaseAdmin
        .from("roundtable_members")
        .select("id, seat_no, display_name, joined_at")
        .eq("session_id", params.sessionId)
        .eq("state", "joined");

      if (actor.profileId) {
        existingQuery = existingQuery.eq("profile_id", actor.profileId);
      } else if (actor.guestId) {
        existingQuery = existingQuery.eq("guest_id", actor.guestId);
      }

      const { data: existingRows, error: existingError } = await existingQuery.order("joined_at", { ascending: false });
      if (existingError) {
        return respondError(500, "join_failed", existingError.message, { attempt });
      }

      const existingMembers = (existingRows ?? []) as Array<{
        id: string;
        seat_no: number;
        display_name: string | null;
        joined_at: string;
      }>;
      const existing = existingMembers[0] ?? null;

      if (existingMembers.length > 1) {
        const duplicateIds = existingMembers.slice(1).map((member) => member.id);
        const { error: cleanupError } = await supabaseAdmin
          .from("roundtable_members")
          .update({ state: "left", left_at: new Date().toISOString() })
          .in("id", duplicateIds)
          .eq("session_id", params.sessionId)
          .eq("state", "joined");

        if (cleanupError) {
          return respondError(500, "join_failed", cleanupError.message, { attempt });
        }
      }

      if (existing?.id) {
        const incomingName = actor.displayName?.trim() ?? "";
        const existingName = existing.display_name?.trim() ?? "";
        if (incomingName.length && incomingName !== existingName) {
          const { error: renameError } = await supabaseAdmin
            .from("roundtable_members")
            .update({ display_name: incomingName })
            .eq("id", existing.id)
            .eq("state", "joined");
          if (renameError) {
            return respondError(500, "join_failed", renameError.message, { attempt });
          }
        }

        return respondSuccess(200, { id: existing.id, seat_no: existing.seat_no }, "already_joined", { attempt });
      }

      const { data: occupiedRows, error: occupiedError } = await supabaseAdmin
        .from("roundtable_members")
        .select("seat_no")
        .eq("session_id", params.sessionId)
        .eq("state", "joined");

      if (occupiedError) {
        return respondError(500, "join_failed", occupiedError.message, { attempt });
      }

      const occupied = new Set(
        (occupiedRows ?? [])
          .map((row) => Number(row.seat_no))
          .filter((seatNo) => Number.isInteger(seatNo) && seatNo >= 1 && seatNo <= maxSeats)
      );

      if (occupied.size >= maxSeats) {
        return respondError(409, "room_full", `Room is full. Only ${maxSeats} people can join.`, { attempt });
      }

      const seatNo = resolveSeat(payload.seat_no, occupied, maxSeats);
      if (!seatNo) {
        return respondError(409, "room_full", `Room is full. Only ${maxSeats} people can join.`, { attempt });
      }

      const { data: seatRecord, error: seatRecordError } = await supabaseAdmin
        .from("roundtable_members")
        .select("id, state")
        .eq("session_id", params.sessionId)
        .eq("seat_no", seatNo)
        .maybeSingle();

      if (seatRecordError) {
        return respondError(500, "join_failed", seatRecordError.message, { attempt, seat_no: seatNo });
      }

      let member: { id: string; seat_no: number } | null = null;

      if (seatRecord?.id) {
        if (seatRecord.state === "joined") {
          continue;
        }

        const { data: revivedMember, error: reviveError } = await supabaseAdmin
          .from("roundtable_members")
          .update({
            profile_id: actor.profileId,
            guest_id: actor.guestId,
            display_name: actor.displayName,
            state: "joined",
            joined_at: new Date().toISOString(),
            left_at: null,
          })
          .eq("id", seatRecord.id)
          .eq("session_id", params.sessionId)
          .neq("state", "joined")
          .select("id, seat_no")
          .maybeSingle();

        if (reviveError) {
          if (isUniqueViolation(reviveError)) {
            if (isActorConflict(reviveError)) {
              let actorConflictQuery = supabaseAdmin
                .from("roundtable_members")
                .select("id, seat_no")
                .eq("session_id", params.sessionId)
                .eq("state", "joined");

              if (actor.profileId) {
                actorConflictQuery = actorConflictQuery.eq("profile_id", actor.profileId);
              } else if (actor.guestId) {
                actorConflictQuery = actorConflictQuery.eq("guest_id", actor.guestId);
              }

              const { data: actorConflictRows } = await actorConflictQuery.order("joined_at", { ascending: false }).limit(1);
              const conflictMember = (actorConflictRows?.[0] as { id: string; seat_no: number } | undefined) ?? null;
              if (conflictMember?.id) {
                return respondSuccess(200, conflictMember, "already_joined", {
                  attempt,
                  resolved_from: "identity_conflict",
                });
              }
              return respondError(409, "identity_conflict", "You already have an active seat in this room.", {
                attempt,
                seat_no: seatNo,
              });
            }
            continue;
          }
          return respondError(500, "join_failed", reviveError.message, { attempt, seat_no: seatNo });
        }
        if (!revivedMember?.id) {
          continue;
        }
        member = revivedMember;
      } else {
        const { data: insertedMember, error: memberError } = await supabaseAdmin
          .from("roundtable_members")
          .insert({
            session_id: params.sessionId,
            seat_no: seatNo,
            profile_id: actor.profileId,
            guest_id: actor.guestId,
            display_name: actor.displayName,
            state: "joined",
          })
          .select("id, seat_no")
          .single();

        if (memberError || !insertedMember?.id) {
          if (isUniqueViolation(memberError)) {
            if (isActorConflict(memberError)) {
              let actorConflictQuery = supabaseAdmin
                .from("roundtable_members")
                .select("id, seat_no")
                .eq("session_id", params.sessionId)
                .eq("state", "joined");

              if (actor.profileId) {
                actorConflictQuery = actorConflictQuery.eq("profile_id", actor.profileId);
              } else if (actor.guestId) {
                actorConflictQuery = actorConflictQuery.eq("guest_id", actor.guestId);
              }

              const { data: actorConflictRows } = await actorConflictQuery.order("joined_at", { ascending: false }).limit(1);
              const conflictMember = (actorConflictRows?.[0] as { id: string; seat_no: number } | undefined) ?? null;
              if (conflictMember?.id) {
                return respondSuccess(200, conflictMember, "already_joined", {
                  attempt,
                  resolved_from: "identity_conflict",
                });
              }
              return respondError(409, "identity_conflict", "You already have an active seat in this room.", {
                attempt,
                seat_no: seatNo,
              });
            }
            continue;
          }
          return respondError(500, "join_failed", memberError?.message ?? "Unable to join.", { attempt, seat_no: seatNo });
        }
        member = insertedMember;
      }

      await supabaseAdmin
        .from("roundtable_scores")
        .upsert(
          {
            session_id: params.sessionId,
            member_id: member.id,
            points: 0,
            approved_turns: 0,
            upvotes_received: 0,
            useful_marks: 0,
            violations: 0,
          },
          { onConflict: "session_id,member_id" }
        );

      await supabaseAdmin
        .from("roundtable_sessions")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", params.sessionId);

      await reconcileSession(params.sessionId);

      await logRoundtableEvent(
        "roundtable_session_joined",
        {
          session_id: params.sessionId,
          member_id: member.id,
          seat_no: member.seat_no,
        },
        actor.profileId
      );

      return respondSuccess(201, member, "joined", { attempt });
    }

    return respondError(
      409,
      "seat_taken_retry_exhausted",
      "Seat was taken while joining. Please try again.",
      { attempts: MAX_JOIN_RETRY_ATTEMPTS }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to join session.";
    return respondError(500, "join_failed", message);
  }
}
