"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import RoundtableQueue from "@/components/roundtable/RoundtableQueue";
import RoundtableScoreboard from "@/components/roundtable/RoundtableScoreboard";
import RoundtableSeatCircle from "@/components/roundtable/RoundtableSeatCircle";
import RoundtableTurnTimer from "@/components/roundtable/RoundtableTurnTimer";
import { ensureGuestId, getDisplayName, setDisplayName } from "@/lib/roundtable/client-identity";
import type { RoundtableSessionSnapshot } from "@/lib/roundtable/types";
import { hasBrowserSupabaseEnv, supabaseBrowser } from "@/lib/supabase/client";

type RoundtableRoomProps = {
  sessionId: string;
};

type ActionResponse = {
  ok?: boolean;
  error?: string;
  member_id?: string;
  turn_id?: string;
};

const parseError = (value: unknown, fallback: string) => {
  if (value && typeof value === "object" && "error" in value && typeof (value as { error?: unknown }).error === "string") {
    return (value as { error: string }).error;
  }
  return fallback;
};

export default function RoundtableRoom({ sessionId }: RoundtableRoomProps) {
  const [snapshot, setSnapshot] = useState<RoundtableSessionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [displayName, setDisplayNameState] = useState(() => getDisplayName());
  const [seatChoice, setSeatChoice] = useState<number | "auto">("auto");
  const [captchaToken, setCaptchaToken] = useState("");
  const [draft, setDraft] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    try {
      const response = await fetch(`/api/roundtable/sessions/${sessionId}`, { cache: "no-store" });
      const payload = (await response.json()) as RoundtableSessionSnapshot | { error?: string };
      if (!response.ok) {
        throw new Error(parseError(payload, "Unable to load session."));
      }
      setSnapshot(payload as RoundtableSessionSnapshot);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load session.");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    ensureGuestId();
    void loadSnapshot();
    const timer = window.setInterval(() => {
      void loadSnapshot();
    }, 12000);
    return () => window.clearInterval(timer);
  }, [loadSnapshot]);

  useEffect(() => {
    if (!hasBrowserSupabaseEnv) return;

    const channel = supabaseBrowser
      .channel(`roundtable-room-${sessionId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "roundtable_sessions",
        filter: `id=eq.${sessionId}`,
      }, () => {
        void loadSnapshot();
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "roundtable_members",
        filter: `session_id=eq.${sessionId}`,
      }, () => {
        void loadSnapshot();
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "roundtable_turns",
        filter: `session_id=eq.${sessionId}`,
      }, () => {
        void loadSnapshot();
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "roundtable_scores",
        filter: `session_id=eq.${sessionId}`,
      }, () => {
        void loadSnapshot();
      })
      .subscribe();

    return () => {
      void supabaseBrowser.removeChannel(channel);
    };
  }, [loadSnapshot, sessionId]);

  const guestId = useMemo(() => ensureGuestId(), []);

  const currentMember = useMemo(() => {
    if (!snapshot || !guestId) return null;
    return snapshot.members.find((member) => member.state === "joined" && member.guest_id === guestId) ?? null;
  }, [guestId, snapshot]);

  const activeTurn = snapshot?.active_turn ?? null;
  const canSubmit = Boolean(activeTurn && currentMember && activeTurn.member_id === currentMember.id);

  const callApi = async (
    path: string,
    body: Record<string, unknown>,
    busyKey: string
  ) => {
    if (!guestId) {
      setActionError("Unable to initialize guest identity.");
      return null;
    }

    try {
      setBusyAction(busyKey);
      setActionError(null);
      setDisplayName(displayName);

      const response = await fetch(path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-roundtable-guest-id": guestId,
        },
        body: JSON.stringify({
          display_name: displayName,
          ...body,
        }),
      });

      const payload = (await response.json()) as ActionResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Action failed.");
      }

      await loadSnapshot();
      return payload;
    } catch (actionErrorValue) {
      setActionError(actionErrorValue instanceof Error ? actionErrorValue.message : "Action failed.");
      return null;
    } finally {
      setBusyAction(null);
    }
  };

  const handleJoin = async () => {
    if (!displayName.trim().length) {
      setActionError("Display name is required.");
      return;
    }

    await callApi(`/api/roundtable/sessions/${sessionId}/join`, {
      seat_no: seatChoice === "auto" ? undefined : seatChoice,
      captcha_token: captchaToken,
    }, "join");
  };

  const handleRaiseHand = async () => {
    await callApi(`/api/roundtable/sessions/${sessionId}/raise-hand`, {}, "raise");
  };

  const handleLeave = async () => {
    await callApi(`/api/roundtable/sessions/${sessionId}/leave`, {}, "leave");
  };

  const handleSubmitTurn = async () => {
    if (!activeTurn) return;
    const payload = await callApi(
      `/api/roundtable/sessions/${sessionId}/turn/submit`,
      {
        turn_id: activeTurn.id,
        body: draft,
      },
      "submit"
    );

    if (payload?.ok) {
      setDraft("");
    }
  };

  const handleVote = async (turnId: string, vote: 1 | -1) => {
    await callApi(`/api/roundtable/sessions/${sessionId}/turn/vote`, { turn_id: turnId, vote }, `vote-${turnId}`);
  };

  const handleReport = async (turnId: string) => {
    await callApi(
      `/api/roundtable/sessions/${sessionId}/turn/report`,
      { turn_id: turnId, reason: "abusive or spam" },
      `report-${turnId}`
    );
  };

  if (loading) {
    return <section className="roundtable-panel">Loading session...</section>;
  }

  if (error || !snapshot) {
    return (
      <section className="roundtable-panel">
        <h3>Unable to load session</h3>
        <p>{error ?? "Session unavailable."}</p>
        <button type="button" className="roundtable-cta" onClick={() => void loadSnapshot()}>
          Retry
        </button>
      </section>
    );
  }

  const queuedMemberIds = snapshot.queue.map((turn) => turn.member_id);

  return (
    <div className="roundtable-shell">
      <section className="roundtable-hero">
        <p className="roundtable-kicker">Roundtable room</p>
        <h1>{snapshot.topic.title}</h1>
        <p>{snapshot.topic.description ?? "No topic description."}</p>
      </section>

      <section className="roundtable-controls">
        <label>
          Display name
          <input
            value={displayName}
            onChange={(event) => setDisplayNameState(event.target.value)}
            placeholder="Your name"
          />
        </label>
        <label>
          Seat
          <select
            value={seatChoice}
            onChange={(event) => {
              const value = event.target.value;
              setSeatChoice(value === "auto" ? "auto" : Number(value));
            }}
          >
            <option value="auto">Auto seat</option>
            <option value={1}>Seat 1</option>
            <option value={2}>Seat 2</option>
            <option value={3}>Seat 3</option>
            <option value={4}>Seat 4</option>
            <option value={5}>Seat 5</option>
          </select>
        </label>
        <label>
          Captcha token
          <input
            value={captchaToken}
            onChange={(event) => setCaptchaToken(event.target.value)}
            placeholder="Paste Turnstile token"
          />
        </label>
        {!currentMember ? (
          <button type="button" className="roundtable-cta" disabled={busyAction === "join"} onClick={() => void handleJoin()}>
            {busyAction === "join" ? "Joining..." : "Join seat"}
          </button>
        ) : (
          <>
            <button type="button" className="roundtable-cta" disabled={busyAction === "raise"} onClick={() => void handleRaiseHand()}>
              {busyAction === "raise" ? "Queueing..." : "Raise hand"}
            </button>
            <button type="button" className="roundtable-ghost-btn" disabled={busyAction === "leave"} onClick={() => void handleLeave()}>
              Leave seat
            </button>
          </>
        )}
      </section>

      {actionError ? <p className="roundtable-error">{actionError}</p> : null}

      <RoundtableSeatCircle
        members={snapshot.members}
        activeMemberId={activeTurn?.member_id ?? null}
        queuedMemberIds={queuedMemberIds}
        currentMemberId={currentMember?.id ?? null}
      />

      <section className="roundtable-grid">
        <RoundtableQueue queue={snapshot.queue} />
        <RoundtableScoreboard scores={snapshot.scores} />
      </section>

      <section className="roundtable-panel" aria-label="Active speaking turn">
        <h4>Active turn</h4>
        {activeTurn ? (
          <>
            <p>
              <strong>{activeTurn.member_display_name}</strong> is speaking.
            </p>
            <RoundtableTurnTimer endsAt={activeTurn.ends_at} />
            {canSubmit ? (
              <div className="roundtable-submit-box">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={5}
                  maxLength={600}
                  placeholder="Type your turn here. Auto-submit happens when the timer ends."
                />
                <button type="button" className="roundtable-cta" disabled={busyAction === "submit" || draft.trim().length < 2} onClick={() => void handleSubmitTurn()}>
                  {busyAction === "submit" ? "Submitting..." : "Submit turn"}
                </button>
              </div>
            ) : (
              <p className="roundtable-muted">Only the active speaker can submit.</p>
            )}
          </>
        ) : (
          <p className="roundtable-muted">Waiting for next speaker.</p>
        )}
      </section>

      <section className="roundtable-panel" aria-label="Recent submitted turns">
        <h4>Recent turns</h4>
        {!snapshot.recent_turns.length ? <p className="roundtable-muted">No submitted turns yet.</p> : null}
        <div className="roundtable-turn-list">
          {snapshot.recent_turns.map((turn) => (
            <article key={turn.id} className="roundtable-turn-item">
              <div className="roundtable-turn-head">
                <strong>{turn.member_display_name}</strong>
                <span>{turn.status}</span>
              </div>
              <p>{turn.body ?? "(No content)"}</p>
              {currentMember ? (
                <div className="roundtable-turn-actions">
                  <button type="button" onClick={() => void handleVote(turn.id, 1)}>Upvote</button>
                  <button type="button" onClick={() => void handleVote(turn.id, -1)}>Downvote</button>
                  <button type="button" onClick={() => void handleReport(turn.id)}>Report</button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
