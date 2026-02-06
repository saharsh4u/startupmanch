import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, requireRole } from "@/lib/supabase/auth";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const authContext = await getAuthContext(_request);
  if (!authContext || !requireRole(authContext, ["admin"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;

  const { data: requestRow, error } = await supabaseAdmin
    .from("investor_requests")
    .update({
      status: "approved",
      reviewed_by: authContext.userId,
    })
    .eq("id", id)
    .select("id, user_id, status")
    .single();

  if (error || !requestRow) {
    return NextResponse.json({ error: error?.message ?? "Request not found" }, { status: 404 });
  }

  await supabaseAdmin
    .from("profiles")
    .update({ role: "investor" })
    .eq("id", requestRow.user_id);

  return NextResponse.json({ request: requestRow });
}
