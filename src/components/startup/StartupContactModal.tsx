"use client";

import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics/events";

type StartupContactModalProps = {
  open: boolean;
  startupId: string;
  startupName: string;
  onClose: () => void;
};

export default function StartupContactModal({
  open,
  startupId,
  startupName,
  onClose,
}: StartupContactModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    message: "",
    offer: "",
  });

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onEscape);
    };
  }, [onClose, open]);

  if (!open) return null;

  const update = (key: keyof typeof form, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSent(false);

    if (form.message.trim().length < 10) {
      setError("Message must be at least 10 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startup_id: startupId,
          name: form.name,
          email: form.email,
          message: form.message,
          offer_amount: form.offer ? Number(form.offer) : null,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to submit contact request.");
      }

      setForm({ name: "", email: "", message: "", offer: "" });
      setSent(true);
      trackEvent("founder_contact_submit", {
        source: "startup_contact_modal",
        startup_id: startupId,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="startup-contact-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="startup-contact-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="startup-contact-dialog">
        <header className="startup-contact-header">
          <div>
            <p className="contact-label">Contact founder</p>
            <h3 id="startup-contact-title">{startupName}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close contact modal">
            x
          </button>
        </header>

        <form className="startup-contact-form" onSubmit={submit}>
          <label>
            <span>Your name</span>
            <input
              required
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="Your name"
            />
          </label>

          <label>
            <span>Your email</span>
            <input
              required
              type="email"
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
              placeholder="you@example.com"
            />
          </label>

          <label>
            <span>Message</span>
            <textarea
              required
              minLength={10}
              value={form.message}
              onChange={(event) => update("message", event.target.value)}
              placeholder="Tell the founder why you are interested"
            />
          </label>

          <label>
            <span>Offer amount (optional)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.offer}
              onChange={(event) => update("offer", event.target.value)}
              placeholder="10000"
            />
          </label>

          {error ? <p className="contact-error">{error}</p> : null}
          {sent ? <p className="contact-success">Message sent to founder.</p> : null}

          <button type="submit" disabled={submitting}>
            {submitting ? "Sending..." : "Send message"}
          </button>
        </form>
      </div>
    </div>
  );
}
