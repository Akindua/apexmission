/**
 * Per-account browser storage.
 *
 * A single browser can hold several ApexMission accounts, so every piece of
 * account-specific local data must be namespaced by the signed-in user id.
 * The active scope is cached in a module variable (synchronous reads are needed
 * by the mission store) and mirrored to a marker key so it survives reloads.
 */

const SCOPE_MARKER_KEY = "apexmission-storage-scope";
const SCOPE_SEPARATOR = "::";
const GUEST_SCOPE = "guest";

let cachedScope: string | null | undefined;

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

/** Returns the active storage scope, falling back to the pre-login guest scope. */
export function getStorageScope(): string {
  if (cachedScope !== undefined) return cachedScope ?? GUEST_SCOPE;

  if (!hasWindow()) {
    cachedScope = null;
    return GUEST_SCOPE;
  }

  try {
    cachedScope = window.localStorage.getItem(SCOPE_MARKER_KEY);
  } catch {
    cachedScope = null;
  }

  return cachedScope ?? GUEST_SCOPE;
}

/** Call whenever the authenticated account changes (sign-in, sign-up, sign-out). */
export function setStorageScope(userId: string | null): void {
  cachedScope = userId;

  if (!hasWindow()) return;

  try {
    if (userId) {
      window.localStorage.setItem(SCOPE_MARKER_KEY, userId);
    } else {
      window.localStorage.removeItem(SCOPE_MARKER_KEY);
    }
  } catch {
    // Storage unavailable — the in-memory scope still keeps this session safe.
  }
}

export function scopedStorageKey(baseKey: string, scope = getStorageScope()): string {
  return `${baseKey}${SCOPE_SEPARATOR}${scope}`;
}

/**
 * Reads a scoped key. On the first read after this feature ships, unscoped
 * legacy data is claimed by the first signed-in account (then removed) so
 * existing users keep their mission without leaking it into future accounts.
 */
export function getScopedItem(baseKey: string): string | null {
  if (!hasWindow()) return null;

  try {
    const storage = window.localStorage;
    const scopedKey = scopedStorageKey(baseKey);
    const scopedValue = storage.getItem(scopedKey);
    if (scopedValue !== null) return scopedValue;

    const legacyValue = storage.getItem(baseKey);
    if (legacyValue === null) return null;

    // Guests keep the legacy read-only view; only a real account claims it.
    if (getStorageScope() !== GUEST_SCOPE) {
      storage.setItem(scopedKey, legacyValue);
      storage.removeItem(baseKey);
    }

    return legacyValue;
  } catch {
    return null;
  }
}

export function setScopedItem(baseKey: string, value: string): void {
  if (!hasWindow()) return;

  try {
    window.localStorage.setItem(scopedStorageKey(baseKey), value);
  } catch {
    // Storage unavailable — non-fatal.
  }
}

export function removeScopedItem(baseKey: string): void {
  if (!hasWindow()) return;

  try {
    window.localStorage.removeItem(scopedStorageKey(baseKey));
    window.localStorage.removeItem(baseKey);
  } catch {
    // Storage unavailable — non-fatal.
  }
}

/** Every fixed local key that carries account-specific operational data. */
const SCOPED_BASE_KEYS = [
  "mission-control-state-v1",
  "apexmission-mission-plan-generated",
  "apexmission-morning-checkin",
  "apexmission-behavior-analytics",
  "apexmission-leaderboard-cache",
  "apexmission-active-theme",
  "mission-coach-chat-v1",
  "apexmission-coach-daily-tokens",
  "apex-tutorial-completed",
  "apex-onboarding-completed",
] as const;

/**
 * Wipes only the active account's local operational data. Other accounts on the
 * same browser and the Supabase auth session are left untouched.
 */
export function clearCurrentUserStorage(): void {
  if (!hasWindow()) return;

  const scope = getStorageScope();
  const suffix = `${SCOPE_SEPARATOR}${scope}`;

  try {
    const storage = window.localStorage;

    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (!key) continue;

      // Scoped entries for this account, including dynamic unlock keys.
      if (key.endsWith(suffix)) {
        storage.removeItem(key);
        continue;
      }

      // Legacy unscoped entries would otherwise be re-claimed on next read.
      if (key.startsWith("apexmission-unlocked-")) {
        storage.removeItem(key);
      }
    }

    for (const key of SCOPED_BASE_KEYS) {
      storage.removeItem(key);
    }
  } catch {
    // Storage unavailable — non-fatal.
  }
}

export { GUEST_SCOPE };
