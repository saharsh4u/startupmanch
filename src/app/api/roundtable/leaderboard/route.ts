import { NextResponse } from "next/server";
import { applyNoStoreCache } from "@/lib/http/cache";
import { getWeeklyLeaderboard } from "@/lib/roundtable/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const leaderboard = await getWeeklyLeaderboard();
    const response = NextResponse.json({ window: "weekly", leaderboard }, { status: 200 });
    applyNoStoreCache(response);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load leaderboard.";
    const response = NextResponse.json({ error: message }, { status: 500 });
    applyNoStoreCache(response);
    return response;
  }
}
