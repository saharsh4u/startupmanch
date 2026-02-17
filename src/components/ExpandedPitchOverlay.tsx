"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WheelEvent } from "react";
import type { PitchShow } from "./PitchShowCard";
import RevenueSparkline from "./RevenueSparkline";
import { supabaseBrowser } from "@/lib/supabase/client";

type Props = {
  pitches: PitchShow[];
  index: number;
  setIndex: (idx: number) => void;
  onClose: () => void;
};

type PitchComment = {
  id: string;
  body: string;
  parent_id: string | null;
  created_at: string;
  user_id: string;
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

type RevenueData = {
  provider: "stripe" | "razorpay" | null;
  status: "active" | "error" | "revoked" | "missing";
  last_updated: string | null;
  metrics: {
    all_time_revenue: number | null;
    mrr: number | null;
    active_subscriptions: number | null;
  };
  currency: string;
  series: { date: string; amount: number }[];
};

export default function ExpandedPitchOverlay({ pitches, index, setIndex, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const wheelBuffer = useRef(0);
  const wheelCooldown = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wheelLock = useRef(false);
  const fallbackAttemptedRef = useRef(false);
  const [isMobile, setIsMobile] = useState(false);
  const pitch = pitches[index];
  const pitchId = pitch?.id ?? "";
  const isFallbackPitch = Boolean(pitch?.isFallback);
  const canFetchPitchDetails = Boolean(pitchId && !isFallbackPitch);

  const [detail, setDetail] = useState<PitchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [activeVideoSrc, setActiveVideoSrc] = useState<string | null>(null);
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const [founderStoryExpanded, setFounderStoryExpanded] = useState(false);

  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [engagementError, setEngagementError] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [comments, setComments] = useState<PitchComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);

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

  const goNext = useCallback(() => {
    pauseCurrentVideo();
    setIndex(clampIndex(index + 1));
  }, [clampIndex, index, setIndex]);

  const goPrev = useCallback(() => {
    pauseCurrentVideo();
    setIndex(clampIndex(index - 1));
  }, [clampIndex, index, setIndex]);

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

  useEffect(() => {
    const check = () => setIsMobile(window.matchMedia("(max-width: 768px)").matches);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const feedVideoSrc = pitch?.video ?? null;
  const detailVideoSrc = detail?.pitch.video_url ?? null;

  const videoSrc = activeVideoSrc ?? feedVideoSrc ?? detailVideoSrc ?? null;
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
    setCommentsOpen(false);
    setComments([]);
    setCommentDraft("");
    setActiveVideoSrc(feedVideoSrc ?? null);
  }, [pitchId, feedVideoSrc]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc || videoUnavailable) return;
    video.pause();
    video.currentTime = 0;
    video.play().catch(() => undefined);
  }, [pitch?.id, videoSrc, videoUnavailable]);

  useEffect(() => {
    setDetail(null);
    setDetailError(null);
    setRevenue(null);
    if (!canFetchPitchDetails) {
      setDetailLoading(false);
      setRevenueLoading(false);
      return;
    }

    const detailAbort = new AbortController();
    const revenueAbort = new AbortController();
    let active = true;
    const loadDetail = async () => {
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/pitches/${pitchId}/detail`, {
          cache: "no-store",
          signal: detailAbort.signal,
        });
        if (!res.ok) throw new Error("Unable to load pitch details");
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
    const loadRevenue = async () => {
      setRevenueLoading(true);
      try {
        const res = await fetch(`/api/pitches/${pitchId}/revenue`, {
          cache: "no-store",
          signal: revenueAbort.signal,
        });
        if (!res.ok) throw new Error("Unable to load revenue");
        const payload = (await res.json()) as RevenueData;
        if (!active) return;
        setRevenue(payload);
      } catch (err) {
        if (!active) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setRevenue(null);
      } finally {
        if (!active) return;
        setRevenueLoading(false);
      }
    };
    loadRevenue();
    return () => {
      active = false;
      detailAbort.abort();
      revenueAbort.abort();
    };
  }, [canFetchPitchDetails, pitchId]);

  useEffect(() => {
    if (!commentsOpen) return;
    if (!canFetchPitchDetails) return;
    const abort = new AbortController();
    let active = true;

    const loadComments = async () => {
      setCommentsLoading(true);
      try {
        const res = await fetch(`/api/pitches/${pitchId}/comments`, {
          cache: "no-store",
          signal: abort.signal,
        });
        if (!res.ok) throw new Error("Unable to load comments");
        const payload = (await res.json()) as { comments?: PitchComment[] };
        if (!active) return;
        setComments(Array.isArray(payload.comments) ? payload.comments : []);
      } catch (err) {
        if (!active) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setComments([]);
      } finally {
        if (!active) return;
        setCommentsLoading(false);
      }
    };

    loadComments();
    return () => {
      active = false;
      abort.abort();
    };
  }, [canFetchPitchDetails, commentsOpen, pitchId]);

  useEffect(() => {
    if (activeVideoSrc) return;
    if (!detailVideoSrc) return;
    setActiveVideoSrc(detailVideoSrc);
  }, [activeVideoSrc, detailVideoSrc]);

  const handleVideoError = () => {
    const candidate = detailVideoSrc;
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
    const candidate = detailVideoSrc;
    if (!fallbackAttemptedRef.current && candidate && videoSrc && candidate !== videoSrc) {
      fallbackAttemptedRef.current = true;
      setVideoUnavailable(false);
      setActiveVideoSrc(candidate);
    }
  }, [detailVideoSrc, videoSrc, videoUnavailable]);

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

  const website = detail?.startup.website ?? null;
  const normalizedWebsite = useMemo(() => {
    if (!website) return null;
    return website.startsWith("http") ? website : `https://${website}`;
  }, [website]);

  const founderName = detail?.founder.display_name ?? pitch.name ?? "Founder";
  const founderCity = detail?.startup.city ?? detail?.founder.city ?? "—";
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

  const foundedDisplay = useMemo(() => {
    if (!detail?.pitch.created_at) return "—";
    return new Date(detail.pitch.created_at).toLocaleDateString(undefined, {
      month: "short",
      year: "numeric",
    });
  }, [detail?.pitch.created_at]);

  const lastUpdatedDisplay = useMemo(() => {
    const ts = revenue?.last_updated ?? detail?.pitch.created_at;
    if (!ts) return "—";
    return new Date(ts).toLocaleString();
  }, [revenue?.last_updated, detail?.pitch.created_at]);

  const metricRank = "—";
  const metricMrr = revenue?.metrics.mrr ?? detail?.startup.monthly_revenue ?? "—";
  const metricActiveSubs = revenue?.metrics.active_subscriptions ?? "—";
  const hasVerifiedRevenue = Boolean(revenue?.provider && revenue.status === "active");
  const verificationBadgeText = hasVerifiedRevenue ? "Verified revenue" : "Self-reported revenue";
  const verificationBadgeClassName = hasVerifiedRevenue
    ? "trust-verify-badge is-verified"
    : "trust-verify-badge is-self-reported";
  const verificationSource = hasVerifiedRevenue
    ? `Connected via ${revenue?.provider === "stripe" ? "Stripe" : "Razorpay"} (read-only)`
    : detail?.startup.monthly_revenue
      ? "Reported by founder. Not third-party verified."
      : "No verification source connected";
  const metricAllTime = revenue?.metrics.all_time_revenue ?? null;
  const inCount = detail?.stats.in_count ?? (Number(pitch.upvotes ?? 0) || 0);
  const outCount = detail?.stats.out_count ?? (Number(pitch.downvotes ?? 0) || 0);
  const commentCount = detail?.stats.comment_count ?? (Number(pitch.comments ?? 0) || 0);

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

  const handleVisit = () => {
    if (!normalizedWebsite) return;
    window.open(normalizedWebsite, "_blank", "noopener,noreferrer");
  };

  const handleVote = useCallback(
    async (vote: "in" | "out") => {
      setEngagementError(null);
      if (!canFetchPitchDetails) return;
      try {
        const token = await getAccessToken();
        if (!token) {
          setEngagementError("Sign in to vote.");
          return;
        }
        const res = await fetch(`/api/pitches/${pitchId}/vote`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ vote }),
        });
        if (!res.ok) {
          setEngagementError("Unable to vote.");
          return;
        }
        await refreshDetail();
      } catch {
        setEngagementError("Unable to vote.");
      }
    },
    [canFetchPitchDetails, getAccessToken, pitchId, refreshDetail]
  );

  const handleSubmitComment = useCallback(async () => {
    setEngagementError(null);
    if (!canFetchPitchDetails) return;
    const body = commentDraft.trim();
    if (body.length < 2) return;

    try {
      setCommentSubmitting(true);
      const token = await getAccessToken();
      if (!token) {
        setEngagementError("Sign in to comment.");
        return;
      }
      const res = await fetch(`/api/pitches/${pitchId}/comments`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        setEngagementError("Unable to post comment.");
        return;
      }
      const payload = (await res.json()) as { comment?: PitchComment };
      if (payload?.comment) {
        setComments((prev) => [...prev, payload.comment as PitchComment]);
      }
      setCommentDraft("");
      setCommentsOpen(true);
      await refreshDetail();
    } catch {
      setEngagementError("Unable to post comment.");
    } finally {
      setCommentSubmitting(false);
    }
  }, [canFetchPitchDetails, commentDraft, getAccessToken, pitchId, refreshDetail]);

  const showVideoFallback = !videoSrc || videoUnavailable;

  if (!pitch) return null;

  return (
    <div className="expand-backdrop" onClick={onClose}>
      <div
        className="expand-shell"
        role="dialog"
        aria-label={`Expanded pitch ${pitch.name}`}
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
              aria-label="Previous pitch"
              disabled={index === 0}
              style={isMobile ? { top: "auto", bottom: 14, transform: "none" } : undefined}
            >
              ‹
            </button>
            <button
              className="expand-nav next"
              onClick={goNext}
              aria-label="Next pitch"
              disabled={index === pitches.length - 1}
              style={isMobile ? { top: "auto", bottom: 14, transform: "none" } : undefined}
            >
              ›
            </button>
          </>
        )}

        <div className="expand-layout">
          <div className="expand-video expand-video-mobile" aria-label="Pitch video">
            {!showVideoFallback ? (
              <video
                key={videoSrc}
                ref={videoRef}
                className="expand-media"
                src={videoSrc}
                poster={poster}
                controls
                autoPlay
                playsInline
                preload="metadata"
                onError={handleVideoError}
                onLoadedData={() => setVideoUnavailable(false)}
              />
            ) : (
              <div
                className="expand-media expand-media-fallback"
                style={{
                  backgroundImage: poster ? `url(${poster})` : "none",
                  backgroundColor: "var(--overlay-media-fallback)",
                }}
              >
                <span className="expand-media-fallback-label">Video unavailable</span>
              </div>
            )}
          </div>

          <div className="expand-info expand-info-mobile" aria-label="Founder and pitch details">
            <div className="expand-meta-toprow">
              <div className="pitch-show-badge">Pitch</div>
              <span className="expand-counter" aria-live="polite">
                {index + 1} / {pitches.length}
              </span>
            </div>

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
              <button
                type="button"
                className="trust-action primary"
                onClick={handleVisit}
                disabled={!normalizedWebsite}
              >
                Visit site
              </button>
              <button type="button" className="trust-action ghost" onClick={handleShare}>
                Share
              </button>
              {shareFeedback ? <span className="trust-action-feedback">{shareFeedback}</span> : null}
            </div>

            <div className="expand-engagement" aria-label="Pitch engagement">
              <button
                type="button"
                className="expand-engage-btn"
                onClick={() => void handleVote("in")}
                disabled={!canFetchPitchDetails}
                aria-label="Upvote pitch"
              >
                ▲ <span>{inCount}</span>
              </button>
              <button
                type="button"
                className="expand-engage-btn"
                onClick={() => void handleVote("out")}
                disabled={!canFetchPitchDetails}
                aria-label="Downvote pitch"
              >
                ▼ <span>{outCount}</span>
              </button>
              <button
                type="button"
                className="expand-engage-btn"
                onClick={() => setCommentsOpen((current) => !current)}
                disabled={!canFetchPitchDetails}
                aria-label="Toggle comments"
              >
                💬 <span>{commentCount}</span>
              </button>
            </div>

            {engagementError ? <p className="trust-note error">{engagementError}</p> : null}

            {commentsOpen ? (
              <div className="expand-comments" aria-label="Comments">
                <div className="expand-comments-header">
                  <h5>Comments</h5>
                  {commentsLoading ? <span className="trust-note">Loading…</span> : null}
                </div>
                <div className="expand-comments-list">
                  {!commentsLoading && comments.length === 0 ? (
                    <p className="trust-note">No comments yet.</p>
                  ) : null}
                  {comments.map((comment) => (
                    <div key={comment.id} className="expand-comment">
                      <p className="expand-comment-body">{comment.body}</p>
                      <p className="expand-comment-meta">
                        {new Date(comment.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="expand-comments-form">
                  <textarea
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder="Write a comment…"
                    aria-label="Write a comment"
                    rows={3}
                  />
                  <button
                    type="button"
                    className="trust-action secondary"
                    onClick={() => void handleSubmitComment()}
                    disabled={commentSubmitting || commentDraft.trim().length < 2}
                  >
                    {commentSubmitting ? "Posting…" : "Post comment"}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="trust-metric-grid">
              {[
                {
                  label: "All-time revenue",
                  value:
                    metricAllTime !== null
                      ? new Intl.NumberFormat(undefined, {
                          style: "currency",
                          currency: revenue?.currency?.toUpperCase?.() || "USD",
                          maximumFractionDigits: 0,
                        }).format(metricAllTime)
                      : "—",
                },
                { label: "Rank", value: metricRank },
                { label: "MRR (est.)", value: metricMrr },
                { label: "Active subscriptions", value: metricActiveSubs },
              ].map((metric) => (
                <div key={metric.label} className="trust-metric">
                  <p className="metric-label">{metric.label}</p>
                  <p className="metric-value">{metric.value}</p>
                </div>
              ))}
            </div>

            <div className="trust-meta">
              <div className="founder-card">
                <div className="founder-avatar">
                  {detail?.startup.founder_photo_url ? (
                    <div
                      className="founder-avatar-img"
                      style={{ backgroundImage: `url(${detail.startup.founder_photo_url})` }}
                    />
                  ) : (
                    <span>{founderName.slice(0, 1)}</span>
                  )}
                </div>
                <div>
                  <h4>{founderName}</h4>
                  <p>{founderCity}</p>
                </div>
              </div>
              <div className="trust-meta-data">
                <div>
                  <p className="metric-label">Founded</p>
                  <p className="metric-value">{foundedDisplay}</p>
                </div>
                <div>
                  <p className="metric-label">Country</p>
                  <p className="metric-value">{founderCity}</p>
                </div>
              </div>
            </div>

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

            <div className="trust-verify">
              <div className={verificationBadgeClassName}>{verificationBadgeText}</div>
              <p className="metric-value">{verificationSource}</p>
              <p className="metric-label">Last updated {lastUpdatedDisplay}</p>
            </div>

            <div className="trust-insight">
              <h5>Revenue (last 90 days)</h5>
              {revenueLoading ? <p className="metric-label">Loading revenue…</p> : null}
              {!revenueLoading && <RevenueSparkline series={revenue?.series ?? []} currency={revenue?.currency ?? "USD"} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
