"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import TopNav from "@/components/TopNav";
import { hasBrowserSupabaseEnv, supabaseBrowser } from "@/lib/supabase/client";

type AuthStatus = "idle" | "loading" | "authed" | "error";

type StartupPayload = {
  name: string;
  category: string;
  city: string;
  one_liner: string;
  website: string;
  founder_photo_url: string;
  monthly_revenue: string;
};

type PitchPayload = {
  ask: string;
  type: "elevator" | "demo";
  duration_sec?: number;
};

type RevenueProvider = "stripe" | "razorpay";

const fieldIds = {
  authEmail: "auth-email",
  authPassword: "auth-password",
  startupName: "startup-name",
  startupCategory: "startup-category",
  startupCity: "startup-city",
  startupOneLiner: "startup-one-liner",
  startupWebsite: "startup-website",
  startupFounderPhotoUrl: "startup-founder-photo-url",
  startupMonthlyRevenue: "startup-monthly-revenue",
  revenueKey: "revenue-key",
  pitchAsk: "pitch-ask",
  pitchType: "pitch-type",
  pitchDuration: "pitch-duration",
  pitchVideo: "pitch-video",
  pitchPoster: "pitch-poster",
} as const;

type FieldKey = keyof typeof fieldIds;
type FieldErrors = Partial<Record<FieldKey, string>>;

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_POSTER_BYTES = 8 * 1024 * 1024;
const AUTH_UNAVAILABLE_MESSAGE = "Sign-in is temporarily unavailable. Please try again shortly.";
const DURATION_DEFAULTS: Record<PitchPayload["type"], number> = {
  elevator: 60,
  demo: 240,
};
const SUBMIT_VALIDATED_FIELDS: FieldKey[] = [
  "startupName",
  "startupCategory",
  "startupCity",
  "startupOneLiner",
  "startupWebsite",
  "startupFounderPhotoUrl",
  "pitchAsk",
  "pitchType",
  "pitchDuration",
  "pitchVideo",
  "pitchPoster",
];
const FIELD_LABELS: Record<FieldKey, string> = {
  authEmail: "Email",
  authPassword: "Password",
  startupName: "Startup / company name",
  startupCategory: "Category",
  startupCity: "City",
  startupOneLiner: "One-liner",
  startupWebsite: "Website",
  startupFounderPhotoUrl: "Founder photo URL",
  startupMonthlyRevenue: "Monthly revenue",
  revenueKey: "Revenue key",
  pitchAsk: "Ask",
  pitchType: "Pitch type",
  pitchDuration: "Duration",
  pitchVideo: "Pitch video",
  pitchPoster: "Poster image",
};

const isValidHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

export default function SubmitPage() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("idle");
  const [authError, setAuthError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [linkedinLoading, setLinkedinLoading] = useState(false);
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED !== "false";
  const linkedinEnabled = process.env.NEXT_PUBLIC_LINKEDIN_AUTH_ENABLED !== "false";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [startup, setStartup] = useState<StartupPayload>({
    name: "",
    category: "",
    city: "",
    one_liner: "",
    website: "",
    founder_photo_url: "",
    monthly_revenue: "",
  });

  const [pitch, setPitch] = useState<PitchPayload>({
    ask: "",
    type: "elevator",
    duration_sec: DURATION_DEFAULTS.elevator,
  });

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [posterFile, setPosterFile] = useState<File | null>(null);

  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [revProvider, setRevProvider] = useState<RevenueProvider>("stripe");
  const [revKey, setRevKey] = useState("");
  const [revStatus, setRevStatus] = useState<"idle" | "ready" | "error" | "saved">("idle");
  const [revMessage, setRevMessage] = useState<string | null>(null);

  const isAuthed = authStatus === "authed";
  const authBusy = authStatus === "loading" || googleLoading || linkedinLoading;

  const authHelperText = useMemo(() => {
    if (isAuthed && sessionEmail) return `Signed in as ${sessionEmail}`;
    if (authStatus === "loading") return "Checking session…";
    return "Sign in to post your pitch.";
  }, [authStatus, isAuthed, sessionEmail]);
  const errorSummaryItems = useMemo(
    () =>
      SUBMIT_VALIDATED_FIELDS.flatMap((field) => {
        const message = fieldErrors[field];
        if (!message) return [];
        return [{ field, message }];
      }),
    [fieldErrors]
  );
  const submitButtonLabel = useMemo(() => {
    if (submitStatus === "submitting") return "Submitting…";
    if (errorSummaryItems.length === 0) return "Submit pitch";
    return `Submit pitch (${errorSummaryItems.length} fix${errorSummaryItems.length > 1 ? "es" : ""})`;
  }, [submitStatus, errorSummaryItems.length]);

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
        if (session) {
          setSessionEmail(session.user.email ?? null);
          setAuthStatus("authed");
        } else {
          setAuthStatus("idle");
        }
      } catch (error: any) {
        setAuthStatus("error");
        setAuthError(error.message ?? AUTH_UNAVAILABLE_MESSAGE);
      }
    };
    init();
  }, []);

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
    } catch (error: any) {
      setAuthError(error.message ?? "Unable to sign in.");
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
    try {
      setGoogleLoading(true);
      setAuthError(null);
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const redirectBase = siteUrl || origin;
      const { error } = await supabaseBrowser.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectBase ? `${redirectBase.replace(/\/+$/, "")}/auth/callback` : undefined,
          scopes: "openid email profile",
          queryParams: {
            prompt: "select_account",
            access_type: "offline",
          },
        },
      });
      if (error) throw error;
    } catch (error: any) {
      setAuthError(error.message ?? "Google sign-in failed.");
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
    try {
      setLinkedinLoading(true);
      setAuthError(null);
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const redirectBase = siteUrl || origin;
      const { error } = await supabaseBrowser.auth.signInWithOAuth({
        provider: "linkedin_oidc",
        options: {
          redirectTo: redirectBase ? `${redirectBase.replace(/\/+$/, "")}/auth/callback` : undefined,
          scopes: "openid profile email",
        },
      });
      if (error) throw error;
    } catch (error: any) {
      setAuthError(error.message ?? "LinkedIn sign-in failed.");
      setLinkedinLoading(false);
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

  const clearFieldError = (field: FieldKey) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const focusField = (field: FieldKey) => {
    if (typeof document === "undefined") return;
    const element = document.getElementById(fieldIds[field]) as HTMLElement | null;
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    try {
      element.focus({ preventScroll: true });
    } catch {
      element.focus();
    }
  };

  const getFieldError = (field: FieldKey): string | null => {
    switch (field) {
      case "startupName":
        return startup.name.trim() ? null : "Startup name is required.";
      case "startupCategory":
        return startup.category.trim() ? null : "Category is required.";
      case "startupCity":
        return startup.city.trim() ? null : "City is required.";
      case "startupOneLiner":
        return startup.one_liner.trim() ? null : "One-liner is required.";
      case "startupWebsite": {
        const websiteValue = startup.website.trim();
        if (!websiteValue) return null;
        return isValidHttpUrl(websiteValue) ? null : "Enter a valid website URL (http/https).";
      }
      case "startupFounderPhotoUrl": {
        const founderPhotoUrlValue = startup.founder_photo_url.trim();
        if (!founderPhotoUrlValue) return null;
        return isValidHttpUrl(founderPhotoUrlValue)
          ? null
          : "Founder photo URL must be a valid http/https link.";
      }
      case "pitchAsk":
        return pitch.ask.trim() ? null : "Ask is required.";
      case "pitchType":
        return pitch.type ? null : "Pitch type is required.";
      case "pitchDuration":
        if (pitch.duration_sec == null || !Number.isFinite(pitch.duration_sec)) {
          return "Duration is required.";
        }
        if (pitch.duration_sec < 30 || pitch.duration_sec > 600) {
          return "Duration must be between 30 and 600 seconds.";
        }
        return null;
      case "pitchVideo":
        if (!videoFile) return "Please upload your pitch video.";
        if (videoFile.size > MAX_VIDEO_BYTES) return "Video too large. Max 50MB on the free plan.";
        return null;
      case "pitchPoster":
        if (!posterFile) return null;
        return posterFile.size > MAX_POSTER_BYTES ? "Poster too large. Max 8MB." : null;
      default:
        return null;
    }
  };

  const validateField = (field: FieldKey) => {
    const message = getFieldError(field);
    if (!message) {
      clearFieldError(field);
      return true;
    }
    setFieldErrors((prev) => ({ ...prev, [field]: message }));
    return false;
  };

  const handleFieldBlur = (field: FieldKey) => {
    validateField(field);
  };

  const getFieldA11yProps = (field: FieldKey) => ({
    "aria-invalid": Boolean(fieldErrors[field]),
    "aria-describedby": fieldErrors[field] ? `${fieldIds[field]}-error` : undefined,
  });

  const renderFieldError = (field: FieldKey) => {
    const message = fieldErrors[field];
    if (!message) return null;
    return (
      <p id={`${fieldIds[field]}-error`} className="form-error" role="alert">
        {message}
      </p>
    );
  };

  const handleSubmit = async () => {
    setSubmitMessage(null);
    const nextErrors: FieldErrors = {};
    for (const field of SUBMIT_VALIDATED_FIELDS) {
      const message = getFieldError(field);
      if (message) nextErrors[field] = message;
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setSubmitStatus("error");
      setSubmitMessage("Fix the highlighted fields and try again.");
      const firstInvalidField = SUBMIT_VALIDATED_FIELDS.find((field) => Boolean(nextErrors[field]));
      if (firstInvalidField) {
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(() => focusField(firstInvalidField));
        } else {
          focusField(firstInvalidField);
        }
      }
      return;
    }

    setFieldErrors({});
    setSubmitStatus("submitting");
    setRevStatus(revKey ? "ready" : "idle");

    try {
      if (!hasBrowserSupabaseEnv) {
        throw new Error(AUTH_UNAVAILABLE_MESSAGE);
      }
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        throw new Error("Please sign in first.");
      }

      const websiteValue = startup.website.trim();
      const socialLinks = {
        website: websiteValue || null,
      };

      const startupRes = await fetch("/api/startups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...startup,
          website: websiteValue || null,
          social_links: socialLinks,
        }),
      });

      if (!startupRes.ok) {
        const payload = await startupRes.json();
        throw new Error(payload.error ?? "Startup creation failed.");
      }

      const startupData = await startupRes.json();
      const startupId = startupData.startup?.id;
      if (!startupId) throw new Error("Startup creation failed.");

      if (revKey) {
        try {
          const revRes = await fetch("/api/revenue/connections", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              startup_id: startupId,
              provider: revProvider,
              api_key: revKey.trim(),
            }),
          });
          if (!revRes.ok) {
            const payload = await revRes.json();
            throw new Error(payload.error ?? "Revenue verification failed.");
          }
          setRevStatus("saved");
          setRevMessage("Revenue key saved. We’ll sync daily.");
        } catch (err: any) {
          setRevStatus("error");
          setRevMessage(err.message ?? "Unable to save revenue key.");
        }
      }

      const pitchRes = await fetch("/api/pitches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          startup_id: startupId,
          type: pitch.type,
          duration_sec: pitch.duration_sec,
          ask: pitch.ask,
        }),
      });

      if (!pitchRes.ok) {
        const payload = await pitchRes.json();
        throw new Error(payload.error ?? "Pitch creation failed.");
      }

      const pitchData = await pitchRes.json();
      const videoUpload = pitchData.uploads?.video?.signedUrl;
      const posterUpload = pitchData.uploads?.poster?.signedUrl;

      if (!videoUpload) {
        throw new Error("Upload URL missing.");
      }

      const selectedVideoFile = videoFile;
      if (!selectedVideoFile) {
        throw new Error("Pitch video is required.");
      }

      await uploadToSignedUrl(videoUpload, selectedVideoFile);

      if (posterUpload && posterFile) {
        await uploadToSignedUrl(posterUpload, posterFile);
      }

      setSubmitStatus("done");
      setSubmitMessage("Your pitch is under review. Approval in 24 hours.");
    } catch (error: any) {
      setSubmitStatus("error");
      setSubmitMessage(error.message ?? "Something went wrong.");
    }
  };

  return (
    <main className="page submit-page">
      <div className="submit-shell">
        <TopNav context="inner" />
        <header className="submit-hero">
          <Link href="/" className="hero-brand">
            <span className="brand-star">✦</span>
            <span>StartupManch</span>
          </Link>
          <h1>Post your pitch</h1>
          <p>Founders only. 60s pitch. Approval in 24 hours.</p>
          <Link href="/" className="back-home">
            ← Back to homepage
          </Link>
        </header>

        {errorSummaryItems.length > 0 ? (
          <section className="submit-card submit-error-summary" role="status" aria-live="polite">
            <div className="submit-card-header">
              <h2>Please fix these fields</h2>
              <span>
                {errorSummaryItems.length} issue{errorSummaryItems.length > 1 ? "s" : ""}
              </span>
            </div>
            <ul className="submit-error-list">
              {errorSummaryItems.map(({ field, message }) => (
                <li key={field}>
                  <button type="button" className="submit-error-link" onClick={() => focusField(field)}>
                    {FIELD_LABELS[field]}: {message}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="submit-card">
          <div className="submit-card-header">
            <h2>Sign in</h2>
            <span>{authHelperText}</span>
          </div>
          {!isAuthed ? (
            <div className="submit-grid">
              <div className="form-field">
                <label htmlFor={fieldIds.authEmail}>Email</label>
                <input
                  id={fieldIds.authEmail}
                  type="email"
                  required
                  placeholder="founder@startup.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="form-field">
                <label htmlFor={fieldIds.authPassword}>Password</label>
                <input
                  id={fieldIds.authPassword}
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="submit-actions">
                <button type="button" disabled={authBusy} onClick={() => handleSignIn("signin")}>
                  Sign in
                </button>
                <button type="button" className="ghost" disabled={authBusy} onClick={() => handleSignIn("signup")}>
                  Create account
                </button>
                {googleEnabled ? (
                  <button type="button" className="google-button" disabled={authBusy} onClick={handleGoogle}>
                    Continue with Google
                  </button>
                ) : (
                  <button type="button" className="google-button" disabled>
                    Google unavailable
                  </button>
                )}
                {linkedinEnabled ? (
                  <button type="button" className="google-button" disabled={authBusy} onClick={handleLinkedIn}>
                    Continue with LinkedIn
                  </button>
                ) : (
                  <button type="button" className="google-button" disabled>
                    LinkedIn unavailable
                  </button>
                )}
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

        <section className="submit-card">
          <div className="submit-card-header">
            <h2>Startup info</h2>
            <span>Short, crisp, Bharat‑first.</span>
          </div>
          <div className="submit-grid">
            <div className="form-field">
              <label htmlFor={fieldIds.startupName}>Startup / company name</label>
              <input
                id={fieldIds.startupName}
                type="text"
                required
                {...getFieldA11yProps("startupName")}
                placeholder="MasalaMile / MasalaMile Foods Pvt Ltd"
                value={startup.name}
                onBlur={() => handleFieldBlur("startupName")}
                onChange={(event) => {
                  clearFieldError("startupName");
                  setStartup({ ...startup, name: event.target.value });
                }}
              />
              {renderFieldError("startupName")}
            </div>
            <div className="form-field">
              <label htmlFor={fieldIds.startupCategory}>Category</label>
              <input
                id={fieldIds.startupCategory}
                type="text"
                required
                {...getFieldA11yProps("startupCategory")}
                placeholder="Food & Beverage"
                value={startup.category}
                onBlur={() => handleFieldBlur("startupCategory")}
                onChange={(event) => {
                  clearFieldError("startupCategory");
                  setStartup({ ...startup, category: event.target.value });
                }}
              />
              {renderFieldError("startupCategory")}
            </div>
            <div className="form-field">
              <label htmlFor={fieldIds.startupCity}>City</label>
              <input
                id={fieldIds.startupCity}
                type="text"
                required
                {...getFieldA11yProps("startupCity")}
                placeholder="Bengaluru"
                value={startup.city}
                onBlur={() => handleFieldBlur("startupCity")}
                onChange={(event) => {
                  clearFieldError("startupCity");
                  setStartup({ ...startup, city: event.target.value });
                }}
              />
              {renderFieldError("startupCity")}
            </div>
            <div className="form-field">
              <label htmlFor={fieldIds.startupOneLiner}>One‑liner</label>
              <input
                id={fieldIds.startupOneLiner}
                type="text"
                required
                {...getFieldA11yProps("startupOneLiner")}
                placeholder="Cloud kitchen for office teams"
                value={startup.one_liner}
                onBlur={() => handleFieldBlur("startupOneLiner")}
                onChange={(event) => {
                  clearFieldError("startupOneLiner");
                  setStartup({ ...startup, one_liner: event.target.value });
                }}
              />
              {renderFieldError("startupOneLiner")}
            </div>
            <div className="form-field">
              <label htmlFor={fieldIds.startupWebsite}>Website (optional)</label>
              <input
                id={fieldIds.startupWebsite}
                type="url"
                {...getFieldA11yProps("startupWebsite")}
                placeholder="https://startup.com"
                value={startup.website}
                onBlur={() => handleFieldBlur("startupWebsite")}
                onChange={(event) => {
                  clearFieldError("startupWebsite");
                  setStartup({ ...startup, website: event.target.value });
                }}
              />
              {renderFieldError("startupWebsite")}
            </div>
            <div className="form-field">
              <label htmlFor={fieldIds.startupFounderPhotoUrl}>Founder photo URL</label>
              <input
                id={fieldIds.startupFounderPhotoUrl}
                type="url"
                {...getFieldA11yProps("startupFounderPhotoUrl")}
                placeholder="https://images.unsplash.com/..."
                value={startup.founder_photo_url}
                onBlur={() => handleFieldBlur("startupFounderPhotoUrl")}
                onChange={(event) => {
                  clearFieldError("startupFounderPhotoUrl");
                  setStartup({ ...startup, founder_photo_url: event.target.value });
                }}
              />
              {renderFieldError("startupFounderPhotoUrl")}
            </div>
            <div className="form-field">
              <label htmlFor={fieldIds.startupMonthlyRevenue}>Monthly revenue</label>
              <input
                id={fieldIds.startupMonthlyRevenue}
                type="text"
                placeholder="$25k MRR"
                value={startup.monthly_revenue}
                onChange={(event) => setStartup({ ...startup, monthly_revenue: event.target.value })}
              />
            </div>
          </div>
        </section>

        <section className="submit-card">
          <div className="submit-card-header">
            <h2>Revenue verification (optional)</h2>
            <span>Improves trust. Read-only keys only.</span>
          </div>
          <div className="submit-grid revenue-verify-grid">
            <div className="rev-tabs">
              {(["stripe", "razorpay"] as RevenueProvider[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`chip ${revProvider === p ? "active" : ""}`}
                  onClick={() => setRevProvider(p)}
                >
                  {p === "stripe" ? "Stripe" : "Razorpay"}
                </button>
              ))}
              <span className="rev-chip muted">Optional · improves trust</span>
            </div>
            <div className="form-field rev-field">
              <label htmlFor={fieldIds.revenueKey}>
                {revProvider === "stripe" ? "Stripe restricted key" : "Razorpay key_id:key_secret"}
              </label>
              <input
                id={fieldIds.revenueKey}
                type="text"
                placeholder={revProvider === "stripe" ? "rk_live_..." : "rzp_live_xxx:your_secret"}
                value={revKey}
                onChange={(e) => {
                  setRevKey(e.target.value);
                  setRevStatus("idle");
                  setRevMessage(null);
                }}
              />
              <p className="form-hint">
                {revProvider === "stripe"
                  ? "Create a read-only Restricted key (Balance/Charges read). Don’t use your secret key."
                  : "Paste key_id and key_secret as key_id:key_secret. Read-only permissions only."}
              </p>
              <div className="rev-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    if (!revKey.trim()) {
                      setRevStatus("error");
                      setRevMessage("Enter a key to test.");
                      return;
                    }
                    setRevStatus("ready");
                    setRevMessage("Looks good. We’ll save and validate when you submit.");
                  }}
                >
                  Test & save
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setRevKey("");
                    setRevStatus("idle");
                    setRevMessage(null);
                  }}
                >
                  Remove key
                </button>
              </div>
              {revMessage ? <p className={`submit-note ${revStatus === "error" ? "submit-error" : ""}`}>{revMessage}</p> : null}
              <ul className="rev-checklist">
                <li>We’ll sync daily</li>
                <li>You can revoke anytime</li>
                <li>No write access</li>
              </ul>
              <p className="form-hint">Keys are encrypted at rest (AES-256-GCM) and never shown back to you.</p>
            </div>
          </div>
        </section>

        <section className="submit-card">
          <div className="submit-card-header">
            <h2>Pitch details</h2>
            <span>Keep it punchy.</span>
          </div>
          <div className="submit-grid">
            <div className="form-field">
              <label htmlFor={fieldIds.pitchAsk}>Ask</label>
              <input
                id={fieldIds.pitchAsk}
                type="text"
                required
                {...getFieldA11yProps("pitchAsk")}
                placeholder="₹50L"
                value={pitch.ask}
                onBlur={() => handleFieldBlur("pitchAsk")}
                onChange={(event) => {
                  clearFieldError("pitchAsk");
                  setPitch({ ...pitch, ask: event.target.value });
                }}
              />
              {renderFieldError("pitchAsk")}
            </div>
            <div className="form-field">
              <label htmlFor={fieldIds.pitchType}>Pitch type</label>
              <select
                id={fieldIds.pitchType}
                required
                {...getFieldA11yProps("pitchType")}
                value={pitch.type}
                onBlur={() => handleFieldBlur("pitchType")}
                onChange={(event) => {
                  clearFieldError("pitchType");
                  clearFieldError("pitchDuration");
                  const nextType = event.target.value as PitchPayload["type"];
                  setPitch((current) => {
                    const prevDefault = DURATION_DEFAULTS[current.type];
                    const nextDefault = DURATION_DEFAULTS[nextType];
                    const shouldAutoSet =
                      current.duration_sec == null || current.duration_sec === prevDefault;
                    return {
                      ...current,
                      type: nextType,
                      duration_sec: shouldAutoSet ? nextDefault : current.duration_sec,
                    };
                  });
                }}
              >
                <option value="elevator">Elevator (60s)</option>
                <option value="demo">Demo day (3–5 min)</option>
              </select>
              {renderFieldError("pitchType")}
            </div>
            <div className="form-field">
              <label htmlFor={fieldIds.pitchDuration}>Duration (seconds)</label>
              <input
                id={fieldIds.pitchDuration}
                type="number"
                required
                {...getFieldA11yProps("pitchDuration")}
                min={30}
                max={600}
                placeholder={String(DURATION_DEFAULTS[pitch.type])}
                value={pitch.duration_sec ?? ""}
                onBlur={() => handleFieldBlur("pitchDuration")}
                onChange={(event) => {
                  clearFieldError("pitchDuration");
                  setPitch({
                    ...pitch,
                    duration_sec: event.target.value ? Number(event.target.value) : undefined,
                  });
                }}
              />
              {renderFieldError("pitchDuration")}
              <span className="form-hint">
                Suggested: {DURATION_DEFAULTS[pitch.type]}s for {pitch.type === "elevator" ? "elevator" : "demo"} pitch.
              </span>
            </div>
            <div className="form-field">
              <label htmlFor={fieldIds.pitchVideo}>Pitch video (MP4)</label>
              <input
                id={fieldIds.pitchVideo}
                type="file"
                required
                {...getFieldA11yProps("pitchVideo")}
                accept="video/mp4,video/*"
                onBlur={() => handleFieldBlur("pitchVideo")}
                onChange={(event) => {
                  clearFieldError("pitchVideo");
                  setVideoFile(event.target.files?.[0] ?? null);
                }}
              />
              {renderFieldError("pitchVideo")}
              <span className="form-hint">Max 50MB. Use 60s elevator pitch.</span>
            </div>
            <div className="form-field">
              <label htmlFor={fieldIds.pitchPoster}>Poster image (optional)</label>
              <input
                id={fieldIds.pitchPoster}
                type="file"
                {...getFieldA11yProps("pitchPoster")}
                accept="image/*"
                onBlur={() => handleFieldBlur("pitchPoster")}
                onChange={(event) => {
                  clearFieldError("pitchPoster");
                  setPosterFile(event.target.files?.[0] ?? null);
                }}
              />
              {renderFieldError("pitchPoster")}
              <span className="form-hint">Max 8MB.</span>
            </div>
          </div>
          <div className="submit-actions">
            <button
              type="button"
              disabled={submitStatus === "submitting" || authBusy || !isAuthed}
              onClick={handleSubmit}
            >
              {submitButtonLabel}
            </button>
            {!isAuthed ? <p className="submit-note submit-auth-gate">Sign in above to enable submission.</p> : null}
            {submitMessage ? <p className="submit-note">{submitMessage}</p> : null}
          </div>
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}
