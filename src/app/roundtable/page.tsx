import type { Metadata } from "next";
import AdRailsScaffold from "@/components/AdRailsScaffold";
import RoundtableLobby from "@/components/roundtable/RoundtableLobby";
import TopNav from "@/components/TopNav";

export const metadata: Metadata = {
  title: "Roundtable | StartupManch",
  description: "Structured startup roundtable discussions with timed speaking and live scoring.",
};

export default function RoundtablePage() {
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
