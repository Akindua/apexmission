import { supabase } from "@/integrations/supabase/client";
import { classifyAuthError, type AuthErrorAction } from "./auth-error-screen";

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
 * Classifies an HTTP response from an authenticated API route.
 *
 * - 401 (invalid/expired token) → "redirect" to /auth
 * - 403 (permission denied) → "show-error"
 * - 500+ (server error) → "show-error"
 * - everything else → "continue"
 */
export function handleUnauthenticated(response: Response): AuthErrorAction {
  return classifyAuthError(response);
}
