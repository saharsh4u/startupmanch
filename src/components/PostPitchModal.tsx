"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { bestDeals, recentlyListed } from "@/data/marketplace";
import {
  DEFAULT_STARTUP_PROFILE_FORM_VALUES,
  toStartupApiPayload,
  type StartupProfileFormValues,
} from "@/lib/startups/form";
import { hasBrowserSupabaseEnv, supabaseBrowser } from "@/lib/supabase/client";

type PostPitchModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess?: (message: string) => void;
};

type AuthStatus = "idle" | "loading" | "authed" | "error";
type RevenueMode = "self_reported" | "razorpay";

type FormErrors = Partial<
  Record<
    "startupName" | "startupCategory" | "startupOneLiner" | "startupWebsite" | "founderPhoto" | "pitchVideo" | "razorpayKey",
    string
  >
>;

type DraftPayload = {
  startup: Pick<
    StartupProfileFormValues,
    "name" | "category" | "one_liner" | "website" | "founder_photo_url" | "founder_story"
  >;
  revenueMode: RevenueMode;
};

const DRAFT_STORAGE_KEY = "post_pitch_modal_draft_v1";
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_FOUNDER_PHOTO_BYTES = 8 * 1024 * 1024;
const AUTH_UNAVAILABLE_MESSAGE = "Sign-in is temporarily unavailable. Please try again shortly.";
const SUCCESS_MESSAGE = "Pitch submitted. It should appear in the feed shortly.";
const RAZORPAY_KEYS_URL = "https://dashboard.razorpay.com/app/keys";

const isValidHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const readErrorMessage = async (response: Response, fallbackMessage: string) => {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? fallbackMessage;
  } catch {
    return fallbackMessage;
  }
};

const uploadToSignedUrl = async (signedUrl: string, file: File) => {
  const response = await fetch(signedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Upload failed (${response.status}). ${errorBody || ""}`.trim());
  }
};

const categorySuggestions = Array.from(
  new Set([...recentlyListed, ...bestDeals].map((item) => item.category.trim()).filter(Boolean))
).sort((left, right) => left.localeCompare(right));

const getOAuthCallbackTarget = (siteUrl: string | undefined) => {
  if (typeof window === "undefined") return undefined;

  const redirectBase = siteUrl?.trim() || window.location.origin;
  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.set("post_pitch", "1");

  const nextPath = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
  return `${redirectBase.replace(/\/+$/, "")}/auth/callback?next=${encodeURIComponent(nextPath)}`;
};

export default function PostPitchModal({ open, onClose, onSuccess }: PostPitchModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const loadedDraftRef = useRef(false);
  const [draftReady, setDraftReady] = useState(false);

  const [authStatus, setAuthStatus] = useState<AuthStatus>("idle");
  const [authError, setAuthError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [linkedinLoading, setLinkedinLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [startup, setStartup] = useState<StartupProfileFormValues>({
    ...DEFAULT_STARTUP_PROFILE_FORM_VALUES,
  });
  const [founderPhotoFile, setFounderPhotoFile] = useState<File | null>(null);
  const [founderPhotoPreviewUrl, setFounderPhotoPreviewUrl] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [revenueMode, setRevenueMode] = useState<RevenueMode>("self_reported");
  const [razorpayKey, setRazorpayKey] = useState("");
  const [revMessage, setRevMessage] = useState<string | null>(null);
  const [revStatus, setRevStatus] = useState<"idle" | "ready" | "error" | "saved">("idle");
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED !== "false";
  const linkedinEnabled = process.env.NEXT_PUBLIC_LINKEDIN_AUTH_ENABLED !== "false";

  const isAuthed = authStatus === "authed";
  const authBusy = authStatus === "loading" || googleLoading || linkedinLoading;

  const authHelperText = useMemo(() => {
    if (isAuthed && sessionEmail) return `Signed in as ${sessionEmail}`;
    if (authStatus === "loading") return "Checking session...";
    return "Sign in to post your pitch.";
  }, [authStatus, isAuthed, sessionEmail]);

  const founderPhotoUrlValue = startup.founder_photo_url.trim();
  const founderPhotoPreview = founderPhotoPreviewUrl || founderPhotoUrlValue || null;

  const videoHint = videoFile
    ? `${videoFile.name} (${(videoFile.size / (1024 * 1024)).toFixed(1)}MB)`
    : "MP4 up to 50MB";

  const saveDraft = (nextStartup: StartupProfileFormValues, nextRevenueMode: RevenueMode) => {
    if (typeof window === "undefined") return;

    const payload: DraftPayload = {
      startup: {
        name: nextStartup.name,
        category: nextStartup.category,
        one_liner: nextStartup.one_liner,
        website: nextStartup.website,
        founder_photo_url: nextStartup.founder_photo_url,
        founder_story: nextStartup.founder_story,
      },
      revenueMode: nextRevenueMode,
    };
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
  };

  const clearDraft = () => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  };

  const loadDraft = () => {
    if (typeof window === "undefined") return;
    if (loadedDraftRef.current) return;
    loadedDraftRef.current = true;

    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) {
      setDraftReady(true);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as DraftPayload;
      setStartup((current) => ({
        ...current,
        ...parsed.startup,
      }));
      setRevenueMode(parsed.revenueMode === "razorpay" ? "razorpay" : "self_reported");
    } catch {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    } finally {
      setDraftReady(true);
    }
  };

  const resetForm = () => {
    setStartup({ ...DEFAULT_STARTUP_PROFILE_FORM_VALUES });
    setFounderPhotoFile(null);
    setVideoFile(null);
    setRevenueMode("self_reported");
    setRazorpayKey("");
    setRevStatus("idle");
    setRevMessage(null);
    setFormErrors({});
    setSubmitMessage(null);
    setSubmitStatus("idle");
  };

  const updateStartupField = <K extends keyof StartupProfileFormValues>(
    key: K,
    value: StartupProfileFormValues[K]
  ) => {
    setStartup((current) => {
      const next = { ...current, [key]: value };
      saveDraft(next, revenueMode);
      return next;
    });
  };

  useEffect(() => {
    if (!open) return;
    loadDraft();
  }, [open]);

  useEffect(() => {
    if (!open || !draftReady) return;
    saveDraft(startup, revenueMode);
  }, [draftReady, open, revenueMode, startup]);

  useEffect(() => {
    if (!founderPhotoFile) {
      setFounderPhotoPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(founderPhotoFile);
    setFounderPhotoPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [founderPhotoFile]);

  useEffect(() => {
    if (!videoFile) {
      setVideoPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(videoFile);
    setVideoPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [videoFile]);

  useEffect(() => {
    if (!open) return;

    const run = async () => {
      if (!hasBrowserSupabaseEnv) {
        setAuthStatus("error");
        setAuthError(AUTH_UNAVAILABLE_MESSAGE);
        return;
      }
      setAuthStatus("loading");
      setAuthError(null);
      try {
        const { data } = await supabaseBrowser.auth.getSession();
        const session = data.session;
        if (!session) {
          setSessionEmail(null);
          setAuthStatus("idle");
          return;
        }
        setSessionEmail(session.user.email ?? null);
        setAuthStatus("authed");
        setGoogleLoading(false);
        setLinkedinLoading(false);
      } catch (error) {
        const message = error instanceof Error ? error.message : AUTH_UNAVAILABLE_MESSAGE;
        setAuthStatus("error");
        setAuthError(message);
      }
    };

    void run();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => firstInputRef.current?.focus(), 0);

    const handleKeydown = (event: KeyboardEvent) => {
      if (!panelRef.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea,input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hasAttribute("aria-hidden"));

      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [onClose, open]);

  const handleSignIn = async (mode: "signin" | "signup") => {
    if (!hasBrowserSupabaseEnv) {
      setAuthStatus("error");
      setAuthError(AUTH_UNAVAILABLE_MESSAGE);
      return;
    }
    setAuthError(null);
    setAuthStatus("loading");
    try {
      if (mode === "signup") {
        const { error } = await supabaseBrowser.auth.signUp({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      const { data } = await supabaseBrowser.auth.getSession();
      setSessionEmail(data.session?.user.email ?? null);
      setAuthStatus("authed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sign in.";
      setAuthError(message);
      setAuthStatus("error");
    }
  };

  const handleSignOut = async () => {
    if (!hasBrowserSupabaseEnv) return;
    await supabaseBrowser.auth.signOut();
    setSessionEmail(null);
    setAuthStatus("idle");
  };

  const handleGoogle = async () => {
    if (!hasBrowserSupabaseEnv) {
      setAuthStatus("error");
      setAuthError(AUTH_UNAVAILABLE_MESSAGE);
      return;
    }
    if (!googleEnabled) {
      setAuthError("Google sign-in is temporarily unavailable.");
      return;
    }
    const redirectTo = getOAuthCallbackTarget(siteUrl);
    try {
      setGoogleLoading(true);
      setAuthError(null);
      const { error } = await supabaseBrowser.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          scopes: "openid email profile",
          queryParams: {
            prompt: "select_account",
            access_type: "offline",
          },
        },
      });
      if (error) throw error;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google sign-in failed.";
      setAuthError(message);
      setGoogleLoading(false);
    }
  };

  const handleLinkedIn = async () => {
    if (!hasBrowserSupabaseEnv) {
      setAuthStatus("error");
      setAuthError(AUTH_UNAVAILABLE_MESSAGE);
      return;
    }
    if (!linkedinEnabled) {
      setAuthError("LinkedIn sign-in is temporarily unavailable.");
      return;
    }
    const redirectTo = getOAuthCallbackTarget(siteUrl);
    try {
      setLinkedinLoading(true);
      setAuthError(null);
      const { error } = await supabaseBrowser.auth.signInWithOAuth({
        provider: "linkedin_oidc",
        options: {
          redirectTo,
          scopes: "openid profile email",
        },
      });
      if (error) throw error;
    } catch (error) {
      const message = error instanceof Error ? error.message : "LinkedIn sign-in failed.";
      setAuthError(message);
      setLinkedinLoading(false);
    }
  };

  const validateForm = () => {
    const nextErrors: FormErrors = {};

    if (!startup.name.trim()) nextErrors.startupName = "Startup name is required.";
    if (!startup.category.trim()) nextErrors.startupCategory = "Category is required.";
    if (!startup.one_liner.trim()) nextErrors.startupOneLiner = "One-line description is required.";

    const websiteValue = startup.website.trim();
    if (websiteValue && !isValidHttpUrl(websiteValue)) {
      nextErrors.startupWebsite = "Website must be a valid http/https URL.";
    }

    const founderPhotoUrl = startup.founder_photo_url.trim();
    if (!founderPhotoFile && !founderPhotoUrl) {
      nextErrors.founderPhoto = "Founder photo is required (file upload or URL).";
    } else if (!founderPhotoFile && founderPhotoUrl && !isValidHttpUrl(founderPhotoUrl)) {
      nextErrors.founderPhoto = "Founder photo URL must be a valid http/https link.";
    } else if (founderPhotoFile && founderPhotoFile.size > MAX_FOUNDER_PHOTO_BYTES) {
      nextErrors.founderPhoto = "Founder photo is too large. Max 8MB.";
    }

    if (!videoFile) {
      nextErrors.pitchVideo = "Pitch video is required.";
    } else if (videoFile.size > MAX_VIDEO_BYTES) {
      nextErrors.pitchVideo = "Video is too large. Max 50MB.";
    }

    if (revenueMode === "razorpay" && !razorpayKey.trim()) {
      nextErrors.razorpayKey = "Razorpay key_id:key_secret is required.";
    }

    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    setSubmitMessage(null);
    if (!isAuthed) {
      setSubmitStatus("error");
      setSubmitMessage("Sign in to submit your pitch.");
      return;
    }
    if (!validateForm()) {
      setSubmitStatus("error");
      setSubmitMessage("Please fix the highlighted fields.");
      return;
    }
    if (!hasBrowserSupabaseEnv) {
      setSubmitStatus("error");
      setSubmitMessage(AUTH_UNAVAILABLE_MESSAGE);
      return;
    }

    setSubmitStatus("submitting");

    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        throw new Error("Please sign in first.");
      }

      const startupPayload = toStartupApiPayload({
        ...startup,
        city: "",
        currency_code: "INR",
        monthly_revenue: revenueMode === "self_reported" ? "Self-reported by founder" : "",
        founder_photo_url: founderPhotoFile ? "" : startup.founder_photo_url,
      });

      const startupRes = await fetch("/api/startups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(startupPayload),
      });
      if (!startupRes.ok) {
        throw new Error(await readErrorMessage(startupRes, "Startup creation failed."));
      }

      const startupResponse = (await startupRes.json()) as { startup?: { id?: string } };
      const startupId = startupResponse.startup?.id;
      if (!startupId) throw new Error("Startup creation failed.");

      if (founderPhotoFile) {
        const uploadLinkRes = await fetch(`/api/startups/${startupId}/founder-photo`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content_type: founderPhotoFile.type,
          }),
        });
        if (!uploadLinkRes.ok) {
          throw new Error(
            await readErrorMessage(uploadLinkRes, "Unable to create founder photo upload URL.")
          );
        }

        const uploadLinkPayload = (await uploadLinkRes.json()) as {
          upload?: { signedUrl?: string; publicUrl?: string | null };
        };
        const founderPhotoSignedUrl = uploadLinkPayload.upload?.signedUrl;
        const founderPhotoPublicUrl = uploadLinkPayload.upload?.publicUrl ?? null;
        if (!founderPhotoSignedUrl || !founderPhotoPublicUrl) {
          throw new Error("Founder photo upload URL missing.");
        }

        await uploadToSignedUrl(founderPhotoSignedUrl, founderPhotoFile);

        const patchStartupRes = await fetch(`/api/startups/${startupId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...startupPayload,
            founder_photo_url: founderPhotoPublicUrl,
          }),
        });
        if (!patchStartupRes.ok) {
          throw new Error(await readErrorMessage(patchStartupRes, "Unable to attach founder photo."));
        }
      }

      if (revenueMode === "razorpay" && razorpayKey.trim()) {
        const connectionRes = await fetch("/api/revenue/connections", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            startup_id: startupId,
            provider: "razorpay",
            api_key: razorpayKey.trim(),
          }),
        });
        if (!connectionRes.ok) {
          throw new Error(await readErrorMessage(connectionRes, "Unable to save Razorpay key."));
        }
        setRevStatus("saved");
        setRevMessage("Razorpay key saved. We will sync revenue shortly.");

        fetch(`/api/revenue/sync/${startupId}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => undefined);
      }

      const pitchRes = await fetch("/api/pitches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          startup_id: startupId,
          type: "elevator",
          duration_sec: 60,
        }),
      });
      if (!pitchRes.ok) {
        throw new Error(await readErrorMessage(pitchRes, "Pitch creation failed."));
      }

      const pitchPayload = (await pitchRes.json()) as {
        uploads?: { video?: { signedUrl?: string } };
      };
      const videoSignedUrl = pitchPayload.uploads?.video?.signedUrl;
      if (!videoSignedUrl || !videoFile) {
        throw new Error("Pitch video upload URL missing.");
      }

      await uploadToSignedUrl(videoSignedUrl, videoFile);

      clearDraft();
      loadedDraftRef.current = false;
      setDraftReady(false);
      setSubmitStatus("done");
      setSubmitMessage(SUCCESS_MESSAGE);
      resetForm();
      onSuccess?.(SUCCESS_MESSAGE);
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit pitch.";
      setSubmitStatus("error");
      setSubmitMessage(message);
    }
  };

  if (!open) return null;

  return (
    <div
      className="post-pitch-modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="post-pitch-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-pitch-modal-title"
        ref={panelRef}
      >
        <button
          type="button"
          className="post-pitch-modal-close"
          onClick={onClose}
          aria-label="Close post pitch modal"
        >
          Close
        </button>

        <header className="post-pitch-modal-header">
          <h3 id="post-pitch-modal-title">Post a Pitch</h3>
          <p>Share essentials only. Stay in flow.</p>
        </header>

        <div className="post-pitch-modal-grid">
          <section className="post-pitch-modal-media" aria-label="Pitch media">
            <div className="post-pitch-preview-tile">
              {videoPreviewUrl ? (
                <video src={videoPreviewUrl} controls muted playsInline preload="metadata" />
              ) : (
                <div className="post-pitch-preview-empty">
                  <p>Upload your 60-second MP4 pitch</p>
                  <span>{videoHint}</span>
                </div>
              )}
            </div>
            <label className="post-pitch-input-block">
              <span>Pitch video (required)</span>
              <input
                type="file"
                accept="video/mp4,video/*"
                onChange={(event) => {
                  setVideoFile(event.target.files?.[0] ?? null);
                  setFormErrors((current) => ({ ...current, pitchVideo: undefined }));
                }}
              />
              <small>{videoHint}</small>
            </label>
            {formErrors.pitchVideo ? <p className="form-error">{formErrors.pitchVideo}</p> : null}

            <label className="post-pitch-input-block">
              <span>Founder photo (required)</span>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  setFounderPhotoFile(event.target.files?.[0] ?? null);
                  setFormErrors((current) => ({ ...current, founderPhoto: undefined }));
                }}
              />
            </label>
            <label className="post-pitch-input-block">
              <span>or use founder photo URL</span>
              <input
                type="url"
                placeholder="https://example.com/founder.jpg"
                value={startup.founder_photo_url}
                onChange={(event) => {
                  updateStartupField("founder_photo_url", event.target.value);
                  setFormErrors((current) => ({ ...current, founderPhoto: undefined }));
                }}
              />
            </label>
            {founderPhotoPreview ? (
              <div className="post-pitch-founder-preview">
                <span>Founder preview</span>
                <div style={{ backgroundImage: `url(${founderPhotoPreview})` }} />
              </div>
            ) : null}
            {formErrors.founderPhoto ? <p className="form-error">{formErrors.founderPhoto}</p> : null}
          </section>

          <section className="post-pitch-modal-form" aria-label="Pitch details">
            <div className="post-pitch-auth-card">
              <div className="post-pitch-auth-head">
                <h4>Sign in</h4>
                <span>{authHelperText}</span>
              </div>
              {!isAuthed ? (
                <div className="post-pitch-auth-fields">
                  <input
                    ref={firstInputRef}
                    type="email"
                    placeholder="founder@startup.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <div className="post-pitch-auth-actions">
                    <button type="button" onClick={() => void handleSignIn("signin")} disabled={authBusy}>
                      Sign in
                    </button>
                    <button type="button" className="ghost" onClick={() => void handleSignIn("signup")} disabled={authBusy}>
                      Create account
                    </button>
                    <button type="button" className="ghost" onClick={() => void handleGoogle()} disabled={authBusy || !googleEnabled}>
                      Continue with Google
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => void handleLinkedIn()}
                      disabled={authBusy || !linkedinEnabled}
                    >
                      Continue with LinkedIn
                    </button>
                  </div>
                </div>
              ) : (
                <div className="post-pitch-auth-actions">
                  <button type="button" className="ghost" onClick={() => void handleSignOut()}>
                    Sign out
                  </button>
                </div>
              )}
              {authError ? <p className="form-error">{authError}</p> : null}
            </div>

            <div className="post-pitch-form-grid">
              <label className="post-pitch-input-block">
                <span>Startup Name</span>
                <input
                  type="text"
                  value={startup.name}
                  onChange={(event) => {
                    updateStartupField("name", event.target.value);
                    setFormErrors((current) => ({ ...current, startupName: undefined }));
                  }}
                />
              </label>
              {formErrors.startupName ? <p className="form-error">{formErrors.startupName}</p> : null}

              <label className="post-pitch-input-block">
                <span>Category</span>
                <input
                  type="text"
                  list="post-pitch-categories"
                  value={startup.category}
                  onChange={(event) => {
                    updateStartupField("category", event.target.value);
                    setFormErrors((current) => ({ ...current, startupCategory: undefined }));
                  }}
                />
                <datalist id="post-pitch-categories">
                  {categorySuggestions.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </label>
              {formErrors.startupCategory ? <p className="form-error">{formErrors.startupCategory}</p> : null}

              <label className="post-pitch-input-block">
                <span>One-line description</span>
                <input
                  type="text"
                  value={startup.one_liner}
                  onChange={(event) => {
                    updateStartupField("one_liner", event.target.value);
                    setFormErrors((current) => ({ ...current, startupOneLiner: undefined }));
                  }}
                />
              </label>
              {formErrors.startupOneLiner ? <p className="form-error">{formErrors.startupOneLiner}</p> : null}

              <label className="post-pitch-input-block">
                <span>Website (optional)</span>
                <input
                  type="url"
                  placeholder="https://startup.com"
                  value={startup.website}
                  onChange={(event) => {
                    updateStartupField("website", event.target.value);
                    setFormErrors((current) => ({ ...current, startupWebsite: undefined }));
                  }}
                />
              </label>
              {formErrors.startupWebsite ? <p className="form-error">{formErrors.startupWebsite}</p> : null}

              <label className="post-pitch-input-block">
                <span>Founder story (optional)</span>
                <textarea
                  rows={4}
                  placeholder="What pushed you to build this startup?"
                  value={startup.founder_story}
                  onChange={(event) => updateStartupField("founder_story", event.target.value)}
                />
              </label>

              <label className="post-pitch-input-block">
                <span>Revenue verification</span>
                <select
                  value={revenueMode}
                  onChange={(event) => {
                    const nextMode = event.target.value === "razorpay" ? "razorpay" : "self_reported";
                    setRevenueMode(nextMode);
                    setRevStatus("idle");
                    setRevMessage(null);
                    setFormErrors((current) => ({ ...current, razorpayKey: undefined }));
                    saveDraft(startup, nextMode);
                  }}
                >
                  <option value="self_reported">Self-Reported Revenue</option>
                  <option value="razorpay">Razorpay Verified (read-only)</option>
                </select>
              </label>

              {revenueMode === "self_reported" ? (
                <p className="post-pitch-note">
                  Self-reported revenue is shown with a grey badge and founder disclaimer.
                </p>
              ) : (
                <>
                  <a
                    href={RAZORPAY_KEYS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="post-pitch-key-link"
                  >
                    Open Razorpay dashboard to fetch key
                  </a>
                  <label className="post-pitch-input-block">
                    <span>Razorpay key_id:key_secret</span>
                    <input
                      type="text"
                      placeholder="rzp_live_xxx:your_secret"
                      value={razorpayKey}
                      onChange={(event) => {
                        setRazorpayKey(event.target.value);
                        setRevStatus("idle");
                        setRevMessage(null);
                        setFormErrors((current) => ({ ...current, razorpayKey: undefined }));
                      }}
                    />
                    <small>Fetch the key first, then paste it here for read-only verification.</small>
                  </label>
                  {formErrors.razorpayKey ? <p className="form-error">{formErrors.razorpayKey}</p> : null}
                  <div className="post-pitch-inline-actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        if (!razorpayKey.trim()) {
                          setRevStatus("error");
                          setRevMessage("Enter key_id:key_secret to continue.");
                          return;
                        }
                        setRevStatus("ready");
                        setRevMessage("Looks good. We will verify after submit.");
                      }}
                    >
                      Test & save
                    </button>
                  </div>
                </>
              )}

              {revMessage ? (
                <p className={`post-pitch-note ${revStatus === "error" ? "is-error" : ""}`}>
                  {revMessage}
                </p>
              ) : null}
            </div>

            <div className="post-pitch-submit-row">
              <button
                type="button"
                className="post-pitch-submit"
                onClick={() => void handleSubmit()}
                disabled={submitStatus === "submitting" || authBusy || !isAuthed}
              >
                {submitStatus === "submitting" ? "Submitting..." : "Submit pitch"}
              </button>
              {!isAuthed ? <p className="post-pitch-note">Sign in to enable submission.</p> : null}
              {submitMessage ? (
                <p className={`post-pitch-note ${submitStatus === "error" ? "is-error" : ""}`}>
                  {submitMessage}
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
