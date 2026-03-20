import { NextResponse } from "next/server";
import { applyNoStoreCache } from "@/lib/http/cache";
import { resolveActor } from "@/lib/roundtable/api";
import { verifyRoundtableInviteToken } from "@/lib/roundtable/invite-token";
import { getSessionSnapshot } from "@/lib/roundtable/queries";
import { reconcileSession } from "@/lib/roundtable/reconcile";
import { getMemberForActor, getReconnectReservationForRequest } from "@/lib/roundtable/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getOperatorAuthContext, requireRole } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    await reconcileSession(params.sessionId);
    const snapshot = await getSessionSnapshot(params.sessionId);
    if (!snapshot) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const invite = verifyRoundtableInviteToken(new URL(request.url).searchParams.get("invite"));
    let viewerMemberId: string | null = null;
    let viewerReconnectSeatNo: number | null = null;
    let viewerCanManageMembers = false;
    try {
      const actor = await resolveActor(request);
      const viewerMember = await getMemberForActor(params.sessionId, actor);
      viewerMemberId = viewerMember?.id ?? null;
      if (!viewerMemberId) {
        const reconnectReservation = await getReconnectReservationForRequest(request, params.sessionId);
        viewerReconnectSeatNo = reconnectReservation?.seat_no ?? null;
      }

      const hasValidInvite = Boolean(invite && invite.session_id === params.sessionId);
      if (snapshot.session.visibility === "private" && !viewerMemberId && !viewerReconnectSeatNo && !hasValidInvite) {
        const response = NextResponse.json(
          { error: "Private room access requires a valid invite." },
          { status: 403 }
        );
        applyNoStoreCache(response);
        return response;
      }

      const { data: sessionOwner, error: sessionOwnerError } = await supabaseAdmin
        .from("roundtable_sessions")
        .select("created_by_profile_id, created_by_guest_id")
        .eq("id", params.sessionId)
        .maybeSingle();
      if (sessionOwnerError) {
        throw new Error(sessionOwnerError.message);
      }

      viewerCanManageMembers = Boolean(
        sessionOwner &&
          ((actor.profileId && sessionOwner.created_by_profile_id === actor.profileId) ||
            (actor.guestId && sessionOwner.created_by_guest_id === actor.guestId))
      );

      const operator = await getOperatorAuthContext(request);
      if (operator && requireRole(operator, ["admin"])) {
        viewerCanManageMembers = true;
      }
    } catch (viewerError) {
      console.error("roundtable viewer identity resolution failed", viewerError);
    }

    const response = NextResponse.json(
      {
        ...snapshot,
        viewer_member_id: viewerMemberId,
        viewer_reconnect_seat_no: viewerReconnectSeatNo,
        viewer_can_manage_members: viewerCanManageMembers,
      },
      { status: 200 }
    );
    applyNoStoreCache(response);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load session.";
    const response = NextResponse.json({ error: message }, { status: 500 });
    applyNoStoreCache(response);
    return response;
  }
}
