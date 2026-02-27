import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getOperatorAuthContext, requireRole } from "@/lib/supabase/auth";

export const runtime = "nodejs";

const SOCIAL_LINK_MAX_LENGTH = 300;

const readSocialLinks = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Record<string, string | null>;
  const links = value as Record<string, unknown>;
  const normalized: Record<string, string | null> = {};
  for (const [key, raw] of Object.entries(links)) {
    const normalizedKey = key.trim().toLowerCase();
    if (!normalizedKey) continue;
    if (typeof raw !== "string") {
      normalized[normalizedKey] = null;
      continue;
    }
    const trimmed = raw.trim();
    normalized[normalizedKey] = trimmed.length ? trimmed : null;
  }
  return normalized;
};

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const authContext = await getOperatorAuthContext(request);
  if (!authContext || !requireRole(authContext, ["admin"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startupId = params.id?.trim();
  if (!startupId) {
    return NextResponse.json({ error: "Startup id is required" }, { status: 400 });
  }

  const payload = await request.json().catch(() => null);
  const categoryInput =
    payload && typeof payload.category === "string" ? payload.category.trim().slice(0, 80) : "";
  const hasTwitterInput = Boolean(
    payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "social_twitter")
  );
  const hasInstagramInput = Boolean(
    payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "social_instagram")
  );
  const socialTwitterInput =
    hasTwitterInput && typeof (payload as Record<string, unknown>).social_twitter === "string"
      ? ((payload as Record<string, unknown>).social_twitter as string)
          .trim()
          .slice(0, SOCIAL_LINK_MAX_LENGTH)
      : "";
  const socialInstagramInput =
    hasInstagramInput && typeof (payload as Record<string, unknown>).social_instagram === "string"
      ? ((payload as Record<string, unknown>).social_instagram as string)
          .trim()
          .slice(0, SOCIAL_LINK_MAX_LENGTH)
      : "";

  if (!categoryInput.length && !hasTwitterInput && !hasInstagramInput) {
    return NextResponse.json({ error: "Category or social links are required." }, { status: 400 });
  }

  const { data: startup, error: lookupError } = await supabaseAdmin
    .from("startups")
    .select("id,name,category,social_links")
    .eq("id", startupId)
    .single();

  if (lookupError || !startup) {
    return NextResponse.json({ error: "Startup not found" }, { status: 404 });
  }

  const nextSocialLinks = readSocialLinks(startup.social_links);
  if (hasTwitterInput) {
    nextSocialLinks.twitter = socialTwitterInput.length ? socialTwitterInput : null;
  }
  if (hasInstagramInput) {
    nextSocialLinks.instagram = socialInstagramInput.length ? socialInstagramInput : null;
  }

  const updatePayload: { category?: string; social_links?: Record<string, string | null> | null } = {};
  if (categoryInput.length) {
    updatePayload.category = categoryInput;
  }
  if (hasTwitterInput || hasInstagramInput) {
    updatePayload.social_links = Object.keys(nextSocialLinks).length ? nextSocialLinks : null;
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("startups")
    .update(updatePayload)
    .eq("id", startupId)
    .select("id,name,category,social_links")
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: updateError?.message ?? "Unable to update category." }, { status: 500 });
  }

  return NextResponse.json({
    updated: true,
    startup: {
      id: updated.id,
      name: updated.name ?? "Startup",
      category: updated.category ?? startup.category ?? "General",
      social_twitter: readSocialLinks(updated.social_links).twitter ?? null,
      social_instagram: readSocialLinks(updated.social_links).instagram ?? null,
    },
  });
}
