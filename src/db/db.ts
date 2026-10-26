// Minimal promise-based IndexedDB repository with versioned migrations.
// The Repository interface is the seam for a future encrypted sync adapter (see docs/SYNC.md).
import { APP_CONFIG } from '../config.js';

export const STORES = ['characters', 'events', 'snapshots', 'custom', 'campaigns', 'records', 'encounters', 'rolls', 'settings', 'drafts', 'meta', 'packs', 'packText'] as const;
export type StoreName = (typeof STORES)[number];

/** Each entry upgrades the database from (index) to (index + 1). Never edit a released migration; append a new one. */
const MIGRATIONS: ((db: IDBDatabase, tx: IDBTransaction) => void)[] = [
  (db) => {
    for (const s of ['characters', 'custom', 'campaigns', 'encounters', 'settings', 'drafts', 'meta']) db.createObjectStore(s, { keyPath: 'id' });
    const ev = db.createObjectStore('events', { keyPath: 'id' }); ev.createIndex('characterId', 'characterId');
    const sn = db.createObjectStore('snapshots', { keyPath: 'id' }); sn.createIndex('characterId', 'characterId');
    const rc = db.createObjectStore('records', { keyPath: 'id' }); rc.createIndex('campaignId', 'campaignId');
  },
  (db) => { const r = db.createObjectStore('rolls', { keyPath: 'id' }); r.createIndex('ts', 'ts'); },
  // v3: content packs. 'packs' holds manifest + lightweight index/defs; 'packText' holds full text, loaded on demand.
  (db) => { db.createObjectStore('packs', { keyPath: 'id' }); const t = db.createObjectStore('packText', { keyPath: 'id' }); t.createIndex('packId', 'packId'); },
];

export interface Repository {
  get<T>(store: StoreName, id: string): Promise<T | undefined>;
  all<T>(store: StoreName): Promise<T[]>;
  byIndex<T>(store: StoreName, index: string, value: string): Promise<T[]>;
  put<T>(store: StoreName, value: T): Promise<void>;
  del(store: StoreName, id: string): Promise<void>;
  /** Atomic multi-store write. */
  tx(ops: { store: StoreName; put?: unknown[]; del?: string[]; clear?: boolean }[]): Promise<void>;
}

const req = <T>(r: IDBRequest<T>): Promise<T> => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function openDb(): Promise<Repository> {
  if (!('indexedDB' in globalThis)) throw new Error('This browser does not support IndexedDB, so data cannot be saved.');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(APP_CONFIG.dbName, MIGRATIONS.length);
    r.onupgradeneeded = (e) => { const tx = r.transaction!; for (let v = e.oldVersion; v < MIGRATIONS.length; v++) MIGRATIONS[v]!(r.result, tx); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('Could not open the local database.'));
    r.onblocked = () => reject(new Error('The database is open in another tab with an older version. Close other tabs and reload.'));
  });
  db.onversionchange = () => { db.close(); alert('A newer version of the app was opened in another tab. This tab will reload.'); location.reload(); };
  const store = (name: StoreName, mode: IDBTransactionMode) => db.transaction(name, mode).objectStore(name);
  return {
    get: <T>(s: StoreName, id: string) => req(store(s, 'readonly').get(id)) as Promise<T | undefined>,
    all: <T>(s: StoreName) => req(store(s, 'readonly').getAll()) as Promise<T[]>,
    byIndex: <T>(s: StoreName, index: string, value: string) => req(store(s, 'readonly').index(index).getAll(value)) as Promise<T[]>,
    put: async (s, v) => { await req(store(s, 'readwrite').put(v)); },
    del: async (s, id) => { await req(store(s, 'readwrite').delete(id)); },
    tx: (ops) => new Promise<void>((resolve, reject) => {
      const t = db.transaction([...new Set(ops.map((o) => o.store))], 'readwrite');
      for (const o of ops) { const st = t.objectStore(o.store); if (o.clear) st.clear(); o.del?.forEach((id) => st.delete(id)); o.put?.forEach((v) => st.put(v)); }
      t.oncomplete = () => resolve(); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error ?? new Error('Transaction aborted.'));
    }),
  };
}

/** Request persistent storage so the browser is less likely to evict data. */
export async function requestPersistence(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
