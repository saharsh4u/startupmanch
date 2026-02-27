import AdRailsScaffold from "@/components/AdRailsScaffold";
import AboutSection from "@/components/AboutSection";
import SiteFooter from "@/components/SiteFooter";
import TopNav from "@/components/TopNav";

export default function AboutPage() {
  return (
    <AdRailsScaffold mainClassName="page about-page inner-rails-page">
      <div className="about-page-shell">
        <TopNav context="inner" showPostPitch />
        <div className="anchor-block">
          <AboutSection />
        </div>
        <SiteFooter />
      </div>
    </AdRailsScaffold>
  );
}
