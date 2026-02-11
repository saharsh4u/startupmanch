"use client";

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

const INITIAL_PAGE_SIZE = 20;
const PAGE_SIZE = 10;
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
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const initialAbortRef = useRef<AbortController | null>(null);
  const loadMoreAbortRef = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);

  const [items, setItems] = useState<FeedPitch[]>([]);
  const [weekPicks, setWeekPicks] = useState<FeedPitch[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [overlayPitches, setOverlayPitches] = useState<FeedPitch[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const [feedOffset, setFeedOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasLoadedAdditionalPages, setHasLoadedAdditionalPages] = useState(false);
  const [fixedTopPitches, setFixedTopPitches] = useState<FeedPitch[] | null>(null);
  const [supportsAutoLoad, setSupportsAutoLoad] = useState(false);

  useEffect(() => {
    setSupportsAutoLoad(typeof window !== "undefined" && "IntersectionObserver" in window);
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
    loadingMoreRef.current = false;

    initialAbortRef.current?.abort();
    loadMoreAbortRef.current?.abort();
    loadMoreAbortRef.current = null;

    const controller = new AbortController();
    initialAbortRef.current = controller;

    setLoaded(false);
    setLoadError(null);
    setLoadingInitial(true);
    setLoadingMore(false);
    setFeedOffset(0);
    setHasMore(true);
    setItems([]);
    setWeekPicks([]);
    setFixedTopPitches(null);
    setHasLoadedAdditionalPages(false);
    setOverlayPitches([]);
    setExpandedIndex(null);

    const loadInitialData = async () => {
      try {
        const [weekRes, feedRes] = await Promise.all([
          fetch("/api/pitches?mode=week&limit=4&min_votes=10", {
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch(`/api/pitches?mode=feed&tab=trending&limit=${INITIAL_PAGE_SIZE}&offset=0`, {
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
        const filteredFeed = dedupePitches(
          mappedFeed
            .filter((item) => matchesCategory(item, selectedCategory))
            .filter((item) => !weekIds.has(item.id))
        );

        const initialBaseFeed = filteredFeed.length ? filteredFeed : filteredFallback;
        const initialTopPitches = buildTopPitches(filteredWeek, initialBaseFeed, filteredFallback);

        setWeekPicks(filteredWeek);
        setItems(filteredFeed);
        setFixedTopPitches(initialTopPitches);
        setFeedOffset(feedData.length);
        setHasMore(feedRes.ok ? feedData.length === INITIAL_PAGE_SIZE : false);
      } catch (error) {
        const message = getErrorMessage(error);
        if (!active || !message) return;

        const fallbackTopPitches = buildTopPitches([], filteredFallback, filteredFallback);
        setWeekPicks([]);
        setItems([]);
        setFixedTopPitches(fallbackTopPitches);
        setFeedOffset(0);
        setHasMore(false);
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
      loadMoreAbortRef.current?.abort();
      loadMoreAbortRef.current = null;
    };
  }, [filteredFallback, mapPitch, selectedCategory]);

  const loadMorePage = useCallback(async () => {
    if (!hasMore || loadingInitial || loadingMoreRef.current) return;

    const offset = feedOffset;
    const controller = new AbortController();
    loadMoreAbortRef.current?.abort();
    loadMoreAbortRef.current = controller;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadError(null);

    try {
      const response = await fetch(
        `/api/pitches?mode=feed&tab=trending&limit=${PAGE_SIZE}&offset=${offset}`,
        {
          cache: "no-store",
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        throw new Error("Unable to load more pitches.");
      }

      const payload = await response.json();
      const data = (payload?.data ?? []) as ApiPitch[];
      const weekIds = new Set(weekPicks.map((item) => item.id));
      const mapped = data.map((item, index) => mapPitch(item, offset + index));
      const filtered = mapped
        .filter((item) => matchesCategory(item, selectedCategory))
        .filter((item) => !weekIds.has(item.id));

      setItems((previous) => dedupePitches([...previous, ...filtered]));
      setFeedOffset(offset + data.length);
      setHasMore(data.length === PAGE_SIZE);
      if (data.length > 0) {
        setHasLoadedAdditionalPages(true);
      }
    } catch (error) {
      const message = getErrorMessage(error);
      if (message) {
        setLoadError(message);
      }
    } finally {
      if (loadMoreAbortRef.current === controller) {
        loadMoreAbortRef.current = null;
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [feedOffset, hasMore, loadingInitial, mapPitch, selectedCategory, weekPicks]);

  useEffect(() => {
    if (!supportsAutoLoad || loadingInitial || loadingMore || !hasMore || loadError) {
      return;
    }

    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMorePage();
        }
      },
      {
        root: null,
        rootMargin: "300px 0px",
        threshold: 0,
      }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, loadError, loadMorePage, loadingInitial, loadingMore, supportsAutoLoad]);

  const filteredWeekPicks = useMemo(
    () => weekPicks.filter((item) => matchesCategory(item, selectedCategory)),
    [weekPicks, selectedCategory]
  );

  const filteredItems = useMemo(
    () => items.filter((item) => matchesCategory(item, selectedCategory)),
    [items, selectedCategory]
  );

  const baseFeed = useMemo(
    () => (filteredItems.length ? filteredItems : filteredFallback),
    [filteredItems, filteredFallback]
  );

  const dynamicTopPitches = useMemo(
    () => buildTopPitches(filteredWeekPicks, baseFeed, filteredFallback),
    [filteredWeekPicks, baseFeed, filteredFallback]
  );

  const topPitches = fixedTopPitches ?? dynamicTopPitches;

  const topIds = useMemo(() => new Set(topPitches.map((item) => item.id)), [topPitches]);

  const rowPool = useMemo(
    () => dedupePitches(baseFeed.filter((item) => !topIds.has(item.id))),
    [baseFeed, topIds]
  );

  const rowGroups = useMemo(() => chunkBySize(rowPool, ROW_SIZE), [rowPool]);

  const expandedList = useMemo(() => [...topPitches, ...rowPool], [topPitches, rowPool]);

  const hasVisiblePitches = topPitches.length > 0 || rowPool.length > 0;

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

  const statusMessage = loadingInitial
    ? "Loading pitches…"
    : loadingMore
      ? "Loading more pitches…"
      : loadError
        ? loadError
        : hasMore
          ? supportsAutoLoad
            ? "Scroll to load more pitches."
            : "Auto-load unavailable. Use the button below to load more."
          : "No more pitches";

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
                      {group.map((pitch) => (
                        <PitchShowCard
                          key={`${pitch.id}-row-${rowIndex}`}
                          pitch={pitch}
                          size="row"
                          variant="regular"
                          onExpand={handleExpand}
                        />
                      ))}
                    </div>
                  ))}

              {loadingMore ? (
                <div className="pitch-row is-loading" aria-hidden="true">
                  {Array.from({ length: ROW_SIZE }, (_, cardIndex) => (
                    <article key={`append-loading-card-${cardIndex}`} className="pitch-show-card row skeleton" />
                  ))}
                </div>
              ) : null}
            </div>

            <div className="pitch-feed-status" role="status" aria-live="polite">
              {statusMessage}
            </div>

            <div className="pitch-feed-actions">
              {hasMore && !loadingInitial && !loadingMore ? (
                <button type="button" className="pitch-load-more" onClick={() => void loadMorePage()}>
                  {loadError ? "Retry loading pitches" : "Load more pitches"}
                </button>
              ) : null}

              {hasLoadedAdditionalPages ? (
                <button type="button" className="pitch-back-to-top" onClick={handleBackToTop}>
                  Back to top
                </button>
              ) : null}
            </div>

            <div ref={sentinelRef} className="pitch-feed-sentinel" aria-hidden="true" />
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
