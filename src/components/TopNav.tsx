"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { isMobileViewport, prefersReducedMotion, scrollToAnchorId } from "@/lib/anchor-scroll";

type TopNavProps = {
  context?: "home" | "inner";
  showPostPitch?: boolean;
};

const navAnchors = [
  { id: "top-rated-block", label: "Top rated" },
  { id: "leaderboard-block", label: "Leaderboard" },
] as const;

export default function TopNav({ context = "home", showPostPitch = true }: TopNavProps) {
  const prefix = context === "home" ? "" : "/";
  const handleHomeAnchorClick = (event: MouseEvent<HTMLAnchorElement>, anchorId: string) => {
    if (context !== "home") return;
    if (!isMobileViewport()) return;

    const behavior = prefersReducedMotion() ? "auto" : "smooth";
    const didScroll = scrollToAnchorId(anchorId, { behavior, updateHash: true });
    if (didScroll) {
      event.preventDefault();
    }
  };

  return (
    <nav className="site-nav" aria-label="Primary">
      <div className="site-nav-row">
        <Link href="/" className="site-nav-logo">
          <span className="brand-star">✦</span>
          <span>StartupManch</span>
        </Link>
        <div className="site-nav-links">
          {navAnchors.map((item) => (
            <Link
              key={item.id}
              href={`${prefix}#${item.id}`}
              onClick={
                context === "home"
                  ? (event) => handleHomeAnchorClick(event, item.id)
                  : undefined
              }
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div className="site-nav-search">
          <span>⌕</span>
          <input type="text" placeholder="Search startups..." aria-label="Search startups" />
        </div>
        {showPostPitch ? (
          <Link href="/submit" className="site-nav-cta">
            Post pitch
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
