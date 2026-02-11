export type StartupProfileFormValues = {
  name: string;
  category: string;
  city: string;
  one_liner: string;
  website: string;
  founder_photo_url: string;
  founder_story: string;
  monthly_revenue: string;
  founded_on: string;
  country_code: string;
  is_for_sale: boolean;
  asking_price: string;
  currency_code: "INR" | "USD";
  self_reported_all_time_revenue: string;
  self_reported_mrr: string;
  self_reported_active_subscriptions: string;
  is_d2c: boolean;
  social_linkedin: string;
  social_twitter: string;
  social_instagram: string;
};

const asText = (value: unknown) => {
  if (value === null || value === undefined) return "";
  return String(value);
};

const asBool = (value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  }
  return false;
};

const asCurrency = (value: unknown): "INR" | "USD" =>
  String(value ?? "").trim().toUpperCase() === "USD" ? "USD" : "INR";

export const DEFAULT_STARTUP_PROFILE_FORM_VALUES: StartupProfileFormValues = {
  name: "",
  category: "",
  city: "",
  one_liner: "",
  website: "",
  founder_photo_url: "",
  founder_story: "",
  monthly_revenue: "",
  founded_on: "",
  country_code: "",
  is_for_sale: false,
  asking_price: "",
  currency_code: "INR",
  self_reported_all_time_revenue: "",
  self_reported_mrr: "",
  self_reported_active_subscriptions: "",
  is_d2c: false,
  social_linkedin: "",
  social_twitter: "",
  social_instagram: "",
};

export const fromStartupRecordToFormValues = (
  startup: Record<string, unknown> | null | undefined
): StartupProfileFormValues => {
  if (!startup) return { ...DEFAULT_STARTUP_PROFILE_FORM_VALUES };

  const socialLinks =
    startup.social_links && typeof startup.social_links === "object"
      ? (startup.social_links as Record<string, unknown>)
      : {};

  return {
    name: asText(startup.name),
    category: asText(startup.category),
    city: asText(startup.city),
    one_liner: asText(startup.one_liner),
    website: asText(startup.website),
    founder_photo_url: asText(startup.founder_photo_url),
    founder_story: asText(startup.founder_story),
    monthly_revenue: asText(startup.monthly_revenue),
    founded_on: asText(startup.founded_on),
    country_code: asText(startup.country_code),
    is_for_sale: asBool(startup.is_for_sale),
    asking_price: asText(startup.asking_price),
    currency_code: asCurrency(startup.currency_code),
    self_reported_all_time_revenue: asText(startup.self_reported_all_time_revenue),
    self_reported_mrr: asText(startup.self_reported_mrr),
    self_reported_active_subscriptions: asText(startup.self_reported_active_subscriptions),
    is_d2c: asBool(startup.is_d2c),
    social_linkedin: asText(socialLinks.linkedin),
    social_twitter: asText(socialLinks.twitter),
    social_instagram: asText(socialLinks.instagram),
  };
};

const trimToNull = (value: string) => {
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

export const toStartupApiPayload = (values: StartupProfileFormValues) => {
  const website = trimToNull(values.website);
  const socialLinks = {
    website,
    linkedin: trimToNull(values.social_linkedin),
    twitter: trimToNull(values.social_twitter),
    instagram: trimToNull(values.social_instagram),
  };

  return {
    name: values.name,
    category: values.category,
    city: values.city,
    one_liner: values.one_liner,
    website,
    founder_photo_url: trimToNull(values.founder_photo_url),
    founder_story: trimToNull(values.founder_story),
    monthly_revenue: trimToNull(values.monthly_revenue),
    social_links: socialLinks,
    is_d2c: Boolean(values.is_d2c),
    founded_on: trimToNull(values.founded_on),
    country_code: trimToNull(values.country_code),
    is_for_sale: Boolean(values.is_for_sale),
    asking_price: trimToNull(values.asking_price),
    currency_code: values.currency_code,
    self_reported_all_time_revenue: trimToNull(values.self_reported_all_time_revenue),
    self_reported_mrr: trimToNull(values.self_reported_mrr),
    self_reported_active_subscriptions: trimToNull(values.self_reported_active_subscriptions),
  };
};
