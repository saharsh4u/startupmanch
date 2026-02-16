"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import ExpandedPitchOverlay from "@/components/ExpandedPitchOverlay";
import PitchShowCard, { type PitchShow } from "@/components/PitchShowCard";
import { pitches as fallbackPitches } from "@/data/pitches";

type ApiPitch = {
  pitch_id: string;
  startup_id: string;
  startup_name: string;
  one_liner: string | null;
  category: string | null;
  monthly_revenue?: string | null;
  poster_url: string | null;
  approved_at?: string | null;
  founder_photo_url?: string | null;
  founder_name?: string | null;
  founder_story?: string | null;
  in_count?: number;
  out_count?: number;
  comment_count?: number;
  score?: number;
  video_url?: string | null;
};

type FeedResponsePayload = {
  data?: ApiPitch[];
  window_id?: number | null;
  next_shuffle_at?: string | null;
};

type TeaserApproved = {
  id: string;
  startup_name: string;
  category: string | null;
  one_liner: string | null;
  founder_name: string | null;
  founder_photo_url: string | null;
  founder_story: string | null;
  approved_at: string | null;
  created_at: string;
  poster_url: string | null;
  video_url: string | null;
};

type TeaserPending = {
  id: string;
  category: string | null;
  created_at: string;
  poster_url: string | null;
  style_key: string;
};

type FeedPitch = PitchShow & {
  category: string | null;
  approvedAt: string | null;
  founderPhotoUrl: string | null;
  founderName: string | null;
  founderStory: string | null;
};

type PitchFeedProps = {
  selectedCategory?: string | null;
  onCategoriesDiscovered?: (categories: string[]) => void;
};

type SlotFilter = "all" | "approved" | "open";
type RowSlot = { type: "approved"; pitch: FeedPitch } | { type: "open"; id: string };

const SLOT_UPGRADE_ENABLED = process.env.NEXT_PUBLIC_PITCH_SLOT_UPGRADE === "1";

const FEED_PAGE_SIZE = 50;
const MAX_FEED_PAGE_FETCHES = 40;
const ROW_SIZE = 5;
const INITIAL_SKELETON_ROWS = 2;
const TEASER_MAX = 10;
const PENDING_SLOT_MAX = 12;
const SHUFFLE_WINDOW_SECONDS = 5 * 60;
const SLOT_REORDER_MIN_MS = 8_000;
const SLOT_REORDER_MAX_MS = 16_000;
const ROW_LOOP_BASE_SPEED_PX_PER_SECOND = 24;
const ROW_LOOP_SPEED_STEP_PX_PER_SECOND = 2.5;

const accentPalette = [
  "#42d6ff",
  "#7effa1",
  "#ffb357",
  "#ff7e91",
  "#9f8cff",
  "#66f0cf",
  "#ffd166",
  "#8ad1ff",
] as const;

const normalizeCategory = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

const asNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const matchesCategory = (item: { category: string | null }, selectedCategory: string | null | undefined) => {
  if (!selectedCategory) return true;
  const selected = normalizeCategory(selectedCategory);
  if (!selected.length) return true;
  return normalizeCategory(item.category) === selected;
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

const createSeededRandom = (seed: number) => {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
};

const shuffleItems = <T,>(items: T[], seed: number) => {
  const next = [...items];
  const random = createSeededRandom(seed || 1);
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1));
    [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
  }
  return next;
};

const hashString = (input: string) => {
  let value = 0;
  for (let index = 0; index < input.length; index += 1) {
    value = (value << 5) - value + input.charCodeAt(index);
    value |= 0;
  }
  return Math.abs(value);
};

const accentForKey = (key: string) => accentPalette[hashString(key) % accentPalette.length];

const getErrorMessage = (error: unknown) => {
  if (error instanceof DOMException && error.name === "AbortError") return null;
  if (error instanceof Error && error.message.trim().length) return error.message;
  return "Unable to load more pitches.";
};

const buildPitchFeedPath = (options: {
  mode: "week" | "feed";
  selectedCategory: string | null | undefined;
  limit: number;
  offset?: number;
  minVotes?: number;
  shuffle?: boolean;
}) => {
  const params = new URLSearchParams();
  params.set("mode", options.mode);
  params.set("limit", String(options.limit));

  if (typeof options.offset === "number") {
    params.set("offset", String(options.offset));
  }

  if (typeof options.minVotes === "number") {
    params.set("min_votes", String(options.minVotes));
  }

  if (options.shuffle) {
    params.set("shuffle", "true");
  }

  const category = (options.selectedCategory ?? "").trim();
  if (category.length) {
    params.set("tab", "category");
    params.set("category", category);
  } else {
    params.set("tab", "trending");
  }

  return `/api/pitches?${params.toString()}`;
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
  if (top.length < 4) pushUnique(fallbackCandidates);

  return top;
};

const formatCountdown = (seconds: number) => {
  const bounded = Math.max(0, seconds);
  const mins = Math.floor(bounded / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(bounded % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
};

const relativeTime = (iso: string | null | undefined) => {
  if (!iso) return "just now";
  const when = Date.parse(iso);
  if (!Number.isFinite(when)) return "just now";
  const seconds = Math.max(0, Math.floor((Date.now() - when) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export default function PitchFeed({
  selectedCategory = null,
  onCategoriesDiscovered,
}: PitchFeedProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const moreSectionRef = useRef<HTMLDivElement | null>(null);
  const initialAbortRef = useRef<AbortController | null>(null);
  const shuffleRefreshLockRef = useRef(false);
  const rowTrackRefs = useRef<Array<HTMLDivElement | null>>([]);

  const [items, setItems] = useState<FeedPitch[]>([]);
  const [weekPicks, setWeekPicks] = useState<FeedPitch[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [overlayPitches, setOverlayPitches] = useState<FeedPitch[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fixedTopPitches, setFixedTopPitches] = useState<FeedPitch[] | null>(null);

  const [approvedTeasers, setApprovedTeasers] = useState<TeaserApproved[]>([]);
  const [pendingTeasers, setPendingTeasers] = useState<TeaserPending[]>([]);
  const [isRefreshingApprovals, setIsRefreshingApprovals] = useState(false);
  const [shuffleCountdown, setShuffleCountdown] = useState(SHUFFLE_WINDOW_SECONDS);
  const [nextShuffleAtMs, setNextShuffleAtMs] = useState<number | null>(null);
  const [liveToast, setLiveToast] = useState<string | null>(null);

  const [slotFilter, setSlotFilter] = useState<SlotFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [slotShuffleSeed, setSlotShuffleSeed] = useState(
    () => Math.floor(Math.random() * 1_000_000_000)
  );

  const [hoveredPreviewPitchId, setHoveredPreviewPitchId] = useState<string | null>(null);
  const [focusedPreviewPitchId, setFocusedPreviewPitchId] = useState<string | null>(null);
  const [visiblePreviewPitchIds, setVisiblePreviewPitchIds] = useState<Set<string>>(new Set());
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  const fallback = useMemo<FeedPitch[]>(
    () =>
      fallbackPitches.map((pitch) => ({
        id: pitch.id,
        startupId: null,
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
        approvedAt: null,
        founderPhotoUrl: null,
        founderName: null,
        founderStory: null,
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
      startupId: item.startup_id ?? null,
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
      approvedAt: item.approved_at ?? null,
      founderPhotoUrl: item.founder_photo_url ?? null,
      founderName: item.founder_name ?? null,
      founderStory: item.founder_story ?? null,
    };
  }, []);

  const loadSectionData = useCallback(
    async (signal: AbortSignal, options?: { refreshOnly?: boolean }) => {
      const fetchFeedPages = async () => {
        const feedData: ApiPitch[] = [];
        let nextShuffleAt: string | null = null;

        for (let pageIndex = 0; pageIndex < MAX_FEED_PAGE_FETCHES; pageIndex += 1) {
          const offset = pageIndex * FEED_PAGE_SIZE;
          const feedPath = buildPitchFeedPath({
            mode: "feed",
            selectedCategory,
            limit: FEED_PAGE_SIZE,
            offset,
            shuffle: true,
          });
          const response = await fetch(feedPath, {
            cache: "no-store",
            signal,
          });

          if (!response.ok) {
            if (pageIndex === 0) {
              throw new Error("Unable to load pitches.");
            }
            break;
          }

          const payload = (await response.json()) as FeedResponsePayload;
          const page = (payload.data ?? []) as ApiPitch[];
          if (typeof payload.next_shuffle_at === "string") {
            nextShuffleAt = payload.next_shuffle_at;
          }

          if (!page.length) {
            break;
          }

          feedData.push(...page);

          if (page.length < FEED_PAGE_SIZE) {
            break;
          }
        }

        return {
          data: feedData,
          nextShuffleAt,
        };
      };

      const [weekRes, feedPayload, teaserRes] = await Promise.all([
        fetch(
          buildPitchFeedPath({
            mode: "week",
            selectedCategory,
            limit: 4,
            minVotes: 10,
          }),
          {
            cache: "no-store",
            signal,
          }
        ),
        fetchFeedPages(),
        SLOT_UPGRADE_ENABLED
          ? fetch("/api/pitches/teasers", { cache: "no-store", signal })
          : Promise.resolve(null),
      ]);

      if (!weekRes.ok && feedPayload.data.length === 0) {
        throw new Error("Unable to load pitches.");
      }

      const weekPayload = (weekRes.ok ? await weekRes.json() : null) as FeedResponsePayload | null;
      const teaserPayload = teaserRes && teaserRes.ok ? await teaserRes.json() : null;

      const weekData = (weekPayload?.data ?? []) as ApiPitch[];
      const feedData = feedPayload.data;
      const discoveredCategories = Array.from(
        new Set(
          [...weekData, ...feedData]
            .map((item) => (item.category ?? "").trim())
            .filter((item) => item.length > 0)
        )
      ).sort((left, right) => left.localeCompare(right));
      onCategoriesDiscovered?.(discoveredCategories);

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
      if (!options?.refreshOnly) {
        setFixedTopPitches(initialTopPitches);
      }

      if (SLOT_UPGRADE_ENABLED && teaserPayload) {
        const approved = ((teaserPayload.approved ?? []) as TeaserApproved[])
          .filter((item) => matchesCategory({ category: item.category }, selectedCategory))
          .slice(0, 8);

        const pending = ((teaserPayload.pending ?? []) as TeaserPending[])
          .filter((item) => matchesCategory({ category: item.category }, selectedCategory))
          .slice(0, PENDING_SLOT_MAX);

        setApprovedTeasers(approved);
        setPendingTeasers(pending);

      }

      if (typeof feedPayload.nextShuffleAt === "string") {
        const nextAt = Date.parse(feedPayload.nextShuffleAt);
        if (Number.isFinite(nextAt)) {
          setNextShuffleAtMs(nextAt);
          const secondsLeft = Math.max(0, Math.ceil((nextAt - Date.now()) / 1000));
          setShuffleCountdown(secondsLeft);
        }
      }
    },
    [filteredFallback, mapPitch, onCategoriesDiscovered, selectedCategory]
  );

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
        await loadSectionData(controller.signal);
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
  }, [filteredFallback, loadSectionData]);

  useEffect(() => {
    if (!SLOT_UPGRADE_ENABLED || loadingInitial || !nextShuffleAtMs) return;

    const tick = () => {
      const secondsLeft = Math.max(0, Math.ceil((nextShuffleAtMs - Date.now()) / 1000));
      setShuffleCountdown(secondsLeft);
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [loadingInitial, nextShuffleAtMs]);

  useEffect(() => {
    if (!SLOT_UPGRADE_ENABLED || loadingInitial || !nextShuffleAtMs) return;
    if (shuffleCountdown > 0) return;
    if (shuffleRefreshLockRef.current) return;

    shuffleRefreshLockRef.current = true;

    const refreshController = new AbortController();
    setIsRefreshingApprovals(true);

    void loadSectionData(refreshController.signal, { refreshOnly: true })
      .then(() => {
        setLiveToast("Slots reshuffled");
      })
      .finally(() => {
        setIsRefreshingApprovals(false);
        shuffleRefreshLockRef.current = false;
      });
  }, [loadingInitial, loadSectionData, nextShuffleAtMs, shuffleCountdown]);

  useEffect(() => {
    if (!liveToast) return;
    const timer = window.setTimeout(() => {
      setLiveToast(null);
    }, 4200);
    return () => window.clearTimeout(timer);
  }, [liveToast]);

  useEffect(() => {
    const updateViewport = () => {
      setIsMobileViewport(window.matchMedia("(max-width: 768px)").matches);
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  const setRowTrackRef = useCallback((rowIndex: number, node: HTMLDivElement | null) => {
    rowTrackRefs.current[rowIndex] = node;
  }, []);

  useEffect(() => {
    if (loadingInitial) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let timeoutId = 0;
    let cancelled = false;

    const scheduleNext = () => {
      const waitMs =
        SLOT_REORDER_MIN_MS + Math.floor(Math.random() * (SLOT_REORDER_MAX_MS - SLOT_REORDER_MIN_MS + 1));
      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        setSlotShuffleSeed((current) => current + 1);
        scheduleNext();
      }, waitMs);
    };

    scheduleNext();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [loadingInitial]);

  useEffect(() => {
    if (loadingInitial) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      rowTrackRefs.current.forEach((track) => {
        if (!track) return;
        track.style.transform = "translate3d(0px, 0px, 0px)";
      });
      return;
    }

    const widths = new Array(rowTrackRefs.current.length).fill(0);
    const offsets = new Array(rowTrackRefs.current.length).fill(0);

    const measure = () => {
      rowTrackRefs.current.forEach((track, rowIndex) => {
        if (!track) return;
        const segment = track.querySelector<HTMLElement>('[data-row-segment="primary"]');
        const width = segment?.offsetWidth ?? 0;
        if (width <= 0) return;
        widths[rowIndex] = width;

        const currentOffset = offsets[rowIndex];
        if (!Number.isFinite(currentOffset) || currentOffset > 0 || currentOffset < -width) {
          offsets[rowIndex] = -Math.random() * width;
          return;
        }
        offsets[rowIndex] = Math.max(-width, Math.min(0, currentOffset));
      });
    };

    measure();

    let rafId = 0;
    let previousTime = performance.now();

    const animate = (now: number) => {
      const elapsed = Math.min(64, now - previousTime);
      previousTime = now;

      rowTrackRefs.current.forEach((track, rowIndex) => {
        if (!track) return;

        const rowWidth = widths[rowIndex];
        if (!rowWidth) return;

        const direction = rowIndex % 2 === 0 ? 1 : -1;
        const rowSpeed =
          ROW_LOOP_BASE_SPEED_PX_PER_SECOND + (rowIndex % 3) * ROW_LOOP_SPEED_STEP_PX_PER_SECOND;
        let nextOffset =
          offsets[rowIndex] + (direction * rowSpeed * elapsed) / 1000;

        if (direction === 1 && nextOffset > 0) {
          nextOffset -= rowWidth;
        } else if (direction === -1 && nextOffset < -rowWidth) {
          nextOffset += rowWidth;
        }

        offsets[rowIndex] = nextOffset;
        track.style.transform = `translate3d(${nextOffset}px, 0px, 0px)`;
      });

      rafId = window.requestAnimationFrame(animate);
    };

    rafId = window.requestAnimationFrame(animate);
    const onResize = () => measure();
    window.addEventListener("resize", onResize);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
    };
  }, [loadingInitial]);

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
    () => dedupePitches(baseFeed.filter((item) => !topIds.has(item.id))),
    [baseFeed, topIds]
  );

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const approvedVisible = useMemo(() => {
    const base = approvedMorePitches.filter((pitch) => {
      if (!normalizedSearch.length) return true;
      return [pitch.name, pitch.tagline, pitch.category ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });

    if (!SLOT_UPGRADE_ENABLED) return base;
    if (slotFilter === "approved" || slotFilter === "all") return base;
    return [];
  }, [approvedMorePitches, normalizedSearch, slotFilter]);

  const rowSlots = useMemo(() => {
    const approvedSlots = slotFilter === "open" ? [] : approvedVisible;
    const slots: RowSlot[] = approvedSlots.map((pitch) => ({ type: "approved" as const, pitch }));

    if (SLOT_UPGRADE_ENABLED && slotFilter !== "approved") {
      const minRows = slotFilter === "open" ? 2 : approvedSlots.length ? 1 : 2;
      const openCount = ROW_SIZE * minRows;
      for (let index = 0; index < openCount; index += 1) {
        slots.push({
          type: "open" as const,
          id: `placeholder-${slotFilter}-${index + 1}`,
        });
      }
    }

    if (!slots.length) {
      for (let index = 0; index < ROW_SIZE; index += 1) {
        slots.push({
          type: "open" as const,
          id: `placeholder-empty-${index + 1}`,
        });
      }
    }

    return shuffleItems(slots, slotShuffleSeed);
  }, [approvedVisible, slotFilter, slotShuffleSeed]);

  const rowGroups = useMemo(() => chunkBySize(rowSlots, ROW_SIZE), [rowSlots]);

  const expandedList = useMemo(() => [...topPitches, ...approvedMorePitches], [approvedMorePitches, topPitches]);
  const hasVisiblePitches = topPitches.length > 0 || approvedMorePitches.length > 0;

  const teaserItems = useMemo(() => {
    if (!SLOT_UPGRADE_ENABLED) return [] as Array<
      | { type: "approved"; item: TeaserApproved; time: number }
      | { type: "pending"; item: TeaserPending; time: number }
    >;

    const approved = approvedTeasers.map((item) => ({
      type: "approved" as const,
      item,
      time: Date.parse(item.approved_at ?? item.created_at) || 0,
    }));

    const pending = pendingTeasers.map((item) => ({
      type: "pending" as const,
      item,
      time: Date.parse(item.created_at) || 0,
    }));

    return [...approved, ...pending]
      .sort((left, right) => right.time - left.time)
      .slice(0, TEASER_MAX);
  }, [approvedTeasers, pendingTeasers]);

  const founderAvatarStack = useMemo(() => {
    if (!SLOT_UPGRADE_ENABLED) return [] as Array<{ name: string; photo: string | null }>;

    const seen = new Set<string>();
    const list: Array<{ name: string; photo: string | null }> = [];

    for (const item of approvedTeasers) {
      const name = (item.founder_name ?? item.startup_name ?? "Founder").trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      list.push({ name, photo: item.founder_photo_url ?? null });
      if (list.length >= 5) break;
    }

    return list;
  }, [approvedTeasers]);

  const testimonials = useMemo(() => {
    if (!SLOT_UPGRADE_ENABLED) return [] as Array<{ id: string; quote: string; author: string; role: string }>;

    const source = approvedMorePitches.slice(0, 3);
    return source.map((pitch) => {
      const story = (pitch.founderStory ?? "").trim();
      const compactStory = story.replace(/\s+/g, " ").slice(0, 120);
      const quote = compactStory.length
        ? compactStory
        : `${pitch.tagline || "We built this to solve a painful workflow."}`;

      return {
        id: pitch.id,
        quote,
        author: pitch.founderName ?? pitch.name,
        role: pitch.category ?? "Founder",
      };
    });
  }, [approvedMorePitches]);

  useEffect(() => {
    if (!SLOT_UPGRADE_ENABLED || !isMobileViewport) {
      setVisiblePreviewPitchIds(new Set());
      return;
    }

    const rootNode = moreSectionRef.current;
    if (!rootNode) return;

    const elements = Array.from(rootNode.querySelectorAll<HTMLElement>("[data-preview-pitch-id]"));
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePreviewPitchIds((previous) => {
          const next = new Set(previous);
          entries.forEach((entry) => {
            const id = entry.target.getAttribute("data-preview-pitch-id");
            if (!id) return;
            if (entry.isIntersecting) next.add(id);
            else next.delete(id);
          });
          return next;
        });
      },
      {
        root: null,
        threshold: 0.55,
      }
    );

    elements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, [isMobileViewport, rowGroups]);

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

  const handleSharePitch = async (
    event: MouseEvent<HTMLButtonElement>,
    pitch: FeedPitch
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const shareUrl = `${window.location.origin}/?pitch=${encodeURIComponent(pitch.id)}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: pitch.name, text: pitch.tagline, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
      }
      setLiveToast(`Shared ${pitch.name}`);
    } catch {
      // Ignore user cancellation.
    }
  };

  const renderRowSlot = (
    slot: RowSlot,
    rowIndex: number,
    slotIndex: number,
    copy: "primary" | "clone"
  ) => {
    const isClone = copy === "clone";

    if (slot.type === "approved") {
      const shouldPreview =
        !isClone &&
        (!SLOT_UPGRADE_ENABLED ||
          hoveredPreviewPitchId === slot.pitch.id ||
          focusedPreviewPitchId === slot.pitch.id ||
          visiblePreviewPitchIds.has(slot.pitch.id));

      const displayPitch: FeedPitch = {
        ...slot.pitch,
        video: shouldPreview ? slot.pitch.video : null,
      };

      const accent = accentForKey(slot.pitch.id);
      const founderLabel = (slot.pitch.founderName ?? slot.pitch.name ?? "F").trim();

      return (
        <div
          key={`${slot.pitch.id}-row-${rowIndex}-${copy}-${slotIndex}`}
          className={`pitch-slot-approved${isClone ? " is-clone" : ""}`}
          data-preview-pitch-id={isClone ? undefined : slot.pitch.id}
          style={{ ["--slot-accent" as string]: accent }}
          onMouseEnter={isClone ? undefined : () => setHoveredPreviewPitchId(slot.pitch.id)}
          onMouseLeave={
            isClone
              ? undefined
              : () => setHoveredPreviewPitchId((current) => (current === slot.pitch.id ? null : current))
          }
          onFocusCapture={isClone ? undefined : () => setFocusedPreviewPitchId(slot.pitch.id)}
          onBlurCapture={
            isClone
              ? undefined
              : () => setFocusedPreviewPitchId((current) => (current === slot.pitch.id ? null : current))
          }
          aria-hidden={isClone}
        >
          <PitchShowCard
            pitch={displayPitch}
            size="row"
            variant="regular"
            onExpand={isClone ? undefined : handleExpand}
            interactive={!isClone}
          />
          <div className="pitch-slot-approved-meta">
            <div className="pitch-slot-founder">
              {slot.pitch.founderPhotoUrl ? (
                <span
                  className="pitch-slot-founder-avatar"
                  style={{ backgroundImage: `url(${slot.pitch.founderPhotoUrl})` }}
                  aria-hidden="true"
                />
              ) : (
                <span className="pitch-slot-founder-fallback" aria-hidden="true">
                  {founderLabel.charAt(0).toUpperCase()}
                </span>
              )}
              <span>{slot.pitch.founderName ?? slot.pitch.name}</span>
            </div>
            {SLOT_UPGRADE_ENABLED && !isClone ? (
              <button
                type="button"
                className="pitch-slot-share"
                onClick={(event) => void handleSharePitch(event, slot.pitch)}
              >
                Share
              </button>
            ) : null}
          </div>
        </div>
      );
    }

    const accent = accentForKey(slot.id);
    const cardClassName = `pitch-slot-open-card${isRefreshingApprovals && !isClone ? " is-refreshing" : ""}${isClone ? " is-clone" : ""}`;
    const cardContent = (
      <>
        <div className="pitch-slot-open-badge">Slot open</div>
        <h4>Be the next approved pitch</h4>
        <p>This space fills as soon as a founder submits a new pitch.</p>
        <span className="pitch-slot-open-action">Upload your pitch</span>
        {SLOT_UPGRADE_ENABLED ? (
          <span className="pitch-slot-countdown">Next shuffle in {formatCountdown(shuffleCountdown)}</span>
        ) : null}
      </>
    );

    if (isClone) {
      return (
        <div
          key={`${slot.id}-row-${rowIndex}-${copy}-${slotIndex}`}
          className={cardClassName}
          style={{ ["--slot-accent" as string]: accent }}
          aria-hidden="true"
        >
          {cardContent}
        </div>
      );
    }

    return (
      <Link
        key={`${slot.id}-row-${rowIndex}-${copy}-${slotIndex}`}
        href="/submit"
        className={cardClassName}
        style={{ ["--slot-accent" as string]: accent }}
        aria-label="Upload your pitch"
      >
        {cardContent}
      </Link>
    );
  };

  const statusMessage = loadingInitial
    ? "Loading pitches…"
    : loadError
      ? loadError
      : SLOT_UPGRADE_ENABLED && isRefreshingApprovals
        ? "Reshuffling slots…"
        : null;

  const overlayOpen = expandedIndex !== null && expandedIndex >= 0 && expandedIndex < overlayPitches.length;

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
            {SLOT_UPGRADE_ENABLED ? (
              <>
                <div className="slot-controls">
                  <label className="slot-search" aria-label="Search pitches">
                    <span>⌕</span>
                    <input
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Search pitches"
                    />
                  </label>
                  <div className="slot-filter-chips" role="tablist" aria-label="Slot filters">
                    {([
                      { id: "all", label: "All" },
                      { id: "approved", label: "Approved" },
                      { id: "open", label: "Open slots" },
                    ] as Array<{ id: SlotFilter; label: string }>).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`slot-filter-chip${slotFilter === item.id ? " is-active" : ""}`}
                        onClick={() => setSlotFilter(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <p className="slot-random-note">
                    Positions reshuffle at random intervals, plus a full network shuffle every 5 min.
                  </p>
                </div>

                <div className="slot-teaser-strip" aria-label="Recent uploads teasers">
                  {teaserItems.map((entry) =>
                    entry.type === "approved" ? (
                      <article key={`teaser-approved-${entry.item.id}`} className="slot-teaser approved">
                        <div className="slot-teaser-media" style={{ backgroundImage: entry.item.poster_url ? `url(${entry.item.poster_url})` : undefined }} />
                        <div className="slot-teaser-body">
                          <p className="slot-teaser-kicker">Approved {relativeTime(entry.item.approved_at)}</p>
                          <h4>{entry.item.startup_name}</h4>
                          <p>{entry.item.one_liner ?? entry.item.category ?? "New approved pitch"}</p>
                        </div>
                      </article>
                    ) : (
                      <article key={`teaser-pending-${entry.item.id}`} className="slot-teaser pending">
                        <div className="slot-teaser-media is-anon" style={{ backgroundImage: entry.item.poster_url ? `url(${entry.item.poster_url})` : undefined }} />
                        <div className="slot-teaser-body">
                          <p className="slot-teaser-kicker">Pending {relativeTime(entry.item.created_at)}</p>
                          <h4>New submission</h4>
                          <p>{entry.item.category ?? "Category pending"}</p>
                        </div>
                      </article>
                    )
                  )}
                </div>
              </>
            ) : null}

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
                    <div
                      key={`row-group-${rowIndex}`}
                      className={`pitch-row ${rowIndex % 2 === 0 ? "is-forward" : "is-reverse"}`}
                    >
                      <div className="pitch-row-track" ref={(node) => setRowTrackRef(rowIndex, node)}>
                        <div className="pitch-row-segment" data-row-segment="primary">
                          {group.map((slot, slotIndex) =>
                            renderRowSlot(slot, rowIndex, slotIndex, "primary")
                          )}
                        </div>
                        <div
                          className="pitch-row-segment is-clone"
                          data-row-segment="clone"
                          aria-hidden="true"
                        >
                          {group.map((slot, slotIndex) =>
                            renderRowSlot(slot, rowIndex, slotIndex, "clone")
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
            </div>

            {statusMessage ? (
              <div className="pitch-feed-status" role="status" aria-live="polite">
                {statusMessage}
              </div>
            ) : null}

            {liveToast ? (
              <div className="pitch-live-toast" role="status" aria-live="polite">
                {liveToast}
              </div>
            ) : null}

            <div className="pitch-feed-actions">
              <button type="button" className="pitch-back-to-top" onClick={handleBackToTop}>
                Back to top
              </button>
            </div>

            {SLOT_UPGRADE_ENABLED ? (
              <div className="slot-testimonials" aria-label="Founder testimonials">
                <div className="slot-testimonials-header">
                  <h4>Founder voices</h4>
                  {founderAvatarStack.length ? (
                    <div className="slot-founder-stack" aria-hidden="true">
                      {founderAvatarStack.map((founder) =>
                        founder.photo ? (
                          <span
                            key={`${founder.name}-photo`}
                            className="slot-founder-dot"
                            style={{ backgroundImage: `url(${founder.photo})` }}
                          />
                        ) : (
                          <span key={`${founder.name}-fallback`} className="slot-founder-dot fallback">
                            {founder.name.charAt(0).toUpperCase()}
                          </span>
                        )
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="slot-testimonials-grid">
                  {testimonials.map((item) => (
                    <article key={`testimonial-${item.id}`} className="slot-testimonial-card">
                      <p>&ldquo;{item.quote}&rdquo;</p>
                      <span>
                        {item.author} · {item.role}
                      </span>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
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
