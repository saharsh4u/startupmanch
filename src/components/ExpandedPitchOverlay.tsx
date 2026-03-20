"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WheelEvent } from "react";
import type { PitchShow } from "./PitchShowCard";
import {
  broadcastPitchVoteSync,
  createPitchVoteSyncSenderId,
  subscribeToPitchVoteSync,
} from "@/lib/pitches/vote-sync";
import { supabaseBrowser } from "@/lib/supabase/client";

type Props = {
  pitches: PitchShow[];
  index: number;
  setIndex: (idx: number) => void;
  onClose: () => void;
};

type SocialLinks = {
  website?: string | null;
  linkedin?: string | null;
  twitter?: string | null;
  instagram?: string | null;
};

type PitchDetail = {
  pitch: {
    id: string;
    ask: string | null;
    equity: string | null;
    valuation: string | null;
    video_url: string | null;
    video_hls_url: string | null;
    video_mp4_url: string | null;
    instagram_url: string | null;
    poster_url: string | null;
    created_at: string;
  };
  startup: {
    id: string;
    name: string;
    category: string | null;
    city: string | null;
    one_liner: string | null;
    website: string | null;
    founder_story: string | null;
    monthly_revenue: string | null;
    social_links: SocialLinks | null;
    founder_photo_url: string | null;
  };
  founder: {
    display_name: string | null;
    city: string | null;
  };
  stats: {
    in_count: number;
    out_count: number;
    comment_count: number;
  };
};

type InstagramResolveResult = {
  videoUrl: string | null;
  embedUrl: string | null;
};

const toExternalUrl = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return `https://${trimmed}`;
};

function InstagramLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.5" cy="6.5" r="1.3" fill="currentColor" />
    </svg>
  );
}

const HLS_ENABLED = process.env.NEXT_PUBLIC_VIDEO_HLS_ENABLED === "1";
const INSTAGRAM_RESOLVE_TIMEOUT_MS = 9000;
const instagramResolveCache = new Map<string, InstagramResolveResult>();
const instagramResolveInFlight = new Map<string, Promise<InstagramResolveResult>>();

const pickPreferredVideoUrl = (hlsUrl: string | null, mp4Url: string | null) =>
  HLS_ENABLED ? hlsUrl ?? mp4Url : mp4Url ?? hlsUrl;

const pickFallbackVideoUrl = (hlsUrl: string | null, mp4Url: string | null) =>
  HLS_ENABLED ? mp4Url ?? hlsUrl : hlsUrl ?? mp4Url;

const resolveInstagramMedia = async (instagramUrl: string) => {
  const normalized = instagramUrl.trim();
  if (!normalized.length) {
    return { videoUrl: null, embedUrl: null } as InstagramResolveResult;
  }

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
        const fallback = { videoUrl: null, embedUrl: null } as InstagramResolveResult;
        instagramResolveCache.set(normalized, fallback);
        return fallback;
      }

      const payload = (await response.json()) as {
        video_url?: string | null;
        embed_url?: string | null;
      };

      const resolved = {
        videoUrl: payload.video_url ?? null,
        embedUrl: payload.embed_url ?? null,
      } as InstagramResolveResult;
      instagramResolveCache.set(normalized, resolved);
      return resolved;
    } catch {
      const fallback = { videoUrl: null, embedUrl: null } as InstagramResolveResult;
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

export default function ExpandedPitchOverlay({ pitches, index, setIndex, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const syncSenderIdRef = useRef(createPitchVoteSyncSenderId());
  const wheelBuffer = useRef(0);
  const wheelCooldown = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wheelLock = useRef(false);
  const fallbackAttemptedRef = useRef(false);
  const upNextTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const pitch = pitches[index];
  const pitchId = pitch?.id ?? "";
  const isFallbackPitch = Boolean(pitch?.isFallback);
  const canFetchPitchDetails = Boolean(pitchId && !isFallbackPitch);

  const [detail, setDetail] = useState<PitchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [activeVideoSrc, setActiveVideoSrc] = useState<string | null>(null);
  const [instagramResolved, setInstagramResolved] = useState<InstagramResolveResult | null>(null);
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const [upNextLabel, setUpNextLabel] = useState<string | null>(null);
  const [founderStoryExpanded, setFounderStoryExpanded] = useState(false);

  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [engagementError, setEngagementError] = useState<string | null>(null);
  const [localInCount, setLocalInCount] = useState(0);
  const [localOutCount, setLocalOutCount] = useState(0);

  const getAccessToken = useCallback(async () => {
    const { data } = await supabaseBrowser.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const refreshDetail = useCallback(async () => {
    if (!canFetchPitchDetails) return;
    try {
      const res = await fetch(`/api/pitches/${pitchId}/detail`, { cache: "no-store" });
      if (!res.ok) return;
      const payload = (await res.json()) as PitchDetail;
      setDetail(payload);
    } catch {
      // Keep existing stats if refresh fails.
    }
  }, [canFetchPitchDetails, pitchId]);

  const pauseCurrentVideo = () => {
    const video = videoRef.current;
    if (video) video.pause();
  };

  const clampIndex = useCallback(
    (next: number) => Math.max(0, Math.min(next, pitches.length - 1)),
    [pitches.length]
  );

  const clearUpNext = useCallback(() => {
    if (upNextTimeoutRef.current) {
      clearTimeout(upNextTimeoutRef.current);
      upNextTimeoutRef.current = null;
    }
    setUpNextLabel(null);
  }, []);

  const goNext = useCallback(() => {
    clearUpNext();
    pauseCurrentVideo();
    if (pitches.length <= 1) return;
    const nextIndex = index >= pitches.length - 1 ? 0 : index + 1;
    setIndex(nextIndex);
  }, [clearUpNext, index, pitches.length, setIndex]);

  const goPrev = useCallback(() => {
    clearUpNext();
    pauseCurrentVideo();
    setIndex(clampIndex(index - 1));
  }, [clearUpNext, clampIndex, index, setIndex]);

  const handleVideoEnded = useCallback(() => {
    if (pitches.length <= 1) return;
    const nextIndex = index >= pitches.length - 1 ? 0 : index + 1;
    const nextPitchName = pitches[nextIndex]?.name ?? "Next video";

    if (index === pitches.length - 1) {
      clearUpNext();
      setUpNextLabel(nextPitchName);
      upNextTimeoutRef.current = setTimeout(() => {
        setUpNextLabel(null);
        setIndex(nextIndex);
      }, 900);
      return;
    }

    goNext();
  }, [clearUpNext, goNext, index, pitches, setIndex]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
      if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, goNext, goPrev]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const prev = document.activeElement as HTMLElement | null;
    const mountedVideo = videoRef.current;
    dialog.focus();
    return () => {
      prev?.focus();
      if (mountedVideo) mountedVideo.pause();
    };
  }, []);

  useEffect(
    () => () => {
      if (upNextTimeoutRef.current) {
        clearTimeout(upNextTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    const check = () => setIsMobile(window.matchMedia("(max-width: 768px)").matches);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const feedVideoHlsSrc = pitch?.videoHlsUrl ?? null;
  const feedVideoMp4Src = pitch?.videoMp4Url ?? pitch?.video ?? null;
  const detailVideoHlsSrc = detail?.pitch.video_hls_url ?? null;
  const detailVideoMp4Src = detail?.pitch.video_mp4_url ?? detail?.pitch.video_url ?? null;
  const detailVideoSrc = pickPreferredVideoUrl(detailVideoHlsSrc, detailVideoMp4Src);
  const detailFallbackVideoSrc = pickFallbackVideoUrl(detailVideoHlsSrc, detailVideoMp4Src);
  const feedFallbackVideoSrc = pickFallbackVideoUrl(feedVideoHlsSrc, feedVideoMp4Src);
  const feedVideoSrc = pickPreferredVideoUrl(feedVideoHlsSrc, feedVideoMp4Src);
  const overlayInstagramUrl = pitch?.instagramUrl ?? detail?.pitch.instagram_url ?? null;
  const resolvedInstagramVideoSrc = instagramResolved?.videoUrl ?? null;
  const resolvedInstagramEmbedSrc = instagramResolved?.embedUrl ?? null;
  const videoSrc = activeVideoSrc ?? feedVideoSrc ?? detailVideoSrc ?? resolvedInstagramVideoSrc ?? null;
  const poster = detail?.pitch.poster_url ?? pitch?.poster ?? undefined;

  useEffect(() => {
    setVideoUnavailable(false);
  }, [pitchId, videoSrc]);

  useEffect(() => {
    setFounderStoryExpanded(false);
  }, [pitchId]);

  useEffect(() => {
    fallbackAttemptedRef.current = false;
    setEngagementError(null);
    setLocalInCount(Number(pitch?.upvotes ?? 0) || 0);
    setLocalOutCount(Number(pitch?.downvotes ?? 0) || 0);
    setActiveVideoSrc(feedVideoSrc ?? null);
    setInstagramResolved(null);
    clearUpNext();
  }, [clearUpNext, feedVideoSrc, pitch?.downvotes, pitch?.upvotes, pitchId]);

  useEffect(() => {
    if (!detail?.stats) return;
    setLocalInCount(Number(detail.stats.in_count ?? 0) || 0);
    setLocalOutCount(Number(detail.stats.out_count ?? 0) || 0);
  }, [detail?.stats]);

  useEffect(
    () =>
      subscribeToPitchVoteSync((payload) => {
        if (payload.pitchId !== pitchId) return;
        setLocalInCount(payload.inCount);
        setLocalOutCount(payload.outCount);
        setDetail((current) =>
          current
            ? {
                ...current,
                stats: {
                  ...current.stats,
                  in_count: payload.inCount,
                  out_count: payload.outCount,
                  comment_count: 0,
                },
              }
            : current
        );
      }),
    [pitchId]
  );

  useEffect(() => {
    if (feedVideoSrc || detailVideoSrc || activeVideoSrc) return;
    if (!overlayInstagramUrl) return;

    let active = true;
    const cached = instagramResolveCache.get(overlayInstagramUrl);
    if (cached) {
      setInstagramResolved(cached);
      return;
    }

    void resolveInstagramMedia(overlayInstagramUrl).then((resolved) => {
      if (!active) return;
      setInstagramResolved(resolved);
    });

    return () => {
      active = false;
    };
  }, [activeVideoSrc, detailVideoSrc, feedVideoSrc, overlayInstagramUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc || videoUnavailable) return;
    let active = true;

    const tryAutoplay = async () => {
      video.pause();
      video.currentTime = 0;
      video.muted = false;
      try {
        await video.play();
        return;
      } catch {
        // Mobile browsers often block autoplay with sound; retry muted.
      }

      if (!active) return;
      video.muted = true;
      await video.play().catch(() => undefined);
    };

    void tryAutoplay();
    return () => {
      active = false;
    };
  }, [pitch?.id, videoSrc, videoUnavailable]);

  useEffect(() => {
    setDetail(null);
    setDetailError(null);
    if (!canFetchPitchDetails) {
      setDetailLoading(false);
      return;
    }

    const detailAbort = new AbortController();
    let active = true;
    const loadDetail = async () => {
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/pitches/${pitchId}/detail`, {
          cache: "no-store",
          signal: detailAbort.signal,
        });
        if (!res.ok) throw new Error("Unable to load details");
        const payload = (await res.json()) as PitchDetail;
        if (!active) return;
        setDetail(payload);
      } catch (err) {
        if (!active) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setDetailError((err as Error).message);
        setDetail(null);
      } finally {
        if (!active) return;
        setDetailLoading(false);
      }
    };
    loadDetail();
    return () => {
      active = false;
      detailAbort.abort();
    };
  }, [canFetchPitchDetails, pitchId]);

  useEffect(() => {
    if (activeVideoSrc) return;
    if (!detailVideoSrc) return;
    setActiveVideoSrc(detailVideoSrc);
  }, [activeVideoSrc, detailVideoSrc]);

  const handleVideoError = () => {
    const candidate =
      detailFallbackVideoSrc ?? feedFallbackVideoSrc ?? detailVideoSrc ?? feedVideoSrc;
    if (!fallbackAttemptedRef.current && candidate && videoSrc && candidate !== videoSrc) {
      fallbackAttemptedRef.current = true;
      setVideoUnavailable(false);
      setActiveVideoSrc(candidate);
      return;
    }
    setVideoUnavailable(true);
  };

  useEffect(() => {
    if (!videoUnavailable) return;
    const candidate =
      detailFallbackVideoSrc ?? feedFallbackVideoSrc ?? detailVideoSrc ?? feedVideoSrc;
    if (!fallbackAttemptedRef.current && candidate && videoSrc && candidate !== videoSrc) {
      fallbackAttemptedRef.current = true;
      setVideoUnavailable(false);
      setActiveVideoSrc(candidate);
    }
  }, [detailFallbackVideoSrc, detailVideoSrc, feedFallbackVideoSrc, feedVideoSrc, videoSrc, videoUnavailable]);

  const handleWheel = (e: WheelEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const dominant = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(dominant) < 8) return;

    wheelBuffer.current += dominant;

    if (wheelCooldown.current) clearTimeout(wheelCooldown.current);
    wheelCooldown.current = setTimeout(() => {
      wheelBuffer.current = 0;
    }, 140);

    if (wheelLock.current) return;
    const threshold = 80;
    if (Math.abs(wheelBuffer.current) < threshold) return;

    wheelLock.current = true;
    if (wheelBuffer.current > 0) goNext();
    else goPrev();
    wheelBuffer.current = 0;
    setTimeout(() => {
      wheelLock.current = false;
    }, 420);
  };

  const instagramUrl = useMemo(
    () => toExternalUrl(detail?.startup.social_links?.instagram ?? detail?.pitch.instagram_url ?? null),
    [detail?.pitch.instagram_url, detail?.startup.social_links?.instagram]
  );

  const startupName = detail?.startup.name?.trim() || pitch.name || "Startup";
  const startupProfileId = detail?.startup.id ?? pitch.startupId ?? null;
  const startupOneLiner = detail?.startup.one_liner?.trim() || pitch.tagline || null;
  const startupCategory = detail?.startup.category?.trim() || pitch.category || null;
  const founderStory = detail?.startup.founder_story?.trim() || null;
  const founderStoryNeedsToggle = Boolean(founderStory && founderStory.length > 200);
  const founderStoryText = founderStory
    ? founderStoryExpanded || !founderStoryNeedsToggle
      ? founderStory
      : `${founderStory.slice(0, 200).trim()}...`
    : null;

  const inCount = localInCount;
  const outCount = localOutCount;

  const handleShare = async () => {
    const shareUrl = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: pitch.name, url: shareUrl });
        setShareFeedback("Shared");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setShareFeedback("Link copied");
      } else {
        setShareFeedback("Copy not supported");
      }
    } catch (err) {
      console.error(err);
      setShareFeedback("Share failed");
    } finally {
      setTimeout(() => setShareFeedback(null), 1800);
    }
  };

  const handleVote = useCallback(
    async (vote: "in" | "out") => {
      setEngagementError(null);
      if (!canFetchPitchDetails) return;
      try {
        const token = await getAccessToken();
        const headers: Record<string, string> = {
          "content-type": "application/json",
        };
        if (!token) {
          // Guests can vote without signing in.
        } else {
          headers.Authorization = `Bearer ${token}`;
        }
        const res = await fetch(`/api/pitches/${pitchId}/vote`, {
          method: "POST",
          headers,
          body: JSON.stringify({ vote }),
        });
        if (!res.ok) {
          setEngagementError("Unable to vote.");
          return;
        }
        const payload = (await res.json()) as {
          stats?: { in_count?: number; out_count?: number };
        };
        const nextInCount = payload?.stats?.in_count;
        const nextOutCount = payload?.stats?.out_count;
        if (typeof nextInCount === "number" && typeof nextOutCount === "number") {
          setLocalInCount(nextInCount);
          setLocalOutCount(nextOutCount);
          setDetail((current) =>
            current
              ? {
                  ...current,
                  stats: {
                    ...current.stats,
                    in_count: nextInCount,
                    out_count: nextOutCount,
                    comment_count: 0,
                  },
                }
              : current
          );
          broadcastPitchVoteSync({
            senderId: syncSenderIdRef.current,
            pitchId,
            inCount: nextInCount,
            outCount: nextOutCount,
            sentAt: Date.now(),
          });
          return;
        }
        await refreshDetail();
      } catch {
        setEngagementError("Unable to vote.");
      }
    },
    [canFetchPitchDetails, getAccessToken, pitchId, refreshDetail]
  );

  const showInstagramEmbedFallback = !videoSrc && !videoUnavailable && Boolean(resolvedInstagramEmbedSrc);
  const showVideoFallback = (!videoSrc && !showInstagramEmbedFallback) || videoUnavailable;

  if (!pitch) return null;

  return (
    <div className="expand-backdrop" onClick={onClose}>
      <div
        className="expand-shell"
        role="dialog"
        aria-label={`Expanded video ${pitch.name}`}
        aria-modal="true"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
      >
        <button className="expand-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {pitches.length > 1 && (
          <>
            <button
              className="expand-nav prev"
              onClick={goPrev}
              aria-label="Previous video"
              disabled={index === 0}
              style={isMobile ? { top: "auto", bottom: 14, transform: "none" } : undefined}
            >
              ‹
            </button>
            <button
              className="expand-nav next"
              onClick={goNext}
              aria-label="Next video"
              style={isMobile ? { top: "auto", bottom: 14, transform: "none" } : undefined}
            >
              ›
            </button>
          </>
        )}

        <div className="expand-layout">
          <div className="expand-video expand-video-mobile" aria-label="Startup video">
            {!showVideoFallback ? (
              <video
                key={videoSrc ?? "pitch-video"}
                ref={videoRef}
                className="expand-media"
                src={videoSrc ?? undefined}
                poster={poster}
                controls
                autoPlay
                playsInline
                preload="metadata"
                onError={handleVideoError}
                onLoadedData={() => setVideoUnavailable(false)}
                onEnded={handleVideoEnded}
              />
            ) : showInstagramEmbedFallback ? (
              <iframe
                key={resolvedInstagramEmbedSrc ?? "instagram-embed"}
                className="expand-media"
                src={resolvedInstagramEmbedSrc ?? undefined}
                title={`${startupName} Instagram video`}
                allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : (
              <div
                className="expand-media expand-media-fallback"
                style={{
                  backgroundImage: poster ? `url(${poster})` : "none",
                  backgroundColor: "var(--overlay-media-fallback)",
                }}
              >
                {!poster ? (
                  <span className="expand-media-fallback-label">Video unavailable</span>
                ) : null}
              </div>
            )}
            {upNextLabel ? (
              <div className="expand-up-next" aria-live="polite">
                Coming up next: <strong>{upNextLabel}</strong>
              </div>
            ) : null}
          </div>

          <div className="expand-info expand-info-mobile" aria-label="Founder and startup details">
            {detailLoading ? <p className="trust-note">Loading details…</p> : null}
            {detailError ? <p className="trust-note error">Details unavailable.</p> : null}

            <div className="expand-startup">
              <p className="metric-label">Startup / company</p>
              {startupProfileId ? (
                <Link href={`/startup/${startupProfileId}`} className="expand-startup-link">
                  <h3 className="expand-startup-name">{startupName}</h3>
                </Link>
              ) : (
                <h3 className="expand-startup-name">{startupName}</h3>
              )}
              {startupCategory ? (
                <div className="expand-startup-category">
                  <span>{startupCategory}</span>
                </div>
              ) : null}
              {startupOneLiner ? <p className="expand-startup-tagline">{startupOneLiner}</p> : null}
            </div>

            <div className="trust-actions">
              <button type="button" className="trust-action ghost" onClick={handleShare}>
                Share
              </button>
              <div className="trust-social-links" aria-label="Startup social links">
                {instagramUrl ? (
                  <a
                    className="trust-social-link"
                    href={instagramUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label="Open Instagram profile"
                    title="Open Instagram"
                  >
                    <InstagramLogo />
                  </a>
                ) : (
                  <span
                    className="trust-social-link is-disabled"
                    aria-label="Instagram profile not available"
                    title="Instagram link not added"
                  >
                    <InstagramLogo />
                  </span>
                )}
              </div>
              {shareFeedback ? <span className="trust-action-feedback">{shareFeedback}</span> : null}
            </div>

            <div className="expand-engagement" aria-label="Video engagement">
              <button
                type="button"
                className="expand-engage-btn"
                onClick={() => void handleVote("in")}
                disabled={!canFetchPitchDetails}
                aria-label="Upvote video"
              >
                ▲ <span>{inCount}</span>
              </button>
              <button
                type="button"
                className="expand-engage-btn"
                onClick={() => void handleVote("out")}
                disabled={!canFetchPitchDetails}
                aria-label="Downvote video"
              >
                ▼ <span>{outCount}</span>
              </button>
            </div>

            {engagementError ? <p className="trust-note error">{engagementError}</p> : null}

            {founderStoryText ? (
              <div className="trust-founder-story">
                <p className="metric-label">Founder story</p>
                <p className="metric-value">{founderStoryText}</p>
                {founderStoryNeedsToggle ? (
                  <button
                    type="button"
                    className="trust-story-toggle"
                    onClick={() => setFounderStoryExpanded((current) => !current)}
                  >
                    {founderStoryExpanded ? "Show less" : "Show more"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
