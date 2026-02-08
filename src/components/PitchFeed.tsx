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
  const tertiary =
    secondaryPool[1] ??
    fallback.find((item) => item.id !== primary?.id && item.id !== secondary?.id) ??
    null;

  return (
    <section className="pitch-section">
      <div className="pitch-header">
        <h3>Hot video pitches</h3>
      </div>
      <div className={`pitch-mosaic${loaded ? " is-loaded" : ""}`}>
        {primary ? <PitchShowCard pitch={primary} size="wide" /> : null}
        {secondary ? <PitchShowCard pitch={secondary} size="mini" /> : null}
        {tertiary ? <PitchShowCard pitch={tertiary} size="mini" /> : null}
      </div>
    </section>
  );
}
