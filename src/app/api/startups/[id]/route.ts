import { NextResponse } from "next/server";
import { getAuthContext, requireRole } from "@/lib/supabase/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { parseStartupWritePayload } from "@/lib/startups/payload";

export const runtime = "nodejs";

const startupResponseSelect =
  "id,founder_id,name,category,city,one_liner,website,founder_photo_url,founder_story,monthly_revenue,social_links,is_d2c,status,founded_on,country_code,is_for_sale,asking_price,currency_code,self_reported_all_time_revenue,self_reported_mrr,self_reported_active_subscriptions,created_at";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const startupId = params.id;
  if (!startupId) {
    return NextResponse.json({ error: "startup id required" }, { status: 400 });
  }

  const auth = await getAuthContext(request);
  if (!auth || !requireRole(auth, ["founder", "admin"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const parsed = parseStartupWritePayload(payload, { requireName: true });
  if (parsed.error || !parsed.values) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data: startupRow, error: startupError } = await supabaseAdmin
    .from("startups")
    .select("id, founder_id")
    .eq("id", startupId)
    .maybeSingle();

  if (startupError) {
    return NextResponse.json({ error: startupError.message }, { status: 500 });
  }
  if (!startupRow) {
    return NextResponse.json({ error: "Startup not found" }, { status: 404 });
  }

  if (startupRow.founder_id !== auth.userId && !requireRole(auth, ["admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const values = parsed.values;
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("startups")
    .update({
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
    })
    .eq("id", startupId)
    .select(startupResponseSelect)
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ startup: updated });
}
