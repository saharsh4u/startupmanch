import { NextResponse } from "next/server";
import { getSessionSnapshot } from "@/lib/roundtable/queries";
import { reconcileSession } from "@/lib/roundtable/reconcile";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    await reconcileSession(params.sessionId);
    const snapshot = await getSessionSnapshot(params.sessionId);
    if (!snapshot) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    return NextResponse.json(snapshot, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
