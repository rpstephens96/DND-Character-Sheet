export const uid = () => {
    const c = globalThis.crypto;
    if (c?.randomUUID)
        return c.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
};
export const nowIso = () => new Date().toISOString();
export const clone = (v) => JSON.parse(JSON.stringify(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const IGNORED = new Set(['updatedAt']);
/** Apply `fn` to a clone of `c`. Records changed top-level fields as before/after for audit and undo. */
export function mutate(c, category, description, fn, opts = {}) {
    const draft = clone(c);
    fn(draft);
    const before = {};
    const after = {};
    for (const k of new Set([...Object.keys(c), ...Object.keys(draft)])) {
        if (IGNORED.has(k))
            continue;
        const a = c[k];
        const b = draft[k];
        if (!same(a, b)) {
            before[k] = a === undefined ? null : clone(a);
            after[k] = b === undefined ? null : clone(b);
        }
    }
    if (Object.keys(after).length === 0)
        return { next: c, event: null };
    draft.updatedAt = nowIso();
    const event = { id: uid(), characterId: c.id, ts: draft.updatedAt, category, description, before, after,
        reversible: opts.reversible ?? true, undone: false, note: opts.note, sessionId: opts.sessionId, source: opts.source };
    return { next: draft, event };
}
/** Reverse an event only if the affected fields still hold the values the event produced. */
export function undoEvent(c, ev) {
    if (!ev.reversible)
        throw new Error('This change cannot be reversed automatically.');
    if (ev.undone)
        throw new Error('This change has already been undone.');
    if (!ev.before || !ev.after)
        throw new Error('This event has no recorded values to restore.');
    const cur = c;
    const conflicts = Object.keys(ev.after).filter((k) => !same(cur[k] ?? null, ev.after[k]));
    if (conflicts.length)
        throw new Error(`Later changes affect: ${conflicts.join(', ')}. Undo those first, or edit manually.`);
    const next = clone(c);
    for (const [k, v] of Object.entries(ev.before)) {
        if (v === null)
            delete next[k];
        else
            next[k] = clone(v);
    }
    next.updatedAt = nowIso();
    return next;
}
