import type { Metadata } from "next";
import HomeStreamingPage from "@/components/home/HomeStreamingPage";

export const marketplaceHomepageMetadata: Metadata = {
  title: "StartupManch TV | Founder Videos & Live Roundtables",
  description: "Looping founder videos, featured stories, and a live roundtable preview in one streaming homepage.",
  alternates: {
    canonical: "/roundtable",
  },
  openGraph: {
    title: "StartupManch TV | Founder Videos & Live Roundtables",
    description: "Looping founder videos, featured stories, and a live roundtable preview in one streaming homepage.",
    url: "/roundtable",
    siteName: "StartupManch",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "StartupManch TV | Founder Videos & Live Roundtables",
    description: "Looping founder videos, featured stories, and a live roundtable preview in one streaming homepage.",
  },
};

export default function MarketplaceHomepagePage() {
  return <HomeStreamingPage />;
}
