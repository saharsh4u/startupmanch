"use client";

import { useEffect, useMemo, useState } from "react";

type AdPurchaseModalProps = {
  open: boolean;
  onClose: () => void;
};

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

export default function AdPurchaseModal({ open, onClose }: AdPurchaseModalProps) {
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const load = async () => {
      setStatus("loading");
      setErrorText(null);

      try {
        const response = await fetch("/api/ads/plan", { cache: "no-store" });
        const payload = (await response.json()) as PlanResponse;

        if (cancelled) return;

        if (!response.ok || payload.error) {
          throw new Error(payload.error ?? "Unable to load ad pricing.");
        }

        setPlan(payload);
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        setErrorText((error as Error).message || "Unable to load ad pricing.");
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const checkoutLabel = useMemo(() => {
    if (!plan?.displayAmount || !plan?.interval) {
      return "Continue to Cashfree";
    }
    return `Continue to Cashfree (${plan.displayAmount}/${plan.interval})`;
  }, [plan?.displayAmount, plan?.interval]);

  const startCheckout = async () => {
    const emailValue = email.trim().toLowerCase();
    const phoneValue = phone.replace(/\D+/g, "");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      setErrorText("Enter a valid email address.");
      return;
    }
    if (!/^[0-9]{10,15}$/.test(phoneValue)) {
      setErrorText("Enter a valid phone number.");
      return;
    }

    setCheckoutLoading(true);
    setErrorText(null);

    try {
      const response = await fetch("/api/ads/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "homepage_ad_placeholder",
          email: emailValue,
          phone: phoneValue,
        }),
      });

      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Unable to start checkout.");
      }

      window.location.href = payload.url;
    } catch (error) {
      setErrorText((error as Error).message || "Unable to start checkout.");
      setCheckoutLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="ad-purchase-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ad-purchase-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="ad-purchase-panel">
        <div className="ad-purchase-header">
          <div>
            <p className="ad-purchase-kicker">StartupManch Ads</p>
            <h3 id="ad-purchase-title">Put your startup in our animated rails</h3>
          </div>
          <button type="button" className="ad-purchase-close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="ad-purchase-body">
          {status === "loading" ? <p>Loading monthly plan…</p> : null}

          {status === "ready" && plan ? (
            <>
              <div className="ad-plan-pill">
                <strong>{plan.displayAmount ?? "Monthly plan"}</strong>
                <span>/{plan.interval ?? "month"}</span>
              </div>
              <p>
                Click-through sponsor card in both marquee rails. After payment, you will submit your
                company name, tagline, URL, color, support email, and logo.
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
                  {plan.message ?? "Ad checkout is temporarily unavailable."}
                </p>
              ) : (
                <button
                  type="button"
                  className="ad-purchase-cta"
                  onClick={startCheckout}
                  disabled={checkoutLoading}
                >
                  {checkoutLoading ? "Redirecting…" : checkoutLabel}
                </button>
              )}
            </>
          ) : null}

          {status === "error" || errorText ? <p className="ad-purchase-error">{errorText}</p> : null}

          <p className="ad-purchase-footnote">
            Payment is handled by Cashfree. Campaign goes live right after detail submission.
          </p>
        </div>
      </div>
    </div>
  );
}
