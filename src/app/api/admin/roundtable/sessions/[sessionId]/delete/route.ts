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
    .select("id, status")
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

  const { error: deleteError } = await supabaseAdmin
    .from("roundtable_sessions")
    .delete()
    .eq("id", sessionId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
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
