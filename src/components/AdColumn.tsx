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

type AdColumnProps = {
  slots: AdSlot[];
  side?: "left" | "right";
  orientation?: "vertical" | "horizontal";
};

export default function AdColumn({ slots, side, orientation = "vertical" }: AdColumnProps) {
  const columnClass = `ad-column ad-rail ad-${orientation}${side ? ` ad-${side}` : ""}`;
  const staticMode = orientation === "horizontal";

  return (
    <aside className={columnClass}>
      {slots.map((slot, index) => (
        <div
          key={`${slot.front.name}-${slot.back.name}-${index}`}
          className="ad-slot"
          style={{ "--delay": `${index * 1.6}s` } as CSSProperties}
        >
          {staticMode ? (
            <div className="ad-static">
              <AdFace item={slot.front} />
            </div>
          ) : (
            <div className="ad-flip">
              <AdFace item={slot.front} />
              <AdFace item={slot.back} isBack />
            </div>
          )}
        </div>
      ))}
    </aside>
  );
}
