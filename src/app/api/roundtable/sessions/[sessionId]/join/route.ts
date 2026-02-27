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

const resolveSeat = (requestedSeat: number | undefined, occupied: Set<number>) => {
  if (Number.isInteger(requestedSeat) && (requestedSeat as number) >= 1 && (requestedSeat as number) <= 5) {
    return occupied.has(requestedSeat as number) ? null : (requestedSeat as number);
  }

  for (let seat = 1; seat <= 5; seat += 1) {
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

  const captchaValid = await requireCaptcha(request, payload.captcha_token ?? null);
  if (!captchaValid) {
    return NextResponse.json({ error: "Captcha validation failed." }, { status: 400 });
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
      .select("id, status")
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
      .select("id, seat_no")
      .eq("session_id", params.sessionId)
      .eq("state", "joined");

    if (actor.profileId) {
      existingQuery = existingQuery.eq("profile_id", actor.profileId);
    } else if (actor.guestId) {
      existingQuery = existingQuery.eq("guest_id", actor.guestId);
    }

    const { data: existing, error: existingError } = await existingQuery.maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    if (existing?.id) {
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
    const seatNo = resolveSeat(payload.seat_no, occupied);

    if (!seatNo) {
      return NextResponse.json({ error: "No seats available." }, { status: 409 });
    }

    const { data: member, error: memberError } = await supabaseAdmin
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

    if (memberError || !member?.id) {
      if (memberError?.message?.toLowerCase().includes("duplicate key")) {
        return NextResponse.json({ error: "Seat already taken." }, { status: 409 });
      }
      return NextResponse.json({ error: memberError?.message ?? "Unable to join." }, { status: 500 });
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
