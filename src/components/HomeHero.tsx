export default function HomeHero() {
  return (
    <section className="hero">
      <div className="hero-brand">
        <span className="brand-star">✦</span>
        <span>StartupManch</span>
      </div>
      <h1>The database of verified startup revenues</h1>
      <div className="hero-actions">
        <div className="hero-search">
          <span className="search-icon">⌕</span>
          <input
            type="text"
            placeholder="Search startups, founders, categories..."
            aria-label="Search startups"
          />
        </div>
        <button type="button" className="hero-btn">
          + Add startup
        </button>
      </div>
      <div className="hero-tabs">
        <span>New</span>
        <span>Stats</span>
        <span>Acquisition</span>
        <span>$1 vs $1,000,000</span>
      </div>
    </section>
  );
}
