import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-brand">
        <span className="brand-star">✦</span>
        <span>StartupManch</span>
      </div>
      <div className="site-footer-links">
        <Link href="/">Home</Link>
        <Link href="/submit">Submit pitch</Link>
        <Link href="/admin">Admin</Link>
        <a href="https://www.startupmanch.com" target="_blank" rel="noreferrer">
          Website
        </a>
      </div>
      <p className="site-footer-copy">© 2026 StartupManch</p>
    </footer>
  );
}
