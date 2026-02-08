"use client";

import { useEffect, useRef } from "react";
import type { PitchShow } from "./PitchShowCard";

type Props = {
  pitch: PitchShow;
  onClose: () => void;
};

export default function ExpandedPitchOverlay({ pitch, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const prev = document.activeElement as HTMLElement | null;
    dialog.focus();
    return () => {
      prev?.focus();
      if (videoRef.current) videoRef.current.pause();
    };
  }, []);

  return (
    <div className="expand-backdrop" onClick={onClose}>
      <div
        className="expand-shell"
        role="dialog"
        aria-label={`Expanded pitch ${pitch.name}`}
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="expand-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {pitch.video ? (
          <video
            ref={videoRef}
            className="expand-media"
            src={pitch.video}
            poster={pitch.poster}
            controls
            autoPlay
            playsInline
          />
        ) : (
          <div className="expand-media" style={{ backgroundImage: `url(${pitch.poster})` }} />
        )}
        <div className="expand-meta">
          <div>
            <p className="pitch-show-badge">60s pitch</p>
            <h4>{pitch.name}</h4>
            <p>{pitch.tagline}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
