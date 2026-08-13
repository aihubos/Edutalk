import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

/**
 * Browser-side official Supabase SSR client. Returns null in the current demo
 * setup until both public environment values and @supabase/ssr are available.
 */
export function createBrowserSupabaseClient() {
  const config = getSupabasePublicConfig();
  if (!config) return null;

  return createBrowserClient(config.url, config.publishableKey);
}
