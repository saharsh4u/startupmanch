import { POST_PITCH_FALLBACK_HREF, openPostPitchFlow } from "@/lib/post-pitch";
import LeadCaptureForm from "@/components/LeadCaptureForm";

type HomeHeroProps = {
  onPostPitch?: () => void;
};

export default function HomeHero({ onPostPitch }: HomeHeroProps) {
  return (
    <>
      <section className="hero">
        <div className="hero-brand">
          <span className="brand-star">✦</span>
          <span>StartupManch</span>
        </div>
        <h1>India&apos;s Startup Marketplace for Founders &amp; Investors</h1>
        <p className="hero-subline">Without a Pitch, It&apos;s Just an Idea</p>
        <div className="hero-actions">
          <div className="hero-action-group hero-action-group-search">
            <div className="hero-search">
              <span className="search-icon">⌕</span>
              <input
                type="text"
                placeholder="Search pitches, founders, categories..."
                aria-label="Search pitches"
              />
            </div>
            <p className="hero-action-meta">Explore early-stage ideas.</p>
          </div>
          <div className="hero-action-group hero-action-group-cta">
            <a
              href={POST_PITCH_FALLBACK_HREF}
              className="hero-btn"
              onClick={(event) => {
                event.preventDefault();
                if (onPostPitch) {
                  onPostPitch();
                  return;
                }
                openPostPitchFlow();
              }}
            >
              Post a Pitch
            </a>
            <p className="hero-action-meta">Takes less than 2 minutes.</p>
          </div>
        </div>
      </section>
      <LeadCaptureForm
        source="home_hero"
        title="Get founder and investor updates"
        description="Join StartupManch to receive practical growth insights and featured pitches."
        compact
      />
    </>
  );
}
