import { NextResponse } from "next/server";
import { getLobbyData } from "@/lib/roundtable/queries";

export const runtime = "nodejs";

export async function GET() {
  try {
    const payload = await getLobbyData();
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load roundtable lobby.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
