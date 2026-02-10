import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const missingBrowserEnvMessage =
  "Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY";

const createMissingBrowserClient = (): SupabaseClient =>
  new Proxy({} as SupabaseClient, {
    get() {
      throw new Error(missingBrowserEnvMessage);
    },
  });

export const hasBrowserSupabaseEnv = Boolean(supabaseUrl && anonKey);

export const supabaseBrowser: SupabaseClient = hasBrowserSupabaseEnv
  ? createClient(supabaseUrl!, anonKey!)
  : createMissingBrowserClient();
