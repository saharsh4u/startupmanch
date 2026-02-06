import type { Pitch } from "@/data/pitches";

export default function PitchVideoCard({ pitch }: { pitch: Pitch }) {
  return (
    <article className="pitch-card">
      <div className="pitch-media" style={{ backgroundImage: `url(${pitch.poster})` }}>
        <div className="pitch-media-overlay">
          <span className="pitch-badge">60s pitch</span>
          <span className="pitch-play">▶</span>
        </div>
        <div className="pitch-ask">
          <div>
            <span>Ask</span>
            <strong>{pitch.ask}</strong>
          </div>
          <div>
            <span>Equity</span>
            <strong>{pitch.equity}</strong>
          </div>
          <div>
            <span>Valuation</span>
            <strong>{pitch.valuation}</strong>
          </div>
        </div>
      </div>

      <div className="pitch-meta">
        <div>
          <h4>{pitch.name}</h4>
          <p>
            {pitch.tagline} · {pitch.category} · {pitch.city}
          </p>
        </div>
      </div>

      <div className="pitch-actions">
        <button className="pitch-action in" type="button">
          I&apos;m In
        </button>
        <button className="pitch-action out" type="button">
          I&apos;m Out
        </button>
        {pitch.isD2C ? (
          <button className="pitch-action buy" type="button">
            Buy Product
          </button>
        ) : null}
      </div>
    </article>
  );
}
