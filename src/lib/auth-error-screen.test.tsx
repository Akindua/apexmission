import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  recordAuthRedirect,
  resetAuthRedirects,
  classifyAuthError,
} from "./auth-error-screen";

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, "sessionStorage", {
  value: sessionStorageMock,
  writable: true,
});

describe("recordAuthRedirect / resetAuthRedirects", () => {
  beforeEach(() => {
    sessionStorageMock.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-20T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorageMock.clear();
  });

  it("increments count on each call, trips at > 3", () => {
    expect(recordAuthRedirect()).toBe(false); // count 1
    expect(recordAuthRedirect()).toBe(false); // count 2
    expect(recordAuthRedirect()).toBe(false); // count 3
    expect(recordAuthRedirect()).toBe(true); // count 4 > limit 3
  });

  it("resets after window expiry", () => {
    recordAuthRedirect();
    recordAuthRedirect();
    recordAuthRedirect(); // count 3

    vi.advanceTimersByTime(11_000); // past LOOP_WINDOW_MS

    expect(recordAuthRedirect()).toBe(false); // new window, count 1
  });

  it("resetAuthRedirects clears the counter", () => {
    recordAuthRedirect();
    recordAuthRedirect();
    resetAuthRedirects();
    expect(recordAuthRedirect()).toBe(false); // count 1 again
  });
});

describe("classifyAuthError", () => {
  it("returns 'redirect' for 401", () => {
    expect(classifyAuthError(new Response(null, { status: 401 }))).toBe("redirect");
  });

  it("returns 'show-error' for 403", () => {
    expect(classifyAuthError(new Response(null, { status: 403 }))).toBe("show-error");
  });

  it("returns 'show-error' for 500", () => {
    expect(classifyAuthError(new Response(null, { status: 500 }))).toBe("show-error");
  });

  it("returns 'continue' for 200", () => {
    expect(classifyAuthError(new Response(null, { status: 200 }))).toBe("continue");
  });

  it("returns 'continue' for 204", () => {
    expect(classifyAuthError(new Response(null, { status: 204 }))).toBe("continue");
  });
});
