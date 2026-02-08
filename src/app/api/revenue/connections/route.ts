import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, requireRole } from "@/lib/supabase/auth";
import { encryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";

type Provider = "stripe" | "razorpay";

const validateKey = (provider: Provider, key: string) => {
  if (!key || typeof key !== "string") return "API key required.";
  if (provider === "stripe") {
    if (!/^rk_(live|test)_[A-Za-z0-9]{10,}$/.test(key)) {
      return "Use a Stripe restricted (read-only) key starting with rk_live_ / rk_test_.";
    }
  }
  if (provider === "razorpay") {
    if (!/^rzp_(live|test)_[A-Za-z0-9]+:[A-Za-z0-9_\\-]{5,}$/.test(key) && !/^rzp_(live|test)_[A-Za-z0-9]+$/.test(key)) {
      return "Use Razorpay key_id:key_secret (single line) starting with rzp_live_ / rzp_test_.";
    }
  }
  return null;
};

export async function POST(request: Request) {
  try {
    const auth = await getAuthContext(request);
    if (!auth || !requireRole(auth, ["founder", "admin"])) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json();
    const { startup_id, provider, api_key } = payload ?? {};
    if (!startup_id) return NextResponse.json({ error: "startup_id required" }, { status: 400 });
    if (provider !== "stripe" && provider !== "razorpay") {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }
    const keyError = validateKey(provider, api_key);
    if (keyError) return NextResponse.json({ error: keyError }, { status: 400 });

    const { data: startupRow } = await supabaseAdmin
      .from("startups")
      .select("id, founder_id")
      .eq("id", startup_id)
      .single();
    if (!startupRow) return NextResponse.json({ error: "Startup not found" }, { status: 404 });
    if (startupRow.founder_id !== auth.userId && !requireRole(auth, ["admin"])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const encrypted = encryptSecret(api_key);

    const { data, error } = await supabaseAdmin
      .from("revenue_connections")
      .upsert(
        {
          startup_id,
          provider,
          api_key_ciphertext: encrypted,
          status: "active",
          last_synced_at: null,
        },
        { onConflict: "startup_id,provider" }
      )
      .select("id, provider, status, last_synced_at")
      .single();

    if (error) throw error;

    return NextResponse.json({ connection: data });
  } catch (err: any) {
    console.error("revenue connection error", err);
    return NextResponse.json({ error: err.message ?? "Unable to save connection" }, { status: 500 });
  }
}
