"use client";

import { useEffect, useMemo, useState } from "react";
import ExpandedPitchOverlay from "@/components/ExpandedPitchOverlay";
import PitchShowCard, { type PitchShow } from "@/components/PitchShowCard";
import { pitches as fallbackPitches } from "@/data/pitches";

type ApiPitch = {
  pitch_id: string;
  startup_name: string;
  one_liner: string | null;
  category: string | null;
  monthly_revenue?: string | null;
  poster_url: string | null;
  in_count?: number;
  out_count?: number;
  comment_count?: number;
  score?: number;
  video_url?: string | null;
};

type FeedPitch = PitchShow & {
  category: string | null;
};

type PitchFeedProps = {
  selectedCategory?: string | null;
};

const normalizeCategory = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
const asNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const matchesCategory = (item: FeedPitch, selectedCategory: string | null | undefined) => {
  if (!selectedCategory) return true;
  const selected = normalizeCategory(selectedCategory);
  if (!selected.length) return true;
  return normalizeCategory(item.category).includes(selected);
};

export default function PitchFeed({ selectedCategory = null }: PitchFeedProps) {
  const [items, setItems] = useState<FeedPitch[]>([]);
  const [weekPicks, setWeekPicks] = useState<FeedPitch[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [overlayPitches, setOverlayPitches] = useState<FeedPitch[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

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

        const mapPitch = (item: ApiPitch, index: number): FeedPitch => ({
          id: item.pitch_id ?? `pitch-${index}`,
          name: item.startup_name ?? "Startup",
          tagline: item.one_liner ?? item.category ?? "New pitch",
          poster: item.poster_url ?? `/pitches/pitch-0${(index % 3) + 1}.svg`,
          video: item.video_url ?? null,
          category: item.category ?? null,
          upvotes: asNumber(item.in_count),
          downvotes: asNumber(item.out_count),
          comments: asNumber(item.comment_count),
          score: asNumber(item.score),
          monthlyRevenue: (item.monthly_revenue ?? "").trim() || null,
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

  const fallback = useMemo<FeedPitch[]>(
    () =>
      fallbackPitches.map((pitch) => ({
        id: pitch.id,
        name: pitch.name,
        tagline: pitch.tagline,
        poster: pitch.poster,
        video: null,
        category: pitch.category ?? null,
        upvotes: 0,
        downvotes: 0,
        comments: 0,
        score: 0,
        monthlyRevenue: null,
      })),
    []
  );

  const filteredWeekPicks = useMemo(
    () => weekPicks.filter((item) => matchesCategory(item, selectedCategory)),
    [weekPicks, selectedCategory]
  );

  const filteredItems = useMemo(
    () => items.filter((item) => matchesCategory(item, selectedCategory)),
    [items, selectedCategory]
  );

  const filteredFallback = useMemo(
    () => fallback.filter((item) => matchesCategory(item, selectedCategory)),
    [fallback, selectedCategory]
  );

  const baseFeed = useMemo(
    () => (filteredItems.length ? filteredItems : filteredFallback),
    [filteredItems, filteredFallback]
  );

  const topPitches = useMemo(() => {
    const top: FeedPitch[] = [];
    const seen = new Set<string>();

    const pushUnique = (list: FeedPitch[]) => {
      list.forEach((item) => {
        if (top.length >= 4) return;
        if (seen.has(item.id)) return;
        seen.add(item.id);
        top.push(item);
      });
    };

    pushUnique(filteredWeekPicks);
    pushUnique(baseFeed);

    if (top.length < 4) {
      pushUnique(filteredFallback);
    }

    return top;
  }, [filteredWeekPicks, baseFeed, filteredFallback]);

  const topIds = useMemo(() => new Set(topPitches.map((item) => item.id)), [topPitches]);

  const rowPool = useMemo(() => baseFeed.filter((item) => !topIds.has(item.id)), [baseFeed, topIds]);

  const fallbackPool = useMemo(
    () => filteredFallback.filter((item) => !topIds.has(item.id)),
    [filteredFallback, topIds]
  );

  const sourcePool = rowPool.length ? rowPool : fallbackPool;

  const fillPool = useMemo(() => {
    const filled: FeedPitch[] = [];
    let cursor = 0;

    while (filled.length < 10 && sourcePool.length) {
      filled.push(sourcePool[cursor % sourcePool.length]);
      cursor += 1;
    }

    return filled;
  }, [sourcePool]);

  const rowOne = useMemo(() => fillPool.slice(0, 5), [fillPool]);
  const rowTwo = useMemo(() => fillPool.slice(5, 10), [fillPool]);

  const expandedList = useMemo(() => [...topPitches, ...rowPool, ...fallbackPool], [topPitches, rowPool, fallbackPool]);

  const hasVisiblePitches = topPitches.length > 0 || rowOne.length > 0 || rowTwo.length > 0;

  useEffect(() => {
    topPitches.forEach((pitch) => {
      if (!pitch.poster) return;
      const img = new Image();
      img.src = pitch.poster;
    });
  }, [topPitches]);

  const handleExpand = (pitch: PitchShow) => {
    const snapshot = [...expandedList];
    const idx = snapshot.findIndex((item) => item.id === pitch.id);
    if (idx < 0) return;
    setOverlayPitches(snapshot);
    setExpandedIndex(idx);
  };

  const closeExpand = () => {
    setExpandedIndex(null);
    setOverlayPitches([]);
  };

  const setOverlayIndex = (next: number) => {
    if (!overlayPitches.length) {
      closeExpand();
      return;
    }

    const bounded = Math.max(0, Math.min(next, overlayPitches.length - 1));
    setExpandedIndex(bounded);
  };

  const overlayOpen =
    expandedIndex !== null && expandedIndex >= 0 && expandedIndex < overlayPitches.length;

  return (
    <section className="pitch-section">
      <div className="pitch-header">
        <div>
          <p className="pitch-kicker">Hot Pitches</p>
          <h3>Today&apos;s top 4</h3>
          <p className="pitch-subtext">Featured by votes and freshness.</p>
        </div>
      </div>

      {!hasVisiblePitches ? (
        <div className="pitch-empty">
          <p className="pitch-subtext">
            {selectedCategory
              ? `No pitches found in ${selectedCategory}. Try another category or All.`
              : "No pitches available right now. Please check back soon."}
          </p>
        </div>
      ) : (
        <>
          <div className={`pitch-mosaic hot-band${loaded ? " is-loaded" : ""}`}>
            <div className="pitch-top-grid hot-grid">
              {topPitches.map((pitch) => (
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
                {rowOne.map((pitch, index) => (
                  <PitchShowCard
                    key={`${pitch.id}-row-one-${index}`}
                    pitch={pitch}
                    size="row"
                    variant="regular"
                    onExpand={handleExpand}
                  />
                ))}
              </div>
              <div className="pitch-row">
                {rowTwo.map((pitch, index) => (
                  <PitchShowCard
                    key={`${pitch.id}-row-two-${index}`}
                    pitch={pitch}
                    size="row"
                    variant="regular"
                    onExpand={handleExpand}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {overlayOpen && (
        <ExpandedPitchOverlay
          pitches={overlayPitches}
          index={expandedIndex}
          setIndex={setOverlayIndex}
          onClose={closeExpand}
        />
      )}
    </section>
  );
}
