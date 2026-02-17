import { NextResponse } from "next/server";
import { getOperatorAuthContext, requireRole } from "@/lib/supabase/auth";
import { retryPitchTranscode } from "@/lib/video/mux/approval";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const authContext = await getOperatorAuthContext(request);
  if (!authContext || !requireRole(authContext, ["admin"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await retryPitchTranscode({ pitchId: params.id });
  return NextResponse.json(result.body, { status: result.httpStatus });
}
