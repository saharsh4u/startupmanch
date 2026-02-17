import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getOperatorAuthContext, requireRole } from "@/lib/supabase/auth";

export const runtime = "nodejs";

type Params = {
  params: {
    id: string;
  };
};

export async function POST(request: Request, { params }: Params) {
  const authContext = await getOperatorAuthContext(request);
  if (!authContext || !requireRole(authContext, ["admin"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pitchId = params.id?.trim();
  if (!pitchId) {
    return NextResponse.json({ error: "Pitch id is required" }, { status: 400 });
  }

  const { data: pitch, error: pitchLookupError } = await supabaseAdmin
    .from("pitches")
    .select("id,startup_id,status")
    .eq("id", pitchId)
    .single();

  if (pitchLookupError || !pitch) {
    return NextResponse.json({ error: "Pitch not found" }, { status: 404 });
  }

  const { error: pitchError } = await supabaseAdmin
    .from("pitches")
    .update({ status: "rejected", approved_at: null })
    .eq("id", pitchId);

  if (pitchError) {
    return NextResponse.json({ error: pitchError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    pitch_id: pitchId,
    startup_id: pitch.startup_id ?? null,
  });
}
