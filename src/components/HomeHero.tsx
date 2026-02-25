import { POST_PITCH_FALLBACK_HREF, openPostPitchFlow } from "@/lib/post-pitch";

type HomeHeroProps = {
  onPostPitch?: () => void;
};

export default function HomeHero({ onPostPitch }: HomeHeroProps) {
  return (
    <section className="hero hero-story">
      <h1 className="hero-story-title">Watch Startups Being Built in Public 🇮🇳</h1>
      <p className="hero-subline hero-story-subline">
        India&apos;s video network for founders documenting their journey.
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
        ▶ Start Your Journey
      </a>
      <p className="hero-story-meta">Free · Open to all builders · No gatekeeping</p>
    </section>
  );
}
