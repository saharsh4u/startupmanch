"use client";

import { useCallback, useEffect, useState } from "react";
import PitchVideoCard, { type PitchCardData } from "@/components/PitchVideoCard";

const tabs = ["trending", "fresh", "food", "fashion"] as const;
const PAGE_SIZE = 12;

type ApiPitch = {
  pitch_id: string;
  startup_name: string;
  one_liner: string | null;
  category: string | null;
  poster_url: string | null;
};

type PitchDrawerProps = {
  open: boolean;
  onClose: () => void;
};

export default function PitchDrawer({ open, onClose }: PitchDrawerProps) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("trending");
  const [items, setItems] = useState<PitchCardData[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const fetchPage = useCallback(
    async (nextOffset: number, replace = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/pitches?mode=feed&tab=${tab}&limit=${PAGE_SIZE}&offset=${nextOffset}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("Unable to load pitches.");
        const payload = await res.json();
        const data = (payload?.data ?? []) as ApiPitch[];
        const mapped = data.map((item, index) => ({
          id: item.pitch_id ?? `pitch-${nextOffset + index}`,
          name: item.startup_name ?? "Startup",
          tagline: item.one_liner ?? item.category ?? "New pitch",
          poster: item.poster_url ?? `/pitches/pitch-0${((nextOffset + index) % 3) + 1}.svg?v=2`,
        }));

        if (replace) {
          setItems(mapped);
        } else {
          setItems((prev) => [...prev, ...mapped]);
        }

        setHasMore(mapped.length === PAGE_SIZE);
        setOffset(nextOffset + mapped.length);
      } catch (err: any) {
        setError(err.message ?? "Unable to load pitches.");
      } finally {
        setLoading(false);
      }
    },
    [tab]
  );

  useEffect(() => {
    if (!open) return;
    setItems([]);
    setOffset(0);
    setHasMore(true);
    fetchPage(0, true);
  }, [open, fetchPage]);

  if (!open) return null;

  return (
    <div className={`pitch-drawer ${open ? "open" : ""}`}>
      <div className="pitch-drawer-panel">
        <div className="pitch-drawer-header">
          <div>
            <h3>All pitches</h3>
            <p>Trending across StartupManch</p>
          </div>
          <button type="button" className="drawer-close" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="pitch-drawer-tabs">
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              className={item === tab ? "active" : ""}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div
          className="pitch-drawer-body"
          onScroll={(event) => {
            if (!hasMore || loading) return;
            const target = event.currentTarget;
            if (target.scrollHeight - target.scrollTop - target.clientHeight < 240) {
              fetchPage(offset, false);
            }
          }}
        >
          {error ? <p className="drawer-error">{error}</p> : null}
          <div className="pitch-drawer-grid">
            {items.map((pitch) => (
              <PitchVideoCard key={pitch.id} pitch={pitch} />
            ))}
          </div>
          {loading ? <p className="drawer-loading">Loading…</p> : null}
          {!hasMore && !loading ? <p className="drawer-loading">End of list</p> : null}
        </div>
      </div>
    </div>
  );
}
