import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getOperatorAuthContext, requireRole } from "@/lib/supabase/auth";

export const runtime = "nodejs";

const parseLimit = (raw: string | null) => {
  const value = Number(raw ?? "200");
  if (!Number.isFinite(value)) return 200;
  return Math.min(Math.max(Math.floor(value), 1), 500);
};

const parseStatus = (raw: string | null) => {
  const normalized = (raw ?? "approved").trim().toLowerCase();
  if (normalized === "all") return "all";
  if (normalized === "pending") return "pending";
  if (normalized === "rejected") return "rejected";
  return "approved";
};

const readSocialLink = (rawLinks: unknown, key: "twitter" | "instagram") => {
  if (!rawLinks || typeof rawLinks !== "object" || Array.isArray(rawLinks)) return null;
  const rawValue = (rawLinks as Record<string, unknown>)[key];
  if (typeof rawValue !== "string") return null;
  const trimmed = rawValue.trim();
  return trimmed.length ? trimmed : null;
};

export async function GET(request: Request) {
  const authContext = await getOperatorAuthContext(request);
  if (!authContext || !requireRole(authContext, ["admin"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));
  const status = parseStatus(searchParams.get("status"));

  let query = supabaseAdmin
    .from("startups")
    .select("id,name,status,category,city,social_links,created_at")
    .order("name", { ascending: true })
    .limit(limit);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    items: (data ?? []).map((item) => ({
      id: item.id,
      name: item.name ?? "Startup",
      status: item.status ?? null,
      category: item.category ?? null,
      city: item.city ?? null,
      social_twitter: readSocialLink(item.social_links, "twitter"),
      social_instagram: readSocialLink(item.social_links, "instagram"),
      created_at: item.created_at ?? null,
    })),
  });
}
