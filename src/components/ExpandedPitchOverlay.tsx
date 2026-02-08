"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, WheelEvent } from "react";
import type { PitchShow } from "./PitchShowCard";

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

type CommentItem = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  parent_id: string | null;
};

export default function ExpandedPitchOverlay({ pitches, index, setIndex, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const wheelBuffer = useRef(0);
  const wheelCooldown = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wheelLock = useRef(false);
  const [isMobile, setIsMobile] = useState(false);
  const pitch = pitches[index];

  const [detail, setDetail] = useState<PitchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [postingComment, setPostingComment] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

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
    dialog.focus();
    return () => {
      prev?.focus();
      const vid = videoRef.current;
      if (vid) vid.pause();
    };
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.matchMedia("(max-width: 768px)").matches);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
      video.play().catch(() => undefined);
    }
  }, [pitch]);

  useEffect(() => {
    if (!pitch) return;
    const loadDetail = async () => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const res = await fetch(`/api/pitches/${pitch.id}/detail`, { cache: "no-store" });
        if (!res.ok) throw new Error("Unable to load pitch details");
        const payload = (await res.json()) as PitchDetail;
        setDetail(payload);
      } catch (err) {
        setDetailError((err as Error).message);
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    };
    const loadComments = async () => {
      setCommentsLoading(true);
      setCommentError(null);
      try {
        const res = await fetch(`/api/pitches/${pitch.id}/comments`, { cache: "no-store" });
        if (!res.ok) throw new Error("Unable to load comments");
        const payload = await res.json();
        setComments((payload?.comments as CommentItem[]) ?? []);
      } catch (err) {
        setCommentError((err as Error).message);
        setComments([]);
      } finally {
        setCommentsLoading(false);
      }
    };
    loadDetail();
    loadComments();
  }, [pitch]);

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

  const videoSrc = detail?.pitch.video_url ?? pitch?.video ?? null;
  const poster = detail?.pitch.poster_url ?? pitch?.poster ?? undefined;

  const socialLinks = useMemo(() => detail?.startup.social_links ?? {}, [detail]);

  const website = detail?.startup.website ?? null;
  const normalizedWebsite = useMemo(() => {
    if (!website) return null;
    return website.startsWith("http") ? website : `https://${website}`;
  }, [website]);

  const founderName = detail?.founder.display_name ?? pitch.name ?? "Founder";
  const founderCity = detail?.startup.city ?? detail?.founder.city ?? "—";

  const foundedDisplay = useMemo(() => {
    if (!detail?.pitch.created_at) return "—";
    return new Date(detail.pitch.created_at).toLocaleDateString(undefined, {
      month: "short",
      year: "numeric",
    });
  }, [detail?.pitch.created_at]);

  const lastUpdatedDisplay = useMemo(() => {
    if (!detail?.pitch.created_at) return "—";
    return new Date(detail.pitch.created_at).toLocaleString();
  }, [detail?.pitch.created_at]);

  const valueProposition = detail?.startup.one_liner ?? pitch.tagline ?? "—";
  const problemSolved = detail?.startup.founder_story ?? "—";
  const pricingInfo = detail?.startup.monthly_revenue
    ? `${detail.startup.monthly_revenue} / mo`
    : "—";
  const targetAudience = detail?.startup.category ?? "—";
  const businessDetails = [
    detail?.pitch.ask ? `Ask: ${detail.pitch.ask}` : null,
    detail?.pitch.equity ? `Equity: ${detail.pitch.equity}` : null,
    detail?.pitch.valuation ? `Valuation: ${detail.pitch.valuation}` : null,
  ]
    .filter(Boolean)
    .join(" • ") || "—";

  const tagList = useMemo(() => {
    const source = detail?.startup.category ?? pitch.tagline ?? "";
    return source
      .split(/[,&/]|\band\b/i)
      .map((tag) => tag.trim())
      .filter((tag, idx, arr) => tag && arr.indexOf(tag) === idx)
      .slice(0, 6);
  }, [detail?.startup.category, pitch.tagline]);

  const metricAllTimeRevenue = "—";
  const metricRank = "—";
  const metricMrr = detail?.startup.monthly_revenue ?? "—";
  const metricActiveSubs = "—";
  const verificationSource = normalizedWebsite ? "Website linked" : "Not verified";

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

  const handleCommentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setPostingComment(true);
    setCommentError(null);
    try {
      const res = await fetch(`/api/pitches/${pitch.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentBody.trim() }),
      });
      if (res.status === 401) throw new Error("Sign in to comment.");
      if (!res.ok) throw new Error("Failed to post comment.");
      const payload = await res.json();
      const newComment = payload?.comment as CommentItem | undefined;
      if (newComment) setComments((prev) => [...prev, newComment]);
      setCommentBody("");
    } catch (err) {
      setCommentError((err as Error).message);
    } finally {
      setPostingComment(false);
    }
  };

  const handleVisit = () => {
    if (!normalizedWebsite) return;
    window.open(normalizedWebsite, "_blank", "noopener,noreferrer");
  };

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
          <div className="expand-video" aria-label="Pitch video">
            {videoSrc ? (
              <video
                ref={videoRef}
                className="expand-media"
                src={videoSrc}
                poster={poster}
                controls
                autoPlay
                playsInline
              />
            ) : (
              <div className="expand-media" style={{ backgroundImage: `url(${pitch.poster})` }} />
            )}
          </div>

          <div className="expand-info" aria-label="Founder and pitch details">
            <div className="expand-meta-toprow">
              <div className="pitch-show-badge">Pitch</div>
              <span className="expand-counter" aria-live="polite">
                {index + 1} / {pitches.length}
              </span>
            </div>

            {detailLoading ? <p className="trust-note">Loading details…</p> : null}
            {detailError ? <p className="trust-note error">Details unavailable.</p> : null}

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

            <div className="trust-metric-grid">
              {[
                { label: "All-time revenue", value: metricAllTimeRevenue },
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

            <div className="trust-verify">
              <div className="trust-verify-badge">Revenue verified</div>
              <p className="metric-value">{verificationSource}</p>
              <p className="metric-label">Last updated {lastUpdatedDisplay}</p>
            </div>

            <div className="trust-insight">
              <h5>Value proposition</h5>
              <p>{valueProposition}</p>
            </div>
            <div className="trust-insight">
              <h5>Problem solved</h5>
              <p>{problemSolved}</p>
            </div>
            <div className="trust-insight">
              <h5>Pricing</h5>
              <p>{pricingInfo}</p>
            </div>
            <div className="trust-insight">
              <h5>Target audience</h5>
              <p>{targetAudience}</p>
            </div>
            <div className="trust-insight">
              <h5>Business details</h5>
              <p>{businessDetails}</p>
            </div>

            {tagList.length ? (
              <div className="trust-tags">
                {tagList.map((tag) => (
                  <span key={tag} className="chip">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="founder-section">
              <h5>Links</h5>
              <div className="founder-links">
                {socialLinks?.website ? (
                  <a href={socialLinks.website} target="_blank" rel="noreferrer" className="chip">
                    Website
                  </a>
                ) : null}
                {socialLinks?.linkedin ? (
                  <a href={socialLinks.linkedin} target="_blank" rel="noreferrer" className="chip">
                    LinkedIn
                  </a>
                ) : null}
                {socialLinks?.twitter ? (
                  <a href={socialLinks.twitter} target="_blank" rel="noreferrer" className="chip">
                    Twitter
                  </a>
                ) : null}
                {socialLinks?.instagram ? (
                  <a href={socialLinks.instagram} target="_blank" rel="noreferrer" className="chip">
                    Instagram
                  </a>
                ) : null}
                {!socialLinks ||
                (!socialLinks.website && !socialLinks.linkedin && !socialLinks.twitter && !socialLinks.instagram) ? (
                  <p className="muted">No links yet.</p>
                ) : null}
              </div>
            </div>

            <div className="founder-section">
              <div className="founder-section-header">
                <h5>Comments</h5>
                <span className="muted">{detail?.stats.comment_count ?? comments.length} total</span>
              </div>
              {commentsLoading ? <p className="muted">Loading comments…</p> : null}
              {commentError ? <p className="comment-error">{commentError}</p> : null}
              <div className="comment-list">
                {comments.map((item) => (
                  <div key={item.id} className="comment-item">
                    <p className="comment-body">{item.body}</p>
                    <span className="comment-meta">{new Date(item.created_at).toLocaleString()}</span>
                  </div>
                ))}
                {!commentsLoading && comments.length === 0 ? <p className="muted">No comments yet.</p> : null}
              </div>
              <form className="comment-input" onSubmit={handleCommentSubmit}>
                <textarea
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Share your thoughts"
                  rows={3}
                />
                <button type="submit" disabled={postingComment || !commentBody.trim()}>
                  {postingComment ? "Posting…" : "Post"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
