import { NextResponse } from "next/server";
import { getAdPriceId, getStripe } from "@/lib/stripe/server";

export const runtime = "nodejs";

const formatAmount = (unitAmount: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
  }).format(unitAmount / 100);

export async function GET() {
  try {
    const stripe = getStripe();
    const priceId = getAdPriceId();

    const price = await stripe.prices.retrieve(priceId, {
      expand: ["product"],
    });

    const amount = price.unit_amount ?? 0;
    const currency = price.currency ?? "usd";
    const interval = price.recurring?.interval ?? "month";
    const productName =
      typeof price.product === "object" &&
      price.product &&
      "name" in price.product &&
      typeof price.product.name === "string"
        ? price.product.name
        : "StartupManch Ad Slot";

    return NextResponse.json({
      available: true,
      priceId,
      amount,
      currency,
      interval,
      displayAmount: formatAmount(amount, currency),
      productName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ad checkout unavailable";

    if (message.includes("STRIPE_")) {
      return NextResponse.json({ available: false, message }, { status: 200 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
