/**
 * IndexedDB vault for End-to-End Encryption keys.
 * Private keys are stored locally as non-extractable CryptoKey objects.
 */

const DB_NAME = 'sadhya_e2ee_vault';
const DB_VERSION = 1;
const STORE_IDENTITY = 'identity_keys';
const STORE_SHARED = 'shared_keys';

// In-memory fallback for environments with blocked/disabled IndexedDB (e.g. strict private browsing)
const memoryIdentityKeys = new Map<string, { privateKey: CryptoKey; publicKeyJwk: JsonWebKey }>();
const memorySharedKeys = new Map<string, CryptoKey>();

function isIndexedDBAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null;
  } catch {
    return false;
  }
}

function openVaultDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_IDENTITY)) {
        db.createObjectStore(STORE_IDENTITY, { keyPath: 'uid' });
      }
      if (!db.objectStoreNames.contains(STORE_SHARED)) {
        db.createObjectStore(STORE_SHARED, { keyPath: 'pairId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const e2eeVault = {
  async saveIdentityKey(
    uid: string,
    privateKey: CryptoKey,
    publicKeyJwk: JsonWebKey
  ): Promise<void> {
    memoryIdentityKeys.set(uid, { privateKey, publicKeyJwk });
    try {
      const db = await openVaultDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_IDENTITY, 'readwrite');
        const store = tx.objectStore(STORE_IDENTITY);
        const req = store.put({ uid, privateKey, publicKeyJwk, createdAt: Date.now() });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('e2eeVault: IndexedDB saveIdentityKey failed, using memory store:', err);
    }
  },

  async getIdentityKey(
    uid: string
  ): Promise<{ privateKey: CryptoKey; publicKeyJwk: JsonWebKey } | null> {
    const mem = memoryIdentityKeys.get(uid);
    if (mem) return mem;

    try {
      const db = await openVaultDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_IDENTITY, 'readonly');
        const store = tx.objectStore(STORE_IDENTITY);
        const req = store.get(uid);
        req.onsuccess = () => {
          if (req.result) {
            memoryIdentityKeys.set(uid, {
              privateKey: req.result.privateKey,
              publicKeyJwk: req.result.publicKeyJwk,
            });
            resolve({
              privateKey: req.result.privateKey,
              publicKeyJwk: req.result.publicKeyJwk,
            });
          } else {
            resolve(null);
          }
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    }
  },

  async saveSharedKey(pairId: string, sharedKey: CryptoKey): Promise<void> {
    memorySharedKeys.set(pairId, sharedKey);
    try {
      const db = await openVaultDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_SHARED, 'readwrite');
        const store = tx.objectStore(STORE_SHARED);
        const req = store.put({ pairId, sharedKey, createdAt: Date.now() });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // Memory fallback is already set
    }
  },

  async getSharedKey(pairId: string): Promise<CryptoKey | null> {
    const mem = memorySharedKeys.get(pairId);
    if (mem) return mem;

    try {
      const db = await openVaultDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_SHARED, 'readonly');
        const store = tx.objectStore(STORE_SHARED);
        const req = store.get(pairId);
        req.onsuccess = () => {
          if (req.result?.sharedKey) {
            memorySharedKeys.set(pairId, req.result.sharedKey);
            resolve(req.result.sharedKey);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    }
  },
};
