import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, requireRole } from "@/lib/supabase/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authContext = await getAuthContext(request);
  if (!authContext || !requireRole(authContext, ["founder", "admin"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const {
    name,
    category,
    city,
    one_liner,
    website,
    is_d2c,
    founder_photo_url,
    founder_story,
    monthly_revenue,
    social_links,
  } = payload ?? {};

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("startups")
    .insert({
      founder_id: authContext.userId,
      name,
      category,
      city,
      one_liner,
      website,
      founder_photo_url: founder_photo_url ?? null,
      founder_story: founder_story ?? null,
      monthly_revenue: monthly_revenue ?? null,
      social_links: social_links ?? null,
      is_d2c: Boolean(is_d2c),
      status: "pending",
    })
    .select("id, name, status, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ startup: data });
}
