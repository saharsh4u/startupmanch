import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      error: "Join Any has been replaced by explicit public room joining from the roundtable lobby.",
      code: "join_any_retired",
    },
    { status: 410 }
  );
}
