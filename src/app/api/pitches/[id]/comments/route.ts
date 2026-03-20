import { NextResponse } from "next/server";

export const runtime = "nodejs";
const GONE_PAYLOAD = { error: "Comments are no longer available." };

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  void params;
  return NextResponse.json(GONE_PAYLOAD, { status: 410 });
}

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  void params;
  return NextResponse.json(GONE_PAYLOAD, { status: 410 });
}
