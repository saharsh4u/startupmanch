import { startups } from "@/data/startups";

export default function StartupTable() {
  return (
    <section className="table-card">
      <div className="table-header">
        <h3>Leaderboard</h3>
        <div className="table-filters">
          <span>Ask</span>
          <span>All time</span>
        </div>
      </div>
      <div className="table">
        <div className="table-row head">
          <span>#</span>
          <span>Startup</span>
          <span className="align-right">Ask</span>
        </div>
        {startups.map((startup, index) => (
          <div className="table-row" key={startup.name}>
            <span>{index + 1}</span>
            <span>{startup.name}</span>
            <span className="align-right">{startup.ask}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
