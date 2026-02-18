"use client";

import { useMemo, useState } from "react";
import { trackEvent } from "@/lib/analytics/events";
import type { LeadPayload, LeadPersona } from "@/lib/leads/types";

type LeadCaptureFormProps = {
  source: string;
  title?: string;
  description?: string;
  compact?: boolean;
};

const personas: Array<{ value: LeadPersona; label: string }> = [
  { value: "founder", label: "Founder" },
  { value: "investor", label: "Investor" },
  { value: "both", label: "Both" },
];

const normalizeText = (value: string, fallback = "") => value.trim() || fallback;

const readUtmParams = (): LeadPayload["utm"] => {
  if (typeof window === "undefined") return undefined;
  const params = new URLSearchParams(window.location.search);
  return {
    source: params.get("utm_source") || undefined,
    medium: params.get("utm_medium") || undefined,
    campaign: params.get("utm_campaign") || undefined,
    content: params.get("utm_content") || undefined,
    term: params.get("utm_term") || undefined,
  };
};

export default function LeadCaptureForm({
  source,
  title = "Join the StartupManch community",
  description = "Get founder and investor updates directly in your inbox.",
  compact = false,
}: LeadCaptureFormProps) {
  const [email, setEmail] = useState("");
  const [persona, setPersona] = useState<LeadPersona>("founder");
  const [intent, setIntent] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const className = useMemo(
    () => `lead-capture${compact ? " is-compact" : ""}`,
    [compact]
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);

    const payload: LeadPayload = {
      email: normalizeText(email).toLowerCase(),
      persona,
      intent: normalizeText(intent),
      source: normalizeText(source, "site"),
      utm: readUtmParams(),
      website: normalizeText(website),
    };

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as { error?: string; deduped?: boolean };
      if (!response.ok) {
        throw new Error(data.error || "Unable to submit.");
      }

      setMessage(data.deduped ? "You are already on our list." : "You are on the list.");
      setEmail("");
      setIntent("");
      setWebsite("");
      trackEvent("lead_submit_success", {
        source: payload.source,
        persona: payload.persona,
        deduped: Boolean(data.deduped),
      });
    } catch (submitError) {
      const errorText =
        submitError instanceof Error ? submitError.message : "Unable to submit.";
      setError(errorText);
      trackEvent("lead_submit_error", {
        source: payload.source,
        persona: payload.persona,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={className} id="lead-capture">
      <h3>{title}</h3>
      <p>{description}</p>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          required
          placeholder="you@startup.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
        />
        <select
          value={persona}
          onChange={(event) => setPersona(event.target.value as LeadPersona)}
          aria-label="I am a"
        >
          {personas.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="What are you looking for?"
          value={intent}
          onChange={(event) => setIntent(event.target.value)}
          maxLength={180}
          required
        />
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          className="lead-honeypot"
          aria-hidden="true"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Joining..." : "Join now"}
        </button>
      </form>
      {message ? <p className="lead-success">{message}</p> : null}
      {error ? <p className="lead-error">{error}</p> : null}
    </section>
  );
}
