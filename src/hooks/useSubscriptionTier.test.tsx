import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      auth: {
        getSession: vi.fn(),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
      from: vi.fn(),
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
      }),
      removeChannel: vi.fn(),
    },
  };
});

describe("handoff 401 does not redirect", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("consumeTenantHandoff 401 throws (does not redirect)", async () => {
    const { consumeTenantHandoff } = await import("@/lib/tenant-handoff");

    const originalLocation = window.location;
    const mockLocation = { ...window.location, search: "?handoff_code=test-code-123" };
    Object.defineProperty(window, "location", {
      writable: true,
      value: mockLocation,
    });

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = fetchMock;

    await expect(consumeTenantHandoff()).rejects.toThrow(
      "Authentication required to complete handoff."
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/handoff/consume",
      expect.objectContaining({ method: "POST", credentials: "include" })
    );

    (globalThis as any).fetch = originalFetch;
    Object.defineProperty(window, "location", { writable: true, value: originalLocation });
  });

  it("consumeTenantHandoff with no handoff_code returns null without calling fetch", async () => {
    const { consumeTenantHandoff } = await import("@/lib/tenant-handoff");

    const originalLocation = window.location;
    const mockLocation = { ...window.location, search: "" };
    Object.defineProperty(window, "location", {
      writable: true,
      value: mockLocation,
    });

    const fetchMock = vi.fn();
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = fetchMock;

    const result = await consumeTenantHandoff();
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    (globalThis as any).fetch = originalFetch;
    Object.defineProperty(window, "location", { writable: true, value: originalLocation });
  });

  it("consumeTenantHandoff redirects to /auth on 401 does not redirect user to /auth", async () => {
    const { consumeTenantHandoff } = await import("@/lib/tenant-handoff");

    const originalLocation = window.location;
    const mockLocation = { ...window.location, search: "?handoff_code=test-code-123" };
    Object.defineProperty(window, "location", {
      writable: true,
      value: mockLocation,
    });

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = fetchMock;

    await expect(consumeTenantHandoff()).rejects.toThrow();

    (globalThis as any).fetch = originalFetch;
    Object.defineProperty(window, "location", { writable: true, value: originalLocation });
  });
});
