import type { Metadata } from "next";
import AdRailsScaffold from "@/components/AdRailsScaffold";
import TopNav from "@/components/TopNav";
import RoundtableLobby from "@/components/roundtable/RoundtableLobby";

export const roundtableLandingMetadata: Metadata = {
  title: "Roundtable | StartupManch",
  description: "Browse and join public StartupManch roundtable rooms.",
  openGraph: {
    title: "Roundtable | StartupManch",
    description: "Browse and join public StartupManch roundtable rooms.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Roundtable | StartupManch",
    description: "Browse and join public StartupManch roundtable rooms.",
  },
};

export default function RoundtableLandingPage() {
  return (
    <AdRailsScaffold mainClassName="page roundtable-page inner-rails-page">
      <div className="roundtable-page-shell">
        <TopNav context="inner" showPostPitch />
        <div className="anchor-block">
          <RoundtableLobby />
        </div>
      </div>
    </AdRailsScaffold>
  );
}
