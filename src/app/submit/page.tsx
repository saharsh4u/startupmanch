"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type AuthStatus = "idle" | "loading" | "authed" | "error";

type StartupPayload = {
  name: string;
  category: string;
  city: string;
  one_liner: string;
  website: string;
  is_d2c: boolean;
  founder_photo_url: string;
  founder_story: string;
  monthly_revenue: string;
  linkedin: string;
  twitter: string;
  instagram: string;
};

type PitchPayload = {
  ask: string;
  equity: string;
  valuation: string;
  type: "elevator" | "demo";
  duration_sec?: number;
};

export default function SubmitPage() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("idle");
  const [authError, setAuthError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [startup, setStartup] = useState<StartupPayload>({
    name: "",
    category: "",
    city: "",
    one_liner: "",
    website: "",
    is_d2c: false,
    founder_photo_url: "",
    founder_story: "",
    monthly_revenue: "",
    linkedin: "",
    twitter: "",
    instagram: "",
  });

  const [pitch, setPitch] = useState<PitchPayload>({
    ask: "",
    equity: "",
    valuation: "",
    type: "elevator",
  });

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [posterFile, setPosterFile] = useState<File | null>(null);

  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  const isAuthed = authStatus === "authed";

  const authHelperText = useMemo(() => {
    if (isAuthed && sessionEmail) return `Signed in as ${sessionEmail}`;
    if (authStatus === "loading") return "Checking session…";
    return "Sign in to post your pitch.";
  }, [authStatus, isAuthed, sessionEmail]);

  useEffect(() => {
    const init = async () => {
      setAuthStatus("loading");
      const { data } = await supabaseBrowser.auth.getSession();
      const session = data.session;
      if (session) {
        setSessionEmail(session.user.email ?? null);
        setAuthStatus("authed");
      } else {
        setAuthStatus("idle");
      }
    };
    init();
  }, []);

  const handleSignIn = async (mode: "signin" | "signup") => {
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
    await supabaseBrowser.auth.signOut();
    setSessionEmail(null);
    setAuthStatus("idle");
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

  const handleSubmit = async () => {
    setSubmitStatus("submitting");
    setSubmitMessage(null);

    try {
      if (!startup.name) {
        throw new Error("Startup name is required.");
      }
      if (!videoFile) {
        throw new Error("Please upload your pitch video.");
      }
      const maxVideoBytes = 50 * 1024 * 1024;
      if (videoFile.size > maxVideoBytes) {
        throw new Error("Video too large. Max 50MB on the free plan.");
      }

      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        throw new Error("Please sign in first.");
      }

      const socialLinks = {
        website: startup.website || null,
        linkedin: startup.linkedin || null,
        twitter: startup.twitter || null,
        instagram: startup.instagram || null,
      };

      const startupRes = await fetch("/api/startups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...startup,
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
          equity: pitch.equity,
          valuation: pitch.valuation,
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

      await uploadToSignedUrl(videoUpload, videoFile);

      if (posterUpload && posterFile) {
        const maxPosterBytes = 8 * 1024 * 1024;
        if (posterFile.size > maxPosterBytes) {
          throw new Error("Poster too large. Max 8MB.");
        }
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
        <header className="submit-hero">
          <div className="hero-brand">
            <span className="brand-star">✦</span>
            <span>StartupManch</span>
          </div>
          <h1>Post your pitch</h1>
          <p>Founders only. 60s pitch. Approval in 24 hours.</p>
        </header>

        <section className="submit-card">
          <div className="submit-card-header">
            <h3>Sign in</h3>
            <span>{authHelperText}</span>
          </div>
          {!isAuthed ? (
            <div className="submit-grid">
              <div className="form-field">
                <label>Email</label>
                <input
                  type="email"
                  placeholder="founder@startup.com"
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
                <button type="button" onClick={() => handleSignIn("signin")}>
                  Sign in
                </button>
                <button type="button" className="ghost" onClick={() => handleSignIn("signup")}>
                  Create account
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

        <section className="submit-card">
          <div className="submit-card-header">
            <h3>Startup info</h3>
            <span>Short, crisp, Bharat‑first.</span>
          </div>
          <div className="submit-grid">
            <div className="form-field">
              <label>Startup name</label>
              <input
                type="text"
                placeholder="MasalaMile"
                value={startup.name}
                onChange={(event) => setStartup({ ...startup, name: event.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Category</label>
              <input
                type="text"
                placeholder="Food & Beverage"
                value={startup.category}
                onChange={(event) => setStartup({ ...startup, category: event.target.value })}
              />
            </div>
            <div className="form-field">
              <label>City</label>
              <input
                type="text"
                placeholder="Bengaluru"
                value={startup.city}
                onChange={(event) => setStartup({ ...startup, city: event.target.value })}
              />
            </div>
            <div className="form-field">
              <label>One‑liner</label>
              <input
                type="text"
                placeholder="Cloud kitchen for office teams"
                value={startup.one_liner}
                onChange={(event) => setStartup({ ...startup, one_liner: event.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Website</label>
              <input
                type="url"
                placeholder="https://startup.com"
                value={startup.website}
                onChange={(event) => setStartup({ ...startup, website: event.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Founder photo URL</label>
              <input
                type="url"
                placeholder="https://images.unsplash.com/..."
                value={startup.founder_photo_url}
                onChange={(event) => setStartup({ ...startup, founder_photo_url: event.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Founder story / background</label>
              <textarea
                placeholder="Ex-Flipkart PM building AI for retail..."
                value={startup.founder_story}
                onChange={(event) => setStartup({ ...startup, founder_story: event.target.value })}
                rows={3}
              />
            </div>
            <div className="form-field">
              <label>Monthly revenue</label>
              <input
                type="text"
                placeholder="$25k MRR"
                value={startup.monthly_revenue}
                onChange={(event) => setStartup({ ...startup, monthly_revenue: event.target.value })}
              />
            </div>
            <div className="form-field">
              <label>LinkedIn</label>
              <input
                type="url"
                placeholder="https://linkedin.com/in/you"
                value={startup.linkedin}
                onChange={(event) => setStartup({ ...startup, linkedin: event.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Twitter</label>
              <input
                type="url"
                placeholder="https://twitter.com/you"
                value={startup.twitter}
                onChange={(event) => setStartup({ ...startup, twitter: event.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Instagram</label>
              <input
                type="url"
                placeholder="https://instagram.com/you"
                value={startup.instagram}
                onChange={(event) => setStartup({ ...startup, instagram: event.target.value })}
              />
            </div>
            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={startup.is_d2c}
                onChange={(event) => setStartup({ ...startup, is_d2c: event.target.checked })}
              />
              <span>D2C / Physical product</span>
            </label>
          </div>
        </section>

        <section className="submit-card">
          <div className="submit-card-header">
            <h3>Pitch details</h3>
            <span>Keep it punchy.</span>
          </div>
          <div className="submit-grid">
            <div className="form-field">
              <label>Ask</label>
              <input
                type="text"
                placeholder="₹50L"
                value={pitch.ask}
                onChange={(event) => setPitch({ ...pitch, ask: event.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Equity</label>
              <input
                type="text"
                placeholder="2%"
                value={pitch.equity}
                onChange={(event) => setPitch({ ...pitch, equity: event.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Valuation</label>
              <input
                type="text"
                placeholder="₹25 Cr"
                value={pitch.valuation}
                onChange={(event) => setPitch({ ...pitch, valuation: event.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Pitch type</label>
              <select
                value={pitch.type}
                onChange={(event) => setPitch({ ...pitch, type: event.target.value as "elevator" | "demo" })}
              >
                <option value="elevator">Elevator (60s)</option>
                <option value="demo">Demo day (3–5 min)</option>
              </select>
            </div>
            <div className="form-field">
              <label>Duration (seconds)</label>
              <input
                type="number"
                min={30}
                max={600}
                placeholder="60"
                value={pitch.duration_sec ?? ""}
                onChange={(event) =>
                  setPitch({
                    ...pitch,
                    duration_sec: event.target.value ? Number(event.target.value) : undefined,
                  })
                }
              />
            </div>
            <div className="form-field">
              <label>Pitch video (MP4)</label>
              <input
                type="file"
                accept="video/mp4,video/*"
                onChange={(event) => setVideoFile(event.target.files?.[0] ?? null)}
              />
              <span className="form-hint">Max 50MB. Use 60s elevator pitch.</span>
            </div>
            <div className="form-field">
              <label>Poster image (optional)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setPosterFile(event.target.files?.[0] ?? null)}
              />
              <span className="form-hint">Max 8MB.</span>
            </div>
          </div>
          <div className="submit-actions">
            <button type="button" disabled={submitStatus === "submitting"} onClick={handleSubmit}>
              {submitStatus === "submitting" ? "Submitting…" : "Submit pitch"}
            </button>
            {submitMessage ? <p className="submit-note">{submitMessage}</p> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
