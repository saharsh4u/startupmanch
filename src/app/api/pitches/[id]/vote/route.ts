import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, requireRole } from "@/lib/supabase/auth";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const authContext = await getAuthContext(request);
  if (!authContext || !requireRole(authContext, ["founder", "investor", "admin"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;
  const payload = await request.json();
  const vote = payload?.vote;
  const reason = payload?.reason ?? null;

  if (vote !== "in" && vote !== "out") {
    return NextResponse.json({ error: "Invalid vote" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("pitch_votes")
    .upsert(
      {
        pitch_id: id,
        voter_id: authContext.userId,
        vote,
        reason,
      },
      { onConflict: "pitch_id,voter_id" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ vote: data });
}
