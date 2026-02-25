/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { PitchCardProps } from "./hotPitches.types";

const DAY_MS = 24 * 60 * 60 * 1000;

const formatUpdatedLabel = (createdAt: string) => {
  const timestamp = new Date(createdAt).getTime();
  if (!Number.isFinite(timestamp)) return "Updated recently";

  const diffDays = Math.max(0, Math.floor((Date.now() - timestamp) / DAY_MS));
  if (diffDays === 0) return "Updated today";
  return `Updated ${diffDays}d ago`;
};

const formatMeta = (pitch: PitchCardProps["pitch"]) => {
  const parts = [pitch.category, pitch.stage].filter(
    (value): value is string => Boolean(value && value.trim().length)
  );
  parts.push(formatUpdatedLabel(pitch.created_at));
  return parts.join(" · ");
};

export default function PitchCard({ pitch, isActive, distanceFromActive }: PitchCardProps) {
  const hasScore = typeof pitch.score === "number" && Number.isFinite(pitch.score);
  const badgeLabel = hasScore ? pitch.score!.toFixed(1) : "🔥 Hot";
  const stateClassName = isActive ? "is-active" : "is-side";
  const distanceClassName =
    distanceFromActive <= 1 ? "is-neighbor" : distanceFromActive <= 2 ? "is-distant" : "is-far";

  return (
    <Link href={`/pitches/${pitch.slug}`} className="hot-pitches-card-link" aria-label={`Open ${pitch.title}`}>
      <article className={`hot-pitches-card ${stateClassName} ${distanceClassName}`}>
        <div className="hot-pitches-card-media">
          <img src={pitch.image_url} alt={pitch.title} loading="lazy" decoding="async" />
          <span className={`hot-pitches-card-badge ${hasScore ? "is-score" : "is-hot"}`}>{badgeLabel}</span>
          <span className="hot-pitches-card-play" aria-hidden="true">
            ▶
          </span>
          <div className="hot-pitches-card-gradient" aria-hidden="true" />
          <div className="hot-pitches-card-copy">
            <h3>{pitch.title}</h3>
            <p>{formatMeta(pitch)}</p>
          </div>
        </div>
      </article>
    </Link>
  );
}
