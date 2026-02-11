import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  getAdPlanConfig,
  getCashfreeOrder,
  hasCashfreeCredentials,
  verifyAdOnboardingToken,
} from "@/lib/cashfree/server";
import { sanitizeAccent, sanitizeBadge, sanitizeName, sanitizeTagline } from "@/lib/ads";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LOGO_SIZE = 5 * 1024 * 1024;

type CampaignRow = {
  id: string;
  stripe_checkout_session_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string;
  billing_email: string | null;
  status: string;
  company_name: string | null;
  tagline: string | null;
  badge: string | null;
  accent: string | null;
  destination_url: string | null;
  support_email: string | null;
  logo_path: string | null;
  logo_url: string | null;
  details_submitted_at: string | null;
  activated_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

const campaignSelect = `
  id,
  stripe_checkout_session_id,
  stripe_customer_id,
  stripe_subscription_id,
  stripe_price_id,
  billing_email,
  status,
  company_name,
  tagline,
  badge,
  accent,
  destination_url,
  support_email,
  logo_path,
  logo_url,
  details_submitted_at,
  activated_at,
  current_period_end,
  cancel_at_period_end
`;

const addBillingPeriod = (interval: string) => {
  const now = new Date();
  if (interval === "year" || interval === "yearly") {
    now.setFullYear(now.getFullYear() + 1);
    return now.toISOString();
  }
  if (interval === "week" || interval === "weekly") {
    now.setDate(now.getDate() + 7);
    return now.toISOString();
  }
  if (interval === "day" || interval === "daily") {
    now.setDate(now.getDate() + 1);
    return now.toISOString();
  }
  now.setMonth(now.getMonth() + 1);
  return now.toISOString();
};

const normalizeWebsite = (value: string) => {
  const candidate = value.trim();
  if (!candidate) throw new Error("destination_url is required");
  const parsed = new URL(candidate);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("destination_url must use http or https");
  }
  return parsed.toString();
};

const isPaidOrder = (status: string | null | undefined) => status?.toUpperCase() === "PAID";

const ensureCheckoutCampaign = async (sessionId: string, onboardingToken: string) => {
  if (!hasCashfreeCredentials()) {
    throw new Error("CASHFREE_APP_ID and CASHFREE_SECRET_KEY are required");
  }
  if (!onboardingToken.trim()) {
    throw new Error("onboarding_token is required");
  }

  const order = await getCashfreeOrder(sessionId);
  if (!isPaidOrder(order.order_status)) {
    throw new Error("Payment is not confirmed yet.");
  }
  const customerEmail = order.customer_details?.customer_email?.trim().toLowerCase() || null;
  if (
    !verifyAdOnboardingToken({
      token: onboardingToken,
      orderId: sessionId,
      billingEmail: customerEmail,
    })
  ) {
    throw new Error("Unauthorized onboarding token.");
  }

  const plan = getAdPlanConfig();
  const customerId = order.customer_details?.customer_id?.trim() || null;
  const cfOrderId = order.cf_order_id?.trim() || null;
  const periodEnd = addBillingPeriod(plan.interval);

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("ad_campaigns")
    .select(campaignSelect)
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (!existing) {
    const { data: created, error: createError } = await supabaseAdmin
      .from("ad_campaigns")
      .insert({
        stripe_checkout_session_id: sessionId,
        stripe_customer_id: customerId,
        stripe_subscription_id: cfOrderId,
        stripe_price_id: plan.planCode,
        billing_email: customerEmail,
        status: "awaiting_details",
        current_period_end: periodEnd,
      })
      .select(campaignSelect)
      .single();

    if (createError || !created) {
      throw new Error(createError?.message ?? "Unable to create ad campaign record.");
    }

    return created as CampaignRow;
  }

  const nextStatus = existing.details_submitted_at ? "active" : "awaiting_details";
  const { data: patched, error: patchError } = await supabaseAdmin
    .from("ad_campaigns")
    .update({
      stripe_customer_id: existing.stripe_customer_id ?? customerId,
      stripe_subscription_id: existing.stripe_subscription_id ?? cfOrderId,
      billing_email: existing.billing_email ?? customerEmail,
      stripe_price_id: existing.stripe_price_id || plan.planCode,
      current_period_end: existing.current_period_end ?? periodEnd,
      status: nextStatus,
    })
    .eq("id", existing.id)
    .select(campaignSelect)
    .single();

  if (patchError || !patched) {
    throw new Error(patchError?.message ?? "Unable to prepare ad campaign record.");
  }

  return patched as CampaignRow;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId =
      (searchParams.get("session_id") ?? searchParams.get("order_id") ?? "").trim();
    const onboardingToken = (searchParams.get("onboarding_token") ?? "").trim();
    if (!sessionId) {
      return NextResponse.json({ error: "session_id is required" }, { status: 400 });
    }
    if (!onboardingToken) {
      return NextResponse.json({ error: "onboarding_token is required" }, { status: 401 });
    }

    const campaign = await ensureCheckoutCampaign(sessionId, onboardingToken);
    return NextResponse.json({ campaign });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load campaign details.";
    if (message.toLowerCase().includes("unauthorized")) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    const status =
      message.includes("not confirmed") || message.includes("session_id") || message.includes("required")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const sessionId = String(formData.get("session_id") ?? "").trim();
    const onboardingToken = String(formData.get("onboarding_token") ?? "").trim();
    if (!sessionId) {
      return NextResponse.json({ error: "session_id is required" }, { status: 400 });
    }
    if (!onboardingToken) {
      return NextResponse.json({ error: "onboarding_token is required" }, { status: 401 });
    }

    const campaign = await ensureCheckoutCampaign(sessionId, onboardingToken);

    const companyName = sanitizeName(String(formData.get("company_name") ?? "").trim());
    const destinationUrl = normalizeWebsite(String(formData.get("destination_url") ?? ""));
    const tagline = sanitizeTagline(String(formData.get("tagline") ?? ""));
    const badge = sanitizeBadge(String(formData.get("badge") ?? "AD"));
    const accent = sanitizeAccent(String(formData.get("accent") ?? ""));
    const supportEmailRaw = String(formData.get("support_email") ?? "").trim();

    if (!supportEmailRaw || !EMAIL_PATTERN.test(supportEmailRaw)) {
      return NextResponse.json({ error: "Valid support_email is required" }, { status: 400 });
    }

    const logo = formData.get("logo");
    let logoPath = campaign.logo_path;
    let logoUrl = campaign.logo_url;

    if (logo instanceof File && logo.size > 0) {
      if (logo.size > MAX_LOGO_SIZE) {
        return NextResponse.json({ error: "Logo must be 5MB or smaller." }, { status: 400 });
      }
      if (!logo.type.startsWith("image/")) {
        return NextResponse.json({ error: "Logo must be an image file." }, { status: 400 });
      }

      const safeName = logo.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const objectPath = `ads/${campaign.id}/${Date.now()}-${safeName}`;
      const bytes = Buffer.from(await logo.arrayBuffer());

      const { error: uploadError } = await supabaseAdmin.storage
        .from("pitch-posters")
        .upload(objectPath, bytes, {
          cacheControl: "3600",
          contentType: logo.type,
          upsert: true,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data: publicUrlData } = supabaseAdmin.storage.from("pitch-posters").getPublicUrl(objectPath);

      logoPath = objectPath;
      logoUrl = publicUrlData.publicUrl;
    }

    const nowIso = new Date().toISOString();
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("ad_campaigns")
      .update({
        company_name: companyName,
        destination_url: destinationUrl,
        tagline,
        badge,
        accent,
        support_email: supportEmailRaw,
        logo_path: logoPath,
        logo_url: logoUrl,
        details_submitted_at: nowIso,
        activated_at: campaign.activated_at ?? nowIso,
        status: "active",
      })
      .eq("id", campaign.id)
      .select(campaignSelect)
      .single();

    if (updateError || !updated) {
      throw new Error(updateError?.message ?? "Unable to update campaign");
    }

    return NextResponse.json({ campaign: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit campaign details.";
    if (message.toLowerCase().includes("unauthorized")) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    const status = message.includes("required") || message.includes("must") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
