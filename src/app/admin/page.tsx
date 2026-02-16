"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import AdRailsScaffold from "@/components/AdRailsScaffold";
import SiteFooter from "@/components/SiteFooter";
import TopNav from "@/components/TopNav";
import { hasBrowserSupabaseEnv, supabaseBrowser } from "@/lib/supabase/client";

type QueueItem = {
  startup_id: string;
  startup_name: string;
  category: string | null;
  city: string | null;
  founder_email: string | null;
  pitch_id: string;
  pitch_type: string;
  duration_sec: number | null;
  ask: string | null;
  equity: string | null;
  valuation: string | null;
  video_processing_status: string | null;
  video_error: string | null;
  video_url: string | null;
  poster_url: string | null;
};

type ModerationItem = QueueItem & {
  startup_status: string | null;
  pitch_status: string | null;
  approved_at: string | null;
  created_at: string | null;
};

type AuthStatus = "idle" | "loading" | "authed" | "error";

const AUTH_UNAVAILABLE_MESSAGE = "Admin sign-in is temporarily unavailable. Please try again shortly.";
const VIDEO_PROCESSING_STATES = new Set(["queued", "processing"]);

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.trim().length ? error.message : fallback;

export default function AdminPage() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("idle");
  const [authError, setAuthError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [moderation, setModeration] = useState<ModerationItem[]>([]);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [moderationError, setModerationError] = useState<string | null>(null);
  const [queueNote, setQueueNote] = useState<string | null>(null);
  const [moderationNote, setModerationNote] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadQueue = useCallback(async (token: string) => {
    setQueueError(null);
    const res = await fetch("/api/admin/queue", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload.error ?? "Unable to load queue.");
    }
    setQueue((payload.startups ?? []) as QueueItem[]);
  }, []);

  const loadModeration = useCallback(async (token: string) => {
    setModerationError(null);
    const res = await fetch("/api/admin/moderation?limit=60", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload.error ?? "Unable to load moderation feed.");
    }
    setModeration((payload.items ?? []) as ModerationItem[]);
  }, []);

  const refreshAdminData = useCallback(async (token: string) => {
    const [queueResult, moderationResult] = await Promise.allSettled([loadQueue(token), loadModeration(token)]);
    if (queueResult.status === "rejected") {
      setQueueError(errorMessage(queueResult.reason, "Unable to load queue."));
    }
    if (moderationResult.status === "rejected") {
      setModerationError(errorMessage(moderationResult.reason, "Unable to load moderation feed."));
    }
  }, [loadModeration, loadQueue]);

  useEffect(() => {
    const init = async () => {
      if (!hasBrowserSupabaseEnv) {
        setAuthStatus("error");
        setAuthError(AUTH_UNAVAILABLE_MESSAGE);
        return;
      }

      setAuthStatus("loading");
      try {
        const { data } = await supabaseBrowser.auth.getSession();
        const session = data.session;
        if (!session?.access_token) {
          setAuthStatus("idle");
          return;
        }
        setSessionToken(session.access_token);
        setAuthStatus("authed");
        await refreshAdminData(session.access_token);
      } catch (error) {
        setAuthStatus("error");
        setAuthError(errorMessage(error, AUTH_UNAVAILABLE_MESSAGE));
      }
    };
    void init();
  }, [refreshAdminData]);

  useEffect(() => {
    if (authStatus !== "authed" || !sessionToken || actionId) return;
    const hasProcessing = queue.some((item) =>
      VIDEO_PROCESSING_STATES.has((item.video_processing_status ?? "").toLowerCase())
    );
    if (!hasProcessing) return;

    const intervalId = window.setInterval(() => {
      void refreshAdminData(sessionToken);
    }, 8000);

    return () => window.clearInterval(intervalId);
  }, [actionId, authStatus, queue, refreshAdminData, sessionToken]);

  const handleSignIn = async () => {
    if (!hasBrowserSupabaseEnv) {
      setAuthStatus("error");
      setAuthError(AUTH_UNAVAILABLE_MESSAGE);
      return;
    }

    setAuthError(null);
    setAuthStatus("loading");
    const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthStatus("error");
      setAuthError(error.message ?? "Unable to sign in.");
      return;
    }

    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token ?? null;
    setSessionToken(token);
    setAuthStatus("authed");
    if (token) {
      await refreshAdminData(token);
    }
  };

  const handleSignOut = async () => {
    if (!hasBrowserSupabaseEnv) return;
    await supabaseBrowser.auth.signOut();
    setSessionToken(null);
    setQueue([]);
    setModeration([]);
    setQueueError(null);
    setModerationError(null);
    setQueueNote(null);
    setModerationNote(null);
    setAuthStatus("idle");
  };

  const handleDecision = async (item: QueueItem, action: "approve" | "reject") => {
    if (!sessionToken) return;

    const nextActionId = `queue-${action}-${item.pitch_id}`;
    setActionId(nextActionId);
    setQueueError(null);
    setQueueNote(null);

    try {
      const res = await fetch(`/api/admin/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ startup_id: item.startup_id, pitch_id: item.pitch_id }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? "Action failed.");

      if (payload?.status === "queued_for_transcode") {
        setQueueNote("Queued for Mux transcode. This pitch will auto-approve once processing finishes.");
      }
      await refreshAdminData(sessionToken);
    } catch (error) {
      setQueueError(errorMessage(error, "Action failed."));
    } finally {
      setActionId(null);
    }
  };

  const handleRetryTranscode = async (pitchId: string) => {
    if (!sessionToken) return;

    const nextActionId = `queue-retry-${pitchId}`;
    setActionId(nextActionId);
    setQueueError(null);
    setQueueNote(null);

    try {
      const res = await fetch(`/api/admin/pitches/${pitchId}/transcode/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? "Retry failed.");
      if (payload?.status === "queued_for_transcode") {
        setQueueNote("Retry queued. This pitch will auto-approve once processing finishes.");
      }
      await refreshAdminData(sessionToken);
    } catch (error) {
      setQueueError(errorMessage(error, "Retry failed."));
    } finally {
      setActionId(null);
    }
  };

  const handleRemoveLivePitch = async (item: ModerationItem) => {
    if (!sessionToken) return;
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        `Remove "${item.startup_name}" from live feed? This hides the video immediately.`
      );
      if (!confirmed) return;
    }

    const nextActionId = `mod-remove-${item.pitch_id}`;
    setActionId(nextActionId);
    setModerationError(null);
    setModerationNote(null);

    try {
      const res = await fetch(`/api/admin/pitches/${item.pitch_id}/remove`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? "Unable to remove video.");
      setModerationNote(`Removed "${item.startup_name}" from the live feed.`);
      await refreshAdminData(sessionToken);
    } catch (error) {
      setModerationError(errorMessage(error, "Unable to remove video."));
    } finally {
      setActionId(null);
    }
  };

  const handleBlockStartup = async (item: ModerationItem) => {
    if (!sessionToken) return;
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        `Block startup "${item.startup_name}" and reject all of its pitches?`
      );
      if (!confirmed) return;
    }

    const nextActionId = `mod-block-${item.startup_id}`;
    setActionId(nextActionId);
    setModerationError(null);
    setModerationNote(null);

    try {
      const res = await fetch(`/api/admin/startups/${item.startup_id}/block`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? "Unable to block startup.");
      setModerationNote(`Blocked "${item.startup_name}" and removed its videos.`);
      await refreshAdminData(sessionToken);
    } catch (error) {
      setModerationError(errorMessage(error, "Unable to block startup."));
    } finally {
      setActionId(null);
    }
  };

  const hasActionInFlight = Boolean(actionId);

  return (
    <AdRailsScaffold>
      <div className="admin-shell">
        <TopNav context="inner" />
        <header className="admin-hero">
          <div className="hero-brand">
            <span className="brand-star">✦</span>
            <span>StartupManch</span>
          </div>
          <h1>Admin Control Panel</h1>
          <p>Approve, remove, or block startup videos from one place.</p>
        </header>

        <section className="admin-card">
          <div className="admin-card-header">
            <h3>Admin access</h3>
            <span>{authStatus === "authed" ? "Signed in" : "Sign in to manage the platform."}</span>
          </div>
          {authStatus !== "authed" ? (
            <div className="submit-grid">
              <div className="form-field">
                <label>Email</label>
                <input
                  type="email"
                  placeholder="admin@startupmanch.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="form-field">
                <label>Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="submit-actions">
                <button type="button" onClick={() => void handleSignIn()}>
                  Sign in
                </button>
              </div>
              {authError ? <p className="submit-error">{authError}</p> : null}
            </div>
          ) : (
            <div className="submit-actions">
              <button type="button" className="ghost" onClick={() => void handleSignOut()}>
                Sign out
              </button>
              <button
                type="button"
                className="ghost"
                disabled={!sessionToken || hasActionInFlight}
                onClick={() => {
                  if (!sessionToken) return;
                  void refreshAdminData(sessionToken);
                }}
              >
                Refresh data
              </button>
            </div>
          )}
        </section>

        <section className="admin-card">
          <div className="admin-card-header">
            <h3>Pending approvals</h3>
            <span>{queue.length} items</span>
          </div>
          {queueError ? <p className="submit-error">{queueError}</p> : null}
          {queueNote ? <p className="submit-note">{queueNote}</p> : null}
          {queue.length === 0 ? (
            <p className="admin-empty">No pending pitches right now.</p>
          ) : (
            <div className="admin-list">
              {queue.map((item) => {
                const processingStatus = (item.video_processing_status ?? "").toLowerCase();
                const isProcessing = VIDEO_PROCESSING_STATES.has(processingStatus);
                const isFailed = processingStatus === "failed";
                const approveActionId = `queue-approve-${item.pitch_id}`;
                const rejectActionId = `queue-reject-${item.pitch_id}`;
                const retryActionId = `queue-retry-${item.pitch_id}`;
                const approveDisabled = hasActionInFlight || isProcessing;
                const rejectDisabled = hasActionInFlight;

                return (
                  <div className="admin-row" key={item.pitch_id}>
                    <div className="admin-info">
                      <h4>{item.startup_name}</h4>
                      <p>
                        {item.category ?? "General"} · {item.city ?? "India"}
                      </p>
                      <p className="admin-email">{item.founder_email ?? "Founder email unknown"}</p>
                      <div className="admin-tags">
                        <span>Pitch: {item.pitch_type}</span>
                        {item.duration_sec ? <span>{item.duration_sec}s</span> : null}
                        {item.ask ? <span>Ask {item.ask}</span> : null}
                        {item.equity ? <span>{item.equity} equity</span> : null}
                        {item.valuation ? <span>{item.valuation} valuation</span> : null}
                        {processingStatus && processingStatus !== "pending" ? (
                          <span>Video: {processingStatus}</span>
                        ) : null}
                        {isFailed && item.video_error ? <span>Reason: {item.video_error}</span> : null}
                      </div>
                    </div>
                    <div className="admin-media">
                      {item.video_url ? (
                        <video controls preload="none" poster={item.poster_url ?? undefined}>
                          <source src={item.video_url} />
                        </video>
                      ) : (
                        <div className="admin-placeholder">No video</div>
                      )}
                      {item.poster_url ? (
                        <Image
                          src={item.poster_url}
                          alt={`${item.startup_name} poster`}
                          width={640}
                          height={360}
                          unoptimized
                          style={{ width: "100%", height: "auto" }}
                        />
                      ) : (
                        <div className="admin-placeholder">No poster</div>
                      )}
                    </div>
                    <div className="admin-actions">
                      <button
                        type="button"
                        disabled={approveDisabled}
                        onClick={() => void handleDecision(item, "approve")}
                      >
                        {actionId === approveActionId
                          ? "Approving…"
                          : isProcessing
                            ? "Transcoding…"
                            : "Approve"}
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        disabled={rejectDisabled}
                        onClick={() => void handleDecision(item, "reject")}
                      >
                        {actionId === rejectActionId ? "Rejecting…" : "Reject"}
                      </button>
                      {isFailed ? (
                        <button
                          type="button"
                          className="ghost"
                          disabled={hasActionInFlight}
                          onClick={() => void handleRetryTranscode(item.pitch_id)}
                        >
                          {actionId === retryActionId ? "Retrying…" : "Retry transcode"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="admin-card">
          <div className="admin-card-header">
            <h3>Live moderation</h3>
            <span>{moderation.length} live videos</span>
          </div>
          <p className="admin-section-note">
            Take down scam, porn, or abusive videos instantly. Use block startup to reject all its pitches.
          </p>
          {moderationError ? <p className="submit-error">{moderationError}</p> : null}
          {moderationNote ? <p className="submit-note">{moderationNote}</p> : null}
          {moderation.length === 0 ? (
            <p className="admin-empty">No approved pitches available for moderation right now.</p>
          ) : (
            <div className="admin-list">
              {moderation.map((item) => {
                const removeActionId = `mod-remove-${item.pitch_id}`;
                const blockActionId = `mod-block-${item.startup_id}`;

                return (
                  <div className="admin-row" key={`mod-${item.pitch_id}`}>
                    <div className="admin-info">
                      <h4>{item.startup_name}</h4>
                      <p>
                        {item.category ?? "General"} · {item.city ?? "India"}
                      </p>
                      <p className="admin-email">{item.founder_email ?? "Founder email unknown"}</p>
                      <div className="admin-tags">
                        <span>Live status: {item.pitch_status ?? "approved"}</span>
                        <span>Startup: {item.startup_status ?? "approved"}</span>
                        {item.duration_sec ? <span>{item.duration_sec}s</span> : null}
                        {item.ask ? <span>Ask {item.ask}</span> : null}
                        {item.approved_at ? (
                          <span>Approved: {new Date(item.approved_at).toLocaleString()}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="admin-media">
                      {item.video_url ? (
                        <video controls preload="none" poster={item.poster_url ?? undefined}>
                          <source src={item.video_url} />
                        </video>
                      ) : (
                        <div className="admin-placeholder">No video</div>
                      )}
                      {item.poster_url ? (
                        <Image
                          src={item.poster_url}
                          alt={`${item.startup_name} poster`}
                          width={640}
                          height={360}
                          unoptimized
                          style={{ width: "100%", height: "auto" }}
                        />
                      ) : (
                        <div className="admin-placeholder">No poster</div>
                      )}
                    </div>
                    <div className="admin-actions">
                      <button
                        type="button"
                        className="danger"
                        disabled={hasActionInFlight}
                        onClick={() => void handleRemoveLivePitch(item)}
                      >
                        {actionId === removeActionId ? "Removing…" : "Remove video"}
                      </button>
                      <button
                        type="button"
                        className="danger-ghost"
                        disabled={hasActionInFlight}
                        onClick={() => void handleBlockStartup(item)}
                      >
                        {actionId === blockActionId ? "Blocking…" : "Block startup"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        <SiteFooter />
      </div>
    </AdRailsScaffold>
  );
}
