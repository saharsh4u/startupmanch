import type { RoundtableSessionSnapshot } from "@/lib/roundtable/types";
import { formatRelativeTime, formatTurnStatus } from "@/lib/roundtable/present";

type RoundtableRecentTurnsProps = {
  recentTurns: RoundtableSessionSnapshot["recent_turns"];
};

const fallbackBody = (status: string, autoSubmitted: boolean) => {
  if (status === "submitted" && autoSubmitted) {
    return "Turn was auto-submitted when the timer expired.";
  }
  if (status === "expired") return "Turn expired before a response was submitted.";
  if (status === "skipped") return "Turn was skipped and the queue moved on.";
  return "No summary was saved for this turn.";
};

export default function RoundtableRecentTurns({ recentTurns }: RoundtableRecentTurnsProps) {
  const visibleTurns = recentTurns.slice(0, 5);

  return (
    <section className="roundtable-panel roundtable-panel-span-2" aria-label="Recent roundtable activity">
      <h4>Recent activity</h4>
      {!visibleTurns.length ? <p className="roundtable-muted">Turns will appear here once speakers submit.</p> : null}
      <div className="roundtable-turn-list">
        {visibleTurns.map((turn) => (
          <article key={turn.id} className="roundtable-turn-item">
            <div className="roundtable-turn-head">
              <strong>{turn.member_display_name}</strong>
              <span>
                {formatTurnStatus(turn.status, turn.auto_submitted)} · {formatRelativeTime(turn.submitted_at ?? turn.updated_at ?? turn.created_at)}
              </span>
            </div>
            <p>{(turn.body ?? "").trim() || fallbackBody(turn.status, turn.auto_submitted)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
