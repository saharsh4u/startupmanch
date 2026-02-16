"use client";

import { useEffect, useRef } from "react";
import ContactModal from "./ContactModal";

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

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = true;
  }, [pitch.video]);

  const label = `Pitch: ${pitch.name}, 60s`;
  const score = Number.isFinite(Number(pitch.score)) ? Number(pitch.score) : 0;
  const upvotes = Number.isFinite(Number(pitch.upvotes)) ? Number(pitch.upvotes) : 0;
  const comments = Number.isFinite(Number(pitch.comments)) ? Number(pitch.comments) : 0;
  const hasRevenue = Boolean((pitch.monthlyRevenue ?? "").trim().length);
  const scoreLabel = Number.isInteger(score) ? `${score}` : score.toFixed(1);

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
          <p>{pitch.tagline}</p>
        </div>
        <div className="pitch-show-meta">
          <div className="pitch-show-metrics">
            <span className="pitch-metric-chip">Score: {scoreLabel}</span>
            <span className="pitch-metric-chip">Upvotes: {upvotes}</span>
            <span className="pitch-metric-chip">Comments: {comments}</span>
          </div>
          {hasRevenue ? (
            <div className="pitch-revenue-chip is-self-reported">
              Self reported: {pitch.monthlyRevenue}
            </div>
          ) : null}
        </div>
        {variant === "hot" ? <div className="pitch-show-playghost">▶</div> : <div className="pitch-show-footer">Pitch Preview</div>}
      </div>
      <ContactModal ref={dialogRef} pitch={pitch} />
    </article>
  );
}
