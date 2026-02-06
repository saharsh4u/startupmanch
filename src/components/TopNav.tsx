export default function TopNav() {
  return (
    <nav className="top-nav">
      <div className="brand">
        <span className="brand-star">✦</span>
        <span>StartupManch</span>
      </div>
      <div className="nav-actions">
        <button type="button" className="nav-btn ghost">
          Sign In
        </button>
        <button type="button" className="nav-btn primary">
          Add Startup
        </button>
        <button type="button" className="nav-btn icon" aria-label="Profile">
          ⦿
        </button>
      </div>
    </nav>
  );
}
