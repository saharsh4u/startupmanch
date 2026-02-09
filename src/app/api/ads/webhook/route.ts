import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAdPriceId, getStripe, getWebhookSecret } from "@/lib/stripe/server";

export const runtime = "nodejs";

const asStringId = (value: unknown) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "id" in value && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return null;
};

const toIso = (epochSeconds: number | null | undefined) => {
  if (!epochSeconds || !Number.isFinite(epochSeconds)) return null;
  return new Date(epochSeconds * 1000).toISOString();
};

const deriveCampaignStatusFromSubscription = (status: string, detailsSubmittedAt: string | null) => {
  if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") {
    return "canceled";
  }
  if (status === "past_due") {
    return "payment_failed";
  }
  if (status === "active" || status === "trialing") {
    return detailsSubmittedAt ? "active" : "awaiting_details";
  }
  return null;
};

export async function POST(request: Request) {
  try {
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
    }

    const stripe = getStripe();
    const webhookSecret = getWebhookSecret();
    const payload = await request.text();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid webhook signature";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const priceId = session.metadata?.price_id ?? getAdPriceId();

      const { error } = await supabaseAdmin.from("ad_campaigns").upsert(
        {
          stripe_checkout_session_id: session.id,
          stripe_customer_id: asStringId(session.customer),
          stripe_subscription_id: asStringId(session.subscription),
          stripe_price_id: priceId,
          billing_email: session.customer_details?.email ?? null,
          status: "awaiting_details",
        },
        { onConflict: "stripe_checkout_session_id" }
      );

      if (error) {
        throw new Error(error.message);
      }
    }

    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;
      const subscriptionId = asStringId(subscription.id);

      if (subscriptionId) {
        const { data: campaign, error: campaignError } = await supabaseAdmin
          .from("ad_campaigns")
          .select("id, details_submitted_at")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle();

        if (campaignError) {
          throw new Error(campaignError.message);
        }

        if (campaign) {
          const nextStatus = deriveCampaignStatusFromSubscription(
            subscription.status,
            campaign.details_submitted_at
          );

          const { error: updateError } = await supabaseAdmin
            .from("ad_campaigns")
            .update({
              current_period_end: toIso(subscription.current_period_end),
              cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
              status: nextStatus ?? undefined,
            })
            .eq("id", campaign.id);

          if (updateError) {
            throw new Error(updateError.message);
          }
        }
      }
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = asStringId(invoice.subscription);

      if (subscriptionId) {
        const { error } = await supabaseAdmin
          .from("ad_campaigns")
          .update({ status: "payment_failed" })
          .eq("stripe_subscription_id", subscriptionId);

        if (error) {
          throw new Error(error.message);
        }
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const subscriptionId = asStringId(subscription.id);

      if (subscriptionId) {
        const { error } = await supabaseAdmin
          .from("ad_campaigns")
          .update({
            status: "canceled",
            cancel_at_period_end: true,
            current_period_end: toIso(subscription.current_period_end),
          })
          .eq("stripe_subscription_id", subscriptionId);

        if (error) {
          throw new Error(error.message);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook handler error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
