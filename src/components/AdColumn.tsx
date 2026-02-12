"use client";

import type { CSSProperties, TouchEvent } from "react";
import { useMemo, useState } from "react";
import AdPurchaseModal from "@/components/AdPurchaseModal";
import type { AdItem, AdSlot } from "@/data/ads";
import { isAdvertiseItem, isCampaignItem } from "@/lib/ads";

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

const AdFaceContent = ({ item }: { item: AdItem }) => (
  <>
    <div className="ad-icon">{item.badge ?? "AD"}</div>
    <div>
      <h4>{item.name}</h4>
      <p>{item.tagline}</p>
    </div>
  </>
);

const AdFace = ({
  item,
  isBack,
  side,
  suppressKeyboardFocus,
  onAdvertiseClick,
}: {
  item: AdItem;
  isBack?: boolean;
  side?: "left" | "right";
  suppressKeyboardFocus?: boolean;
  onAdvertiseClick: () => void;
}) => {
  const className = `ad-face${isBack ? " back" : ""}${
    isAdvertiseItem(item) ? " advertise" : ""
  }`;

  const style = { "--ad-accent": item.accent } as CSSProperties;

  if (isAdvertiseItem(item)) {
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
        <AdFaceContent item={item} />
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
        <AdFaceContent item={item} />
      </a>
    );
  }

  return (
    <div className={`${className} ad-face-static`} style={style}>
      <AdFaceContent item={item} />
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
  const [modalOpen, setModalOpen] = useState(false);
  const activeFlipSet = useMemo(() => new Set(activeFlipIndexes), [activeFlipIndexes]);
  const columnClass = `ad-column ad-rail${side ? ` ad-${side}` : ""}`;

  const renderSlot = (slot: AdSlot, index: number, isClone = false) => {
    const isFlipped = activeFlipSet.has(index);

    return (
      <div
        key={`${isClone ? "clone" : "slot"}-${side ?? "rail"}-${index}-${slot.front.name}-${slot.back.name}`}
        className={`ad-slot${isClone ? " is-clone" : ""}`}
        data-side={side ?? "rail"}
        data-slot-index={index}
        aria-hidden={isClone ? true : undefined}
      >
        <div className={`ad-flip${isFlipped ? " is-flipped" : ""}`}>
          <AdFace
            item={slot.front}
            side={side}
            suppressKeyboardFocus={isClone}
            onAdvertiseClick={() => setModalOpen(true)}
          />
          <AdFace
            item={slot.back}
            isBack
            side={side}
            suppressKeyboardFocus={isClone}
            onAdvertiseClick={() => setModalOpen(true)}
          />
        </div>
      </div>
    );
  };

  return (
    <>
      <aside className={columnClass}>
        <div className="ad-track">
          {slots.map((slot, index) => renderSlot(slot, index))}
          {slots.map((slot, index) => renderSlot(slot, index, true))}
        </div>
      </aside>
      <AdPurchaseModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
