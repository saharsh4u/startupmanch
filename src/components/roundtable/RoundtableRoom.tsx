"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RoundtableHomepageVideoRail from "@/components/roundtable/RoundtableHomepageVideoRail";
import RoundtableSeatCircle, { type RoundtableSeatViewModel } from "@/components/roundtable/RoundtableSeatCircle";
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
  const memberStorageKey = useMemo(() => `rt_member_${sessionId}`, [sessionId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(memberStorageKey);
    if (stored) {
      setSelfMemberId(stored);
    }
  }, [memberStorageKey]);

  useEffect(() => {
    if (!snapshot || !selfMemberId) return;
    const stillJoined = snapshot.members.some((member) => member.state === "joined" && member.id === selfMemberId);
    if (stillJoined) return;
    setSelfMemberId(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(memberStorageKey);
    }
  }, [memberStorageKey, selfMemberId, snapshot]);

  const currentMember = useMemo(() => {
    if (!snapshot) return null;
    return (
      snapshot.members.find(
        (member) =>
          member.state === "joined" &&
          ((selfMemberId && member.id === selfMemberId) || (guestId && member.guest_id === guestId))
      ) ?? null
    );
  }, [guestId, selfMemberId, snapshot]);

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

    const payload = await callApi(`/api/roundtable/sessions/${sessionId}/join`, {
      seat_no: seatChoice === "auto" ? undefined : seatChoice,
    }, "join");

    if (payload?.member_id) {
      setSelfMemberId(payload.member_id);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(memberStorageKey, payload.member_id);
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
            <button type="button" className="roundtable-ghost-btn" disabled={busyAction === "leave"} onClick={() => void handleLeave()}>
              Leave seat
            </button>
          </>
        )}
      </section>

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
      <RoundtableHomepageVideoRail />
    </div>
  );
}
