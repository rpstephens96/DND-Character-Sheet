// Append-only character event history with safe, conflict-checked reversal.
import type { Character, CharacterEvent, EventCategory } from '../types.js';

export const uid = (): string => {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
};
export const nowIso = (): string => new Date().toISOString();
export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const IGNORED = new Set(['updatedAt']);

export interface Mutation { next: Character; event: CharacterEvent | null; }

/** Apply `fn` to a clone of `c`. Records changed top-level fields as before/after for audit and undo. */
export function mutate(c: Character, category: EventCategory, description: string, fn: (draft: Character) => void, opts: { reversible?: boolean; note?: string; sessionId?: string; source?: string } = {}): Mutation {
  const draft = clone(c);
  fn(draft);
  const before: Record<string, unknown> = {}; const after: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(c), ...Object.keys(draft)])) {
    if (IGNORED.has(k)) continue;
    const a = (c as unknown as Record<string, unknown>)[k]; const b = (draft as unknown as Record<string, unknown>)[k];
    if (!same(a, b)) { before[k] = a === undefined ? null : clone(a); after[k] = b === undefined ? null : clone(b); }
  }
  if (Object.keys(after).length === 0) return { next: c, event: null };
  draft.updatedAt = nowIso();
  const event: CharacterEvent = { id: uid(), characterId: c.id, ts: draft.updatedAt, category, description, before, after,
    reversible: opts.reversible ?? true, undone: false, note: opts.note, sessionId: opts.sessionId, source: opts.source };
  return { next: draft, event };
}

/** Reverse an event only if the affected fields still hold the values the event produced. */
export function undoEvent(c: Character, ev: CharacterEvent): Character {
  if (!ev.reversible) throw new Error('This change cannot be reversed automatically.');
  if (ev.undone) throw new Error('This change has already been undone.');
  if (!ev.before || !ev.after) throw new Error('This event has no recorded values to restore.');
  const cur = c as unknown as Record<string, unknown>;
  const conflicts = Object.keys(ev.after).filter((k) => !same(cur[k] ?? null, ev.after![k]));
  if (conflicts.length) throw new Error(`Later changes affect: ${conflicts.join(', ')}. Undo those first, or edit manually.`);
  const next = clone(c) as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(ev.before)) { if (v === null) delete next[k]; else next[k] = clone(v); }
  next.updatedAt = nowIso();
  return next as unknown as Character;
}
