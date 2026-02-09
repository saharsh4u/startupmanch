"use client";

import { useCallback, useEffect } from "react";
import FeaturedListings from "@/components/FeaturedListings";
import HomeHero from "@/components/HomeHero";
import PitchFeed from "@/components/PitchFeed";
import RankingsTable from "@/components/RankingsTable";
import SiteFooter from "@/components/SiteFooter";
import TopNav from "@/components/TopNav";
import { isMobileViewport, prefersReducedMotion, scrollToAnchorId } from "@/lib/anchor-scroll";

type FeaturedItem = {
  name: string;
  category: string;
  stage: string;
  tag?: string;
};

type HomeCenterPanelProps = {
  featured: FeaturedItem[];
};

export default function HomeCenterPanel({ featured }: HomeCenterPanelProps) {
  const scrollToCurrentHash = useCallback(() => {
    if (!isMobileViewport()) return;
    const hash = window.location.hash;
    if (!hash) return;

    scrollToAnchorId(hash, {
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      updateHash: false,
    });
  }, []);

  useEffect(() => {
    const runInitialHashScroll = () => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          scrollToCurrentHash();
        });
      });
    };

    runInitialHashScroll();
    window.addEventListener("hashchange", scrollToCurrentHash);
    return () => window.removeEventListener("hashchange", scrollToCurrentHash);
  }, [scrollToCurrentHash]);

  return (
    <div className="center-panel">
      <TopNav context="home" showPostPitch={false} />
      <HomeHero />
      <div id="top-rated-block" className="anchor-block">
        <PitchFeed />
      </div>
      <FeaturedListings items={featured} />
      <div id="leaderboard-block" className="anchor-block">
        <RankingsTable />
      </div>
      <SiteFooter />
    </div>
  );
}
