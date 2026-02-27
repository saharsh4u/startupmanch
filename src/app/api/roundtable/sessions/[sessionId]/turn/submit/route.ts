import { NextResponse } from "next/server";
import { ROUND_TABLE_LIMITS, ROUND_TABLE_TEXT_LIMITS } from "@/lib/roundtable/constants";
import { applyScoreDelta, ROUND_TABLE_POINTS } from "@/lib/roundtable/scoring";
import { getMemberForActor, isLikelySpamText, logRoundtableEvent } from "@/lib/roundtable/server";
import { parseJsonSafely, requireRateLimit, resolveActor, withGuestCookie } from "@/lib/roundtable/api";
import { reconcileSession } from "@/lib/roundtable/reconcile";
import { supabaseAdmin } from "@/lib/supabase/server";

type SubmitPayload = {
  display_name?: string;
  turn_id?: string;
  body?: string;
};

const normalizeBody = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, ROUND_TABLE_TEXT_LIMITS.turnBodyMax);
};

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  const payload = await parseJsonSafely<SubmitPayload>(request);
  if (!payload) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const actor = await resolveActor(request, payload.display_name ?? null);

  try {
    const member = await getMemberForActor(params.sessionId, actor);
    if (!member?.id) {
      return NextResponse.json({ error: "Join the session first." }, { status: 403 });
    }

    const rateAllowed = await requireRateLimit({
      request,
      actionType: "roundtable_turn_submit",
      maxCount: ROUND_TABLE_LIMITS.turnSubmit.maxCount,
      windowMs: ROUND_TABLE_LIMITS.turnSubmit.windowMs,
      guestId: actor.guestId,
      sessionId: params.sessionId,
    });

    if (!rateAllowed) {
      return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
    }

    const turnId = (payload.turn_id ?? "").trim();
    const body = normalizeBody(payload.body);

    if (!turnId || body.length < 2) {
      return NextResponse.json({ error: "Turn id and valid body are required." }, { status: 400 });
    }

    if (isLikelySpamText(body)) {
      return NextResponse.json({ error: "Message blocked by moderation policy." }, { status: 400 });
    }

    await reconcileSession(params.sessionId);

    const { data: turn, error: turnError } = await supabaseAdmin
      .from("roundtable_turns")
      .select("id, status, member_id")
      .eq("id", turnId)
      .eq("session_id", params.sessionId)
      .maybeSingle();

    if (turnError) {
      return NextResponse.json({ error: turnError.message }, { status: 500 });
    }

    if (!turn?.id) {
      return NextResponse.json({ error: "Turn not found." }, { status: 404 });
    }

    if (turn.member_id !== member.id) {
      return NextResponse.json({ error: "Only active speaker can submit this turn." }, { status: 403 });
    }

    if (turn.status !== "active") {
      return NextResponse.json({ error: "Turn is no longer active." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("roundtable_turns")
      .update({
        status: "submitted",
        body,
        submitted_at: now,
        auto_submitted: false,
        updated_at: now,
      })
      .eq("id", turn.id)
      .eq("status", "active");

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await applyScoreDelta(params.sessionId, member.id, {
      points: ROUND_TABLE_POINTS.approvedTurn,
      approvedTurns: 1,
    });

    await supabaseAdmin
      .from("roundtable_sessions")
      .update({ updated_at: now })
      .eq("id", params.sessionId);

    await reconcileSession(params.sessionId);

    await logRoundtableEvent("roundtable_turn_submitted", {
      session_id: params.sessionId,
      member_id: member.id,
      turn_id: turn.id,
      auto_submitted: false,
    }, actor.profileId);

    const response = NextResponse.json({ ok: true, turn_id: turn.id }, { status: 200 });
    return withGuestCookie(response, actor.guestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit turn.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
