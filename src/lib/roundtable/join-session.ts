import { supabaseAdmin } from "@/lib/supabase/server";
import { reconcileSession } from "@/lib/roundtable/reconcile";
import {
  deleteRoundtableMembers,
  deleteSessionIfEmpty,
  isReconnectGraceActive,
  logRoundtableEvent,
  nowIso,
} from "@/lib/roundtable/server";
import type { RoundtableActor } from "@/lib/roundtable/types";

type JoinErrorCode =
  | "session_not_found"
  | "session_closed"
  | "room_full"
  | "identity_conflict"
  | "seat_taken_retry_exhausted"
  | "join_failed";

type JoinSuccessCode = "joined" | "already_joined";

type JoinSuccessResult = {
  ok: true;
  status: 200 | 201;
  code: JoinSuccessCode;
  member: {
    id: string;
    seat_no: number;
  };
  attempt: number;
  metadata?: Record<string, unknown>;
};

type JoinErrorResult = {
  ok: false;
  status: 404 | 409 | 500;
  code: JoinErrorCode;
  error: string;
  metadata?: Record<string, unknown>;
};

export type JoinSessionResult = JoinSuccessResult | JoinErrorResult;

const MAX_JOIN_RETRY_ATTEMPTS = 6;

const isValidSeatNo = (value: number | null | undefined, maxSeats: number) =>
  Number.isInteger(value) && Number(value) >= 1 && Number(value) <= maxSeats;

const resolveSeat = (occupied: Set<number>, maxSeats: number) => {
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

export const joinRoundtableSession = async (params: {
  sessionId: string;
  actor: RoundtableActor;
  requestedSeatNo?: number | null;
  reconnectMemberId?: string | null;
}): Promise<JoinSessionResult> => {
  try {
    if (params.actor.profileId || params.actor.guestId) {
      let priorMembershipQuery = supabaseAdmin
        .from("roundtable_members")
        .select("id, session_id, state, left_at")
        .in("state", ["joined", "left"]);

      if (params.actor.profileId) {
        priorMembershipQuery = priorMembershipQuery.eq("profile_id", params.actor.profileId);
      } else if (params.actor.guestId) {
        priorMembershipQuery = priorMembershipQuery.eq("guest_id", params.actor.guestId);
      }

      const { data: priorMemberships, error: priorMembershipError } = await priorMembershipQuery;
      if (priorMembershipError) {
        return {
          ok: false,
          status: 500,
          code: "join_failed",
          error: priorMembershipError.message,
        };
      }

      const staleRows = (priorMemberships ?? [])
        .filter((row) => {
          const state = String(row.state ?? "");
          return state === "joined" || (state === "left" && isReconnectGraceActive(String(row.left_at ?? "")));
        })
        .map((row) => ({ id: String(row.id), sessionId: String(row.session_id) }))
        .filter((row) => row.sessionId && row.sessionId !== params.sessionId);

      if (staleRows.length) {
        await deleteRoundtableMembers(staleRows.map((row) => row.id));
        const staleSessionIds = Array.from(new Set(staleRows.map((row) => row.sessionId)));
        for (const staleSessionId of staleSessionIds) {
          await deleteSessionIfEmpty(staleSessionId);
        }
      }
    }

    await reconcileSession(params.sessionId);

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("roundtable_sessions")
      .select("id, status, max_seats")
      .eq("id", params.sessionId)
      .maybeSingle();

    if (sessionError) {
      return {
        ok: false,
        status: 500,
        code: "join_failed",
        error: sessionError.message,
      };
    }

    if (!session) {
      return {
        ok: false,
        status: 404,
        code: "session_not_found",
        error: "Session not found.",
      };
    }

    if (session.status === "ended" || session.status === "cancelled") {
      return {
        ok: false,
        status: 409,
        code: "session_closed",
        error: "Session is closed.",
      };
    }

    const maxSeats = Number(session.max_seats) || 5;

    for (let attempt = 1; attempt <= MAX_JOIN_RETRY_ATTEMPTS; attempt += 1) {
      if (params.reconnectMemberId) {
        const { data: reconnectRow, error: reconnectError } = await supabaseAdmin
          .from("roundtable_members")
          .select("id, seat_no, display_name, state, left_at")
          .eq("id", params.reconnectMemberId)
          .eq("session_id", params.sessionId)
          .in("state", ["joined", "left"])
          .maybeSingle();

        if (reconnectError) {
          return {
            ok: false,
            status: 500,
            code: "join_failed",
            error: reconnectError.message,
            metadata: { attempt, resolved_from: "reconnect_lookup" },
          };
        }

        const reconnectState = String(reconnectRow?.state ?? "");
        const reconnectAllowed =
          Boolean(reconnectRow?.id) &&
          (reconnectState === "joined" ||
            (reconnectState === "left" && isReconnectGraceActive(String(reconnectRow?.left_at ?? ""))));

        if (reconnectAllowed && reconnectRow?.id) {
          const displayName = reconnectRow.display_name?.trim() || params.actor.displayName?.trim() || "Guest";
          const updates = {
            seat_no: reconnectRow.seat_no,
            profile_id: params.actor.profileId,
            guest_id: params.actor.guestId,
            display_name: displayName,
            state: "joined" as const,
            last_seen_at: nowIso(),
            left_at: null,
          };

          const { data: reclaimedRow, error: reclaimError } = await supabaseAdmin
            .from("roundtable_members")
            .update(updates)
            .eq("id", reconnectRow.id)
            .select("id, seat_no")
            .single();

          if (reclaimError || !reclaimedRow?.id) {
            return {
              ok: false,
              status: 500,
              code: "join_failed",
              error: reclaimError?.message ?? "Unable to reclaim previous seat.",
              metadata: { attempt, resolved_from: "reconnect_update" },
            };
          }

          await supabaseAdmin
            .from("roundtable_sessions")
            .update({ updated_at: nowIso() })
            .eq("id", params.sessionId);

          await reconcileSession(params.sessionId);

          await logRoundtableEvent(
            "roundtable_session_reconnected",
            {
              session_id: params.sessionId,
              member_id: reclaimedRow.id,
              seat_no: reclaimedRow.seat_no,
            },
            params.actor.profileId
          );

          return {
            ok: true,
            status: 200,
            code: "already_joined",
            member: { id: reclaimedRow.id, seat_no: reclaimedRow.seat_no },
            attempt,
            metadata: {
              resolved_from: "reconnect_cookie",
            },
          };
        }
      }

      let existingQuery = supabaseAdmin
        .from("roundtable_members")
        .select("id, seat_no, display_name, joined_at")
        .eq("session_id", params.sessionId)
        .eq("state", "joined");

      if (params.actor.profileId) {
        existingQuery = existingQuery.eq("profile_id", params.actor.profileId);
      } else if (params.actor.guestId) {
        existingQuery = existingQuery.eq("guest_id", params.actor.guestId);
      }

      const { data: existingRows, error: existingError } = await existingQuery.order("joined_at", { ascending: false });
      if (existingError) {
        return {
          ok: false,
          status: 500,
          code: "join_failed",
          error: existingError.message,
          metadata: { attempt },
        };
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
        await deleteRoundtableMembers(duplicateIds);
      }

      if (existing?.id) {
        const incomingName = params.actor.displayName?.trim() ?? "";
        const existingName = existing.display_name?.trim() ?? "";
        if (incomingName.length && incomingName !== existingName) {
          const { error: renameError } = await supabaseAdmin
            .from("roundtable_members")
            .update({ display_name: incomingName })
            .eq("id", existing.id)
            .eq("state", "joined");
          if (renameError) {
            return {
              ok: false,
              status: 500,
              code: "join_failed",
              error: renameError.message,
              metadata: { attempt },
            };
          }
        }

        return {
          ok: true,
          status: 200,
          code: "already_joined",
          member: { id: existing.id, seat_no: existing.seat_no },
          attempt,
        };
      }

      const { data: occupiedRows, error: occupiedError } = await supabaseAdmin
        .from("roundtable_members")
        .select("seat_no, state, left_at")
        .eq("session_id", params.sessionId)
        .in("state", ["joined", "left"]);

      if (occupiedError) {
        return {
          ok: false,
          status: 500,
          code: "join_failed",
          error: occupiedError.message,
          metadata: { attempt },
        };
      }

      const occupied = new Set(
        (occupiedRows ?? [])
          .filter((row) => {
            const state = String(row.state ?? "");
            return state === "joined" || (state === "left" && isReconnectGraceActive(String(row.left_at ?? "")));
          })
          .map((row) => Number(row.seat_no))
          .filter((seatNo) => Number.isInteger(seatNo) && seatNo >= 1 && seatNo <= maxSeats)
      );

      if (occupied.size >= maxSeats) {
        return {
          ok: false,
          status: 409,
          code: "room_full",
          error: `Room is full. Only ${maxSeats} people can join.`,
          metadata: { attempt },
        };
      }

      const hasRequestedSeat = isValidSeatNo(params.requestedSeatNo, maxSeats);
      if (hasRequestedSeat && occupied.has(Number(params.requestedSeatNo))) {
        return {
          ok: false,
          status: 409,
          code: "seat_taken_retry_exhausted",
          error: "Someone else took that seat while you were joining. Please try again.",
          metadata: {
            attempt,
            seat_no: params.requestedSeatNo,
          },
        };
      }

      const seatNo = hasRequestedSeat ? Number(params.requestedSeatNo) : resolveSeat(occupied, maxSeats);
      if (!seatNo) {
        return {
          ok: false,
          status: 409,
          code: "room_full",
          error: `Room is full. Only ${maxSeats} people can join.`,
          metadata: { attempt },
        };
      }

      const { data: seatRecord, error: seatRecordError } = await supabaseAdmin
        .from("roundtable_members")
        .select("id, state, left_at")
        .eq("session_id", params.sessionId)
        .eq("seat_no", seatNo)
        .maybeSingle();

      if (seatRecordError) {
        return {
          ok: false,
          status: 500,
          code: "join_failed",
          error: seatRecordError.message,
          metadata: { attempt, seat_no: seatNo },
        };
      }

      let member: { id: string; seat_no: number } | null = null;

      if (seatRecord?.id) {
        if (seatRecord.state === "joined") {
          continue;
        }

        if (seatRecord.state === "left" && isReconnectGraceActive(String(seatRecord.left_at ?? ""))) {
          continue;
        }

        await deleteRoundtableMembers([seatRecord.id]);
      }

      const { data: insertedMember, error: memberError } = await supabaseAdmin
        .from("roundtable_members")
        .insert({
          session_id: params.sessionId,
          seat_no: seatNo,
          profile_id: params.actor.profileId,
          guest_id: params.actor.guestId,
          display_name: params.actor.displayName,
          state: "joined",
          last_seen_at: nowIso(),
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

            if (params.actor.profileId) {
              actorConflictQuery = actorConflictQuery.eq("profile_id", params.actor.profileId);
            } else if (params.actor.guestId) {
              actorConflictQuery = actorConflictQuery.eq("guest_id", params.actor.guestId);
            }

            const { data: actorConflictRows } = await actorConflictQuery
              .order("joined_at", { ascending: false })
              .limit(1);
            const conflictMember = (actorConflictRows?.[0] as { id: string; seat_no: number } | undefined) ?? null;
            if (conflictMember?.id) {
              return {
                ok: true,
                status: 200,
                code: "already_joined",
                member: conflictMember,
                attempt,
                metadata: {
                  resolved_from: "identity_conflict",
                },
              };
            }

            return {
              ok: false,
              status: 409,
              code: "identity_conflict",
              error: "You already have an active seat in this room.",
              metadata: { attempt, seat_no: seatNo },
            };
          }
          continue;
        }

        return {
          ok: false,
          status: 500,
          code: "join_failed",
          error: memberError?.message ?? "Unable to join.",
          metadata: { attempt, seat_no: seatNo },
        };
      }

      member = insertedMember;

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
        params.actor.profileId
      );

      return {
        ok: true,
        status: 201,
        code: "joined",
        member,
        attempt,
      };
    }

    return {
      ok: false,
      status: 409,
      code: "seat_taken_retry_exhausted",
      error: "Seat was taken while joining. Please try again.",
      metadata: { attempts: MAX_JOIN_RETRY_ATTEMPTS },
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      code: "join_failed",
      error: error instanceof Error ? error.message : "Unable to join session.",
    };
  }
};
