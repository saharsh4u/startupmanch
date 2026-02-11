export type DualAmount = {
  inr: number | null;
  usd: number | null;
};

export type StartupProfilePayload = {
  startup: {
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
    status: "pending" | "approved" | "rejected";
    founded_on: string | null;
    country_code: string | null;
    is_for_sale: boolean;
    asking_price: number | null;
    currency_code: "INR" | "USD";
    asking_price_dual: DualAmount;
    self_reported_all_time_revenue: number | null;
    self_reported_mrr: number | null;
    self_reported_active_subscriptions: number | null;
  };
  founder: {
    id: string;
    display_name: string | null;
    city: string | null;
  };
  rank: {
    all_time: number | null;
    total: number;
  };
  watchers: {
    count: number;
    is_watching: boolean;
  };
  latest_pitch: {
    id: string;
    ask: string | null;
    equity: string | null;
    valuation: string | null;
    approved_at: string | null;
    created_at: string;
    video_url: string | null;
    poster_url: string | null;
  } | null;
  revenue: {
    source: "verified" | "self_reported" | "none";
    provider: "stripe" | "razorpay" | null;
    status: "active" | "error" | "revoked" | "missing";
    last_updated: string | null;
    base_currency: "INR" | "USD";
    all_time_revenue: number | null;
    mrr: number | null;
    active_subscriptions: number | null;
    all_time_revenue_dual: DualAmount;
    mrr_dual: DualAmount;
    series: Array<{
      date: string;
      amount: number;
      currency: "INR" | "USD";
      inr: number | null;
      usd: number | null;
    }>;
  };
  fx: {
    usdToInr: number;
    inrToUsd: number;
    source: string;
    fetchedAt: string;
    isFallback: boolean;
  };
};

const compactCurrency = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export const formatDualAmount = (value: DualAmount) => {
  if (value.inr === null && value.usd === null) return "-";

  const inrLabel =
    value.inr === null
      ? "INR -"
      : `INR ${compactCurrency.format(value.inr)}`;
  const usdLabel =
    value.usd === null
      ? "USD -"
      : `USD ${compactCurrency.format(value.usd)}`;

  return `${inrLabel} / ${usdLabel}`;
};

export const formatRelativeDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "-";
  return new Date(timestamp).toLocaleString();
};
