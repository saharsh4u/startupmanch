import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const missingServerEnvMessage =
  "Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY";

const createMissingServerClient = (): SupabaseClient =>
  new Proxy({} as SupabaseClient, {
    get() {
      throw new Error(missingServerEnvMessage);
    },
  });

export const hasServerSupabaseEnv = Boolean(supabaseUrl && serviceRoleKey);

export const supabaseAdmin: SupabaseClient = hasServerSupabaseEnv
  ? createClient(supabaseUrl!, serviceRoleKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : createMissingServerClient();
