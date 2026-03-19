"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { clearPendingJoinMicStream, preparePendingJoinMicStream } from "@/lib/roundtable/client-media";
import { ensureGuestId, getDisplayName, setDisplayName } from "@/lib/roundtable/client-identity";
import type { RoundtableSessionSummary } from "@/lib/roundtable/types";

type RoundtableSessionCardProps = {
  session: RoundtableSessionSummary;
};

type JoinResponse = {
  ok?: boolean;
  error?: string;
};

export default function RoundtableSessionCard({ session }: RoundtableSessionCardProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seatCount = Math.max(1, session.max_seats);
  const occupiedSeats = Math.min(session.seats_taken, seatCount);

  const handleJoin = async () => {
    if (busy) return;
    const actorId = ensureGuestId();
    const displayName = setDisplayName(getDisplayName());

    try {
      setBusy(true);
      setError(null);
      void preparePendingJoinMicStream().catch(() => null);

      const response = await fetch(`/api/roundtable/sessions/${session.session_id}/join`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-roundtable-actor-id": actorId,
        },
        body: JSON.stringify({
          display_name: displayName,
        }),
      });

      const payload = (await response.json()) as JoinResponse;
      if (!response.ok) {
        clearPendingJoinMicStream();
        setError(payload.error ?? "Unable to join room.");
        return;
      }

      router.push(`/roundtable/${session.session_id}`);
    } catch {
      clearPendingJoinMicStream();
      setError("Unable to join room.");
    } finally {
      setBusy(false);
    }
  };

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
        <button type="button" onClick={() => void handleJoin()} disabled={busy}>
          {busy ? "Joining..." : "Join room"}
        </button>
      </div>
      {error ? <p className="roundtable-error">{error}</p> : null}
    </article>
  );
}
