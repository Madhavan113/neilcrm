import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-side admin client. Uses the SECRET key, which bypasses Row-Level
// Security — so this must NEVER be imported into client components or anything
// that ships to the browser. Server routes / server actions only.

let _admin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error(
      "Supabase admin client needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in app/.env.local.",
    );
  }
  _admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}
