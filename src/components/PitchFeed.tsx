"use client";

import { useEffect, useMemo, useState } from "react";
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

  const topIds = new Set([primary?.id, secondary?.id].filter(Boolean));
  const rowPool = baseFeed.filter((item) => !topIds.has(item.id));
  const fallbackPool = fallback.filter((item) => !topIds.has(item.id));
  const sourcePool = rowPool.length ? rowPool : fallbackPool;
  const fillPool: PitchShow[] = [];
  let cursor = 0;
  while (fillPool.length < 10 && sourcePool.length) {
    fillPool.push(sourcePool[cursor % sourcePool.length]);
    cursor += 1;
  }
  const rowOne = fillPool.slice(0, 5);
  const rowTwo = fillPool.slice(5, 10);

  return (
    <section className="pitch-section">
      <div className="pitch-header">
        <h3>Hot video pitches</h3>
      </div>
      <div className={`pitch-mosaic${loaded ? " is-loaded" : ""}`}>
        <div className="pitch-top-grid">
          {primary ? <PitchShowCard pitch={primary} size="feature" /> : null}
          {secondary ? <PitchShowCard pitch={secondary} size="feature" /> : null}
        </div>
        <div className="pitch-rows">
          <div className="pitch-row">
            {rowOne.map((pitch) => (
              <PitchShowCard key={pitch.id} pitch={pitch} size="row" />
            ))}
          </div>
          <div className="pitch-row">
            {rowTwo.map((pitch) => (
              <PitchShowCard key={pitch.id} pitch={pitch} size="row" />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
