import { NextResponse } from "next/server";
import { parseJsonSafely } from "@/lib/roundtable/api";
import { reconcileOpenSessions, reconcileSession } from "@/lib/roundtable/reconcile";

export const runtime = "nodejs";

type ReconcilePayload = {
  session_id?: string;
};

const isAuthorized = (request: Request) => {
  const expected = process.env.ROUNDTABLE_CRON_SECRET?.trim();
  if (!expected) return true;
  const token = request.headers.get("x-roundtable-cron-secret")?.trim();
  return token === expected;
};

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await parseJsonSafely<ReconcilePayload>(request)) ?? {};

  try {
    if (payload.session_id) {
      await reconcileSession(payload.session_id);
      return NextResponse.json({ ok: true, reconciled: [payload.session_id] }, { status: 200 });
    }

    await reconcileOpenSessions(60);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reconcile sessions.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
