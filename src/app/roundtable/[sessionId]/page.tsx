import type { Metadata } from "next";
import AdRailsScaffold from "@/components/AdRailsScaffold";
import RoundtableRoom from "@/components/roundtable/RoundtableRoom";
import SiteFooter from "@/components/SiteFooter";
import TopNav from "@/components/TopNav";

type RoundtableSessionPageProps = {
  params: {
    sessionId: string;
  };
};

export const metadata: Metadata = {
  title: "Roundtable Room | StartupManch",
  description: "Join a live startup roundtable room and participate in timed text turns.",
};

export default function RoundtableSessionPage({ params }: RoundtableSessionPageProps) {
  return (
    <AdRailsScaffold mainClassName="page roundtable-page inner-rails-page">
      <div className="roundtable-page-shell">
        <TopNav context="inner" showPostPitch />
        <div className="anchor-block">
          <RoundtableRoom sessionId={params.sessionId} />
        </div>
        <SiteFooter showCredit={false} showThemeToggle={false} />
      </div>
    </AdRailsScaffold>
  );
}
