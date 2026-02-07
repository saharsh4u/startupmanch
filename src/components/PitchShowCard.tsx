"use client";

import { useEffect, useRef } from "react";

export type PitchShow = {
  id: string;
  name: string;
  tagline: string;
  poster: string;
  video?: string | null;
};

type PitchShowCardProps = {
  pitch: PitchShow;
  size: "feature" | "row";
};

export default function PitchShowCard({ pitch, size }: PitchShowCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = true;
  }, [pitch.video]);

  return (
    <article className={`pitch-show-card ${size}`}>
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
        <span className="pitch-show-badge">60s pitch</span>
        <div className="pitch-show-text">
          <h4>{pitch.name}</h4>
          <p>{pitch.tagline}</p>
        </div>
      </div>
    </article>
  );
}
