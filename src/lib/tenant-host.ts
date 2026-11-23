/**
 * Wildcard tenant host utilities.
 *
 * The production deployment serves `*.apexmissions.app` through the same
 * TanStack Start server entry. These helpers extract the tenant label from the
 * incoming host and stamp it onto the request as `x-subdomain-slug` so server
 * functions can resolve the active organization without trusting client input.
 *
 * Local testing: add entries to /etc/hosts or use lvh.me:
 *   127.0.0.1       acme.localhost
 *   127.0.0.1       www.localhost
 * Then run the dev server on port 3000 (or any port) and visit:
 *   http://acme.localhost:3000
 *   http://www.localhost:3000
 */

export const TENANT_ROOT_DOMAIN = "apexmissions.app";
/**
 * Public origin of the dashboard. The apex domain currently serves a holding
 * page, so tenant users leaving a workspace are sent to the live `www` app.
 */
export const PLATFORM_APP_URL = `https://www.${TENANT_ROOT_DOMAIN}`;
export const SUBDOMAIN_HEADER = "x-subdomain-slug";

function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "").split(":")[0] ?? "";
}

/** True for the apex domain, `www`, and local development hosts. */
export function isPlatformHostname(
  hostname: string,
  rootDomain: string = TENANT_ROOT_DOMAIN,
): boolean {
  const host = normalizeHostname(hostname);
  const root = normalizeHostname(rootDomain);
  return host === root || host === `www.${root}` || host === "localhost" || host === "127.0.0.1";
}

/**
 * True when the host belongs to the production wildcard tenant domain.
 * Preview/local hosts are excluded because they cannot serve company subdomains.
 */
export function canUseTenantSubdomains(
  hostname: string,
  rootDomain: string = TENANT_ROOT_DOMAIN,
): boolean {
  const host = normalizeHostname(hostname);
  const root = normalizeHostname(rootDomain);
  return host === root || host === `www.${root}` || host.endsWith(`.${root}`);
}

/** Dashboard URL on the platform host (`www.apexmissions.app/app`). */
export function buildPlatformAppUrl(path = "/app"): string {
  return `${PLATFORM_APP_URL}${normalizePath(path)}`;
}

/**
 * Dashboard URL on a company subdomain. Falls back to the platform URL when
 * the slug is invalid. Local development maps to `<slug>.localhost:<port>`.
 */
export function buildTenantAppUrl(slug: string, path = "/app"): string {
  const normalized = normalizeTenantSlug(slug);
  if (!normalized) return buildPlatformAppUrl(path);

  if (typeof window !== "undefined") {
    const host = normalizeHostname(window.location.hostname);
    // Local development: acme.localhost:3000
    if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost")) {
      const port = window.location.port ? `:${window.location.port}` : "";
      return `${window.location.protocol}//${normalized}.localhost${port}${normalizePath(path)}`;
    }
  }

  return `https://${normalized}.${TENANT_ROOT_DOMAIN}${normalizePath(path)}`;
}

/** Single DNS label, lowercase alphanumeric plus internal hyphens (max 63). */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Labels that must never be treated as company slugs. They either belong to
 * platform infrastructure or are commonly reserved by hosting providers.
 */
const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "mail",
  "support",
  "auth",
  "login",
  "signin",
  "signup",
  "register",
  "account",
  "accounts",
  "billing",
  "pay",
  "payments",
  "checkout",
  "email",
  "smtp",
  "imap",
  "ftp",
  "cdn",
  "assets",
  "static",
  "media",
  "img",
  "images",
  "docs",
  "help",
  "status",
  "health",
  "blog",
  "news",
  "dev",
  "staging",
  "stage",
  "test",
  "testing",
  "preview",
  "beta",
  "internal",
  "intranet",
  "portal",
  "webhooks",
  "hooks",
  "ws",
  "socket",
  "realtime",
  "metrics",
  "analytics",
  "monitor",
  "edge",
  "proxy",
]);

export function normalizeTenantSlug(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const slug = value.trim().toLowerCase();
  return SLUG_PATTERN.test(slug) ? slug : null;
}

/**
 * Returns the company slug encoded in a hostname, or null when the host is the
 * apex domain, a reserved platform label, or not part of the tenant domain.
 *
 * Only single-label subdomains are accepted (`acme.apexmissions.app`). Deeper
 * hosts such as `acme.eu.apexmissions.app` are ignored so a wildcard edge rule
 * cannot be used to smuggle an arbitrary path into the tenant lookup.
 *
 * Local development: extracts slug from `<slug>.localhost` or `<slug>.localhost:<port>`
 */
export function extractSubdomainSlug(
  hostname: string,
  rootDomain: string = TENANT_ROOT_DOMAIN,
): string | null {
  const normalizedRoot = rootDomain
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "");
  const host = hostname.trim().toLowerCase().replace(/\.$/, "").split(":")[0] ?? "";

  if (!host || !normalizedRoot) return null;
  if (host === normalizedRoot) return null;

  // Local development: <slug>.localhost
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost")) {
    if (host === "localhost" || host === "127.0.0.1") return null;
    const label = host.slice(0, -".localhost".length);
    if (!label || label.includes(".")) return null;
    if (RESERVED_SUBDOMAINS.has(label)) return null;
    return normalizeTenantSlug(label);
  }

  const suffix = `.${normalizedRoot}`;
  if (!host.endsWith(suffix)) return null;

  const label = host.slice(0, -suffix.length);
  if (!label || label.includes(".")) return null;
  if (RESERVED_SUBDOMAINS.has(label)) return null;

  return normalizeTenantSlug(label);
}

function getRequestHost(request: Request): string {
  // Cloudflare preserves the public Host header, which also lets local testing
  // use `acme.localhost`. Fall back to the parsed URL when Host is absent.
  return request.headers.get("host") ?? new URL(request.url).host;
}

/**
 * Clones the request with a trusted `x-subdomain-slug` header.
 *
 * Any inbound value is always stripped first: the slug is derived exclusively
 * from the Host header, never from a header the caller can set themselves.
 * When there is no tenant slug and no spoofed header, the original request is
 * returned untouched to avoid cloning every asset request.
 */
export function withTenantSubdomainHeader(
  request: Request,
  rootDomain: string = TENANT_ROOT_DOMAIN,
): Request {
  const slug = extractSubdomainSlug(getRequestHost(request), rootDomain);
  const clientSupplied = request.headers.get(SUBDOMAIN_HEADER);

  if (!slug && clientSupplied === null) return request;

  const headers = new Headers(request.headers);
  headers.delete(SUBDOMAIN_HEADER);

  if (slug) headers.set(SUBDOMAIN_HEADER, slug);

  // Building from URL + init (instead of `new Request(request, { headers })`)
  // keeps this working in Vite/Node, where the incoming Request can come from
  // another realm and cannot be cloned by undici.
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: request.redirect,
    signal: request.signal,
  };

  if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
    init.body = request.body;
    init.duplex = "half";
  }

  return new Request(request.url, init);
}