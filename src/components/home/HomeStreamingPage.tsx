"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import RoundtableSeatCircle, { type RoundtableSeatViewModel } from "@/components/roundtable/RoundtableSeatCircle";
import {
  buildHomepageFeedUrl,
  getHomepageRailPitches,
  hasDirectPlayableUpload,
  type FeedResponsePayload,
  type HomepagePitch,
  selectFeaturedHomepagePitch,
  toPlayableHomepagePitches,
} from "@/lib/homepage/pitches";
import type {
  RoundtableLobbyResponse,
  RoundtableSessionSnapshot,
  RoundtableSessionSummary,
} from "@/lib/roundtable/types";

const HERO_FALLBACK_TITLE = "StartupManch TV";
const HERO_FALLBACK_TAGLINE = "A mobile-first home for founder videos, live roundtables, and rolling community stories.";
const ROUNDTABLE_POLL_MS = 20000;

type RoundtablePreviewState = {
  summary: RoundtableSessionSummary | null;
  snapshot: RoundtableSessionSnapshot | null;
  loading: boolean;
  error: string | null;
};

const roundtableFallbackSeats: RoundtableSeatViewModel[] = [
  {
    seatNo: 1,
    memberId: "preview-host",
    displayName: "Host",
    initials: "HO",
    isActive: true,
    isQueued: false,
    isMe: false,
    isEmpty: false,
    stateLabel: "Speaking",
  },
  {
    seatNo: 2,
    memberId: "preview-builder",
    displayName: "Builder",
    initials: "BU",
    isActive: false,
    isQueued: true,
    isMe: false,
    isEmpty: false,
    stateLabel: "Queued",
  },
  {
    seatNo: 3,
    memberId: "preview-ops",
    displayName: "Operator",
    initials: "OP",
    isActive: false,
    isQueued: false,
    isMe: false,
    isEmpty: false,
    stateLabel: "Ready",
  },
  {
    seatNo: 4,
    memberId: "preview-founder",
    displayName: "Founder",
    initials: "FO",
    isActive: false,
    isQueued: false,
    isMe: false,
    isEmpty: false,
    stateLabel: "Ready",
  },
  {
    seatNo: 5,
    memberId: null,
    displayName: "Open seat",
    initials: "OS",
    isActive: false,
    isQueued: false,
    isMe: false,
    isEmpty: true,
    stateLabel: "Available",
  },
];

const toInitials = (displayName: string) => {
  const parts = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
};

const pickPrioritySession = (sessions: RoundtableSessionSummary[]) =>
  sessions.find((session) => session.status === "live") ?? sessions[0] ?? null;

const formatRoundtableStatus = (status: RoundtableSessionSummary["status"] | null) => {
  if (status === "live") return "Live now";
  if (status === "lobby") return "Waiting room";
  return "Preview";
};

function StreamingRailCard({ pitch }: { pitch: HomepagePitch }) {
  const directVideoUrl = pitch.videoMp4Url ?? pitch.video ?? null;
  const hlsUrl = pitch.videoHlsUrl ?? null;
  const hasDirectVideo = hasDirectPlayableUpload(pitch);

  return (
    <article className="stream-home-rail-card" aria-hidden="true">
      <div className="stream-home-rail-media">
        {pitch.poster ? (
          <img
            className="stream-home-rail-poster"
            src={pitch.poster}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="stream-home-rail-poster stream-home-rail-poster-fallback" />
        )}
        {hasDirectVideo ? (
          <video
            className="stream-home-rail-video"
            muted
            playsInline
            autoPlay
            loop
            preload="metadata"
          >
            {hlsUrl ? <source src={hlsUrl} type="application/vnd.apple.mpegurl" /> : null}
            {directVideoUrl ? <source src={directVideoUrl} type="video/mp4" /> : null}
          </video>
        ) : null}
        <div className="stream-home-rail-overlay" />
      </div>
      <div className="stream-home-rail-copy">
        <span className="stream-home-rail-kicker">{pitch.category ?? "Founder Video"}</span>
        <h3>{pitch.name}</h3>
        <p>{pitch.tagline}</p>
      </div>
    </article>
  );
}

export default function HomeStreamingPage() {
  const [pitches, setPitches] = useState<HomepagePitch[]>([]);
  const [pitchLoading, setPitchLoading] = useState(true);
  const [pitchError, setPitchError] = useState<string | null>(null);
  const [roundtableState, setRoundtableState] = useState<RoundtablePreviewState>({
    summary: null,
    snapshot: null,
    loading: true,
    error: null,
  });
  const [isRailPaused, setIsRailPaused] = useState(false);
  const railPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadPitches = async () => {
      try {
        setPitchLoading(true);
        const response = await fetch(buildHomepageFeedUrl(), {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Unable to load featured homepage videos.");
        }

        const payload = (await response.json()) as FeedResponsePayload;
        setPitches(toPlayableHomepagePitches(payload.data ?? []));
        setPitchError(null);
      } catch (errorValue) {
        if (controller.signal.aborted) return;
        setPitches([]);
        setPitchError(
          errorValue instanceof Error ? errorValue.message : "Unable to load featured homepage videos."
        );
      } finally {
        if (!controller.signal.aborted) {
          setPitchLoading(false);
        }
      }
    };

    void loadPitches();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadRoundtablePreview = async () => {
      try {
        setRoundtableState((current) => ({
          ...current,
          loading: true,
        }));

        const lobbyResponse = await fetch("/api/roundtable/lobby", {
          cache: "no-store",
        });
        const lobbyPayload = (await lobbyResponse.json()) as RoundtableLobbyResponse & { error?: string };

        if (!lobbyResponse.ok) {
          throw new Error(lobbyPayload.error ?? "Unable to load roundtable preview.");
        }

        const summary = pickPrioritySession(Array.isArray(lobbyPayload.sessions) ? lobbyPayload.sessions : []);
        if (!summary) {
          if (!cancelled) {
            setRoundtableState({
              summary: null,
              snapshot: null,
              loading: false,
              error: null,
            });
          }
          return;
        }

        const snapshotResponse = await fetch(`/api/roundtable/sessions/${summary.session_id}`, {
          cache: "no-store",
        });
        const snapshotPayload = (await snapshotResponse.json()) as RoundtableSessionSnapshot & { error?: string };

        if (!snapshotResponse.ok) {
          throw new Error(snapshotPayload.error ?? "Unable to load roundtable room.");
        }

        if (!cancelled) {
          setRoundtableState({
            summary,
            snapshot: snapshotPayload,
            loading: false,
            error: null,
          });
        }
      } catch (errorValue) {
        if (cancelled) return;
        setRoundtableState((current) => ({
          summary: current.summary,
          snapshot: current.snapshot,
          loading: false,
          error:
            errorValue instanceof Error ? errorValue.message : "Unable to load roundtable preview.",
        }));
      }
    };

    void loadRoundtablePreview();
    const timer = window.setInterval(() => {
      void loadRoundtablePreview();
    }, ROUNDTABLE_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(
    () => () => {
      if (railPauseTimerRef.current !== null) {
        clearTimeout(railPauseTimerRef.current);
      }
    },
    []
  );

  const featuredPitch = useMemo(() => selectFeaturedHomepagePitch(pitches), [pitches]);
  const railPitches = useMemo(
    () => getHomepageRailPitches(pitches, featuredPitch?.id ?? null),
    [featuredPitch?.id, pitches]
  );

  const heroVideoMp4 = featuredPitch?.videoMp4Url ?? featuredPitch?.video ?? null;
  const heroVideoHls = featuredPitch?.videoHlsUrl ?? null;
  const heroHasDirectVideo = featuredPitch ? hasDirectPlayableUpload(featuredPitch) : false;

  const roundtablePreview = useMemo(() => {
    const snapshot = roundtableState.snapshot;
    const summary = roundtableState.summary;

    if (!snapshot || !summary) {
      return {
        seats: roundtableFallbackSeats,
        activeSpeakerSeatNo: 1,
        eyeTargetSeatNo: 1,
        flareToken: "preview-speaker",
        headline: "The next founder roundtable starts here.",
        description:
          "No room is live yet. This preview shows how the roulette table will look once speakers join.",
        href: "/roundtable",
        statusLabel: "Preview",
        metadata: ["5 seats", "Live queue", "Timed turns"],
        tags: ["startup", "roundtable", "live"],
        helper: "Open the lobby to create or join the next room.",
      };
    }

    const joinedMembers = snapshot.members
      .filter((member) => member.state === "joined")
      .sort((left, right) => left.seat_no - right.seat_no);
    const queuedMemberIds = new Set(snapshot.queue.map((turn) => turn.member_id));
    const activeSpeakerId = snapshot.active_turn?.member_id ?? null;
    const activeSpeakerSeatNo =
      joinedMembers.find((member) => member.id === activeSpeakerId)?.seat_no ?? null;
    const firstQueuedSeatNo =
      joinedMembers.find((member) => queuedMemberIds.has(member.id))?.seat_no ?? null;
    const firstOccupiedSeatNo = joinedMembers[0]?.seat_no ?? 1;

    const seats = Array.from({ length: summary.max_seats }, (_, index) => {
      const seatNo = index + 1;
      const member = joinedMembers.find((candidate) => candidate.seat_no === seatNo) ?? null;
      const isActive = Boolean(member && member.id === activeSpeakerId);
      const isQueued = Boolean(member && queuedMemberIds.has(member.id) && member.id !== activeSpeakerId);
      const isEmpty = !member;

      return {
        seatNo,
        memberId: member?.id ?? null,
        displayName: member?.display_name ?? "Open seat",
        initials: member ? toInitials(member.display_name) : "OS",
        isActive,
        isQueued,
        isMe: false,
        isEmpty,
        stateLabel: isActive ? "Speaking" : isQueued ? "Queued" : member ? "Ready" : "Available",
      } satisfies RoundtableSeatViewModel;
    });

    return {
      seats,
      activeSpeakerSeatNo,
      eyeTargetSeatNo: activeSpeakerSeatNo ?? firstQueuedSeatNo ?? firstOccupiedSeatNo,
      flareToken: snapshot.active_turn?.id ?? summary.session_id,
      headline: summary.topic_title,
      description:
        summary.topic_description ??
        "Live seat-by-seat founder discussion with visible turns and a shared scorecard.",
      href: `/roundtable/${summary.session_id}`,
      statusLabel: formatRoundtableStatus(summary.status),
      metadata: [
        `${summary.seats_taken}/${summary.max_seats} seats taken`,
        `${summary.turn_duration_sec}s turns`,
        snapshot.queue.length ? `${snapshot.queue.length} queued` : "Queue open",
      ],
      tags: summary.tags.length ? summary.tags : ["startup", "roundtable"],
      helper: snapshot.active_turn
        ? `${snapshot.active_turn.member_display_name} is speaking now.`
        : "Room is open for the next speaker.",
    };
  }, [roundtableState.snapshot, roundtableState.summary]);

  const pauseRail = (pauseMs = 1800) => {
    setIsRailPaused(true);
    if (railPauseTimerRef.current !== null) {
      clearTimeout(railPauseTimerRef.current);
    }
    railPauseTimerRef.current = setTimeout(() => {
      railPauseTimerRef.current = null;
      setIsRailPaused(false);
    }, pauseMs);
  };

  const heroCtaHref = roundtablePreview.href;
  const heroCtaLabel =
    roundtableState.summary?.status === "live" ? "Join Live Roundtable" : "Open Roundtable";

  return (
    <main className="stream-home">
      <section className="stream-home-hero" aria-label="Featured founder video">
        <div className="stream-home-hero-media">
          {featuredPitch?.poster ? (
            <img
              className="stream-home-hero-poster"
              src={featuredPitch.poster}
              alt={featuredPitch.name ? `${featuredPitch.name} poster` : "Featured founder poster"}
              loading="eager"
              decoding="async"
            />
          ) : (
            <div className="stream-home-hero-poster stream-home-hero-poster-fallback" />
          )}
          {featuredPitch && heroHasDirectVideo ? (
            <video
              className="stream-home-hero-video"
              muted
              playsInline
              autoPlay
              loop
              preload="metadata"
              poster={featuredPitch.poster}
            >
              {heroVideoHls ? <source src={heroVideoHls} type="application/vnd.apple.mpegurl" /> : null}
              {heroVideoMp4 ? <source src={heroVideoMp4} type="video/mp4" /> : null}
            </video>
          ) : null}
          <div className="stream-home-hero-gradient" />
          <header className="stream-home-header">
            <Link href="/" className="stream-home-brand">
              <span className="stream-home-brand-mark">SM</span>
              <span className="stream-home-brand-word">StartupManch TV</span>
            </Link>
            <nav className="stream-home-nav" aria-label="Homepage">
              <Link href="/about">About</Link>
              <Link href="/roundtable">Roundtable</Link>
              <Link href={heroCtaHref} className="stream-home-nav-cta">
                {heroCtaLabel}
              </Link>
            </nav>
          </header>
        </div>

        <div className="stream-home-hero-copy">
          <p className="stream-home-kicker">Featured stream</p>
          <h1>{featuredPitch?.name ?? HERO_FALLBACK_TITLE}</h1>
          <p className="stream-home-hero-tagline">
            {featuredPitch?.tagline ?? HERO_FALLBACK_TAGLINE}
          </p>
          <div className="stream-home-hero-meta" aria-label="Featured video metadata">
            <span>StartupManch TV</span>
            <span>{featuredPitch?.category ?? "Founder Story"}</span>
            <span>
              {featuredPitch
                ? heroHasDirectVideo
                  ? "Autoplay video"
                  : "Poster preview"
                : pitchLoading
                  ? "Loading"
                  : "Coming soon"}
            </span>
          </div>
          <div className="stream-home-hero-actions">
            <Link href={heroCtaHref} className="stream-home-primary-cta">
              {heroCtaLabel}
            </Link>
            <a href="#home-roundtable" className="stream-home-circle-cta" aria-label="Jump to roundtable preview">
              ↓
            </a>
          </div>
          <p className="stream-home-hero-note">
            {pitchLoading
              ? "Loading homepage videos..."
              : pitchError
                ? pitchError
                : roundtablePreview.helper}
          </p>
          <div className="stream-home-hero-dots" aria-hidden="true">
            {Array.from({ length: Math.max(1, Math.min(6, railPitches.length + 1)) }, (_, index) => (
              <span key={`hero-dot-${index}`} className={index === 0 ? "is-active" : ""} />
            ))}
          </div>
        </div>
      </section>

      <section id="home-roundtable" className="stream-home-section stream-home-roundtable">
        <div className="stream-home-section-head">
          <div>
            <p className="stream-home-kicker">Roundtable preview</p>
            <h2>{roundtablePreview.headline}</h2>
            <p>{roundtablePreview.description}</p>
          </div>
          <div className="stream-home-status-stack">
            <span className="stream-home-status-pill">{roundtablePreview.statusLabel}</span>
            <span className="stream-home-status-note">
              {roundtableState.loading ? "Refreshing live room..." : roundtableState.error ?? "Live room snapshot"}
            </span>
          </div>
        </div>

        <div className="stream-home-roundtable-grid">
          <div className="stream-home-roundtable-visual">
            <RoundtableSeatCircle
              seats={roundtablePreview.seats}
              flareToken={roundtablePreview.flareToken}
              eyeTargetSeatNo={roundtablePreview.eyeTargetSeatNo}
              activeSpeakerSeatNo={roundtablePreview.activeSpeakerSeatNo}
              showMicControls={false}
              ariaLabel="Homepage roundtable preview"
            />
          </div>
          <div className="stream-home-roundtable-copy">
            <div className="stream-home-metadata-grid" aria-label="Roundtable details">
              {roundtablePreview.metadata.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
            <div className="stream-home-tag-row" aria-label="Roundtable tags">
              {roundtablePreview.tags.map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
            </div>
            <p className="stream-home-roundtable-helper">{roundtablePreview.helper}</p>
            <div className="stream-home-roundtable-actions">
              <Link href={roundtablePreview.href} className="stream-home-primary-cta">
                {roundtableState.summary?.status === "live" ? "Enter This Room" : "Open Lobby"}
              </Link>
              <Link href="/roundtable" className="stream-home-secondary-cta">
                View all tables
              </Link>
            </div>
          </div>
        </div>
      </section>

      {railPitches.length ? (
        <section id="home-video-loop" className="stream-home-section stream-home-loop" aria-label="Looping founder videos">
          <div className="stream-home-section-head stream-home-loop-head">
            <div>
              <p className="stream-home-kicker">Continuous loop</p>
              <h2>Videos rolling right to left</h2>
              <p>One featured story at the top, then the rest flowing underneath in a seamless strip.</p>
            </div>
          </div>

          <div
            className={`stream-home-marquee${isRailPaused ? " is-paused" : ""}`}
            onPointerDown={() => pauseRail(2200)}
            onTouchStart={() => pauseRail(2200)}
            onFocusCapture={() => pauseRail(2200)}
            onMouseEnter={() => pauseRail(2000)}
          >
            <div className="stream-home-marquee-track">
              <div className="stream-home-marquee-segment">
                {railPitches.map((pitch) => (
                  <StreamingRailCard key={`primary-${pitch.id}`} pitch={pitch} />
                ))}
              </div>
              <div className="stream-home-marquee-segment" aria-hidden="true">
                {railPitches.map((pitch) => (
                  <StreamingRailCard key={`clone-${pitch.id}`} pitch={pitch} />
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
