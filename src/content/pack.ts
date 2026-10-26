// Pack validation, installation (split into index/defs + text) and export. DOM-free and unit-tested.
import type { PackFile, PackEntry, PackManifest, InstalledPack, PackText, IndexEntry, EntryKind, EntryDefs } from './types.js';
import { PACK_FORMAT, PACK_FORMAT_VERSION, ENTRY_KINDS, textKey } from './types.js';
import { safeParse } from '../io/safe.js';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const SLUG = /^[a-z0-9][a-z0-9._-]{0,80}$/;
const SCRIPTY = /<\s*script|javascript:|<\s*iframe|on\w+\s*=\s*["']/i;
export const MAX_TEXT = 200_000;
export const MAX_ENTRIES = 20_000;

export interface PackReport { ok: boolean; errors: string[]; warnings: string[]; pack: PackFile | null; counts: Partial<Record<EntryKind, number>>; }

function scan(v: unknown, path: string, errors: string[]): void {
  if (typeof v === 'string') { if (SCRIPTY.test(v)) errors.push(`${path} contains script-like content.`); return; }
  if (Array.isArray(v)) v.forEach((x, i) => scan(x, `${path}[${i}]`, errors));
  else if (isObj(v)) for (const [k, x] of Object.entries(v)) scan(x, `${path}.${k}`, errors);
}

/** Minimal structural checks per def kind. Invalid defs are dropped (entry kept as text) with a warning. */
function defProblem(kind: EntryKind, d: Record<string, unknown>): string | null {
  const num = (k: string) => typeof d[k] === 'number' && Number.isFinite(d[k]);
  const str = (k: string) => typeof d[k] === 'string';
  switch (kind) {
    case 'spell': return num('level') && (d.level as number) >= 0 && (d.level as number) <= 9 && str('school') && Array.isArray(d.classes) ? null : 'spell needs level 0–9, school and classes';
    case 'weapon': return str('damage') && (d.category === 'simple' || d.category === 'martial') && (d.kind === 'melee' || d.kind === 'ranged') && Array.isArray(d.properties) ? null : 'weapon needs category, kind, damage and properties';
    case 'armor': return ['light', 'medium', 'heavy', 'shield'].includes(String(d.type)) && num('base') ? null : 'armour needs type and base AC';
    case 'monster': return num('ac') && num('hp') && num('cr') && isObj(d.abilities) ? null : 'monster needs ac, hp, cr and abilities';
    case 'species': return num('speed') && isObj(d.asi) && Array.isArray(d.traits) ? null : 'species needs speed, asi and traits';
    case 'background': return Array.isArray(d.skills) && isObj(d.feature) ? null : 'background needs skills and feature';
    default: return str('name') ? null : 'definition needs a name';
  }
}

export function validatePack(input: unknown): PackReport {
  const errors: string[] = []; const warnings: string[] = []; const counts: Partial<Record<EntryKind, number>> = {};
  const raw = typeof input === 'string' ? safeParse(input) : input;
  if (!isObj(raw) || raw.format !== PACK_FORMAT) return { ok: false, errors: ['This is not an Adventurer’s Ledger content pack.'], warnings, pack: null, counts };
  if (typeof raw.formatVersion !== 'number' || raw.formatVersion > PACK_FORMAT_VERSION) errors.push(`Unsupported pack format version ${String(raw.formatVersion)}.`);
  const m = raw.manifest;
  if (!isObj(m)) return { ok: false, errors: ['The pack has no manifest.'], warnings, pack: null, counts };
  for (const k of ['id', 'title', 'shortName', 'version', 'licence', 'attribution', 'source']) if (typeof m[k] !== 'string' || !(m[k] as string).trim()) errors.push(`Manifest field “${k}” is required.`);
  if (typeof m.id === 'string' && !SLUG.test(m.id)) errors.push('Manifest id must be lower-case letters, numbers, dots, dashes or underscores.');
  if (!['srd51', 'srd521', 'custom', 'any'].includes(String(m.ruleset))) errors.push('Manifest ruleset must be srd51, srd521, custom or any.');
  scan(m, 'manifest', errors);
  if (!Array.isArray(raw.entries)) errors.push('The pack has no entries list.');
  const entries: PackEntry[] = [];
  const seen = new Set<string>();
  const list = Array.isArray(raw.entries) ? raw.entries : [];
  if (list.length > MAX_ENTRIES) errors.push(`Too many entries (${list.length}; limit ${MAX_ENTRIES}).`);
  list.slice(0, MAX_ENTRIES).forEach((e, i) => {
    const where = `Entry ${i + 1}`;
    if (!isObj(e)) { errors.push(`${where} is not an object.`); return; }
    const kind = e.kind as EntryKind;
    if (!ENTRY_KINDS.includes(kind)) { warnings.push(`${where}: unknown kind “${String(e.kind)}” skipped.`); return; }
    if (typeof e.id !== 'string' || !SLUG.test(e.id)) { errors.push(`${where}: invalid id.`); return; }
    if (typeof e.name !== 'string' || !e.name.trim()) { errors.push(`${where} (${e.id}): name is required.`); return; }
    const key = `${kind}/${e.id}`;
    if (seen.has(key)) { warnings.push(`${where}: duplicate ${key} skipped.`); return; }
    const text = typeof e.text === 'string' ? e.text : '';
    if (text.length > MAX_TEXT) { errors.push(`${where} (${e.id}): text is too long.`); return; }
    const entryErrors: string[] = []; scan(e, where, entryErrors);
    if (entryErrors.length) { errors.push(...entryErrors); return; }
    let def = isObj(e.def) ? (e.def as unknown as PackEntry['def']) : undefined;
    if (def) { const p = defProblem(kind, def as unknown as Record<string, unknown>); if (p) { warnings.push(`${where} (${e.id}): ${p}; kept as text only.`); def = undefined; } }
    seen.add(key);
    counts[kind] = (counts[kind] ?? 0) + 1;
    entries.push({ kind, id: e.id, name: e.name.trim(), link: typeof e.link === 'string' ? e.link : undefined, meta: isObj(e.meta) ? (e.meta as PackEntry['meta']) : {}, def, text });
  });
  const manifest = { ...(m as unknown as PackManifest), counts };
  const pack: PackFile = { format: PACK_FORMAT, formatVersion: PACK_FORMAT_VERSION, manifest, entries };
  return { ok: errors.length === 0 && entries.length > 0, errors: entries.length ? errors : [...errors, 'The pack contains no valid entries.'], warnings, pack, counts };
}

/** Split a validated pack into the stored record and text records. */
export function toInstalled(pack: PackFile, order: number, installedAt: string): { record: InstalledPack; texts: PackText[] } {
  const pid = pack.manifest.id;
  const rulesets = pack.manifest.ruleset === 'any' ? undefined : [pack.manifest.ruleset];
  const source = { origin: 'pack' as const, label: pack.manifest.shortName };
  const index: IndexEntry[] = []; const texts: PackText[] = [];
  const defs: InstalledPack['defs'] = {};
  for (const e of pack.entries) {
    index.push({ packId: pid, kind: e.kind, id: e.id, name: e.name, link: e.link, meta: e.meta ?? {}, hasText: !!e.text });
    if (e.text) texts.push({ id: textKey(pid, e.kind, e.id), packId: pid, text: e.text });
    if (e.def && e.kind in DEF_KINDS) {
      const k = e.kind as keyof EntryDefs;
      const def = { ...(e.def as unknown as Record<string, unknown>), id: e.id, name: e.name, source, ...(rulesets && ['spell', 'feat', 'species', 'background'].includes(k) ? { rulesets } : {}) };
      ((defs[k] ??= []) as unknown[]).push(def);
    }
  }
  return { record: { id: pid, manifest: pack.manifest, enabled: true, installedAt, order, index, defs }, texts };
}
const DEF_KINDS: Record<keyof EntryDefs, true> = { spell: true, weapon: true, armor: true, condition: true, feat: true, species: true, background: true, monster: true, magicItem: true, gear: true };

/** Rebuild a pack file from stored records (for export / sharing between devices). */
export function fromInstalled(rec: InstalledPack, texts: PackText[]): PackFile {
  const tx = new Map(texts.map((t) => [t.id, t.text]));
  const defFor = (kind: EntryKind, id: string) => {
    const list = rec.defs[kind as keyof EntryDefs] as { id: string; source?: unknown; rulesets?: unknown }[] | undefined;
    const d = list?.find((x) => x.id === id); if (!d) return undefined;
    const { source: _s, rulesets: _r, ...rest } = d; void _s; void _r; return rest as unknown as PackEntry['def'];
  };
  return { format: PACK_FORMAT, formatVersion: PACK_FORMAT_VERSION, manifest: rec.manifest,
    entries: rec.index.map((i) => ({ kind: i.kind, id: i.id, name: i.name, link: i.link, meta: i.meta, def: defFor(i.kind, i.id), text: tx.get(textKey(rec.id, i.kind, i.id)) ?? '' })) };
}

/** Plain text → safe Markdown: strip HTML tags and normalise whitespace. */
export function cleanText(s: unknown): string {
  if (Array.isArray(s)) return s.map(cleanText).filter(Boolean).join('\n\n');
  if (typeof s !== 'string') return '';
  return s.replace(/<\/p>\s*<p>/gi, '\n\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '‹').replace(/&gt;/g, '›')
    .replace(/javascript:/gi, '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
export const slug = (s: string): string => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'entry';
export const firstSentence = (t: string, max = 220): string => { const p = t.split('\n').find((l) => l.trim() && !l.startsWith('|') && !l.startsWith('#')) ?? ''; return p.length > max ? `${p.slice(0, max - 1).trimEnd()}…` : p; };
