import { rankingRows } from "@/data/rankings";

const sparklinePath = (index: number) => {
  const base = [12, 18, 14, 20, 16, 22, 18, 26, 20, 28, 24, 30];
  const values = base.map((value) => value + ((index * 7) % 6));
  const points = values.map((value, i) => `${i * 10},${40 - value}`);
  return `M${points.join(" L")}`;
};

export default function RankingsTable() {
  return (
    <section className="rankings-card">
      <div className="rankings-header">
        <div>
          <h3>Rank</h3>
          <span>2,537 listings</span>
        </div>
        <button type="button" className="view-all">
          View All →
        </button>
      </div>
      <div className="rankings-table">
        <div className="rankings-row header">
          <span>Rank</span>
          <span>Startup</span>
          <span>Industry</span>
          <span>Revenue</span>
          <span>Multiple</span>
          <span>Growth</span>
          <span />
        </div>
        {rankingRows.map((row) => (
          <div className="rankings-row" key={row.name}>
            <div className={`rank-badge rank-${row.rank}`}>{row.rank}</div>
            <div className="startup-cell">
              <div className="startup-icon">{row.name[0]}</div>
              <div>
                <div className="startup-name">
                  {row.name}
                  {row.featured && <span className="featured">Featured</span>}
                </div>
                <span className="startup-sub">{row.industry}</span>
              </div>
            </div>
            <span className="industry-cell">{row.industry}</span>
            <span className="metric-cell metric-revenue">{row.revenue}</span>
            <span className="metric-cell metric-multiple">{row.multiple}</span>
            <span className="metric-cell metric-growth">{row.growth}</span>
            <svg className="spark" viewBox="0 0 110 40" preserveAspectRatio="none">
              <path d={sparklinePath(row.rank)} />
            </svg>
          </div>
        ))}
      </div>
      <div className="rankings-footer">
        <button type="button" className="view-all ghost">
          View All →
        </button>
      </div>
    </section>
  );
}
