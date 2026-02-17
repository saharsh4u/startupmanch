import { NextResponse } from "next/server";
import { getOperatorAuthContext, requireRole } from "@/lib/supabase/auth";
import { approvePitchWithTranscodeGate } from "@/lib/video/mux/approval";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const authContext = await getOperatorAuthContext(_request);
  if (!authContext || !requireRole(authContext, ["admin"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;
  const result = await approvePitchWithTranscodeGate({
    pitchId: id,
    approvedBy: authContext.userId,
  });

  return NextResponse.json(result.body, { status: result.httpStatus });
}
