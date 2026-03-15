"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import RoundtableCreateTopicForm from "@/components/roundtable/RoundtableCreateTopicForm";
import RoundtableSessionCard from "@/components/roundtable/RoundtableSessionCard";
import type { RoundtableLobbyResponse } from "@/lib/roundtable/types";
import { hasBrowserSupabaseEnv, supabaseBrowser } from "@/lib/supabase/client";

export default function RoundtableLobby() {
  const [data, setData] = useState<RoundtableLobbyResponse>({ sessions: [], leaderboard: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/roundtable/lobby", { cache: "no-store" });
      const payload = (await response.json()) as RoundtableLobbyResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load lobby.");
      }
      setData({
        sessions: Array.isArray(payload.sessions) ? payload.sessions : [],
        leaderboard: Array.isArray(payload.leaderboard) ? payload.leaderboard : [],
      });
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load lobby.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!hasBrowserSupabaseEnv) return;
    const channel = supabaseBrowser
      .channel("roundtable-lobby")
      .on("postgres_changes", { event: "*", schema: "public", table: "roundtable_sessions" }, () => {
        void load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "roundtable_scores" }, () => {
        void load();
      })
      .subscribe();

    return () => {
      void supabaseBrowser.removeChannel(channel);
    };
  }, [load]);

  const sessions = useMemo(
    () =>
      [...data.sessions].sort((left, right) => {
        const leftRank = left.status === "live" ? 0 : 1;
        const rightRank = right.status === "live" ? 0 : 1;
        if (leftRank !== rightRank) return leftRank - rightRank;
        return 0;
      }),
    [data.sessions]
  );

  return (
    <div className="roundtable-shell">
      <section className="roundtable-hero roundtable-lobby-hero">
        <p className="roundtable-kicker">Roundtable</p>
        <h1>StartupManch Roundtable</h1>
        <p>Roulette-style founder discussions with live queueing, timed turns, and transparent scoring.</p>
      </section>

      <section className="roundtable-rules" aria-label="Roundtable rules">
        <span>5 seats max</span>
        <span>One speaker at a time</span>
        <span>60-120s timed turns</span>
        <span>Auto-submit on timeout</span>
      </section>

      <section className="roundtable-panel roundtable-lobby-sessions" aria-label="Live and waiting sessions">
        <h4>Live / waiting sessions</h4>
        {loading ? <p className="roundtable-muted">Loading sessions...</p> : null}
        {error ? <p className="roundtable-error">{error}</p> : null}
        {!loading && !sessions.length ? <p className="roundtable-muted">No active sessions yet.</p> : null}
        <div className="roundtable-session-grid">
          {sessions.map((session) => (
            <RoundtableSessionCard key={session.session_id} session={session} />
          ))}
        </div>
      </section>

      <RoundtableCreateTopicForm onCreated={() => void load()} />

    </div>
  );
}
