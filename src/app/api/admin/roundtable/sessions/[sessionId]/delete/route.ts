import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { logRoundtableEvent } from "@/lib/roundtable/server";
import { getOperatorAuthContext, requireRole } from "@/lib/supabase/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  const authContext = await getOperatorAuthContext(request);
  if (!authContext || !requireRole(authContext, ["admin"])) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const sessionId = params.sessionId?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "Session id is required." }, { status: 400 });
  }

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("roundtable_sessions")
    .select("id, topic_id, status")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const { count: joinedCount, error: membersCountError } = await supabaseAdmin
    .from("roundtable_members")
    .select("id", { head: true, count: "exact" })
    .eq("session_id", sessionId)
    .eq("state", "joined");

  if (membersCountError) {
    return NextResponse.json({ error: membersCountError.message }, { status: 500 });
  }

  const cleanupBySessionId = async (table: string) =>
    supabaseAdmin
      .from(table)
      .delete()
      .eq("session_id", sessionId);

  const cleanupSteps: Array<{ table: string; error: string }> = [
    { table: "roundtable_turn_votes", error: "Unable to clear turn votes." },
    { table: "roundtable_turn_reports", error: "Unable to clear turn reports." },
    { table: "roundtable_raise_hands", error: "Unable to clear raised hands." },
    { table: "roundtable_scores", error: "Unable to clear scores." },
    { table: "roundtable_turns", error: "Unable to clear turns." },
    { table: "roundtable_members", error: "Unable to clear members." },
    { table: "roundtable_action_audit", error: "Unable to clear audit records." },
  ];

  for (const step of cleanupSteps) {
    const { error } = await cleanupBySessionId(step.table);
    if (error) {
      if ((error as { code?: string }).code === "42P01") {
        continue;
      }
      return NextResponse.json({ error: `${step.error} ${error.message}` }, { status: 500 });
    }
  }

  const { error: deleteError } = await supabaseAdmin.from("roundtable_sessions").delete().eq("id", sessionId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (session.topic_id) {
    const { count: remainingForTopic, error: topicCountError } = await supabaseAdmin
      .from("roundtable_sessions")
      .select("id", { count: "exact", head: true })
      .eq("topic_id", session.topic_id);

    if (!topicCountError && Number(remainingForTopic ?? 0) === 0) {
      await supabaseAdmin.from("roundtable_topics").delete().eq("id", session.topic_id);
    }
  }

  await logRoundtableEvent(
    "roundtable_session_deleted_by_admin",
    {
      session_id: sessionId,
      previous_status: session.status,
      joined_members_removed: joinedCount ?? 0,
    },
    authContext.userId
  );

  revalidatePath("/roundtable");
  revalidatePath(`/roundtable/${sessionId}`);
  revalidatePath("/api/roundtable/lobby");
  revalidatePath(`/api/roundtable/sessions/${sessionId}`);

  return NextResponse.json({
    deleted: true,
    session_id: sessionId,
    joined_members_removed: joinedCount ?? 0,
  });
}
