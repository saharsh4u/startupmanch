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

const homeAnchors = [{ id: "leaderboard-block", label: "Leaderboard" }] as const;

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
    window.location.assign("/#leaderboard-block");
  };

  const handleAboutClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (shouldUseBrowserDefault(event)) return;
    event.preventDefault();
    if (pathname === "/about") return;
    window.location.assign("/about");
  };

  const handleRoundtableClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (shouldUseBrowserDefault(event)) return;
    event.preventDefault();
    if (pathname === "/roundtable") return;
    window.location.assign("/roundtable");
  };

  return (
    <nav className="site-nav" aria-label="Primary">
      <div className="site-nav-row">
        <Link href="/" className="site-nav-logo">
          <span className="brand-star">✦</span>
          <span className="brand-wordmark">StartupManch</span>
        </Link>
        <div className="site-nav-links">
          {homeAnchors.map((item) => (
            <Link
              key={item.id}
              href={context === "home" ? "#leaderboard-block" : "/#leaderboard-block"}
              onClick={handleLeaderboardClick}
            >
              {item.label}
            </Link>
          ))}
          <Link href="/about" onClick={handleAboutClick}>
            About
          </Link>
          <Link href="/roundtable" onClick={handleRoundtableClick}>
            Roundtable
          </Link>
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
