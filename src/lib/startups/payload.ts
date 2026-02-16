export type StartupWriteValues = {
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
  founded_on: string | null;
  country_code: string | null;
  is_for_sale: boolean;
  asking_price: number | null;
  currency_code: "INR" | "USD";
  self_reported_all_time_revenue: number | null;
  self_reported_mrr: number | null;
  self_reported_active_subscriptions: number | null;
};

export type ParseStartupPayloadResult =
  | {
      values: StartupWriteValues;
      error: null;
    }
  | {
      values: null;
      error: string;
    };

type ParseStartupPayloadOptions = {
  requireName?: boolean;
  requireCategory?: boolean;
};

const trimToNull = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const coerceBoolean = (value: unknown, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  }
  return fallback;
};

const normalizeCurrencyCode = (value: unknown): "INR" | "USD" => {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized === "USD" ? "USD" : "INR";
};

const parseDateOnly = (value: unknown) => {
  const candidate = trimToNull(value);
  if (!candidate) return { value: null as string | null, error: null as string | null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    return { value: null as string | null, error: "founded_on must be YYYY-MM-DD." };
  }

  const timestamp = Date.parse(`${candidate}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) {
    return { value: null as string | null, error: "Invalid founded_on date." };
  }

  return { value: candidate, error: null as string | null };
};

const parseNullableNumber = (
  value: unknown,
  field: string,
  options?: { min?: number; integer?: boolean }
) => {
  const asText = typeof value === "string" ? value.trim() : value;
  if (asText === "" || asText === null || asText === undefined) {
    return { value: null as number | null, error: null as string | null };
  }

  const parsed = Number(asText);
  if (!Number.isFinite(parsed)) {
    return { value: null as number | null, error: `${field} must be a number.` };
  }

  if (options?.integer && !Number.isInteger(parsed)) {
    return { value: null as number | null, error: `${field} must be an integer.` };
  }

  if (typeof options?.min === "number" && parsed < options.min) {
    return {
      value: null as number | null,
      error: `${field} must be greater than or equal to ${options.min}.`,
    };
  }

  return { value: parsed, error: null as string | null };
};

const parseCountryCode = (value: unknown) => {
  const normalized = trimToNull(value);
  if (!normalized) return { value: null as string | null, error: null as string | null };
  const upper = normalized.toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(upper)) {
    return {
      value: null as string | null,
      error: "country_code must be a 2-3 letter code (for example, IN or USA).",
    };
  }
  return { value: upper, error: null as string | null };
};

const parseSocialLinks = (value: unknown, website: string | null) => {
  const base: Record<string, string | null> = {};

  if (website) {
    base.website = website;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return Object.keys(base).length ? base : null;
  }

  const asRecord = value as Record<string, unknown>;
  for (const [key, raw] of Object.entries(asRecord)) {
    const normalizedKey = key.trim().toLowerCase();
    if (!normalizedKey) continue;
    const normalizedValue = trimToNull(raw);
    base[normalizedKey] = normalizedValue;
  }

  return Object.keys(base).length ? base : null;
};

export const parseStartupWritePayload = (
  payload: unknown,
  options: ParseStartupPayloadOptions = {}
): ParseStartupPayloadResult => {
  const input = (payload ?? {}) as Record<string, unknown>;

  const rawName = trimToNull(input.name);
  if (options.requireName && !rawName) {
    return { values: null, error: "Name is required." };
  }

  const name = rawName ?? "";
  const category = trimToNull(input.category);
  if (options.requireCategory && !category) {
    return { values: null, error: "Category is required." };
  }
  const city = trimToNull(input.city);
  const one_liner = trimToNull(input.one_liner);
  const website = trimToNull(input.website);
  const founder_photo_url = trimToNull(input.founder_photo_url);
  const founder_story = trimToNull(input.founder_story);
  const monthly_revenue = trimToNull(input.monthly_revenue);

  const foundedOnParsed = parseDateOnly(input.founded_on);
  if (foundedOnParsed.error) {
    return { values: null, error: foundedOnParsed.error };
  }

  const countryCodeParsed = parseCountryCode(input.country_code);
  if (countryCodeParsed.error) {
    return { values: null, error: countryCodeParsed.error };
  }

  const currency_code = normalizeCurrencyCode(input.currency_code);
  const is_for_sale = coerceBoolean(input.is_for_sale, false);
  const is_d2c = coerceBoolean(input.is_d2c, false);

  const askingPriceParsed = parseNullableNumber(input.asking_price, "asking_price", { min: 0 });
  if (askingPriceParsed.error) {
    return { values: null, error: askingPriceParsed.error };
  }

  const allTimeParsed = parseNullableNumber(
    input.self_reported_all_time_revenue,
    "self_reported_all_time_revenue",
    { min: 0 }
  );
  if (allTimeParsed.error) {
    return { values: null, error: allTimeParsed.error };
  }

  const mrrParsed = parseNullableNumber(input.self_reported_mrr, "self_reported_mrr", { min: 0 });
  if (mrrParsed.error) {
    return { values: null, error: mrrParsed.error };
  }

  const activeSubsParsed = parseNullableNumber(
    input.self_reported_active_subscriptions,
    "self_reported_active_subscriptions",
    { min: 0, integer: true }
  );
  if (activeSubsParsed.error) {
    return { values: null, error: activeSubsParsed.error };
  }

  if (is_for_sale && askingPriceParsed.value === null) {
    return { values: null, error: "asking_price is required when startup is marked for sale." };
  }

  const social_links = parseSocialLinks(input.social_links, website);

  return {
    values: {
      name,
      category,
      city,
      one_liner,
      website,
      founder_photo_url,
      founder_story,
      monthly_revenue,
      social_links,
      is_d2c,
      founded_on: foundedOnParsed.value,
      country_code: countryCodeParsed.value,
      is_for_sale,
      asking_price: is_for_sale ? askingPriceParsed.value : null,
      currency_code,
      self_reported_all_time_revenue: allTimeParsed.value,
      self_reported_mrr: mrrParsed.value,
      self_reported_active_subscriptions: activeSubsParsed.value,
    },
    error: null,
  };
};
