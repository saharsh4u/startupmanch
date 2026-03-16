"use client";

import Link from "next/link";
import type { ChangeEvent, MouseEvent } from "react";
import { POST_PITCH_FALLBACK_HREF, openPostPitchFlow } from "@/lib/post-pitch";

type HomeTrustIntroProps = {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onPostPitch?: () => void;
};

const handleAnchorActivation = (
  event: MouseEvent<HTMLAnchorElement>,
  onPostPitch: (() => void) | undefined
) => {
  event.preventDefault();
  if (onPostPitch) {
    onPostPitch();
    return;
  }
  openPostPitchFlow();
};

export default function HomeTrustIntro({
  searchTerm,
  onSearchTermChange,
  onPostPitch,
}: HomeTrustIntroProps) {
  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSearchTermChange(event.target.value);
  };

  return (
    <section className="home-intro-card" aria-label="StartupManch feed intro">
      <div className="home-intro-copy">
        <div className="home-intro-brand">
          <span className="home-intro-brand-mark" aria-hidden="true">
            ✦
          </span>
          <span>StartupManch</span>
        </div>
        <h1>The feed of startups building in public</h1>
        <p>Search founder videos, traction clips, and fresh launches from builders shipping in real time.</p>
      </div>

      <div className="home-intro-actions">
        <label className="home-intro-search" aria-label="Search founder videos">
          <span aria-hidden="true">⌕</span>
          <input
            type="text"
            value={searchTerm}
            onChange={handleSearchChange}
            placeholder='"AI startup", "fintech", "consumer"'
          />
        </label>
        <a
          href={POST_PITCH_FALLBACK_HREF}
          className="home-intro-cta"
          onClick={(event) => handleAnchorActivation(event, onPostPitch)}
        >
          Post startup
        </a>
      </div>

      <div className="home-intro-links" aria-label="Homepage quick links">
        <a href="#top-rated-block">Feed</a>
        <a href="#leaderboard-block">Leaderboard</a>
        <Link href="/about">About</Link>
        <Link href="/roundtable">Roundtable</Link>
      </div>
    </section>
  );
}
