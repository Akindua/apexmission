/**
 * Data Export — Client-side data portability utility.
 *
 * Queries all IndexedDB databases and localStorage, compiles the records
 * into a structured JSON object with an export timestamp, and triggers a
 * browser download. Designed to support GDPR/PIPEDA data portability rights.
 *
 * No data is sent to any server — everything happens entirely in the browser.
 */

const EXPORT_VERSION = "1.0";
const KNOWN_DB_NAMES = ["ApexMissionEncryptedStore"];

/**
 * Discovers all IndexedDB database names available in the browser.
 * Uses indexedDB.databases() when available (modern browsers), falls back
 * to probing known database names.
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
          // Database didn't exist before; close and don't count it.
          req.result.close();
          resolve(null);
        };
      });
      if (db) {
        found.push(name);
        db.close();
      }
    } catch {
      // Database doesn't exist or can't be accessed — skip it.
    }
  }
  return found;
}

/**
 * Exports all records from every object store in a single IndexedDB database.
 */
async function exportDatabase(dbName: string): Promise<Record<string, unknown[]>> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(dbName);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const result: Record<string, unknown[]> = {};

  for (const storeName of db.objectStoreNames) {
    const records: unknown[] = await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => resolve(getAllReq.result ?? []);
      getAllReq.onerror = () => reject(getAllReq.error);
      tx.oncomplete = () => resolve(records);
      tx.onerror = () => reject(tx.error);
    });
    result[storeName] = records;
  }

  db.close();
  return result;
}

/**
 * Collects all localStorage key/value pairs.
 */
function exportLocalStorage(): Record<string, string> {
  const data: Record<string, string> = {};
  if (typeof localStorage === "undefined") return data;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      data[key] = localStorage.getItem(key) ?? "";
    }
  }
  return data;
}

/**
 * Builds the complete export payload, returns the blob, filename, and
 * the raw databases map (for record counting).
 */
async function buildExportPayload(): Promise<{
  blob: Blob;
  filename: string;
  databases: Record<string, Record<string, unknown[] | string>>;
}> {
  const dbNames = await discoverDatabaseNames();

  const databases: Record<string, Record<string, unknown[] | string>> = {};
  for (const name of dbNames) {
    try {
      databases[name] = await exportDatabase(name);
    } catch (err) {
      console.error(`[DataExport] Failed to export database ${name}:`, err);
      databases[name] = {
        _error: `Failed to export: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const localStorageData = exportLocalStorage();

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    exportVersion: EXPORT_VERSION,
    source: "ApexMissions Client",
    databases,
    localStorage: localStorageData,
  };

  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
    type: "application/json;charset=utf-8",
  });

  const dateStr = new Date().toISOString().split("T")[0];
  const filename = `apexmissions-data-export-${dateStr}.json`;

  return { blob, filename, databases };
}

/**
 * Builds the export blob and filename for download.
 */
export async function buildDataExport(): Promise<{ blob: Blob; filename: string }> {
  const { blob, filename } = await buildExportPayload();
  return { blob, filename };
}

/**
 * Triggers a browser download of a blob as a file with the given filename.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Convenience: export all client-side data and immediately download it.
 */
export async function exportAndDownload(): Promise<{ filename: string; recordCount: number }> {
  const { blob, filename, databases } = await buildExportPayload();
  downloadBlob(blob, filename);

  // Count total records for user feedback
  let recordCount = 0;
  for (const stores of Object.values(databases)) {
    for (const value of Object.values(stores)) {
      if (Array.isArray(value)) {
        recordCount += value.length;
      }
    }
  }

  return { filename, recordCount };
}
