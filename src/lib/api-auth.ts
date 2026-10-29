import { supabase } from "@/integrations/supabase/client";

/**
 * Builds Authorization headers for authenticated calls to our own API routes
 * (`/api/chat`, `/api/mission-plan`, …). The server verifies the Supabase
 * access token on every request — unauthenticated calls are rejected with 401.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
