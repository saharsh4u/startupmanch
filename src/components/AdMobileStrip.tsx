"use client";

import { useMemo, type CSSProperties } from "react";
import type { AdItem, AdSlot } from "@/data/ads";
import { isCampaignItem } from "@/lib/ads";

type AdMobileStripProps = {
  slots: AdSlot[];
  side: "left" | "right";
  position: "top" | "bottom";
};

type MobileStripItem = {
  item: AdItem;
  face: "front" | "back";
  key: string;
};

const sameFace = (slot: AdSlot) =>
  slot.front.name === slot.back.name &&
  slot.front.tagline === slot.back.tagline &&
  slot.front.accent === slot.back.accent &&
  slot.front.badge === slot.back.badge;

const faceClickHref = (item: AdItem, side: "left" | "right", face: "front" | "back") => {
  if (isCampaignItem(item) && item.campaignId) {
    const params = new URLSearchParams({
      campaign_id: item.campaignId,
      side,
      face,
    });
    return `/api/ads/click?${params.toString()}`;
  }

  if (typeof item.href === "string" && item.href.trim().length) {
    return item.href;
  }

  return null;
};

const toStripItems = (slots: AdSlot[]) => {
  const items: MobileStripItem[] = [];

  for (const [index, slot] of slots.entries()) {
    items.push({
      item: slot.front,
      face: "front",
      key: `front-${index}-${slot.front.name}-${slot.front.badge ?? "none"}`,
    });

    if (sameFace(slot)) continue;

    items.push({
      item: slot.back,
      face: "back",
      key: `back-${index}-${slot.back.name}-${slot.back.badge ?? "none"}`,
    });
  }

  return items;
};

const badgeLabel = (item: AdItem) => {
  const value = (item.badge ?? "").trim();
  if (value) return value.slice(0, 10);
  return item.name.toLowerCase() === "advertise" ? "AD" : "SM";
};

export default function AdMobileStrip({ slots, side, position }: AdMobileStripProps) {
  const items = useMemo(() => toStripItems(slots), [slots]);

  if (!items.length) return null;

  const handleAdvertiseClick = () => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams({
      source: `mobile_strip_${position}_${side}`,
    });
    window.location.href = `/advertise?${params.toString()}`;
  };

  const renderChip = (entry: MobileStripItem, segment: "primary" | "clone") => {
    const href = faceClickHref(entry.item, side, entry.face);
    const className = `mobile-ad-chip${isCampaignItem(entry.item) ? "" : " is-placeholder"}`;
    const isClone = segment === "clone";
    const style = {
      "--mobile-ad-accent": entry.item.accent,
    } as CSSProperties;

    const content = (
      <>
        <span className="mobile-ad-chip-badge" aria-hidden>
          {badgeLabel(entry.item)}
        </span>
        <span className="mobile-ad-chip-label">{entry.item.name}</span>
      </>
    );

    if (href) {
      return (
        <a
          key={`${segment}-${entry.key}`}
          href={href}
          className={className}
          style={style}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Visit ${entry.item.name}`}
          tabIndex={isClone ? -1 : undefined}
        >
          {content}
        </a>
      );
    }

    return (
      <button
        key={`${segment}-${entry.key}`}
        type="button"
        className={className}
        style={style}
        onClick={handleAdvertiseClick}
        aria-label={
          entry.item.name.toLowerCase() === "advertise"
            ? "Advertise on StartupManch"
            : `${entry.item.name} sponsor placeholder`
        }
        tabIndex={isClone ? -1 : undefined}
      >
        {content}
      </button>
    );
  };

  return (
    <section
      className={`mobile-ad-strip-shell is-${position}`}
      aria-label={`${position === "top" ? "Top" : "Bottom"} sponsor strip`}
    >
      <div className={`mobile-ad-strip is-${position}`}>
        <div className="mobile-ad-strip-track">
          <div className="mobile-ad-strip-segment">{items.map((entry) => renderChip(entry, "primary"))}</div>
          <div className="mobile-ad-strip-segment is-clone" aria-hidden>
            {items.map((entry) => renderChip(entry, "clone"))}
          </div>
        </div>
      </div>
    </section>
  );
}
