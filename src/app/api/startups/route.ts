import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSeedCompanies } from "@/lib/seed-companies";

export const runtime = "nodejs";

const VALID_WINDOWS = new Set(["1h", "24h", "7d", "30d"]);

const buildFallback = (window: string) => {
  const now = new Date().toISOString();
  const companies = getSeedCompanies();
  const data = companies.slice(0, 50).map((company, index) => ({
    rank: index + 1,
    name: company.name,
    sector: company.sector,
    momentum_score: Math.max(24, 92 - index * 1.2),
    updated_at: now,
  }));
  return NextResponse.json({ window, simulated: true, data });
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
    return buildFallback(window);
  }

  try {
    const result = await db.query<{
      rank: number;
      name: string;
      sector: string | null;
      momentum_score: number;
      updated_at: string;
    }>(
      `SELECT r.rank,
              c.name,
              c.sector,
              r.cts_score as momentum_score,
              r.updated_at
       FROM rankings r
       JOIN companies c ON c.id = r.company_id
       WHERE r.window = $1 AND c.featured_free = true
       ORDER BY r.rank ASC
       LIMIT 50`,
      [window]
    );

    if (!result.rows.length) {
      return buildFallback(window);
    }

    return NextResponse.json({
      window,
      simulated: false,
      data: result.rows,
    });
  } catch (error) {
    return buildFallback(window);
  }
}
