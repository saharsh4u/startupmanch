"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import AdColumn from "@/components/AdColumn";
import { leftAdSlots, rightAdSlots, type AdSlot } from "@/data/ads";
import { isAdvertiseItem } from "@/lib/ads";

type LiveAdsPayload = {
  left?: AdSlot[];
  right?: AdSlot[];
};

type FlipPair = {
  left: number;
  right: number;
};

type AdRailsScaffoldProps = {
  children: ReactNode;
  mainClassName?: string;
  centerClassName?: string;
};

const FLIP_ACTIVE_MS = 1050;
const FLIP_INTERVAL_MS = 2800;

const sameFace = (slot: AdSlot) =>
  slot.front.name === slot.back.name &&
  slot.front.tagline === slot.back.tagline &&
  slot.front.accent === slot.back.accent &&
  slot.front.badge === slot.back.badge;

const getFlippableIndexes = (slots: AdSlot[]) =>
  slots.flatMap((slot, index) => {
    if (isAdvertiseItem(slot.front) && isAdvertiseItem(slot.back)) return [];
    if (sameFace(slot)) return [];
    return [index];
  });

const pickRandomPair = (
  leftIndexes: number[],
  rightIndexes: number[],
  previousPair: FlipPair | null
) => {
  const preferredPairs: FlipPair[] = [];
  for (const left of leftIndexes) {
    for (const right of rightIndexes) {
      if (left === right) continue;
      if (Math.abs(left - right) <= 1) continue;
      preferredPairs.push({ left, right });
    }
  }

  const fallbackPairs =
    preferredPairs.length > 0
      ? preferredPairs
      : leftIndexes.flatMap((left) =>
          rightIndexes.flatMap((right) => (left === right ? [] : [{ left, right }]))
        );

  const pool =
    previousPair && fallbackPairs.length > 1
      ? fallbackPairs.filter(
          (pair) => !(pair.left === previousPair.left && pair.right === previousPair.right)
        )
      : fallbackPairs;

  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
};

export default function AdRailsScaffold({
  children,
  mainClassName = "page page-home inner-rails-page",
  centerClassName = "center-panel",
}: AdRailsScaffoldProps) {
  const [leftSlots, setLeftSlots] = useState<AdSlot[]>(leftAdSlots);
  const [rightSlots, setRightSlots] = useState<AdSlot[]>(rightAdSlots);
  const [activeFlipPair, setActiveFlipPair] = useState<FlipPair | null>(null);

  const leftFlippableIndexes = useMemo(() => getFlippableIndexes(leftSlots), [leftSlots]);
  const rightFlippableIndexes = useMemo(() => getFlippableIndexes(rightSlots), [rightSlots]);

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
        // Silent fallback to static rails.
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setActiveFlipPair(null);
      return;
    }
    if (!leftFlippableIndexes.length || !rightFlippableIndexes.length) {
      setActiveFlipPair(null);
      return;
    }

    let previousPair: FlipPair | null = null;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;

    const selectPair = () => {
      const nextPair = pickRandomPair(leftFlippableIndexes, rightFlippableIndexes, previousPair);
      if (!nextPair) return;
      previousPair = nextPair;
      setActiveFlipPair(nextPair);
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        setActiveFlipPair(null);
      }, FLIP_ACTIVE_MS);
    };

    selectPair();
    const interval = setInterval(selectPair, FLIP_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      if (resetTimer) clearTimeout(resetTimer);
      setActiveFlipPair(null);
    };
  }, [leftFlippableIndexes, rightFlippableIndexes]);

  return (
    <main className={mainClassName}>
      <div className="layout-grid">
        <AdColumn
          slots={leftSlots}
          side="left"
          activeFlipIndexes={activeFlipPair ? [activeFlipPair.left] : []}
        />
        <div className={centerClassName}>{children}</div>
        <AdColumn
          slots={rightSlots}
          side="right"
          activeFlipIndexes={activeFlipPair ? [activeFlipPair.right] : []}
        />
      </div>
    </main>
  );
}
