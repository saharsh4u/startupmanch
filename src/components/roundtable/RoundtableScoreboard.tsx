import type { RoundtableSessionSnapshot } from "@/lib/roundtable/types";

type RoundtableScoreboardProps = {
  scores: RoundtableSessionSnapshot["scores"];
};

export default function RoundtableScoreboard({ scores }: RoundtableScoreboardProps) {
  return (
    <section className="roundtable-panel" aria-label="Session scoreboard">
      <h4>Live score</h4>
      {!scores.length ? <p className="roundtable-muted">Scores appear once turns are submitted.</p> : null}
      <div className="roundtable-score-list">
        {scores.map((entry) => (
          <div key={entry.member_id} className="roundtable-score-item">
            <div>
              <strong>{entry.member_display_name}</strong>
              <p>
                Turns {entry.approved_turns} · Upvotes {entry.upvotes_received}
              </p>
            </div>
            <span>{entry.points}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
