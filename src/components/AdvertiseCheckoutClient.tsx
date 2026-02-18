"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AdRailsScaffold from "@/components/AdRailsScaffold";
import SiteFooter from "@/components/SiteFooter";
import TopNav from "@/components/TopNav";
import { trackEvent } from "@/lib/analytics/events";

type PlanResponse = {
  available?: boolean;
  priceId?: string;
  amount?: number;
  currency?: string;
  interval?: string;
  displayAmount?: string;
  productName?: string;
  message?: string;
  error?: string;
};

type CheckoutMode = "sandbox" | "production";

type CheckoutResponse = {
  provider?: "cashfree";
  mode?: CheckoutMode;
  url?: string;
  sessionId?: string;
  orderId?: string;
  paymentSessionId?: string;
  error?: string;
};

type CheckoutInstance = {
  checkout: (options: {
    paymentSessionId: string;
    redirectTarget?: "_self" | "_blank";
  }) => Promise<unknown> | unknown;
};

type CheckoutFactory = (options: { mode: CheckoutMode }) => CheckoutInstance;

type CheckoutWindow = Window & {
  Cashfree?: CheckoutFactory;
};

const CHECKOUT_SDK_URL = "https://sdk.cashfree.com/js/v3/cashfree.js";
const CHECKOUT_PHONE_STORAGE_KEY = "startupmanch_ad_checkout_phone";
const CHECKOUT_EMAIL_STORAGE_KEY = "startupmanch_ad_checkout_email";

const sanitizeProviderTerms = (value: string) =>
  value
    .replace(/cashfree checkout/gi, "secure payment")
    .replace(/cashfree/gi, "secure payment")
    .trim();

const toPublicError = (value: unknown, fallback: string) => {
  const message = sanitizeProviderTerms(String(value ?? "").trim());
  if (!message.length) return fallback;
  return message;
};

const loadCheckoutFactory = async () => {
  if (typeof window === "undefined") {
    throw new Error("Secure payment is only available in the browser.");
  }

  const checkoutWindow = window as CheckoutWindow;
  if (checkoutWindow.Cashfree) {
    return checkoutWindow.Cashfree;
  }

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${CHECKOUT_SDK_URL}"]`);
    if (existing) {
      let attempts = 0;
      const waitForSdk = () => {
        if ((window as CheckoutWindow).Cashfree) {
          resolve();
        } else if (attempts > 120) {
          reject(new Error("Secure payment SDK did not initialize."));
        } else {
          attempts += 1;
          setTimeout(waitForSdk, 50);
        }
      };
      waitForSdk();
      return;
    }

    const script = document.createElement("script");
    script.src = CHECKOUT_SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load secure payment SDK."));
    document.head.appendChild(script);
  });

  if (!checkoutWindow.Cashfree) {
    throw new Error("Secure payment SDK is unavailable.");
  }

  return checkoutWindow.Cashfree;
};

const normalizeSource = (value: string | null) => {
  const candidate = (value ?? "").trim().toLowerCase();
  if (!candidate.length) return "advertise_page";
  return /^[a-z0-9_-]{1,40}$/.test(candidate) ? candidate : "advertise_page";
};

export default function AdvertiseCheckoutClient() {
  const searchParams = useSearchParams();
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const source = useMemo(() => normalizeSource(searchParams.get("source")), [searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedEmail = window.localStorage.getItem(CHECKOUT_EMAIL_STORAGE_KEY) ?? "";
    const savedPhone = window.localStorage.getItem(CHECKOUT_PHONE_STORAGE_KEY) ?? "";
    if (savedEmail) setEmail(savedEmail);
    if (savedPhone) setPhone(savedPhone);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setStatus("loading");
      setErrorText(null);
      try {
        const response = await fetch("/api/ads/plan", { cache: "no-store" });
        const payload = (await response.json()) as PlanResponse;
        if (cancelled) return;

        if (!response.ok || payload.error) {
          throw new Error(payload.error ?? "Unable to load sponsor plan.");
        }

        setPlan(payload);
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        setErrorText(toPublicError((error as Error).message, "Unable to load sponsor plan."));
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const checkoutLabel = useMemo(() => {
    if (checkoutLoading) return "Opening secure payment…";
    if (!plan?.displayAmount || !plan?.interval) {
      return "Continue to Secure Payment";
    }
    return `Continue to Secure Payment (${plan.displayAmount}/${plan.interval})`;
  }, [checkoutLoading, plan?.displayAmount, plan?.interval]);

  const startCheckout = async () => {
    const emailValue = email.trim().toLowerCase();
    const phoneValue = phone.replace(/\D+/g, "");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      setErrorText("Enter a valid email address.");
      return;
    }
    if (!/^[0-9]{10,15}$/.test(phoneValue)) {
      setErrorText("Enter a valid phone number (10-15 digits).");
      return;
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem(CHECKOUT_EMAIL_STORAGE_KEY, emailValue);
      window.localStorage.setItem(CHECKOUT_PHONE_STORAGE_KEY, phoneValue);
    }

    setCheckoutLoading(true);
    setErrorText(null);
    trackEvent("sponsor_checkout_start", {
      source,
    });
    try {
      const response = await fetch("/api/ads/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          email: emailValue,
          phone: phoneValue,
        }),
      });

      const payload = (await response.json()) as CheckoutResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to start secure payment.");
      }

      if (payload.provider === "cashfree" && payload.paymentSessionId) {
        const factory = await loadCheckoutFactory();
        const instance = factory({ mode: payload.mode === "sandbox" ? "sandbox" : "production" });
        await instance.checkout({
          paymentSessionId: payload.paymentSessionId,
          redirectTarget: "_self",
        });
        return;
      }

      if (payload.url) {
        window.location.href = payload.url;
        return;
      }

      throw new Error(payload.error ?? "Unable to start secure payment.");
    } catch (error) {
      setErrorText(
        toPublicError((error as Error).message, "Unable to open secure payment right now.")
      );
      setCheckoutLoading(false);
    }
  };

  return (
    <AdRailsScaffold mainClassName="page page-home inner-rails-page">
      <TopNav context="inner" />
      <section className="advertise-success-page advertise-checkout-page">
        <section className="ad-onboarding-card ad-checkout-card">
          <header className="ad-onboarding-header">
            <p className="ad-onboarding-kicker">Sponsor placement</p>
            <h1>Promote Your Startup</h1>
            <p>Limited sponsor slots available.</p>
          </header>

          {status === "loading" ? <p className="ad-onboarding-state">Loading sponsor plan…</p> : null}

          {status === "ready" && plan ? (
            <>
              <div className="ad-plan-pill">
                <strong>{plan.displayAmount ?? "Monthly plan"}</strong>
                <span>/{plan.interval ?? "month"}</span>
              </div>
              <p className="ad-checkout-copy">
                Your card appears in both animated side rails. After payment, you can publish your logo,
                website, and tagline.
              </p>
              <div className="ad-purchase-inputs">
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    placeholder="founder@startup.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                  />
                </label>
                <label>
                  <span>Phone</span>
                  <input
                    type="tel"
                    placeholder="9876543210"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    autoComplete="tel"
                  />
                </label>
              </div>
              {plan.available === false ? (
                <p className="ad-purchase-error">
                  Secure payment is temporarily unavailable. Please try again shortly.
                </p>
              ) : (
                <button
                  type="button"
                  className="ad-purchase-cta"
                  onClick={() => void startCheckout()}
                  disabled={checkoutLoading}
                >
                  {checkoutLabel}
                </button>
              )}
            </>
          ) : null}

          {status === "error" || errorText ? <p className="ad-purchase-error">{errorText}</p> : null}

          <p className="ad-purchase-footnote">
            Checkout happens here on this secure page, not on the homepage.
          </p>
          <div className="ad-onboarding-actions">
            <Link href="/">Back to homepage</Link>
          </div>
        </section>
      </section>
      <SiteFooter />
    </AdRailsScaffold>
  );
}
