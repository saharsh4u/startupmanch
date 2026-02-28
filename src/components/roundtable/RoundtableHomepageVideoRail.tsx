"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type WheelEvent,
} from "react";
import PitchShowCard, { type PitchShow } from "@/components/PitchShowCard";

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

const VIDEO_FETCH_LIMIT = 48;
const AUTO_SCROLL_SPEED_PX_PER_MS = 0.06;
const INTERACTION_PAUSE_MS = 1400;
const HLS_ENABLED = process.env.NEXT_PUBLIC_VIDEO_HLS_ENABLED === "1";

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
    comments: asNumber(item.comment_count),
    score: asNumber(item.score),
    isFallback: false,
  };
};

export default function RoundtableHomepageVideoRail() {
  const [pitches, setPitches] = useState<PitchShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pipIndex, setPipIndex] = useState<number | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);
  const railRef = useRef<HTMLDivElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const carryRef = useRef(0);
  const pauseUntilRef = useRef(0);
  const interactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          `/api/pitches?mode=feed&tab=trending&limit=${VIDEO_FETCH_LIMIT}&offset=0&shuffle=true`,
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

  const openPitch = useCallback(
    (index: number) => {
      setPipIndex(index);
      markInteraction(1800);
    },
    [markInteraction]
  );

  const closePip = useCallback(() => {
    if (pipVideoRef.current) {
      pipVideoRef.current.pause();
    }
    setPipIndex(null);
  }, []);

  const shiftPip = useCallback(
    (direction: -1 | 1) => {
      if (!pitches.length) return;
      setPipIndex((current) => {
        if (current === null) return 0;
        return ((current + direction) % pitches.length + pitches.length) % pitches.length;
      });
    },
    [pitches.length]
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
  const pipVideoMp4Src = pipPitch?.videoMp4Url ?? pipPitch?.video ?? null;
  const pipVideoHlsSrc = HLS_ENABLED ? pipPitch?.videoHlsUrl ?? null : null;
  const pipHasPlayableVideo = Boolean(pipVideoMp4Src || pipVideoHlsSrc);

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
          <h4>Homepage video loop</h4>
          <p>Watch uploaded homepage videos here and open any card to discuss instantly.</p>
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
        <aside className="roundtable-pip-player" aria-label="Video mini player">
          <div className="roundtable-pip-head">
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
                key={`${pipPitch.id}:${pipVideoHlsSrc ?? "none"}:${pipVideoMp4Src ?? "none"}`}
                ref={pipVideoRef}
                className="roundtable-pip-video"
                poster={pipPitch.poster}
                controls
                playsInline
                autoPlay
                muted
                preload="metadata"
              >
                {pipVideoHlsSrc ? <source src={pipVideoHlsSrc} type="application/vnd.apple.mpegurl" /> : null}
                {pipVideoMp4Src ? <source src={pipVideoMp4Src} type="video/mp4" /> : null}
              </video>
            </div>
          ) : (
            <div className="roundtable-pip-fallback">
              {pipPitch.instagramUrl ? (
                <a
                  href={pipPitch.instagramUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="roundtable-pip-link"
                >
                  Open Instagram video
                </a>
              ) : (
                <span>Video unavailable.</span>
              )}
            </div>
          )}

          <div className="roundtable-pip-actions">
            <button type="button" className="roundtable-pip-btn" onClick={() => shiftPip(-1)} aria-label="Previous video">
              ← Prev
            </button>
            <button type="button" className="roundtable-pip-btn" onClick={() => shiftPip(1)} aria-label="Next video">
              Next →
            </button>
          </div>
          <p className="roundtable-pip-note">Roundtable stays active while this mini player is open.</p>
        </aside>
      ) : null}
    </section>
  );
}
