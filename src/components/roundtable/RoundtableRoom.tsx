"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useSearchParams } from "next/navigation";
import RoundtableHomepageVideoRail from "@/components/roundtable/RoundtableHomepageVideoRail";
import RoundtableSeatCircle, { type RoundtableSeatViewModel } from "@/components/roundtable/RoundtableSeatCircle";
import { ensureGuestId, getDisplayName, setDisplayName } from "@/lib/roundtable/client-identity";
import type { JoinAnyResponse, RoundtableInviteContext, RoundtableSessionSnapshot } from "@/lib/roundtable/types";
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
  session_id?: string | null;
  turn_id?: string;
  seats_cleared?: number;
};

type ApiCallResult<T extends { error?: string; code?: string }> = {
  ok: boolean;
  payload: T | null;
  status: number;
  message: string;
};

type VoiceSignalPayload = {
  sender_id: string;
  target_id?: string | null;
  kind: "presence" | "offer" | "answer" | "ice" | "leave";
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

const VOICE_ICE_SERVERS: RTCIceServer[] = [
  {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
    ],
  },
  {
    urls: [
      "stun:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:80?transport=udp",
      "turn:openrelay.metered.ca:80?transport=tcp",
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443?transport=udp",
      "turn:openrelay.metered.ca:443?transport=tcp",
      "turn:openrelay.metered.ca:443",
      "turns:openrelay.metered.ca:443?transport=tcp",
      "turns:openrelay.metered.ca:443",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

const mapMicError = (errorValue: unknown) => {
  const fallback = "Could not access microphone.";
  if (!(errorValue instanceof Error)) return fallback;

  if (errorValue.name === "NotAllowedError" || /permission denied/i.test(errorValue.message)) {
    return "Microphone request was denied by browser or OS. If mic is already allowed, close other apps using mic, reload this page, and tap Unmute again.";
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
    case "already_joined":
      return "Leave your current roundtable seat before joining another room.";
    case "no_open_rooms":
      return "No open roundtables are available right now.";
    default:
      return payload.error ?? fallback;
  }
};

const copyText = async (value: string) => {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard is unavailable.");
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Clipboard is unavailable.");
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
  const searchParams = useSearchParams();
  const [snapshot, setSnapshot] = useState<RoundtableSessionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  const [joinAnyError, setJoinAnyError] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<{ seatNo: number; message: string } | null>(null);
  const [displayName, setDisplayNameState] = useState(() => getDisplayName());
  const [seatChoice, setSeatChoice] = useState<number | "auto">("auto");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [isMyMicMuted, setIsMyMicMuted] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);
  const [selfMemberId, setSelfMemberId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [remoteAudioStreams, setRemoteAudioStreams] = useState<Record<string, MediaStream>>({});
  const [needsRemoteAudioUnlock, setNeedsRemoteAudioUnlock] = useState(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioElementMapRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const voiceChannelRef = useRef<RealtimeChannel | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const peerAudioSendersRef = useRef<Map<string, RTCRtpSender>>(new Map());
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const peerReconnectAttemptsRef = useRef<Map<string, number>>(new Map());
  const joinedMemberIdSetRef = useRef<Set<string>>(new Set());
  const autoMicPermissionPromptedMemberRef = useRef<string | null>(null);
  const lastVoiceRecoveryAtRef = useRef(0);
  const invitePrefillKeyRef = useRef<string | null>(null);
  const inviteAutoJoinKeyRef = useRef<string | null>(null);

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
  const inviteContext = useMemo<RoundtableInviteContext>(() => {
    const sourceValue = searchParams.get("source");
    const source = sourceValue === "invite" || sourceValue === "join-any" ? sourceValue : null;
    const seatValue = Number(searchParams.get("seat"));
    const preferred_seat_no = Number.isInteger(seatValue) && seatValue >= 1 ? seatValue : null;
    const inviterValue = searchParams.get("inviter")?.trim() ?? "";

    return {
      source,
      preferred_seat_no,
      inviter_member_id: inviterValue.length ? inviterValue : null,
    };
  }, [searchParams]);

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

  const viewerJoinedSessionId = snapshot?.viewer_joined_session_id ?? null;
  const isViewerSeatedElsewhere = Boolean(viewerJoinedSessionId && viewerJoinedSessionId !== sessionId);
  const preferredInviteSeatNo = useMemo(() => {
    if (!snapshot) return inviteContext.preferred_seat_no;
    const preferredSeatNo = inviteContext.preferred_seat_no;
    if (!preferredSeatNo) return null;
    return preferredSeatNo >= 1 && preferredSeatNo <= snapshot.session.max_seats ? preferredSeatNo : null;
  }, [inviteContext.preferred_seat_no, snapshot]);

  const persistMemberId = useCallback((memberId: string, targetSessionId = sessionId) => {
    if (targetSessionId === sessionId) {
      setSelfMemberId(memberId);
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`rt_member_${targetSessionId}`, memberId);
    }
  }, [sessionId]);

  const clearPersistedMemberId = useCallback((targetSessionId = sessionId) => {
    if (targetSessionId === sessionId) {
      setSelfMemberId(null);
    }
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(`rt_member_${targetSessionId}`);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!shareFeedback) return;
    const timer = window.setTimeout(() => {
      setShareFeedback(null);
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [shareFeedback]);

  useEffect(() => {
    if (currentMember) {
      setJoinAnyError(null);
    }
  }, [currentMember]);

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
        canShareInvite: Boolean(currentMember && isEmpty),
        shareStatus: shareFeedback?.seatNo === seatNo ? shareFeedback.message : null,
      };
    });
  }, [currentMember, isMyMicMuted, shareFeedback, snapshot]);

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

  const currentParticipantId = currentMember?.id ?? null;

  const attemptPlayRemoteAudioElements = useCallback(async () => {
    const elements = Array.from(remoteAudioElementMapRef.current.values());
    if (!elements.length) {
      setNeedsRemoteAudioUnlock(false);
      return;
    }

    let blockedByPolicy = false;
    for (const element of elements) {
      element.autoplay = true;
      element.setAttribute("playsinline", "true");
      element.setAttribute("webkit-playsinline", "true");
      element.muted = false;
      element.volume = 1;
      try {
        await element.play();
      } catch {
        // iOS/Chrome mobile can block remote audio until a user gesture.
        blockedByPolicy = true;
      }
    }
    setNeedsRemoteAudioUnlock(blockedByPolicy);
  }, []);

  const setRemoteStreamForMember = useCallback((memberId: string, stream: MediaStream) => {
    setRemoteAudioStreams((current) => {
      if (current[memberId] === stream) return current;
      return {
        ...current,
        [memberId]: stream,
      };
    });
  }, []);

  const removeRemoteStreamForMember = useCallback((memberId: string) => {
    setRemoteAudioStreams((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, memberId)) return current;
      const next = { ...current };
      delete next[memberId];
      return next;
    });
  }, []);

  const closePeerConnectionForMember = useCallback((memberId: string) => {
    const peer = peerConnectionsRef.current.get(memberId);
    if (peer) {
      peer.onicecandidate = null;
      peer.ontrack = null;
      peer.onconnectionstatechange = null;
      peer.close();
    }

    peerConnectionsRef.current.delete(memberId);
    peerAudioSendersRef.current.delete(memberId);
    pendingIceCandidatesRef.current.delete(memberId);
    peerReconnectAttemptsRef.current.delete(memberId);
    removeRemoteStreamForMember(memberId);
  }, [removeRemoteStreamForMember]);

  const closeAllPeerConnections = useCallback(() => {
    for (const memberId of Array.from(peerConnectionsRef.current.keys())) {
      closePeerConnectionForMember(memberId);
    }
    remoteAudioElementMapRef.current.clear();
    setRemoteAudioStreams({});
  }, [closePeerConnectionForMember]);

  const flushPendingIceCandidates = useCallback(async (memberId: string, peer: RTCPeerConnection) => {
    const queued = pendingIceCandidatesRef.current.get(memberId) ?? [];
    if (!queued.length) return;
    pendingIceCandidatesRef.current.delete(memberId);

    for (const candidate of queued) {
      try {
        await peer.addIceCandidate(candidate);
      } catch {
        // Ignore malformed/stale candidates and continue.
      }
    }
  }, []);

  const syncLocalAudioTrackToPeers = useCallback(async () => {
    const localTrack = mediaStreamRef.current?.getAudioTracks()[0] ?? null;
    for (const sender of peerAudioSendersRef.current.values()) {
      try {
        await sender.replaceTrack(localTrack);
      } catch {
        // Peer could be reconnecting; next signaling cycle will resync track.
      }
    }
  }, []);

  const sendVoiceSignal = useCallback((payload: Omit<VoiceSignalPayload, "sender_id">) => {
    const channel = voiceChannelRef.current;
    if (!channel || !currentParticipantId) return;
    void channel.send({
      type: "broadcast",
      event: "voice-signal",
      payload: {
        ...payload,
        sender_id: currentParticipantId,
      } satisfies VoiceSignalPayload,
    });
  }, [currentParticipantId]);

  const getOrCreatePeerConnection = useCallback((remoteMemberId: string) => {
    const existing = peerConnectionsRef.current.get(remoteMemberId);
    if (existing) return existing;

    const peer = new RTCPeerConnection({
      iceServers: VOICE_ICE_SERVERS,
      iceCandidatePoolSize: 4,
    });

    const transceiver = peer.addTransceiver("audio", { direction: "sendrecv" });
    peerAudioSendersRef.current.set(remoteMemberId, transceiver.sender);

    const localTrack = mediaStreamRef.current?.getAudioTracks()[0] ?? null;
    void transceiver.sender.replaceTrack(localTrack).catch(() => {
      // Track will be attached on the next mic state sync.
    });

    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      sendVoiceSignal({
        kind: "ice",
        target_id: remoteMemberId,
        candidate: event.candidate.toJSON(),
      });
    };

    peer.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) {
        setRemoteStreamForMember(remoteMemberId, stream);
        return;
      }
      setRemoteStreamForMember(remoteMemberId, new MediaStream([event.track]));
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        peerReconnectAttemptsRef.current.set(remoteMemberId, 0);
        return;
      }

      if (peer.connectionState === "disconnected" || peer.connectionState === "failed") {
        const retries = peerReconnectAttemptsRef.current.get(remoteMemberId) ?? 0;
        if (retries < 2 && peer.signalingState === "stable") {
          peerReconnectAttemptsRef.current.set(remoteMemberId, retries + 1);
          void (async () => {
            try {
              const restartOffer = await peer.createOffer({ iceRestart: true });
              await peer.setLocalDescription(restartOffer);
              sendVoiceSignal({
                kind: "offer",
                target_id: remoteMemberId,
                sdp: peer.localDescription ?? restartOffer,
              });
            } catch {
              // Allow next presence heartbeat to retry signaling.
            }
          })();
        }

        if (peer.connectionState === "failed" && retries >= 2) {
          closePeerConnectionForMember(remoteMemberId);
        }
        return;
      }

      if (peer.connectionState === "closed") {
        closePeerConnectionForMember(remoteMemberId);
      }
    };

    peerConnectionsRef.current.set(remoteMemberId, peer);
    return peer;
  }, [closePeerConnectionForMember, sendVoiceSignal, setRemoteStreamForMember]);

  const createAndSendOffer = useCallback(async (remoteMemberId: string) => {
    const peer = getOrCreatePeerConnection(remoteMemberId);
    if (peer.signalingState !== "stable") return;

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    sendVoiceSignal({
      kind: "offer",
      target_id: remoteMemberId,
      sdp: peer.localDescription ?? offer,
    });
  }, [getOrCreatePeerConnection, sendVoiceSignal]);

  useEffect(() => {
    joinedMemberIdSetRef.current = new Set(joinedMembers.map((member) => member.id));
  }, [joinedMembers]);

  const handleVoiceSignal = useCallback(async (signal: VoiceSignalPayload) => {
    const senderId = signal.sender_id?.trim();
    if (!senderId || !currentParticipantId || senderId === currentParticipantId) return;
    if (signal.target_id && signal.target_id !== currentParticipantId) return;

    const joinedSet = joinedMemberIdSetRef.current;
    if (!joinedSet.has(senderId) && signal.kind !== "leave") {
      closePeerConnectionForMember(senderId);
      return;
    }

    try {
      if (signal.kind === "leave") {
        closePeerConnectionForMember(senderId);
        return;
      }

      if (signal.kind === "presence") {
        // Lower member id starts the offer to avoid glare.
        if (currentParticipantId.localeCompare(senderId) < 0) {
          await createAndSendOffer(senderId);
        }
        return;
      }

      if (signal.kind === "offer" && signal.sdp) {
        const peer = getOrCreatePeerConnection(senderId);
        await peer.setRemoteDescription(signal.sdp);
        await flushPendingIceCandidates(senderId, peer);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        sendVoiceSignal({
          kind: "answer",
          target_id: senderId,
          sdp: peer.localDescription ?? answer,
        });
        return;
      }

      if (signal.kind === "answer" && signal.sdp) {
        const peer = peerConnectionsRef.current.get(senderId);
        if (!peer) return;
        await peer.setRemoteDescription(signal.sdp);
        await flushPendingIceCandidates(senderId, peer);
        return;
      }

      if (signal.kind === "ice" && signal.candidate) {
        const peer = peerConnectionsRef.current.get(senderId);
        if (!peer) {
          const queue = pendingIceCandidatesRef.current.get(senderId) ?? [];
          queue.push(signal.candidate);
          pendingIceCandidatesRef.current.set(senderId, queue);
          return;
        }
        if (!peer.remoteDescription) {
          const queue = pendingIceCandidatesRef.current.get(senderId) ?? [];
          queue.push(signal.candidate);
          pendingIceCandidatesRef.current.set(senderId, queue);
          return;
        }
        await peer.addIceCandidate(signal.candidate);
      }
    } catch {
      closePeerConnectionForMember(senderId);
    }
  }, [
    closePeerConnectionForMember,
    createAndSendOffer,
    currentParticipantId,
    flushPendingIceCandidates,
    getOrCreatePeerConnection,
    sendVoiceSignal,
  ]);

  useEffect(() => {
    if (!hasBrowserSupabaseEnv || !currentParticipantId) return;

    const channel = supabaseBrowser
      .channel(`roundtable-voice-${sessionId}`)
      .on("broadcast", { event: "voice-signal" }, ({ payload }) => {
        void handleVoiceSignal(payload as VoiceSignalPayload);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          sendVoiceSignal({ kind: "presence" });
        }
      });

    voiceChannelRef.current = channel;
    const heartbeat = window.setInterval(() => {
      sendVoiceSignal({ kind: "presence" });
    }, 8000);

    return () => {
      window.clearInterval(heartbeat);
      sendVoiceSignal({ kind: "leave" });
      voiceChannelRef.current = null;
      void supabaseBrowser.removeChannel(channel);
      closeAllPeerConnections();
    };
  }, [closeAllPeerConnections, currentParticipantId, handleVoiceSignal, sendVoiceSignal, sessionId]);

  useEffect(() => {
    if (!currentParticipantId) {
      closeAllPeerConnections();
      return;
    }

    const joinedSet = new Set(joinedMembers.map((member) => member.id));
    for (const remoteId of Array.from(peerConnectionsRef.current.keys())) {
      if (!joinedSet.has(remoteId) || remoteId === currentParticipantId) {
        closePeerConnectionForMember(remoteId);
      }
    }

    // Prompt peers to establish/refresh voice links when room membership changes.
    sendVoiceSignal({ kind: "presence" });
  }, [
    closeAllPeerConnections,
    closePeerConnectionForMember,
    currentParticipantId,
    joinedMembers,
    sendVoiceSignal,
  ]);

  useEffect(() => {
    if (!currentParticipantId) return;

    const timer = window.setInterval(() => {
      const remoteJoinedIds = joinedMembers
        .map((member) => member.id)
        .filter((memberId) => memberId !== currentParticipantId);
      if (!remoteJoinedIds.length) return;

      const hasAtLeastOneRemoteStream = Object.keys(remoteAudioStreams).length > 0;
      if (hasAtLeastOneRemoteStream) return;

      const now = Date.now();
      if (now - lastVoiceRecoveryAtRef.current < 6000) return;
      lastVoiceRecoveryAtRef.current = now;

      sendVoiceSignal({ kind: "presence" });
      for (const remoteId of remoteJoinedIds) {
        if (currentParticipantId.localeCompare(remoteId) < 0) {
          void createAndSendOffer(remoteId).catch(() => {
            // Recovery is best-effort; next interval retries.
          });
        }
      }
    }, 3000);

    return () => window.clearInterval(timer);
  }, [createAndSendOffer, currentParticipantId, joinedMembers, remoteAudioStreams, sendVoiceSignal]);

  useEffect(() => {
    if (!Object.keys(remoteAudioStreams).length) {
      setNeedsRemoteAudioUnlock(false);
      return;
    }
    void attemptPlayRemoteAudioElements();
  }, [attemptPlayRemoteAudioElements, remoteAudioStreams]);

  useEffect(() => {
    const unlock = () => {
      void attemptPlayRemoteAudioElements();
    };
    window.addEventListener("touchstart", unlock, { passive: true });
    window.addEventListener("click", unlock);
    return () => {
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("click", unlock);
    };
  }, [attemptPlayRemoteAudioElements]);

  const stopMicStream = useCallback(() => {
    if (!mediaStreamRef.current) return;
    for (const track of mediaStreamRef.current.getTracks()) {
      track.stop();
    }
    mediaStreamRef.current = null;
    void syncLocalAudioTrackToPeers();
    setIsMyMicMuted(true);
  }, [syncLocalAudioTrackToPeers]);

  const muteMic = useCallback(() => {
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getAudioTracks()) {
        track.enabled = false;
      }
    }
    void syncLocalAudioTrackToPeers();
    setIsMyMicMuted(true);
  }, [syncLocalAudioTrackToPeers]);

  const enableMic = useCallback(async () => {
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

      let stream = mediaStreamRef.current;
      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
        } catch (constraintError) {
          const shouldRetryWithBasicAudio =
            constraintError instanceof DOMException && constraintError.name === "OverconstrainedError";
          if (!shouldRetryWithBasicAudio) {
            throw constraintError;
          }
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        mediaStreamRef.current = stream;
      }
      for (const track of stream.getAudioTracks()) {
        track.enabled = true;
      }
      await syncLocalAudioTrackToPeers();
      // iOS Safari can fail to propagate null->live sender track changes without a renegotiation.
      for (const remoteMemberId of Array.from(peerConnectionsRef.current.keys())) {
        try {
          await createAndSendOffer(remoteMemberId);
        } catch {
          // Best-effort renegotiation; presence heartbeats will retry voice setup.
        }
      }
      void attemptPlayRemoteAudioElements();
      setMicError(null);
      setIsMyMicMuted(false);
    } catch (errorValue) {
      const message = mapMicError(errorValue);
      setMicError(message);
      setIsMyMicMuted(true);
    }
  }, [attemptPlayRemoteAudioElements, createAndSendOffer, syncLocalAudioTrackToPeers]);

  useEffect(() => {
    const memberId = currentMember?.id ?? null;
    if (!memberId) {
      autoMicPermissionPromptedMemberRef.current = null;
      return;
    }
    if (autoMicPermissionPromptedMemberRef.current === memberId) return;

    autoMicPermissionPromptedMemberRef.current = memberId;
    void attemptPlayRemoteAudioElements();
    void enableMic();
  }, [attemptPlayRemoteAudioElements, currentMember?.id, enableMic]);

  useEffect(() => {
    return () => {
      stopMicStream();
    };
  }, [stopMicStream]);

  const callApi = useCallback(async function callApi<T extends { error?: string; code?: string } = ActionResponse>(
    path: string,
    body: Record<string, unknown>,
    busyKey: string,
    options?: { refreshOnSuccess?: boolean }
  ): Promise<ApiCallResult<T>> {
    if (!guestId) {
      return {
        ok: false,
        payload: null,
        status: 0,
        message: "Unable to initialize guest identity.",
      };
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

      const payload = (await response.json()) as T;
      if (!response.ok) {
        return {
          ok: false,
          payload,
          status: response.status,
          message: mapActionError(payload as ActionResponse, "Action failed."),
        };
      }

      if (options?.refreshOnSuccess !== false) {
        await loadSnapshot();
      }

      return {
        ok: true,
        payload,
        status: response.status,
        message: "",
      };
    } catch (actionErrorValue) {
      return {
        ok: false,
        payload: null,
        status: 0,
        message: actionErrorValue instanceof Error ? actionErrorValue.message : "Action failed.",
      };
    } finally {
      setBusyAction(null);
    }
  }, [displayName, guestId, loadSnapshot]);

  const handleShareSeat = useCallback(async (seatNo: number) => {
    if (!currentMember || typeof window === "undefined") return;

    const inviteUrl = new URL(`/roundtable/${sessionId}`, window.location.origin);
    inviteUrl.searchParams.set("seat", String(seatNo));
    inviteUrl.searchParams.set("inviter", currentMember.id);
    inviteUrl.searchParams.set("source", "invite");

    let feedbackMessage = "Link copied";
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title: `${snapshot?.topic.title ?? "StartupManch"} roundtable invite`,
          text: `Join me in ${snapshot?.topic.title ?? "this"} roundtable.`,
          url: inviteUrl.toString(),
        });
        feedbackMessage = "Invite shared";
      } else {
        await copyText(inviteUrl.toString());
      }
    } catch (shareErrorValue) {
      if (shareErrorValue instanceof DOMException && shareErrorValue.name === "AbortError") {
        return;
      }

      try {
        await copyText(inviteUrl.toString());
      } catch {
        setShareFeedback({ seatNo, message: "Copy failed" });
        return;
      }
    }

    setShareFeedback({ seatNo, message: feedbackMessage });

    void fetch(`/api/roundtable/sessions/${sessionId}/share-seat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(guestId ? { "x-roundtable-guest-id": guestId } : {}),
      },
      body: JSON.stringify({
        seat_no: seatNo,
        inviter_member_id: currentMember.id,
        source: "invite",
      }),
    }).catch(() => {
      // Share logging is best-effort only.
    });
  }, [currentMember, guestId, sessionId, snapshot?.topic.title]);

  const handleJoinWithSeatPreference = useCallback(async (
    preferredSeatNo: number | null,
    fallbackToAuto: boolean
  ) => {
    let usedFallback = false;
    let result = await callApi<ActionResponse>(
      `/api/roundtable/sessions/${sessionId}/join`,
      { seat_no: preferredSeatNo ?? undefined },
      "join"
    );

    if (!result.ok && fallbackToAuto && result.payload?.code === "seat_taken_retry_exhausted") {
      usedFallback = true;
      result = await callApi<ActionResponse>(
        `/api/roundtable/sessions/${sessionId}/join`,
        { seat_no: undefined },
        "join"
      );
    }

    if (!result.ok) {
      setActionError(result.message);
      if (usedFallback && preferredSeatNo) {
        if (result.payload?.code === "room_full" || result.payload?.code === "session_closed") {
          setInviteFeedback("That shared seat filled up before you joined, and no other seat is available right now.");
        } else {
          setInviteFeedback("That shared seat could not be claimed. Try joining the next open seat.");
        }
      }
      return result;
    }

    const memberId = result.payload?.member_id;
    if (!memberId) {
      setActionError("Unable to join this seat.");
      return {
        ok: false,
        payload: result.payload,
        status: result.status,
        message: "Unable to join this seat.",
      } satisfies ApiCallResult<ActionResponse>;
    }

    persistMemberId(memberId);
    setActionError(null);
    if (usedFallback && preferredSeatNo) {
      const matchedSeatNo = result.payload?.seat_no;
      setInviteFeedback(
        matchedSeatNo
          ? `Seat ${preferredSeatNo} was taken, so you were placed in seat ${matchedSeatNo}.`
          : `Seat ${preferredSeatNo} was taken, so you were matched to the next open seat.`
      );
    } else {
      setInviteFeedback(null);
    }
    autoMicPermissionPromptedMemberRef.current = memberId;
    void attemptPlayRemoteAudioElements();
    await enableMic();
    return result;
  }, [attemptPlayRemoteAudioElements, callApi, enableMic, persistMemberId, sessionId]);

  const handleJoin = useCallback(async () => {
    if (!displayName.trim().length) {
      setActionError("Display name is required.");
      return;
    }

    setJoinAnyError(null);
    const selectedSeatNo = seatChoice === "auto" ? null : seatChoice;
    const shouldFallbackFromInvite =
      inviteContext.source === "invite" &&
      preferredInviteSeatNo !== null &&
      selectedSeatNo === preferredInviteSeatNo;

    await handleJoinWithSeatPreference(selectedSeatNo, shouldFallbackFromInvite);
  }, [displayName, handleJoinWithSeatPreference, inviteContext.source, preferredInviteSeatNo, seatChoice]);

  const handleJoinAny = useCallback(async () => {
    if (!displayName.trim().length) {
      setJoinAnyError("Display name is required before using Join Any.");
      return;
    }

    if (isViewerSeatedElsewhere) {
      setJoinAnyError("Leave your current roundtable seat before joining another room.");
      return;
    }

    setJoinAnyError(null);
    const result = await callApi<JoinAnyResponse>("/api/roundtable/join-any", {}, "join-any", {
      refreshOnSuccess: false,
    });

    if (!result.ok) {
      setJoinAnyError(result.message);
      return;
    }

    const targetSessionId = result.payload?.session_id ?? null;
    const memberId = result.payload?.member_id ?? null;
    if (!targetSessionId || !memberId) {
      setJoinAnyError("Unable to join a roundtable right now.");
      return;
    }

    persistMemberId(memberId, targetSessionId);
    if (typeof window !== "undefined") {
      window.location.assign(`/roundtable/${targetSessionId}?source=join-any`);
    }
  }, [callApi, displayName, isViewerSeatedElsewhere, persistMemberId]);

  const handleLeave = useCallback(async () => {
    const result = await callApi<ActionResponse>(`/api/roundtable/sessions/${sessionId}/leave`, {}, "leave");
    if (!result.ok) {
      setActionError(result.message);
      return;
    }

    if (result.payload?.ok) {
      stopMicStream();
      clearPersistedMemberId();
    }
  }, [callApi, clearPersistedMemberId, sessionId, stopMicStream]);

  const handleResetSeats = useCallback(async () => {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Clear all currently occupied seats in this room?");
      if (!confirmed) return;
    }

    const result = await callApi<ActionResponse>(`/api/roundtable/sessions/${sessionId}/reset-seats`, {}, "reset-seats");
    if (!result.ok) {
      setActionError(result.message);
      return;
    }

    if (result.payload?.ok) {
      stopMicStream();
      clearPersistedMemberId();
    }
  }, [callApi, clearPersistedMemberId, sessionId, stopMicStream]);

  useEffect(() => {
    if (inviteContext.source !== "invite") {
      invitePrefillKeyRef.current = null;
      inviteAutoJoinKeyRef.current = null;
      setInviteFeedback(null);
      return;
    }

    if (!preferredInviteSeatNo || currentMember) return;

    const prefillKey = `${sessionId}:${preferredInviteSeatNo}`;
    if (invitePrefillKeyRef.current === prefillKey) return;
    invitePrefillKeyRef.current = prefillKey;
    setSeatChoice(preferredInviteSeatNo);
  }, [currentMember, inviteContext.source, preferredInviteSeatNo, sessionId]);

  useEffect(() => {
    if (inviteContext.source !== "invite") return;
    if (!snapshot || currentMember || !preferredInviteSeatNo) return;
    if (!displayName.trim().length) return;
    if (isViewerSeatedElsewhere) return;

    const attemptKey = `${sessionId}:${preferredInviteSeatNo}:${displayName.trim()}:${viewerJoinedSessionId ?? "none"}`;
    if (inviteAutoJoinKeyRef.current === attemptKey) return;
    inviteAutoJoinKeyRef.current = attemptKey;

    void handleJoinWithSeatPreference(preferredInviteSeatNo, true);
  }, [
    currentMember,
    displayName,
    handleJoinWithSeatPreference,
    inviteContext.source,
    isViewerSeatedElsewhere,
    preferredInviteSeatNo,
    sessionId,
    snapshot,
    viewerJoinedSessionId,
  ]);

  const inviteNotice = useMemo(() => {
    if (inviteContext.source !== "invite" || currentMember) {
      return null;
    }
    if (inviteFeedback) {
      return inviteFeedback;
    }
    if (isViewerSeatedElsewhere) {
      return "Leave your current roundtable seat before using this invite.";
    }
    if (!preferredInviteSeatNo) {
      return "This invite opened the same room. Pick any open seat to join.";
    }
    if (!displayName.trim().length) {
      return `Seat ${preferredInviteSeatNo} is selected from the invite. Add your name and tap Join seat.`;
    }
    return null;
  }, [
    currentMember,
    displayName,
    inviteContext.source,
    inviteFeedback,
    isViewerSeatedElsewhere,
    preferredInviteSeatNo,
  ]);

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
      {inviteNotice ? <p className="roundtable-muted roundtable-invite-note">{inviteNotice}</p> : null}

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
                    void attemptPlayRemoteAudioElements();
                    void enableMic();
                    return;
                  }
                  muteMic();
                }}
              >
                {isMyMicMuted ? "Unmute mic" : "Mute mic"}
              </button>
              {needsRemoteAudioUnlock && Object.keys(remoteAudioStreams).length ? (
                <button
                  type="button"
                  className="roundtable-ghost-btn"
                  onClick={() => {
                    void attemptPlayRemoteAudioElements();
                  }}
                >
                  Enable speaker audio
                </button>
              ) : null}
            </div>
            {needsRemoteAudioUnlock && Object.keys(remoteAudioStreams).length ? (
              <p className="roundtable-muted">
                Browser blocked speaker playback. Tap Enable speaker audio once to hear others.
              </p>
            ) : null}
          </>
        ) : (
          <p className="roundtable-muted">Join a seat to unlock mic controls.</p>
        )}
      </section>

      {!currentMember ? (
        <section className="roundtable-panel roundtable-match-panel" aria-label="Join any roundtable">
          <div className="roundtable-match-copy">
            <span className="roundtable-match-kicker">Fast match</span>
            <strong>Join Any</strong>
            <p>We will place you in the best open public roundtable and take the next free seat.</p>
          </div>
          <div className="roundtable-match-actions">
            <button
              type="button"
              className="roundtable-cta"
              onClick={() => void handleJoinAny()}
              disabled={busyAction === "join-any" || isViewerSeatedElsewhere}
            >
              {busyAction === "join-any" ? "Matching..." : "Join Any"}
            </button>
            {joinAnyError ? <p className="roundtable-error roundtable-match-error">{joinAnyError}</p> : null}
            {!joinAnyError && isViewerSeatedElsewhere ? (
              <p className="roundtable-muted roundtable-match-hint">
                Leave your current roundtable seat before using Join Any.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <RoundtableSeatCircle
        seats={seats}
        flareToken={wheelFlareToken}
        eyeTargetSeatNo={silentSeatTarget.seatNo}
        activeSpeakerSeatNo={activeSpeakerSeatNo}
        canToggleMyMic={Boolean(currentMember)}
        isMyMicMuted={isMyMicMuted}
        onShareSeat={(seatNo) => {
          void handleShareSeat(seatNo);
        }}
        onToggleMyMic={() => {
          if (isMyMicMuted) {
            void attemptPlayRemoteAudioElements();
            void enableMic();
            return;
          }
          muteMic();
        }}
      />
      <div
        style={{
          position: "fixed",
          width: 1,
          height: 1,
          opacity: 0,
          overflow: "hidden",
          pointerEvents: "none",
          left: 0,
          bottom: 0,
        }}
        aria-hidden
      >
        {Object.entries(remoteAudioStreams).map(([memberId, stream]) => (
          <audio
            key={memberId}
            autoPlay
            playsInline
            ref={(element) => {
              if (!element) {
                remoteAudioElementMapRef.current.delete(memberId);
                return;
              }
              remoteAudioElementMapRef.current.set(memberId, element);
              if (element.srcObject !== stream) {
                element.srcObject = stream;
                void attemptPlayRemoteAudioElements();
              }
            }}
          />
        ))}
      </div>
      <RoundtableHomepageVideoRail sessionId={sessionId} participantId={currentMember?.id ?? guestId} />
    </div>
  );
}
