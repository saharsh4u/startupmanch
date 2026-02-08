"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ContactModal from "./ContactModal";
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
  const contactRef = useRef<HTMLDialogElement | null>(null);
  const wheelBuffer = useRef(0);
  const wheelCooldown = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wheelLock = useRef(false);
  const [isMobile, setIsMobile] = useState(false);
  const pitch = pitches[index];

  const pauseCurrentVideo = () => {
    const video = videoRef.current;
    if (video) {
      video.pause();
    }
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

  const handleWheel = (e: React.WheelEvent) => {
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
          <div className="expand-meta-content">
            <div className="expand-meta-top">
              <p className="pitch-show-badge">60s pitch</p>
              <span className="expand-counter" aria-live="polite">
                {index + 1} / {pitches.length}
              </span>
            </div>
            <div>
              <h4>{pitch.name}</h4>
              <p>{pitch.tagline}</p>
            </div>
            <div className="expand-actions">
              <Link
                href={`/founder/${pitch.id}`}
                className="expand-view-profile"
                aria-label={`View profile for ${pitch.name}`}
              >
                View profile
              </Link>
              <button
                type="button"
                className="expand-contact"
                onClick={() => contactRef.current?.showModal()}
                aria-label={`Contact ${pitch.name} founder`}
              >
                Contact founder
              </button>
            </div>
          </div>
        </div>
        <ContactModal ref={contactRef} pitch={pitch} />
      </div>
    </div>
  );
}
