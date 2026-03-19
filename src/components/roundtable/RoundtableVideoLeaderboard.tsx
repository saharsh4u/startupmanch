"use client";

import { useCallback, useEffect, useState } from "react";
import type { VideoLeaderboardEntry, VideoLeaderboardResponse } from "@/lib/pitches/leaderboard";

type RoundtableVideoLeaderboardProps = {
  refreshToken?: number;
  limit?: number;
};

const REFRESH_INTERVAL_MS = 60_000;

const formatOpenCount = (value: number) => new Intl.NumberFormat("en-US").format(value);

const toInitial = (value: string) => value.trim().charAt(0).toUpperCase() || "?";

export default function RoundtableVideoLeaderboard({
  refreshToken = 0,
  limit = 10,
}: RoundtableVideoLeaderboardProps) {
  const [entries, setEntries] = useState<VideoLeaderboardEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorText, setErrorText] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/pitches/leaderboard?limit=${limit}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Unable to load the video leaderboard.");
      }

      const payload = (await response.json()) as VideoLeaderboardResponse;
      setEntries(Array.isArray(payload.data) ? payload.data : []);
      setErrorText(null);
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setErrorText(error instanceof Error ? error.message : "Unable to load the video leaderboard.");
    }
  }, [limit]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!refreshToken) return;
    void load();
  }, [load, refreshToken]);

  return (
    <section className="roundtable-panel roundtable-video-leaderboard" aria-label="Most opened videos">
      <div className="roundtable-video-leaderboard-head">
        <div className="roundtable-video-leaderboard-copy">
          <h4>Most opened videos</h4>
          <p>Ranked by all-time opens from the roundtable rail.</p>
        </div>
        <span className="roundtable-video-leaderboard-chip">All time</span>
      </div>

      {status === "loading" && !entries.length ? (
        <div className="roundtable-video-leaderboard-list is-loading" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={`video-leaderboard-skeleton-${index}`} className="roundtable-video-leaderboard-row is-skeleton">
              <span className="roundtable-video-leaderboard-rank" />
              <span className="roundtable-video-leaderboard-thumb" />
              <span className="roundtable-video-leaderboard-text">
                <span className="roundtable-video-leaderboard-line" />
                <span className="roundtable-video-leaderboard-line short" />
              </span>
              <span className="roundtable-video-leaderboard-count" />
            </div>
          ))}
        </div>
      ) : null}

      {status === "error" ? (
        <p className="roundtable-video-leaderboard-status">
          {entries.length
            ? "Unable to refresh the leaderboard. Showing the latest results."
            : errorText ?? "Unable to load the leaderboard."}
        </p>
      ) : null}

      {entries.length ? (
        <div className="roundtable-video-leaderboard-list">
          {entries.map((entry) => (
            <div key={entry.pitch_id} className="roundtable-video-leaderboard-row">
              <div className="roundtable-video-leaderboard-rank" aria-label={`Rank ${entry.rank}`}>
                {entry.rank}
              </div>
              <div className="roundtable-video-leaderboard-thumb" aria-hidden="true">
                {entry.poster_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={entry.poster_url} alt="" loading="lazy" />
                ) : (
                  <span>{toInitial(entry.startup_name)}</span>
                )}
              </div>
              <div className="roundtable-video-leaderboard-text">
                <strong>{entry.startup_name}</strong>
                <span>{entry.tagline ?? "No one-liner added yet."}</span>
              </div>
              <div className="roundtable-video-leaderboard-count">
                <strong>{formatOpenCount(entry.open_count)}</strong>
                <span>opens</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
