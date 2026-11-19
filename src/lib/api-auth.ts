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

/**
 * Handles a fetch Response from an authenticated API route.
 *
 * On a 401 Unauthorized (missing/expired session) it redirects the browser to
 * /auth?mode=signin instead of letting an unhandled rejection crash the React
 * tree, and returns true so the caller knows to stop processing. Returns false
 * for every other status so the caller proceeds with its normal error path.
 */
export function handleUnauthenticated(response: Response): boolean {
  if (response.status === 401) {
    if (typeof window !== "undefined" && typeof window.location !== "undefined") {
      window.location.href = "/auth?mode=signin";
    }
    return true;
  }
  return false;
}
