import { NextResponse } from "next/server";
import { decryptSecret } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, requireRole } from "@/lib/supabase/auth";

export const runtime = "nodejs";

const DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

type Provider = "stripe" | "razorpay";

type RevenueConnectionRow = {
  id: string;
  provider: Provider;
  api_key_ciphertext: string;
};

type RevenueSnapshot = {
  period_start: string;
  period_end: string;
  gross_revenue: number;
  currency: string;
  mrr: number | null;
  active_subscriptions: number | null;
};

type StripeListResponse<T> = {
  data?: T[];
  has_more?: boolean;
};

type StripeCharge = {
  id?: string;
  created?: number;
  amount?: number;
  currency?: string;
  paid?: boolean;
  status?: string;
};

type StripeSubscriptionItem = {
  quantity?: number;
  price?: {
    unit_amount?: number | null;
    unit_amount_decimal?: string | null;
    recurring?: {
      interval?: "day" | "week" | "month" | "year";
      interval_count?: number;
    } | null;
  } | null;
};

type StripeSubscription = {
  status?: string;
  items?: {
    data?: StripeSubscriptionItem[];
  };
};

type RazorpayListResponse<T> = {
  items?: T[];
  count?: number;
};

type RazorpayPayment = {
  created_at?: number;
  amount?: number;
  currency?: string;
  status?: string;
  captured?: boolean;
};

const roundToTwo = (value: number) => Math.round(value * 100) / 100;

const dayKey = (value: Date | number) => {
  const date = typeof value === "number" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
};

const buildDailyMap = () => {
  const map = new Map<string, RevenueSnapshot>();
  const now = Date.now();
  for (let offset = DAYS - 1; offset >= 0; offset -= 1) {
    const date = new Date(now - offset * DAY_MS);
    const key = dayKey(date);
    map.set(key, {
      period_start: key,
      period_end: key,
      gross_revenue: 0,
      currency: "usd",
      mrr: null,
      active_subscriptions: null,
    });
  }
  return map;
};

const toMonthlyAmount = (item: StripeSubscriptionItem) => {
  const quantity = Math.max(1, Number(item?.quantity ?? 1));
  const price = item?.price;
  if (!price) return 0;

  const amountRaw =
    typeof price.unit_amount === "number"
      ? price.unit_amount
      : Number(price.unit_amount_decimal ?? "0");
  if (!Number.isFinite(amountRaw) || amountRaw <= 0) return 0;

  const recurring = price.recurring;
  const interval = recurring?.interval ?? "month";
  const intervalCount = Math.max(1, Number(recurring?.interval_count ?? 1));
  const base = (amountRaw / 100) * quantity;

  if (interval === "day") return (base * 30) / intervalCount;
  if (interval === "week") return (base * 4.345) / intervalCount;
  if (interval === "year") return base / (12 * intervalCount);
  return base / intervalCount;
};

const fetchJson = async <T>(url: string, init: RequestInit, fallbackError: string) => {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
  });
  const raw = await response.text();
  const payload = raw ? (JSON.parse(raw) as unknown) : {};
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error?: { message?: string } }).error?.message ?? fallbackError)
        : fallbackError;
    throw new Error(message);
  }
  return payload as T;
};

const fetchStripeSnapshots = async (apiKey: string): Promise<RevenueSnapshot[]> => {
  const daily = buildDailyMap();
  const sinceUnix = Math.floor((Date.now() - (DAYS - 1) * DAY_MS) / 1000);
  const authHeader = `Bearer ${apiKey}`;
  let dominantCurrency = "usd";
  let chargesSeen = 0;

  let hasMore = true;
  let startingAfter = "";
  let pageGuard = 0;

  while (hasMore && pageGuard < 300) {
    const params = new URLSearchParams();
    params.set("limit", "100");
    params.set("created[gte]", String(sinceUnix));
    if (startingAfter) params.set("starting_after", startingAfter);

    const payload = await fetchJson<StripeListResponse<StripeCharge>>(
      `https://api.stripe.com/v1/charges?${params.toString()}`,
      { headers: { Authorization: authHeader } },
      "Stripe charges fetch failed"
    );

    const charges = payload.data ?? [];
    for (const charge of charges) {
      if (!charge || charge.paid !== true || charge.status !== "succeeded") continue;
      const created = Number(charge.created ?? 0);
      if (!Number.isFinite(created) || created <= 0) continue;
      const key = dayKey(created * 1000);
      const bucket = daily.get(key);
      if (!bucket) continue;

      const amount = Number(charge.amount ?? 0) / 100;
      if (!Number.isFinite(amount) || amount <= 0) continue;

      const currency = String(charge.currency ?? "usd").toLowerCase();
      bucket.gross_revenue = roundToTwo(bucket.gross_revenue + amount);
      bucket.currency = currency;
      dominantCurrency = currency;
      chargesSeen += 1;
    }

    hasMore = Boolean(payload.has_more);
    const last = charges[charges.length - 1];
    startingAfter = hasMore && last ? String(last.id ?? "") : "";
    if (hasMore && !startingAfter) {
      hasMore = false;
    }
    pageGuard += 1;
  }

  const subscriptions = await fetchJson<StripeListResponse<StripeSubscription>>(
    "https://api.stripe.com/v1/subscriptions?status=all&limit=100",
    { headers: { Authorization: authHeader } },
    "Stripe subscriptions fetch failed"
  );

  let activeSubscriptions = 0;
  let mrr = 0;
  for (const subscription of subscriptions.data ?? []) {
    const status = String(subscription?.status ?? "");
    if (status !== "active" && status !== "trialing") continue;
    activeSubscriptions += 1;
    for (const item of subscription.items?.data ?? []) {
      mrr += toMonthlyAmount(item);
    }
  }

  const rows = Array.from(daily.values());
  if (rows.length) {
    const latest = rows[rows.length - 1];
    latest.mrr = roundToTwo(mrr);
    latest.active_subscriptions = activeSubscriptions;
  }
  if (!chargesSeen) {
    for (const row of rows) {
      row.currency = dominantCurrency;
    }
  }

  return rows;
};

const parseRazorpayKey = (raw: string) => {
  const token = raw.trim();
  const [keyId, keySecret] = token.split(":");
  if (!keyId || !keySecret) {
    throw new Error("Razorpay key must be key_id:key_secret.");
  }
  return { keyId, keySecret };
};

const fetchRazorpaySnapshots = async (apiKey: string): Promise<RevenueSnapshot[]> => {
  const { keyId, keySecret } = parseRazorpayKey(apiKey);
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const daily = buildDailyMap();

  const from = Math.floor((Date.now() - (DAYS - 1) * DAY_MS) / 1000);
  const to = Math.floor(Date.now() / 1000);

  let skip = 0;
  const count = 100;
  let hasMore = true;
  let dominantCurrency = "inr";

  while (hasMore && skip < 20000) {
    const payload = await fetchJson<RazorpayListResponse<RazorpayPayment>>(
      `https://api.razorpay.com/v1/payments?from=${from}&to=${to}&count=${count}&skip=${skip}`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      },
      "Razorpay payments fetch failed"
    );

    const items = payload.items ?? [];
    for (const payment of items) {
      const status = String(payment.status ?? "").toLowerCase();
      const captured = payment.captured === true || status === "captured";
      if (!captured) continue;

      const created = Number(payment.created_at ?? 0);
      if (!Number.isFinite(created) || created <= 0) continue;
      const key = dayKey(created * 1000);
      const bucket = daily.get(key);
      if (!bucket) continue;

      const amount = Number(payment.amount ?? 0) / 100;
      if (!Number.isFinite(amount) || amount <= 0) continue;

      const currency = String(payment.currency ?? "INR").toLowerCase();
      bucket.gross_revenue = roundToTwo(bucket.gross_revenue + amount);
      bucket.currency = currency;
      dominantCurrency = currency;
    }

    if (items.length < count) {
      hasMore = false;
    } else {
      skip += count;
    }
  }

  const rows = Array.from(daily.values());
  for (const row of rows) {
    if (!row.currency) row.currency = dominantCurrency;
  }
  return rows;
};

export async function POST(request: Request, { params }: { params: { startup_id: string } }) {
  try {
    const auth = await getAuthContext(request);
    if (!auth || !requireRole(auth, ["founder", "admin"])) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const startup_id = params.startup_id;
    const { data: startupRow } = await supabaseAdmin
      .from("startups")
      .select("founder_id")
      .eq("id", startup_id)
      .single();
    if (!startupRow) return NextResponse.json({ error: "Startup not found" }, { status: 404 });
    if (startupRow.founder_id !== auth.userId && !requireRole(auth, ["admin"])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: connections, error: connectionsError } = await supabaseAdmin
      .from("revenue_connections")
      .select("id,provider,api_key_ciphertext")
      .eq("startup_id", startup_id)
      .neq("status", "revoked");

    if (connectionsError) throw connectionsError;
    const activeConnections = (connections ?? []) as RevenueConnectionRow[];
    if (!activeConnections.length) {
      return NextResponse.json({ error: "No active revenue connections found." }, { status: 400 });
    }

    let inserted = 0;
    const syncedProviders: Provider[] = [];
    const failedProviders: Array<{ provider: Provider; error: string }> = [];
    const syncTime = new Date().toISOString();

    for (const connection of activeConnections) {
      try {
        const secret = decryptSecret(connection.api_key_ciphertext);
        const snapshots =
          connection.provider === "stripe"
            ? await fetchStripeSnapshots(secret)
            : await fetchRazorpaySnapshots(secret);

        const rows = snapshots.map((item) => ({
          startup_id,
          provider: connection.provider,
          period_start: item.period_start,
          period_end: item.period_end,
          currency: item.currency,
          gross_revenue: item.gross_revenue,
          net_revenue: item.gross_revenue,
          mrr: item.mrr,
          active_subscriptions: item.active_subscriptions,
        }));

        const { error: upsertError } = await supabaseAdmin.from("revenue_snapshots").upsert(rows, {
          onConflict: "startup_id,provider,period_start",
        });
        if (upsertError) throw upsertError;

        const { error: updateError } = await supabaseAdmin
          .from("revenue_connections")
          .update({ status: "active", last_synced_at: syncTime })
          .eq("id", connection.id);
        if (updateError) throw updateError;

        inserted += rows.length;
        syncedProviders.push(connection.provider);
      } catch (providerError) {
        const message =
          providerError instanceof Error ? providerError.message : "Revenue provider sync failed";
        failedProviders.push({ provider: connection.provider, error: message });
        await supabaseAdmin
          .from("revenue_connections")
          .update({ status: "error" })
          .eq("id", connection.id);
      }
    }

    if (!syncedProviders.length) {
      return NextResponse.json(
        {
          error: "Unable to sync any revenue provider.",
          failures: failedProviders,
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        ok: failedProviders.length === 0,
        inserted,
        synced_providers: syncedProviders,
        failed_providers: failedProviders,
      },
      { status: failedProviders.length ? 207 : 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unable to sync revenue";
    console.error("revenue sync error", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
