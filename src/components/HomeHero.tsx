"use client";

import { useEffect, useState } from "react";
import { POST_PITCH_FALLBACK_HREF, openPostPitchFlow } from "@/lib/post-pitch";

type HomeHeroProps = {
  onPostPitch?: () => void;
};

export default function HomeHero({ onPostPitch }: HomeHeroProps) {
  const [isSwapped, setIsSwapped] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyPreference = () => setReduceMotion(mediaQuery.matches);
    applyPreference();
    mediaQuery.addEventListener("change", applyPreference);
    return () => mediaQuery.removeEventListener("change", applyPreference);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const interval = window.setInterval(() => {
      setIsSwapped((current) => !current);
    }, 4000);
    return () => window.clearInterval(interval);
  }, [reduceMotion]);

  return (
    <section className="hero hero-story">
      <div className="hero-story-fade-stage" aria-live="polite">
        <h1 className={`hero-story-title hero-story-fade-item ${isSwapped ? "is-hidden" : "is-visible"}`}>
          <span className="hero-story-quote-mark hero-story-quote-left" aria-hidden="true">
            “
          </span>
          Watch <span className="hero-story-brush">Startups</span> Being Built in{" "}
          <span className="hero-story-brush">Public</span> 🇮🇳
          <span className="hero-story-quote-mark hero-story-quote-right" aria-hidden="true">
            ”
          </span>
        </h1>
        <p className={`hero-story-fade-item hero-story-fade-quote ${isSwapped ? "is-visible" : "is-hidden"}`}>
          There will never be a &apos;right&apos; time &amp; you&apos;ll never feel ready.
        </p>
      </div>
      <a
        href={POST_PITCH_FALLBACK_HREF}
        className="hero-btn hero-story-btn"
        onClick={(event) => {
          event.preventDefault();
          if (onPostPitch) {
            onPostPitch();
            return;
          }
          openPostPitchFlow();
        }}
      >
        ▶ Start Your Journey
      </a>
      <p className="hero-story-meta">Free · Open to all builders · No gatekeeping</p>
    </section>
  );
}
