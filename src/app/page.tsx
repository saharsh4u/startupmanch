import AdColumn from "@/components/AdColumn";
import HomeCenterPanel from "@/components/HomeCenterPanel";
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
        <HomeCenterPanel featured={featured} />
        <AdColumn slots={rightAdSlots} side="right" />
      </div>
    </main>
  );
}
