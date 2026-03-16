import type { Metadata } from "next";
import AdRailsScaffold from "@/components/AdRailsScaffold";
import HomeCenterPanel from "@/components/HomeCenterPanel";

export const marketplaceHomepageMetadata: Metadata = {
  title: "StartupManch – India’s Startup Marketplace for Founders & Investors",
  description: "India-first startup marketplace for founders and investors.",
  alternates: {
    canonical: "/roundtable",
  },
  openGraph: {
    title: "StartupManch – India’s Startup Marketplace for Founders & Investors",
    description: "India-first startup marketplace for founders and investors.",
    url: "/roundtable",
    siteName: "StartupManch",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "StartupManch – India’s Startup Marketplace for Founders & Investors",
    description: "India-first startup marketplace for founders and investors.",
  },
};

export default function MarketplaceHomepagePage() {
  return (
    <AdRailsScaffold mainClassName="page page-home">
      <HomeCenterPanel />
    </AdRailsScaffold>
  );
}
