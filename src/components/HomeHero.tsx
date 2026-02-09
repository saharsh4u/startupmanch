export default function HomeHero() {
  return (
    <section className="hero">
      <div className="hero-brand">
        <span className="brand-star">★</span>
        <span>StartupManch</span>
      </div>
      <h1>The database of verified startup revenues</h1>
      <div className="hero-actions">
        <label className="hero-search" aria-label="Search startups">
          <span className="search-icon">⌕</span>
          <input
            type="text"
            placeholder="Search startups, founders, categories..."
            aria-label="Search startups"
          />
        </label>
        <a href="https://www.startupmanch.com/submit" className="hero-btn">
          + Add startup
        </a>
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
