"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ContactModal from "./ContactModal";
import { trackEvent } from "@/lib/analytics/events";
import { supabaseBrowser } from "@/lib/supabase/client";

export type PitchShow = {
  id: string;
  startupId?: string | null;
  name: string;
  tagline: string;
  poster: string;
  video?: string | null;
  videoHlsUrl?: string | null;
  videoMp4Url?: string | null;
  instagramUrl?: string | null;
  isFallback?: boolean;
  category?: string | null;
  upvotes?: number;
  downvotes?: number;
  comments?: number;
  score?: number;
  monthlyRevenue?: string | null;
};

type PitchShowCardProps = {
  pitch: PitchShow;
  size: "feature" | "row" | "wide" | "mini";
  variant?: "hot" | "regular";
  onExpand?: (pitch: PitchShow) => void;
  interactive?: boolean;
};

type InstagramResolveResult = {
  videoUrl: string | null;
  embedUrl: string | null;
};

const HLS_ENABLED = process.env.NEXT_PUBLIC_VIDEO_HLS_ENABLED === "1";
const INSTAGRAM_RESOLVE_TIMEOUT_MS = 9000;
const instagramResolveCache = new Map<string, InstagramResolveResult>();
const instagramResolveInFlight = new Map<string, Promise<InstagramResolveResult>>();

const normalizeInstagramEmbedUrl = (value: string | null | undefined) => {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (/\/embed\/?/i.test(raw)) {
    return raw.includes("?") ? raw : `${raw}${raw.endsWith("/") ? "" : "/"}?autoplay=1&muted=1`;
  }
  const cleaned = raw.replace(/\/+$/, "");
  return `${cleaned}/embed/?autoplay=1&muted=1`;
};

const resolveInstagramMedia = async (instagramUrl: string) => {
  const normalized = instagramUrl.trim();
  if (!normalized.length) return { videoUrl: null, embedUrl: null } as InstagramResolveResult;

  if (instagramResolveCache.has(normalized)) {
    return instagramResolveCache.get(normalized) as InstagramResolveResult;
  }

  const inFlight = instagramResolveInFlight.get(normalized);
  if (inFlight) return inFlight;

  const request = (async () => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), INSTAGRAM_RESOLVE_TIMEOUT_MS);

    try {
      const response = await fetch(`/api/video/instagram/resolve?url=${encodeURIComponent(normalized)}`, {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        const fallback = {
          videoUrl: null,
          embedUrl: normalizeInstagramEmbedUrl(normalized),
        } as InstagramResolveResult;
        instagramResolveCache.set(normalized, fallback);
        return fallback;
      }

      const payload = (await response.json()) as {
        video_url?: string | null;
        embed_url?: string | null;
      };

      const resolved = {
        videoUrl: payload.video_url ?? null,
        embedUrl: payload.embed_url ?? normalizeInstagramEmbedUrl(normalized),
      } as InstagramResolveResult;
      instagramResolveCache.set(normalized, resolved);
      return resolved;
    } catch {
      const fallback = {
        videoUrl: null,
        embedUrl: normalizeInstagramEmbedUrl(normalized),
      } as InstagramResolveResult;
      instagramResolveCache.set(normalized, fallback);
      return fallback;
    } finally {
      window.clearTimeout(timer);
      instagramResolveInFlight.delete(normalized);
    }
  })();

  instagramResolveInFlight.set(normalized, request);
  return request;
};

export default function PitchShowCard({
  pitch,
  size,
  variant = "regular",
  onExpand,
  interactive = true,
}: PitchShowCardProps) {
  const articleRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [localUpvotes, setLocalUpvotes] = useState(0);
  const [localDownvotes, setLocalDownvotes] = useState(0);
  const [localComments, setLocalComments] = useState(0);
  const [engagementBusy, setEngagementBusy] = useState(false);
  const shouldLazyVideo = size === "row" || size === "mini";
  const [shouldLoadVideo, setShouldLoadVideo] = useState(!shouldLazyVideo);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [instagramResolved, setInstagramResolved] = useState<InstagramResolveResult | null>(null);
  const [instagramEmbedReady, setInstagramEmbedReady] = useState(false);
  const mp4VideoSrc = pitch.videoMp4Url ?? pitch.video ?? null;
  const hlsVideoSrc = HLS_ENABLED ? pitch.videoHlsUrl ?? null : null;
  const resolvedMp4VideoSrc = mp4VideoSrc ?? instagramResolved?.videoUrl ?? null;
  const instagramEmbedSrc = instagramResolved?.embedUrl ?? normalizeInstagramEmbedUrl(pitch.instagramUrl);
  const hasPlayableVideo = Boolean(hlsVideoSrc || resolvedMp4VideoSrc);
  const showInstagramEmbed = Boolean(!hasPlayableVideo && shouldLoadVideo && instagramEmbedSrc);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = true;
  }, [hlsVideoSrc, resolvedMp4VideoSrc]);

  useEffect(() => {
    setVideoReady(false);
    setVideoFailed(false);
    setInstagramEmbedReady(false);
    setInstagramResolved(null);
  }, [hlsVideoSrc, mp4VideoSrc, pitch.id, pitch.instagramUrl, shouldLoadVideo]);

  useEffect(() => {
    if (!shouldLoadVideo) return;
    if (!pitch.instagramUrl) return;
    if (hlsVideoSrc || mp4VideoSrc) return;

    let active = true;
    const cached = instagramResolveCache.get(pitch.instagramUrl);
    if (cached) {
      setInstagramResolved(cached);
      return;
    }

    void resolveInstagramMedia(pitch.instagramUrl).then((resolved) => {
      if (!active) return;
      setInstagramResolved(resolved);
    });

    return () => {
      active = false;
    };
  }, [hlsVideoSrc, mp4VideoSrc, pitch.instagramUrl, shouldLoadVideo]);

  useEffect(() => {
    if (!shouldLazyVideo) return;
    const node = articleRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoadVideo(true);
          observer.disconnect();
        }
      },
      {
        threshold: 0.12,
        rootMargin: "260px 80px 260px 80px",
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldLazyVideo, pitch.id]);

  useEffect(() => {
    if (!shouldLoadVideo || !hasPlayableVideo) return;
    const video = videoRef.current;
    if (!video) return;
    const replay = () => {
      video.play().catch(() => undefined);
    };
    if (video.readyState >= 2) {
      replay();
      return;
    }
    video.addEventListener("canplay", replay, { once: true });
    return () => video.removeEventListener("canplay", replay);
  }, [hasPlayableVideo, hlsVideoSrc, pitch.id, resolvedMp4VideoSrc, shouldLoadVideo]);

  useEffect(() => {
    setLocalUpvotes(Number.isFinite(Number(pitch.upvotes)) ? Number(pitch.upvotes) : 0);
    setLocalDownvotes(Number.isFinite(Number(pitch.downvotes)) ? Number(pitch.downvotes) : 0);
    setLocalComments(Number.isFinite(Number(pitch.comments)) ? Number(pitch.comments) : 0);
  }, [pitch.comments, pitch.downvotes, pitch.id, pitch.upvotes]);

  const label = `Video: ${pitch.name}, 60s`;
  const score = Number.isFinite(Number(pitch.score)) ? Number(pitch.score) : 0;
  const upvotes = localUpvotes;
  const comments = localComments;
  const hasRevenue = Boolean((pitch.monthlyRevenue ?? "").trim().length);
  const scoreLabel = Number.isInteger(score) ? `${score}` : score.toFixed(1);

  const fetchLatestStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/pitches/${pitch.id}/detail`, { cache: "no-store" });
      if (!res.ok) return;
      const payload = (await res.json()) as { stats?: { in_count?: number; out_count?: number; comment_count?: number } };
      const stats = payload?.stats;
      if (!stats) return;
      if (typeof stats.in_count === "number") setLocalUpvotes(stats.in_count);
      if (typeof stats.out_count === "number") setLocalDownvotes(stats.out_count);
      if (typeof stats.comment_count === "number") setLocalComments(stats.comment_count);
    } catch {
      // Non-fatal; leave stale.
    }
  }, [pitch.id]);

  const handleVote = useCallback(
    async (vote: "in" | "out") => {
      if (engagementBusy) return;
      setEngagementBusy(true);
      try {
        const { data } = await supabaseBrowser.auth.getSession();
        const token = data.session?.access_token ?? null;
        if (!token) {
          // No dedicated login screen yet; opening the overlay nudges them into the app flow.
          onExpand?.(pitch);
          return;
        }
        const res = await fetch(`/api/pitches/${pitch.id}/vote`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ vote }),
        });
        if (res.ok) {
          await fetchLatestStats();
        }
      } finally {
        setEngagementBusy(false);
      }
    },
    [engagementBusy, fetchLatestStats, onExpand, pitch]
  );

  return (
    <article
      ref={articleRef}
      className={`pitch-show-card ${size} ${variant === "hot" ? "is-hot" : "is-regular"}`}
      tabIndex={interactive ? 0 : -1}
      aria-label={label}
      onMouseEnter={() => setShouldLoadVideo(true)}
      onFocusCapture={() => setShouldLoadVideo(true)}
      onClick={
        interactive
          ? () => {
              if (onExpand) return onExpand(pitch);
              dialogRef.current?.showModal();
            }
          : undefined
      }
    >
      <div
        className={`pitch-show-media pitch-show-poster ${variant === "hot" ? "on-dark" : "on-light"}${
          (videoReady && !videoFailed && hasPlayableVideo && shouldLoadVideo) ||
          (instagramEmbedReady && showInstagramEmbed)
            ? " is-hidden"
            : ""
        }`}
        style={{
          backgroundImage: pitch.poster ? `url(${pitch.poster})` : "none",
          backgroundColor:
            variant === "hot"
              ? "var(--pitch-hot-fallback)"
              : "var(--pitch-regular-fallback)",
        }}
      >
        {!pitch.poster ? <span className="pitch-placeholder">Poster pending</span> : null}
      </div>
      {hasPlayableVideo && shouldLoadVideo && !videoFailed ? (
        <video
          key={`${pitch.id}:${hlsVideoSrc ?? "none"}:${resolvedMp4VideoSrc ?? "none"}`}
          ref={videoRef}
          className={`pitch-show-media pitch-show-media-video ${videoReady ? "is-ready" : "is-loading"}`}
          poster={pitch.poster}
          muted
          playsInline
          autoPlay
          loop
          preload="metadata"
          onLoadedData={() => setVideoReady(true)}
          onCanPlay={() => setVideoReady(true)}
          onError={() => setVideoFailed(true)}
        >
          {hlsVideoSrc ? <source src={hlsVideoSrc} type="application/vnd.apple.mpegurl" /> : null}
          {resolvedMp4VideoSrc ? <source src={resolvedMp4VideoSrc} type="video/mp4" /> : null}
        </video>
      ) : null}
      {showInstagramEmbed ? (
        <iframe
          key={`${pitch.id}:${instagramEmbedSrc ?? "none"}`}
          className="pitch-show-media instagram-frame"
          src={instagramEmbedSrc ?? undefined}
          loading="lazy"
          title={`${pitch.name} Instagram embed`}
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setInstagramEmbedReady(true)}
        />
      ) : null}
      <div className={`pitch-show-overlay ${variant === "hot" ? "on-dark" : "on-light"}`}>
        <div className="pitch-show-text">
          <h4>{pitch.name}</h4>
          <p>{pitch.tagline}</p>
          <div className="pitch-engagement-inline" aria-label="Engagement controls">
            <button
              type="button"
              className="pitch-engage-btn"
              onClick={(event) => {
                event.stopPropagation();
                trackEvent("pitch_upvote", {
                  pitch_id: pitch.id,
                  size,
                });
                void handleVote("in");
              }}
              aria-label="Upvote"
              disabled={!interactive || engagementBusy}
            >
              <span className="pitch-engage-icon">▲</span>
              <span className="pitch-engage-count">{upvotes}</span>
            </button>
            <button
              type="button"
              className="pitch-engage-btn"
              onClick={(event) => {
                event.stopPropagation();
                trackEvent("pitch_downvote", {
                  pitch_id: pitch.id,
                  size,
                });
                void handleVote("out");
              }}
              aria-label="Downvote"
              disabled={!interactive || engagementBusy}
            >
              <span className="pitch-engage-icon">▼</span>
              <span className="pitch-engage-count">{localDownvotes}</span>
            </button>
            <button
              type="button"
              className="pitch-engage-btn"
              onClick={(event) => {
                event.stopPropagation();
                trackEvent("pitch_comments_open", {
                  pitch_id: pitch.id,
                  size,
                });
                if (onExpand) onExpand(pitch);
                else dialogRef.current?.showModal();
              }}
              aria-label="Comments"
              disabled={!interactive}
            >
              <span className="pitch-engage-icon">💬</span>
              <span className="pitch-engage-count">{comments}</span>
            </button>
          </div>
        </div>
        {hasRevenue ? (
          <div className="pitch-show-meta">
            <div className="pitch-revenue-chip is-self-reported">
              Self reported: {pitch.monthlyRevenue}
            </div>
          </div>
        ) : null}
        {variant === "hot" ? <div className="pitch-show-playghost">▶</div> : <div className="pitch-show-footer">Video Preview</div>}
      </div>
      <ContactModal ref={dialogRef} pitch={pitch} />
    </article>
  );
}
