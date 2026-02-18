import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <p className="site-footer-credit">Built by Saharsh</p>
      <div className="site-footer-links">
        <Link href="/blog">Blog</Link>
        <Link href="/feed.xml">RSS</Link>
      </div>
      <ThemeToggle />
    </footer>
  );
}
