"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { usePathname } from "next/navigation";
import { isMobileViewport, prefersReducedMotion, scrollToAnchorId } from "@/lib/anchor-scroll";
import { POST_PITCH_FALLBACK_HREF, openPostPitchFlow } from "@/lib/post-pitch";

type TopNavProps = {
  context?: "home" | "inner";
  showPostPitch?: boolean;
  onPostPitch?: () => void;
};

const MARKETPLACE_HREF = "/roundtable";
const ABOUT_HREF = "/about";

export default function TopNav({
  context = "home",
  showPostPitch = true,
  onPostPitch,
}: TopNavProps) {
  const pathname = usePathname();

  const shouldUseBrowserDefault = (event: MouseEvent<HTMLAnchorElement>) =>
    event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

  const handleLeaderboardClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (shouldUseBrowserDefault(event)) return;
    event.preventDefault();
    if (context === "home") {
      const behavior = prefersReducedMotion() ? "auto" : "smooth";
      const didScroll = scrollToAnchorId("leaderboard-block", { behavior, updateHash: true });
      if (didScroll) return;
    }
    window.location.assign(`${MARKETPLACE_HREF}#leaderboard-block`);
  };

  const handleAllVideosClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (shouldUseBrowserDefault(event)) return;
    event.preventDefault();
    if (pathname === MARKETPLACE_HREF) return;
    window.location.assign(MARKETPLACE_HREF);
  };

  const handleAboutClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (shouldUseBrowserDefault(event)) return;
    event.preventDefault();
    if (pathname === ABOUT_HREF) return;
    window.location.assign(ABOUT_HREF);
  };

  return (
    <nav className="site-nav" aria-label="Primary">
      <div className="site-nav-row">
        <Link href="/" className="site-nav-logo">
          <span className="brand-star">✦</span>
          <span className="brand-wordmark">StartupManch</span>
        </Link>
        <div className="site-nav-links">
          <Link href={MARKETPLACE_HREF} onClick={handleAllVideosClick}>
            All videos
          </Link>
          <Link
            href={context === "home" ? "#leaderboard-block" : `${MARKETPLACE_HREF}#leaderboard-block`}
            onClick={handleLeaderboardClick}
          >
            Leaderboard
          </Link>
          <Link href={ABOUT_HREF} onClick={handleAboutClick}>
            About
          </Link>
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
