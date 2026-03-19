import { NextResponse } from "next/server";
import { deleteRoundtableMembers, deleteSessionIfEmpty, getMemberForActor, logRoundtableEvent } from "@/lib/roundtable/server";
import { parseJsonSafely, resolveActor, withGuestCookie } from "@/lib/roundtable/api";
import { reconcileSession } from "@/lib/roundtable/reconcile";
import { supabaseAdmin } from "@/lib/supabase/server";

type LeavePayload = {
  display_name?: string;
};

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  const payload = (await parseJsonSafely<LeavePayload>(request)) ?? {};
  const actor = await resolveActor(request, payload.display_name ?? null);

  try {
    const member = await getMemberForActor(params.sessionId, actor);
    if (!member?.id) {
      return NextResponse.json({ error: "Not joined in this session." }, { status: 404 });
    }

    await deleteRoundtableMembers([member.id]);

    await supabaseAdmin
      .from("roundtable_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", params.sessionId);

    const deletedSession = await deleteSessionIfEmpty(params.sessionId);
    if (!deletedSession) {
      await reconcileSession(params.sessionId);
    }

    await logRoundtableEvent("roundtable_session_left", {
      session_id: params.sessionId,
      member_id: member.id,
    }, actor.profileId);

    const response = NextResponse.json({ ok: true }, { status: 200 });
    return withGuestCookie(response, actor.guestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to leave session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
