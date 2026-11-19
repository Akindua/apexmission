/**
 * Shared helpers for graceful, user-facing handling of unauthenticated API
 * responses. Centralises the 401 → sign-in redirect so every client fetch
 * behaves consistently instead of crashing the React tree with an unhandled
 * promise rejection.
 */

/**
 * Thrown by client data-fetch helpers when the server responds 401 so that
 * callers (page components) can catch it and redirect to the sign-in page.
 */
export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized: sign in required.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Inspects a fetch Response. On 401 it navigates to the sign-in page and
 * returns true; otherwise returns false so the caller can proceed normally.
 *
 * @param navigateFn - TanStack Router navigate function (from useNavigate).
 * @param next - Optional next URL to return to after signing in.
 */
export function handleUnauthorizedResponse(
  response: Response,
  navigateFn: (opts: { to: string; search?: { mode?: string; next?: string | undefined } }) => void,
  next?: string | undefined,
): boolean {
  if (response.status === 401) {
    navigateFn({ to: "/auth", search: { mode: "signin", ...(next ? { next } : {}) } });
    return true;
  }
  return false;
}

/**
 * Wraps a fetch call to our own API routes. On a 401 response it redirects to
 * the sign-in page and returns null; otherwise returns the Response.
 *
 * Use this instead of raw `fetch()` for authenticated endpoints such as
 * `/api/jarvis/suggest`, `/api/handoff/issue`, `/api/day-plan`, etc.
 */
export async function fetchAuth(
  input: RequestInfo | URL,
  init: RequestInit,
  navigateFn: (opts: { to: string; search?: { mode?: string; next?: string | undefined } }) => void,
  next?: string | undefined,
): Promise<Response | null> {
  const response = await fetch(input, init);
  if (handleUnauthorizedResponse(response, navigateFn, next)) return null;
  return response;
}
