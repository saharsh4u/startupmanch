import { NextResponse } from "next/server";
import { getAuthContext, requireRole } from "@/lib/supabase/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const extensionFromMime = (contentType: string | null | undefined) => {
  const normalized = (contentType ?? "").toLowerCase();
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/gif") return "gif";
  return "jpg";
};

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const startupId = params.id;
  if (!startupId) {
    return NextResponse.json({ error: "startup id required" }, { status: 400 });
  }

  const auth = await getAuthContext(request);
  if (!auth || !requireRole(auth, ["founder", "admin"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: startupRow, error: startupError } = await supabaseAdmin
    .from("startups")
    .select("id, founder_id")
    .eq("id", startupId)
    .maybeSingle();

  if (startupError) {
    return NextResponse.json({ error: startupError.message }, { status: 500 });
  }
  if (!startupRow) {
    return NextResponse.json({ error: "Startup not found" }, { status: 404 });
  }
  if (startupRow.founder_id !== auth.userId && !requireRole(auth, ["admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const extension = extensionFromMime(
    typeof body.content_type === "string" ? body.content_type : undefined
  );
  const objectPath = `founders/${startupId}-${Date.now()}.${extension}`;

  const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
    .from("pitch-posters")
    .createSignedUploadUrl(objectPath);

  if (uploadError || !uploadData?.signedUrl) {
    return NextResponse.json(
      { error: uploadError?.message ?? "Unable to create founder photo upload URL." },
      { status: 500 }
    );
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from("pitch-posters")
    .getPublicUrl(objectPath);

  return NextResponse.json({
    upload: {
      path: objectPath,
      signedUrl: uploadData.signedUrl,
      token: uploadData.token,
      publicUrl: publicUrlData.publicUrl ?? null,
    },
  });
}
