import { NextResponse } from "next/server";
import { getWeeklyLeaderboard } from "@/lib/roundtable/queries";

export const runtime = "nodejs";

export async function GET() {
  try {
    const leaderboard = await getWeeklyLeaderboard();
    return NextResponse.json({ window: "weekly", leaderboard }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load leaderboard.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
