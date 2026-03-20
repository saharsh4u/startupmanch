"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from "react";
import PitchShowCard, { type PitchShow } from "@/components/PitchShowCard";
import { ROUNDTABLE_VIDEO_RAIL_SOURCE } from "@/lib/pitches/leaderboard";
import { hasBrowserSupabaseEnv, supabaseBrowser } from "@/lib/supabase/client";

type ApiPitch = {
  pitch_id: string;
  startup_id: string | null;
  startup_name: string | null;
  one_liner: string | null;
  category: string | null;
  poster_url: string | null;
  founder_photo_url?: string | null;
  in_count?: number;
  out_count?: number;
  comment_count?: number;
  score?: number;
  video_url?: string | null;
  video_hls_url?: string | null;
  video_mp4_url?: string | null;
  instagram_url?: string | null;
};

type FeedResponsePayload = {
  data?: ApiPitch[];
};

type InstagramResolvePayload = {
  video_url?: string | null;
  embed_url?: string | null;
};

type InstagramResolveState = {
  videoUrl: string | null;
  embedUrl: string | null;
  loading: boolean;
  attempted: boolean;
};

const VIDEO_FETCH_LIMIT = 48;
const AUTO_SCROLL_SPEED_PX_PER_MS = 0.06;
const INTERACTION_PAUSE_MS = 1400;
const HLS_ENABLED = process.env.NEXT_PUBLIC_VIDEO_HLS_ENABLED === "1";
const PIP_EDGE_GAP_PX = 8;
const RESOLVE_TIMEOUT_MS = 9000;

type RoundtableHomepageVideoRailProps = {
  sessionId: string;
  participantId: string | null;
  onPitchOpened?: () => void;
};

type SharedMiniPlayerPayload = {
  senderId: string;
  action: "open" | "close" | "state";
  pitchId?: string;
  timeSec?: number;
  paused?: boolean;
  sentAt?: number;
};

const asNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getPrimarySegmentWidth = (rail: HTMLDivElement) => {
  const segment = rail.querySelector<HTMLElement>('[data-segment="primary"]');
  const width = segment?.scrollWidth ?? rail.scrollWidth / 2;
  return Number.isFinite(width) ? Math.max(0, width) : 0;
};

const normalizeScrollLeft = (value: number, segmentWidth: number) => {
  if (segmentWidth <= 0) return 0;
  const wrapped = value % segmentWidth;
  return wrapped >= 0 ? wrapped : wrapped + segmentWidth;
};

const dedupeById = (items: PitchShow[]) => {
  const seen = new Set<string>();
  const deduped: PitchShow[] = [];

  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }

  return deduped;
};

const hasPlayableUpload = (item: PitchShow) =>
  Boolean(item.video || item.videoHlsUrl || item.videoMp4Url || item.instagramUrl);

const buildInstagramEmbedUrl = (instagramUrl: string | null) => {
  if (!instagramUrl) return null;
  const normalized = instagramUrl.trim();
  if (!normalized.length) return null;
  if (/\/embed\/?/i.test(normalized)) {
    return normalized.includes("?")
      ? normalized
      : `${normalized}${normalized.endsWith("/") ? "" : "/"}?autoplay=1&muted=1`;
  }
  const root = normalized.replace(/\/+$/, "");
  return `${root}/embed/?autoplay=1&muted=1`;
};

const mapPitch = (item: ApiPitch, index: number): PitchShow => {
  const fallbackPoster = `/pitches/pitch-0${(index % 4) + 1}.svg?v=2`;
  return {
    id: item.pitch_id ?? `pitch-${index + 1}`,
    startupId: item.startup_id ?? null,
    name: item.startup_name ?? "Startup",
    tagline: item.one_liner ?? item.category ?? "New video",
    poster: item.poster_url ?? item.founder_photo_url ?? fallbackPoster,
    video: item.video_mp4_url ?? item.video_url ?? item.video_hls_url ?? null,
    videoHlsUrl: item.video_hls_url ?? null,
    videoMp4Url: item.video_mp4_url ?? item.video_url ?? null,
    instagramUrl: item.instagram_url ?? null,
    category: item.category ?? null,
    upvotes: asNumber(item.in_count),
    downvotes: asNumber(item.out_count),
    score: asNumber(item.score),
    isFallback: false,
  };
};

export default function RoundtableHomepageVideoRail({
  sessionId,
  participantId,
  onPitchOpened,
}: RoundtableHomepageVideoRailProps) {
  const [pitches, setPitches] = useState<PitchShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pipIndex, setPipIndex] = useState<number | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);
  const [instagramResolveByUrl, setInstagramResolveByUrl] = useState<Record<string, InstagramResolveState>>({});
  const [resolveAttemptTick, setResolveAttemptTick] = useState(0);
  const [pipPlaybackError, setPipPlaybackError] = useState<string | null>(null);
  const [pipPosition, setPipPosition] = useState<{ x: number; y: number } | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const pipPlayerRef = useRef<HTMLElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const instagramResolveByUrlRef = useRef<Record<string, InstagramResolveState>>({});
  const syncChannelRef = useRef<ReturnType<typeof supabaseBrowser.channel> | null>(null);
  const pitchesRef = useRef<PitchShow[]>([]);
  const applyingRemoteStateRef = useRef(false);
  const pendingRemoteStateRef = useRef<{ pitchId: string; timeSec: number; paused: boolean } | null>(null);
  const lastStateBroadcastAtRef = useRef(0);
  const carryRef = useRef(0);
  const pauseUntilRef = useRef(0);
  const interactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pipDragStateRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
    active: boolean;
  } | null>(null);
  const pipRecoveryAttemptsRef = useRef(0);
  const syncSenderId = useMemo(
    () => `${participantId ?? "guest"}:${Math.random().toString(36).slice(2, 8)}`,
    [participantId]
  );

  const markInteraction = useCallback((pauseMs = INTERACTION_PAUSE_MS) => {
    pauseUntilRef.current = Date.now() + pauseMs;
    setIsInteracting(true);

    if (interactionTimerRef.current !== null) {
      clearTimeout(interactionTimerRef.current);
    }

    interactionTimerRef.current = setTimeout(() => {
      interactionTimerRef.current = null;
      setIsInteracting(false);
    }, pauseMs + 80);
  }, []);

  const applyScrollDelta = useCallback((delta: number) => {
    const rail = railRef.current;
    if (!rail) return;
    const segmentWidth = getPrimarySegmentWidth(rail);
    if (segmentWidth <= rail.clientWidth + 1) return;
    rail.scrollLeft = normalizeScrollLeft(rail.scrollLeft + delta, segmentWidth);
  }, []);

  const shiftRail = useCallback(
    (direction: -1 | 1) => {
      const rail = railRef.current;
      if (!rail) return;
      markInteraction(1700);
      const distance = Math.max(180, Math.min(360, rail.clientWidth * 0.74));
      applyScrollDelta(direction * distance);
    },
    [applyScrollDelta, markInteraction]
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const response = await fetch(
          `/api/pitches?mode=feed&tab=trending&limit=${VIDEO_FETCH_LIMIT}&offset=0&shuffle=false`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error("Unable to load homepage videos.");
        }

        const payload = (await response.json()) as FeedResponsePayload;
        const mapped = (payload.data ?? []).map(mapPitch);
        const uploaded = dedupeById(mapped.filter(hasPlayableUpload));

        setPitches(uploaded);
        if (!uploaded.length) {
          setError("No uploaded homepage videos available yet.");
        }
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setPitches([]);
        setError(loadError instanceof Error ? loadError.message : "Unable to load homepage videos.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => controller.abort();
  }, []);

  useEffect(
    () => () => {
      if (interactionTimerRef.current !== null) {
        clearTimeout(interactionTimerRef.current);
        interactionTimerRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    const rail = railRef.current;
    if (!rail || !pitches.length) return;
    const segmentWidth = getPrimarySegmentWidth(rail);
    if (segmentWidth <= rail.clientWidth + 1) return;
    rail.scrollLeft = normalizeScrollLeft(segmentWidth * 0.24, segmentWidth);
    carryRef.current = 0;
  }, [pitches.length]);

  useEffect(() => {
    if (!pitches.length) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let rafId = 0;
    let lastTime = performance.now();

    const tick = (time: number) => {
      const rail = railRef.current;
      if (rail) {
        const segmentWidth = getPrimarySegmentWidth(rail);
        if (segmentWidth > rail.clientWidth + 1) {
          rail.scrollLeft = normalizeScrollLeft(rail.scrollLeft, segmentWidth);

          if (Date.now() >= pauseUntilRef.current) {
            const deltaMs = Math.min(42, Math.max(0, time - lastTime));
            const nextCarry = carryRef.current + AUTO_SCROLL_SPEED_PX_PER_MS * deltaMs;
            const wholePixels = Math.floor(nextCarry);
            carryRef.current = nextCarry - wholePixels;
            if (wholePixels !== 0) {
              rail.scrollLeft = normalizeScrollLeft(rail.scrollLeft + wholePixels, segmentWidth);
            }
          }
        }
      }

      lastTime = time;
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [pitches.length]);

  useEffect(() => {
    pitchesRef.current = pitches;
  }, [pitches]);

  useEffect(() => {
    instagramResolveByUrlRef.current = instagramResolveByUrl;
  }, [instagramResolveByUrl]);

  const sendSharedPlayerEvent = useCallback(
    (payload: Omit<SharedMiniPlayerPayload, "senderId" | "sentAt">) => {
      const channel = syncChannelRef.current;
      if (!channel) return;
      void channel.send({
        type: "broadcast",
        event: "mini-player-sync",
        payload: {
          ...payload,
          senderId: syncSenderId,
          sentAt: Date.now(),
        } satisfies SharedMiniPlayerPayload,
      });
    },
    [syncSenderId]
  );

  const trackPitchOpen = useCallback(
    async (pitchId: string) => {
      try {
        const response = await fetch("/api/pitches/leaderboard/open", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            pitch_id: pitchId,
            session_id: sessionId,
            participant_id: participantId,
            source: ROUNDTABLE_VIDEO_RAIL_SOURCE,
          }),
        });

        if (!response.ok) {
          throw new Error("Unable to track pitch open.");
        }

        onPitchOpened?.();
      } catch (error) {
        console.error(error);
      }
    },
    [onPitchOpened, participantId, sessionId]
  );

  useEffect(() => {
    if (!hasBrowserSupabaseEnv) return;

    const channel = supabaseBrowser
      .channel(`roundtable-video-sync-${sessionId}`)
      .on("broadcast", { event: "mini-player-sync" }, ({ payload }) => {
        const remote = payload as SharedMiniPlayerPayload;
        if (!remote || remote.senderId === syncSenderId) return;

        if (remote.action === "close") {
          applyingRemoteStateRef.current = true;
          pendingRemoteStateRef.current = null;
          setPipIndex(null);
          if (pipVideoRef.current) {
            pipVideoRef.current.pause();
          }
          window.setTimeout(() => {
            applyingRemoteStateRef.current = false;
          }, 0);
          return;
        }

        if (!remote.pitchId) return;
        const remoteIndex = pitchesRef.current.findIndex((item) => item.id === remote.pitchId);
        if (remoteIndex < 0) return;

        applyingRemoteStateRef.current = true;
        pendingRemoteStateRef.current = {
          pitchId: remote.pitchId,
          timeSec: Math.max(0, remote.timeSec ?? 0),
          paused: Boolean(remote.paused),
        };
        setPipIndex(remoteIndex);
        markInteraction(1900);
      })
      .subscribe();

    syncChannelRef.current = channel;
    return () => {
      syncChannelRef.current = null;
      void supabaseBrowser.removeChannel(channel);
    };
  }, [markInteraction, sessionId, syncSenderId]);

  const openPitch = useCallback(
    (index: number) => {
      if (!pitches.length) return;
      const bounded = ((index % pitches.length) + pitches.length) % pitches.length;
      setPipIndex(bounded);
      markInteraction(1800);
      const pitch = pitches[bounded];
      if (pitch?.id) {
        void trackPitchOpen(pitch.id);
        sendSharedPlayerEvent({
          action: "open",
          pitchId: pitch.id,
          timeSec: 0,
          paused: false,
        });
      }
    },
    [markInteraction, pitches, sendSharedPlayerEvent, trackPitchOpen]
  );

  const closePip = useCallback(() => {
    if (pipVideoRef.current) {
      pipVideoRef.current.pause();
    }
    setPipPlaybackError(null);
    setPipIndex(null);
    sendSharedPlayerEvent({ action: "close" });
  }, [sendSharedPlayerEvent]);

  const shiftPip = useCallback(
    (direction: -1 | 1) => {
      if (!pitches.length) return;
      setPipIndex((current) => {
        const nextIndex =
          current === null
            ? 0
            : ((current + direction) % pitches.length + pitches.length) % pitches.length;
        const nextPitch = pitches[nextIndex];
        if (nextPitch?.id) {
          sendSharedPlayerEvent({
            action: "open",
            pitchId: nextPitch.id,
            timeSec: 0,
            paused: false,
          });
        }
        return nextIndex;
      });
    },
    [pitches, sendSharedPlayerEvent]
  );

  const statusText = useMemo(() => {
    if (loading) return "Loading homepage videos...";
    if (error) return error;
    return null;
  }, [error, loading]);

  const pipPitch = useMemo(() => {
    if (pipIndex === null || pipIndex < 0 || pipIndex >= pitches.length) return null;
    return pitches[pipIndex];
  }, [pipIndex, pitches]);
  const pipInstagramUrl = pipPitch?.instagramUrl ?? null;
  const pipVideoMp4Src = pipPitch?.videoMp4Url ?? pipPitch?.video ?? null;
  const pipVideoHlsSrc = HLS_ENABLED ? pipPitch?.videoHlsUrl ?? null : null;
  const pipHasDirectPlayableVideo = Boolean(pipVideoMp4Src || pipVideoHlsSrc);
  const pipResolveState = pipInstagramUrl ? instagramResolveByUrl[pipInstagramUrl] : null;
  const pipResolvedInstagramVideoSrc = pipResolveState?.videoUrl ?? null;
  const pipEmbedUrl = pipResolveState?.embedUrl ?? buildInstagramEmbedUrl(pipInstagramUrl);
  const pipVideoSrc = pipVideoMp4Src ?? pipResolvedInstagramVideoSrc;
  const pipHasPlayableVideo = Boolean(pipVideoSrc || pipVideoHlsSrc);
  const pipNeedsResolve = Boolean(pipInstagramUrl && !pipHasDirectPlayableVideo);
  const pipIsResolving = Boolean(pipNeedsResolve && (!pipResolveState || pipResolveState.loading));
  const pipResolveFailed = Boolean(
    pipNeedsResolve &&
      pipResolveState &&
      pipResolveState.attempted &&
      !pipResolveState.loading &&
      !pipResolveState.videoUrl
  );

  const syncVideoPlaybackToPeers = useCallback(
    (force = false) => {
      if (applyingRemoteStateRef.current) return;
      const video = pipVideoRef.current;
      if (!video || !pipPitch?.id) return;
      const now = Date.now();
      if (!force && now - lastStateBroadcastAtRef.current < 900) return;
      lastStateBroadcastAtRef.current = now;
      sendSharedPlayerEvent({
        action: "state",
        pitchId: pipPitch.id,
        timeSec: video.currentTime ?? 0,
        paused: video.paused,
      });
    },
    [pipPitch?.id, sendSharedPlayerEvent]
  );

  useEffect(() => {
    if (!pipInstagramUrl) return;
    if (pipHasDirectPlayableVideo) return;

    const current = instagramResolveByUrlRef.current[pipInstagramUrl];
    if (current?.attempted || current?.loading) return;

    let active = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);

    setInstagramResolveByUrl((previous) => ({
      ...previous,
      [pipInstagramUrl]: {
        videoUrl: previous[pipInstagramUrl]?.videoUrl ?? null,
        embedUrl: previous[pipInstagramUrl]?.embedUrl ?? null,
        loading: true,
        attempted: true,
      },
    }));

    void fetch(`/api/video/instagram/resolve?url=${encodeURIComponent(pipInstagramUrl)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return { video_url: null, embed_url: null } as InstagramResolvePayload;
        return (await response.json()) as InstagramResolvePayload;
      })
      .then((payload) => {
        if (!active) return;
        setInstagramResolveByUrl((previous) => ({
          ...previous,
          [pipInstagramUrl]: {
            videoUrl: payload.video_url ?? null,
            embedUrl: payload.embed_url ?? previous[pipInstagramUrl]?.embedUrl ?? null,
            loading: false,
            attempted: true,
          },
        }));
      })
      .catch(() => {
        if (!active) return;
        setInstagramResolveByUrl((previous) => ({
          ...previous,
          [pipInstagramUrl]: {
            videoUrl: null,
            embedUrl: null,
            loading: false,
            attempted: true,
          },
        }));
      });

    return () => {
      active = false;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [pipHasDirectPlayableVideo, pipInstagramUrl, resolveAttemptTick]);

  const clampPipPosition = useCallback((x: number, y: number) => {
    const panel = pipPlayerRef.current;
    const width = panel?.offsetWidth ?? 360;
    const height = panel?.offsetHeight ?? 250;
    const maxX = Math.max(PIP_EDGE_GAP_PX, window.innerWidth - width - PIP_EDGE_GAP_PX);
    const maxY = Math.max(PIP_EDGE_GAP_PX, window.innerHeight - height - PIP_EDGE_GAP_PX);
    return {
      x: Math.min(maxX, Math.max(PIP_EDGE_GAP_PX, x)),
      y: Math.min(maxY, Math.max(PIP_EDGE_GAP_PX, y)),
    };
  }, []);

  const handlePipDragStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, a, input, textarea")) return;

      const panel = pipPlayerRef.current;
      if (!panel) return;

      const rect = panel.getBoundingClientRect();
      const origin = pipPosition ?? { x: rect.left, y: rect.top };
      const clampedOrigin = clampPipPosition(origin.x, origin.y);
      setPipPosition(clampedOrigin);
      pipDragStateRef.current = {
        pointerId: event.pointerId,
        offsetX: event.clientX - clampedOrigin.x,
        offsetY: event.clientY - clampedOrigin.y,
        active: true,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      markInteraction(2600);
    },
    [clampPipPosition, markInteraction, pipPosition]
  );

  const handlePipDragMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = pipDragStateRef.current;
      if (!drag?.active || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      const next = clampPipPosition(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
      setPipPosition(next);
    },
    [clampPipPosition]
  );

  const handlePipDragEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = pipDragStateRef.current;
    if (!drag?.active || drag.pointerId !== event.pointerId) return;
    drag.active = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  useEffect(() => {
    if (!pipPosition) return;
    const handleResize = () => {
      setPipPosition((current) => {
        if (!current) return current;
        return clampPipPosition(current.x, current.y);
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampPipPosition, pipPosition]);

  useEffect(() => {
    setPipPlaybackError(null);
    pipRecoveryAttemptsRef.current = 0;
  }, [pipPitch?.id, pipVideoHlsSrc, pipVideoSrc]);

  const retryPipResolve = useCallback(() => {
    if (!pipInstagramUrl) return;
    setInstagramResolveByUrl((previous) => ({
      ...previous,
      [pipInstagramUrl]: {
        videoUrl: previous[pipInstagramUrl]?.videoUrl ?? null,
        embedUrl: previous[pipInstagramUrl]?.embedUrl ?? buildInstagramEmbedUrl(pipInstagramUrl),
        loading: false,
        attempted: false,
      },
    }));
    setPipPlaybackError(null);
    setResolveAttemptTick((current) => current + 1);
  }, [pipInstagramUrl]);

  const retryPipPlayback = useCallback(() => {
    const video = pipVideoRef.current;
    if (!video) return;
    setPipPlaybackError(null);
    video.load();
    video.play().catch(() => {
      setPipPlaybackError("Video could not start. Tap Retry, or use Next.");
    });
  }, []);

  useEffect(() => {
    const video = pipVideoRef.current;
    if (!video || !pipHasPlayableVideo) return;

    let progressTimer: ReturnType<typeof setTimeout> | null = null;
    let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
    let didCleanup = false;
    let lastObservedTime = video.currentTime;
    let hasStarted = video.currentTime > 0;

    const clearProgressTimer = () => {
      if (progressTimer !== null) {
        clearTimeout(progressTimer);
        progressTimer = null;
      }
    };

    const clearRecoveryTimer = () => {
      if (recoveryTimer !== null) {
        clearTimeout(recoveryTimer);
        recoveryTimer = null;
      }
    };

    const attemptPlay = (showErrorOnFail = true) => {
      if (didCleanup) return;
      video.muted = true;
      video.play().catch(() => {
        if (!didCleanup && showErrorOnFail) {
          setPipPlaybackError("Video could not start. Tap Retry, or use Next.");
        }
      });
    };

    const verifyProgress = (windowMs = 1700) => {
      clearProgressTimer();
      const startAt = video.currentTime;
      progressTimer = setTimeout(() => {
        if (didCleanup || video.paused || video.ended) return;
        if (video.currentTime <= startAt + 0.03) {
          maybeRecover();
        }
      }, windowMs);
    };

    const maybeRecover = () => {
      if (didCleanup || video.ended) return;
      if (pipRecoveryAttemptsRef.current >= 2) {
        setPipPlaybackError("Video is stalled. Tap Retry, or use Next.");
        return;
      }

      pipRecoveryAttemptsRef.current += 1;
      clearRecoveryTimer();
      recoveryTimer = setTimeout(() => {
        if (didCleanup) return;
        video.load();
        attemptPlay(false);
        verifyProgress(2200);
      }, 220);
    };

    const handlePlaying = () => {
      hasStarted = true;
      setPipPlaybackError(null);
      pipRecoveryAttemptsRef.current = 0;
      clearProgressTimer();
      clearRecoveryTimer();
    };

    const handlePlay = () => {
      verifyProgress();
    };

    const handleTimeUpdate = () => {
      const time = video.currentTime;
      if (time > lastObservedTime + 0.02) {
        hasStarted = true;
        pipRecoveryAttemptsRef.current = 0;
        setPipPlaybackError(null);
      }
      lastObservedTime = time;
    };

    const handleStalled = () => {
      maybeRecover();
    };

    const handleError = () => {
      if (!hasStarted) {
        maybeRecover();
      } else {
        setPipPlaybackError("Video could not start. Tap Retry, or use Next.");
      }
    };

    const handleCanPlay = () => {
      if (!hasStarted && video.paused) {
        attemptPlay(false);
      }
    };

    video.addEventListener("playing", handlePlaying);
    video.addEventListener("play", handlePlay);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("stalled", handleStalled);
    video.addEventListener("error", handleError);

    video.load();
    attemptPlay(false);
    verifyProgress();

    return () => {
      didCleanup = true;
      clearProgressTimer();
      clearRecoveryTimer();
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("stalled", handleStalled);
      video.removeEventListener("error", handleError);
    };
  }, [pipHasPlayableVideo, pipPitch?.id, pipVideoHlsSrc, pipVideoSrc]);

  useEffect(() => {
    const pending = pendingRemoteStateRef.current;
    const video = pipVideoRef.current;
    const currentPitchId = pipPitch?.id ?? null;
    if (!pending || !video || !currentPitchId || currentPitchId !== pending.pitchId) return;

    const applyRemote = () => {
      if (Math.abs(video.currentTime - pending.timeSec) > 0.7) {
        try {
          video.currentTime = pending.timeSec;
        } catch {
          // Ignore seek failures until metadata is available.
        }
      }

      if (pending.paused) {
        video.pause();
      } else {
        video.play().catch(() => undefined);
      }

      pendingRemoteStateRef.current = null;
      window.setTimeout(() => {
        applyingRemoteStateRef.current = false;
      }, 0);
    };

    if (video.readyState >= 1) {
      applyRemote();
      return;
    }

    const onLoadedMetadata = () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      applyRemote();
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [pipPitch?.id, pipVideoHlsSrc, pipVideoSrc]);

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (!pitches.length) return;
      event.preventDefault();
      markInteraction(1700);
      const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      applyScrollDelta(dominantDelta);
    },
    [applyScrollDelta, markInteraction, pitches.length]
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        shiftRail(1);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        shiftRail(-1);
      }
    },
    [shiftRail]
  );

  return (
    <section className="roundtable-panel roundtable-video-strip" aria-label="Homepage videos">
      <div className="roundtable-video-strip-head">
        <div className="roundtable-video-strip-copy">
          <h4>Open any video</h4>
          <p>Start discussing instantly with your friends, founders and more.</p>
        </div>
        <div className="roundtable-video-strip-actions">
          <button
            type="button"
            className="roundtable-video-nav"
            onClick={() => shiftRail(-1)}
            aria-label="Scroll videos left"
            disabled={pitches.length <= 1}
          >
            ←
          </button>
          <button
            type="button"
            className="roundtable-video-nav"
            onClick={() => shiftRail(1)}
            aria-label="Scroll videos right"
            disabled={pitches.length <= 1}
          >
            →
          </button>
        </div>
      </div>

      {statusText ? <p className="roundtable-video-strip-status">{statusText}</p> : null}

      {pitches.length ? (
        <div
          className={`roundtable-video-rail${isInteracting ? " is-interacting" : ""}`}
          ref={railRef}
          onWheel={handleWheel}
          onPointerDown={() => markInteraction(2200)}
          onFocusCapture={() => markInteraction(2200)}
          onBlurCapture={() => markInteraction(700)}
          onMouseEnter={() => markInteraction(2000)}
          onMouseLeave={() => markInteraction(700)}
          onTouchStart={() => markInteraction(2200)}
          onTouchEnd={() => markInteraction(900)}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          aria-label="Looping homepage videos"
        >
          <div className="roundtable-video-rail-track">
            <div className="roundtable-video-rail-segment" data-segment="primary">
              {pitches.map((pitch, index) => (
                <div key={`${pitch.id}-primary-${index}`} className="roundtable-video-rail-item">
                  <PitchShowCard pitch={pitch} size="row" variant="regular" onExpand={() => openPitch(index)} />
                </div>
              ))}
            </div>
            <div className="roundtable-video-rail-segment is-clone" data-segment="clone" aria-hidden="true">
              {pitches.map((pitch, index) => (
                <div key={`${pitch.id}-clone-${index}`} className="roundtable-video-rail-item">
                  <PitchShowCard pitch={pitch} size="row" variant="regular" interactive={false} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {pipPitch ? (
        <aside
          ref={pipPlayerRef}
          className="roundtable-pip-player"
          aria-label="Video mini player"
          style={
            pipPosition
              ? {
                  left: `${pipPosition.x}px`,
                  top: `${pipPosition.y}px`,
                  right: "auto",
                  bottom: "auto",
                }
              : undefined
          }
        >
          <div
            className="roundtable-pip-head"
            onPointerDown={handlePipDragStart}
            onPointerMove={handlePipDragMove}
            onPointerUp={handlePipDragEnd}
            onPointerCancel={handlePipDragEnd}
            onLostPointerCapture={handlePipDragEnd}
          >
            <div className="roundtable-pip-meta">
              <strong>{pipPitch.name}</strong>
              <span>{pipPitch.category ?? "Video"}</span>
            </div>
            <button type="button" className="roundtable-pip-close" onClick={closePip} aria-label="Close mini player">
              ×
            </button>
          </div>

          {pipHasPlayableVideo ? (
            <div className="roundtable-pip-video-wrap">
              <video
                key={`${pipPitch.id}:${pipVideoHlsSrc ?? "none"}:${pipVideoSrc ?? "none"}`}
                ref={pipVideoRef}
                className="roundtable-pip-video"
                poster={pipPitch.poster}
                controls
                playsInline
                autoPlay
                muted
                preload="metadata"
                onPlay={() => syncVideoPlaybackToPeers(true)}
                onPause={() => syncVideoPlaybackToPeers(true)}
                onSeeked={() => syncVideoPlaybackToPeers(true)}
                onTimeUpdate={() => syncVideoPlaybackToPeers(false)}
              >
                {pipVideoHlsSrc ? <source src={pipVideoHlsSrc} type="application/vnd.apple.mpegurl" /> : null}
                {pipVideoSrc ? <source src={pipVideoSrc} type="video/mp4" /> : null}
              </video>
            </div>
          ) : pipEmbedUrl ? (
            <div className="roundtable-pip-video-wrap">
              <iframe
                key={`${pipPitch.id}:${pipEmbedUrl}`}
                className="roundtable-pip-embed"
                src={pipEmbedUrl}
                allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                allowFullScreen
                loading="eager"
                title={`${pipPitch.name} Instagram video`}
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          ) : (
            <div className="roundtable-pip-fallback">
              <span>{pipResolveFailed ? "Could not load a direct video stream." : "Video unavailable."}</span>
              {pipInstagramUrl ? (
                <div className="roundtable-pip-actions">
                  <button type="button" className="roundtable-pip-btn" onClick={retryPipResolve}>
                    Retry source
                  </button>
                  <a
                    className="roundtable-pip-btn"
                    href={pipInstagramUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label="Open Instagram video in a new tab"
                  >
                    Open Instagram
                  </a>
                </div>
              ) : null}
            </div>
          )}

          {pipIsResolving && !pipHasPlayableVideo ? (
            <p className="roundtable-pip-note">Preparing direct stream...</p>
          ) : null}

          <div className="roundtable-pip-actions">
            <button type="button" className="roundtable-pip-btn" onClick={() => shiftPip(-1)} aria-label="Previous video">
              ← Prev
            </button>
            {pipHasPlayableVideo ? (
              <button type="button" className="roundtable-pip-btn" onClick={retryPipPlayback} aria-label="Retry playback">
                Retry
              </button>
            ) : null}
            <button type="button" className="roundtable-pip-btn" onClick={() => shiftPip(1)} aria-label="Next video">
              Next →
            </button>
          </div>
          {pipPlaybackError ? <p className="roundtable-pip-note">{pipPlaybackError}</p> : null}
          <p className="roundtable-pip-note">Roundtable stays active while this mini player is open.</p>
        </aside>
      ) : null}
    </section>
  );
}
