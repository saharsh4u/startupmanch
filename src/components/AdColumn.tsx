import type { CSSProperties } from "react";
import type { AdItem, AdSlot } from "@/data/ads";

const AdFace = ({ item, isBack }: { item: AdItem; isBack?: boolean }) => (
  <div
    className={`ad-face${isBack ? " back" : ""}${item.name === "Advertise" ? " advertise" : ""}`}
    style={{ "--ad-accent": item.accent } as CSSProperties}
  >
    <div className="ad-icon">{item.badge ?? "AD"}</div>
    <div>
      <h4>{item.name}</h4>
      <p>{item.tagline}</p>
    </div>
  </div>
);

export default function AdColumn({ slots, side }: { slots: AdSlot[]; side?: "left" | "right" }) {
  const columnClass = `ad-column ad-rail${side ? ` ad-${side}` : ""}`;
  const renderSlot = (slot: AdSlot, index: number, isClone = false) => (
    <div
      key={`${isClone ? "clone" : "slot"}-${index}-${slot.front.name}-${slot.back.name}`}
      className={`ad-slot${isClone ? " is-clone" : ""}`}
      style={{ "--delay": `${index * 1.6}s` } as CSSProperties}
      aria-hidden={isClone ? true : undefined}
    >
      <div className="ad-flip">
        <AdFace item={slot.front} />
        <AdFace item={slot.back} isBack />
      </div>
    </div>
  );

  return (
    <aside className={columnClass}>
      <div className="ad-track">
        {slots.map((slot, index) => renderSlot(slot, index))}
        {slots.map((slot, index) => renderSlot(slot, index, true))}
      </div>
    </aside>
  );
}
