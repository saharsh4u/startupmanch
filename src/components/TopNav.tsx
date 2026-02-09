import Link from "next/link";

type TopNavProps = {
  context?: "home" | "inner";
};

export default function TopNav({ context = "home" }: TopNavProps) {
  const prefix = context === "home" ? "" : "/";

  return (
    <nav className="site-nav" aria-label="Primary">
      <div className="site-nav-row">
        <Link href="/" className="site-nav-logo">
          <span className="brand-star">✦</span>
          <span>StartupManch</span>
        </Link>
        <div className="site-nav-links">
          <Link href={`${prefix}#top-rated-block`}>Top rated</Link>
          <Link href={`${prefix}#categories-block`}>Categories</Link>
          <Link href={`${prefix}#leaderboard-block`}>Leaderboard</Link>
        </div>
        <div className="site-nav-search">
          <span>⌕</span>
          <input type="text" placeholder="Search startups..." aria-label="Search startups" />
        </div>
        <Link href="/submit" className="site-nav-cta">
          Post pitch
        </Link>
      </div>
    </nav>
  );
}
