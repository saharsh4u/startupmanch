import { createHmac, timingSafeEqual } from "crypto";

type CashfreeMode = "sandbox" | "production";

type CashfreeConfig = {
  appId: string;
  secretKey: string;
  apiVersion: string;
  mode: CashfreeMode;
  baseUrl: string;
};

type AdPlanConfig = {
  planCode: string;
  amount: number;
  currency: string;
  interval: string;
};

type CashfreeCustomerDetails = {
  customer_id: string;
  customer_email: string;
  customer_phone: string;
};

type CashfreeOrderMeta = {
  return_url: string;
  notify_url?: string;
};

type CreateCashfreeOrderInput = {
  orderId: string;
  customerDetails: CashfreeCustomerDetails;
  orderMeta: CashfreeOrderMeta;
  orderNote?: string;
};

export type CashfreeOrder = {
  order_id: string;
  cf_order_id?: string;
  order_status?: string;
  payment_session_id?: string;
  payment_link?: string;
  customer_details?: {
    customer_id?: string;
    customer_email?: string;
    customer_phone?: string;
  };
};

const DEFAULT_API_VERSION = "2025-01-01";
const DEFAULT_PLAN_CODE = "cashfree-monthly-ad-slot";
const DEFAULT_INTERVAL = "month";
const DEFAULT_CURRENCY = "INR";
const DEFAULT_AMOUNT = 5000;

const trimSlash = (value: string) => value.replace(/\/+$/, "");

const parsePositiveAmount = (rawValue: string | undefined, fallback: number) => {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed * 100) / 100;
};

const resolveBaseUrl = (mode: CashfreeMode) =>
  mode === "sandbox" ? "https://sandbox.cashfree.com" : "https://api.cashfree.com";

const extractErrorMessage = (payload: unknown, fallback: string) => {
  if (!payload || typeof payload !== "object") return fallback;
  const source = payload as Record<string, unknown>;
  if (typeof source.message === "string" && source.message.trim().length) return source.message;
  if (typeof source.error === "string" && source.error.trim().length) return source.error;
  return fallback;
};

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
};

const toBase64Url = (value: Buffer | string) =>
  Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const fromBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + "=".repeat(padLength), "base64");
};

const getAdOnboardingTokenSecret = () => {
  const configured = process.env.AD_ONBOARDING_TOKEN_SECRET?.trim();
  if (configured) return configured;
  const fallback = process.env.CASHFREE_SECRET_KEY?.trim();
  if (fallback) return fallback;
  throw new Error("AD_ONBOARDING_TOKEN_SECRET or CASHFREE_SECRET_KEY is required");
};

export const hasCashfreeCredentials = () =>
  Boolean(process.env.CASHFREE_APP_ID?.trim() && process.env.CASHFREE_SECRET_KEY?.trim());

export const getCashfreeConfig = (): CashfreeConfig => {
  const appId = process.env.CASHFREE_APP_ID?.trim();
  const secretKey = process.env.CASHFREE_SECRET_KEY?.trim();

  if (!appId) {
    throw new Error("CASHFREE_APP_ID is missing");
  }
  if (!secretKey) {
    throw new Error("CASHFREE_SECRET_KEY is missing");
  }

  const modeRaw = process.env.CASHFREE_ENV?.trim().toLowerCase();
  const mode: CashfreeMode = modeRaw === "sandbox" ? "sandbox" : "production";
  const apiVersion = process.env.CASHFREE_API_VERSION?.trim() || DEFAULT_API_VERSION;

  return {
    appId,
    secretKey,
    apiVersion,
    mode,
    baseUrl: resolveBaseUrl(mode),
  };
};

export const getAdPlanConfig = (): AdPlanConfig => ({
  planCode: process.env.AD_SLOT_PLAN_CODE?.trim() || DEFAULT_PLAN_CODE,
  amount: parsePositiveAmount(process.env.AD_SLOT_PRICE_AMOUNT, DEFAULT_AMOUNT),
  currency: process.env.AD_SLOT_PRICE_CURRENCY?.trim().toUpperCase() || DEFAULT_CURRENCY,
  interval: process.env.AD_SLOT_PRICE_INTERVAL?.trim().toLowerCase() || DEFAULT_INTERVAL,
});

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

const cashfreeRequest = async <T>(path: string, options?: { method?: string; body?: unknown }) => {
  const config = getCashfreeConfig();
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: options?.method ?? "GET",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-api-version": config.apiVersion,
      "x-client-id": config.appId,
      "x-client-secret": config.secretKey,
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  const raw = await response.text();
  const payload = raw ? (JSON.parse(raw) as unknown) : {};

  if (!response.ok) {
    const message = extractErrorMessage(payload, "Cashfree request failed");
    throw new Error(message);
  }

  return payload as T;
};

export const createCashfreeOrder = async (input: CreateCashfreeOrderInput) => {
  const plan = getAdPlanConfig();
  const payload = await cashfreeRequest<CashfreeOrder>("/pg/orders", {
    method: "POST",
    body: {
      order_id: input.orderId,
      order_amount: plan.amount,
      order_currency: plan.currency,
      customer_details: input.customerDetails,
      order_meta: input.orderMeta,
      order_note: input.orderNote ?? "StartupManch animated rail ad slot",
    },
  });

  return payload;
};

export const getCashfreeOrder = async (orderId: string) => {
  const normalized = orderId.trim();
  if (!normalized) {
    throw new Error("order_id is required");
  }
  return cashfreeRequest<CashfreeOrder>(`/pg/orders/${encodeURIComponent(normalized)}`);
};

export const verifyCashfreeWebhookSignature = (rawBody: string, headers: Headers) => {
  const signature = headers.get("x-webhook-signature")?.trim();
  const timestamp = headers.get("x-webhook-timestamp")?.trim();
  const secret = process.env.CASHFREE_SECRET_KEY?.trim();

  if (!signature || !timestamp || !secret) return false;

  const computed = createHmac("sha256", secret)
    .update(`${timestamp}${rawBody}`)
    .digest("base64");

  return safeEqual(signature, computed);
};

export const isCashfreeWebhookTimestampFresh = (
  rawTimestamp: string | null | undefined,
  maxAgeMs = 10 * 60 * 1000
) => {
  const timestamp = Number(rawTimestamp);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return false;
  return Math.abs(Date.now() - timestamp) <= maxAgeMs;
};

type AdOnboardingTokenPayload = {
  v: 1;
  orderId: string;
  email: string;
  exp: number;
};

export const createAdOnboardingToken = (input: {
  orderId: string;
  billingEmail: string;
  ttlSeconds?: number;
}) => {
  const secret = getAdOnboardingTokenSecret();
  const payload: AdOnboardingTokenPayload = {
    v: 1,
    orderId: input.orderId.trim(),
    email: input.billingEmail.trim().toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + Math.max(300, input.ttlSeconds ?? 60 * 60 * 24),
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = toBase64Url(createHmac("sha256", secret).update(encodedPayload).digest());
  return `${encodedPayload}.${signature}`;
};

export const verifyAdOnboardingToken = (input: {
  token: string;
  orderId: string;
  billingEmail: string | null;
}) => {
  const token = input.token.trim();
  const orderId = input.orderId.trim();
  const billingEmail = (input.billingEmail ?? "").trim().toLowerCase();
  if (!token || !orderId || !billingEmail) return false;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return false;

  try {
    const secret = getAdOnboardingTokenSecret();
    const expectedSignature = toBase64Url(
      createHmac("sha256", secret).update(encodedPayload).digest()
    );
    if (!safeEqual(signature, expectedSignature)) return false;

    const payload = JSON.parse(fromBase64Url(encodedPayload).toString("utf8")) as Partial<AdOnboardingTokenPayload>;
    if (payload.v !== 1) return false;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return false;
    if (typeof payload.orderId !== "string" || payload.orderId.trim() !== orderId) return false;
    if (typeof payload.email !== "string" || payload.email.trim().toLowerCase() !== billingEmail) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};
