// Import/export, validation and migrations. DOM-free so it can be unit tested.
import type { Character, CustomContent, Campaign, CampaignRecord, CharacterEvent, LevelSnapshot, Encounter, Settings, CustomCategory } from '../types.js';
import { APP_CONFIG } from '../config.js';
import { blankCharacter, DEFAULT_PANELS } from '../rules/factory.js';
import { uid, nowIso } from '../rules/events.js';

import { safeParse, MAX_IMPORT_BYTES } from './safe.js';
export { safeParse, MAX_IMPORT_BYTES };
import { validatePack } from '../content/pack.js';
import type { PackFile } from '../content/types.js';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Deep-merge defaults with imported data, keeping only keys of the expected type. Arrays are taken as-is if arrays. */
function conform<T>(defaults: T, input: unknown, path: string, errors: string[]): T {
  if (!isObj(input)) { errors.push(`${path} should be an object.`); return defaults; }
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const [k, dv] of Object.entries(defaults as Record<string, unknown>)) {
    const v = input[k];
    if (v === undefined || v === null) continue;
    if (Array.isArray(dv)) { if (Array.isArray(v)) out[k] = v; else errors.push(`${path}.${k} should be a list.`); }
    else if (isObj(dv)) out[k] = Object.keys(dv).length ? conform(dv, v, `${path}.${k}`, errors) : (isObj(v) ? v : dv);
    else if (typeof dv === typeof v) out[k] = v;
    else errors.push(`${path}.${k} has the wrong type (expected ${typeof dv}).`);
  }
  for (const [k, v] of Object.entries(input)) if (!(k in out) && v !== undefined) out[k] = v; // optional fields such as campaignId, concentration
  return out as T;
}

function checkStrings(v: unknown, path: string, errors: string[]): void {
  if (typeof v === 'string') { if (/<\s*script|javascript:/i.test(v)) errors.push(`${path} contains script-like content and was rejected.`); return; }
  if (Array.isArray(v)) v.forEach((x, i) => checkStrings(x, `${path}[${i}]`, errors));
  else if (isObj(v)) for (const [k, x] of Object.entries(v)) checkStrings(x, `${path}.${k}`, errors);
}

/** Migrate a raw character object to the current schema. Returns notes describing changes. */
export function migrateCharacter(raw: Record<string, unknown>): { data: Record<string, unknown>; notes: string[] } {
  const notes: string[] = []; const data = { ...raw };
  let v = typeof data.schemaVersion === 'number' ? data.schemaVersion : 1;
  if (v < 2) { // v1 → v2: pending choices and dashboard panels introduced
    if (!Array.isArray(data.pendingChoices)) data.pendingChoices = [];
    if (!Array.isArray(data.dashboardPanels)) data.dashboardPanels = [...DEFAULT_PANELS];
    notes.push('Migrated from schema 1 to 2: added pending choices and dashboard panels.'); v = 2;
  }
  if (v > APP_CONFIG.schemaVersion) notes.push(`Created by a newer version (schema ${v}); unknown fields are kept but may be ignored.`);
  data.schemaVersion = Math.max(v, APP_CONFIG.schemaVersion);
  return { data, notes };
}

export function validateCharacter(input: unknown): { character: Character | null; errors: string[]; warnings: string[] } {
  const errors: string[] = []; const warnings: string[] = [];
  if (!isObj(input)) return { character: null, errors: ['Character data must be an object.'], warnings };
  const { data, notes } = migrateCharacter(input);
  warnings.push(...notes);
  if (typeof data.name !== 'string' || !data.name.trim()) errors.push('Character name is missing.');
  if (!Array.isArray(data.classes)) errors.push('Character classes are missing.');
  else data.classes.forEach((c, i) => { if (!isObj(c) || typeof c.classId !== 'string' || typeof c.level !== 'number' || c.level < 1 || c.level > 20) errors.push(`classes[${i}] is invalid.`); });
  if (data.portrait !== undefined && (typeof data.portrait !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(data.portrait))) { warnings.push('Portrait was not a safe image and was removed.'); delete data.portrait; }
  checkStrings(data, 'character', errors);
  const typeErrors: string[] = [];
  const character = conform(blankCharacter(), data, 'character', typeErrors);
  warnings.push(...typeErrors.map((e) => `${e} The default value was used.`));
  if (character.classes.reduce((s, c) => s + c.level, 0) > 20) errors.push('Total level exceeds 20.');
  return { character: errors.length ? null : character, errors, warnings };
}

const CATEGORIES: CustomCategory[] = ['class', 'subclass', 'species', 'background', 'feat', 'spell', 'equipment', 'weapon', 'armor', 'tool', 'language', 'condition', 'classFeature', 'subclassFeature', 'speciesTrait', 'backgroundFeature', 'invocation', 'fightingStyle', 'metamagic', 'transformation', 'companion', 'magicItem', 'monster', 'resource', 'rule'];
export const CUSTOM_CATEGORIES = CATEGORIES;
export const MODIFIER_TARGET_HINT = 'ac, acBaseUnarmored, speed, initiative, hpMax, hpPerLevel, attack, damage, spellDC, spellAttack, save:all, save:dex, skill:stealth, check:all, ability:str, passive:perception';

export function blankCustom(category: CustomCategory = 'feat'): CustomContent {
  const t = nowIso();
  return { id: `custom-${uid()}`, category, name: '', rulesets: ['srd51', 'srd521', 'custom'], origin: 'user', sourceLabel: 'Homebrew', version: 1, enabled: true, description: '', notes: '',
    prerequisites: '', levelRequirement: 0, modifiers: [], resources: [], proficiencies: [], spellAdditions: [], actions: [], createdAt: t, updatedAt: t };
}

export function validateCustom(input: unknown): { item: CustomContent | null; errors: string[] } {
  const errors: string[] = [];
  if (!isObj(input)) return { item: null, errors: ['Custom content entries must be objects.'] };
  checkStrings(input, 'content', errors);
  const item = conform(blankCustom(), input, 'content', errors);
  if (!item.name.trim()) errors.push('Name is required.');
  if (!CATEGORIES.includes(item.category)) errors.push(`Unknown category “${item.category}”.`);
  item.modifiers.forEach((m, i) => {
    if (!isObj(m) || typeof m.target !== 'string' || !m.target) errors.push(`modifiers[${i}].target is required.`);
    if (!isObj(m) || (m.op !== 'add' && m.op !== 'setMin')) errors.push(`modifiers[${i}].op must be “add” or “setMin”.`);
    if (!isObj(m) || typeof m.value !== 'number' || !Number.isFinite(m.value)) errors.push(`modifiers[${i}].value must be a number.`);
  });
  item.resources.forEach((r, i) => { if (!isObj(r) || !r.id || !r.name || !['short', 'long', 'dawn', 'none'].includes(String(r.recovery))) errors.push(`resources[${i}] needs id, name and recovery (short/long/dawn/none).`); });
  if (item.category === 'class' && item.data) {
    const d = item.data as Record<string, unknown>;
    if (typeof d.hitDie !== 'number' || ![6, 8, 10, 12].includes(d.hitDie)) errors.push('Class data needs hitDie of 6, 8, 10 or 12.');
    for (const k of ['saves', 'features', 'asiLevels']) if (!Array.isArray(d[k])) errors.push(`Class data needs a “${k}” list.`);
    if (typeof d.subclassLevel !== 'number') errors.push('Class data needs a numeric subclassLevel.');
  }
  if (item.category === 'spell' && item.data) { const d = item.data as Record<string, unknown>; if (typeof d.level !== 'number' || d.level < 0 || d.level > 9) errors.push('Spell data needs a level from 0 to 9.'); }
  return { item: errors.length ? null : item, errors };
}

export interface LibraryExport {
  format: string; appVersion: string; schemaVersion: number; exportedAt: string; kind: 'library' | 'character' | 'content';
  rulesets: string[]; integrity?: { algorithm: 'SHA-256'; digest: string };
  data: { characters: Character[]; events: CharacterEvent[]; snapshots: LevelSnapshot[]; custom: CustomContent[]; campaigns: Campaign[]; records: CampaignRecord[]; encounters: Encounter[]; settings?: Settings; packFiles?: PackFile[] };
}

export async function sha256(text: string): Promise<string> {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) return '';
  const buf = await c.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function buildExport(kind: LibraryExport['kind'], data: LibraryExport['data']): Promise<string> {
  const body: LibraryExport = { format: APP_CONFIG.exportFormat, appVersion: APP_CONFIG.version, schemaVersion: APP_CONFIG.schemaVersion, exportedAt: nowIso(), kind,
    rulesets: [...new Set(data.characters.map((c) => c.ruleset))], data };
  const digest = await sha256(JSON.stringify(body.data));
  if (digest) body.integrity = { algorithm: 'SHA-256', digest };
  return JSON.stringify(body, null, 2);
}

export interface ImportReport { ok: boolean; errors: string[]; warnings: string[]; integrity: 'verified' | 'mismatch' | 'absent'; data: LibraryExport['data']; kind: string; }

export async function readExport(text: string): Promise<ImportReport> {
  const errors: string[] = []; const warnings: string[] = [];
  const empty: LibraryExport['data'] = { characters: [], events: [], snapshots: [], custom: [], campaigns: [], records: [], encounters: [] };
  const raw = safeParse(text);
  if (!isObj(raw) || raw.format !== APP_CONFIG.exportFormat || !isObj(raw.data)) return { ok: false, errors: ['This is not an Adventurer’s Ledger export file.'], warnings, integrity: 'absent', data: empty, kind: '' };
  let integrity: ImportReport['integrity'] = 'absent';
  if (isObj(raw.integrity) && typeof raw.integrity.digest === 'string') {
    const d = await sha256(JSON.stringify(raw.data));
    integrity = d && d === raw.integrity.digest ? 'verified' : 'mismatch';
    if (integrity === 'mismatch') warnings.push('Integrity check failed: the file was modified after export. Review before importing.');
  }
  const src = raw.data;
  const out: LibraryExport['data'] = { ...empty };
  (Array.isArray(src.characters) ? src.characters : []).forEach((c, i) => {
    const r = validateCharacter(c);
    r.errors.forEach((e) => errors.push(`Character ${i + 1}: ${e}`)); r.warnings.forEach((w) => warnings.push(`Character ${i + 1}: ${w}`));
    if (r.character) out.characters.push(r.character);
  });
  (Array.isArray(src.custom) ? src.custom : []).forEach((c, i) => { const r = validateCustom(c); r.errors.forEach((e) => errors.push(`Content ${i + 1}: ${e}`)); if (r.item) out.custom.push({ ...r.item, origin: r.item.origin === 'srd' ? 'imported' : r.item.origin === 'user' ? 'imported' : r.item.origin }); });
  for (const key of ['events', 'snapshots', 'campaigns', 'records', 'encounters'] as const) {
    const list = src[key];
    if (list !== undefined && !Array.isArray(list)) { errors.push(`${key} should be a list.`); continue; }
    const good = (list as unknown[] | undefined ?? []).filter((x) => isObj(x) && typeof x.id === 'string');
    good.forEach((x, i) => checkStrings(x, `${key}[${i}]`, errors));
    (out[key] as unknown[]) = good;
  }
  if (Array.isArray(src.packFiles)) {
    out.packFiles = [];
    src.packFiles.forEach((pf, i) => { const r = validatePack(pf); if (r.ok && r.pack) out.packFiles!.push(r.pack); else errors.push(`Content pack ${i + 1}: ${r.errors[0] ?? 'invalid'}`); });
  }
  return { ok: errors.length === 0, errors, warnings, integrity, data: out, kind: String(raw.kind ?? '') };
}

/** Plain-text human-readable summary (for sharing with a DM or printing). */
export function characterSummaryText(lines: [string, string][]): string { return lines.map(([k, v]) => (k ? `${k}: ${v}` : v)).join('\n'); }
