import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/supabase/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ensureAnonWatchId, readAnonWatchId } from "@/lib/watchers/identity";

export const runtime = "nodejs";

const isDuplicateError = (code: string | null | undefined) => code === "23505";
const isMissingStartupWatchersTable = (message: string | null | undefined) =>
  (message ?? "").toLowerCase().includes("startup_watchers");

const getWatchCount = async (startupId: string) => {
  const { count, error } = await supabaseAdmin
    .from("startup_watchers")
    .select("id", { count: "exact", head: true })
    .eq("startup_id", startupId);
  if (error && !isMissingStartupWatchersTable(error.message)) {
    throw new Error(error.message);
  }
  return count ?? 0;
};

const ensureWatchableStartup = async (startupId: string) => {
  const { data: startup, error } = await supabaseAdmin
    .from("startups")
    .select("id,status")
    .eq("id", startupId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!startup || startup.status !== "approved") return null;
  return startup;
};

const resolveWatchingState = async (
  startupId: string,
  profileId: string | null,
  anonId: string | null
) => {
  if (profileId) {
    const { data, error } = await supabaseAdmin
      .from("startup_watchers")
      .select("id")
      .eq("startup_id", startupId)
      .eq("profile_id", profileId)
      .maybeSingle();
    if (error && !isMissingStartupWatchersTable(error.message)) {
      throw new Error(error.message);
    }
    if (data) return true;
  }

  if (anonId) {
    const { data, error } = await supabaseAdmin
      .from("startup_watchers")
      .select("id")
      .eq("startup_id", startupId)
      .eq("anon_id", anonId)
      .maybeSingle();
    if (error && !isMissingStartupWatchersTable(error.message)) {
      throw new Error(error.message);
    }
    if (data) return true;
  }

  return false;
};

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const startupId = params.id;
  if (!startupId) {
    return NextResponse.json({ error: "startup id required" }, { status: 400 });
  }

  const startup = await ensureWatchableStartup(startupId);
  if (!startup) {
    return NextResponse.json({ error: "Startup not found" }, { status: 404 });
  }

  const auth = await getAuthContext(request);
  const anonId = readAnonWatchId(request);
  const [watchersCount, isWatching] = await Promise.all([
    getWatchCount(startupId),
    resolveWatchingState(startupId, auth?.userId ?? null, anonId),
  ]);

  return NextResponse.json({
    watchers_count: watchersCount,
    is_watching: isWatching,
  });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const startupId = params.id;
  if (!startupId) {
    return NextResponse.json({ error: "startup id required" }, { status: 400 });
  }

  const startup = await ensureWatchableStartup(startupId);
  if (!startup) {
    return NextResponse.json({ error: "Startup not found" }, { status: 404 });
  }

  const auth = await getAuthContext(request);
  const cookieCarrier = auth ? null : new NextResponse(null);
  const anonId = auth ? null : ensureAnonWatchId(request, cookieCarrier!);

  const insertPayload = auth
    ? { startup_id: startupId, profile_id: auth.userId, anon_id: null as string | null }
    : { startup_id: startupId, profile_id: null as string | null, anon_id: anonId };

  const { error } = await supabaseAdmin.from("startup_watchers").insert(insertPayload);
  if (error && !isDuplicateError(error.code)) {
    if (isMissingStartupWatchersTable(error.message)) {
      return NextResponse.json({ error: "Watcher feature unavailable" }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const watchersCount = await getWatchCount(startupId);
  const response = NextResponse.json({
    watchers_count: watchersCount,
    is_watching: true,
  });
  const setCookieHeader = cookieCarrier?.headers.get("set-cookie");
  if (setCookieHeader) {
    response.headers.set("set-cookie", setCookieHeader);
  }
  return response;
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const startupId = params.id;
  if (!startupId) {
    return NextResponse.json({ error: "startup id required" }, { status: 400 });
  }

  const startup = await ensureWatchableStartup(startupId);
  if (!startup) {
    return NextResponse.json({ error: "Startup not found" }, { status: 404 });
  }

  const auth = await getAuthContext(request);
  const anonId = readAnonWatchId(request);

  if (auth) {
    const { error } = await supabaseAdmin
      .from("startup_watchers")
      .delete()
      .eq("startup_id", startupId)
      .eq("profile_id", auth.userId);
    if (error) {
      if (isMissingStartupWatchersTable(error.message)) {
        return NextResponse.json({ error: "Watcher feature unavailable" }, { status: 503 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else if (anonId) {
    const { error } = await supabaseAdmin
      .from("startup_watchers")
      .delete()
      .eq("startup_id", startupId)
      .eq("anon_id", anonId);
    if (error) {
      if (isMissingStartupWatchersTable(error.message)) {
        return NextResponse.json({ error: "Watcher feature unavailable" }, { status: 503 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const watchersCount = await getWatchCount(startupId);
  return NextResponse.json({
    watchers_count: watchersCount,
    is_watching: false,
  });
}
