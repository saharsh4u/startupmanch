"use client";

import { useEffect, useRef } from "react";

export type ArenaPitch = {
  id: string;
  name: string;
  tagline: string;
  poster: string;
  video?: string | null;
};

type PitchArenaCardProps = {
  pitch: ArenaPitch;
  variant: "main" | "mini";
  active?: boolean;
  onHover?: (pitch: ArenaPitch) => void;
  onLeave?: () => void;
};

const LOOP_SECONDS = 4;

export default function PitchArenaCard({
  pitch,
  variant,
  active,
  onHover,
  onLeave,
}: PitchArenaCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = true;
  }, [pitch.video]);

  const handleTimeUpdate = () => {
    if (variant !== "mini") return;
    const video = videoRef.current;
    if (!video) return;
    if (video.currentTime >= LOOP_SECONDS) {
      video.currentTime = 0;
    }
  };

  const handleEnter = () => {
    if (onHover) onHover(pitch);
    const video = videoRef.current;
    if (video) {
      video.muted = false;
      video.volume = 0.5;
      video.play().catch(() => undefined);
    }
  };

  const handleLeave = () => {
    if (onLeave) onLeave();
    const video = videoRef.current;
    if (video) {
      video.muted = true;
    }
  };

  const className = [
    "arena-card",
    variant === "main" ? "arena-main-card" : "arena-mini-card",
    active ? "is-active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={variant === "mini" ? handleEnter : undefined}
    >
      {pitch.video ? (
        <video
          ref={videoRef}
          className="arena-video"
          src={pitch.video}
          poster={pitch.poster}
          muted
          playsInline
          autoPlay
          loop={variant !== "mini"}
          preload="metadata"
          onTimeUpdate={handleTimeUpdate}
        />
      ) : (
        <div className="arena-poster" style={{ backgroundImage: `url(${pitch.poster})` }} />
      )}
      <div className="arena-overlay">
        <span className="arena-badge">60s pitch</span>
        <div className="arena-text">
          <h4>{pitch.name}</h4>
          <p>{pitch.tagline}</p>
        </div>
        {variant === "mini" ? (
          <div className="arena-mini-meta">Preview</div>
        ) : (
          <div className="arena-meta">Pitch Preview</div>
        )}
      </div>
    </div>
  );
}
