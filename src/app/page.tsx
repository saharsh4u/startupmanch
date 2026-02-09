import AdColumn from "@/components/AdColumn";
import CategoriesSection from "@/components/CategoriesSection";
import FeaturedListings from "@/components/FeaturedListings";
import HomeHero from "@/components/HomeHero";
import PitchFeed from "@/components/PitchFeed";
import RankingsTable from "@/components/RankingsTable";
import SiteFooter from "@/components/SiteFooter";
import TopNav from "@/components/TopNav";
import { leftAdSlots, rightAdSlots } from "@/data/ads";
import { getSeedCompanies } from "@/lib/seed-companies";

export default function Home() {
  const companies = getSeedCompanies();
  const stages = ["Pre-Seed", "Seed", "Series A", "Growth"];
  const featured = companies.slice(0, 10).map((company, index) => ({
    name: company.name,
    category: company.sector ?? "General",
    stage: stages[index % stages.length],
    tag: "Featured",
  }));

  return (
    <main className="page page-home">
      <div className="layout-grid">
        <AdColumn slots={leftAdSlots} side="left" />
        <div className="center-panel">
          <TopNav context="home" />
          <HomeHero />
          <div id="top-rated-block" className="anchor-block">
            <PitchFeed />
          </div>
          <div id="categories-block" className="anchor-block">
            <CategoriesSection />
          </div>
          <div id="leaderboard-block" className="anchor-block">
            <RankingsTable />
          </div>
          <FeaturedListings items={featured} />
          <SiteFooter />
        </div>
        <AdColumn slots={rightAdSlots} side="right" />
      </div>
    </main>
  );
}
