import { NextResponse } from "next/server";
import { getLobbyData } from "@/lib/roundtable/queries";
import { applyNoStoreCache } from "@/lib/http/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const payload = await getLobbyData();
    const response = NextResponse.json(payload, { status: 200 });
    applyNoStoreCache(response);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load roundtable lobby.";
    const response = NextResponse.json({ error: message }, { status: 500 });
    applyNoStoreCache(response);
    return response;
  }
}
