import type { CSSProperties } from "react";
import Link from "next/link";
import { formatRelativeTime, toInitials } from "@/lib/roundtable/present";
import type { RoundtableSessionSummary } from "@/lib/roundtable/types";

type RoundtableSessionCardProps = {
  session: RoundtableSessionSummary;
  featured?: boolean;
};

export default function RoundtableSessionCard({ session, featured = false }: RoundtableSessionCardProps) {
  const seatCount = Math.max(1, session.max_seats);
  const occupiedSeats = Math.min(session.seats_taken, seatCount);
  const seatsLeft = Math.max(0, session.max_seats - session.seats_taken);
  const visibleParticipants = session.joined_display_names.slice(0, 3);
  const overflowCount = Math.max(0, session.joined_display_names.length - visibleParticipants.length);
  const statusLine = session.active_speaker_name
    ? `Speaking now: ${session.active_speaker_name}`
    : session.queue_count > 0
      ? `Queue: ${session.queue_count}`
      : "Open mic";
  const ctaLabel = seatsLeft === 0 ? "View room" : session.status === "live" ? "Join live room" : "Join waiting room";
  const activityLabel = formatRelativeTime(session.last_activity_at ?? session.created_at);

  return (
    <article className={`roundtable-session-card${featured ? " is-featured" : ""}`}>
      <div className="roundtable-session-head">
        <p className={`roundtable-status${session.status === "live" ? " is-live" : ""}`}>{session.status.toUpperCase()}</p>
        <p>Updated {activityLabel}</p>
      </div>
      <div className="roundtable-session-mini">
        <div className="roundtable-session-mini-wheel" aria-hidden>
          {Array.from({ length: seatCount }, (_, index) => (
            <span
              key={`mini-seat-${index + 1}`}
              className={`roundtable-session-mini-seat ${index < occupiedSeats ? "is-occupied" : "is-empty"}`}
              style={{ "--rt-mini-seat-index": index } as CSSProperties}
            />
          ))}
          <span className="roundtable-session-mini-core" />
        </div>
      </div>
      <h4>{session.topic_title}</h4>
      <p>{session.topic_description ?? "No description yet."}</p>
      <div className="roundtable-session-live-line">
        <strong>{statusLine}</strong>
        <span>{seatsLeft === 0 ? "Full room" : `${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left`}</span>
      </div>
      <div className="roundtable-session-avatars" aria-label="Current participants">
        {visibleParticipants.length ? (
          visibleParticipants.map((name, index) => (
            <span key={`${name}-${index}`} className="roundtable-session-avatar-chip" title={name}>
              {toInitials(name)}
            </span>
          ))
        ) : (
          <span className="roundtable-session-avatar-chip is-empty">OPEN</span>
        )}
        {overflowCount ? <span className="roundtable-session-avatar-chip is-overflow">+{overflowCount}</span> : null}
      </div>
      <div className="roundtable-tags">
        {session.tags.length ? session.tags.map((tag) => <span key={tag}>#{tag}</span>) : <span>#startup</span>}
      </div>
      <div className="roundtable-session-foot">
        <span>
          {session.seats_taken}/{session.max_seats} seated · {session.turn_duration_sec}s turns
        </span>
        <Link className="roundtable-session-link" href={`/roundtable/${session.session_id}`}>
          {ctaLabel}
        </Link>
      </div>
    </article>
  );
}
