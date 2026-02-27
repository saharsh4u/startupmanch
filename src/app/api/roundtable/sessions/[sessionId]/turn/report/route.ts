import { NextResponse } from "next/server";
import { applyScoreDelta, ROUND_TABLE_POINTS } from "@/lib/roundtable/scoring";
import { getMemberForActor, logRoundtableEvent } from "@/lib/roundtable/server";
import { parseJsonSafely, resolveActor, withGuestCookie } from "@/lib/roundtable/api";
import { supabaseAdmin } from "@/lib/supabase/server";

type ReportPayload = {
  display_name?: string;
  turn_id?: string;
  reason?: string;
};

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  const payload = await parseJsonSafely<ReportPayload>(request);
  if (!payload) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const actor = await resolveActor(request, payload.display_name ?? null);

  try {
    const reporter = await getMemberForActor(params.sessionId, actor);
    if (!reporter?.id) {
      return NextResponse.json({ error: "Join the session first." }, { status: 403 });
    }

    const turnId = (payload.turn_id ?? "").trim();
    if (!turnId) {
      return NextResponse.json({ error: "turn_id is required." }, { status: 400 });
    }

    const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 220) : null;

    const { data: turn, error: turnError } = await supabaseAdmin
      .from("roundtable_turns")
      .select("id, member_id, hidden_for_abuse")
      .eq("id", turnId)
      .eq("session_id", params.sessionId)
      .maybeSingle();

    if (turnError) {
      return NextResponse.json({ error: turnError.message }, { status: 500 });
    }

    if (!turn?.id) {
      return NextResponse.json({ error: "Turn not found." }, { status: 404 });
    }

    if (turn.member_id === reporter.id) {
      return NextResponse.json({ error: "Cannot report your own turn." }, { status: 400 });
    }

    const { error: reportError } = await supabaseAdmin.from("roundtable_turn_reports").upsert(
      {
        turn_id: turn.id,
        session_id: params.sessionId,
        reporter_member_id: reporter.id,
        reason,
      },
      { onConflict: "turn_id,reporter_member_id" }
    );

    if (reportError) {
      return NextResponse.json({ error: reportError.message }, { status: 500 });
    }

    const { count, error: countError } = await supabaseAdmin
      .from("roundtable_turn_reports")
      .select("id", { count: "exact", head: true })
      .eq("turn_id", turn.id);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    const reportCount = count ?? 0;

    if (reportCount >= 3 && !turn.hidden_for_abuse) {
      const { error: hideError } = await supabaseAdmin
        .from("roundtable_turns")
        .update({ hidden_for_abuse: true, updated_at: new Date().toISOString() })
        .eq("id", turn.id)
        .eq("hidden_for_abuse", false);

      if (hideError) {
        return NextResponse.json({ error: hideError.message }, { status: 500 });
      }

      await applyScoreDelta(params.sessionId, turn.member_id as string, {
        points: ROUND_TABLE_POINTS.violation,
        violations: 1,
      });
    }

    await logRoundtableEvent("roundtable_turn_reported", {
      session_id: params.sessionId,
      turn_id: turn.id,
      report_count: reportCount,
    }, actor.profileId);

    const response = NextResponse.json({ ok: true, report_count: reportCount }, { status: 200 });
    return withGuestCookie(response, actor.guestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to report turn.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
