import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/supabase/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authContext = await getAuthContext(request);
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("investor_requests")
    .insert({
      user_id: authContext.userId,
      status: "pending",
    })
    .select("id, status, created_at")
    .single();

  if (error) {
    const status = error.message.includes("duplicate") ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ request: data });
}
