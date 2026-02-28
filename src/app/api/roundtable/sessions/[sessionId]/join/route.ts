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

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  const payload = await parseJsonSafely<JoinPayload>(request);
  if (!payload) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const captchaToken = (payload.captcha_token ?? "").trim();
  if (captchaToken.length) {
    const captchaValid = await requireCaptcha(request, captchaToken);
    if (!captchaValid) {
      return NextResponse.json({ error: "Captcha validation failed." }, { status: 400 });
    }
  }

  const actor = await resolveActor(request, payload.display_name ?? null);

  const rateAllowed = await requireRateLimit({
    request,
    actionType: "roundtable_session_join",
    maxCount: ROUND_TABLE_LIMITS.joinSession.maxCount,
    windowMs: ROUND_TABLE_LIMITS.joinSession.windowMs,
    guestId: actor.guestId,
    sessionId: params.sessionId,
  });

  if (!rateAllowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  try {
    await reconcileSession(params.sessionId);

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("roundtable_sessions")
      .select("id, status, max_seats")
      .eq("id", params.sessionId)
      .maybeSingle();

    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }

    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    if (session.status === "ended" || session.status === "cancelled") {
      return NextResponse.json({ error: "Session is closed." }, { status: 400 });
    }

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

    const { data: existingRows, error: existingError } = await existingQuery
      .order("joined_at", { ascending: false });

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
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
        return NextResponse.json({ error: cleanupError.message }, { status: 500 });
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
          return NextResponse.json({ error: renameError.message }, { status: 500 });
        }
      }

      const response = NextResponse.json({ ok: true, member_id: existing.id, seat_no: existing.seat_no }, { status: 200 });
      return withGuestCookie(response, actor.guestId);
    }

    const { data: occupiedRows, error: occupiedError } = await supabaseAdmin
      .from("roundtable_members")
      .select("seat_no")
      .eq("session_id", params.sessionId)
      .eq("state", "joined");

    if (occupiedError) {
      return NextResponse.json({ error: occupiedError.message }, { status: 500 });
    }

    const occupied = new Set((occupiedRows ?? []).map((row) => Number(row.seat_no)));
    const seatNo = resolveSeat(payload.seat_no, occupied, Number(session.max_seats) || 5);

    if (!seatNo) {
      return NextResponse.json(
        { error: `Room is full. Only ${session.max_seats} people can join.` },
        { status: 409 }
      );
    }

    let member: { id: string; seat_no: number } | null = null;

    const { data: seatRecord, error: seatRecordError } = await supabaseAdmin
      .from("roundtable_members")
      .select("id, state")
      .eq("session_id", params.sessionId)
      .eq("seat_no", seatNo)
      .maybeSingle();

    if (seatRecordError) {
      return NextResponse.json({ error: seatRecordError.message }, { status: 500 });
    }

    if (seatRecord?.id) {
      if (seatRecord.state === "joined") {
        return NextResponse.json({ error: "Seat already taken." }, { status: 409 });
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
        .select("id, seat_no")
        .single();

      if (reviveError || !revivedMember?.id) {
        return NextResponse.json({ error: reviveError?.message ?? "Unable to join." }, { status: 500 });
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
        if (memberError?.message?.toLowerCase().includes("duplicate key")) {
          return NextResponse.json({ error: "Seat already taken." }, { status: 409 });
        }
        return NextResponse.json({ error: memberError?.message ?? "Unable to join." }, { status: 500 });
      }
      member = insertedMember;
    }

    if (!member?.id) {
      return NextResponse.json({ error: "Unable to join." }, { status: 500 });
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

    const response = NextResponse.json({ ok: true, member_id: member.id, seat_no: member.seat_no }, { status: 201 });
    return withGuestCookie(response, actor.guestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to join session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
