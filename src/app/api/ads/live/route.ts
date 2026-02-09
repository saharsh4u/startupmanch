import { NextResponse } from "next/server";
import { leftAdSlots, rightAdSlots } from "@/data/ads";
import { buildLiveAdSlots, type ActiveAdCampaign } from "@/lib/ads";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const fallbackResponse = () => {
  const built = buildLiveAdSlots([], leftAdSlots, rightAdSlots);
  return NextResponse.json({
    source: "static",
    left: built.left,
    right: built.right,
    spotsLeft: built.spotsLeft,
  });
};

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("ad_campaigns")
      .select("id,company_name,tagline,badge,accent,destination_url,logo_url")
      .eq("status", "active")
      .order("activated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return fallbackResponse();
    }

    const campaigns = (data ?? []) as ActiveAdCampaign[];
    const built = buildLiveAdSlots(campaigns, leftAdSlots, rightAdSlots);

    return NextResponse.json({
      source: campaigns.length ? "db" : "static",
      left: built.left,
      right: built.right,
      spotsLeft: built.spotsLeft,
    });
  } catch {
    return fallbackResponse();
  }
}
