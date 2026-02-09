"use client";

import { useEffect, useRef } from "react";
import ContactModal from "./ContactModal";
import type { Dispatch, SetStateAction } from "react";

export type PitchShow = {
  id: string;
  name: string;
  tagline: string;
  poster: string;
  video?: string | null;
};

type PitchShowCardProps = {
  pitch: PitchShow;
  size: "feature" | "row" | "wide" | "mini";
  variant?: "hot" | "regular";
  onExpand?: (pitch: PitchShow) => void;
};

export default function PitchShowCard({ pitch, size, variant = "regular", onExpand }: PitchShowCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = true;
  }, [pitch.video]);

  const label = `Pitch: ${pitch.name}, 60s`;

  return (
    <article
      className={`pitch-show-card ${size} ${variant === "hot" ? "is-hot" : "is-regular"}`}
      tabIndex={0}
      aria-label={label}
      onClick={() => {
        if (onExpand) return onExpand(pitch);
        dialogRef.current?.showModal();
      }}
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
        <div className="pitch-show-media" style={{ backgroundImage: `url(${pitch.poster})` }} />
      )}
      <div className="pitch-show-overlay">
        <div className="pitch-show-topline">
          <span className="pitch-show-badge">60s pitch</span>
        </div>
        <div className="pitch-show-text">
          <h4>{pitch.name}</h4>
          <p>{pitch.tagline}</p>
        </div>
        {variant === "hot" ? <div className="pitch-show-playghost">▶</div> : <div className="pitch-show-footer">Pitch Preview</div>}
      </div>
      <ContactModal ref={dialogRef} pitch={pitch} />
    </article>
  );
}
