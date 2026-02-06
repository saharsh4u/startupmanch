export default function Methodology() {
  return (
    <section className="methodology">
      <div className="methodology-header">
        <div>
          <p className="eyebrow">Methodology & Disclaimer</p>
          <h2>How StartupManch tracks complaint momentum</h2>
          <p className="subtitle">
            We surface company-level complaint trends from public sources, using
            aggregated signals only. No single review, accusation, or private
            submission is displayed.
          </p>
        </div>
        <button className="ghost" type="button">
          Read full methodology
        </button>
      </div>

      <div className="methodology-grid">
        <div className="method-card">
          <h3>Objective</h3>
          <p>
            Build a live, automated index of Indian companies experiencing rising
            consumer complaints. Rankings focus on trend velocity rather than
            allegations or individual reviews.
          </p>
        </div>

        <div className="method-card">
          <h3>India-focused sources</h3>
          <ul>
            <li>Google Maps and Google Play reviews</li>
            <li>Twitter/X public posts with India keywords</li>
            <li>MouthShut, ConsumerComplaints.in, Reddit, Quora</li>
            <li>Public news comment sections</li>
          </ul>
        </div>

        <div className="method-card">
          <h3>Company auto-discovery</h3>
          <p>
            NLP models extract company entities from complaint-related keywords
            and auto-add entries that cross a frequency threshold, then classify
            them by sector.
          </p>
        </div>

        <div className="method-card">
          <h3>Complaint Trend Score (CTS)</h3>
          <p className="formula">
            (1-star review increase % x 0.35) + (complaint keyword velocity x
            0.30) + (negative sentiment momentum x 0.20) + (source diversity
            score x 0.15)
          </p>
        </div>

        <div className="method-card">
          <h3>Live update strategy</h3>
          <p>
            Near real-time updates every 5 minutes across rolling 1h, 24h, 7d,
            and 30d windows. The UI refreshes every 60 seconds to reflect the
            latest rankings.
          </p>
        </div>

        <div className="method-card">
          <h3>Legal & safety</h3>
          <p>
            We publish aggregated public data only, avoid accusatory language,
            and provide transparent methodology and disclaimers on every page.
          </p>
        </div>
      </div>
    </section>
  );
}
