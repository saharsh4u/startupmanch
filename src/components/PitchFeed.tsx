"use client";

import { useEffect, useMemo, useState } from "react";
import PitchVideoCard, { type PitchCardData } from "@/components/PitchVideoCard";
import PitchDrawer from "@/components/PitchDrawer";
import { pitches as fallbackPitches } from "@/data/pitches";

type ApiPitch = {
  pitch_id: string;
  startup_name: string;
  one_liner: string | null;
  category: string | null;
  poster_url: string | null;
};

export default function PitchFeed() {
  const [items, setItems] = useState<PitchCardData[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/pitches?mode=week&limit=3", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load");
        const payload = await res.json();
        const data = (payload?.data ?? []) as ApiPitch[];
        const mapped = data.map((item, index) => ({
          id: item.pitch_id ?? `pitch-${index}`,
          name: item.startup_name ?? "Startup",
          tagline: item.one_liner ?? item.category ?? "New pitch",
          poster: item.poster_url ?? `/pitches/pitch-0${(index % 3) + 1}.svg`,
        }));
        if (mapped.length < 3) {
          const needed = 3 - mapped.length;
          const fallback = fallbackPitches.slice(0, needed).map((pitch) => ({
            id: pitch.id,
            name: pitch.name,
            tagline: pitch.tagline,
            poster: pitch.poster,
          }));
          setItems([...mapped, ...fallback]);
        } else {
          setItems(mapped);
        }
      } catch {
        setItems([]);
      } finally {
        setLoaded(true);
      }
    };
    load();
  }, []);

  const fallback = useMemo(
    () =>
      fallbackPitches.slice(0, 3).map((pitch) => ({
        id: pitch.id,
        name: pitch.name,
        tagline: pitch.tagline,
        poster: pitch.poster,
      })),
    []
  );

  const display = items.length ? items : fallback;

  return (
    <section className="pitch-section">
      <div className="pitch-header">
        <h3>Pitch of the Week</h3>
        <button className="pitch-link" type="button" onClick={() => setDrawerOpen(true)}>
          Open story
        </button>
      </div>
      <div className={`pitch-grid${loaded ? " is-loaded" : ""}`}>
        {display.map((pitch) => (
          <PitchVideoCard key={pitch.id} pitch={pitch} />
        ))}
      </div>
      <PitchDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </section>
  );
}
