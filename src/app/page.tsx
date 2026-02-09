import AdColumn from "@/components/AdColumn";
import CardsSection from "@/components/CardsSection";
import HomeHero from "@/components/HomeHero";
import { leftAdSlots, rightAdSlots } from "@/data/ads";
import { bestDeals, recentlyListed } from "@/data/marketplace";

export default function Home() {
  const adSlots = [...leftAdSlots, ...rightAdSlots];
  const recentCards = recentlyListed.slice(0, 10);
  const weeklyDeals = bestDeals.slice(0, 10);

  return (
    <>
      <div className="ad-slot ad-top">
        <AdColumn slots={adSlots} orientation="horizontal" />
      </div>

      <main className="page app-shell home-page-shell">
        <div className="content-container home-main-content">
          <HomeHero />
          <CardsSection title="Recently listed for sale" items={recentCards} />
          <CardsSection title="Best deals this week" items={weeklyDeals} />
        </div>
      </main>

      <div className="ad-slot ad-bottom" aria-hidden>
        <AdColumn slots={adSlots} orientation="horizontal" />
      </div>
    </>
  );
}
