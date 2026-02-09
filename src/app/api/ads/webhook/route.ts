import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAdPlanConfig, getCashfreeOrder, hasCashfreeCredentials } from "@/lib/cashfree/server";

export const runtime = "nodejs";

type CashfreeWebhookPayload = {
  type?: string;
  data?: {
    order?: {
      order_id?: string;
    };
  };
  order?: {
    order_id?: string;
  };
};

const isPaidOrder = (status: string | null | undefined) => status?.toUpperCase() === "PAID";
const isFailedOrder = (status: string | null | undefined) =>
  status?.toUpperCase() === "FAILED" || status?.toUpperCase() === "CANCELLED";

const extractOrderId = (payload: CashfreeWebhookPayload) => {
  const fromData = payload.data?.order?.order_id;
  if (typeof fromData === "string" && fromData.trim().length) return fromData.trim();

  const fromOrder = payload.order?.order_id;
  if (typeof fromOrder === "string" && fromOrder.trim().length) return fromOrder.trim();

  return "";
};

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

export async function POST(request: Request) {
  try {
    if (!hasCashfreeCredentials()) {
      return NextResponse.json({ received: true, ignored: "cashfree_not_configured" });
    }

    const raw = await request.text();
    if (!raw.trim().length) {
      return NextResponse.json({ received: true, ignored: "empty_payload" });
    }

    const payload = JSON.parse(raw) as CashfreeWebhookPayload;
    const orderId = extractOrderId(payload);

    if (!orderId) {
      return NextResponse.json({ received: true, ignored: "missing_order_id" });
    }

    const order = await getCashfreeOrder(orderId);
    const plan = getAdPlanConfig();
    const customerId = order.customer_details?.customer_id?.trim() || null;
    const customerEmail = order.customer_details?.customer_email?.trim().toLowerCase() || null;
    const cfOrderId = order.cf_order_id?.trim() || null;

    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from("ad_campaigns")
      .select("id, details_submitted_at")
      .eq("stripe_checkout_session_id", orderId)
      .maybeSingle();

    if (campaignError) {
      throw new Error(campaignError.message);
    }

    if (isPaidOrder(order.order_status)) {
      const nextStatus = campaign?.details_submitted_at ? "active" : "awaiting_details";
      const updates = {
        stripe_customer_id: customerId,
        stripe_subscription_id: cfOrderId,
        stripe_price_id: plan.planCode,
        billing_email: customerEmail,
        status: nextStatus,
        current_period_end: addBillingPeriod(plan.interval),
      };

      if (campaign) {
        const { error } = await supabaseAdmin.from("ad_campaigns").update(updates).eq("id", campaign.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabaseAdmin.from("ad_campaigns").insert({
          stripe_checkout_session_id: orderId,
          ...updates,
        });
        if (error) throw new Error(error.message);
      }
    } else if (isFailedOrder(order.order_status)) {
      if (campaign) {
        const { error } = await supabaseAdmin
          .from("ad_campaigns")
          .update({ status: "payment_failed" })
          .eq("id", campaign.id);
        if (error) throw new Error(error.message);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook handler error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
