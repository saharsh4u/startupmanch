"use client";
/* eslint-disable @next/next/no-img-element */

import type { HomepagePitch } from "@/lib/homepage/pitches";

type StreamHomeLoopSectionProps = {
  railPitches: HomepagePitch[];
  isPaused: boolean;
  onPause: (pauseMs?: number) => void;
};

function StreamingRailCard({ pitch }: { pitch: HomepagePitch }) {
  const directVideoUrl = pitch.videoMp4Url ?? pitch.video ?? null;
  const hlsUrl = pitch.videoHlsUrl ?? null;
  const hasDirectVideo = Boolean(directVideoUrl || hlsUrl);

  return (
    <article className="stream-home-rail-card" aria-hidden="true">
      <div className="stream-home-rail-media">
        {pitch.poster ? (
          <img
            className="stream-home-rail-poster"
            src={pitch.poster}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="stream-home-rail-poster stream-home-rail-poster-fallback" />
        )}
        {hasDirectVideo ? (
          <video
            className="stream-home-rail-video"
            muted
            playsInline
            autoPlay
            loop
            preload="metadata"
          >
            {hlsUrl ? <source src={hlsUrl} type="application/vnd.apple.mpegurl" /> : null}
            {directVideoUrl ? <source src={directVideoUrl} type="video/mp4" /> : null}
          </video>
        ) : null}
        <div className="stream-home-rail-overlay" />
      </div>
      <div className="stream-home-rail-copy">
        <span className="stream-home-rail-kicker">{pitch.category ?? "Founder Video"}</span>
        <h3>{pitch.name}</h3>
        <p>{pitch.tagline}</p>
      </div>
    </article>
  );
}

export default function StreamHomeLoopSection({
  railPitches,
  isPaused,
  onPause,
}: StreamHomeLoopSectionProps) {
  if (!railPitches.length) return null;

  return (
    <section
      id="home-video-loop"
      className="stream-home-section stream-home-loop"
      aria-label="Looping founder videos"
    >
      <div className="stream-home-section-head stream-home-loop-head">
        <div>
          <p className="stream-home-kicker">Continuous loop</p>
          <h2>Videos rolling right to left</h2>
          <p>One featured story at the top, then the rest flowing underneath in a seamless strip.</p>
        </div>
      </div>

      <div
        className={`stream-home-marquee${isPaused ? " is-paused" : ""}`}
        onPointerDown={() => onPause(2200)}
        onTouchStart={() => onPause(2200)}
        onFocusCapture={() => onPause(2200)}
        onMouseEnter={() => onPause(2000)}
      >
        <div className="stream-home-marquee-track">
          <div className="stream-home-marquee-segment">
            {railPitches.map((pitch) => (
              <StreamingRailCard key={`primary-${pitch.id}`} pitch={pitch} />
            ))}
          </div>
          <div className="stream-home-marquee-segment" aria-hidden="true">
            {railPitches.map((pitch) => (
              <StreamingRailCard key={`clone-${pitch.id}`} pitch={pitch} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
