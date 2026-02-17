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

const placeholderCopy = (isBack: boolean) => {
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

const AdFaceContent = ({ item, isBack = false }: { item: AdItem; isBack?: boolean }) => {
  const campaign = isCampaignItem(item);
  const copy = campaign
    ? { badge: item.badge ?? "AD", name: item.name, tagline: item.tagline }
    : placeholderCopy(isBack);

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
  const activeFlipSet = useMemo(() => new Set(activeFlipIndexes), [activeFlipIndexes]);
  const columnClass = `ad-column ad-rail${side ? ` ad-${side}` : ""}`;

  const handleAdvertiseClick = () => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    params.set("source", `rail_${side ?? "unknown"}`);
    window.location.href = `/advertise?${params.toString()}`;
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
            onAdvertiseClick={handleAdvertiseClick}
            placeholderTone={placeholderTone}
          />
          <AdFace
            item={slot.back}
            isBack
            side={side}
            suppressKeyboardFocus={isClone}
            onAdvertiseClick={handleAdvertiseClick}
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
    </aside>
  );
}
