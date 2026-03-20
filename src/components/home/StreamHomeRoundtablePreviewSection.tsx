"use client";

import Link from "next/link";
import RoundtableSeatCircle, {
  type RoundtableSeatViewModel,
} from "@/components/roundtable/RoundtableSeatCircle";

export type StreamHomeRoundtablePreviewModel = {
  seats: RoundtableSeatViewModel[];
  eyeTargetSeatNo: number | null;
  flareToken: string;
  headline: string;
  description: string;
  href: string;
  statusLabel: string;
  metadata: string[];
  tags: string[];
  helper: string;
};

type StreamHomeRoundtablePreviewSectionProps = {
  preview: StreamHomeRoundtablePreviewModel;
  isLoading: boolean;
  statusNote: string;
  lobbyHref: string;
  ctaLabel: string;
};

export default function StreamHomeRoundtablePreviewSection({
  preview,
  isLoading,
  statusNote,
  lobbyHref,
  ctaLabel,
}: StreamHomeRoundtablePreviewSectionProps) {
  return (
    <section
      id="home-roundtable"
      className="stream-home-section stream-home-roundtable"
    >
      <div className="stream-home-section-head">
        <div>
          <p className="stream-home-kicker">Roundtable preview</p>
          <h2>{preview.headline}</h2>
          <p>{preview.description}</p>
        </div>
        <div className="stream-home-status-stack">
          <span className="stream-home-status-pill">{preview.statusLabel}</span>
          <span className="stream-home-status-note">
            {isLoading ? "Refreshing live room..." : statusNote}
          </span>
        </div>
      </div>

      <div className="stream-home-roundtable-grid">
        <div className="stream-home-roundtable-visual">
          <RoundtableSeatCircle
            seats={preview.seats}
            flareToken={preview.flareToken}
            eyeTargetSeatNo={preview.eyeTargetSeatNo}
          />
        </div>
        <div className="stream-home-roundtable-copy">
          <div className="stream-home-metadata-grid" aria-label="Roundtable details">
            {preview.metadata.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
          <div className="stream-home-tag-row" aria-label="Roundtable tags">
            {preview.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
          <p className="stream-home-roundtable-helper">{preview.helper}</p>
          <div className="stream-home-roundtable-actions">
            <Link href={preview.href} className="stream-home-primary-cta">
              {ctaLabel}
            </Link>
            <Link href={lobbyHref} className="stream-home-secondary-cta">
              View Lobby
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
