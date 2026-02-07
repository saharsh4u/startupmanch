"use client";

import { useEffect, useMemo, useState } from "react";
import PitchArenaCard, { type ArenaPitch } from "@/components/PitchArenaCard";
import PitchDrawer from "@/components/PitchDrawer";
import { pitches as fallbackPitches } from "@/data/pitches";

type ApiPitch = {
  pitch_id: string;
  startup_name: string;
  one_liner: string | null;
  category: string | null;
  poster_url: string | null;
  video_url?: string | null;
};

export default function PitchFeed() {
  const [items, setItems] = useState<ArenaPitch[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hoverLeft, setHoverLeft] = useState<ArenaPitch | null>(null);
  const [hoverRight, setHoverRight] = useState<ArenaPitch | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/pitches?mode=week&limit=6", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load");
        const payload = await res.json();
        const data = (payload?.data ?? []) as ApiPitch[];
        const mapped = data.map((item, index) => ({
          id: item.pitch_id ?? `pitch-${index}`,
          name: item.startup_name ?? "Startup",
          tagline: item.one_liner ?? item.category ?? "New pitch",
          poster: item.poster_url ?? `/pitches/pitch-0${(index % 3) + 1}.svg`,
          video: item.video_url ?? null,
        }));

        if (mapped.length < 6) {
          const needed = 6 - mapped.length;
          const fallback = fallbackPitches.map((pitch) => ({
            id: pitch.id,
            name: pitch.name,
            tagline: pitch.tagline,
            poster: pitch.poster,
          }));
          const fill = Array.from({ length: needed }).map((_, idx) => fallback[idx % fallback.length]);
          setItems([...mapped, ...fill]);
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
      fallbackPitches.map((pitch) => ({
        id: pitch.id,
        name: pitch.name,
        tagline: pitch.tagline,
        poster: pitch.poster,
        video: null,
      })),
    []
  );

  const display = items.length ? items : fallback;
  const expanded =
    display.length >= 6
      ? display
      : Array.from({ length: 6 }).map((_, index) => display[index % display.length]);
  const mainLeft = hoverLeft ?? expanded[0];
  const mainRight = hoverRight ?? expanded[1];
  const minis = expanded.slice(2, 6);

  return (
    <section className="pitch-section">
      <div className="pitch-header">
        <h3>Pitch of the Week</h3>
        <button className="pitch-link" type="button" onClick={() => setDrawerOpen(true)}>
          Open story
        </button>
      </div>
      <div className={`arena-grid${loaded ? " is-loaded" : ""}`}>
        {mainLeft ? (
          <div className="arena-main">
            <PitchArenaCard pitch={mainLeft} variant="main" />
          </div>
        ) : null}
        {mainRight ? (
          <div className="arena-main">
            <PitchArenaCard pitch={mainRight} variant="main" />
          </div>
        ) : null}
        {minis.map((pitch, index) => {
          const side = index < 2 ? "left" : "right";
          return (
            <div className="arena-mini" key={pitch.id}>
              <PitchArenaCard
                pitch={pitch}
                variant="mini"
                active={(side === "left" && hoverLeft?.id === pitch.id) || (side === "right" && hoverRight?.id === pitch.id)}
                onHover={(p) => (side === "left" ? setHoverLeft(p) : setHoverRight(p))}
                onLeave={() => (side === "left" ? setHoverLeft(null) : setHoverRight(null))}
              />
            </div>
          );
        })}
      </div>
      <PitchDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </section>
  );
}
