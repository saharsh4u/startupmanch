"use client";
/* eslint-disable @next/next/no-img-element */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { StreamHomeRoundtablePreviewModel } from "@/components/home/StreamHomeRoundtablePreviewSection";
import type { RoundtableSeatViewModel } from "@/components/roundtable/RoundtableSeatCircle";
import {
  buildHomepageFeedUrl,
  getHomepageRailPitches,
  hasDirectPlayableUpload,
  type FeedResponsePayload,
  type HomepagePitch,
  selectFeaturedHomepagePitch,
  toPlayableHomepagePitches,
} from "@/lib/homepage/pitches";
import type { RoundtablePreviewResponse, RoundtableSessionSummary } from "@/lib/roundtable/types";
import { useDeferredMount } from "@/lib/ui/useDeferredMount";

const HERO_FALLBACK_TITLE = "StartupManch TV";
const HERO_FALLBACK_TAGLINE =
  "A mobile-first home for founder videos, live roundtables, and rolling community stories.";
const ROUNDTABLE_POLL_MS = 30_000;
const STREAMING_HOME_HREF = "/roundtable";
const ROUNDTABLE_HOME_HREF = "/";
const ROUNDTABLE_LOBBY_HREF = "/roundtable/lobby";

const StreamHomeRoundtablePreviewSection = dynamic(
  () => import("@/components/home/StreamHomeRoundtablePreviewSection"),
  {
    ssr: false,
    loading: () => null,
  }
);

const StreamHomeLoopSection = dynamic(
  () => import("@/components/home/StreamHomeLoopSection"),
  {
    ssr: false,
    loading: () => null,
  }
);

type RoundtablePreviewState = {
  summary: RoundtableSessionSummary | null;
  preview: RoundtablePreviewResponse["preview"];
  loading: boolean;
  error: string | null;
};

const roundtableFallbackSeats: RoundtableSeatViewModel[] = [
  {
    seatNo: 1,
    memberId: "preview-host",
    displayName: "Host",
    avatarLabel: "H",
    isActive: true,
    isQueued: false,
    isMe: false,
    isEmpty: false,
    isCameraLive: false,
    stateLabel: "Speaking",
  },
  {
    seatNo: 2,
    memberId: "preview-builder",
    displayName: "Builder",
    avatarLabel: "B",
    isActive: false,
    isQueued: true,
    isMe: false,
    isEmpty: false,
    isCameraLive: false,
    stateLabel: "Queued",
  },
  {
    seatNo: 3,
    memberId: "preview-ops",
    displayName: "Operator",
    avatarLabel: "O",
    isActive: false,
    isQueued: false,
    isMe: false,
    isEmpty: false,
    isCameraLive: false,
    stateLabel: "Ready",
  },
  {
    seatNo: 4,
    memberId: "preview-founder",
    displayName: "Founder",
    avatarLabel: "F",
    isActive: false,
    isQueued: false,
    isMe: false,
    isEmpty: false,
    isCameraLive: false,
    stateLabel: "Ready",
  },
  {
    seatNo: 5,
    memberId: null,
    displayName: "Open seat",
    avatarLabel: "OS",
    isActive: false,
    isQueued: false,
    isMe: false,
    isEmpty: true,
    isCameraLive: false,
    stateLabel: "Available",
  },
];

const formatRoundtableStatus = (status: RoundtableSessionSummary["status"] | null) => {
  if (status === "live") return "Live now";
  if (status === "lobby") return "Waiting room";
  return "Preview";
};

export default function HomeStreamingPage() {
  const [pitches, setPitches] = useState<HomepagePitch[]>([]);
  const [pitchLoading, setPitchLoading] = useState(true);
  const [pitchError, setPitchError] = useState<string | null>(null);
  const [roundtableState, setRoundtableState] = useState<RoundtablePreviewState>({
    summary: null,
    preview: null,
    loading: false,
    error: null,
  });
  const [isRailPaused, setIsRailPaused] = useState(false);
  const railPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferredSectionsReady = useDeferredMount({ timeoutMs: 700 });

  useEffect(() => {
    const controller = new AbortController();

    const loadPitches = async () => {
      try {
        setPitchLoading(true);
        const response = await fetch(buildHomepageFeedUrl(), {
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
    if (!deferredSectionsReady) return;
    let cancelled = false;

    const loadRoundtablePreview = async () => {
      try {
        setRoundtableState((current) => ({
          ...current,
          loading: true,
        }));

        const previewResponse = await fetch("/api/roundtable/preview");
        const previewPayload = (await previewResponse.json()) as RoundtablePreviewResponse & { error?: string };

        if (!previewResponse.ok) {
          throw new Error(previewPayload.error ?? "Unable to load roundtable preview.");
        }

        if (!previewPayload.summary || !previewPayload.preview) {
          if (!cancelled) {
            setRoundtableState({
              summary: null,
              preview: null,
              loading: false,
              error: null,
            });
          }
          return;
        }

        if (!cancelled) {
          setRoundtableState({
            summary: previewPayload.summary,
            preview: previewPayload.preview,
            loading: false,
            error: null,
          });
        }
      } catch (errorValue) {
        if (cancelled) return;
        setRoundtableState((current) => ({
          summary: current.summary,
          preview: current.preview,
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
  }, [deferredSectionsReady]);

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
    const previewData = roundtableState.preview;
    const summary = roundtableState.summary;

    if (!previewData || !summary) {
      return {
        seats: roundtableFallbackSeats,
        activeSpeakerSeatNo: 1,
        eyeTargetSeatNo: 1,
        flareToken: "preview-speaker",
        headline: "The next founder roundtable starts here.",
        description:
          "No room is live yet. This preview shows how the roulette table will look once speakers join.",
        href: ROUNDTABLE_LOBBY_HREF,
        statusLabel: "Preview",
        metadata: ["5 seats", "Live queue", "Timed turns"],
        tags: ["startup", "roundtable", "live"],
        helper: "Open the lobby to create or join the next room.",
      };
    }

    const seats = previewData.seats.map((seat) => ({
      seatNo: seat.seat_no,
      memberId: null,
      displayName: seat.display_name,
      avatarLabel: seat.avatar_label,
      isActive: seat.is_active,
      isQueued: seat.is_queued,
      isMe: false,
      isEmpty: seat.is_empty,
      isReserved: seat.is_reserved,
      isCameraLive: false,
      stateLabel: seat.state_label,
    })) satisfies RoundtableSeatViewModel[];
    const activeSpeaker = previewData.seats.find(
      (seat) => seat.seat_no === previewData.active_speaker_seat_no
    );
    const firstQueuedSeatNo = previewData.seats.find((seat) => seat.is_queued)?.seat_no ?? null;
    const firstOccupiedSeatNo =
      previewData.seats.find((seat) => !seat.is_empty)?.seat_no ?? 1;

    return {
      seats,
      activeSpeakerSeatNo: previewData.active_speaker_seat_no,
      eyeTargetSeatNo:
        previewData.active_speaker_seat_no ?? firstQueuedSeatNo ?? firstOccupiedSeatNo,
      flareToken: `${summary.session_id}:${previewData.active_speaker_seat_no ?? "idle"}`,
      headline: summary.topic_title,
      description:
        summary.topic_description ??
        "Live seat-by-seat founder discussion with visible turns and a shared scorecard.",
      href: summary.status === "live" ? `/roundtable/${summary.session_id}` : ROUNDTABLE_LOBBY_HREF,
      statusLabel: formatRoundtableStatus(summary.status),
      metadata: [
        `${summary.seats_taken}/${summary.max_seats} seats taken`,
        `${summary.turn_duration_sec}s turns`,
        previewData.queue_count ? `${previewData.queue_count} queued` : "Queue open",
      ],
      tags: summary.tags.length ? summary.tags : ["startup", "roundtable"],
      helper: activeSpeaker
        ? `${activeSpeaker.display_name} is speaking now.`
        : "Room is open for the next speaker.",
    };
  }, [roundtableState.preview, roundtableState.summary]);

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
    roundtableState.summary?.status === "live" ? "Join Live Roundtable" : "Open Roundtable Lobby";
  const roundtableStatusNote = roundtableState.error ?? "Live room snapshot";
  const roundtablePreviewModel: StreamHomeRoundtablePreviewModel = {
    seats: roundtablePreview.seats,
    eyeTargetSeatNo: roundtablePreview.eyeTargetSeatNo,
    flareToken: roundtablePreview.flareToken,
    headline: roundtablePreview.headline,
    description: roundtablePreview.description,
    href: roundtablePreview.href,
    statusLabel: roundtablePreview.statusLabel,
    metadata: roundtablePreview.metadata,
    tags: roundtablePreview.tags,
    helper: roundtablePreview.helper,
  };

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
            <Link href={STREAMING_HOME_HREF} className="stream-home-brand">
              <span className="stream-home-brand-mark">SM</span>
              <span className="stream-home-brand-word">StartupManch TV</span>
            </Link>
            <nav className="stream-home-nav" aria-label="Homepage">
              <Link href="/about">About</Link>
              <Link href={ROUNDTABLE_HOME_HREF}>Roundtable</Link>
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

      {deferredSectionsReady ? (
        <StreamHomeRoundtablePreviewSection
          preview={roundtablePreviewModel}
          isLoading={roundtableState.loading}
          statusNote={roundtableStatusNote}
          lobbyHref={ROUNDTABLE_LOBBY_HREF}
          ctaLabel={roundtableState.summary?.status === "live" ? "Enter This Room" : "Open Lobby"}
        />
      ) : null}

      {deferredSectionsReady && railPitches.length ? (
        <StreamHomeLoopSection
          railPitches={railPitches}
          isPaused={isRailPaused}
          onPause={pauseRail}
        />
      ) : null}
    </main>
  );
}
