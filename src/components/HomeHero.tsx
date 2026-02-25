import { POST_PITCH_FALLBACK_HREF, openPostPitchFlow } from "@/lib/post-pitch";

type HomeHeroProps = {
  onPostPitch?: () => void;
};

export default function HomeHero({ onPostPitch }: HomeHeroProps) {
  return (
    <section className="hero hero-story">
      <p className="hero-story-kicker">FOR EVERY INDIAN FOUNDER</p>
      <p className="hero-story-watermark" aria-hidden="true">
        BUILD IN PUBLIC
      </p>
      <div className="hero-brand hero-story-brand">
        <span className="brand-star">✦</span>
        <span>StartupManch</span>
      </div>
      <h1 className="hero-story-title">
        Your story <span className="hero-story-highlight">matters.</span>
      </h1>
      <p className="hero-subline hero-story-subline">
        Share your wins, losses, and learnings. The Indian startup community is here for you.
      </p>
      <a
        href={POST_PITCH_FALLBACK_HREF}
        className="hero-btn hero-story-btn"
        onClick={(event) => {
          event.preventDefault();
          if (onPostPitch) {
            onPostPitch();
            return;
          }
          openPostPitchFlow();
        }}
      >
        ↗ Start Your Journey
      </a>
      <p className="hero-story-meta">Free · For everyone · No strings attached</p>
    </section>
  );
}
