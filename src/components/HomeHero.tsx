"use client";

import { useEffect, useState } from "react";
import { POST_PITCH_FALLBACK_HREF, openPostPitchFlow } from "@/lib/post-pitch";

type HomeHeroProps = {
  onPostPitch?: () => void;
};

export default function HomeHero({ onPostPitch }: HomeHeroProps) {
  const [isSwapped, setIsSwapped] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
    const applyPreference = () => {
      const isIOS =
        /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
        (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
      setReduceMotion(reducedMotionQuery.matches);
      setIsTouchDevice(coarsePointerQuery.matches || window.navigator.maxTouchPoints > 0 || isIOS);
    };
    applyPreference();
    reducedMotionQuery.addEventListener("change", applyPreference);
    coarsePointerQuery.addEventListener("change", applyPreference);
    return () => {
      reducedMotionQuery.removeEventListener("change", applyPreference);
      coarsePointerQuery.removeEventListener("change", applyPreference);
    };
  }, []);

  const shouldRotateCopy = !reduceMotion && !isTouchDevice;

  useEffect(() => {
    if (!shouldRotateCopy) {
      setIsSwapped(false);
      return;
    }
    const interval = window.setInterval(() => {
      setIsSwapped((current) => !current);
    }, 4000);
    return () => window.clearInterval(interval);
  }, [shouldRotateCopy]);

  return (
    <section className="hero hero-story">
      <p className="hero-story-flag hero-story-flag-static" aria-hidden="true">
        🇮🇳
      </p>
      {shouldRotateCopy ? (
        <div className="hero-story-fade-stage">
          <h1 className={`hero-story-title hero-story-fade-item ${isSwapped ? "is-hidden" : "is-visible"}`}>
            <span className="hero-story-quote-line">
              <span className="hero-story-quote-mark hero-story-quote-left" aria-hidden="true">
                “
              </span>
              Watch <span className="hero-story-brush">Startups</span> Being Built in{" "}
              <span className="hero-story-brush">Public</span>
              <span className="hero-story-quote-mark hero-story-quote-right" aria-hidden="true">
                ”
              </span>
            </span>
          </h1>
          <p className={`hero-story-fade-item hero-story-fade-quote ${isSwapped ? "is-visible" : "is-hidden"}`}>
            There will never be a &apos;<span className="hero-story-brush">right</span>&apos; time &amp;
            you&apos;ll never feel <span className="hero-story-brush">ready</span>.
          </p>
        </div>
      ) : (
        <h1 className="hero-story-title hero-story-title-static">
          <span className="hero-story-quote-line">
            <span className="hero-story-quote-mark hero-story-quote-left" aria-hidden="true">
              “
            </span>
            Watch <span className="hero-story-brush">Startups</span> Being Built in{" "}
            <span className="hero-story-brush">Public</span>
            <span className="hero-story-quote-mark hero-story-quote-right" aria-hidden="true">
              ”
            </span>
          </span>
        </h1>
      )}
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
