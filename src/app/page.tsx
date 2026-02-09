"use client";

import { useEffect, useState } from "react";
import AdColumn from "@/components/AdColumn";
import HomeCenterPanel from "@/components/HomeCenterPanel";
import { leftAdSlots, rightAdSlots, type AdSlot } from "@/data/ads";

type LiveAdsPayload = {
  left?: AdSlot[];
  right?: AdSlot[];
};

export default function Home() {
  const [leftSlots, setLeftSlots] = useState<AdSlot[]>(leftAdSlots);
  const [rightSlots, setRightSlots] = useState<AdSlot[]>(rightAdSlots);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/ads/live", { cache: "no-store" });
        if (!response.ok) return;

        const payload = (await response.json()) as LiveAdsPayload;
        if (cancelled) return;

        if (Array.isArray(payload.left) && payload.left.length) {
          setLeftSlots(payload.left);
        }
        if (Array.isArray(payload.right) && payload.right.length) {
          setRightSlots(payload.right);
        }
      } catch {
        // Silent fallback to static rails
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page page-home">
      <div className="layout-grid">
        <AdColumn slots={leftSlots} side="left" />
        <HomeCenterPanel />
        <AdColumn slots={rightSlots} side="right" />
      </div>
    </main>
  );
}
