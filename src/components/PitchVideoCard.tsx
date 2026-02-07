import type { Pitch } from "@/data/pitches";

export default function PitchVideoCard({ pitch }: { pitch: Pitch }) {
  return (
    <article className="pitch-card">
      <div className="pitch-story" style={{ backgroundImage: `url(${pitch.poster})` }}>
        <div className="pitch-story-tag">60s pitch</div>
        <div className="pitch-story-text">
          <h4>{pitch.name}</h4>
          <p>{pitch.tagline}</p>
        </div>
        <div className="pitch-story-actions">
          <button className="pitch-icon-btn" type="button" aria-label="Like pitch">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 20.5l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.54 0 3.04.81 3.87 2.09C11.46 4.81 12.96 4 14.5 4 17 4 19 6 19 8.5c0 3.78-3.4 6.86-8.55 10.68L12 20.5z" />
            </svg>
            <span>12</span>
          </button>
          <button className="pitch-icon-btn" type="button" aria-label="Comment">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 4h16v11H7l-3 3V4zm2 2v9.17L7.17 15H18V6H6z" />
            </svg>
            <span>12</span>
          </button>
          <button className="pitch-icon-btn" type="button" aria-label="Share">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 8a3 3 0 1 0-2.82-4H15a3 3 0 0 0 .18 1L8.91 9.7A3 3 0 0 0 6 8a3 3 0 1 0 2.82 4l6.27-3.7A3 3 0 0 0 18 8zm0 8a3 3 0 0 0-2.82 2L8.91 14.3A3 3 0 0 0 6 16a3 3 0 1 0 3-3c.3 0 .6.05.88.14l6.24 3.69A3 3 0 0 0 18 16z" />
            </svg>
            <span>Share</span>
          </button>
        </div>
      </div>
    </article>
  );
}
