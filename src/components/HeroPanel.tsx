export default function HeroPanel() {
  return (
    <section className="hero-center">
      <div className="brand-line">
        <span className="brand-mark">*</span>
        <span className="brand-name">StartupManch</span>
      </div>

      <h1>The database of verified startup raises</h1>

      <div className="hero-actions">
        <label className="search-pill" aria-label="Search startups">
          <span className="search-icon">⌕</span>
          <input type="text" placeholder="Search startups..." />
        </label>
        <button className="cta" type="button">
          + Add startup
        </button>
      </div>

      <div className="hero-tabs">
        <span>New</span>
        <span>Raising</span>
        <span>Seed</span>
        <span>Series A</span>
      </div>
    </section>
  );
}
