export default function HomeHero() {
  return (
    <section className="hero">
      <div className="hero-brand">
        <span className="brand-star">✦</span>
        <span>StartupManch</span>
      </div>
      <h1>India’s Pitch Stage</h1>
      <p className="hero-subline">Watch. Judge. Back.</p>
      <div className="hero-actions">
        <div className="hero-search">
          <span className="search-icon">⌕</span>
          <input
            type="text"
            placeholder="Search pitches, founders, categories..."
            aria-label="Search pitches"
          />
        </div>
        <a href="https://www.startupmanch.com/submit" className="hero-btn">
          + Post pitch
        </a>
      </div>
      <div className="hero-tabs">
        <span>Trending</span>
        <span>Fresh</span>
        <span>Food</span>
        <span>Fashion</span>
      </div>
    </section>
  );
}
