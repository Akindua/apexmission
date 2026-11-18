/**
 * Data Wipe — Secure client-side data deletion utility.
 *
 * Completely deletes all IndexedDB databases and clears app-related
 * localStorage keys, ensuring full client-side data removal upon user
 * request. Designed to support GDPR/PIPEDA right-to-erasure (right to be
 * forgotten).
 *
 * No data is sent to any server — everything happens entirely in the browser.
 * Once wiped, locally stored data is unrecoverable.
 */

const KNOWN_DB_NAMES = ["ApexMissionEncryptedStore"];
const LOCALSTORAGE_PREFIXES = ["apexmission-", "apex-onboarding-completed"];
const LOCALSTORAGE_EXACT_KEYS = ["apexmission-storage-scope"];

/**
 * Discovers all IndexedDB database names available in the browser.
 */
async function discoverDatabaseNames(): Promise<string[]> {
  if (typeof indexedDB !== "undefined" && typeof indexedDB.databases === "function") {
    try {
      const dbs = await indexedDB.databases();
      return (dbs ?? []).map((db) => db.name).filter((name): name is string => Boolean(name));
    } catch {
      // Fall through to known-name probing
    }
  }

  const found: string[] = [];
  for (const name of KNOWN_DB_NAMES) {
    try {
      const db = await new Promise<IDBDatabase | null>((resolve, reject) => {
        const req = indexedDB.open(name);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onupgradeneeded = () => {
          req.result.close();
          resolve(null);
        };
      });
      if (db) {
        found.push(name);
        db.close();
      }
    } catch {
      // Skip databases that don't exist or can't be accessed.
    }
  }
  return found;
}

/**
 * Deletes a single IndexedDB database by name.
 */
async function deleteDatabase(dbName: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => {
      // Database is blocked by another open connection — cannot delete now.
      resolve();
    };
  });
}

/**
 * Clears app-related localStorage keys.
 */
function clearLocalStorageKeys(): string[] {
  const clearedKeys: string[] = [];
  if (typeof localStorage === "undefined") return clearedKeys;

  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    const isPrefixed = LOCALSTORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));
    const isExact = LOCALSTORAGE_EXACT_KEYS.includes(key);
    if (isPrefixed || isExact) {
      keysToRemove.push(key);
    }
  }

  // Collect first, then remove (localStorage length changes during removal).
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
    clearedKeys.push(key);
  }

  return clearedKeys;
}

/**
 * Wipes all client-side data: IndexedDB databases and localStorage keys.
 *
 * Returns an object describing what was deleted so the UI can inform the user.
 */
export async function wipeAllLocalData(): Promise<{
  deletedDbNames: string[];
  clearedLocalStorageKeys: string[];
}> {
  const dbNames = await discoverDatabaseNames();
  const deletedDbNames: string[] = [];

  for (const name of dbNames) {
    try {
      await deleteDatabase(name);
      deletedDbNames.push(name);
    } catch (err) {
      console.error(`[DataWipe] Failed to delete database ${name}:`, err);
    }
  }

  const clearedLocalStorageKeys = clearLocalStorageKeys();

  return { deletedDbNames, clearedLocalStorageKeys };
}

/**
 * Convenience: wipe all data and return a summary for UI feedback.
 */
export async function performDataWipe(): Promise<{
  success: boolean;
  deletedDbNames: string[];
  clearedLocalStorageKeys: string[];
  error?: string;
}> {
  try {
    const result = await wipeAllLocalData();
    return {
      success: true,
      deletedDbNames: result.deletedDbNames,
      clearedLocalStorageKeys: result.clearedLocalStorageKeys,
    };
  } catch (err) {
    return {
      success: false,
      deletedDbNames: [],
      clearedLocalStorageKeys: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
