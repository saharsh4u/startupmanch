"use client";

import { hasBrowserSupabaseEnv, supabaseBrowser } from "@/lib/supabase/client";

export type PitchVoteSyncPayload = {
  senderId: string;
  pitchId: string;
  inCount: number;
  outCount: number;
  sentAt: number;
};

type VoteSyncListener = (payload: PitchVoteSyncPayload) => void;

const CHANNEL_NAME = "pitch-vote-sync";
const EVENT_NAME = "vote-update";

const listeners = new Set<VoteSyncListener>();
let sharedChannel: ReturnType<typeof supabaseBrowser.channel> | null = null;

const isVoteSyncPayload = (value: unknown): value is PitchVoteSyncPayload => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PitchVoteSyncPayload>;
  return (
    typeof candidate.senderId === "string" &&
    typeof candidate.pitchId === "string" &&
    Number.isFinite(Number(candidate.inCount)) &&
    Number.isFinite(Number(candidate.outCount)) &&
    Number.isFinite(Number(candidate.sentAt))
  );
};

const emit = (payload: PitchVoteSyncPayload) => {
  for (const listener of listeners) {
    listener(payload);
  }
};

const ensureChannel = () => {
  if (!hasBrowserSupabaseEnv) return null;
  if (sharedChannel) return sharedChannel;

  sharedChannel = supabaseBrowser
    .channel(CHANNEL_NAME)
    .on("broadcast", { event: EVENT_NAME }, ({ payload }) => {
      if (!isVoteSyncPayload(payload)) return;
      emit(payload);
    })
    .subscribe();

  return sharedChannel;
};

export const createPitchVoteSyncSenderId = () => Math.random().toString(36).slice(2, 10);

export const subscribeToPitchVoteSync = (listener: VoteSyncListener) => {
  listeners.add(listener);
  ensureChannel();

  return () => {
    listeners.delete(listener);
    if (!listeners.size && sharedChannel) {
      const channel = sharedChannel;
      sharedChannel = null;
      void supabaseBrowser.removeChannel(channel);
    }
  };
};

export const broadcastPitchVoteSync = (payload: PitchVoteSyncPayload) => {
  emit(payload);
  const channel = ensureChannel();
  if (!channel) return;

  void channel.send({
    type: "broadcast",
    event: EVENT_NAME,
    payload,
  });
};
