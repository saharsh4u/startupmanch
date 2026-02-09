import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAdPriceId, getStripe, resolveSiteUrl } from "@/lib/stripe/server";

export const runtime = "nodejs";

const isConfigError = (message: string) =>
  message.includes("STRIPE_") || message.includes("NEXT_PUBLIC_SITE_URL");

export async function POST(request: Request) {
  try {
    const stripe = getStripe();
    const priceId = getAdPriceId();
    const siteUrl = resolveSiteUrl(request);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_creation: "always",
      success_url: `${siteUrl}/advertise/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/?adCheckout=cancelled`,
      metadata: {
        checkout_flow: "ad_campaign",
        price_id: priceId,
      },
      allow_promotion_codes: true,
      billing_address_collection: "auto",
    });

    const { error } = await supabaseAdmin.from("ad_campaigns").upsert(
      {
        stripe_checkout_session_id: session.id,
        stripe_price_id: priceId,
        billing_email: session.customer_details?.email ?? null,
        status: "checkout_pending",
      },
      { onConflict: "stripe_checkout_session_id" }
    );

    if (error) {
      throw new Error(error.message);
    }

    if (!session.url) {
      throw new Error("Stripe did not return checkout URL");
    }

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start checkout.";
    if (isConfigError(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
