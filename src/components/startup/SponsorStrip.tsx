"use client";

import { useEffect, useMemo, useState } from "react";
import { isAdvertiseItem } from "@/lib/ads";
import type { AdItem, AdSlot } from "@/data/ads";

type SponsorStripProps = {
  title?: string;
};

type LiveAdsPayload = {
  left?: AdSlot[];
  right?: AdSlot[];
};

export default function SponsorStrip({ title = "Sponsored" }: SponsorStripProps) {
  const [slots, setSlots] = useState<AdSlot[]>([]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch("/api/ads/live", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as LiveAdsPayload;
        if (!active) return;

        const combined = [...(payload.left ?? []), ...(payload.right ?? [])];
        setSlots(combined);
      } catch {
        // Keep sponsor strip empty on fetch errors.
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const sponsorItems = useMemo(() => {
    const faces: AdItem[] = [];
    for (const slot of slots) {
      if (!isAdvertiseItem(slot.front)) faces.push(slot.front);
      if (!isAdvertiseItem(slot.back)) faces.push(slot.back);
    }

    const seen = new Set<string>();
    const deduped: AdItem[] = [];
    for (const item of faces) {
      const key = `${item.name}::${item.tagline}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
      if (deduped.length >= 6) break;
    }

    return deduped;
  }, [slots]);

  if (!sponsorItems.length) return null;

  return (
    <section className="startup-sponsor-strip" aria-label="Sponsor strip">
      <p className="startup-sponsor-kicker">{title}</p>
      <div className="startup-sponsor-list">
        {sponsorItems.map((item) => (
          <article key={`${item.name}-${item.tagline}`} className="startup-sponsor-card">
            <p className="startup-sponsor-badge" style={{ borderColor: item.accent }}>
              {item.badge ?? "AD"}
            </p>
            <h4>{item.name}</h4>
            <p>{item.tagline}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
