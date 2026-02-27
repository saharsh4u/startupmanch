"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import ExpandedPitchOverlay from "@/components/ExpandedPitchOverlay";
import PitchShowCard, { type PitchShow } from "@/components/PitchShowCard";
import { pitches as fallbackPitches } from "@/data/pitches";
import { POST_PITCH_FALLBACK_HREF, openPostPitchFlow } from "@/lib/post-pitch";

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
  instagram_url?: string | null;
};

type FeedResponsePayload = {
  data?: ApiPitch[];
  window_id?: number | null;
  next_shuffle_at?: string | null;
};

type LiveApprovalPayload = {
  items?: Array<{
    id: string;
    startup_name: string;
    approved_at: string;
  }>;
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
  instagram_url: string | null;
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

type FeedCacheSnapshot = {
  version: 1;
  savedAt: number;
  items: FeedPitch[];
  weekPicks: FeedPitch[];
  fixedTopPitches: FeedPitch[] | null;
  availableCategories: string[];
  nextShuffleAtMs: number | null;
};

type SlotFilter = "all" | "approved" | "open";
type RowSlot = { type: "approved"; pitch: FeedPitch } | { type: "open"; id: string };
type MobileStackItem =
  | { type: "approved"; id: string; pitch: FeedPitch }
  | { type: "open"; id: string };
type CommunityRailItem = RowSlot;
type CommunityRail = { id: string; title: string; items: CommunityRailItem[] };

const SLOT_UPGRADE_ENABLED = process.env.NEXT_PUBLIC_PITCH_SLOT_UPGRADE === "1";

const FEED_PAGE_SIZE = 50;
const ROW_SIZE = 5;
const MORE_PITCH_COLUMN_COUNT = 3;
const MOBILE_MORE_PITCH_ROW_COUNT = 3;
const MOBILE_STACK_MIN_ITEMS = 50;
const INITIAL_SKELETON_ROWS = 2;
const TEASER_MAX = 10;
const PENDING_SLOT_MAX = 12;
const FEED_CACHE_TTL_MS = 15 * 60 * 1000;
const FEED_CACHE_KEY_PREFIX = "pitch-feed-cache-v1";
const SHUFFLE_WINDOW_SECONDS = 5 * 60;
const SLOT_REORDER_MIN_MS = 8_000;
const SLOT_REORDER_MAX_MS = 16_000;
const HOT_AUTOPLAY_INTERVAL_MS = 2600;
const HOT_AUTOPLAY_RESUME_DELAY_MS = 1600;
const HOT_WHEEL_SETTLE_MS = 560;
const COMMUNITY_RAIL_COUNT = 3;
const COMMUNITY_RAIL_SIZE = 10;
const SHOW_HOT_PITCHES = false;

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

const carouselPlatforms = [
  {
    label: "N",
    badgeClassName: "is-netflix",
    glowRgb: "200,20,20",
  },
  {
    label: "HBO",
    badgeClassName: "is-hbo",
    glowRgb: "50,80,200",
  },
  {
    label: "H",
    badgeClassName: "is-hulu",
    glowRgb: "20,180,100",
  },
  {
    label: "D+",
    badgeClassName: "is-disney",
    glowRgb: "30,80,200",
  },
] as const;

const hotCinemaDropOffsets = [0, 65, 105, 135] as const;
const hotCinemaFlatOffsets = [0, 0, 0, 0] as const;

const slotOpenCopyVariants = [
  {
    title: "Your startup could be here.",
    description: "Share in 60 seconds. Get discovered.",
    cta: "Submit Your Startup",
  },
  {
    title: "Next big idea goes here.",
    description: "Investors are watching.",
    cta: "Submit Now",
  },
  {
    title: "Don't scroll. Build.",
    description: "Share in 60 seconds. Get discovered.",
    cta: "Submit Now",
  },
] as const;

const communityRailTitles = ["Fresh picks", "Builder spotlight", "Just shipped"] as const;

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

const distributeByColumn = <T,>(items: T[], columns: number) => {
  const count = Math.max(1, columns);
  const groups = Array.from({ length: count }, () => [] as T[]);
  items.forEach((item, index) => {
    groups[index % count].push(item);
  });
  return groups;
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

const platformForKey = (key: string) => carouselPlatforms[hashString(key) % carouselPlatforms.length];

const makeHotGlowBackground = (rgb: string) => `rgba(${rgb}, 0.24)`;

const hotCinemaPosClassForDistance = (distance: number) => `pos-${Math.min(3, Math.max(0, distance))}`;

const getErrorMessage = (error: unknown) => {
  if (error instanceof DOMException && error.name === "AbortError") return null;
  if (error instanceof Error && error.message.trim().length) return error.message;
  return "Unable to load more videos.";
};

const wrapIndex = (value: number, length: number) => {
  if (length <= 0) return 0;
  return ((value % length) + length) % length;
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

export default function PitchFeed({ onPostPitch }: { onPostPitch?: () => void }) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const moreSectionRef = useRef<HTMLDivElement | null>(null);
  const initialAbortRef = useRef<AbortController | null>(null);
  const shuffleRefreshLockRef = useRef(false);
  const hotGlowLayerRef = useRef<"a" | "b">("a");
  const hotWheelAccumRef = useRef(0);
  const hotWheelTimerRef = useRef<number | null>(null);
  const hotWheelLockedRef = useRef(false);
  const hotPointerStartXRef = useRef<number | null>(null);
  const hotPointerStartYRef = useRef<number | null>(null);
  const hotPointerLastXRef = useRef<number>(0);
  const hotPointerLastTimeRef = useRef<number>(0);
  const hotPointerVelocityRef = useRef<number>(0);
  const hotDragRafRef = useRef<number | null>(null);
  const hotDragOffsetRef = useRef(0);
  const hotPointerSuppressClickRef = useRef(false);
  const hotAutoplayResumeTimerRef = useRef<number | null>(null);
  const mobileStackPointerStartYRef = useRef<number | null>(null);
  const mobileStackPointerStartXRef = useRef<number | null>(null);
  const mobileStackPointerLastYRef = useRef<number>(0);
  const mobileStackPointerLastTimeRef = useRef<number>(0);
  const mobileStackPointerVelocityRef = useRef<number>(0);
  const mobileStackDragRafRef = useRef<number | null>(null);
  const mobileStackDragOffsetRef = useRef(0);
  const mobileStackPointerSuppressClickRef = useRef(false);

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
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);

  const [slotFilter, setSlotFilter] = useState<SlotFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [slotShuffleSeed, setSlotShuffleSeed] = useState(
    () => Math.floor(Math.random() * 1_000_000_000)
  );

  const [hoveredPreviewPitchId, setHoveredPreviewPitchId] = useState<string | null>(null);
  const [focusedPreviewPitchId, setFocusedPreviewPitchId] = useState<string | null>(null);
  const [visiblePreviewPitchIds, setVisiblePreviewPitchIds] = useState<Set<string>>(new Set());
  const [loadedPreviewPitchIds, setLoadedPreviewPitchIds] = useState<Set<string>>(new Set());
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isDesktopHotViewport, setIsDesktopHotViewport] = useState(false);
  const [hotAutoplayPaused, setHotAutoplayPaused] = useState(false);
  const [isDocumentHidden, setIsDocumentHidden] = useState(false);
  const [moreSectionInView, setMoreSectionInView] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isCommunityFilterOpen, setIsCommunityFilterOpen] = useState(false);
  const [isCommunityRailInteracting, setIsCommunityRailInteracting] = useState(false);
  const communityRailRefs = useRef<Array<HTMLDivElement | null>>([]);
  const communityRailResumeTimerRef = useRef<number | null>(null);
  const communityRailInteractingRef = useRef(false);
  const communityRailPauseUntilRef = useRef(0);
  const communityRailCarryRef = useRef<number[]>([]);
  const liveApprovalCursorRef = useRef<string | null>(null);
  const liveApprovalPollBusyRef = useRef(false);
  const cacheKey = useMemo(
    () => `${FEED_CACHE_KEY_PREFIX}:${normalizeCategory(selectedCategory) || "__all__"}`,
    [selectedCategory]
  );

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
      instagramUrl: null,
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
      tagline: item.one_liner ?? item.category ?? "New video",
      poster: item.poster_url ?? item.founder_photo_url ?? fallbackPoster,
      video: item.video_url ?? null,
      instagramUrl: item.instagram_url ?? null,
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
      const fetchInitialFeedPage = async () => {
        const feedPath = buildPitchFeedPath({
          mode: "feed",
          selectedCategory,
          limit: FEED_PAGE_SIZE,
          offset: 0,
          shuffle: true,
        });

        const response = await fetch(feedPath, {
          cache: "no-store",
          signal,
        });

        if (!response.ok) {
          throw new Error("Unable to load videos.");
        }

        const payload = (await response.json()) as FeedResponsePayload;

        return {
          data: (payload.data ?? []) as ApiPitch[],
          nextShuffleAt:
            typeof payload.next_shuffle_at === "string" ? payload.next_shuffle_at : null,
        };
      };

      const weekPromise = fetch(
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
      )
        .then(async (response) => {
          if (!response.ok) return null;
          return (await response.json()) as FeedResponsePayload;
        })
        .catch(() => null);

      const feedPayload = await fetchInitialFeedPage();
      const pushLiveApprovalCursor = (candidate: string | null | undefined) => {
        const next = (candidate ?? "").trim();
        if (!next) return;
        const nextMs = Date.parse(next);
        if (!Number.isFinite(nextMs)) return;

        const current = liveApprovalCursorRef.current;
        if (!current) {
          liveApprovalCursorRef.current = next;
          return;
        }

        const currentMs = Date.parse(current);
        if (!Number.isFinite(currentMs) || nextMs > currentMs) {
          liveApprovalCursorRef.current = next;
        }
      };

      if (!feedPayload.data.length) {
        setWeekPicks([]);
      }

      const weekData: ApiPitch[] = [];
      const feedData = feedPayload.data;
      feedData.forEach((item) => pushLiveApprovalCursor(item.approved_at ?? null));
      weekData.forEach((item) => pushLiveApprovalCursor(item.approved_at ?? null));
      const discoveredCategories = Array.from(
        new Set(
          [...weekData, ...feedData]
            .map((item) => (item.category ?? "").trim())
            .filter((item) => item.length > 0)
        )
      ).sort((left, right) => left.localeCompare(right));
      setAvailableCategories((current) => {
        const merged = Array.from(
          new Set([...current, ...discoveredCategories].map((item) => item.trim()).filter(Boolean))
        ).sort((left, right) => left.localeCompare(right));
        if (merged.length === current.length && merged.every((item, index) => item === current[index])) {
          return current;
        }
        return merged;
      });

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

      void weekPromise.then((weekPayload) => {
        if (!weekPayload || signal.aborted) return;

        const asyncWeekData = (weekPayload.data ?? []) as ApiPitch[];
        const asyncDiscoveredCategories = Array.from(
          new Set(
            asyncWeekData
              .map((item) => (item.category ?? "").trim())
              .filter((item) => item.length > 0)
          )
        ).sort((left, right) => left.localeCompare(right));

        if (asyncDiscoveredCategories.length) {
          setAvailableCategories((current) => {
            const merged = Array.from(
              new Set([...current, ...asyncDiscoveredCategories].map((item) => item.trim()).filter(Boolean))
            ).sort((left, right) => left.localeCompare(right));
            if (
              merged.length === current.length &&
              merged.every((item, index) => item === current[index])
            ) {
              return current;
            }
            return merged;
          });
        }

        const asyncMappedWeek = asyncWeekData.map((item, index) => mapPitch(item, index)).slice(0, 4);
        asyncWeekData.forEach((item) => pushLiveApprovalCursor(item.approved_at ?? null));
        const asyncFilteredWeek = asyncMappedWeek.filter((item) => matchesCategory(item, selectedCategory));
        const asyncWeekIds = new Set(asyncFilteredWeek.map((item) => item.id));
        const asyncFilteredFeed = dedupePitches(
          mappedFeed
            .filter((item) => matchesCategory(item, selectedCategory))
            .filter((item) => !asyncWeekIds.has(item.id))
        );
        const asyncBaseFeed = asyncFilteredFeed.length ? asyncFilteredFeed : filteredFallback;
        const asyncTopPitches = buildTopPitches(asyncFilteredWeek, asyncBaseFeed, filteredFallback);

        setWeekPicks(asyncFilteredWeek);
        setItems(asyncFilteredFeed);
        if (!options?.refreshOnly) {
          setFixedTopPitches(asyncTopPitches);
        }
      });

      if (SLOT_UPGRADE_ENABLED) {
        void fetch("/api/pitches/teasers", { cache: "no-store", signal })
          .then(async (response) => {
            if (!response.ok) return null;
            return response.json();
          })
          .then((teaserPayload) => {
            if (!teaserPayload || signal.aborted) return;

            const approved = ((teaserPayload.approved ?? []) as TeaserApproved[])
              .filter((item) => matchesCategory({ category: item.category }, selectedCategory))
              .slice(0, 8);
            approved.forEach((item) => pushLiveApprovalCursor(item.approved_at ?? null));

            const pending = ((teaserPayload.pending ?? []) as TeaserPending[])
              .filter((item) => matchesCategory({ category: item.category }, selectedCategory))
              .slice(0, PENDING_SLOT_MAX);

            setApprovedTeasers(approved);
            setPendingTeasers(pending);
          })
          .catch(() => {
            // Keep existing teasers on transient failures.
          });
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
    [filteredFallback, mapPitch, selectedCategory]
  );

  useEffect(() => {
    let active = true;
    let hydratedFromCache = false;

    initialAbortRef.current?.abort();
    const controller = new AbortController();
    initialAbortRef.current = controller;

    setLoadError(null);
    setOverlayPitches([]);
    setExpandedIndex(null);

    if (typeof window !== "undefined") {
      try {
        const raw = window.sessionStorage.getItem(cacheKey);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<FeedCacheSnapshot>;
          const isFresh =
            typeof parsed.savedAt === "number" && Date.now() - parsed.savedAt < FEED_CACHE_TTL_MS;
          const hasFeedArrays = Array.isArray(parsed.items) && Array.isArray(parsed.weekPicks);

          if (isFresh && hasFeedArrays) {
            hydratedFromCache = true;
            setItems(parsed.items as FeedPitch[]);
            setWeekPicks(parsed.weekPicks as FeedPitch[]);
            setFixedTopPitches(
              Array.isArray(parsed.fixedTopPitches) ? (parsed.fixedTopPitches as FeedPitch[]) : null
            );
            setAvailableCategories(
              Array.isArray(parsed.availableCategories)
                ? parsed.availableCategories.filter(
                    (item): item is string => typeof item === "string" && item.trim().length > 0
                  )
                : []
            );

            const cachedNextShuffleAtMs =
              typeof parsed.nextShuffleAtMs === "number" ? parsed.nextShuffleAtMs : null;
            setNextShuffleAtMs(cachedNextShuffleAtMs);
            if (cachedNextShuffleAtMs) {
              setShuffleCountdown(Math.max(0, Math.ceil((cachedNextShuffleAtMs - Date.now()) / 1000)));
            }
            setLoaded(true);
            setLoadingInitial(false);
          } else {
            window.sessionStorage.removeItem(cacheKey);
          }
        }
      } catch {
        // Ignore cache parsing/storage errors.
      }
    }

    if (!hydratedFromCache) {
      setLoaded(false);
      setLoadingInitial(true);
      setItems([]);
      setWeekPicks([]);
      setFixedTopPitches(null);
    }

    const loadInitialData = async () => {
      try {
        await loadSectionData(controller.signal);
      } catch (error) {
        const message = getErrorMessage(error);
        if (!active || !message) return;
        if (hydratedFromCache) {
          setLoadError(message);
          return;
        }

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
  }, [cacheKey, filteredFallback, loadSectionData]);

  useEffect(() => {
    if (loadingInitial) return;
    if (typeof window === "undefined") return;

    const snapshot: FeedCacheSnapshot = {
      version: 1,
      savedAt: Date.now(),
      items,
      weekPicks,
      fixedTopPitches,
      availableCategories,
      nextShuffleAtMs,
    };

    try {
      window.sessionStorage.setItem(cacheKey, JSON.stringify(snapshot));
    } catch {
      // Ignore storage quota/privacy failures.
    }
  }, [availableCategories, cacheKey, fixedTopPitches, items, loadingInitial, nextShuffleAtMs, weekPicks]);

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
    if (loadingInitial) return;

    const pollLiveApprovals = async () => {
      if (liveApprovalPollBusyRef.current) return;
      liveApprovalPollBusyRef.current = true;

      try {
        const params = new URLSearchParams();
        params.set("limit", "20");
        const cursor = liveApprovalCursorRef.current;
        if (cursor) {
          params.set("after", cursor);
        }

        const res = await fetch(`/api/pitches/approvals/live?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;

        const payload = (await res.json()) as LiveApprovalPayload;
        const items = (payload.items ?? []).filter((item) => Boolean(item.approved_at));
        if (!items.length) return;

        const latestApprovedAt = items.reduce((latest, item) => {
          const itemMs = Date.parse(item.approved_at);
          const latestMs = Date.parse(latest);
          if (!Number.isFinite(itemMs)) return latest;
          if (!Number.isFinite(latestMs) || itemMs > latestMs) return item.approved_at;
          return latest;
        }, liveApprovalCursorRef.current ?? "");

        if (latestApprovedAt) {
          liveApprovalCursorRef.current = latestApprovedAt;
        }

        if (!cursor) return;

        const refreshController = new AbortController();
        await loadSectionData(refreshController.signal, { refreshOnly: true });
        if (items.length === 1) {
          setLiveToast(`${items[0]?.startup_name ?? "Startup"} just went live`);
        } else {
          setLiveToast(`${items.length} new videos just went live`);
        }
      } catch {
        // Keep existing UI and retry on next poll.
      } finally {
        liveApprovalPollBusyRef.current = false;
      }
    };

    const timer = window.setInterval(() => {
      void pollLiveApprovals();
    }, 12_000);

    return () => window.clearInterval(timer);
  }, [loadSectionData, loadingInitial]);

  useEffect(() => {
    const updateViewport = () => {
      setIsMobileViewport(window.matchMedia("(max-width: 768px)").matches);
      setIsDesktopHotViewport(window.matchMedia("(min-width: 901px)").matches);
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setPrefersReducedMotion(mediaQuery.matches);
    syncPreference();
    mediaQuery.addEventListener("change", syncPreference);
    return () => mediaQuery.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    const syncVisibility = () => {
      setIsDocumentHidden(document.hidden);
    };
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  useEffect(() => {
    if (isDesktopHotViewport) return;
    if (hotAutoplayResumeTimerRef.current !== null) {
      window.clearTimeout(hotAutoplayResumeTimerRef.current);
      hotAutoplayResumeTimerRef.current = null;
    }
    setHotAutoplayPaused(false);
  }, [isDesktopHotViewport]);

  useEffect(() => {
    if (moreSectionInView) return;
    const node = moreSectionRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMoreSectionInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [moreSectionInView]);

  const pauseCommunityRailAutoScroll = useCallback((resumeDelayMs = 1400) => {
    if (communityRailResumeTimerRef.current !== null) {
      window.clearTimeout(communityRailResumeTimerRef.current);
      communityRailResumeTimerRef.current = null;
    }
    communityRailInteractingRef.current = true;
    communityRailPauseUntilRef.current = Date.now() + Math.max(350, resumeDelayMs);
    setIsCommunityRailInteracting(true);
    communityRailResumeTimerRef.current = window.setTimeout(() => {
      communityRailInteractingRef.current = false;
      communityRailPauseUntilRef.current = 0;
      setIsCommunityRailInteracting(false);
      communityRailResumeTimerRef.current = null;
    }, resumeDelayMs);
  }, []);

  useEffect(() => {
    return () => {
      if (communityRailResumeTimerRef.current !== null) {
        window.clearTimeout(communityRailResumeTimerRef.current);
      }
      communityRailInteractingRef.current = false;
      communityRailPauseUntilRef.current = 0;
    };
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

  const topPitches = SHOW_HOT_PITCHES ? fixedTopPitches ?? dynamicTopPitches : [];
  const topIds = useMemo(
    () => new Set((SHOW_HOT_PITCHES ? topPitches : []).map((item) => item.id)),
    [topPitches]
  );

  const approvedMorePitches = useMemo(
    () => dedupePitches(baseFeed.filter((item) => !topIds.has(item.id))),
    [baseFeed, topIds]
  );

  const carouselPitches = useMemo(
    () => dedupePitches([...topPitches, ...approvedMorePitches, ...filteredFallback]).slice(0, 12),
    [approvedMorePitches, filteredFallback, topPitches]
  );
  const hotCinemaVisibleOffsets = useMemo(() => {
    if (carouselPitches.length <= 1) return [0] as number[];
    if (carouselPitches.length <= 3) return [-1, 0, 1] as number[];
    if (carouselPitches.length <= 6) return [-2, -1, 0, 1, 2] as number[];
    return [-3, -2, -1, 0, 1, 2, 3] as number[];
  }, [carouselPitches.length]);

  const [hotCarouselIndex, setHotCarouselIndex] = useState(2);
  const [hotCarouselDragging, setHotCarouselDragging] = useState(false);
  const [hotCarouselWheeling, setHotCarouselWheeling] = useState(false);
  const [hotCarouselDragOffset, setHotCarouselDragOffset] = useState(0);
  const [mobileStackIndex, setMobileStackIndex] = useState(0);
  const [mobileStackDragging, setMobileStackDragging] = useState(false);
  const [mobileStackDragOffsetY, setMobileStackDragOffsetY] = useState(0);
  const [hotGlowActiveLayer, setHotGlowActiveLayer] = useState<"a" | "b">("a");
  const [hotGlowBackgroundA, setHotGlowBackgroundA] = useState(() => makeHotGlowBackground("200,20,20"));
  const [hotGlowBackgroundB, setHotGlowBackgroundB] = useState(() => makeHotGlowBackground("200,20,20"));

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

  const communityRailSource = useMemo<CommunityRailItem[]>(() => {
    if (rowSlots.length) return rowSlots;
    return Array.from({ length: ROW_SIZE }, (_, index) => ({
      type: "open" as const,
      id: `community-open-slot-${index + 1}`,
    }));
  }, [rowSlots]);

  const communityRails = useMemo<CommunityRail[]>(() => {
    if (!communityRailSource.length) return [];

    const expanded: CommunityRailItem[] = [];
    const totalNeeded = COMMUNITY_RAIL_COUNT * COMMUNITY_RAIL_SIZE;
    for (let index = 0; index < totalNeeded; index += 1) {
      if (index < communityRailSource.length) {
        expanded.push(communityRailSource[index]);
      } else {
        expanded.push({
          type: "open" as const,
          id: `community-open-slot-fill-${index + 1}`,
        });
      }
    }

    return Array.from({ length: COMMUNITY_RAIL_COUNT }, (_, railIndex) => {
      const start = railIndex * COMMUNITY_RAIL_SIZE;
      return {
        id: `community-rail-${railIndex + 1}`,
        title: communityRailTitles[railIndex] ?? `Rail ${railIndex + 1}`,
        items: expanded.slice(start, start + COMMUNITY_RAIL_SIZE),
      };
    });
  }, [communityRailSource]);

  useEffect(() => {
    if (prefersReducedMotion || isDocumentHidden || !communityRails.length) return;

    const syncCarryLength = (railCount: number) => {
      const current = communityRailCarryRef.current;
      if (current.length === railCount) return current;
      if (current.length > railCount) {
        communityRailCarryRef.current = current.slice(0, railCount);
        return communityRailCarryRef.current;
      }
      communityRailCarryRef.current = [...current, ...Array.from({ length: railCount - current.length }, () => 0)];
      return communityRailCarryRef.current;
    };

    let rafId = 0;
    let lastTime = performance.now();

    const tick = (time: number) => {
      const deltaMs = Math.min(42, Math.max(0, time - lastTime));
      lastTime = time;

      const rails = communityRailRefs.current.filter((node): node is HTMLDivElement => Boolean(node));
      const carry = syncCarryLength(rails.length);

      const isPausedByInteraction =
        communityRailInteractingRef.current && Date.now() < communityRailPauseUntilRef.current;

      if (!isPausedByInteraction) {
        if (communityRailInteractingRef.current) {
          communityRailInteractingRef.current = false;
          communityRailPauseUntilRef.current = 0;
          setIsCommunityRailInteracting(false);
        }

        rails.forEach((rail, railIndex) => {
          const halfWidth = rail.scrollWidth / 2;
          if (halfWidth <= rail.clientWidth + 1) {
            carry[railIndex] = 0;
            return;
          }

          const direction = railIndex % 2 === 1 ? -1 : 1;
          if (direction > 0 && rail.scrollLeft <= 0) {
            rail.scrollLeft = 1;
          } else if (direction < 0 && rail.scrollLeft <= 1) {
            rail.scrollLeft = Math.max(1, halfWidth - 1);
          }

          const speedPxPerMs = 0.058 + railIndex * 0.006;
          const nextCarry = (carry[railIndex] ?? 0) + direction * speedPxPerMs * deltaMs;
          const wholePixels = nextCarry >= 0 ? Math.floor(nextCarry) : Math.ceil(nextCarry);
          carry[railIndex] = nextCarry - wholePixels;
          if (wholePixels === 0) return;

          let nextLeft = rail.scrollLeft + wholePixels;
          if (direction > 0) {
            while (nextLeft >= halfWidth) nextLeft -= halfWidth;
          } else {
            while (nextLeft <= 0) nextLeft += halfWidth;
          }

          rail.scrollLeft = nextLeft;
        });
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [communityRails.length, isDocumentHidden, prefersReducedMotion]);


  const columnGroups = useMemo(() => {
    const distributed = distributeByColumn(rowSlots, MORE_PITCH_COLUMN_COUNT);
    return distributed.map((column, columnIndex) => {
      if (column.length) return column;
      return [{ type: "open" as const, id: `placeholder-column-${columnIndex + 1}` }];
    });
  }, [rowSlots]);

  const mobileVideoSlots = useMemo(
    () => approvedVisible.map((pitch) => ({ type: "approved" as const, pitch })),
    [approvedVisible]
  );

  const mobileRowGroups = useMemo(() => {
    const totalNeeded = MOBILE_MORE_PITCH_ROW_COUNT * ROW_SIZE;
    const source = mobileVideoSlots.length
      ? mobileVideoSlots
      : rowSlots.length
        ? rowSlots
        : [{ type: "open" as const, id: "placeholder-mobile-1" }];
    const expanded: RowSlot[] = [];

    for (let index = 0; index < totalNeeded; index += 1) {
      expanded.push(source[index % source.length] as RowSlot);
    }

    return chunkBySize(expanded, ROW_SIZE).slice(0, MOBILE_MORE_PITCH_ROW_COUNT);
  }, [mobileVideoSlots, rowSlots]);
  const mobileStackItems = useMemo<MobileStackItem[]>(() => {
    const approved = approvedVisible.map((pitch) => ({
      type: "approved" as const,
      id: pitch.id,
      pitch,
    }));

    if (approved.length >= MOBILE_STACK_MIN_ITEMS) {
      return approved;
    }

    if (approved.length > 0) {
      const repeated: MobileStackItem[] = [];
      for (let index = 0; index < MOBILE_STACK_MIN_ITEMS; index += 1) {
        const base = approved[index % approved.length];
        repeated.push({
          type: "approved",
          id: `${base.id}-stack-${index + 1}`,
          pitch: base.pitch,
        });
      }
      return repeated;
    }

    return Array.from({ length: MOBILE_STACK_MIN_ITEMS }, (_, index) => ({
      type: "open" as const,
      id: `mobile-stack-open-slot-${index + 1}`,
    }));
  }, [approvedVisible]);
  const mobileStackVisibleOffsets = useMemo(() => {
    const length = mobileStackItems.length;
    if (length <= 1) return [0] as number[];
    if (length <= 3) return [-1, 0, 1] as number[];
    return [-2, -1, 0, 1, 2] as number[];
  }, [mobileStackItems.length]);

  const expandedList = useMemo(() => [...topPitches, ...approvedMorePitches], [approvedMorePitches, topPitches]);
  const hasVisiblePitches = topPitches.length > 0 || approvedMorePitches.length > 0;

  useEffect(() => {
    if (!carouselPitches.length) {
      setHotCarouselIndex(0);
      return;
    }
    setHotCarouselIndex((current) => wrapIndex(current, carouselPitches.length));
  }, [carouselPitches]);

  useEffect(() => {
    if (!mobileStackItems.length) {
      setMobileStackIndex(0);
      return;
    }
    setMobileStackIndex((current) => wrapIndex(current, mobileStackItems.length));
  }, [mobileStackItems]);

  const setHotCarouselTo = useCallback(
    (index: number) => {
      if (!carouselPitches.length) return;
      setHotCarouselIndex(wrapIndex(index, carouselPitches.length));
    },
    [carouselPitches.length]
  );

  const shiftHotCarousel = useCallback(
    (delta: number) => {
      if (carouselPitches.length <= 1) return;
      setHotCarouselIndex((current) => wrapIndex(current + delta, carouselPitches.length));
    },
    [carouselPitches.length]
  );

  const clearHotAutoplayResumeTimer = useCallback(() => {
    if (hotAutoplayResumeTimerRef.current === null) return;
    window.clearTimeout(hotAutoplayResumeTimerRef.current);
    hotAutoplayResumeTimerRef.current = null;
  }, []);

  const pauseHotAutoplay = useCallback(() => {
    clearHotAutoplayResumeTimer();
    setHotAutoplayPaused(true);
  }, [clearHotAutoplayResumeTimer]);

  const resumeHotAutoplaySoon = useCallback(
    (delay = HOT_AUTOPLAY_RESUME_DELAY_MS) => {
      clearHotAutoplayResumeTimer();
      setHotAutoplayPaused(true);
      hotAutoplayResumeTimerRef.current = window.setTimeout(() => {
        hotAutoplayResumeTimerRef.current = null;
        setHotAutoplayPaused(false);
      }, delay);
    },
    [clearHotAutoplayResumeTimer]
  );

  const handleHotCarouselWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (carouselPitches.length <= 1) return;
      event.preventDefault();

      if (hotWheelLockedRef.current) return;

      const threshold = isDesktopHotViewport ? 68 : 44;
      const previewLimit = isDesktopHotViewport ? 86 : 52;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      hotWheelAccumRef.current += delta;
      const previewOffset = Math.max(
        -previewLimit,
        Math.min(previewLimit, (hotWheelAccumRef.current / threshold) * previewLimit)
      );
      setHotCarouselWheeling(true);
      setHotCarouselDragOffset(previewOffset);

      if (hotWheelTimerRef.current !== null) {
        window.clearTimeout(hotWheelTimerRef.current);
      }

      pauseHotAutoplay();
      if (Math.abs(hotWheelAccumRef.current) >= threshold) {
        const direction = hotWheelAccumRef.current > 0 ? 1 : -1;
        hotWheelAccumRef.current = 0;
        hotWheelLockedRef.current = true;
        setHotCarouselDragOffset(0);
        shiftHotCarousel(direction);
        window.setTimeout(() => {
          hotWheelLockedRef.current = false;
          setHotCarouselWheeling(false);
        }, HOT_WHEEL_SETTLE_MS);
        resumeHotAutoplaySoon();
        return;
      }

      hotWheelTimerRef.current = window.setTimeout(() => {
        if (Math.abs(hotWheelAccumRef.current) > threshold * 0.32) {
          hotWheelLockedRef.current = true;
          shiftHotCarousel(hotWheelAccumRef.current > 0 ? 1 : -1);
          window.setTimeout(() => {
            hotWheelLockedRef.current = false;
            setHotCarouselWheeling(false);
          }, HOT_WHEEL_SETTLE_MS);
        } else {
          setHotCarouselWheeling(false);
        }
        hotWheelAccumRef.current = 0;
        setHotCarouselDragOffset(0);
        resumeHotAutoplaySoon();
      }, 160);
    },
    [carouselPitches.length, isDesktopHotViewport, pauseHotAutoplay, resumeHotAutoplaySoon, shiftHotCarousel]
  );

  const flushHotCarouselDragOffset = useCallback(() => {
    if (hotDragRafRef.current !== null) return;
    hotDragRafRef.current = window.requestAnimationFrame(() => {
      hotDragRafRef.current = null;
      setHotCarouselDragOffset(hotDragOffsetRef.current);
    });
  }, []);

  const resetHotCarouselDrag = useCallback(() => {
    hotPointerStartXRef.current = null;
    hotPointerStartYRef.current = null;
    hotPointerLastXRef.current = 0;
    hotPointerLastTimeRef.current = 0;
    hotPointerVelocityRef.current = 0;
    hotDragOffsetRef.current = 0;
    setHotCarouselDragging(false);
    setHotCarouselDragOffset(0);
  }, []);

  const handleHotCarouselPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (carouselPitches.length <= 1) return;
      pauseHotAutoplay();
      setHotCarouselWheeling(false);
      hotPointerStartXRef.current = event.clientX;
      hotPointerStartYRef.current = event.clientY;
      hotPointerLastXRef.current = event.clientX;
      hotPointerLastTimeRef.current = performance.now();
      hotPointerVelocityRef.current = 0;
      hotDragOffsetRef.current = 0;
      hotPointerSuppressClickRef.current = false;
      setHotCarouselDragging(true);
      setHotCarouselDragOffset(0);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [carouselPitches.length, pauseHotAutoplay]
  );

  const handleHotCarouselPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!hotCarouselDragging) return;
      if (hotPointerStartXRef.current === null) return;
      const startY = hotPointerStartYRef.current ?? event.clientY;
      const deltaY = event.clientY - startY;
      const deltaX = event.clientX - hotPointerStartXRef.current;
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
        hotPointerSuppressClickRef.current = false;
        resetHotCarouselDrag();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        return;
      }
      event.preventDefault();
      const dragRange = isDesktopHotViewport ? 360 : 280;
      const clampedDeltaX = Math.max(-dragRange, Math.min(dragRange, deltaX * 0.88));
      const now = performance.now();
      const lastTime = hotPointerLastTimeRef.current || now;
      const elapsed = Math.max(1, now - lastTime);
      const velocitySample = (event.clientX - hotPointerLastXRef.current) / elapsed;
      hotPointerVelocityRef.current = hotPointerVelocityRef.current * 0.78 + velocitySample * 0.22;
      hotPointerLastXRef.current = event.clientX;
      hotPointerLastTimeRef.current = now;
      hotDragOffsetRef.current = clampedDeltaX;
      flushHotCarouselDragOffset();
      const suppressThreshold = isDesktopHotViewport ? 16 : 10;
      if (Math.abs(deltaX) > suppressThreshold) {
        hotPointerSuppressClickRef.current = true;
      }
    },
    [flushHotCarouselDragOffset, hotCarouselDragging, isDesktopHotViewport, resetHotCarouselDrag]
  );

  const finishHotCarouselPointer = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (hotPointerStartXRef.current === null) return;
      const deltaX = hotDragOffsetRef.current;
      const threshold = isDesktopHotViewport ? 96 : isMobileViewport ? 44 : 68;
      const flickThreshold = isDesktopHotViewport ? 0.48 : isMobileViewport ? 0.3 : 0.38;
      const velocity = hotPointerVelocityRef.current;

      if (deltaX <= -threshold || velocity <= -flickThreshold) {
        shiftHotCarousel(1);
      } else if (deltaX >= threshold || velocity >= flickThreshold) {
        shiftHotCarousel(-1);
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      resetHotCarouselDrag();
      resumeHotAutoplaySoon();

      window.setTimeout(() => {
        hotPointerSuppressClickRef.current = false;
      }, 0);
    },
    [isDesktopHotViewport, isMobileViewport, resetHotCarouselDrag, resumeHotAutoplaySoon, shiftHotCarousel]
  );

  const handleHotCarouselPointerCaptureLost = useCallback(() => {
    if (!hotCarouselDragging) return;
    resetHotCarouselDrag();
    resumeHotAutoplaySoon();
  }, [hotCarouselDragging, resetHotCarouselDrag, resumeHotAutoplaySoon]);

  const handleHotCarouselKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        pauseHotAutoplay();
        shiftHotCarousel(1);
        resumeHotAutoplaySoon();
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        pauseHotAutoplay();
        shiftHotCarousel(-1);
        resumeHotAutoplaySoon();
      }
    },
    [pauseHotAutoplay, resumeHotAutoplaySoon, shiftHotCarousel]
  );

  const handleHotCinemaMouseEnter = useCallback(() => {
    if (!isDesktopHotViewport) return;
    pauseHotAutoplay();
  }, [isDesktopHotViewport, pauseHotAutoplay]);

  const handleHotCinemaMouseLeave = useCallback(() => {
    if (!isDesktopHotViewport) return;
    resumeHotAutoplaySoon(420);
  }, [isDesktopHotViewport, resumeHotAutoplaySoon]);

  const handleHotCinemaFocus = useCallback(() => {
    if (!isDesktopHotViewport) return;
    pauseHotAutoplay();
  }, [isDesktopHotViewport, pauseHotAutoplay]);

  const handleHotCinemaBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      if (!isDesktopHotViewport) return;
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      resumeHotAutoplaySoon(360);
    },
    [isDesktopHotViewport, resumeHotAutoplaySoon]
  );

  const shiftMobileStack = useCallback(
    (delta: number) => {
      if (mobileStackItems.length <= 1) return;
      setMobileStackIndex((current) => wrapIndex(current + delta, mobileStackItems.length));
    },
    [mobileStackItems.length]
  );

  const flushMobileStackDragOffset = useCallback(() => {
    if (mobileStackDragRafRef.current !== null) return;
    mobileStackDragRafRef.current = window.requestAnimationFrame(() => {
      mobileStackDragRafRef.current = null;
      setMobileStackDragOffsetY(mobileStackDragOffsetRef.current);
    });
  }, []);

  const resetMobileStackDrag = useCallback(() => {
    mobileStackPointerStartYRef.current = null;
    mobileStackPointerStartXRef.current = null;
    mobileStackPointerLastYRef.current = 0;
    mobileStackPointerLastTimeRef.current = 0;
    mobileStackPointerVelocityRef.current = 0;
    mobileStackDragOffsetRef.current = 0;
    setMobileStackDragging(false);
    setMobileStackDragOffsetY(0);
  }, []);

  const handleMobileStackPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!isMobileViewport) return;
      if (mobileStackItems.length <= 1) return;
      mobileStackPointerStartYRef.current = event.clientY;
      mobileStackPointerStartXRef.current = event.clientX;
      mobileStackPointerLastYRef.current = event.clientY;
      mobileStackPointerLastTimeRef.current = performance.now();
      mobileStackPointerVelocityRef.current = 0;
      mobileStackDragOffsetRef.current = 0;
      mobileStackPointerSuppressClickRef.current = false;
      setMobileStackDragging(true);
      setMobileStackDragOffsetY(0);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [isMobileViewport, mobileStackItems.length]
  );

  const handleMobileStackPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!mobileStackDragging) return;
      if (mobileStackPointerStartYRef.current === null || mobileStackPointerStartXRef.current === null) return;

      const deltaY = event.clientY - mobileStackPointerStartYRef.current;
      const deltaX = event.clientX - mobileStackPointerStartXRef.current;

      if (Math.abs(deltaX) > Math.abs(deltaY) + 6 && Math.abs(deltaX) > 12) {
        mobileStackPointerSuppressClickRef.current = false;
        resetMobileStackDrag();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        return;
      }

      event.preventDefault();
      const clampedDeltaY = Math.max(-280, Math.min(280, deltaY));
      const now = performance.now();
      const lastTime = mobileStackPointerLastTimeRef.current || now;
      const elapsed = Math.max(1, now - lastTime);
      const velocitySample = (event.clientY - mobileStackPointerLastYRef.current) / elapsed;
      mobileStackPointerVelocityRef.current =
        mobileStackPointerVelocityRef.current * 0.65 + velocitySample * 0.35;
      mobileStackPointerLastYRef.current = event.clientY;
      mobileStackPointerLastTimeRef.current = now;
      mobileStackDragOffsetRef.current = clampedDeltaY;
      flushMobileStackDragOffset();

      if (Math.abs(deltaY) > 8) {
        mobileStackPointerSuppressClickRef.current = true;
      }
    },
    [flushMobileStackDragOffset, mobileStackDragging, resetMobileStackDrag]
  );

  const finishMobileStackPointer = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (mobileStackPointerStartYRef.current === null) return;
      const deltaY = mobileStackDragOffsetRef.current;
      const threshold = 58;
      const flickThreshold = 0.34;
      const velocity = mobileStackPointerVelocityRef.current;

      if (deltaY <= -threshold || velocity <= -flickThreshold) {
        shiftMobileStack(1);
      } else if (deltaY >= threshold || velocity >= flickThreshold) {
        shiftMobileStack(-1);
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      resetMobileStackDrag();

      window.setTimeout(() => {
        mobileStackPointerSuppressClickRef.current = false;
      }, 0);
    },
    [resetMobileStackDrag, shiftMobileStack]
  );

  const handleMobileStackPointerCaptureLost = useCallback(() => {
    if (!mobileStackDragging) return;
    resetMobileStackDrag();
  }, [mobileStackDragging, resetMobileStackDrag]);

  const activePlatform = useMemo(
    () =>
      carouselPitches.length
        ? platformForKey(carouselPitches[hotCarouselIndex]?.id ?? "default")
        : carouselPlatforms[0],
    [carouselPitches, hotCarouselIndex]
  );

  useEffect(() => {
    const nextBackground = makeHotGlowBackground(activePlatform.glowRgb);
    if (hotGlowLayerRef.current === "a") {
      setHotGlowBackgroundB(nextBackground);
      setHotGlowActiveLayer("b");
      hotGlowLayerRef.current = "b";
      return;
    }

    setHotGlowBackgroundA(nextBackground);
    setHotGlowActiveLayer("a");
    hotGlowLayerRef.current = "a";
  }, [activePlatform.glowRgb, hotCarouselIndex]);

  useEffect(() => {
    if (!isDesktopHotViewport) return;
    if (loadingInitial) return;
    if (carouselPitches.length <= 1) return;
    if (hotCarouselDragging) return;
    if (hotAutoplayPaused) return;
    if (isDocumentHidden) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setTimeout(() => {
      shiftHotCarousel(1);
    }, HOT_AUTOPLAY_INTERVAL_MS);

    return () => window.clearTimeout(timer);
  }, [
    carouselPitches.length,
    hotAutoplayPaused,
    hotCarouselDragging,
    hotCarouselIndex,
    isDesktopHotViewport,
    isDocumentHidden,
    loadingInitial,
    shiftHotCarousel,
  ]);

  useEffect(
    () => () => {
      if (hotWheelTimerRef.current !== null) {
        window.clearTimeout(hotWheelTimerRef.current);
      }
      if (hotDragRafRef.current !== null) {
        window.cancelAnimationFrame(hotDragRafRef.current);
      }
      if (mobileStackDragRafRef.current !== null) {
        window.cancelAnimationFrame(mobileStackDragRafRef.current);
      }
      if (hotAutoplayResumeTimerRef.current !== null) {
        window.clearTimeout(hotAutoplayResumeTimerRef.current);
      }
    },
    []
  );

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
      setLoadedPreviewPitchIds(new Set());
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
        setLoadedPreviewPitchIds((previous) => {
          const next = new Set(previous);
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const id = entry.target.getAttribute("data-preview-pitch-id");
            if (!id) return;
            next.add(id);
          });
          return next;
        });
      },
      {
        root: null,
        threshold: 0.25,
        rootMargin: "160px 0px 160px 0px",
      }
    );

    elements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, [columnGroups, isMobileViewport, mobileRowGroups]);

  useEffect(() => {
    topPitches.forEach((pitch) => {
      if (!pitch.poster) return;
      const image = new Image();
      image.src = pitch.poster;
    });
  }, [topPitches]);

  const handleExpand = useCallback(
    (pitch: PitchShow) => {
      const snapshot = [...expandedList];
      const idx = snapshot.findIndex((item) => item.id === pitch.id);
      if (idx < 0) return;
      setOverlayPitches(snapshot);
      setExpandedIndex(idx);
    },
    [expandedList]
  );

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

  const triggerPostPitchEntry = useCallback(() => {
    if (onPostPitch) {
      onPostPitch();
      return;
    }
    openPostPitchFlow();
  }, [onPostPitch]);

  const activateMobileStackItem = useCallback(
    (item: MobileStackItem | undefined) => {
      if (!item) return;
      if (item.type === "approved") {
        handleExpand(item.pitch);
        return;
      }
      triggerPostPitchEntry();
    },
    [handleExpand, triggerPostPitchEntry]
  );

  const handleMobileStackKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        shiftMobileStack(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        shiftMobileStack(-1);
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activateMobileStackItem(mobileStackItems[mobileStackIndex]);
      }
    },
    [activateMobileStackItem, mobileStackIndex, mobileStackItems, shiftMobileStack]
  );

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
    const revealDelayMs = rowIndex * 120 + slotIndex * 70;

    if (slot.type === "approved") {
      const shouldPreview =
        !isClone &&
        (!SLOT_UPGRADE_ENABLED ||
          hoveredPreviewPitchId === slot.pitch.id ||
          focusedPreviewPitchId === slot.pitch.id ||
          visiblePreviewPitchIds.has(slot.pitch.id) ||
          loadedPreviewPitchIds.has(slot.pitch.id));

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
          style={
            isClone
              ? { ["--slot-accent" as string]: accent }
              : {
                  ["--slot-accent" as string]: accent,
                  ["--reveal-delay" as string]: `${revealDelayMs}ms`,
                }
          }
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
    const slotCopy = slotOpenCopyVariants[hashString(slot.id) % slotOpenCopyVariants.length];
    const cardClassName = `pitch-slot-open-card${isRefreshingApprovals && !isClone ? " is-refreshing" : ""}${isClone ? " is-clone" : ""}`;
    const cardContent = (
      <>
        <div className="pitch-slot-open-badge">Slot open</div>
        <h4>{slotCopy.title}</h4>
        <p>{slotCopy.description}</p>
        <span className="pitch-slot-open-action">{slotCopy.cta}</span>
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
          style={
            isClone
              ? { ["--slot-accent" as string]: accent }
              : {
                  ["--slot-accent" as string]: accent,
                  ["--reveal-delay" as string]: `${revealDelayMs}ms`,
                }
          }
          aria-hidden="true"
        >
          {cardContent}
        </div>
      );
    }

    return (
      <a
        key={`${slot.id}-row-${rowIndex}-${copy}-${slotIndex}`}
        href={POST_PITCH_FALLBACK_HREF}
        className={cardClassName}
        style={{
          ["--slot-accent" as string]: accent,
          ["--reveal-delay" as string]: `${revealDelayMs}ms`,
        }}
        aria-label="Submit your startup"
        onClick={(event) => {
          event.preventDefault();
          if (onPostPitch) {
            onPostPitch();
            return;
          }
          openPostPitchFlow();
        }}
      >
        {cardContent}
      </a>
    );
  };

  const statusMessage = loadingInitial
    ? "Loading videos…"
    : loadError
      ? loadError
      : SLOT_UPGRADE_ENABLED && isRefreshingApprovals
        ? "Reshuffling slots…"
        : null;

  const showHotPitches = SHOW_HOT_PITCHES;
  const overlayOpen = expandedIndex !== null && expandedIndex >= 0 && expandedIndex < overlayPitches.length;

  return (
    <section className={`pitch-section${showHotPitches ? "" : " is-more-only"}`} ref={sectionRef}>
      {!hasVisiblePitches && !loadingInitial ? (
        <div className="pitch-empty">
          <p className="pitch-subtext">
            {selectedCategory
              ? `No videos found in ${selectedCategory}. Try another category or All.`
              : "No videos available right now. Please check back soon."}
          </p>
        </div>
      ) : (
        <>
          {showHotPitches ? (
            <>
              <div className="pitch-header">
                <div className="pitch-header-spacer" aria-hidden="true" />
                <div className="pitch-header-copy">
                  <p className="pitch-kicker">Hot Videos</p>
                  <h3>Today&apos;s top 4</h3>
                  <p className="pitch-subtext">Featured by votes and freshness.</p>
                </div>
                <label className="pitch-category-picker">
                  <span>Category</span>
                  <select
                    value={selectedCategory ?? ""}
                    onChange={(event) => {
                      const next = event.target.value.trim();
                      setSelectedCategory(next.length ? next : null);
                    }}
                  >
                    <option value="">All categories</option>
                    {availableCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className={`pitch-mosaic hot-band${loaded ? " is-loaded" : ""}`}>
                <div
                  className="hot-cinema"
                  tabIndex={0}
                  onKeyDown={handleHotCarouselKeyDown}
                  onMouseEnter={handleHotCinemaMouseEnter}
                  onMouseLeave={handleHotCinemaMouseLeave}
                  onFocus={handleHotCinemaFocus}
                  onBlur={handleHotCinemaBlur}
                >
                  <div
                    className={`hot-cinema-glow-layer${hotGlowActiveLayer === "a" ? " is-active" : ""}`}
                    style={{ background: hotGlowBackgroundA }}
                    aria-hidden="true"
                  />
                  <div
                    className={`hot-cinema-glow-layer${hotGlowActiveLayer === "b" ? " is-active" : ""}`}
                    style={{ background: hotGlowBackgroundB }}
                    aria-hidden="true"
                  />
                  <div
                    className={`hot-cinema-track${hotCarouselDragging ? " is-dragging" : ""}${hotCarouselWheeling ? " is-wheeling" : ""}`}
                    aria-label="Hot videos carousel"
                    onWheel={handleHotCarouselWheel}
                    onPointerDown={handleHotCarouselPointerDown}
                    onPointerMove={handleHotCarouselPointerMove}
                    onPointerUp={finishHotCarouselPointer}
                    onPointerCancel={finishHotCarouselPointer}
                    onLostPointerCapture={handleHotCarouselPointerCaptureLost}
                  >
                    {hotCinemaVisibleOffsets.map((offset) => {
                      if (!carouselPitches.length) return null;
                      const targetIndex = wrapIndex(hotCarouselIndex + offset, carouselPitches.length);
                      const pitch = carouselPitches[targetIndex];
                      const distance = Math.min(3, Math.abs(offset));
                      const posClass = hotCinemaPosClassForDistance(distance);
                      const isCenter = offset === 0;
                      const platform = platformForKey(pitch.id);
                      const rating = (7 + asNumber(pitch.score) * 0.1 + (hashString(pitch.id) % 20) / 100).toFixed(1);
                      const horizontalSpacing = isDesktopHotViewport ? 246 : isMobileViewport ? 110 : 178;
                      const xShift = offset * horizontalSpacing;
                      const yShift = isDesktopHotViewport ? hotCinemaFlatOffsets[distance] : hotCinemaDropOffsets[distance];
                      const zIndex = 120 - distance * 20;

                      return (
                        <button
                          key={`hot-cinema-${pitch.id}-${offset}`}
                          type="button"
                          className={`hot-cinema-card ${posClass}${isCenter ? " active" : ""}`}
                          style={
                            {
                              ["--hot-x" as string]: `${xShift}px`,
                              ["--hot-y" as string]: `${yShift}px`,
                              ["--hot-drag-x" as string]: `${hotCarouselDragOffset}px`,
                              zIndex,
                            } as CSSProperties
                          }
                          aria-label={`Open video from ${pitch.name}`}
                          onClick={(event) => {
                            const clickTarget = event.target as HTMLElement | null;
                            const clickedPlayTrigger = Boolean(clickTarget?.closest(".hot-cinema-play-trigger"));
                            if (clickedPlayTrigger) {
                              handleExpand(pitch);
                              return;
                            }
                            if (hotPointerSuppressClickRef.current) return;
                            if (isDesktopHotViewport) {
                              pauseHotAutoplay();
                              resumeHotAutoplaySoon(700);
                            }
                            if (isCenter) {
                              handleExpand(pitch);
                              return;
                            }
                            setHotCarouselTo(targetIndex);
                          }}
                        >
                          <span
                            className="hot-cinema-poster"
                            style={{ backgroundImage: pitch.poster ? `url(${pitch.poster})` : undefined }}
                          />
                          <span className="hot-cinema-overlay" />
                          <span className="hot-cinema-play hot-cinema-play-trigger" aria-hidden="true">
                            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </span>
                          <span className={`hot-cinema-platform ${platform.badgeClassName}`}>{platform.label}</span>
                          <span className="hot-cinema-rating">
                            {rating}
                            <span className="star">★</span>
                          </span>
                          <span className="hot-cinema-info">
                            <span className="hot-cinema-title">{pitch.name}</span>
                            <span className="hot-cinema-meta">
                              <span className="hot-cinema-meta-tag">{pitch.category ?? "Video"}</span>
                              <span className="hot-cinema-meta-tag">60s video</span>
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          ) : null}

          <div
            className={`community-cinema${loaded ? " is-loaded" : ""}${moreSectionInView ? " is-visible" : ""}`}
            ref={moreSectionRef}
          >
            <div className="community-cinema-header">
              <div className="community-cinema-copy">
                <h3>See What People Are Building — And Build Yours Too</h3>
                <p className="pitch-subtext">
                  Watch ideas turn into products.
                  <br />
                  Then start your own.
                </p>
              </div>
              <button
                type="button"
                className={`community-filter-toggle${isCommunityFilterOpen ? " is-open" : ""}`}
                aria-expanded={isCommunityFilterOpen}
                aria-controls="community-filter-drawer"
                onClick={() => setIsCommunityFilterOpen((current) => !current)}
              >
                Filters
              </button>
            </div>

            <div
              id="community-filter-drawer"
              className={`community-filter-drawer${isCommunityFilterOpen ? " is-open" : ""}`}
            >
              <label className="community-search" aria-label="Search videos">
                <span>⌕</span>
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search startups, tags, or category"
                />
              </label>
              <div className="community-filter-chip-row" role="tablist" aria-label="Slot filters">
                {([
                  { id: "all", label: "All" },
                  { id: "approved", label: "Approved" },
                  { id: "open", label: "Open slots" },
                ] as Array<{ id: SlotFilter; label: string }>).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`slot-filter-chip community-filter-chip${slotFilter === item.id ? " is-active" : ""}`}
                    onClick={() => setSlotFilter(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {SLOT_UPGRADE_ENABLED ? (
                <p className="community-filter-note">
                  Positions reshuffle at random intervals, plus a full network shuffle every 5 min.
                </p>
              ) : null}
            </div>

            <div className="community-rails">
              {communityRails.map((rail, railIndex) => (
                <section key={rail.id} className="community-rail-block" aria-label={rail.title}>
                  <div
                    className={`community-rail${prefersReducedMotion ? " is-static" : ""}${
                      isCommunityRailInteracting ? " is-interacting" : ""
                    }`}
                    aria-label={rail.title}
                    ref={(node) => {
                      communityRailRefs.current[railIndex] = node;
                    }}
                    onPointerDown={() => pauseCommunityRailAutoScroll(2600)}
                    onPointerUp={() => pauseCommunityRailAutoScroll(950)}
                    onPointerCancel={() => pauseCommunityRailAutoScroll(950)}
                    onWheel={() => pauseCommunityRailAutoScroll(1300)}
                    onTouchStart={() => pauseCommunityRailAutoScroll(2600)}
                    onTouchEnd={() => pauseCommunityRailAutoScroll(1000)}
                    onFocusCapture={() => pauseCommunityRailAutoScroll(1800)}
                    onBlurCapture={() => pauseCommunityRailAutoScroll(900)}
                  >
                    <div className={`community-rail-track${railIndex % 2 === 1 ? " is-reverse" : ""}`}>
                      <div className="community-rail-segment" data-segment="primary">
                        {rail.items.map((slot, slotIndex) => (
                          <div
                            key={`${rail.id}-${slot.type}-${slot.type === "approved" ? slot.pitch.id : slot.id}-${slotIndex}-primary`}
                            className="community-rail-item"
                          >
                            {renderRowSlot(slot, railIndex, slotIndex, "primary")}
                          </div>
                        ))}
                      </div>
                      <div className="community-rail-segment is-clone" data-segment="clone" aria-hidden="true">
                        {rail.items.map((slot, slotIndex) => (
                          <div
                            key={`${rail.id}-${slot.type}-${slot.type === "approved" ? slot.pitch.id : slot.id}-${slotIndex}-clone`}
                            className="community-rail-item"
                          >
                            {renderRowSlot(slot, railIndex, slotIndex, "clone")}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
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
              <div className="slot-testimonials community-testimonials" aria-label="Founder testimonials">
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
