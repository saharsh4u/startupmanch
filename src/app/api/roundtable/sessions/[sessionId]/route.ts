import { NextResponse } from "next/server";
import { resolveActor } from "@/lib/roundtable/api";
import { getSessionSnapshot } from "@/lib/roundtable/queries";
import { reconcileSession } from "@/lib/roundtable/reconcile";
import { getMemberForActor } from "@/lib/roundtable/server";

export const runtime = "nodejs";

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
    let viewerMemberId: string | null = null;
    try {
      const actor = await resolveActor(request);
      const viewerMember = await getMemberForActor(params.sessionId, actor);
      viewerMemberId = viewerMember?.id ?? null;
    } catch (viewerError) {
      console.error("roundtable viewer identity resolution failed", viewerError);
    }

    return NextResponse.json(
      {
        ...snapshot,
        viewer_member_id: viewerMemberId,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
