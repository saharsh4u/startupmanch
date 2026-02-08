"use client";

import { forwardRef, useState } from "react";
import type { PitchShow } from "./PitchShowCard";

type ContactModalProps = {
  pitch: PitchShow;
};

const ContactModal = forwardRef<HTMLDialogElement, ContactModalProps>(function ContactModal(
  { pitch },
  ref
) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    message: "",
    offer: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleChange = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSent(false);
    if (form.message.trim().length < 10) {
      setError("Message must be at least 10 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pitch_id: pitch.id,
          name: form.name,
          email: form.email,
          message: form.message,
          offer_amount: form.offer ? Number(form.offer) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to send");
      setSent(true);
      setForm({ name: "", email: "", message: "", offer: "" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog className="contact-modal" ref={ref}>
      <form className="contact-form" onSubmit={handleSubmit}>
        <header>
          <div>
            <p className="contact-label">Contact founder</p>
            <h4>{pitch.name}</h4>
          </div>
          <button type="button" onClick={() => (ref as any)?.current?.close?.()} aria-label="Close">
            ×
          </button>
        </header>
        <label>
          <span>Your name</span>
          <input
            required
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
            placeholder="Your name"
          />
        </label>
        <label>
          <span>Your email</span>
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => handleChange("email", e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label>
          <span>Message</span>
          <textarea
            required
            minLength={10}
            value={form.message}
            onChange={(e) => handleChange("message", e.target.value)}
            placeholder="Share your interest and context"
          />
        </label>
        <label>
          <span>Offer amount (optional)</span>
          <input
            type="number"
            min={0}
            value={form.offer}
            onChange={(e) => handleChange("offer", e.target.value)}
            placeholder="e.g., 10000"
          />
        </label>
        {error && <p className="contact-error">{error}</p>}
        {sent && <p className="contact-success">Sent to founder.</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Sending..." : "Send offer"}
        </button>
      </form>
    </dialog>
  );
});

export default ContactModal;
