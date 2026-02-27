import type { CSSProperties } from "react";
import Link from "next/link";
import type { RoundtableSessionSummary } from "@/lib/roundtable/types";

type RoundtableSessionCardProps = {
  session: RoundtableSessionSummary;
};

export default function RoundtableSessionCard({ session }: RoundtableSessionCardProps) {
  const seatCount = Math.max(1, session.max_seats);
  const occupiedSeats = Math.min(session.seats_taken, seatCount);

  return (
    <article className="roundtable-session-card">
      <div className="roundtable-session-head">
        <p className="roundtable-status">{session.status.toUpperCase()}</p>
        <p>
          {session.seats_taken}/{session.max_seats} seats
        </p>
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
      <div className="roundtable-tags">
        {session.tags.length ? session.tags.map((tag) => <span key={tag}>#{tag}</span>) : <span>#startup</span>}
      </div>
      <div className="roundtable-session-foot">
        <span>{session.turn_duration_sec}s turns</span>
        <Link href={`/roundtable/${session.session_id}`}>Open room</Link>
      </div>
    </article>
  );
}
