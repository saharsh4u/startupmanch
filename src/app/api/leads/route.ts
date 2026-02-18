import { createHash } from "crypto";
import { NextResponse } from "next/server";
import type { LeadPayload, LeadPersona } from "@/lib/leads/types";
import { hasServerSupabaseEnv, supabaseAdmin } from "@/lib/supabase/server";

const VALID_PERSONAS = new Set<LeadPersona>(["founder", "investor", "both"]);
const RATE_LIMIT_PER_HOUR = 24;

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const hashIp = (ip: string) => {
  const salt = process.env.LEAD_RATE_LIMIT_SALT?.trim() || "startupmanch-default-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
};

const readIp = (request: Request) => {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "0.0.0.0";
};

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const safeText = (value: unknown, max = 200) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
};

export async function POST(request: Request) {
  if (!hasServerSupabaseEnv) {
    return NextResponse.json({ error: "Server not configured." }, { status: 503 });
  }

  let payload: LeadPayload;
  try {
    payload = (await request.json()) as LeadPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const email = normalizeEmail(safeText(payload.email, 140));
  const persona = safeText(payload.persona, 20) as LeadPersona;
  const intent = safeText(payload.intent, 180);
  const source = safeText(payload.source, 80);
  const website = safeText(payload.website ?? "", 240);

  if (website.length > 0) {
    return NextResponse.json({ error: "Spam detected." }, { status: 400 });
  }

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
  }

  if (!VALID_PERSONAS.has(persona)) {
    return NextResponse.json({ error: "Invalid persona." }, { status: 400 });
  }

  if (intent.length < 4) {
    return NextResponse.json({ error: "Intent is required." }, { status: 400 });
  }

  if (!source.length) {
    return NextResponse.json({ error: "Source is required." }, { status: 400 });
  }

  const ipHash = hashIp(readIp(request));
  const hourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count: hourlyCount, error: rateLimitError } = await supabaseAdmin
    .from("growth_leads")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", hourAgoIso);

  if (rateLimitError) {
    return NextResponse.json({ error: rateLimitError.message }, { status: 500 });
  }

  if ((hourlyCount ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const dedupeFromIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: existingLead, error: dedupeError } = await supabaseAdmin
    .from("growth_leads")
    .select("id")
    .eq("email", email)
    .gte("created_at", dedupeFromIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (dedupeError) {
    return NextResponse.json({ error: dedupeError.message }, { status: 500 });
  }

  if (existingLead?.id) {
    return NextResponse.json({ ok: true, deduped: true }, { status: 200 });
  }

  const utm = payload.utm && typeof payload.utm === "object" ? payload.utm : null;

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("growth_leads")
    .insert({
      email,
      persona,
      intent,
      source,
      utm,
      ip_hash: ipHash,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message || "Unable to save lead." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: inserted.id }, { status: 201 });
}
