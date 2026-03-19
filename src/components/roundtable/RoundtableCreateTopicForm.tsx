"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clearPendingJoinMicStream, preparePendingJoinMicStream } from "@/lib/roundtable/client-media";
import { ensureGuestId, getDisplayName, setDisplayName } from "@/lib/roundtable/client-identity";

type RoundtableCreateTopicFormProps = {
  onCreated?: () => void;
};

type CreateResponse = {
  ok?: boolean;
  error?: string;
  session_id?: string;
};

export default function RoundtableCreateTopicForm({ onCreated }: RoundtableCreateTopicFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [displayName, setDisplayNameState] = useState(() => getDisplayName());
  const [turnDuration, setTurnDuration] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tags = useMemo(
    () =>
      tagsText
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 8),
    [tagsText]
  );

  const submit = async () => {
    if (busy) return;
    setError(null);

    const actorId = ensureGuestId();
    if (!actorId) {
      setError("Unable to initialize roundtable identity.");
      return;
    }

    try {
      setBusy(true);
      setDisplayName(displayName);
      void preparePendingJoinMicStream().catch(() => null);

      const response = await fetch("/api/roundtable/topics", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-roundtable-actor-id": actorId,
        },
        body: JSON.stringify({
          title,
          description,
          tags,
          turn_duration_sec: turnDuration,
          display_name: displayName,
        }),
      });

      const payload = (await response.json()) as CreateResponse;
      if (!response.ok || !payload.session_id) {
        clearPendingJoinMicStream();
        setError(payload.error ?? "Unable to create topic.");
        return;
      }

      onCreated?.();
      router.push(`/roundtable/${payload.session_id}`);
    } catch {
      clearPendingJoinMicStream();
      setError("Unable to create topic.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="roundtable-panel" aria-label="Create roundtable topic">
      <h4>Create topic</h4>
      <div className="roundtable-form-grid">
        <label>
          Topic title
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What are you building?" />
        </label>
        <label>
          Display name
          <input
            value={displayName}
            onChange={(event) => setDisplayNameState(event.target.value)}
            placeholder="Your name"
          />
        </label>
        <label className="is-wide">
          Description
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            placeholder="Add context and what kind of feedback you need."
          />
        </label>
        <label className="is-wide">
          Tags (comma separated)
          <input value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="saas, growth, d2c" />
        </label>
        <label>
          Turn duration
          <select value={turnDuration} onChange={(event) => setTurnDuration(Number(event.target.value))}>
            <option value={60}>60 seconds</option>
            <option value={90}>90 seconds</option>
            <option value={120}>120 seconds</option>
          </select>
        </label>
      </div>
      {error ? <p className="roundtable-error">{error}</p> : null}
      <button type="button" className="roundtable-cta" onClick={() => void submit()} disabled={busy || title.trim().length < 4}>
        {busy ? "Creating..." : "Create public room"}
      </button>
    </section>
  );
}
