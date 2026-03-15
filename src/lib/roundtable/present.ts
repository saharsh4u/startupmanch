const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export const toInitials = (displayName: string) => {
  const parts = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
};

export const formatRelativeTime = (value: string | null | undefined, nowMs = Date.now()) => {
  if (!value) return "just now";

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "just now";

  const diffSeconds = Math.round((timestamp - nowMs) / 1000);
  const absSeconds = Math.abs(diffSeconds);

  if (absSeconds < 45) return "just now";
  if (absSeconds < 60 * 60) {
    return relativeTimeFormatter.format(Math.round(diffSeconds / 60), "minute");
  }
  if (absSeconds < 60 * 60 * 24) {
    return relativeTimeFormatter.format(Math.round(diffSeconds / (60 * 60)), "hour");
  }
  if (absSeconds < 60 * 60 * 24 * 7) {
    return relativeTimeFormatter.format(Math.round(diffSeconds / (60 * 60 * 24)), "day");
  }

  return relativeTimeFormatter.format(Math.round(diffSeconds / (60 * 60 * 24 * 7)), "week");
};

export const formatTurnStatus = (status: string, autoSubmitted = false) => {
  if (status === "submitted") {
    return autoSubmitted ? "Auto-submitted" : "Submitted";
  }
  if (status === "expired") return "Expired";
  if (status === "skipped") return "Skipped";
  if (status === "active") return "Live";
  if (status === "queued") return "Queued";
  return status;
};
