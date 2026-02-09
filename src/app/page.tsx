import AdColumn from "@/components/AdColumn";
import HomeCenterPanel from "@/components/HomeCenterPanel";
import { leftAdSlots, rightAdSlots } from "@/data/ads";

export default function Home() {
  return (
    <main className="page page-home">
      <div className="layout-grid">
        <AdColumn slots={leftAdSlots} side="left" />
        <HomeCenterPanel />
        <AdColumn slots={rightAdSlots} side="right" />
      </div>
    </main>
  );
}
