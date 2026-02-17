"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { AdItem, AdSlot } from "@/data/ads";
import { isCampaignItem } from "@/lib/ads";

type CashfreeMode = "sandbox" | "production";

type CheckoutResponse = {
  provider?: "cashfree";
  mode?: CashfreeMode;
  url?: string;
  paymentSessionId?: string;
  error?: string;
};

type CashfreeCheckoutInstance = {
  checkout: (options: {
    paymentSessionId: string;
    redirectTarget?: "_self" | "_blank";
  }) => Promise<unknown> | unknown;
};

type CashfreeFactory = (options: { mode: CashfreeMode }) => CashfreeCheckoutInstance;

type CashfreeWindow = Window & {
  Cashfree?: CashfreeFactory;
};

const CASHFREE_SDK_URL = "https://sdk.cashfree.com/js/v3/cashfree.js";
const CHECKOUT_PHONE_STORAGE_KEY = "startupmanch_ad_checkout_phone";

const loadCashfreeFactory = async () => {
  if (typeof window === "undefined") {
    throw new Error("Cashfree checkout is only available in the browser.");
  }

  const cashfreeWindow = window as CashfreeWindow;
  if (cashfreeWindow.Cashfree) {
    return cashfreeWindow.Cashfree;
  }

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${CASHFREE_SDK_URL}"]`);
    if (existing) {
      let attempts = 0;
      const waitForSdk = () => {
        if ((window as CashfreeWindow).Cashfree) {
          resolve();
        } else if (attempts > 120) {
          reject(new Error("Cashfree checkout SDK did not initialize."));
        } else {
          attempts += 1;
          setTimeout(waitForSdk, 50);
        }
      };
      waitForSdk();
      return;
    }

    const script = document.createElement("script");
    script.src = CASHFREE_SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load Cashfree checkout SDK."));
    document.head.appendChild(script);
  });

  if (!cashfreeWindow.Cashfree) {
    throw new Error("Cashfree checkout SDK is unavailable.");
  }

  return cashfreeWindow.Cashfree;
};

const buildQuickCheckoutContact = () => {
  const now = Date.now();
  return {
    email: `ads+${now}@startupmanch.com`,
  };
};

const normalizePhone = (value: string) => value.replace(/\D+/g, "");

const placeholderTonePalette = [
  "#4a1f24",
  "#2f2f33",
  "#493a24",
  "#4b242b",
  "#1d3b53",
] as const;

const faceClickHref = (item: AdItem, side: "left" | "right" | undefined, face: "front" | "back") => {
  if (isCampaignItem(item) && item.campaignId) {
    const params = new URLSearchParams({
      campaign_id: item.campaignId,
      side: side ?? "rail",
      face,
    });
    return `/api/ads/click?${params.toString()}`;
  }

  if (typeof item.href === "string" && item.href.trim().length) {
    return item.href;
  }

  return null;
};

const placeholderCopy = (isBack: boolean, item: AdItem) => {
  const hasSpotsText = /spots left/i.test(item.tagline);
  if (isBack) {
    return {
      badge: "AD",
      name: "Advertise",
      tagline: hasSpotsText ? item.tagline : "Click to start Cashfree checkout",
    };
  }
  return {
    badge: "SM",
    name: "StartupManch",
    tagline: "Click to advertise on StartupManch",
  };
};

const AdFaceContent = ({ item, isBack = false }: { item: AdItem; isBack?: boolean }) => {
  const campaign = isCampaignItem(item);
  const copy = campaign
    ? { badge: item.badge ?? "AD", name: item.name, tagline: item.tagline }
    : placeholderCopy(isBack, item);

  return (
    <>
      <div className="ad-icon">{copy.badge}</div>
      <div>
        <h4>{copy.name}</h4>
        <p>{copy.tagline}</p>
      </div>
    </>
  );
};

const AdFace = ({
  item,
  isBack,
  side,
  suppressKeyboardFocus,
  onAdvertiseClick,
  placeholderTone,
}: {
  item: AdItem;
  isBack?: boolean;
  side?: "left" | "right";
  suppressKeyboardFocus?: boolean;
  onAdvertiseClick: () => void;
  placeholderTone?: string;
}) => {
  const campaign = isCampaignItem(item);
  const className = `ad-face${isBack ? " back" : ""}${campaign ? "" : " advertise"}`;

  const style = {
    "--ad-accent": item.accent,
    ...(placeholderTone ? { "--ad-placeholder-tone": placeholderTone } : {}),
  } as CSSProperties;

  if (!campaign) {
    return (
      <button
        type="button"
        className={`${className} ad-face-button`}
        style={style}
        onClick={onAdvertiseClick}
        onTouchEnd={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onAdvertiseClick();
        }}
        aria-label="Advertise on StartupManch"
        tabIndex={suppressKeyboardFocus ? -1 : undefined}
      >
        <AdFaceContent item={item} isBack={isBack} />
      </button>
    );
  }

  const face = isBack ? "back" : "front";
  const href = faceClickHref(item, side, face);

  if (href) {
    return (
      <a
        href={href}
        className={`${className} ad-face-link`}
        style={style}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Visit ${item.name}`}
        tabIndex={suppressKeyboardFocus ? -1 : undefined}
      >
        <AdFaceContent item={item} isBack={isBack} />
      </a>
    );
  }

  return (
    <div className={`${className} ad-face-static`} style={style}>
      <AdFaceContent item={item} isBack={isBack} />
    </div>
  );
};

export default function AdColumn({
  slots,
  side,
  activeFlipIndexes = [],
}: {
  slots: AdSlot[];
  side?: "left" | "right";
  activeFlipIndexes?: number[];
}) {
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const activeFlipSet = useMemo(() => new Set(activeFlipIndexes), [activeFlipIndexes]);
  const columnClass = `ad-column ad-rail${side ? ` ad-${side}` : ""}`;

  const handleAdvertiseCheckout = async () => {
    if (checkoutLoading) return;

    const previousPhone =
      typeof window !== "undefined"
        ? window.localStorage.getItem(CHECKOUT_PHONE_STORAGE_KEY) ?? ""
        : "";
    const enteredPhone =
      typeof window !== "undefined"
        ? window.prompt("Enter your phone number for payment (10-15 digits):", previousPhone)
        : null;
    if (enteredPhone === null) return;

    const phone = normalizePhone(enteredPhone);
    if (!/^[0-9]{10,15}$/.test(phone)) {
      setCheckoutError("Enter a valid phone number (10-15 digits).");
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CHECKOUT_PHONE_STORAGE_KEY, phone);
    }

    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      const contact = buildQuickCheckoutContact();
      const response = await fetch("/api/ads/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: contact.email,
          phone,
          source: `rail_${side ?? "unknown"}`,
        }),
      });

      const payload = (await response.json()) as CheckoutResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to start checkout.");
      }

      if (payload.provider === "cashfree" && payload.paymentSessionId) {
        const factory = await loadCashfreeFactory();
        const instance = factory({
          mode: payload.mode === "sandbox" ? "sandbox" : "production",
        });
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

      throw new Error(payload.error ?? "Unable to start checkout.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to open Cashfree checkout right now.";
      setCheckoutError(message);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const renderSlot = (slot: AdSlot, index: number, isClone = false) => {
    const isFlipped = activeFlipSet.has(index);
    const toneOffset = side === "right" ? 2 : 0;
    const placeholderTone =
      placeholderTonePalette[(index + toneOffset) % placeholderTonePalette.length];
    const isPlaceholderSlot = !isCampaignItem(slot.front) && !isCampaignItem(slot.back);

    return (
      <div
        key={`${isClone ? "clone" : "slot"}-${side ?? "rail"}-${index}-${slot.front.name}-${slot.back.name}`}
        className={`ad-slot${isClone ? " is-clone" : ""}${isPlaceholderSlot ? " is-placeholder" : ""}`}
        data-side={side ?? "rail"}
        data-slot-index={index}
        aria-hidden={isClone ? true : undefined}
      >
        <div className={`ad-flip${isFlipped ? " is-flipped" : ""}`}>
          <AdFace
            item={slot.front}
            side={side}
            suppressKeyboardFocus={isClone}
            onAdvertiseClick={() => void handleAdvertiseCheckout()}
            placeholderTone={placeholderTone}
          />
          <AdFace
            item={slot.back}
            isBack
            side={side}
            suppressKeyboardFocus={isClone}
            onAdvertiseClick={() => void handleAdvertiseCheckout()}
            placeholderTone={placeholderTone}
          />
        </div>
      </div>
    );
  };

  return (
    <aside className={columnClass}>
      <div className="ad-track">
        {slots.map((slot, index) => renderSlot(slot, index))}
        {slots.map((slot, index) => renderSlot(slot, index, true))}
      </div>
      {checkoutLoading ? <p className="ad-rail-status">Opening Cashfree checkout...</p> : null}
      {checkoutError ? <p className="ad-rail-status error">{checkoutError}</p> : null}
    </aside>
  );
}
