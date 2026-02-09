export type RankingsRowItem = {
  rank: number;
  startup_id: string;
  startup_name: string;
  category: string | null;
  upvotes: number;
  downvotes: number;
  comments: number;
  score: number;
  total_count: number;
};

type RankingsTableRowsProps = {
  rows: RankingsRowItem[];
  tableClassName?: string;
};

const toBadge = (name: string) => {
  const clean = name.trim();
  return clean.length ? clean[0].toUpperCase() : "?";
};

const formatScore = (value: number) => {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
};

const sparklinePath = (row: RankingsRowItem, index: number) => {
  const base = [12, 18, 14, 20, 16, 22, 18, 26, 20, 28, 24, 30];
  const momentum = Math.max(-4, Math.min(8, row.upvotes - row.downvotes));
  const commentLift = Math.min(6, Math.floor(row.comments / 2));

  const points = base.map((value, pointIndex) => {
    const lift = pointIndex % 2 === 0 ? 0 : 1;
    const adjusted = Math.max(8, Math.min(34, value + momentum + commentLift + lift + (index % 3)));
    return `${pointIndex * 10},${40 - adjusted}`;
  });

  return `M${points.join(" L")}`;
};

export default function RankingsTableRows({ rows, tableClassName }: RankingsTableRowsProps) {
  return (
    <div className={`rankings-table${tableClassName ? ` ${tableClassName}` : ""}`}>
      <div className="rankings-row header">
        <span>Rank</span>
        <span>Startup</span>
        <span className="industry-cell">Category</span>
        <span className="metric-upvotes">Upvotes</span>
        <span className="metric-downvotes">Downvotes</span>
        <span className="metric-comments">Comments</span>
        <span className="metric-score">Score</span>
        <span className="spark">Trend</span>
      </div>
      {rows.map((row, index) => (
        <div className="rankings-row" key={row.startup_id}>
          <div className="rank-badge">{row.rank}</div>
          <div className="startup-cell">
            <div className="startup-icon">{toBadge(row.startup_name)}</div>
            <div>
              <div className="startup-name">{row.startup_name}</div>
              <span className="startup-sub">{row.category ?? "General"}</span>
            </div>
          </div>
          <span className="industry-cell">{row.category ?? "General"}</span>
          <span className="metric-cell metric-upvotes">{row.upvotes}</span>
          <span className="metric-cell metric-downvotes">{row.downvotes}</span>
          <span className="metric-cell metric-comments">{row.comments}</span>
          <span className="metric-cell metric-score">{formatScore(row.score)}</span>
          <svg className="spark" viewBox="0 0 110 40" preserveAspectRatio="none" aria-hidden="true">
            <path d={sparklinePath(row, index)} />
          </svg>
        </div>
      ))}
    </div>
  );
}
