import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { withTenantSubdomainHeader } from "./lib/tenant-host";
import {
  agentBlockedResponse,
  isBlockedAgent,
  isBlockedPageAgent,
  isProbePath,
  withSecurityHeaders,
} from "./lib/security.server";

const FORBIDDEN_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>403 Forbidden</title></head>
<body style="background:#000;color:#a1a1aa;font-family:monospace;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="text-align:center"><h1 style="font-size:2rem">403</h1>
<p>Access denied. Automated harvesting of this application is prohibited.</p>
<p style="font-size:.7rem">© 2026 ApexMissions — All rights reserved.</p></div>
</body></html>`;

/**
 * Pre-TanStack security gate: rejects AI training/scraping crawlers, headless
 * automation on page routes, and common vulnerability-scanner probe paths
 * before any rendering or server function executes.
 */
function screenRequest(request: Request): Response | null {
  const userAgent = request.headers.get("user-agent");
  const { pathname } = new URL(request.url);

  // Probe paths (secret files, scanners) are refused outright.
  if (isProbePath(pathname)) return agentBlockedResponse();

  // AI scrapers never get any response body — page or API.
  if (isBlockedAgent(userAgent)) return agentBlockedResponse();

  // Headless automation is only refused on HTML page loads; authenticated
  // API clients (curl, SDKs) keep working.
  if (request.method === "GET" && !pathname.startsWith("/api/") && isBlockedPageAgent(userAgent)) {
    return new Response(FORBIDDEN_PAGE, {
      status: 403,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  return null;
}

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    // Refuse AI scrapers, automation page-loads, and scanner probe paths
    // before anything renders.
    const screened = screenRequest(request);
    if (screened) return withSecurityHeaders(screened);

    // Resolve `*.apexmissions.app` before TanStack handles the request so every
    // SSR render and server-function call sees the same trusted tenant header.
    const scopedRequest = withTenantSubdomainHeader(
      request,
      process.env["TENANT_ROOT_DOMAIN"] ?? undefined,
    );

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(scopedRequest, env, ctx);
      return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
