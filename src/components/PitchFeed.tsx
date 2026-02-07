"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PitchShowCard, { type PitchShow } from "@/components/PitchShowCard";
import { pitches as fallbackPitches } from "@/data/pitches";

type ApiPitch = {
  pitch_id: string;
  startup_name: string;
  one_liner: string | null;
  category: string | null;
  poster_url: string | null;
  video_url?: string | null;
};

export default function PitchFeed() {
  const [items, setItems] = useState<PitchShow[]>([]);
  const [weekPick, setWeekPick] = useState<PitchShow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const rowOneRef = useRef<HTMLDivElement | null>(null);
  const rowTwoRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [weekRes, feedRes] = await Promise.all([
          fetch("/api/pitches?mode=week&limit=1&min_votes=10", { cache: "no-store" }),
          fetch("/api/pitches?mode=feed&tab=trending&limit=20", { cache: "no-store" }),
        ]);

        if (!weekRes.ok && !feedRes.ok) throw new Error("Failed to load");

        const weekPayload = weekRes.ok ? await weekRes.json() : null;
        const feedPayload = feedRes.ok ? await feedRes.json() : null;

        const weekData = (weekPayload?.data ?? []) as ApiPitch[];
        const feedData = (feedPayload?.data ?? []) as ApiPitch[];

        const mapPitch = (item: ApiPitch, index: number): PitchShow => ({
          id: item.pitch_id ?? `pitch-${index}`,
          name: item.startup_name ?? "Startup",
          tagline: item.one_liner ?? item.category ?? "New pitch",
          poster: item.poster_url ?? `/pitches/pitch-0${(index % 3) + 1}.svg`,
          video: item.video_url ?? null,
        });

        const week = weekData[0] ? mapPitch(weekData[0], 0) : null;
        const mapped = feedData.map((item, index) => mapPitch(item, index));
        const filtered = week ? mapped.filter((item) => item.id !== week.id) : mapped;

        setWeekPick(week);
        setItems(filtered);
      } catch {
        setWeekPick(null);
        setItems([]);
      } finally {
        setLoaded(true);
      }
    };
    load();
  }, []);

  const fallback = useMemo(
    () =>
      fallbackPitches.map((pitch) => ({
        id: pitch.id,
        name: pitch.name,
        tagline: pitch.tagline,
        poster: pitch.poster,
        video: null,
      })),
    []
  );

  const baseFeed = items.length ? items : fallback;
  const primary = weekPick ?? baseFeed[0] ?? fallback[0];
  const secondaryPool = baseFeed.filter((item) => item.id !== primary?.id);
  const secondary = secondaryPool[0] ?? fallback.find((item) => item.id !== primary?.id) ?? null;
  const featureCards = [primary, secondary].filter(Boolean) as PitchShow[];

  const featureIds = new Set(featureCards.map((item) => item.id));
  const rowSeed = baseFeed.filter((item) => !featureIds.has(item.id));
  const rowExpanded =
    rowSeed.length >= 20
      ? rowSeed
      : [
          ...rowSeed,
          ...Array.from({ length: Math.max(0, 20 - rowSeed.length) }).map(
            (_, index) => fallback[index % fallback.length]
          ),
        ];
  const rowOne = rowExpanded.slice(0, 10);
  const rowTwo = rowExpanded.slice(10, 20);

  const scrollRow = (ref: { current: HTMLDivElement | null }, direction: "left" | "right") => {
    if (!ref.current) return;
    const amount = direction === "left" ? -320 : 320;
    ref.current.scrollBy({ left: amount, behavior: "smooth" });
  };

  return (
    <section className="pitch-section">
      <div className="pitch-header">
        <h3>Pitch of the Week</h3>
      </div>
      <div className={`pitch-week${loaded ? " is-loaded" : ""}`}>
        {featureCards.map((pitch) => (
          <PitchShowCard key={pitch.id} pitch={pitch} size="feature" />
        ))}
      </div>
      <div className="pitch-rows">
        <div className="pitch-row">
          <button type="button" className="row-arrow left" onClick={() => scrollRow(rowOneRef, "left")}>
            ‹
          </button>
          <div className="pitch-row-track" ref={rowOneRef}>
            {rowOne.map((pitch) => (
              <PitchShowCard key={pitch.id} pitch={pitch} size="row" />
            ))}
          </div>
          <button type="button" className="row-arrow right" onClick={() => scrollRow(rowOneRef, "right")}>
            ›
          </button>
        </div>
        <div className="pitch-row">
          <button type="button" className="row-arrow left" onClick={() => scrollRow(rowTwoRef, "left")}>
            ‹
          </button>
          <div className="pitch-row-track" ref={rowTwoRef}>
            {rowTwo.map((pitch) => (
              <PitchShowCard key={pitch.id} pitch={pitch} size="row" />
            ))}
          </div>
          <button type="button" className="row-arrow right" onClick={() => scrollRow(rowTwoRef, "right")}>
            ›
          </button>
        </div>
      </div>
    </section>
  );
}
