"use client";

import { useEffect, useMemo, useState } from "react";

type RoundtableTurnTimerProps = {
  endsAt: string | null;
};

const toRemaining = (endsAt: string | null) => {
  if (!endsAt) return 0;
  const ms = Date.parse(endsAt) - Date.now();
  return Math.max(0, Math.ceil(ms / 1000));
};

export default function RoundtableTurnTimer({ endsAt }: RoundtableTurnTimerProps) {
  const [remaining, setRemaining] = useState(() => toRemaining(endsAt));

  useEffect(() => {
    setRemaining(toRemaining(endsAt));
    const timer = window.setInterval(() => {
      setRemaining(toRemaining(endsAt));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [endsAt]);

  const label = useMemo(() => {
    const mins = Math.floor(remaining / 60)
      .toString()
      .padStart(2, "0");
    const secs = Math.floor(remaining % 60)
      .toString()
      .padStart(2, "0");
    return `${mins}:${secs}`;
  }, [remaining]);

  return <span className="roundtable-timer">{label}</span>;
}
