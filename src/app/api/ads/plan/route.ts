import { NextResponse } from "next/server";
import { getAdPlanConfig, hasCashfreeCredentials } from "@/lib/cashfree/server";

export const runtime = "nodejs";

const formatAmount = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
  }).format(amount);

export async function GET() {
  try {
    const plan = getAdPlanConfig();
    const available = hasCashfreeCredentials();
    if (!available) {
      return NextResponse.json({
        available: false,
        message:
          "Cashfree checkout is temporarily unavailable. Add CASHFREE_APP_ID and CASHFREE_SECRET_KEY to continue.",
      });
    }

    return NextResponse.json({
      available: true,
      priceId: plan.planCode,
      amount: plan.amount,
      currency: plan.currency,
      interval: plan.interval,
      displayAmount: formatAmount(plan.amount, plan.currency),
      productName: "StartupManch Ad Slot",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ad checkout unavailable";

    if (message.includes("CASHFREE_")) {
      return NextResponse.json({ available: false, message }, { status: 200 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
