"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { AdItem, AdSlot } from "@/data/ads";
import { isCampaignItem } from "@/lib/ads";

const placeholderTonePalette = [
  "#4a1f24",
  "#2f2f33",
  "#493a24",
  "#4b242b",
  "#1d3b53",
] as const;

const compactPlaceholderTonePalette = [
  "#111111",
  "#18181a",
  "#232323",
  "#21255c",
  "#371866",
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

const placeholderCopy = (isBack: boolean, variant: "default" | "compact") => {
  if (variant === "compact") {
    return {
      badge: "SM",
      name: "Sponsor slot",
      tagline: "Advertise here",
    };
  }
  if (isBack) {
    return {
      badge: "AD",
      name: "Advertise",
      tagline: "Limited sponsor slots available.",
    };
  }
  return {
    badge: "SM",
    name: "StartupManch",
    tagline: "Promote Your Startup",
  };
};

type AdFaceCopyOverride = {
  badge: string;
  name: string;
  tagline: string;
};

const AdFaceContent = ({
  item,
  isBack = false,
  variant = "default",
  copyOverride,
}: {
  item: AdItem;
  isBack?: boolean;
  variant?: "default" | "compact";
  copyOverride?: AdFaceCopyOverride;
}) => {
  const campaign = isCampaignItem(item);
  const copy =
    copyOverride ??
    (campaign
      ? { badge: item.badge ?? "AD", name: item.name, tagline: item.tagline }
      : placeholderCopy(isBack, variant ?? "default"));

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
  copyOverride,
  extraClassName,
  variant = "default",
}: {
  item: AdItem;
  isBack?: boolean;
  side?: "left" | "right";
  suppressKeyboardFocus?: boolean;
  onAdvertiseClick: () => void;
  placeholderTone?: string;
  copyOverride?: AdFaceCopyOverride;
  extraClassName?: string;
  variant?: "default" | "compact";
}) => {
  const campaign = isCampaignItem(item);
  const className = `ad-face${isBack ? " back" : ""}${campaign ? "" : " advertise"}${
    extraClassName ? ` ${extraClassName}` : ""
  }`;

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
        <AdFaceContent item={item} isBack={isBack} variant={variant} copyOverride={copyOverride} />
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
        <AdFaceContent item={item} isBack={isBack} variant={variant} copyOverride={copyOverride} />
      </a>
    );
  }

  return (
    <div className={`${className} ad-face-static`} style={style}>
      <AdFaceContent item={item} isBack={isBack} variant={variant} copyOverride={copyOverride} />
    </div>
  );
};

export default function AdColumn({
  slots,
  side,
  activeFlipIndexes = [],
  variant = "default",
}: {
  slots: AdSlot[];
  side?: "left" | "right";
  activeFlipIndexes?: number[];
  variant?: "default" | "compact";
}) {
  const activeFlipSet = useMemo(() => new Set(activeFlipIndexes), [activeFlipIndexes]);
  const columnClass = `ad-column ad-rail${side ? ` ad-${side}` : ""}${variant === "compact" ? " is-compact" : ""}`;

  const handleAdvertiseClick = () => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    params.set("source", `rail_${side ?? "unknown"}`);
    window.location.href = `/advertise?${params.toString()}`;
  };

  const renderSlot = (slot: AdSlot, index: number, isClone = false) => {
    const isFlipped = variant === "default" && activeFlipSet.has(index);
    const toneOffset = side === "right" ? 2 : 0;
    const tonePalette = variant === "compact" ? compactPlaceholderTonePalette : placeholderTonePalette;
    const placeholderTone = tonePalette[(index + toneOffset) % tonePalette.length];
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
            variant={variant}
            suppressKeyboardFocus={isClone}
            onAdvertiseClick={handleAdvertiseClick}
            placeholderTone={placeholderTone}
          />
          {variant === "default" ? (
            <AdFace
              item={slot.back}
              isBack
              side={side}
              variant={variant}
              suppressKeyboardFocus={isClone}
              onAdvertiseClick={handleAdvertiseClick}
              placeholderTone={placeholderTone}
            />
          ) : null}
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
    </aside>
  );
}
