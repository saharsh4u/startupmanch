"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

const barPalette = [
  "linear-gradient(90deg, #f7b3e4, #f59ec7)",
  "linear-gradient(90deg, #c7b6ff, #b69cff)",
  "linear-gradient(90deg, #a8d5ff, #8bc1ff)",
  "linear-gradient(90deg, #ffe6a7, #ffd06f)",
  "linear-gradient(90deg, #b2f5ea, #6ee7f0)",
  "linear-gradient(90deg, #c7f9cc, #8ee3a1)",
  "linear-gradient(90deg, #ffd6d6, #ffb6b6)",
  "linear-gradient(90deg, #d4f4ff, #9de2ff)"
];

const UPDATE_INTERVAL = 60000;
const WINDOW = "24h";

type RankingEntry = {
  rank: number;
  company: string;
  sector: string | null;
  revenue: string | null;
  cts_score: number;
  delta?: number | null;
  updated_at: string;
};

type RankingsResponse = {
  window: string;
  simulated: boolean;
  data: RankingEntry[];
};

const makeLogo = (company: string) =>
  company
    .replace(/\([^)]*\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

export default function Leaderboard() {
  const [entries, setEntries] = useState<RankingEntry[]>([]);
  const [pulse, setPulse] = useState(false);
  const [simulated, setSimulated] = useState(true);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );

  useEffect(() => {
    let pulseTimer: ReturnType<typeof setTimeout> | null = null;

    const triggerPulse = () => {
      setPulse(true);
      if (pulseTimer) {
        clearTimeout(pulseTimer);
      }
      pulseTimer = setTimeout(() => setPulse(false), 800);
    };

    const load = async () => {
      try {
        const response = await fetch(`/api/rankings?window=${WINDOW}`, {
          cache: "no-store"
        });
        if (!response.ok) {
          throw new Error("Failed to fetch rankings");
        }
        const data = (await response.json()) as RankingsResponse;
        setEntries(data.data ?? []);
        setSimulated(Boolean(data.simulated));
        setStatus("ready");
        triggerPulse();
      } catch (error) {
        setStatus("error");
      }
    };

    load();
    const timer = setInterval(load, UPDATE_INTERVAL);

    return () => {
      clearInterval(timer);
      if (pulseTimer) {
        clearTimeout(pulseTimer);
      }
    };
  }, []);

  const maxCts = useMemo(
    () => Math.max(...entries.map((entry) => entry.cts_score), 1),
    [entries]
  );

  const chipText = simulated ? "Simulated feed" : "Updated every 5 min";

  return (
    <div className="leaderboard">
      <div className="leaderboard-header">
        <div>
          <p className="eyebrow">Live complaint trends</p>
          <h2>Fastest rising complaint velocity</h2>
        </div>
        <span className="chip">{chipText}</span>
      </div>

      {status === "loading" && entries.length === 0 && (
        <div className="leaderboard-empty">Loading rankings...</div>
      )}

      {status === "ready" && entries.length === 0 && (
        <div className="leaderboard-empty">No rankings available yet.</div>
      )}

      {status === "error" && (
        <div className="leaderboard-empty">
          Unable to load rankings. Showing last cached data.
        </div>
      )}

      <div className={`leaderboard-list${pulse ? " pulse" : ""}`}>
        {entries.map((entry, index) => {
          const width = Math.round((entry.cts_score / maxCts) * 100);
          const barStyle = {
            "--bar-target": `${width}%`,
            "--bar-color": barPalette[index % barPalette.length]
          } as CSSProperties;

          return (
            <div className="leaderboard-row" key={entry.company}>
              <div className="leaderboard-rank">{entry.rank}</div>
              <div className="leaderboard-brand">
                <div className="brand-logo">{makeLogo(entry.company)}</div>
                <div>
                  <div className="brand-title">{entry.company}</div>
                  <div className="brand-meta">
                    <span>{entry.sector ?? "General"}</span>
                    <span>
                      Revenue: {entry.revenue ?? "N/A"} {entry.revenue ? "INR" : ""}
                    </span>
                  </div>
                </div>
              </div>
              <div className="leaderboard-bar">
                <div className="bar-fill" style={barStyle} />
                <span className="bar-value">CTS +{entry.cts_score}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
