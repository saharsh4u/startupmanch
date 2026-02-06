"use client";

import { useEffect, useRef, useState } from "react";
import LeaderboardSection from "@/components/LeaderboardSection";

export type LeaderboardRow = {
  name: string;
  sector: string;
  score?: number;
  change?: string;
};

type ApiRow = {
  rank: number;
  name: string;
  sector: string | null;
  momentum_score: number;
  updated_at: string;
};

type LeaderboardLiveProps = {
  initialRows: LeaderboardRow[];
  window?: "1h" | "24h" | "7d" | "30d";
};

const buildChange = (current: number, previous?: number) => {
  if (!previous || previous <= 0) {
    return "+0%";
  }
  const delta = ((current - previous) / previous) * 100;
  const clamped = Math.max(-9, Math.min(9, Math.round(delta)));
  const sign = clamped >= 0 ? "+" : "";
  return `${sign}${clamped}%`;
};

export default function LeaderboardLive({ initialRows, window = "24h" }: LeaderboardLiveProps) {
  const [rows, setRows] = useState<LeaderboardRow[]>(initialRows);
  const rowsRef = useRef<LeaderboardRow[]>(initialRows);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    let cancelled = false;

    const getPreviousScores = () =>
      new Map(rowsRef.current.map((row) => [row.name, row.score]));

    const fetchRows = async () => {
      try {
        const response = await fetch(`/api/startups?window=${window}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        const data: ApiRow[] = payload.data ?? [];
        const previousScores = getPreviousScores();
        const nextRows = data
          .sort((a, b) => a.rank - b.rank)
          .map((item) => {
            const score = Math.round(item.momentum_score);
            const change = buildChange(score, previousScores.get(item.name));
            return {
              name: item.name,
              sector: item.sector ?? "General",
              score,
              change,
            } satisfies LeaderboardRow;
          });
        if (!cancelled && nextRows.length) {
          setRows(nextRows);
        }
      } catch (error) {
        // keep last known rows
      }
    };

    fetchRows();
    const interval = setInterval(fetchRows, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [window]);

  return <LeaderboardSection rows={rows} />;
}
