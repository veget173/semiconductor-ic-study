import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export let supabase = null;

export async function initSupabase() {
  if (!isConfigured || supabase) return supabase;
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.4");
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  return supabase;
}
