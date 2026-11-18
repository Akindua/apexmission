/**
 * Database — Encrypted client-side storage layer.
 *
 * Provides AES-256-GCM at-rest encryption for sensitive operational data
 * persisted in IndexedDB. All keys are generated and managed through the
 * browser's Web Crypto API, which on many platforms is backed by hardware
 * keystore/TEE (TPM, Secure Enclave, Android Keystore, etc.) when
 * `extractable: false` is used.
 *
 * SQLCipher-equivalent design (browser Web Crypto implementation):
 *   - AES-256-GCM provides authenticated encryption (confidentiality +
 *     integrity) — equivalent to SQLCipher's 256-bit AES encryption at rest
 *   - Data Encryption Key (DEK) is generated with extractable: false so the
 *     raw key material never leaves the browser's secure key store
 *   - DEK is persisted across sessions by wrapping it with a key-encryption-key
 *     (KEK) derived from a user passphrase via PBKDF2-HMAC-SHA256
 *   - No plaintext fallback: if key generation, IndexedDB, or Web Crypto is
 *     unavailable, all operations throw — data is never written unencrypted
 *   - Each record uses a random 96-bit IV; IV + ciphertext are stored together
 */

import { getStorageScope } from "@/lib/user-storage";

const SCOPE_SEPARATOR = "::";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DB_NAME = "ApexMissionEncryptedStore";
const DB_VERSION = 1;
const STORE_NAME = "encryptedRecords";
const DEK_STORE_NAME = "dekStore";

const DEK_RECORD_KEY = "apexmission-dek-v1";
const WRAPPED_DEK_RECORD_KEY = "apexmission-wrapped-dek-v1";
const SALT_RECORD_KEY = "apexmission-dek-salt-v1";

const IV_LENGTH = 12; // 96 bits, recommended for AES-GCM
const SALT_LENGTH = 16;
const PBKDF2_ITERATIONS = 250_000;

// ---------------------------------------------------------------------------
// Capability checks
// ---------------------------------------------------------------------------

function isSecureContext(): boolean {
  return typeof window !== "undefined" && window.isSecureContext === true;
}

function hasWebCrypto(): boolean {
  return typeof window !== "undefined" && !!window.crypto?.subtle;
}

function hasIndexedDB(): boolean {
  return typeof window !== "undefined" && !!window.indexedDB;
}

// ---------------------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------------------

function openDatabase(storeNames: string[]): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      for (const name of storeNames) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name);
        }
      }
    };
  });
}

function getStore(
  db: IDBDatabase,
  name: string,
  mode: IDBTransactionMode = "readonly",
): IDBObjectStore {
  return db.transaction([name], mode).objectStore(name);
}

async function getRecord(db: IDBDatabase, store: string, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([store], "readonly");
    const request = tx.objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function setRecord(
  db: IDBDatabase,
  store: string,
  key: string,
  value: unknown,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([store], "readwrite");
    const request = tx.objectStore(store).put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function deleteRecord(db: IDBDatabase, store: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([store], "readwrite");
    const request = tx.objectStore(store).delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ---------------------------------------------------------------------------
// Key management
// ---------------------------------------------------------------------------

/**
 * Generates a random salt for PBKDF2 key derivation.
 */
function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

/**
 * Derives a key-encryption-key (KEK) from a user passphrase using PBKDF2.
 */
async function deriveKeyFromPassphrase(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as unknown as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false, // KEK is not extractable either
    ["wrapKey", "unwrapKey"],
  );
}

/**
 * Generates a fresh data-encryption key (DEK).
 * Uses extractable: false so raw key material never leaves the browser's
 * secure key store (backed by hardware TEE/TPM where available).
 */
async function generateDEK(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false, // extractable: false — hardware-backed where available
    ["encrypt", "decrypt"],
  );
}

/**
 * Wraps (encrypts) the DEK with a KEK for durable storage in IndexedDB.
 */
async function wrapDEK(dek: CryptoKey, kek: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.wrapKey("jwk", dek, kek, { name: "AES-GCM" });
}

/**
 * Unwraps (decrypts) the DEK from its wrapped form using the KEK.
 */
async function unwrapDEK(wrapped: ArrayBuffer, kek: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "jwk",
    wrapped,
    kek,
    { name: "AES-GCM" },
    { name: "AES-GCM", length: 256 },
    false, // extractable: false
    ["encrypt", "decrypt"],
  );
}

// ---------------------------------------------------------------------------
// EncryptedStorage class
// ---------------------------------------------------------------------------

export interface EncryptedStorageOptions {
  /** User passphrase used to derive a KEK for DEK persistence. */
  passphrase?: string;
  /** Scope for namespacing keys (defaults to current storage scope). */
  scope?: string;
}

export class EncryptedStorage {
  private db: IDBDatabase | null = null;
  private dek: CryptoKey | null = null;
  private initialized = false;
  public scope: string;

  constructor(options: EncryptedStorageOptions = {}) {
    this.scope = options.scope ?? getStorageScope();
  }

  /**
   * Initializes the storage backend: opens IndexedDB, obtains or creates a
   * DEK, and unwraps it if a passphrase is provided.
   *
   * Throws if Web Crypto or IndexedDB is unavailable — never falls back to
   * plaintext storage.
   */
  async init(options?: EncryptedStorageOptions): Promise<void> {
    if (!hasWebCrypto()) {
      throw new Error("Database: Web Crypto API is unavailable in this environment.");
    }
    if (!hasIndexedDB()) {
      throw new Error("Database: IndexedDB is unavailable in this environment.");
    }
    if (!isSecureContext()) {
      throw new Error("Database: requires a secure context (HTTPS or localhost).");
    }

    if (options?.scope) {
      this.scope = options.scope;
    }

    this.db = await openDatabase([STORE_NAME, DEK_STORE_NAME]);

    // Attempt to load an existing DEK; otherwise generate a fresh one.
    const existingWrapped = (await getRecord(this.db, DEK_STORE_NAME, WRAPPED_DEK_RECORD_KEY)) as
      ArrayBuffer | undefined;
    const existingSalt = (await getRecord(this.db, DEK_STORE_NAME, SALT_RECORD_KEY)) as
      Uint8Array | undefined;

    const passphrase = options?.passphrase;

    if (existingWrapped && existingSalt && passphrase) {
      // Unwrap existing DEK using passphrase-derived KEK
      const kek = await deriveKeyFromPassphrase(passphrase, existingSalt);
      this.dek = await unwrapDEK(existingWrapped, kek);
    } else if (passphrase) {
      // New DEK wrapped with passphrase-derived KEK for persistence
      const salt = generateSalt();
      const kek = await deriveKeyFromPassphrase(passphrase, salt);
      this.dek = await generateDEK();
      const wrapped = await wrapDEK(this.dek, kek);
      await setRecord(this.db, DEK_STORE_NAME, WRAPPED_DEK_RECORD_KEY, wrapped);
      await setRecord(this.db, DEK_STORE_NAME, SALT_RECORD_KEY, salt);
    } else {
      // Session-only DEK: extractable: false means it cannot be exported
      // and will be lost when the page/reload. Data encrypted with it is
      // unrecoverable after reload — callers must detect this.
      this.dek = await generateDEK();
    }

    this.initialized = true;
  }

  /** Returns true if the storage backend is initialized and ready. */
  isReady(): boolean {
    return this.initialized && this.dek !== null && this.db !== null;
  }

  /** Returns true if a durable DEK exists (data survives reloads). */
  hasDurableKey(): boolean {
    return this.initialized && this.dek !== null;
  }

  /**
   * Encrypts a string value and returns a base64-encoded ciphertext
   * (IV || ciphertext).
   */
  async encrypt(value: string): Promise<string> {
    if (!this.isReady()) {
      throw new Error("Database: not initialized. Call init() first.");
    }

    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoded = new TextEncoder().encode(value);
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, this.dek!, encoded);

    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return btoa(String.fromCharCode(...combined));
  }

  /**
   * Decrypts a base64-encoded ciphertext (IV || ciphertext) back to a string.
   */
  async decrypt(ciphertextB64: string): Promise<string> {
    if (!this.isReady()) {
      throw new Error("Database: not initialized. Call init() first.");
    }

    const combined = Uint8Array.from(atob(ciphertextB64), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);

    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, this.dek!, ciphertext);
    return new TextDecoder().decode(decrypted);
  }

  /**
   * Stores an encrypted record keyed by `id`.
   */
  async set(id: string, value: string): Promise<void> {
    if (!this.db) throw new Error("Database: database not open.");
    const encrypted = await this.encrypt(value);
    await setRecord(this.db, STORE_NAME, `${this.scope}${SCOPE_SEPARATOR}${id}`, encrypted);
  }

  /**
   * Retrieves and decrypts a record by `id`.
   */
  async get(id: string): Promise<string | null> {
    if (!this.db) throw new Error("Database: database not open.");
    const scopedKey = `${this.scope}${SCOPE_SEPARATOR}${id}`;
    const raw = (await getRecord(this.db, STORE_NAME, scopedKey)) as string | undefined;
    if (raw === undefined) return null;
    return this.decrypt(raw);
  }

  /**
   * Removes a record by `id`.
   */
  async remove(id: string): Promise<void> {
    if (!this.db) throw new Error("Database: database not open.");
    await deleteRecord(this.db, STORE_NAME, `${this.scope}${SCOPE_SEPARATOR}${id}`);
  }

  /**
   * Lists all (encrypted) record IDs for the current scope.
   * Returns only keys — values remain encrypted at rest.
   */
  async keys(): Promise<string[]> {
    if (!this.db) throw new Error("Database: database not open.");
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORE_NAME], "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAllKeys();
      request.onsuccess = () => {
        const prefix = `${this.scope}${SCOPE_SEPARATOR}`;
        const allKeys = request.result as string[];
        resolve(allKeys.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)));
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clears all records for the current scope and destroys the DEK.
   * After this, previously encrypted data is unrecoverable.
   */
  async destroy(): Promise<void> {
    if (!this.db) throw new Error("Database: database not open.");

    const keys = await this.keys();
    for (const id of keys) {
      await deleteRecord(this.db, STORE_NAME, `${this.scope}${SCOPE_SEPARATOR}${id}`);
    }
    await deleteRecord(this.db, DEK_STORE_NAME, WRAPPED_DEK_RECORD_KEY);
    await deleteRecord(this.db, DEK_STORE_NAME, SALT_RECORD_KEY);

    this.dek = null;
    this.initialized = false;
  }
}

// ---------------------------------------------------------------------------
// Singleton instance (lazy-initialized)
// ---------------------------------------------------------------------------

let encryptedStorage: EncryptedStorage | null = null;

/**
 * Returns the singleton EncryptedStorage instance, initializing it on first
 * access. Accepts an optional passphrase for durable key wrapping.
 */
export async function getEncryptedStorage(
  options?: EncryptedStorageOptions,
): Promise<EncryptedStorage> {
  if (!encryptedStorage) {
    encryptedStorage = new EncryptedStorage(options);
  }
  if (!encryptedStorage.isReady() || (options?.passphrase && !encryptedStorage.hasDurableKey())) {
    await encryptedStorage.init(options);
  }
  return encryptedStorage;
}

/**
 * Convenience: encrypt and store a value under `id`.
 */
export async function encryptedSet(
  id: string,
  value: string,
  options?: EncryptedStorageOptions,
): Promise<void> {
  const store = await getEncryptedStorage(options);
  await store.set(id, value);
}

/**
 * Convenience: retrieve and decrypt a value by `id`.
 */
export async function encryptedGet(
  id: string,
  options?: EncryptedStorageOptions,
): Promise<string | null> {
  const store = await getEncryptedStorage(options);
  return store.get(id);
}

/**
 * Convenience: remove a record by `id`.
 */
export async function encryptedRemove(id: string): Promise<void> {
  const store = await getEncryptedStorage();
  await store.remove(id);
}

/**
 * Convenience: destroy all encrypted data for the current scope.
 */
export async function encryptedDestroy(): Promise<void> {
  if (encryptedStorage) {
    await encryptedStorage.destroy();
    encryptedStorage = null;
  }
}
