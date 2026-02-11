"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const MORE_SECTION_PAGE_SIZE = 50;
const MORE_SECTION_SLOTS = 50;
const ROW_SIZE = 5;
const INITIAL_SKELETON_ROWS = 2;

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

const dedupePitches = (items: FeedPitch[]) => {
  const seen = new Set<string>();
  const deduped: FeedPitch[] = [];

  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }

  return deduped;
};

const chunkBySize = <T,>(items: T[], size: number) => {
  if (size <= 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const shuffle = <T,>(items: T[]) => {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(Math.random() * (index + 1));
    const current = output[index];
    output[index] = output[nextIndex];
    output[nextIndex] = current;
  }
  return output;
};

const buildTopPitches = (
  weekCandidates: FeedPitch[],
  feedCandidates: FeedPitch[],
  fallbackCandidates: FeedPitch[]
) => {
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

  pushUnique(weekCandidates);
  pushUnique(feedCandidates);
  if (top.length < 4) {
    pushUnique(fallbackCandidates);
  }

  return top;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof DOMException && error.name === "AbortError") return null;
  if (error instanceof Error && error.message.trim().length) return error.message;
  return "Unable to load more pitches.";
};

export default function PitchFeed({ selectedCategory = null }: PitchFeedProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const moreSectionRef = useRef<HTMLDivElement | null>(null);
  const initialAbortRef = useRef<AbortController | null>(null);

  const [items, setItems] = useState<FeedPitch[]>([]);
  const [weekPicks, setWeekPicks] = useState<FeedPitch[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [overlayPitches, setOverlayPitches] = useState<FeedPitch[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fixedTopPitches, setFixedTopPitches] = useState<FeedPitch[] | null>(null);

  const fallback = useMemo<FeedPitch[]>(
    () =>
      fallbackPitches.map((pitch) => ({
        id: pitch.id,
        name: pitch.name,
        tagline: pitch.tagline,
        poster: pitch.poster,
        video: null,
        isFallback: true,
        category: pitch.category ?? null,
        upvotes: 0,
        downvotes: 0,
        comments: 0,
        score: 0,
        monthlyRevenue: null,
      })),
    []
  );

  const filteredFallback = useMemo(
    () => fallback.filter((item) => matchesCategory(item, selectedCategory)),
    [fallback, selectedCategory]
  );

  const mapPitch = useCallback((item: ApiPitch, seedIndex: number): FeedPitch => {
    const fallbackPoster = `/pitches/pitch-0${(seedIndex % 4) + 1}.svg?v=2`;

    return {
      id: item.pitch_id ?? `pitch-${seedIndex}`,
      name: item.startup_name ?? "Startup",
      tagline: item.one_liner ?? item.category ?? "New pitch",
      poster: item.poster_url ?? fallbackPoster,
      video: item.video_url ?? null,
      isFallback: false,
      category: item.category ?? null,
      upvotes: asNumber(item.in_count),
      downvotes: asNumber(item.out_count),
      comments: asNumber(item.comment_count),
      score: asNumber(item.score),
      monthlyRevenue: (item.monthly_revenue ?? "").trim() || null,
    };
  }, []);

  useEffect(() => {
    let active = true;

    initialAbortRef.current?.abort();

    const controller = new AbortController();
    initialAbortRef.current = controller;

    setLoaded(false);
    setLoadError(null);
    setLoadingInitial(true);
    setItems([]);
    setWeekPicks([]);
    setFixedTopPitches(null);
    setOverlayPitches([]);
    setExpandedIndex(null);

    const loadInitialData = async () => {
      try {
        const [weekRes, feedRes] = await Promise.all([
          fetch("/api/pitches?mode=week&limit=4&min_votes=10", {
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch(`/api/pitches?mode=feed&tab=trending&limit=${MORE_SECTION_PAGE_SIZE}&offset=0`, {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);

        if (!weekRes.ok && !feedRes.ok) {
          throw new Error("Unable to load pitches.");
        }

        const weekPayload = weekRes.ok ? await weekRes.json() : null;
        const feedPayload = feedRes.ok ? await feedRes.json() : null;

        if (!active) return;

        const weekData = (weekPayload?.data ?? []) as ApiPitch[];
        const feedData = (feedPayload?.data ?? []) as ApiPitch[];

        const mappedWeek = weekData.map((item, index) => mapPitch(item, index)).slice(0, 4);
        const filteredWeek = mappedWeek.filter((item) => matchesCategory(item, selectedCategory));
        const weekIds = new Set(filteredWeek.map((item) => item.id));

        const mappedFeed = feedData.map((item, index) => mapPitch(item, index));
        const filteredFeed = shuffle(
          dedupePitches(
            mappedFeed
            .filter((item) => matchesCategory(item, selectedCategory))
            .filter((item) => !weekIds.has(item.id))
          )
        ).slice(0, MORE_SECTION_PAGE_SIZE);

        const initialBaseFeed = filteredFeed.length ? filteredFeed : filteredFallback;
        const initialTopPitches = buildTopPitches(filteredWeek, initialBaseFeed, filteredFallback);

        setWeekPicks(filteredWeek);
        setItems(filteredFeed);
        setFixedTopPitches(initialTopPitches);
      } catch (error) {
        const message = getErrorMessage(error);
        if (!active || !message) return;

        const fallbackTopPitches = buildTopPitches([], filteredFallback, filteredFallback);
        setWeekPicks([]);
        setItems([]);
        setFixedTopPitches(fallbackTopPitches);
        setLoadError(message);
      } finally {
        if (!active) return;
        setLoaded(true);
        setLoadingInitial(false);
      }
    };

    void loadInitialData();

    return () => {
      active = false;
      controller.abort();
    };
  }, [filteredFallback, mapPitch, selectedCategory]);

  const filteredWeekPicks = useMemo(
    () => weekPicks.filter((item) => matchesCategory(item, selectedCategory)),
    [weekPicks, selectedCategory]
  );

  const filteredItems = useMemo(
    () => items.filter((item) => matchesCategory(item, selectedCategory)),
    [items, selectedCategory]
  );

  const baseFeed = filteredItems;

  const dynamicTopPitches = useMemo(
    () => buildTopPitches(filteredWeekPicks, filteredItems, filteredFallback),
    [filteredWeekPicks, filteredItems, filteredFallback]
  );

  const topPitches = fixedTopPitches ?? dynamicTopPitches;

  const topIds = useMemo(() => new Set(topPitches.map((item) => item.id)), [topPitches]);

  const approvedMorePitches = useMemo(
    () =>
      dedupePitches(baseFeed.filter((item) => !topIds.has(item.id))).slice(
        0,
        MORE_SECTION_SLOTS
      ),
    [baseFeed, topIds]
  );

  const rowSlots = useMemo(
    () => [
      ...approvedMorePitches.map((pitch) => ({ type: "pitch" as const, pitch })),
      ...Array.from(
        { length: Math.max(0, MORE_SECTION_SLOTS - approvedMorePitches.length) },
        (_, index) => ({ type: "placeholder" as const, id: `placeholder-${index + 1}` })
      ),
    ],
    [approvedMorePitches]
  );

  const rowGroups = useMemo(() => chunkBySize(rowSlots, ROW_SIZE), [rowSlots]);

  const expandedList = useMemo(
    () => [...topPitches, ...approvedMorePitches],
    [approvedMorePitches, topPitches]
  );

  const hasVisiblePitches = topPitches.length > 0 || approvedMorePitches.length > 0;

  useEffect(() => {
    topPitches.forEach((pitch) => {
      if (!pitch.poster) return;
      const image = new Image();
      image.src = pitch.poster;
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

  const handleBackToTop = () => {
    const target = sectionRef.current ?? moreSectionRef.current;
    if (!target) return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
  };

  const statusMessage = loadingInitial ? "Loading pitches…" : loadError;

  const overlayOpen =
    expandedIndex !== null && expandedIndex >= 0 && expandedIndex < overlayPitches.length;

  return (
    <section className="pitch-section" ref={sectionRef}>
      <div className="pitch-header">
        <div>
          <p className="pitch-kicker">Hot Pitches</p>
          <h3>Today&apos;s top 4</h3>
          <p className="pitch-subtext">Featured by votes and freshness.</p>
        </div>
      </div>

      {!hasVisiblePitches && !loadingInitial ? (
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
          <div className={`pitch-mosaic more-band${loaded ? " is-loaded" : ""}`} ref={moreSectionRef}>
            <div className="pitch-rows">
              {loadingInitial
                ? Array.from({ length: INITIAL_SKELETON_ROWS }, (_, rowIndex) => (
                    <div key={`initial-loading-row-${rowIndex}`} className="pitch-row is-loading" aria-hidden="true">
                      {Array.from({ length: ROW_SIZE }, (_, cardIndex) => (
                        <article
                          key={`initial-loading-card-${rowIndex}-${cardIndex}`}
                          className="pitch-show-card row skeleton"
                        />
                      ))}
                    </div>
                  ))
                : rowGroups.map((group, rowIndex) => (
                    <div key={`row-group-${rowIndex}`} className="pitch-row">
                      {group.map((slot) =>
                        slot.type === "pitch" ? (
                          <PitchShowCard
                            key={`${slot.pitch.id}-row-${rowIndex}`}
                            pitch={slot.pitch}
                            size="row"
                            variant="regular"
                            onExpand={handleExpand}
                          />
                        ) : (
                          <Link
                            key={`${slot.id}-row-${rowIndex}`}
                            href="/submit"
                            className="pitch-slot-open-card"
                            aria-label="Upload your pitch"
                          >
                            <div className="pitch-slot-open-badge">Slot open</div>
                            <h4>Be the next approved pitch</h4>
                            <p>This space fills as soon as admin approves a submission.</p>
                            <span className="pitch-slot-open-action">Upload your pitch</span>
                          </Link>
                        )
                      )}
                    </div>
                  ))}
            </div>

            {statusMessage ? (
              <div className="pitch-feed-status" role="status" aria-live="polite">
                {statusMessage}
              </div>
            ) : null}

            <div className="pitch-feed-actions">
              <button type="button" className="pitch-back-to-top" onClick={handleBackToTop}>
                Back to top
              </button>
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
