"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { isMobileViewport, prefersReducedMotion, scrollToAnchorId } from "@/lib/anchor-scroll";
import { POST_PITCH_FALLBACK_HREF, openPostPitchFlow } from "@/lib/post-pitch";

type TopNavProps = {
  context?: "home" | "inner";
  showPostPitch?: boolean;
  onPostPitch?: () => void;
};

type NavItem = {
  label: string;
  anchorId?: string;
  href?: string;
};

const navItems: NavItem[] = [
  { anchorId: "leaderboard-block", label: "Leaderboard" },
  { href: "/about", label: "About" },
];

export default function TopNav({
  context = "home",
  showPostPitch = true,
  onPostPitch,
}: TopNavProps) {
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
          {navItems.map((item) => {
            const href = item.anchorId ? `${prefix}#${item.anchorId}` : item.href ?? "/";
            const anchorId = item.anchorId;
            return (
              <Link
                key={item.label}
                href={href}
                onClick={
                  context === "home" && anchorId
                    ? (event) => handleHomeAnchorClick(event, anchorId)
                    : undefined
                }
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        <div className="site-nav-search">
          <span>⌕</span>
          <input type="text" placeholder="Search startups..." aria-label="Search startups" />
        </div>
        {showPostPitch ? (
          <Link
            href={POST_PITCH_FALLBACK_HREF}
            className="site-nav-cta"
            onClick={(event) => {
              event.preventDefault();
              if (onPostPitch) {
                onPostPitch();
                return;
              }
              openPostPitchFlow();
            }}
          >
            Post It Free.
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
