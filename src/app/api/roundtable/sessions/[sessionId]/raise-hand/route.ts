import { NextResponse } from "next/server";
import { ROUND_TABLE_LIMITS } from "@/lib/roundtable/constants";
import { getMemberForActor, logRoundtableEvent } from "@/lib/roundtable/server";
import { parseJsonSafely, requireRateLimit, resolveActor, withGuestCookie } from "@/lib/roundtable/api";
import { reconcileSession } from "@/lib/roundtable/reconcile";
import { supabaseAdmin } from "@/lib/supabase/server";

type RaiseHandPayload = {
  display_name?: string;
};

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  const payload = (await parseJsonSafely<RaiseHandPayload>(request)) ?? {};
  const actor = await resolveActor(request, payload.display_name ?? null);

  try {
    const member = await getMemberForActor(params.sessionId, actor);
    if (!member?.id) {
      return NextResponse.json({ error: "Join the session first." }, { status: 403 });
    }

    const rateAllowed = await requireRateLimit({
      request,
      actionType: "roundtable_raise_hand",
      maxCount: ROUND_TABLE_LIMITS.raiseHand.maxCount,
      windowMs: ROUND_TABLE_LIMITS.raiseHand.windowMs,
      guestId: actor.guestId,
      sessionId: params.sessionId,
    });

    if (!rateAllowed) {
      return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
    }

    await reconcileSession(params.sessionId);

    const { data: joinedMembers, error: joinedError } = await supabaseAdmin
      .from("roundtable_members")
      .select("id")
      .eq("session_id", params.sessionId)
      .eq("state", "joined");

    if (joinedError) {
      return NextResponse.json({ error: joinedError.message }, { status: 500 });
    }

    if ((joinedMembers ?? []).length < 2) {
      return NextResponse.json({ error: "At least two participants are required to raise hands." }, { status: 400 });
    }

    const { data: existingTurn, error: existingTurnError } = await supabaseAdmin
      .from("roundtable_turns")
      .select("id")
      .eq("session_id", params.sessionId)
      .eq("member_id", member.id)
      .in("status", ["queued", "active"])
      .limit(1)
      .maybeSingle();

    if (existingTurnError) {
      return NextResponse.json({ error: existingTurnError.message }, { status: 500 });
    }

    if (existingTurn?.id) {
      const response = NextResponse.json({ ok: true, turn_id: existingTurn.id }, { status: 200 });
      return withGuestCookie(response, actor.guestId);
    }

    const { error: handError } = await supabaseAdmin.from("roundtable_raise_hands").insert({
      session_id: params.sessionId,
      member_id: member.id,
      status: "queued",
    });

    if (handError) {
      return NextResponse.json({ error: handError.message }, { status: 500 });
    }

    const { data: turn, error: turnError } = await supabaseAdmin
      .from("roundtable_turns")
      .insert({
        session_id: params.sessionId,
        member_id: member.id,
        status: "queued",
      })
      .select("id")
      .single();

    if (turnError || !turn?.id) {
      return NextResponse.json({ error: turnError?.message ?? "Unable to queue speaking turn." }, { status: 500 });
    }

    await supabaseAdmin
      .from("roundtable_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", params.sessionId);

    await reconcileSession(params.sessionId);

    await logRoundtableEvent("roundtable_hand_raised", {
      session_id: params.sessionId,
      member_id: member.id,
      turn_id: turn.id,
    }, actor.profileId);

    const response = NextResponse.json({ ok: true, turn_id: turn.id }, { status: 201 });
    return withGuestCookie(response, actor.guestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to raise hand.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
