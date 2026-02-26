"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  instagram_url: string | null;
  poster_url: string | null;
};

type ModerationItem = QueueItem & {
  startup_status: string | null;
  pitch_status: string | null;
  approved_at: string | null;
  created_at: string | null;
};

type AuthStatus = "idle" | "loading" | "authed" | "error";

type AdminStartupOption = {
  id: string;
  name: string;
  status: string | null;
  category: string | null;
  city: string | null;
};

const AUTH_UNAVAILABLE_MESSAGE = "Admin sign-in is temporarily unavailable. Please try again shortly.";
const VIDEO_PROCESSING_STATES = new Set(["queued", "processing"]);
const CATEGORY_MAX_LENGTH = 80;

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
  const [startupOptions, setStartupOptions] = useState<AdminStartupOption[]>([]);
  const [startupOptionsError, setStartupOptionsError] = useState<string | null>(null);
  const [embedStartupId, setEmbedStartupId] = useState("");
  const [embedStartupName, setEmbedStartupName] = useState("");
  const [embedCategory, setEmbedCategory] = useState("");
  const [embedInstagramUrl, setEmbedInstagramUrl] = useState("");
  const [embedNote, setEmbedNote] = useState<string | null>(null);
  const [embedError, setEmbedError] = useState<string | null>(null);
  const [categoryDraftByStartup, setCategoryDraftByStartup] = useState<Record<string, string>>({});

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
    const res = await fetch("/api/admin/moderation?limit=400", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload.error ?? "Unable to load moderation feed.");
    }
    setModeration((payload.items ?? []) as ModerationItem[]);
  }, []);

  const loadApprovedStartups = useCallback(async (token: string) => {
    setStartupOptionsError(null);
    const res = await fetch("/api/admin/startups?status=approved&limit=400", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload.error ?? "Unable to load startup list.");
    }
    const items = (payload.items ?? []) as AdminStartupOption[];
    setStartupOptions(items);
    setEmbedStartupId((current) => {
      if (current && items.some((item) => item.id === current)) return current;
      return "";
    });
  }, []);

  const refreshAdminData = useCallback(async (token: string) => {
    const [queueResult, moderationResult, startupsResult] = await Promise.allSettled([
      loadQueue(token),
      loadModeration(token),
      loadApprovedStartups(token),
    ]);
    if (queueResult.status === "rejected") {
      setQueueError(errorMessage(queueResult.reason, "Unable to load queue."));
    }
    if (moderationResult.status === "rejected") {
      setModerationError(errorMessage(moderationResult.reason, "Unable to load moderation feed."));
    }
    if (startupsResult.status === "rejected") {
      setStartupOptionsError(errorMessage(startupsResult.reason, "Unable to load startup list."));
    }
  }, [loadApprovedStartups, loadModeration, loadQueue]);

  const knownCategories = useMemo(
    () =>
      Array.from(
        new Set(
          startupOptions
            .map((item) => (item.category ?? "").trim())
            .filter((value) => value.length > 0)
        )
      ).sort((left, right) => left.localeCompare(right)),
    [startupOptions]
  );

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

  useEffect(() => {
    if (!embedStartupId) return;
    const selected = startupOptions.find((item) => item.id === embedStartupId);
    if (!selected?.category) return;
    setEmbedCategory((current) => (current.trim().length ? current : selected.category ?? ""));
  }, [embedStartupId, startupOptions]);

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
    setStartupOptions([]);
    setEmbedStartupId("");
    setEmbedStartupName("");
    setEmbedCategory("");
    setEmbedInstagramUrl("");
    setEmbedNote(null);
    setEmbedError(null);
    setCategoryDraftByStartup({});
    setAuthStatus("idle");
  };

  const resolveStartupFromInput = () => {
    const selectedId = embedStartupId.trim();
    if (selectedId.length) {
      const selected = startupOptions.find((item) => item.id === selectedId);
      return { id: selectedId, name: selected?.name ?? null };
    }

    const typed = embedStartupName.trim();
    if (!typed.length) return null;

    const normalized = typed.toLowerCase();
    const exactMatches = startupOptions.filter(
      (item) => item.name?.trim().toLowerCase() === normalized
    );
    if (exactMatches.length === 1) {
      return { id: exactMatches[0].id, name: exactMatches[0].name ?? null };
    }

    const partialMatches = startupOptions.filter((item) =>
      (item.name ?? "").toLowerCase().includes(normalized)
    );
    if (partialMatches.length === 1) {
      return { id: partialMatches[0].id, name: partialMatches[0].name ?? null };
    }

    return { id: null, name: typed };
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

  const handlePublishInstagramEmbed = async () => {
    if (!sessionToken) return;
    if (!embedInstagramUrl.trim()) {
      setEmbedError("Instagram Reel/Post URL is required.");
      return;
    }
    const category = embedCategory.trim().slice(0, CATEGORY_MAX_LENGTH);
    if (!category.length) {
      setEmbedError("Category is required. Choose one or type manually.");
      return;
    }

    const startupInput = resolveStartupFromInput();
    if (!startupInput) {
      setEmbedError("Select or enter a startup name first.");
      return;
    }

    const nextActionId = "embed-publish";
    setActionId(nextActionId);
    setEmbedError(null);
    setEmbedNote(null);

    try {
      const res = await fetch("/api/admin/pitches/embed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          startup_id: startupInput.id,
          startup_name: startupInput.name,
          category,
          instagram_url: embedInstagramUrl,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? "Unable to publish Instagram embed.");

      const startupName = payload?.pitch?.startup_name;
      setEmbedNote(
        startupName
          ? `Published Instagram embed for ${startupName}. It should appear live shortly.`
          : "Published Instagram embed. It should appear live shortly."
      );
      setEmbedStartupName("");
      setEmbedCategory("");
      setEmbedInstagramUrl("");
      await refreshAdminData(sessionToken);
    } catch (error) {
      setEmbedError(errorMessage(error, "Unable to publish Instagram embed."));
    } finally {
      setActionId(null);
    }
  };

  const categoryDraftValue = (startupId: string, fallbackCategory: string | null) => {
    if (Object.prototype.hasOwnProperty.call(categoryDraftByStartup, startupId)) {
      return categoryDraftByStartup[startupId] ?? "";
    }
    return fallbackCategory ?? "";
  };

  const handleCategoryDraftChange = (startupId: string, value: string) => {
    setCategoryDraftByStartup((current) => ({
      ...current,
      [startupId]: value.slice(0, CATEGORY_MAX_LENGTH),
    }));
  };

  const handleSaveStartupCategory = async (
    startupId: string,
    startupName: string,
    fallbackCategory: string | null,
    noteTarget: "queue" | "moderation"
  ) => {
    if (!sessionToken) return;
    const category = categoryDraftValue(startupId, fallbackCategory).trim().slice(0, CATEGORY_MAX_LENGTH);
    if (!category.length) {
      if (noteTarget === "queue") {
        setQueueError("Category is required.");
      } else {
        setModerationError("Category is required.");
      }
      return;
    }

    const nextActionId = `category-save-${noteTarget}-${startupId}`;
    setActionId(nextActionId);
    if (noteTarget === "queue") {
      setQueueError(null);
      setQueueNote(null);
    } else {
      setModerationError(null);
      setModerationNote(null);
    }

    try {
      const res = await fetch(`/api/admin/startups/${startupId}/category`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ category }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? "Unable to update category.");

      const savedCategory = payload?.startup?.category ?? category;
      setCategoryDraftByStartup((current) => ({
        ...current,
        [startupId]: savedCategory,
      }));
      if (noteTarget === "queue") {
        setQueueNote(`Updated category for "${startupName}" to ${savedCategory}.`);
      } else {
        setModerationNote(`Updated category for "${startupName}" to ${savedCategory}.`);
      }
      await refreshAdminData(sessionToken);
    } catch (error) {
      if (noteTarget === "queue") {
        setQueueError(errorMessage(error, "Unable to update category."));
      } else {
        setModerationError(errorMessage(error, "Unable to update category."));
      }
    } finally {
      setActionId(null);
    }
  };

  const handleDeleteStartupPermanently = async () => {
    if (!sessionToken) return;

    const startupInput = resolveStartupFromInput();
    if (!startupInput) {
      setEmbedError("Select or enter a startup name first.");
      return;
    }
    if (!startupInput.id) {
      setEmbedError("Startup name did not match a unique startup. Select from dropdown.");
      return;
    }

    const startup = startupOptions.find((item) => item.id === startupInput.id);
    const startupLabel = startup?.name ?? startupInput.name ?? "this startup";
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        `Delete ${startupLabel} permanently from database? This also deletes its pitches.`
      );
      if (!confirmed) return;
    }

    const nextActionId = "startup-delete";
    setActionId(nextActionId);
    setEmbedError(null);
    setEmbedNote(null);

    try {
      const res = await fetch(`/api/admin/startups/${startupInput.id}/delete`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? "Unable to delete startup.");

      setEmbedNote(`Deleted ${payload?.startup?.name ?? "startup"} from database.`);
      setEmbedStartupId("");
      setEmbedStartupName("");
      setEmbedCategory("");
      await refreshAdminData(sessionToken);
    } catch (error) {
      setEmbedError(errorMessage(error, "Unable to delete startup."));
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
            <h3>Publish Instagram embed</h3>
            <span>Auto-publishes to live feed</span>
          </div>
          <p className="admin-section-note">
            Paste an Instagram Reel/Post URL and publish it instantly from admin. This bypasses queue and goes live.
          </p>
          {startupOptionsError ? <p className="submit-error">{startupOptionsError}</p> : null}
          {embedError ? <p className="submit-error">{embedError}</p> : null}
          {embedNote ? <p className="submit-note">{embedNote}</p> : null}
          <div className="submit-grid">
            <div className="form-field">
              <label>Startup (optional picker)</label>
              <select
                value={embedStartupId}
                onChange={(event) => {
                  const nextStartupId = event.target.value;
                  setEmbedStartupId(nextStartupId);
                  const selected = startupOptions.find((item) => item.id === nextStartupId);
                  if (selected?.category) {
                    setEmbedCategory(selected.category);
                  }
                }}
                disabled={!sessionToken || hasActionInFlight}
              >
                <option value="">
                  {startupOptions.length === 0 ? "No approved startups found" : "Select startup"}
                </option>
                {startupOptions.map((startup) => (
                  <option key={startup.id} value={startup.id}>
                    {startup.name}
                    {startup.category ? ` · ${startup.category}` : ""}
                    {startup.city ? ` · ${startup.city}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Startup name (or type and publish)</label>
              <input
                type="text"
                list="admin-startup-names"
                placeholder="Saharash"
                value={embedStartupName}
                onChange={(event) => setEmbedStartupName(event.target.value)}
                disabled={!sessionToken || hasActionInFlight}
              />
              <datalist id="admin-startup-names">
                {startupOptions.map((startup) => (
                  <option key={`name-${startup.id}`} value={startup.name} />
                ))}
              </datalist>
            </div>
            <div className="form-field">
              <label>Category</label>
              <input
                type="text"
                list="admin-startup-categories"
                placeholder="Fintech, AI, SaaS..."
                value={embedCategory}
                onChange={(event) => setEmbedCategory(event.target.value.slice(0, CATEGORY_MAX_LENGTH))}
                disabled={!sessionToken || hasActionInFlight}
              />
              <datalist id="admin-startup-categories">
                {knownCategories.map((category) => (
                  <option key={`category-${category}`} value={category} />
                ))}
              </datalist>
            </div>
            <div className="form-field">
              <label>Instagram URL / shorthand</label>
              <input
                type="text"
                placeholder="URL, reel/ABC123, or Instagram embed code"
                value={embedInstagramUrl}
                onChange={(event) => setEmbedInstagramUrl(event.target.value)}
                disabled={!sessionToken || hasActionInFlight}
              />
            </div>
            <div className="submit-actions">
              <button
                type="button"
                disabled={!sessionToken || hasActionInFlight}
                onClick={() => void handlePublishInstagramEmbed()}
              >
                {actionId === "embed-publish" ? "Publishing…" : "Publish embed"}
              </button>
              <button
                type="button"
                className="danger"
                disabled={!sessionToken || hasActionInFlight}
                onClick={() => void handleDeleteStartupPermanently()}
              >
                {actionId === "startup-delete" ? "Deleting…" : "Delete startup permanently"}
              </button>
            </div>
          </div>
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
                const categoryActionId = `category-save-queue-${item.startup_id}`;
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
                        {item.instagram_url ? <span>Source: Instagram embed</span> : null}
                        {processingStatus && processingStatus !== "pending" ? (
                          <span>Video: {processingStatus}</span>
                        ) : null}
                        {isFailed && item.video_error ? <span>Reason: {item.video_error}</span> : null}
                      </div>
                      <div className="admin-inline-category">
                        <label htmlFor={`queue-category-${item.pitch_id}`}>Category</label>
                        <input
                          id={`queue-category-${item.pitch_id}`}
                          type="text"
                          list="admin-startup-categories"
                          value={categoryDraftValue(item.startup_id, item.category)}
                          onChange={(event) =>
                            handleCategoryDraftChange(item.startup_id, event.target.value)
                          }
                          disabled={!sessionToken || hasActionInFlight}
                        />
                      </div>
                    </div>
                    <div className="admin-media">
                      {item.video_url ? (
                        <video controls preload="none" poster={item.poster_url ?? undefined}>
                          <source src={item.video_url} />
                        </video>
                      ) : item.instagram_url ? (
                        <a href={item.instagram_url} target="_blank" rel="noreferrer noopener">
                          Open Instagram post
                        </a>
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
                      <button
                        type="button"
                        className="ghost"
                        disabled={!sessionToken || hasActionInFlight}
                        onClick={() =>
                          void handleSaveStartupCategory(
                            item.startup_id,
                            item.startup_name,
                            item.category,
                            "queue"
                          )
                        }
                      >
                        {actionId === categoryActionId ? "Saving…" : "Save category"}
                      </button>
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
                const categoryActionId = `category-save-moderation-${item.startup_id}`;

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
                        {item.instagram_url ? <span>Source: Instagram embed</span> : null}
                        {item.duration_sec ? <span>{item.duration_sec}s</span> : null}
                        {item.ask ? <span>Ask {item.ask}</span> : null}
                        {item.approved_at ? (
                          <span>Approved: {new Date(item.approved_at).toLocaleString()}</span>
                        ) : null}
                      </div>
                      <div className="admin-inline-category">
                        <label htmlFor={`mod-category-${item.pitch_id}`}>Category</label>
                        <input
                          id={`mod-category-${item.pitch_id}`}
                          type="text"
                          list="admin-startup-categories"
                          value={categoryDraftValue(item.startup_id, item.category)}
                          onChange={(event) =>
                            handleCategoryDraftChange(item.startup_id, event.target.value)
                          }
                          disabled={!sessionToken || hasActionInFlight}
                        />
                      </div>
                    </div>
                    <div className="admin-media">
                      {item.video_url ? (
                        <video controls preload="none" poster={item.poster_url ?? undefined}>
                          <source src={item.video_url} />
                        </video>
                      ) : item.instagram_url ? (
                        <a href={item.instagram_url} target="_blank" rel="noreferrer noopener">
                          Open Instagram post
                        </a>
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
                        className="ghost"
                        disabled={!sessionToken || hasActionInFlight}
                        onClick={() =>
                          void handleSaveStartupCategory(
                            item.startup_id,
                            item.startup_name,
                            item.category,
                            "moderation"
                          )
                        }
                      >
                        {actionId === categoryActionId ? "Saving…" : "Save category"}
                      </button>
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
