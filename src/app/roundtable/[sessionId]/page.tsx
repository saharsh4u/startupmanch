import type { Metadata } from "next";
import AdRailsScaffold from "@/components/AdRailsScaffold";
import RoundtableRoom from "@/components/roundtable/RoundtableRoom";
import TopNav from "@/components/TopNav";

type RoundtableSessionPageProps = {
  params: {
    sessionId: string;
  };
};

export const metadata: Metadata = {
  title: "Roundtable Room | StartupManch",
  description: "Join a live startup roundtable room with voice seats, timed turn previews, and live scoring.",
};

export default function RoundtableSessionPage({ params }: RoundtableSessionPageProps) {
  return (
    <AdRailsScaffold mainClassName="page roundtable-page inner-rails-page" quietRails>
      <div className="roundtable-page-shell">
        <TopNav context="inner" showPostPitch />
        <div className="anchor-block">
          <RoundtableRoom sessionId={params.sessionId} />
        </div>
      </div>
    </AdRailsScaffold>
  );
}
