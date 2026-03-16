import AdRailsScaffold from "@/components/AdRailsScaffold";
import TopNav from "@/components/TopNav";
import RoundtableRoom from "@/components/roundtable/RoundtableRoom";

type RoundtableRoomPageShellProps = {
  sessionId: string;
};

export default function RoundtableRoomPageShell({ sessionId }: RoundtableRoomPageShellProps) {
  return (
    <AdRailsScaffold mainClassName="page roundtable-page inner-rails-page">
      <div className="roundtable-page-shell">
        <TopNav context="inner" showPostPitch />
        <div className="anchor-block">
          <RoundtableRoom sessionId={sessionId} />
        </div>
      </div>
    </AdRailsScaffold>
  );
}
