import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, requireRole } from "@/lib/supabase/auth";

export const runtime = "nodejs";

type Params = {
  params: {
    id: string;
  };
};

export async function POST(request: Request, { params }: Params) {
  const authContext = await getAuthContext(request);
  if (!authContext || !requireRole(authContext, ["admin"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startupId = params.id?.trim();
  if (!startupId) {
    return NextResponse.json({ error: "Startup id is required" }, { status: 400 });
  }

  const { data: startup, error: startupLookupError } = await supabaseAdmin
    .from("startups")
    .select("id")
    .eq("id", startupId)
    .single();

  if (startupLookupError || !startup) {
    return NextResponse.json({ error: "Startup not found" }, { status: 404 });
  }

  const { error: startupError } = await supabaseAdmin
    .from("startups")
    .update({ status: "rejected" })
    .eq("id", startupId);

  if (startupError) {
    return NextResponse.json({ error: startupError.message }, { status: 500 });
  }

  const { error: pitchError } = await supabaseAdmin
    .from("pitches")
    .update({ status: "rejected", approved_at: null })
    .eq("startup_id", startupId);

  if (pitchError) {
    return NextResponse.json({ error: pitchError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, startup_id: startupId });
}
