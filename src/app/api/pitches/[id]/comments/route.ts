import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, requireRole } from "@/lib/supabase/auth";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  const { data, error } = await supabaseAdmin
    .from("pitch_comments")
    .select("id, body, parent_id, created_at, user_id")
    .eq("pitch_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ comments: data ?? [] });
}

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
  const body = payload?.body;
  const parent_id = payload?.parent_id ?? null;

  if (!body || typeof body !== "string") {
    return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("pitch_comments")
    .insert({
      pitch_id: id,
      user_id: authContext.userId,
      body,
      parent_id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ comment: data });
}
