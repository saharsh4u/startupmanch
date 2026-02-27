import { supabaseAdmin } from "@/lib/supabase/server";

type RateLimitInput = {
  actionType: string;
  maxCount: number;
  windowMs: number;
  guestId?: string | null;
  ipHash?: string | null;
  sessionId?: string | null;
};

const clampPositive = (value: number) => Math.max(1, Math.floor(value));

export const assertRateLimit = async (input: RateLimitInput) => {
  const maxCount = clampPositive(input.maxCount);
  const thresholdIso = new Date(Date.now() - clampPositive(input.windowMs)).toISOString();

  let query = supabaseAdmin
    .from("roundtable_action_audit")
    .select("id", { count: "exact", head: true })
    .eq("action_type", input.actionType)
    .gte("created_at", thresholdIso);

  if (input.guestId) {
    query = query.eq("guest_id", input.guestId);
  }
  if (input.ipHash) {
    query = query.eq("ip_hash", input.ipHash);
  }

  const { count, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  if ((count ?? 0) >= maxCount) {
    return false;
  }

  const { error: insertError } = await supabaseAdmin.from("roundtable_action_audit").insert({
    action_type: input.actionType,
    guest_id: input.guestId ?? null,
    ip_hash: input.ipHash ?? null,
    session_id: input.sessionId ?? null,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  return true;
};
