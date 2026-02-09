"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CategoriesSection, { fallbackCategories } from "@/components/CategoriesSection";
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

type FeedCategoryItem = {
  category: string | null;
};

const normalizeCategory = (value: string) => value.trim();

export default function HomeCenterPanel({ featured }: HomeCenterPanelProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [liveCategories, setLiveCategories] = useState<string[]>(fallbackCategories);
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
    const controller = new AbortController();

    const loadCategories = async () => {
      try {
        const response = await fetch("/api/pitches?mode=feed&tab=trending&limit=50", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Unable to fetch categories");
        const payload = await response.json();
        const data = (payload?.data ?? []) as FeedCategoryItem[];
        const categories = Array.from(
          new Set(
            data
              .map((item) => item.category ?? "")
              .map(normalizeCategory)
              .filter((category) => category.length > 0)
          )
        ).sort((a, b) => a.localeCompare(b));

        setLiveCategories(categories.length > 0 ? categories : fallbackCategories);
      } catch {
        if (controller.signal.aborted) return;
        setLiveCategories(fallbackCategories);
      }
    };

    loadCategories();

    return () => controller.abort();
  }, []);

  const hasSelectedCategory = useMemo(() => {
    if (!selectedCategory) return true;
    const match = selectedCategory.toLowerCase();
    return liveCategories.some((category) => category.toLowerCase() === match);
  }, [liveCategories, selectedCategory]);

  useEffect(() => {
    if (!hasSelectedCategory) {
      setSelectedCategory(null);
    }
  }, [hasSelectedCategory]);

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
        <PitchFeed selectedCategory={selectedCategory} />
      </div>
      <div id="categories-block" className="anchor-block">
        <CategoriesSection
          categories={liveCategories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
        />
      </div>
      <FeaturedListings items={featured} />
      <div id="leaderboard-block" className="anchor-block">
        <RankingsTable />
      </div>
      <SiteFooter />
    </div>
  );
}
