import { NextResponse } from "next/server";
import { db, type RankingRow } from "@/lib/db";
import { brands } from "@/data/brands";

const VALID_WINDOWS = new Set(["1h", "24h", "7d", "30d"]);

const jitterScore = (base: number) => {
  const swing = base * (0.02 + Math.random() * 0.08);
  return Math.round(base + (Math.random() > 0.5 ? 1 : -1) * swing);
};

const fallbackResponse = (window: string) => {
  const now = new Date().toISOString();
  const simulated = brands
    .map((brand) => ({
      company: brand.name,
      sector: brand.sector,
      revenue: brand.revenue,
      cts_score: jitterScore(brand.baseCts),
      delta: null,
      updated_at: now
    }))
    .sort((a, b) => b.cts_score - a.cts_score)
    .slice(0, 20)
    .map((entry, index) => ({
      rank: index + 1,
      ...entry
    }));

  return NextResponse.json({
    window,
    simulated: true,
    data: simulated
  });
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const window = searchParams.get("window") ?? "24h";

  if (!VALID_WINDOWS.has(window)) {
    return NextResponse.json(
      { error: "Invalid window. Use 1h, 24h, 7d, or 30d." },
      { status: 400 }
    );
  }

  if (!process.env.DATABASE_URL) {
    return fallbackResponse(window);
  }

  try {
    const result = await db.query<RankingRow>(
      `SELECT r.rank, c.name as company, c.sector, c.revenue, r.cts_score, r.delta, r.updated_at
       FROM rankings r
       JOIN companies c ON c.id = r.company_id
       WHERE r.window = $1
       ORDER BY r.rank ASC
       LIMIT 20`,
      [window]
    );

    if (!result.rows.length) {
      return fallbackResponse(window);
    }

    return NextResponse.json({
      window,
      simulated: false,
      data: result.rows
    });
  } catch (error) {
    return fallbackResponse(window);
  }
}
