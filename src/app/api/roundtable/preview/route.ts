import { NextResponse } from "next/server";
import { applyNoStoreCache, applyPublicEdgeCache } from "@/lib/http/cache";
import { getPublicRoundtablePreview } from "@/lib/roundtable/queries";
import { reconcileOpenSessions } from "@/lib/roundtable/reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await reconcileOpenSessions(40);
    const payload = await getPublicRoundtablePreview();
    const response = NextResponse.json(payload, { status: 200 });
    applyPublicEdgeCache(response, {
      sMaxAgeSeconds: 15,
      staleWhileRevalidateSeconds: 60,
    });
    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load roundtable preview.";
    const response = NextResponse.json({ error: message }, { status: 500 });
    applyNoStoreCache(response);
    return response;
  }
}
