"use client";

import { useMemo, useState } from "react";
import { ensureGuestId, getDisplayName, setDisplayName } from "@/lib/roundtable/client-identity";

type RoundtableCreateTopicFormProps = {
  onCreated?: () => void;
};

type CreateResponse = {
  ok?: boolean;
  error?: string;
  session_id?: string;
};

const topicPresets = [
  {
    id: "pitch-teardown",
    label: "Pitch teardown",
    title: "Pitch teardown: rip apart my positioning",
    description: "I want direct feedback on my pitch, hooks, ICP, and what feels weak or confusing.",
    tags: ["pitch", "messaging", "feedback"],
    turnDuration: 90,
  },
  {
    id: "growth-blocker",
    label: "Growth blocker",
    title: "Growth blocker: why is traction stalling?",
    description: "We have some user signal but growth is flattening. I want sharp ideas on acquisition, retention, and activation.",
    tags: ["growth", "retention", "distribution"],
    turnDuration: 60,
  },
  {
    id: "fundraising",
    label: "Fundraising",
    title: "Fundraising room: what would investors push back on?",
    description: "I need candid feedback on narrative, milestones, and what would make this raise more credible.",
    tags: ["fundraising", "venture", "narrative"],
    turnDuration: 120,
  },
  {
    id: "product-roast",
    label: "Product roast",
    title: "Product roast: what would make this instantly better?",
    description: "No politeness points. Roast the product, UX, and user journey so I can tighten it fast.",
    tags: ["product", "ux", "roast"],
    turnDuration: 60,
  },
] as const;

export default function RoundtableCreateTopicForm({ onCreated }: RoundtableCreateTopicFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [displayName, setDisplayNameState] = useState(() => getDisplayName());
  const [turnDuration, setTurnDuration] = useState(60);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
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

    const guestId = ensureGuestId();
    if (!guestId) {
      setError("Unable to initialize guest identity.");
      return;
    }

    try {
      setBusy(true);
      setDisplayName(displayName);
      const response = await fetch("/api/roundtable/topics", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-roundtable-guest-id": guestId,
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
        setError(payload.error ?? "Unable to create topic.");
        return;
      }

      onCreated?.();
      window.location.assign(`/roundtable/${payload.session_id}`);
    } catch {
      setError("Unable to create topic.");
    } finally {
      setBusy(false);
    }
  };

  const applyPreset = (presetId: string) => {
    const preset = topicPresets.find((entry) => entry.id === presetId);
    if (!preset) return;

    setActivePresetId(preset.id);
    setTitle(preset.title);
    setDescription(preset.description);
    setTagsText(preset.tags.join(", "));
    setTurnDuration(preset.turnDuration);
  };

  return (
    <section id="roundtable-create" className="roundtable-panel roundtable-create-panel" aria-label="Create roundtable topic">
      <div className="roundtable-section-head">
        <div>
          <p className="roundtable-kicker">Start a room</p>
          <h4>Seed the next conversation</h4>
          <p className="roundtable-section-copy">Use a preset to get a sharper topic faster, then edit anything before you launch.</p>
        </div>
      </div>
      <div className="roundtable-presets" role="group" aria-label="Roundtable topic presets">
        {topicPresets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`roundtable-preset${activePresetId === preset.id ? " is-active" : ""}`}
            onClick={() => applyPreset(preset.id)}
          >
            {preset.label}
          </button>
        ))}
      </div>
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
        {busy ? "Creating..." : "Create and join room"}
      </button>
    </section>
  );
}
