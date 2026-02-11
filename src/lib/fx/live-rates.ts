export type SupportedCurrency = "INR" | "USD";

export type FxSnapshot = {
  usdToInr: number;
  inrToUsd: number;
  source: string;
  fetchedAt: string;
  isFallback: boolean;
};

const FALLBACK_USD_TO_INR = 83;
const LIVE_RATE_ENDPOINT = "https://open.er-api.com/v6/latest/USD";

const asFiniteNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const roundToTwo = (value: number) => Math.round(value * 100) / 100;

export const normalizeSupportedCurrency = (value: string | null | undefined): SupportedCurrency => {
  const normalized = (value ?? "").trim().toUpperCase();
  if (normalized === "USD") return "USD";
  return "INR";
};

export const fallbackFxSnapshot = (): FxSnapshot => ({
  usdToInr: FALLBACK_USD_TO_INR,
  inrToUsd: 1 / FALLBACK_USD_TO_INR,
  source: "fallback",
  fetchedAt: new Date().toISOString(),
  isFallback: true,
});

export const fetchLiveUsdInrRates = async (): Promise<FxSnapshot> => {
  try {
    const response = await fetch(LIVE_RATE_ENDPOINT, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      return fallbackFxSnapshot();
    }

    const payload = (await response.json()) as {
      result?: string;
      rates?: Record<string, number>;
      time_last_update_utc?: string;
    };
    const usdToInr = asFiniteNumber(payload?.rates?.INR, FALLBACK_USD_TO_INR);
    const fetchedAt =
      typeof payload?.time_last_update_utc === "string" && payload.time_last_update_utc.trim().length
        ? new Date(payload.time_last_update_utc).toISOString()
        : new Date().toISOString();

    return {
      usdToInr,
      inrToUsd: 1 / usdToInr,
      source: LIVE_RATE_ENDPOINT,
      fetchedAt,
      isFallback: false,
    };
  } catch {
    return fallbackFxSnapshot();
  }
};

export const convertAmountBetween = (
  amount: number,
  from: SupportedCurrency,
  to: SupportedCurrency,
  fx: FxSnapshot
) => {
  if (!Number.isFinite(amount)) return 0;
  if (from === to) return roundToTwo(amount);
  if (from === "USD" && to === "INR") return roundToTwo(amount * fx.usdToInr);
  return roundToTwo(amount * fx.inrToUsd);
};

export const toDualCurrency = (
  amount: number,
  baseCurrency: SupportedCurrency,
  fx: FxSnapshot
) => {
  if (!Number.isFinite(amount)) {
    return { inr: null as number | null, usd: null as number | null };
  }

  if (baseCurrency === "INR") {
    return {
      inr: roundToTwo(amount),
      usd: convertAmountBetween(amount, "INR", "USD", fx),
    };
  }

  return {
    inr: convertAmountBetween(amount, "USD", "INR", fx),
    usd: roundToTwo(amount),
  };
};

