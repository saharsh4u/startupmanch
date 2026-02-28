"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RoundtableHomepageVideoRail from "@/components/roundtable/RoundtableHomepageVideoRail";
import RoundtableSeatCircle, { type RoundtableSeatViewModel } from "@/components/roundtable/RoundtableSeatCircle";
import { ensureGuestId, getDisplayName, setDisplayName } from "@/lib/roundtable/client-identity";
import type { RoundtableLeaderboardEntry, RoundtableSessionSnapshot } from "@/lib/roundtable/types";
import { hasBrowserSupabaseEnv, supabaseBrowser } from "@/lib/supabase/client";

type RoundtableRoomProps = {
  sessionId: string;
};

type ActionResponse = {
  ok?: boolean;
  error?: string;
  code?: string;
  member_id?: string;
  seat_no?: number;
  turn_id?: string;
  seats_cleared?: number;
};

type LeaderboardResponse = {
  leaderboard?: RoundtableLeaderboardEntry[];
  error?: string;
};

const mapMicError = (errorValue: unknown) => {
  const fallback = "Could not access microphone.";
  if (!(errorValue instanceof Error)) return fallback;

  if (errorValue.name === "NotAllowedError" || /permission denied/i.test(errorValue.message)) {
    return "Microphone is blocked in browser settings. Click the lock icon in the address bar, allow microphone, then reload this page.";
  }
  if (errorValue.name === "NotFoundError") {
    return "No microphone device was found.";
  }
  if (errorValue.name === "NotReadableError") {
    return "Microphone is busy in another app. Close other apps using mic and try again.";
  }
  if (errorValue.name === "SecurityError") {
    return "Microphone access requires a secure page (HTTPS).";
  }

  return errorValue.message || fallback;
};

const parseError = (value: unknown, fallback: string) => {
  if (value && typeof value === "object" && "error" in value && typeof (value as { error?: unknown }).error === "string") {
    return (value as { error: string }).error;
  }
  return fallback;
};

const mapActionError = (payload: ActionResponse, fallback: string) => {
  switch (payload.code) {
    case "room_full":
      return "Room is full. All seats are currently occupied.";
    case "seat_taken_retry_exhausted":
      return "Someone else took that seat while you were joining. Please tap Join seat again.";
    case "identity_conflict":
      return "You already have an active seat in this room. Leave seat before joining again.";
    case "rate_limited":
      return "Too many attempts. Please wait a bit and try again.";
    case "session_closed":
      return "This session is closed and cannot accept new joins.";
    default:
      return payload.error ?? fallback;
  }
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
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [isMyMicMuted, setIsMyMicMuted] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);
  const [selfMemberId, setSelfMemberId] = useState<string | null>(null);
  const [weeklyContributors, setWeeklyContributors] = useState<RoundtableLeaderboardEntry[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const mediaStreamRef = useRef<MediaStream | null>(null);

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

  const loadWeeklyContributors = useCallback(async () => {
    try {
      const response = await fetch("/api/roundtable/leaderboard", { cache: "no-store" });
      const payload = (await response.json()) as LeaderboardResponse;
      if (!response.ok) {
        return;
      }
      setWeeklyContributors(Array.isArray(payload.leaderboard) ? payload.leaderboard.slice(0, 5) : []);
    } catch {
      // Keep previous list on transient fetch errors.
    }
  }, []);

  useEffect(() => {
    ensureGuestId();
    void loadSnapshot();
    void loadWeeklyContributors();
    const timer = window.setInterval(() => {
      void loadSnapshot();
    }, 12000);
    return () => window.clearInterval(timer);
  }, [loadSnapshot, loadWeeklyContributors]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadWeeklyContributors();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [loadWeeklyContributors]);

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
  const memberStorageKey = useMemo(() => `rt_member_${sessionId}`, [sessionId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(memberStorageKey);
    if (stored) {
      setSelfMemberId(stored);
    }
  }, [memberStorageKey]);

  useEffect(() => {
    const viewerMemberId = snapshot?.viewer_member_id ?? null;
    if (!viewerMemberId) return;
    if (selfMemberId !== viewerMemberId) {
      setSelfMemberId(viewerMemberId);
    }
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(memberStorageKey);
      if (stored !== viewerMemberId) {
        window.localStorage.setItem(memberStorageKey, viewerMemberId);
      }
    }
  }, [memberStorageKey, selfMemberId, snapshot?.viewer_member_id]);

  useEffect(() => {
    if (!snapshot || !selfMemberId) return;
    const viewerMemberId = snapshot.viewer_member_id;
    if (viewerMemberId) return;

    const stillJoinedByStoredMember = snapshot.members.some((member) => member.state === "joined" && member.id === selfMemberId);
    if (stillJoinedByStoredMember) return;

    const stillJoinedByGuestId = guestId
      ? snapshot.members.some((member) => member.state === "joined" && member.guest_id === guestId)
      : false;
    if (stillJoinedByGuestId) return;

    setSelfMemberId(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(memberStorageKey);
    }
  }, [guestId, memberStorageKey, selfMemberId, snapshot]);

  const currentMember = useMemo(() => {
    if (!snapshot) return null;
    if (snapshot.viewer_member_id) {
      const viewerMatch = snapshot.members.find(
        (member) => member.state === "joined" && member.id === snapshot.viewer_member_id
      );
      if (viewerMatch) return viewerMatch;
    }
    return (
      snapshot.members.find(
        (member) =>
          member.state === "joined" &&
          ((selfMemberId && member.id === selfMemberId) || (guestId && member.guest_id === guestId))
      ) ?? null
    );
  }, [guestId, selfMemberId, snapshot]);

  const canManageMembers = Boolean(snapshot?.viewer_can_manage_members);
  const joinedMembers = useMemo(
    () =>
      (snapshot?.members ?? [])
        .filter((member) => member.state === "joined")
        .sort((a, b) => a.seat_no - b.seat_no),
    [snapshot?.members]
  );

  const seatsTaken = snapshot?.session.seats_taken ?? 0;
  const maxSeats = snapshot?.session.max_seats ?? 5;
  const isRoomFull = seatsTaken >= maxSeats;

  const seats = useMemo<RoundtableSeatViewModel[]>(() => {
    if (!snapshot) return [];
    const bySeat = new Map<number, (typeof snapshot.members)[number]>();
    for (const member of snapshot.members) {
      if (member.state !== "joined") continue;
      bySeat.set(member.seat_no, member);
    }

    return Array.from({ length: snapshot.session.max_seats }, (_, index) => {
      const seatNo = index + 1;
      const member = bySeat.get(seatNo) ?? null;
      const isActive = Boolean(member && member.id === currentMember?.id && !isMyMicMuted);
      const isQueued = false;
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
        stateLabel: isActive ? "Speaking" : member ? "Open mic" : "Available",
      };
    });
  }, [currentMember?.id, isMyMicMuted, snapshot]);

  const wheelFlareToken = useMemo(() => {
    if (currentMember?.id && !isMyMicMuted) {
      return `mic-live-${currentMember.id}`;
    }
    const latestTurn = snapshot?.recent_turns?.[0];
    if (!latestTurn) return null;
    return `recent-${latestTurn.id}-${latestTurn.status}`;
  }, [currentMember?.id, isMyMicMuted, snapshot?.recent_turns]);

  const activeSpeakerSeatNo = useMemo(
    () => (currentMember && !isMyMicMuted ? currentMember.seat_no : null),
    [currentMember, isMyMicMuted]
  );

  const silentSeatTarget = useMemo(() => {
    if (!snapshot || !seats.length) {
      return { seatNo: null as number | null };
    }
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
      if (currentMember && member.id === currentMember.id && !isMyMicMuted) continue;

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
  }, [currentMember, isMyMicMuted, nowMs, seats, snapshot]);

  const stopMicStream = useCallback(() => {
    if (!mediaStreamRef.current) return;
    for (const track of mediaStreamRef.current.getTracks()) {
      track.stop();
    }
    mediaStreamRef.current = null;
    setIsMyMicMuted(true);
  }, []);

  const enableMic = useCallback(async () => {
    if (!currentMember) return;
    try {
      if (!window.isSecureContext) {
        setMicError("Microphone works only on HTTPS pages.");
        setIsMyMicMuted(true);
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setMicError("This browser does not support microphone access.");
        setIsMyMicMuted(true);
        return;
      }

      if ("permissions" in navigator && navigator.permissions?.query) {
        try {
          const permission = await navigator.permissions.query({ name: "microphone" as PermissionName });
          if (permission.state === "denied") {
            setMicError("Microphone is blocked in browser settings. Click the lock icon in the address bar, allow microphone, then reload this page.");
            setIsMyMicMuted(true);
            return;
          }
        } catch {
          // Ignore permissions API failures and continue to getUserMedia.
        }
      }

      let stream = mediaStreamRef.current;
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        mediaStreamRef.current = stream;
      }
      for (const track of stream.getAudioTracks()) {
        track.enabled = true;
      }
      setMicError(null);
      setIsMyMicMuted(false);
    } catch (errorValue) {
      const message = mapMicError(errorValue);
      setMicError(message);
      setIsMyMicMuted(true);
    }
  }, [currentMember]);

  useEffect(() => {
    return () => {
      stopMicStream();
    };
  }, [stopMicStream]);

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
        throw new Error(mapActionError(payload, "Action failed."));
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

    const payload = await callApi(`/api/roundtable/sessions/${sessionId}/join`, {
      seat_no: seatChoice === "auto" ? undefined : seatChoice,
    }, "join");

    const memberId = payload?.member_id;
    if (memberId) {
      setSelfMemberId(memberId);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(memberStorageKey, memberId);
      }
      setActionError(null);
    }
  };

  const handleLeave = async () => {
    const payload = await callApi(`/api/roundtable/sessions/${sessionId}/leave`, {}, "leave");
    if (payload?.ok) {
      stopMicStream();
      setSelfMemberId(null);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(memberStorageKey);
      }
    }
  };

  const handleResetSeats = async () => {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Clear all currently occupied seats in this room?");
      if (!confirmed) return;
    }
    const payload = await callApi(`/api/roundtable/sessions/${sessionId}/reset-seats`, {}, "reset-seats");
    if (payload?.ok) {
      stopMicStream();
      setSelfMemberId(null);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(memberStorageKey);
      }
    }
  };

  const handleRemoveMember = async (memberId: string, displayNameValue: string) => {
    if (!canManageMembers) return;
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`Remove ${displayNameValue} from this roundtable?`);
      if (!confirmed) return;
    }
    const payload = await callApi(
      `/api/roundtable/sessions/${sessionId}/members/${memberId}/remove`,
      {},
      `remove-member-${memberId}`
    );
    if (!payload?.ok) return;

    if (currentMember?.id === memberId) {
      stopMicStream();
      setSelfMemberId(null);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(memberStorageKey);
      }
    }
  };

  if (loading) {
    return (
      <div className="roundtable-shell">
        <section className="roundtable-panel">Loading session...</section>
        <RoundtableHomepageVideoRail sessionId={sessionId} participantId={guestId} />
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="roundtable-shell">
        <section className="roundtable-panel">
          <h3>Unable to load session</h3>
          <p>{error ?? "Session unavailable."}</p>
          <button type="button" className="roundtable-cta" onClick={() => void loadSnapshot()}>
            Retry
          </button>
        </section>
        <RoundtableHomepageVideoRail sessionId={sessionId} participantId={guestId} />
      </div>
    );
  }

  const canJoinSeat = !currentMember && !isRoomFull;
  const seatOptions = Array.from({ length: snapshot.session.max_seats }, (_, index) => index + 1);

  return (
    <div className="roundtable-shell">
      <section className="roundtable-hero">
        <p className="roundtable-kicker">Roundtable room</p>
        <h1>{snapshot.topic.title}</h1>
        <p>{snapshot.topic.description ?? "No topic description."}</p>
      </section>

      <form
        className="roundtable-controls"
        onSubmit={(event) => {
          event.preventDefault();
          if (currentMember) return;
          void handleJoin();
        }}
      >
        <label>
          Display name
          <input
            value={currentMember?.display_name ?? displayName}
            onChange={(event) => {
              if (currentMember) return;
              setDisplayNameState(event.target.value);
            }}
            placeholder="Your name"
            disabled={Boolean(currentMember)}
          />
        </label>
        <label>
          Seat
          <select
            value={seatChoice}
            onChange={(event) => {
              if (currentMember) return;
              const value = event.target.value;
              setSeatChoice(value === "auto" ? "auto" : Number(value));
            }}
            disabled={Boolean(currentMember)}
          >
            <option value="auto">Auto seat</option>
            {seatOptions.map((seatNo) => (
              <option key={seatNo} value={seatNo}>
                Seat {seatNo}
              </option>
            ))}
          </select>
        </label>
        {!currentMember ? (
          <button
            type="submit"
            className="roundtable-cta"
            disabled={busyAction === "join" || !displayName.trim().length || !canJoinSeat}
          >
            {busyAction === "join" ? "Joining..." : "Join seat"}
          </button>
        ) : (
          <>
            <button type="button" className="roundtable-ghost-btn" disabled={busyAction === "leave"} onClick={() => void handleLeave()}>
              Leave seat
            </button>
          </>
        )}
        {canManageMembers ? (
          <button
            type="button"
            className="roundtable-ghost-btn"
            disabled={busyAction === "reset-seats"}
            onClick={() => void handleResetSeats()}
          >
            {busyAction === "reset-seats" ? "Clearing..." : "Clear all seats"}
          </button>
        ) : null}
      </form>
      {currentMember ? (
        <p className="roundtable-muted">
          Joined as <strong>{currentMember.display_name}</strong> on seat {currentMember.seat_no}. Leave seat to rejoin with a different name.
        </p>
      ) : null}

      {!currentMember && isRoomFull ? (
        <p className="roundtable-error">
          Room is full. Only {maxSeats} people can join this roundtable.
        </p>
      ) : null}

      {actionError ? <p className="roundtable-error">{actionError}</p> : null}
      {micError ? <p className="roundtable-error">{micError}</p> : null}

      <section className="roundtable-panel roundtable-live-compose" aria-label="Live voice controls">
        <h4>Live voice</h4>
        {currentMember ? (
          <>
            <p className="roundtable-muted">Anyone seated can speak anytime.</p>
            <div className="roundtable-voice-controls">
              <button
                type="button"
                className="roundtable-cta"
                onClick={() => {
                  if (isMyMicMuted) {
                    void enableMic();
                    return;
                  }
                  if (mediaStreamRef.current) {
                    for (const track of mediaStreamRef.current.getAudioTracks()) {
                      track.enabled = false;
                    }
                  }
                  setIsMyMicMuted(true);
                }}
              >
                {isMyMicMuted ? "Unmute mic" : "Mute mic"}
              </button>
            </div>
          </>
        ) : (
          <p className="roundtable-muted">Join a seat to unlock mic controls.</p>
        )}
      </section>

      <RoundtableSeatCircle
        seats={seats}
        flareToken={wheelFlareToken}
        eyeTargetSeatNo={silentSeatTarget.seatNo}
        activeSpeakerSeatNo={activeSpeakerSeatNo}
        canToggleMyMic={Boolean(currentMember)}
        isMyMicMuted={isMyMicMuted}
        onToggleMyMic={() => {
          if (isMyMicMuted) {
            void enableMic();
            return;
          }
          if (mediaStreamRef.current) {
            for (const track of mediaStreamRef.current.getAudioTracks()) {
              track.enabled = false;
            }
          }
          setIsMyMicMuted(true);
        }}
      />
      <section className="roundtable-panel" aria-label="Current room participants">
        <h4>Current room participants</h4>
        {!joinedMembers.length ? <p className="roundtable-muted">No one is currently seated.</p> : null}
        <div className="roundtable-score-list">
          {joinedMembers.map((member) => {
            const removeBusy = busyAction === `remove-member-${member.id}`;
            return (
              <div key={member.id} className="roundtable-score-item">
                <div>
                  <strong>{member.display_name}</strong>
                  <p>Seat {member.seat_no} · Joined</p>
                </div>
                {canManageMembers ? (
                  <button
                    type="button"
                    className="roundtable-ghost-btn"
                    disabled={removeBusy}
                    onClick={() => void handleRemoveMember(member.id, member.display_name)}
                  >
                    {removeBusy ? "Removing..." : "Remove"}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="roundtable-panel" aria-label="Weekly top contributors in this page">
        <h4>Weekly top contributors</h4>
        <p className="roundtable-muted">This list is across all roundtables in the last 7 days.</p>
        {!weeklyContributors.length ? <p className="roundtable-muted">Leaderboard is empty right now.</p> : null}
        <div className="roundtable-score-list">
          {weeklyContributors.map((entry, index) => (
            <div key={`${entry.member_id}-${index}`} className="roundtable-score-item">
              <div>
                <strong>#{index + 1} {entry.display_name}</strong>
                <p>
                  Turns {entry.approved_turns} · Upvotes {entry.upvotes_received}
                </p>
              </div>
              <span>{entry.points}</span>
            </div>
          ))}
        </div>
      </section>
      <RoundtableHomepageVideoRail sessionId={sessionId} participantId={currentMember?.id ?? guestId} />
    </div>
  );
}
