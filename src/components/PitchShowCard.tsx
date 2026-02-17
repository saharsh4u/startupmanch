"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ContactModal from "./ContactModal";
import { supabaseBrowser } from "@/lib/supabase/client";

export type PitchShow = {
  id: string;
  startupId?: string | null;
  name: string;
  tagline: string;
  poster: string;
  video?: string | null;
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

export default function PitchShowCard({
  pitch,
  size,
  variant = "regular",
  onExpand,
  interactive = true,
}: PitchShowCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [localUpvotes, setLocalUpvotes] = useState(0);
  const [localDownvotes, setLocalDownvotes] = useState(0);
  const [localComments, setLocalComments] = useState(0);
  const [engagementBusy, setEngagementBusy] = useState(false);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = true;
  }, [pitch.video]);

  useEffect(() => {
    setLocalUpvotes(Number.isFinite(Number(pitch.upvotes)) ? Number(pitch.upvotes) : 0);
    setLocalDownvotes(Number.isFinite(Number(pitch.downvotes)) ? Number(pitch.downvotes) : 0);
    setLocalComments(Number.isFinite(Number(pitch.comments)) ? Number(pitch.comments) : 0);
  }, [pitch.comments, pitch.downvotes, pitch.id, pitch.upvotes]);

  const label = `Pitch: ${pitch.name}, 60s`;
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
      className={`pitch-show-card ${size} ${variant === "hot" ? "is-hot" : "is-regular"}`}
      tabIndex={interactive ? 0 : -1}
      aria-label={label}
      onClick={
        interactive
          ? () => {
              if (onExpand) return onExpand(pitch);
              dialogRef.current?.showModal();
            }
          : undefined
      }
    >
      {pitch.video ? (
        <video
          ref={videoRef}
          className="pitch-show-media"
          src={pitch.video}
          poster={pitch.poster}
          muted
          playsInline
          autoPlay
          loop
          preload="metadata"
        />
      ) : (
        <div
          className={`pitch-show-media ${variant === "hot" ? "on-dark" : "on-light"}`}
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
      )}
      <div className={`pitch-show-overlay ${variant === "hot" ? "on-dark" : "on-light"}`}>
        <div className="pitch-show-topline">
          <span className="pitch-show-badge">60s pitch</span>
        </div>
        <div className="pitch-show-text">
          <h4>{pitch.name}</h4>
          <div className="pitch-engagement-inline" aria-label="Engagement controls">
            <button
              type="button"
              className="pitch-engage-btn"
              onClick={(event) => {
                event.stopPropagation();
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
          <p>{pitch.tagline}</p>
        </div>
        {hasRevenue ? (
          <div className="pitch-show-meta">
            <div className="pitch-revenue-chip is-self-reported">
              Self reported: {pitch.monthlyRevenue}
            </div>
          </div>
        ) : null}
        {variant === "hot" ? <div className="pitch-show-playghost">▶</div> : <div className="pitch-show-footer">Pitch Preview</div>}
      </div>
      <ContactModal ref={dialogRef} pitch={pitch} />
    </article>
  );
}
