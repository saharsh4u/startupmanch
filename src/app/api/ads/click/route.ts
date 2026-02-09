import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const fallbackUrl = "/";

const normalizeRedirect = (raw: string | null) => {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const campaignId = (searchParams.get("campaign_id") ?? "").trim();
  const side = (searchParams.get("side") ?? "").trim().slice(0, 20);
  const face = (searchParams.get("face") ?? "").trim().slice(0, 20);

  if (!campaignId) {
    return NextResponse.redirect(new URL(fallbackUrl, request.url), { status: 302 });
  }

  const { data, error } = await supabaseAdmin
    .from("ad_campaigns")
    .select("id,destination_url,status")
    .eq("id", campaignId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.redirect(new URL(fallbackUrl, request.url), { status: 302 });
  }

  const destination = normalizeRedirect(data.destination_url);
  if (!destination) {
    return NextResponse.redirect(new URL(fallbackUrl, request.url), { status: 302 });
  }

  void supabaseAdmin.from("ad_click_events").insert({
    campaign_id: data.id,
    side: side || null,
    face: face || null,
    referrer: request.headers.get("referer"),
    user_agent: request.headers.get("user-agent"),
  });

  return NextResponse.redirect(destination, { status: 302 });
}
