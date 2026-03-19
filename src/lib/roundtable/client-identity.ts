"use client";

const DEFAULT_NAME_PREFIX = "Guest";

let roundtableActorId: string | null = null;
let roundtableDisplayName: string | null = null;

const randomSuffix = () => Math.random().toString(36).slice(2, 6).toUpperCase();

const createActorId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const getDefaultDisplayName = () => `${DEFAULT_NAME_PREFIX} ${randomSuffix()}`;

export const ensureGuestId = () => {
  if (!roundtableActorId) {
    roundtableActorId = createActorId();
  }
  if (!roundtableDisplayName) {
    roundtableDisplayName = getDefaultDisplayName();
  }
  return roundtableActorId;
};

export const getDisplayName = () => {
  ensureGuestId();
  return roundtableDisplayName ?? getDefaultDisplayName();
};

export const setDisplayName = (value: string | null | undefined) => {
  const trimmed = String(value ?? "").trim().replace(/\s+/g, " ");
  roundtableDisplayName = trimmed || getDefaultDisplayName();
  return roundtableDisplayName;
};
