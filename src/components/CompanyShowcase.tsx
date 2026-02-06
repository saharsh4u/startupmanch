import { startups } from "@/data/startups";

const splitRows = <T,>(entries: T[]) => {
  const first = entries.slice(0, 4);
  const second = entries.slice(4, 8);
  return [first, second];
};

const TrustBadges = ({
  tractionVerified,
  dpiitVerified,
  alumniVerified
}: {
  tractionVerified: boolean;
  dpiitVerified: boolean;
  alumniVerified: boolean;
}) => {
  return (
    <div className="trust-badges">
      {tractionVerified && <span className="trust-badge traction">Verified Traction</span>}
      {dpiitVerified && <span className="trust-badge dpiit">DPIIT Verified</span>}
      {alumniVerified && <span className="trust-badge alumni">Alumni Verified</span>}
    </div>
  );
};

export default function CompanyShowcase() {
  const [rowOne, rowTwo] = splitRows(startups);

  return (
    <section className="company-showcase">
      <div className="section-block">
        <div className="section-header">
          <h3>Raising This Week</h3>
          <span className="section-link">View all</span>
        </div>
        <div className="card-grid">
          {rowOne.map((startup) => (
            <div className="company-card" key={`raise-${startup.name}`}>
              <div className="card-top">
                <span
                  className={`card-tag ${
                    startup.badge === "Verified" ? "verified" : "highlight"
                  }`}
                >
                  {startup.badge}
                </span>
                <span className="card-rank">{startup.stage}</span>
              </div>
              <h4>{startup.name}</h4>
              <p className="card-sub">
                {startup.sector} · {startup.city}
              </p>
              <TrustBadges
                tractionVerified={startup.trust.tractionVerified}
                dpiitVerified={startup.trust.dpiitVerified}
                alumniVerified={startup.trust.alumniVerified}
              />
              <div className="card-metrics">
                <div>
                  <span>Ask</span>
                  <strong>{startup.ask}</strong>
                </div>
                <div>
                  <span>Traction</span>
                  <strong>{startup.traction}</strong>
                </div>
              </div>
              <button className="card-action" type="button">
                Request Access
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="section-block">
        <div className="section-header">
          <div className="section-title">
            <h3>Trending in Bharat</h3>
            <span className="section-sub">Investor views this week</span>
          </div>
          <span className="section-link">View all</span>
        </div>
        <div className="card-grid">
          {rowTwo.map((startup) => (
            <div className="company-card" key={`trend-${startup.name}`}>
              <div className="card-top">
                <span className="card-tag verified">Verified</span>
                <span className="card-rank">{startup.stage}</span>
              </div>
              <h4>{startup.name}</h4>
              <p className="card-sub">
                {startup.sector} · {startup.city}
              </p>
              <TrustBadges
                tractionVerified={startup.trust.tractionVerified}
                dpiitVerified={startup.trust.dpiitVerified}
                alumniVerified={startup.trust.alumniVerified}
              />
              <div className="card-metrics">
                <div>
                  <span>Investor Views</span>
                  <strong>{startup.investorViews}</strong>
                </div>
                <div>
                  <span>Ask</span>
                  <strong>{startup.ask}</strong>
                </div>
              </div>
              <button className="card-action" type="button">
                Request Access
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
