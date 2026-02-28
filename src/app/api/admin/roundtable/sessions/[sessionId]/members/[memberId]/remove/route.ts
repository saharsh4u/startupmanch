import { NextResponse } from "next/server";
import { nowIso, logRoundtableEvent } from "@/lib/roundtable/server";
import { reconcileSession } from "@/lib/roundtable/reconcile";
import { getOperatorAuthContext, requireRole } from "@/lib/supabase/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string; memberId: string } }
) {
  const authContext = await getOperatorAuthContext(request);
  if (!authContext || !requireRole(authContext, ["admin"])) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const sessionId = params.sessionId?.trim();
  const memberId = params.memberId?.trim();

  if (!sessionId || !memberId) {
    return NextResponse.json({ error: "Session id and member id are required." }, { status: 400 });
  }

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("roundtable_sessions")
    .select("id")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }
  if (!session?.id) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const { data: member, error: memberError } = await supabaseAdmin
    .from("roundtable_members")
    .select("id, state")
    .eq("id", memberId)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }
  if (!member?.id) {
    return NextResponse.json({ error: "Member not found in this session." }, { status: 404 });
  }

  if (member.state !== "joined") {
    return NextResponse.json({ ok: true, member_id: memberId });
  }

  const now = nowIso();

  const { error: kickError } = await supabaseAdmin
    .from("roundtable_members")
    .update({ state: "kicked", left_at: now })
    .eq("id", memberId)
    .eq("session_id", sessionId)
    .eq("state", "joined");

  if (kickError) {
    return NextResponse.json({ error: kickError.message }, { status: 500 });
  }

  const { error: clearTurnsError } = await supabaseAdmin
    .from("roundtable_turns")
    .update({
      status: "skipped",
      submitted_at: now,
      auto_submitted: true,
      updated_at: now,
    })
    .eq("session_id", sessionId)
    .eq("member_id", memberId)
    .in("status", ["queued", "active"]);

  if (clearTurnsError) {
    return NextResponse.json({ error: clearTurnsError.message }, { status: 500 });
  }

  await supabaseAdmin
    .from("roundtable_raise_hands")
    .update({ status: "cancelled", resolved_at: now })
    .eq("session_id", sessionId)
    .eq("member_id", memberId)
    .eq("status", "queued");

  await supabaseAdmin
    .from("roundtable_sessions")
    .update({ updated_at: now })
    .eq("id", sessionId);

  await reconcileSession(sessionId);

  await logRoundtableEvent(
    "roundtable_member_removed_by_admin",
    {
      session_id: sessionId,
      removed_member_id: memberId,
    },
    authContext.userId
  );

  return NextResponse.json({ ok: true, member_id: memberId });
}
