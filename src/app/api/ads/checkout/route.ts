import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  createCashfreeOrder,
  getAdPlanConfig,
  hasCashfreeCredentials,
  resolveSiteUrl,
} from "@/lib/cashfree/server";

export const runtime = "nodejs";

const isConfigError = (message: string) =>
  message.includes("CASHFREE_") || message.includes("NEXT_PUBLIC_SITE_URL");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9]{10,15}$/;

const normalizeEmail = (value: unknown) => String(value ?? "").trim().toLowerCase();
const normalizePhone = (value: unknown) => String(value ?? "").replace(/\D+/g, "");

const buildOrderId = () => `ad_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export async function POST(request: Request) {
  try {
    if (!hasCashfreeCredentials()) {
      return NextResponse.json(
        {
          error:
            "Cashfree checkout is unavailable. Add CASHFREE_APP_ID and CASHFREE_SECRET_KEY in deployment settings.",
        },
        { status: 503 }
      );
    }

    const payload = (await request.json().catch(() => ({}))) as {
      email?: string;
      phone?: string;
    };
    const billingEmail = normalizeEmail(payload.email);
    const billingPhone = normalizePhone(payload.phone);

    if (!EMAIL_PATTERN.test(billingEmail)) {
      return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
    }
    if (!PHONE_PATTERN.test(billingPhone)) {
      return NextResponse.json({ error: "Valid phone number is required." }, { status: 400 });
    }

    const plan = getAdPlanConfig();
    const siteUrl = resolveSiteUrl(request);
    const orderId = buildOrderId();
    const customerId = `cust_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const order = await createCashfreeOrder({
      orderId,
      customerDetails: {
        customer_id: customerId,
        customer_email: billingEmail,
        customer_phone: billingPhone,
      },
      orderMeta: {
        return_url: `${siteUrl}/advertise/success?session_id={order_id}`,
        notify_url: `${siteUrl}/api/ads/webhook`,
      },
    });

    const { error } = await supabaseAdmin.from("ad_campaigns").upsert(
      {
        stripe_checkout_session_id: order.order_id,
        stripe_customer_id: customerId,
        stripe_subscription_id: order.cf_order_id ?? null,
        stripe_price_id: plan.planCode,
        billing_email: billingEmail,
        status: "checkout_pending",
      },
      { onConflict: "stripe_checkout_session_id" }
    );

    if (error) {
      throw new Error(error.message);
    }

    const redirectUrl = order.payment_link?.trim();
    if (!redirectUrl) {
      throw new Error("Cashfree did not return a payment link.");
    }

    return NextResponse.json({ url: redirectUrl, sessionId: order.order_id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start checkout.";
    if (isConfigError(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
