import AdColumn from "@/components/AdColumn";
import FeaturedListings from "@/components/FeaturedListings";
import HomeHero from "@/components/HomeHero";
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
    <main className="page">
      <div className="layout-grid">
        <AdColumn slots={leftAdSlots} />
        <div className="center-panel">
          <HomeHero />
          <FeaturedListings items={featured} />
        </div>
        <AdColumn slots={rightAdSlots} />
      </div>
    </main>
  );
}
