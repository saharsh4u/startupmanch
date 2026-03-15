"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import RoundtableCreateTopicForm from "@/components/roundtable/RoundtableCreateTopicForm";
import RoundtableHomepageVideoRail from "@/components/roundtable/RoundtableHomepageVideoRail";
import RoundtableSessionCard from "@/components/roundtable/RoundtableSessionCard";
import { ensureGuestId } from "@/lib/roundtable/client-identity";
import type { RoundtableLobbyResponse, RoundtableSessionSummary } from "@/lib/roundtable/types";
import { hasBrowserSupabaseEnv, supabaseBrowser } from "@/lib/supabase/client";

const toActivityStamp = (session: RoundtableSessionSummary) => {
  const stamp = Date.parse(session.last_activity_at ?? session.created_at);
  return Number.isFinite(stamp) ? stamp : 0;
};

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
      .on("postgres_changes", { event: "*", schema: "public", table: "roundtable_members" }, () => {
        void load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "roundtable_turns" }, () => {
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

  const participantId = useMemo(() => ensureGuestId(), []);

  const sortedSessions = useMemo(
    () =>
      [...data.sessions].sort((left, right) => {
        const leftRank = left.status === "live" ? 0 : 1;
        const rightRank = right.status === "live" ? 0 : 1;
        if (leftRank !== rightRank) return leftRank - rightRank;
        if (right.seats_taken !== left.seats_taken) return right.seats_taken - left.seats_taken;
        return toActivityStamp(right) - toActivityStamp(left);
      }),
    [data.sessions]
  );

  const featuredSessions = sortedSessions.slice(0, 3);
  const remainingSessions = sortedSessions.slice(3);
  const liveRoomCount = data.sessions.filter((session) => session.status === "live").length;
  const openSeatCount = data.sessions.reduce(
    (total, session) => total + Math.max(0, session.max_seats - session.seats_taken),
    0
  );
  const topContributor = data.leaderboard[0] ?? null;

  const scrollToSection = useCallback((id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    target.scrollIntoView({ behavior, block: "start" });
  }, []);

  return (
    <div className="roundtable-shell">
      <section className="roundtable-hero roundtable-lobby-hero">
        <div className="roundtable-lobby-hero-copy">
          <p className="roundtable-kicker">Roundtable</p>
          <h1>Walk into the hottest founder rooms, not a dead lobby.</h1>
          <p>
            Five seats, timed turns, visible scoring, and fast-moving rooms where founders can jump in or start the next debate.
          </p>
          <div className="roundtable-rules" aria-label="Roundtable rules">
            <span>5 seats max</span>
            <span>One speaker queue</span>
            <span>60-120s timed turns</span>
            <span>Auto-submit on timeout</span>
          </div>
          <div className="roundtable-hero-actions">
            <button type="button" className="roundtable-cta" onClick={() => scrollToSection("roundtable-live")}>
              Join live room
            </button>
            <button type="button" className="roundtable-ghost-btn" onClick={() => scrollToSection("roundtable-create")}>
              Start a room
            </button>
          </div>
        </div>

        <div className="roundtable-hero-stats" aria-label="Roundtable lobby stats">
          <article className="roundtable-stat-card">
            <span>Live rooms</span>
            <strong>{liveRoomCount}</strong>
            <p>Rooms that already have founders seated.</p>
          </article>
          <article className="roundtable-stat-card">
            <span>Open seats</span>
            <strong>{openSeatCount}</strong>
            <p>Open spots across all waiting and live rooms.</p>
          </article>
          <article className="roundtable-stat-card">
            <span>Top contributor</span>
            <strong>{topContributor?.display_name ?? "Open board"}</strong>
            <p>{topContributor ? `${topContributor.points} pts this week` : "Be the first person on the board."}</p>
          </article>
        </div>
      </section>

      <section id="roundtable-live" className="roundtable-panel roundtable-live-now" aria-label="Featured roundtable sessions">
        <div className="roundtable-section-head">
          <div>
            <p className="roundtable-kicker">Live now</p>
            <h4>Jump into the rooms with the most momentum</h4>
            <p className="roundtable-section-copy">Live rooms float to the top, then the fullest rooms, then the ones with the freshest activity.</p>
          </div>
        </div>
        {loading ? <p className="roundtable-muted">Loading live rooms...</p> : null}
        {error ? <p className="roundtable-error">{error}</p> : null}
        {!loading && !featuredSessions.length ? <p className="roundtable-muted">No active sessions yet. Start the next one below.</p> : null}
        <div className="roundtable-session-grid roundtable-session-grid-featured">
          {featuredSessions.map((session) => (
            <RoundtableSessionCard key={session.session_id} session={session} featured />
          ))}
        </div>
      </section>

      <div className="roundtable-grid roundtable-lobby-grid">
        <section className="roundtable-panel roundtable-lobby-sessions" aria-label="All roundtable sessions">
          <div className="roundtable-section-head">
            <div>
              <p className="roundtable-kicker">All rooms</p>
              <h4>Everything open right now</h4>
              <p className="roundtable-section-copy">Use this list when the featured rooms are full or you want a quieter table.</p>
            </div>
          </div>
          {loading ? <p className="roundtable-muted">Loading sessions...</p> : null}
          {!loading && !sortedSessions.length ? <p className="roundtable-muted">No rooms are open right now.</p> : null}
          {!loading && sortedSessions.length > 0 && !remainingSessions.length ? (
            <p className="roundtable-muted">The most active rooms are already featured above.</p>
          ) : null}
          <div className="roundtable-session-grid">
            {remainingSessions.map((session) => (
              <RoundtableSessionCard key={session.session_id} session={session} />
            ))}
          </div>
        </section>

        <section className="roundtable-panel roundtable-lobby-leaderboard" aria-label="Weekly roundtable leaderboard">
          <div className="roundtable-section-head">
            <div>
              <p className="roundtable-kicker">This week</p>
              <h4>Top contributors</h4>
              <p className="roundtable-section-copy">Points are earned from approved turns and upvotes across live roundtables.</p>
            </div>
          </div>
          {loading ? <p className="roundtable-muted">Loading leaderboard...</p> : null}
          {!loading && !data.leaderboard.length ? <p className="roundtable-muted">No one has scored yet this week.</p> : null}
          <div className="roundtable-leaderboard-list">
            {data.leaderboard.slice(0, 5).map((entry, index) => (
              <article key={entry.member_id} className="roundtable-leaderboard-item">
                <span className="roundtable-leaderboard-rank">#{index + 1}</span>
                <div>
                  <strong>{entry.display_name}</strong>
                  <p>
                    {entry.points} pts · {entry.approved_turns} turns · {entry.upvotes_received} upvotes
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <RoundtableCreateTopicForm onCreated={() => void load()} />
      <RoundtableHomepageVideoRail
        sessionId="lobby"
        participantId={participantId}
        title="What founders are watching"
        description="Keep one eye on the homepage video loop, then open a clip and spin up a room around it."
      />
    </div>
  );
}
