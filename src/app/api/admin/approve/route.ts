import { NextResponse } from "next/server";
import { getOperatorAuthContext, requireRole } from "@/lib/supabase/auth";
import { approvePitchWithTranscodeGate } from "@/lib/video/mux/approval";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authContext = await getOperatorAuthContext(request);
  if (!authContext || !requireRole(authContext, ["admin"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const { startup_id, pitch_id } = payload ?? {};

  if (!startup_id || !pitch_id) {
    return NextResponse.json({ error: "startup_id and pitch_id are required" }, { status: 400 });
  }

  const result = await approvePitchWithTranscodeGate({
    pitchId: String(pitch_id),
    startupId: String(startup_id),
    approvedBy: authContext.userId,
  });

  return NextResponse.json(result.body, { status: result.httpStatus });
}
