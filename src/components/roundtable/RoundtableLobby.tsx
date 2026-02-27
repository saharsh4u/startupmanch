"use client";

import { useCallback, useEffect, useState } from "react";
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

  return (
    <div className="roundtable-shell">
      <section className="roundtable-hero">
        <p className="roundtable-kicker">Roundtable</p>
        <h1>StartupManch Roundtable</h1>
        <p>Structured text discussions with equal speaking turns, live queueing, and transparent scoring.</p>
      </section>

      <section className="roundtable-rules" aria-label="Roundtable rules">
        <span>5 seats max</span>
        <span>One speaker at a time</span>
        <span>60-120s timed turns</span>
        <span>Auto-submit on timeout</span>
      </section>

      <RoundtableCreateTopicForm onCreated={() => void load()} />

      <section className="roundtable-panel" aria-label="Live and waiting sessions">
        <h4>Live / waiting sessions</h4>
        {loading ? <p className="roundtable-muted">Loading sessions...</p> : null}
        {error ? <p className="roundtable-error">{error}</p> : null}
        {!loading && !data.sessions.length ? <p className="roundtable-muted">No active sessions yet.</p> : null}
        <div className="roundtable-session-grid">
          {data.sessions.map((session) => (
            <RoundtableSessionCard key={session.session_id} session={session} />
          ))}
        </div>
      </section>

      <section className="roundtable-panel" aria-label="Weekly top contributors">
        <h4>Weekly top contributors</h4>
        {!data.leaderboard.length ? <p className="roundtable-muted">Leaderboard will populate after activity.</p> : null}
        <div className="roundtable-score-list">
          {data.leaderboard.map((entry, index) => (
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
    </div>
  );
}
