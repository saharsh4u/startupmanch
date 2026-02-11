import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, requireRole } from "@/lib/supabase/auth";
import { parseStartupWritePayload } from "@/lib/startups/payload";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authContext = await getAuthContext(request);
  if (!authContext || !requireRole(authContext, ["founder", "admin"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const parsed = parseStartupWritePayload(payload, { requireName: true });
  if (parsed.error || !parsed.values) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const values = parsed.values;

  const { data, error } = await supabaseAdmin
    .from("startups")
    .insert({
      founder_id: authContext.userId,
      name: values.name,
      category: values.category,
      city: values.city,
      one_liner: values.one_liner,
      website: values.website,
      founder_photo_url: values.founder_photo_url,
      founder_story: values.founder_story,
      monthly_revenue: values.monthly_revenue,
      social_links: values.social_links,
      is_d2c: values.is_d2c,
      founded_on: values.founded_on,
      country_code: values.country_code,
      is_for_sale: values.is_for_sale,
      asking_price: values.asking_price,
      currency_code: values.currency_code,
      self_reported_all_time_revenue: values.self_reported_all_time_revenue,
      self_reported_mrr: values.self_reported_mrr,
      self_reported_active_subscriptions: values.self_reported_active_subscriptions,
      status: "pending",
    })
    .select(
      "id, name, status, created_at, founded_on, country_code, is_for_sale, asking_price, currency_code, self_reported_all_time_revenue, self_reported_mrr, self_reported_active_subscriptions"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ startup: data });
}
