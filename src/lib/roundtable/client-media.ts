"use client";

let pendingJoinMicStream: MediaStream | null = null;
let pendingJoinMicRequestId = 0;

const acquireMicStream = async () => {
  if (typeof window === "undefined" || !window.isSecureContext) {
    return null;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return null;
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (constraintError) {
    const shouldRetryWithBasicAudio =
      constraintError instanceof DOMException && constraintError.name === "OverconstrainedError";
    if (!shouldRetryWithBasicAudio) {
      throw constraintError;
    }
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }
};

export const preparePendingJoinMicStream = async () => {
  if (pendingJoinMicStream) return pendingJoinMicStream;
  const requestId = ++pendingJoinMicRequestId;
  const stream = await acquireMicStream();
  if (requestId !== pendingJoinMicRequestId) {
    for (const track of stream?.getTracks?.() ?? []) {
      track.stop();
    }
    return null;
  }
  pendingJoinMicStream = stream;
  return stream;
};

export const consumePendingJoinMicStream = () => {
  const stream = pendingJoinMicStream;
  pendingJoinMicStream = null;
  pendingJoinMicRequestId += 1;
  return stream;
};

export const clearPendingJoinMicStream = () => {
  pendingJoinMicRequestId += 1;
  if (!pendingJoinMicStream) return;
  for (const track of pendingJoinMicStream.getTracks()) {
    track.stop();
  }
  pendingJoinMicStream = null;
};
