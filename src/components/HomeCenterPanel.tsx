"use client";

import { useCallback, useEffect, useState } from "react";
import HomeHero from "@/components/HomeHero";
import PostPitchModal from "@/components/PostPitchModal";
import PitchFeed from "@/components/PitchFeed";
import RankingsTable from "@/components/RankingsTable";
import SiteFooter from "@/components/SiteFooter";
import TopNav from "@/components/TopNav";
import { isMobileViewport, prefersReducedMotion, scrollToAnchorId } from "@/lib/anchor-scroll";

export default function HomeCenterPanel() {
  const [postPitchOpen, setPostPitchOpen] = useState(false);
  const [postPitchToast, setPostPitchToast] = useState<string | null>(null);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextParams = new URLSearchParams(window.location.search);
    if (nextParams.get("post_pitch") !== "1") return;

    setPostPitchOpen(true);
    nextParams.delete("post_pitch");
    const query = nextParams.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, []);

  useEffect(() => {
    if (!postPitchToast) return;
    const timer = window.setTimeout(() => setPostPitchToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [postPitchToast]);

  return (
    <>
      <TopNav context="home" showPostPitch onPostPitch={() => setPostPitchOpen(true)} />
      <HomeHero onPostPitch={() => setPostPitchOpen(true)} />
      <div id="top-rated-block" className="anchor-block">
        <PitchFeed />
      </div>
      <div id="leaderboard-block" className="anchor-block">
        <RankingsTable />
      </div>
      <PostPitchModal
        open={postPitchOpen}
        onClose={() => setPostPitchOpen(false)}
        onSuccess={(message) => setPostPitchToast(message)}
      />
      {postPitchToast ? (
        <div className="post-pitch-toast" role="status" aria-live="polite">
          {postPitchToast}
        </div>
      ) : null}
      <SiteFooter />
    </>
  );
}
