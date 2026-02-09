"use client";

import { useEffect, useMemo, useState } from "react";
import PitchShowCard, { type PitchShow } from "@/components/PitchShowCard";
import ExpandedPitchOverlay from "@/components/ExpandedPitchOverlay";
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
  const [weekPicks, setWeekPicks] = useState<PitchShow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activePitch, setActivePitch] = useState<PitchShow | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [expandedList, setExpandedList] = useState<PitchShow[]>([]);
  useEffect(() => {
    const load = async () => {
      try {
        const [weekRes, feedRes] = await Promise.all([
          fetch("/api/pitches?mode=week&limit=4&min_votes=10", { cache: "no-store" }),
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

        const weekList = weekData.map((item, index) => mapPitch(item, index)).slice(0, 4);
        const mapped = feedData.map((item, index) => mapPitch(item, index));
        const weekIds = new Set(weekList.map((item) => item.id));
        const filtered = mapped.filter((item) => !weekIds.has(item.id));

        setWeekPicks(weekList);
        setItems(filtered);
      } catch {
        setWeekPicks([]);
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
  const topPitches: PitchShow[] = [];
  const seen = new Set<string>();

  const pushUnique = (list: PitchShow[]) => {
    list.forEach((item) => {
      if (topPitches.length >= 4) return;
      if (seen.has(item.id)) return;
      seen.add(item.id);
      topPitches.push(item);
    });
  };

  pushUnique(weekPicks);
  pushUnique(baseFeed);
  if (topPitches.length < 4) {
    pushUnique(fallback);
  }

  const topIds = new Set(topPitches.map((item) => item.id));
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

  useEffect(() => {
    topPitches.forEach((pitch) => {
      if (!pitch.poster) return;
      const img = new Image();
      img.src = pitch.poster;
    });
  }, [topPitches]);

  useEffect(() => {
    const list = [...topPitches, ...rowPool, ...fallbackPool];
    setExpandedList(list);
  }, [topPitches, rowPool, fallbackPool]);

  const handleExpand = (pitch: PitchShow) => {
    const list = expandedList.length ? expandedList : [...topPitches, ...rowPool, ...fallbackPool];
    const idx = list.findIndex((p) => p.id === pitch.id);
    setExpandedList(list);
    setExpandedIndex(idx >= 0 ? idx : 0);
    setActivePitch(pitch);
  };

  const closeExpand = () => {
    setExpandedIndex(null);
    setActivePitch(null);
  };

  return (
    <section className="pitch-section">
      <div className="pitch-header">
        <div>
          <p className="pitch-kicker">Hot Pitches</p>
          <h3>Today’s top 4</h3>
          <p className="pitch-subtext">Featured by votes and freshness.</p>
        </div>
      </div>
      <div className={`pitch-mosaic hot-band${loaded ? " is-loaded" : ""}`}>
        <div className="pitch-top-grid hot-grid">
          {topPitches.map((pitch, idx) => (
            <PitchShowCard
              key={pitch.id}
              pitch={pitch}
              size="feature"
              variant="hot"
              onExpand={handleExpand}
            />
          ))}
        </div>
      </div>
      <div className="pitch-divider labeled">
        <span>More pitches</span>
        <p className="pitch-subtext">Fresh from the community.</p>
      </div>
      <div className={`pitch-mosaic more-band${loaded ? " is-loaded" : ""}`}>
        <div className="pitch-rows">
          <div className="pitch-row">
            {rowOne.map((pitch) => (
              <PitchShowCard key={pitch.id} pitch={pitch} size="row" variant="regular" onExpand={handleExpand} />
            ))}
          </div>
          <div className="pitch-row">
            {rowTwo.map((pitch) => (
              <PitchShowCard key={pitch.id} pitch={pitch} size="row" variant="regular" onExpand={handleExpand} />
            ))}
          </div>
        </div>
      </div>
      {activePitch && expandedIndex !== null && expandedList.length > 0 && (
        <ExpandedPitchOverlay
          pitches={expandedList}
          index={expandedIndex}
          setIndex={setExpandedIndex}
          onClose={closeExpand}
        />
      )}
    </section>
  );
}
