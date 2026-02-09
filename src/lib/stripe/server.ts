import Stripe from "stripe";

const DEFAULT_API_VERSION: Stripe.LatestApiVersion = "2024-06-20";

const trimSlash = (value: string) => value.replace(/\/+$/, "");

export const getAdPriceId = () => {
  const priceId = process.env.STRIPE_AD_PRICE_ID?.trim();
  if (!priceId) {
    throw new Error("STRIPE_AD_PRICE_ID is missing");
  }
  return priceId;
};

export const getStripe = () => {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is missing");
  }

  return new Stripe(key, {
    apiVersion: DEFAULT_API_VERSION,
  });
};

export const getWebhookSecret = () => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is missing");
  }
  return secret;
};

export const resolveSiteUrl = (request?: Request) => {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (envUrl) {
    return trimSlash(envUrl);
  }

  if (request) {
    const url = new URL(request.url);
    return `${url.protocol}//${url.host}`;
  }

  throw new Error("NEXT_PUBLIC_SITE_URL is missing");
};
