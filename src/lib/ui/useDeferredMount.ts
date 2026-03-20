"use client";

import { useEffect, useState } from "react";

type UseDeferredMountOptions = {
  timeoutMs?: number;
};

export const scheduleAfterIdle = (
  callback: () => void,
  timeoutMs = 800
) => {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  let cancelled = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let idleId: number | null = null;
  const browserWindow = window as Window & {
    requestIdleCallback?: (
      callback: IdleRequestCallback,
      options?: IdleRequestOptions
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  const run = () => {
    if (cancelled) return;
    cancelled = true;
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
    callback();
  };

  if (typeof browserWindow.requestIdleCallback === "function") {
    idleId = browserWindow.requestIdleCallback(run, {
      timeout: timeoutMs,
    });
    timeoutId = setTimeout(run, timeoutMs);
  } else {
    timeoutId = setTimeout(run, Math.min(timeoutMs, 250));
  }

  return () => {
    cancelled = true;
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    if (idleId !== null && typeof browserWindow.cancelIdleCallback === "function") {
      browserWindow.cancelIdleCallback(idleId);
    }
  };
};

export const useDeferredMount = ({
  timeoutMs = 800,
}: UseDeferredMountOptions = {}) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    if (isMounted) return;
    return scheduleAfterIdle(() => {
      setIsMounted(true);
    }, timeoutMs);
  }, [isMounted, timeoutMs]);

  return isMounted;
};
