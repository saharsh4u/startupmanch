export default function HeroArea() {
  return (
    <section className="hero-area">
      <h1>The database of verified startup revenues</h1>
      <div className="search-row">
        <div className="search-pill">
          <span className="search-icon">⌕</span>
          <input type="text" placeholder="Search startups, founders..." />
        </div>
        <div className="chip-row">
          <button type="button" className="chip active">
            New
          </button>
          <button type="button" className="chip">
            Stats
          </button>
          <button type="button" className="chip">
            Acquisition
          </button>
        </div>
        <button type="button" className="chip filter">
          ≡ Filters
        </button>
      </div>
      <div className="subtabs">
        <span>New</span>
        <span>Stats</span>
        <span>Acquisition</span>
        <span>$1 vs $1,000,000</span>
        <span className="listings">2,537 listings</span>
      </div>
    </section>
  );
}
