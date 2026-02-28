import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

type SiteFooterProps = {
  showCredit?: boolean;
  showThemeToggle?: boolean;
};

export default function SiteFooter({ showCredit = true, showThemeToggle = true }: SiteFooterProps) {
  const footerClassName =
    showCredit || showThemeToggle ? "site-footer" : "site-footer site-footer-minimal";

  return (
    <footer className={footerClassName}>
      {showCredit ? <p className="site-footer-credit">Built by Saharsh</p> : null}
      <div className="site-footer-links">
        <Link href="/blog">Blog</Link>
        <Link href="/feed.xml">RSS</Link>
      </div>
      {showThemeToggle ? <ThemeToggle /> : null}
    </footer>
  );
}
