import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, requireRole } from "@/lib/supabase/auth";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const authContext = await getAuthContext(_request);
  if (!requireRole(authContext, ["admin"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;
  const now = new Date().toISOString();

  const { data: pitch, error } = await supabaseAdmin
    .from("pitches")
    .update({
      status: "approved",
      approved_at: now,
      approved_by: authContext.userId,
    })
    .eq("id", id)
    .select("id, startup_id, status")
    .single();

  if (error || !pitch) {
    return NextResponse.json({ error: error?.message ?? "Pitch not found" }, { status: 404 });
  }

  await supabaseAdmin
    .from("startups")
    .update({ status: "approved" })
    .eq("id", pitch.startup_id);

  return NextResponse.json({ pitch });
}
