"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PitchShow } from "./PitchShowCard";

type Props = {
  pitches: PitchShow[];
  index: number;
  setIndex: (idx: number) => void;
  onClose: () => void;
};

export default function ExpandedPitchOverlay({ pitches, index, setIndex, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const pitch = pitches[index];

  const clampIndex = useCallback(
    (next: number) => Math.max(0, Math.min(next, pitches.length - 1)),
    [pitches.length]
  );

  const goNext = useCallback(() => setIndex(clampIndex(index + 1)), [clampIndex, index, setIndex]);
  const goPrev = useCallback(() => setIndex(clampIndex(index - 1)), [clampIndex, index, setIndex]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        goNext();
      }
      if (e.key === "ArrowUp" || e.key === "PageUp") {
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
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
      video.play().catch(() => undefined);
    }
  }, [pitch]);

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    if (Math.abs(e.deltaY) < 24) return;
    if (e.deltaY > 0) goNext();
    else goPrev();
  };

  return (
    <div className="expand-backdrop" onClick={onClose}>
      <div
        className="expand-shell"
        role="dialog"
        aria-label={`Expanded pitch ${pitch.name}`}
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
            >
              ↑
            </button>
            <button
              className="expand-nav next"
              onClick={goNext}
              aria-label="Next pitch"
              disabled={index === pitches.length - 1}
            >
              ↓
            </button>
          </>
        )}
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
