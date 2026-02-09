"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type CampaignResponse = {
  campaign?: {
    id: string;
    status: string;
    company_name: string | null;
    tagline: string | null;
    badge: string | null;
    accent: string | null;
    destination_url: string | null;
    support_email: string | null;
    logo_url: string | null;
    details_submitted_at: string | null;
  };
  error?: string;
};

type FormState = {
  companyName: string;
  destinationUrl: string;
  tagline: string;
  badge: string;
  accent: string;
  supportEmail: string;
};

const emptyForm: FormState = {
  companyName: "",
  destinationUrl: "",
  tagline: "",
  badge: "AD",
  accent: "#6ecbff",
  supportEmail: "",
};

type AdOnboardingClientProps = {
  sessionId: string;
};

export default function AdOnboardingClient({ sessionId }: AdOnboardingClientProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [campaignStatus, setCampaignStatus] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setStatus("error");
      setErrorText("Missing checkout session ID.");
      return;
    }

    let cancelled = false;

    const load = async () => {
      setStatus("loading");
      setErrorText(null);
      setSaved(false);

      try {
        const response = await fetch(`/api/ads/onboarding?session_id=${encodeURIComponent(sessionId)}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as CampaignResponse;

        if (cancelled) return;

        if (!response.ok || payload.error || !payload.campaign) {
          throw new Error(payload.error ?? "Unable to load campaign details.");
        }

        const campaign = payload.campaign;
        setCampaignStatus(campaign.status);
        setLogoUrl(campaign.logo_url);
        setForm({
          companyName: campaign.company_name ?? "",
          destinationUrl: campaign.destination_url ?? "",
          tagline: campaign.tagline ?? "",
          badge: campaign.badge ?? "AD",
          accent: campaign.accent ?? "#6ecbff",
          supportEmail: campaign.support_email ?? "",
        });
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        setErrorText((error as Error).message || "Unable to load campaign details.");
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrorText(null);
    setSaved(false);

    try {
      const payload = new FormData();
      payload.set("session_id", sessionId);
      payload.set("company_name", form.companyName);
      payload.set("destination_url", form.destinationUrl);
      payload.set("tagline", form.tagline);
      payload.set("badge", form.badge);
      payload.set("accent", form.accent);
      payload.set("support_email", form.supportEmail);
      if (logoFile) {
        payload.set("logo", logoFile);
      }

      const response = await fetch("/api/ads/onboarding", {
        method: "POST",
        body: payload,
      });

      const result = (await response.json()) as CampaignResponse;
      if (!response.ok || result.error || !result.campaign) {
        throw new Error(result.error ?? "Unable to save ad details.");
      }

      setCampaignStatus(result.campaign.status);
      setLogoUrl(result.campaign.logo_url);
      setSaved(true);
    } catch (error) {
      setErrorText((error as Error).message || "Unable to save ad details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page advertise-success-page">
      <section className="ad-onboarding-card">
        <header className="ad-onboarding-header">
          <p className="ad-onboarding-kicker">Stripe payment successful</p>
          <h1>Finish your ad details</h1>
          <p>Your ad goes live as soon as you submit this form.</p>
        </header>

        {!sessionId ? <p className="ad-onboarding-error">Missing checkout session ID.</p> : null}

        {status === "loading" ? <p className="ad-onboarding-state">Loading campaign details…</p> : null}

        {status === "error" ? <p className="ad-onboarding-error">{errorText}</p> : null}

        {status === "ready" ? (
          <form className="ad-onboarding-form" onSubmit={handleSubmit}>
            <label>
              <span>Startup / company name</span>
              <input
                required
                value={form.companyName}
                onChange={(event) => setForm((prev) => ({ ...prev, companyName: event.target.value }))}
                placeholder="Acme Labs"
              />
            </label>

            <label>
              <span>Website URL</span>
              <input
                required
                type="url"
                value={form.destinationUrl}
                onChange={(event) => setForm((prev) => ({ ...prev, destinationUrl: event.target.value }))}
                placeholder="https://yourstartup.com"
              />
            </label>

            <label>
              <span>One-line tagline</span>
              <input
                required
                value={form.tagline}
                onChange={(event) => setForm((prev) => ({ ...prev, tagline: event.target.value }))}
                placeholder="Build faster with AI workflows"
              />
            </label>

            <div className="ad-onboarding-grid">
              <label>
                <span>Badge text</span>
                <input
                  value={form.badge}
                  onChange={(event) => setForm((prev) => ({ ...prev, badge: event.target.value }))}
                  maxLength={10}
                  placeholder="AI"
                />
              </label>

              <label>
                <span>Accent color</span>
                <input
                  value={form.accent}
                  onChange={(event) => setForm((prev) => ({ ...prev, accent: event.target.value }))}
                  placeholder="#6ecbff"
                />
              </label>
            </div>

            <label>
              <span>Support email</span>
              <input
                required
                type="email"
                value={form.supportEmail}
                onChange={(event) => setForm((prev) => ({ ...prev, supportEmail: event.target.value }))}
                placeholder="growth@yourstartup.com"
              />
            </label>

            <label>
              <span>Logo (optional, PNG/JPG/WebP, max 5MB)</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
              />
            </label>

            {logoUrl ? (
              <div className="ad-logo-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="Ad logo preview" />
              </div>
            ) : null}

            {errorText ? <p className="ad-onboarding-error">{errorText}</p> : null}
            {saved ? <p className="ad-onboarding-success">Your campaign is live.</p> : null}

            <button type="submit" className="ad-onboarding-submit" disabled={saving}>
              {saving ? "Saving…" : "Publish campaign"}
            </button>

            <p className="ad-onboarding-footnote">
              Campaign status: <strong>{campaignStatus ?? "pending"}</strong>
            </p>
          </form>
        ) : null}

        <div className="ad-onboarding-actions">
          <Link href="/">Back to homepage</Link>
        </div>
      </section>
    </main>
  );
}
