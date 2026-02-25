import Link from "next/link";
import HotPitchesCarousel from "./HotPitchesCarousel";
import type { HotPitch } from "./hotPitches.types";
import { hasServerSupabaseEnv, supabaseAdmin } from "@/lib/supabase/server";

type HotPitchRow = {
  id: string;
  title: string | null;
  image_url: string | null;
  score: number | null;
  category: string | null;
  stage: string | null;
  created_at: string;
  slug: string | null;
};

const FALLBACK_IMAGES = [
  "/pitches/pitch-01.svg",
  "/pitches/pitch-02.svg",
  "/pitches/pitch-03.svg",
  "/pitches/pitch-04.svg",
] as const;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

const toHotPitch = (row: HotPitchRow, index: number): HotPitch => {
  const title = row.title?.trim() || "Untitled pitch";
  const slug = row.slug?.trim() || slugify(title) || row.id;

  return {
    id: row.id,
    title,
    image_url: row.image_url || FALLBACK_IMAGES[index % FALLBACK_IMAGES.length],
    score: typeof row.score === "number" && Number.isFinite(row.score) ? row.score : null,
    category: row.category,
    stage: row.stage,
    created_at: row.created_at,
    slug,
  };
};

const buildDevFallbackPitches = (): HotPitch[] => {
  const now = Date.now();
  const seed = [
    { title: "Revenue Engine for D2C Tea Brand", score: 8.4, category: "D2C", stage: "Seed" },
    { title: "AI Copilot for GST Filing", score: 7.9, category: "SaaS", stage: "Pre-seed" },
    { title: "EV Fleet Ops Dashboard", score: 8.1, category: "Mobility", stage: "Series A" },
    { title: "Vernacular Creator Commerce", score: 7.4, category: "Media", stage: "Seed" },
    { title: "Cold-chain IQ for Pharma Logistics", score: 8.0, category: "Logistics", stage: "Series A" },
    { title: "BNPL Risk Layer for Kiranas", score: 7.6, category: "Fintech", stage: "Seed" },
    { title: "Agritech Yield Forecast Studio", score: null, category: "Agritech", stage: "Pre-seed" },
    { title: "Hospital Workflow Automation", score: 7.8, category: "Healthtech", stage: "Series A" },
  ] as const;

  return seed.map((item, index) => ({
    id: `dev-hot-${index + 1}`,
    title: item.title,
    image_url: FALLBACK_IMAGES[index % FALLBACK_IMAGES.length],
    score: item.score,
    category: item.category,
    stage: item.stage,
    created_at: new Date(now - index * 24 * 60 * 60 * 1000).toISOString(),
    slug: slugify(item.title),
  }));
};

const fetchHotPitches = async (): Promise<HotPitch[]> => {
  if (!hasServerSupabaseEnv) return [];

  const { data, error } = await supabaseAdmin
    .from("pitches")
    .select("id,title,image_url,score,category,stage,created_at,slug")
    .eq("is_hot", true)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("hot_pitches_query_failed", error.message);
    return [];
  }

  if (!Array.isArray(data)) return [];
  return data.map((row, index) => toHotPitch(row as HotPitchRow, index));
};

export default async function HotPitchesSection() {
  const hotPitches = await fetchHotPitches();
  const shouldUseDevFallback = hotPitches.length === 0 && process.env.NODE_ENV === "development";
  const pitches = shouldUseDevFallback ? buildDevFallbackPitches() : hotPitches;

  return (
    <section className="hot-pitches-section" aria-label="Hot pitches">
      <div className="hot-pitches-header">
        <h2>Hot Pitches</h2>
        <Link href="/pitches" className="hot-pitches-view-all">
          View all
        </Link>
      </div>
      {pitches.length > 0 ? (
        <HotPitchesCarousel pitches={pitches} />
      ) : (
        <p className="hot-pitches-empty-state">No hot pitches yet.</p>
      )}
    </section>
  );
}
