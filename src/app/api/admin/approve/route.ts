import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, requireRole } from "@/lib/supabase/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authContext = await getAuthContext(request);
  if (!authContext || !requireRole(authContext, ["admin"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const { startup_id, pitch_id } = payload ?? {};

  if (!startup_id || !pitch_id) {
    return NextResponse.json({ error: "startup_id and pitch_id are required" }, { status: 400 });
  }

  const { error: startupError } = await supabaseAdmin
    .from("startups")
    .update({ status: "approved" })
    .eq("id", startup_id);

  if (startupError) {
    return NextResponse.json({ error: startupError.message }, { status: 500 });
  }

  const { error: pitchError } = await supabaseAdmin
    .from("pitches")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: authContext.userId,
    })
    .eq("id", pitch_id);

  if (pitchError) {
    return NextResponse.json({ error: pitchError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
