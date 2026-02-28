import { NextResponse } from "next/server";
import { nowIso, logRoundtableEvent } from "@/lib/roundtable/server";
import { resolveActor, withGuestCookie } from "@/lib/roundtable/api";
import { reconcileSession } from "@/lib/roundtable/reconcile";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getOperatorAuthContext, requireRole } from "@/lib/supabase/auth";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string; memberId: string } }
) {
  const actor = await resolveActor(request);
  const operator = await getOperatorAuthContext(request);

  try {
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("roundtable_sessions")
      .select("id, created_by_profile_id, created_by_guest_id")
      .eq("id", params.sessionId)
      .maybeSingle();

    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const isCreator =
      (actor.profileId && session.created_by_profile_id === actor.profileId) ||
      (actor.guestId && session.created_by_guest_id === actor.guestId);
    const isAdmin = Boolean(operator && requireRole(operator, ["admin"]));
    if (!isCreator && !isAdmin) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: memberRow, error: memberError } = await supabaseAdmin
      .from("roundtable_members")
      .select("id, state")
      .eq("id", params.memberId)
      .eq("session_id", params.sessionId)
      .maybeSingle();

    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 500 });
    }
    if (!memberRow) {
      return NextResponse.json({ error: "Member not found in this session." }, { status: 404 });
    }
    if (memberRow.state !== "joined") {
      const response = NextResponse.json({ ok: true, member_id: params.memberId }, { status: 200 });
      return withGuestCookie(response, actor.guestId);
    }

    const now = nowIso();

    const { error: updateMemberError } = await supabaseAdmin
      .from("roundtable_members")
      .update({ state: "kicked", left_at: now })
      .eq("id", params.memberId)
      .eq("session_id", params.sessionId)
      .eq("state", "joined");

    if (updateMemberError) {
      return NextResponse.json({ error: updateMemberError.message }, { status: 500 });
    }

    const { error: clearTurnsError } = await supabaseAdmin
      .from("roundtable_turns")
      .update({
        status: "skipped",
        submitted_at: now,
        auto_submitted: true,
        updated_at: now,
      })
      .eq("session_id", params.sessionId)
      .eq("member_id", params.memberId)
      .in("status", ["queued", "active"]);

    if (clearTurnsError) {
      return NextResponse.json({ error: clearTurnsError.message }, { status: 500 });
    }

    await supabaseAdmin
      .from("roundtable_sessions")
      .update({ updated_at: now })
      .eq("id", params.sessionId);

    await reconcileSession(params.sessionId);

    await logRoundtableEvent(
      "roundtable_member_removed",
      {
        session_id: params.sessionId,
        removed_member_id: params.memberId,
      },
      actor.profileId
    );

    const response = NextResponse.json({ ok: true, member_id: params.memberId }, { status: 200 });
    return withGuestCookie(response, actor.guestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove member.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
