"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
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
  video_url: string | null;
  poster_url: string | null;
};

type AuthStatus = "idle" | "loading" | "authed" | "error";
const AUTH_UNAVAILABLE_MESSAGE = "Admin sign-in is temporarily unavailable. Please try again shortly.";

export default function AdminPage() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("idle");
  const [authError, setAuthError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadQueue = async (token: string) => {
    setQueueError(null);
    const res = await fetch("/api/admin/queue", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const payload = await res.json();
      throw new Error(payload.error ?? "Unable to load queue.");
    }
    const payload = await res.json();
    setQueue((payload.startups ?? []) as QueueItem[]);
  };

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
        await loadQueue(session.access_token);
      } catch (error: any) {
        setAuthStatus("error");
        setAuthError(error.message ?? AUTH_UNAVAILABLE_MESSAGE);
      }
    };
    init();
  }, []);

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
      try {
        await loadQueue(token);
      } catch (loadError: any) {
        setQueueError(loadError.message ?? "Unable to load queue.");
      }
    }
  };

  const handleSignOut = async () => {
    if (!hasBrowserSupabaseEnv) return;
    await supabaseBrowser.auth.signOut();
    setSessionToken(null);
    setQueue([]);
    setAuthStatus("idle");
  };

  const handleDecision = async (item: QueueItem, action: "approve" | "reject") => {
    if (!sessionToken) return;
    setActionId(item.pitch_id);
    try {
      const res = await fetch(`/api/admin/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ startup_id: item.startup_id, pitch_id: item.pitch_id }),
      });
      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error ?? "Action failed.");
      }
      await loadQueue(sessionToken);
    } catch (error: any) {
      setQueueError(error.message ?? "Action failed.");
    } finally {
      setActionId(null);
    }
  };

  return (
    <main className="page admin-page">
      <div className="admin-shell">
        <TopNav context="inner" />
        <header className="admin-hero">
          <div className="hero-brand">
            <span className="brand-star">✦</span>
            <span>StartupManch</span>
          </div>
          <h1>Admin Queue</h1>
          <p>Approve or reject founder submissions.</p>
        </header>

        <section className="admin-card">
          <div className="admin-card-header">
            <h3>Admin access</h3>
            <span>{authStatus === "authed" ? "Signed in" : "Sign in to manage approvals."}</span>
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
                <button type="button" onClick={handleSignIn}>
                  Sign in
                </button>
              </div>
              {authError ? <p className="submit-error">{authError}</p> : null}
            </div>
          ) : (
            <div className="submit-actions">
              <button type="button" className="ghost" onClick={handleSignOut}>
                Sign out
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
          {queue.length === 0 ? (
            <p className="admin-empty">No pending pitches right now.</p>
          ) : (
            <div className="admin-list">
              {queue.map((item) => (
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
                      disabled={actionId === item.pitch_id}
                      onClick={() => handleDecision(item, "approve")}
                    >
                      {actionId === item.pitch_id ? "Approving…" : "Approve"}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={actionId === item.pitch_id}
                      onClick={() => handleDecision(item, "reject")}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}
