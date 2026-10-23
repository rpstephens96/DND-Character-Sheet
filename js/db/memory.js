export function memoryRepo() {
    const stores = new Map();
    const s = (n) => { let m = stores.get(n); if (!m) {
        m = new Map();
        stores.set(n, m);
    } return m; };
    const cl = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
    const id = (v) => String(v.id);
    return {
        get: async (n, k) => cl(s(n).get(k)),
        all: async (n) => [...s(n).values()].map(cl),
        byIndex: async (n, idx, v) => [...s(n).values()].filter((x) => x[idx] === v).map(cl),
        put: async (n, v) => { s(n).set(id(v), cl(v)); },
        del: async (n, k) => { s(n).delete(k); },
        tx: async (ops) => { for (const o of ops) {
            if (o.clear)
                s(o.store).clear();
            o.del?.forEach((k) => s(o.store).delete(k));
            o.put?.forEach((v) => s(o.store).set(id(v), cl(v)));
        } },
    };
}
