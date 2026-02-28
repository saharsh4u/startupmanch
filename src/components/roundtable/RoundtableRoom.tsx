"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RoundtableQueue from "@/components/roundtable/RoundtableQueue";
import RoundtableScoreboard from "@/components/roundtable/RoundtableScoreboard";
import RoundtableSeatCircle, { type RoundtableSeatViewModel } from "@/components/roundtable/RoundtableSeatCircle";
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

const SLICE_TEXT_LIMIT = 84;
const DRAFT_SYNC_DEBOUNCE_MS = 450;

const parseError = (value: unknown, fallback: string) => {
  if (value && typeof value === "object" && "error" in value && typeof (value as { error?: unknown }).error === "string") {
    return (value as { error: string }).error;
  }
  return fallback;
};

const toInitials = (displayName: string) => {
  const parts = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
};

export default function RoundtableRoom({ sessionId }: RoundtableRoomProps) {
  const [snapshot, setSnapshot] = useState<RoundtableSessionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [displayName, setDisplayNameState] = useState(() => getDisplayName());
  const [seatChoice, setSeatChoice] = useState<number | "auto">("auto");
  const [draft, setDraft] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const draftSyncTimerRef = useRef<number | null>(null);
  const lastDraftSyncedRef = useRef<string>("");

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
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

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
  const queuedMemberIds = useMemo(() => snapshot?.queue.map((turn) => turn.member_id) ?? [], [snapshot]);

  const seats = useMemo<RoundtableSeatViewModel[]>(() => {
    if (!snapshot) return [];
    const bySeat = new Map<number, (typeof snapshot.members)[number]>();
    for (const member of snapshot.members) {
      if (member.state !== "joined") continue;
      bySeat.set(member.seat_no, member);
    }

    const queuedSet = new Set(queuedMemberIds);
    return Array.from({ length: snapshot.session.max_seats }, (_, index) => {
      const seatNo = index + 1;
      const member = bySeat.get(seatNo) ?? null;
      const isActive = Boolean(member && member.id === activeTurn?.member_id);
      const isQueued = Boolean(member && queuedSet.has(member.id));
      const isMe = Boolean(member && member.id === currentMember?.id);
      const isEmpty = !member;

      return {
        seatNo,
        memberId: member?.id ?? null,
        displayName: member?.display_name ?? "Open seat",
        initials: member ? toInitials(member.display_name) : "OS",
        isActive,
        isQueued,
        isMe,
        isEmpty,
        stateLabel: isActive ? "Speaking" : isQueued ? "Hand raised" : member ? "Listening" : "Available",
      };
    });
  }, [activeTurn?.member_id, currentMember?.id, queuedMemberIds, snapshot]);

  const wheelFlareToken = useMemo(() => {
    if (activeTurn?.id) {
      return `active-${activeTurn.id}-${activeTurn.starts_at ?? ""}`;
    }
    const latestTurn = snapshot?.recent_turns?.[0];
    if (!latestTurn) return null;
    return `recent-${latestTurn.id}-${latestTurn.status}`;
  }, [activeTurn?.id, activeTurn?.starts_at, snapshot?.recent_turns]);

  const activeSpeech = useMemo(() => {
    if (!activeTurn) return null;
    const activeSeat = seats.find((seat) => seat.memberId === activeTurn.member_id);
    if (!activeSeat) return null;
    const source = canSubmit ? draft : (activeTurn.body ?? "");
    const collapsed = source.replace(/\s+/g, " ").trim();
    if (!collapsed.length) return null;
    const text = collapsed.length > SLICE_TEXT_LIMIT
      ? collapsed.slice(collapsed.length - SLICE_TEXT_LIMIT)
      : collapsed;

    return {
      seatNo: activeSeat.seatNo,
      text,
    };
  }, [activeTurn, canSubmit, draft, seats]);

  const silentSeatTarget = useMemo(() => {
    if (!snapshot || !seats.length) {
      return { seatNo: null as number | null };
    }

    const queuedSet = new Set(queuedMemberIds);
    const lastSpokenAtMs = new Map<string, number>();

    for (const turn of snapshot.recent_turns) {
      const memberId = turn.member_id;
      const body = (turn.body ?? "").trim();
      if (!body.length) continue;
      const stamp = Date.parse(turn.submitted_at ?? turn.updated_at ?? "");
      if (!Number.isFinite(stamp)) continue;
      const current = lastSpokenAtMs.get(memberId) ?? 0;
      if (stamp > current) {
        lastSpokenAtMs.set(memberId, stamp);
      }
    }

    const joinedMembers = snapshot.members.filter((member) => member.state === "joined");
    const silenceThresholdMs = 5 * 60 * 1000;
    let picked: { memberId: string; inactiveForMs: number } | null = null;

    for (const member of joinedMembers) {
      if (member.id === activeTurn?.member_id) continue;
      if (queuedSet.has(member.id)) continue;

      const joinedAtMs = Date.parse(member.joined_at ?? "");
      const lastSpokenMs = lastSpokenAtMs.get(member.id) ?? (Number.isFinite(joinedAtMs) ? joinedAtMs : nowMs);
      const inactiveForMs = nowMs - lastSpokenMs;

      if (inactiveForMs < silenceThresholdMs) continue;
      if (!picked || inactiveForMs > picked.inactiveForMs) {
        picked = {
          memberId: member.id,
          inactiveForMs,
        };
      }
    }

    if (!picked) {
      return { seatNo: null as number | null };
    }

    const pickedSeat = seats.find((seat) => seat.memberId === picked.memberId);
    return {
      seatNo: pickedSeat?.seatNo ?? null,
    };
  }, [activeTurn?.member_id, nowMs, queuedMemberIds, seats, snapshot]);

  useEffect(() => {
    lastDraftSyncedRef.current = activeTurn?.body ?? "";
    if (canSubmit && !draft && activeTurn?.body) {
      setDraft(activeTurn.body);
    }
  }, [activeTurn?.body, canSubmit, draft]);

  useEffect(() => {
    return () => {
      if (draftSyncTimerRef.current) {
        window.clearTimeout(draftSyncTimerRef.current);
        draftSyncTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!canSubmit || !activeTurn?.id || !guestId) return;

    const body = draft.slice(0, 600);
    if (body === lastDraftSyncedRef.current) return;

    if (draftSyncTimerRef.current) {
      window.clearTimeout(draftSyncTimerRef.current);
    }

    draftSyncTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/roundtable/sessions/${sessionId}/turn/draft`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-roundtable-guest-id": guestId,
            },
            body: JSON.stringify({
              display_name: displayName,
              turn_id: activeTurn.id,
              body,
            }),
          });

          if (response.ok) {
            lastDraftSyncedRef.current = body;
          }
        } catch {
          // Draft sync failures are non-blocking; submit still sends final turn content.
        }
      })();
    }, DRAFT_SYNC_DEBOUNCE_MS);

    return () => {
      if (draftSyncTimerRef.current) {
        window.clearTimeout(draftSyncTimerRef.current);
        draftSyncTimerRef.current = null;
      }
    };
  }, [activeTurn?.id, canSubmit, displayName, draft, guestId, sessionId]);

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

      <section className="roundtable-panel roundtable-live-compose" aria-label="Live pie text input">
        <h4>Live pie text</h4>
        {activeTurn ? (
          canSubmit ? (
            <>
              <p className="roundtable-muted">Type here. This appears on your pie in realtime.</p>
              <div className="roundtable-submit-box">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={4}
                  maxLength={600}
                  placeholder="Type your turn here. Text appears live on your pie."
                />
                <button
                  type="button"
                  className="roundtable-cta"
                  disabled={busyAction === "submit" || draft.trim().length < 2}
                  onClick={() => void handleSubmitTurn()}
                >
                  {busyAction === "submit" ? "Submitting..." : "Submit turn"}
                </button>
              </div>
            </>
          ) : (
            <p className="roundtable-muted">
              <strong>{activeTurn.member_display_name}</strong> is currently speaking. When your turn starts, this input unlocks.
            </p>
          )
        ) : (
          <p className="roundtable-muted">No active speaker yet. Raise hand to join the queue.</p>
        )}
      </section>

      <RoundtableSeatCircle
        seats={seats}
        flareToken={wheelFlareToken}
        eyeTargetSeatNo={silentSeatTarget.seatNo}
        activeSpeech={activeSpeech}
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
            {canSubmit ? <p className="roundtable-muted">Use the Live pie text box above to type and submit.</p> : <p className="roundtable-muted">Only the active speaker can submit.</p>}
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
