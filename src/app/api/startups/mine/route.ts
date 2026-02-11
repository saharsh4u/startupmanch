import { NextResponse } from "next/server";
import { getAuthContext, requireRole } from "@/lib/supabase/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const startupSelect =
  "id,founder_id,name,category,city,one_liner,website,founder_photo_url,founder_story,monthly_revenue,social_links,is_d2c,status,founded_on,country_code,is_for_sale,asking_price,currency_code,self_reported_all_time_revenue,self_reported_mrr,self_reported_active_subscriptions,created_at";

type StartupRow = {
  id: string;
  founder_id: string;
  name: string;
  category: string | null;
  city: string | null;
  one_liner: string | null;
  website: string | null;
  founder_photo_url: string | null;
  founder_story: string | null;
  monthly_revenue: string | null;
  social_links: Record<string, string | null> | null;
  is_d2c: boolean;
  status: string;
  founded_on: string | null;
  country_code: string | null;
  is_for_sale: boolean;
  asking_price: number | null;
  currency_code: string;
  self_reported_all_time_revenue: number | null;
  self_reported_mrr: number | null;
  self_reported_active_subscriptions: number | null;
  created_at: string;
};

type PitchRow = {
  id: string;
  startup_id: string;
  approved_at: string | null;
  created_at: string;
};

export async function GET(request: Request) {
  const auth = await getAuthContext(request);
  if (!auth || !requireRole(auth, ["founder", "admin"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const allowAdminScopeAll = auth.role === "admin" && url.searchParams.get("scope") === "all";

  let query = supabaseAdmin
    .from("startups")
    .select(startupSelect)
    .order("created_at", { ascending: false })
    .limit(100);

  if (!allowAdminScopeAll) {
    query = query.eq("founder_id", auth.userId);
  }

  const { data: startups, error: startupError } = await query;
  if (startupError) {
    return NextResponse.json({ error: startupError.message }, { status: 500 });
  }

  const startupRows = (startups ?? []) as StartupRow[];
  if (!startupRows.length) {
    return NextResponse.json({ startups: [] });
  }

  const startupIds = startupRows.map((row) => row.id);
  const { data: pitchRows, error: pitchError } = await supabaseAdmin
    .from("pitches")
    .select("id,startup_id,approved_at,created_at")
    .eq("status", "approved")
    .in("startup_id", startupIds)
    .order("approved_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (pitchError) {
    return NextResponse.json({ error: pitchError.message }, { status: 500 });
  }

  const latestPitchByStartup = new Map<string, PitchRow>();
  for (const row of (pitchRows ?? []) as PitchRow[]) {
    if (!latestPitchByStartup.has(row.startup_id)) {
      latestPitchByStartup.set(row.startup_id, row);
    }
  }

  return NextResponse.json({
    startups: startupRows.map((row) => ({
      ...row,
      latest_approved_pitch_id: latestPitchByStartup.get(row.id)?.id ?? null,
    })),
  });
}
