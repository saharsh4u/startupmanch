export type LeaderboardRow = {
  name: string;
  sector: string;
  score?: number;
  change?: string;
};

type LeaderboardProps = {
  rows: LeaderboardRow[];
};

const momentumScore = (index: number) => {
  const base = 92 - index * 1.2;
  return Math.max(24, Math.round(base));
};

export default function LeaderboardSection({ rows }: LeaderboardProps) {
  return (
    <section className="section-card leaderboard-section">
      <div className="section-header">
        <h3>Top 50 momentum</h3>
        <div className="section-controls">
          <span>24h</span>
          <span>All time</span>
        </div>
      </div>
      <div className="table">
        <div className="table-row head">
          <span>#</span>
          <span>Startup</span>
          <span>Category</span>
          <span className="align-right table-mrr">Score</span>
          <span className="align-right">Change</span>
        </div>
        {rows.slice(0, 50).map((startup, index) => {
          const rankLabel =
            index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}`;
          const score = startup.score ?? momentumScore(index);
          const change = startup.change ?? (index % 3 === 0 ? "+3%" : index % 3 === 1 ? "+1%" : "-2%");

          return (
            <div className="table-row" key={startup.name}>
              <span className="table-rank">{rankLabel}</span>
              <div className="table-startup">
                <div className="table-avatar">{startup.name[0]}</div>
                <div className="table-name">
                  <strong>{startup.name}</strong>
                  <small>{startup.sector}</small>
                </div>
              </div>
              <span className="table-founder">{startup.sector}</span>
              <span className="align-right table-mrr">{score}</span>
              <span
                className={`align-right table-growth ${change.startsWith("-") ? "down" : "up"}`}
              >
                {change.startsWith("-") ? "↓" : "↑"} {change}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
