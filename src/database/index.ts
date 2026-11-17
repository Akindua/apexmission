/**
 * Database module — encrypted client-side storage using Web Crypto API +
 * IndexedDB (SQLCipher-equivalent 256-bit AES encryption at rest).
 *
 * Exports:
 *   - EncryptedStorage class
 *   - EncryptedStorageOptions interface
 *   - Convenience functions: encryptedSet, encryptedGet, encryptedRemove, encryptedDestroy
 *   - getEncryptedStorage singleton accessor
 */

export {
  EncryptedStorage,
  type EncryptedStorageOptions,
  getEncryptedStorage,
  encryptedSet,
  encryptedGet,
  encryptedRemove,
  encryptedDestroy,
} from "./encrypted-storage";
