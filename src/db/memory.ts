// In-memory Repository with the same contract as IndexedDB. Used when the browser blocks storage
// (e.g. some browsers for files opened from disk) and by the test suite. Data is lost when the page closes.
import type { Repository, StoreName } from './db.js';

export function memoryRepo(): Repository {
  const stores = new Map<StoreName, Map<string, unknown>>();
  const s = (n: StoreName) => { let m = stores.get(n); if (!m) { m = new Map(); stores.set(n, m); } return m; };
  const cl = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
  const id = (v: unknown) => String((v as { id: string }).id);
  return {
    get: async <T>(n: StoreName, k: string) => cl(s(n).get(k)) as T | undefined,
    all: async <T>(n: StoreName) => [...s(n).values()].map(cl) as T[],
    byIndex: async <T>(n: StoreName, idx: string, v: string) => [...s(n).values()].filter((x) => (x as Record<string, unknown>)[idx] === v).map(cl) as T[],
    put: async (n, v) => { s(n).set(id(v), cl(v)); },
    del: async (n, k) => { s(n).delete(k); },
    tx: async (ops) => { for (const o of ops) { if (o.clear) s(o.store).clear(); o.del?.forEach((k) => s(o.store).delete(k)); o.put?.forEach((v) => s(o.store).set(id(v), cl(v))); } },
  };
}
