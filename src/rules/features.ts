// User-added features: add / edit / remove with their linked mechanics, saving to the content library,
// and applying library features automatically when a character reaches the right level.
import type { Character, FeatureEntry, FeatureKind, Modifier, ActionDef, Proficiency, RecoveryTiming, CustomContent, CustomCategory, ResourceDef } from '../types.js';
import type { Registry } from '../data/registry.js';
import { byId } from '../data/registry.js';
import { uid, nowIso } from './events.js';

export interface FeatureInput {
  kind: FeatureKind; name: string; summary: string; level?: number; classId?: string; subclassId?: string;
  modifiers: Modifier[];
  resource?: { name: string; max: number; formula?: string; recovery: RecoveryTiming };
  action?: Omit<ActionDef, 'id' | 'source'>;
  profs: { kind: Proficiency['kind']; name: string }[];
  spellIds: string[];
}

export const KIND_LABELS: Record<FeatureKind, string> = { class: 'Class feature', subclass: 'Subclass feature', species: 'Species trait', background: 'Background feature', feat: 'Feat', other: 'Other feature' };
export const RESOURCE_FORMULAS = ['abilityMod:str', 'abilityMod:dex', 'abilityMod:con', 'abilityMod:int', 'abilityMod:wis', 'abilityMod:cha', '1+abilityMod:cha', '1+abilityMod:wis', 'level', 'level*5'];

export function validateFeatureInput(f: FeatureInput): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.name.trim()) e.name = 'Feature name is required.';
  if ((f.kind === 'class' || f.kind === 'subclass') && !f.classId) e.classId = 'Choose the class this feature belongs to.';
  if (f.level !== undefined && (!Number.isInteger(f.level) || f.level < 1 || f.level > 20)) e.level = 'Level must be 1–20.';
  f.modifiers.forEach((m, i) => { if (!m.target.trim() || !Number.isFinite(m.value)) e[`mod${i}`] = 'Each bonus needs a target and a number.'; });
  if (f.resource) {
    if (!f.resource.name.trim()) e.resource = 'Give the limited-use resource a name.';
    else if (!f.resource.formula && (!Number.isInteger(f.resource.max) || f.resource.max < 1)) e.resource = 'Uses must be a whole number of 1 or more, or a formula.';
  }
  if (f.action && !f.action.name.trim()) e.action = 'Give the action a name.';
  if (f.action?.damage && !/^[\dd+\-\s]+$/i.test(f.action.damage)) e.action = 'Damage must be a dice expression such as 2d6+3.';
  return e;
}

/** Source label shown on the sheet, e.g. "Wizard 3", "Species", "Feat". */
export function sourceLabel(c: Character, reg: Registry, f: Pick<FeatureInput, 'kind' | 'classId' | 'subclassId' | 'level'>): string {
  const cls = byId(reg.classes, f.classId)?.name ?? f.classId ?? '';
  const sub = byId(reg.subclasses, f.subclassId ?? c.classes.find((x) => x.classId === f.classId)?.subclassId)?.name;
  switch (f.kind) {
    case 'class': return `${cls}${f.level ? ` ${f.level}` : ''}`;
    case 'subclass': return `${sub ?? `${cls} subclass`}${f.level ? ` ${f.level}` : ''}`;
    case 'species': return `Species: ${byId(reg.species, c.speciesId)?.name ?? 'species'}`;
    case 'background': return `Background: ${byId(reg.backgrounds, c.backgroundId)?.name ?? 'background'}`;
    case 'feat': return 'Feat';
    default: return 'Added manually';
  }
}

/** Add a feature and its linked mechanics to a draft character. Returns the new feature. */
export function addFeature(dr: Character, reg: Registry, f: FeatureInput, keepId?: string, contentId?: string): FeatureEntry {
  const id = keepId ?? uid();
  const entry: FeatureEntry = { id, name: f.name.trim(), summary: f.summary, level: f.level, kind: f.kind, classId: f.classId, subclassId: f.subclassId,
    source: sourceLabel(dr, reg, f), modifiers: f.modifiers.length ? f.modifiers.map((m) => ({ ...m, note: m.note || f.name.trim() })) : undefined, contentId };
  if (f.resource) {
    const rid = `feat-${id}`;
    dr.resources.push({ id: rid, name: f.resource.name.trim(), max: f.resource.max, formula: f.resource.formula || undefined, used: 0, recovery: f.resource.recovery, source: entry.name, custom: true });
    entry.resourceId = rid;
  }
  if (f.action) {
    const aid = `feat-${id}-action`;
    dr.actions.push({ ...f.action, id: aid, resourceId: f.action.resourceId ?? entry.resourceId, source: entry.name });
    entry.actionIds = [aid];
  }
  const profs: Proficiency[] = [];
  for (const p of f.profs) {
    const name = p.name.trim().toLowerCase(); if (!name) continue;
    if (dr.proficiencies.some((x) => x.kind === p.kind && x.name === name)) continue; // already proficient: nothing to add or remove later
    const pr: Proficiency = { kind: p.kind, name, source: entry.name }; dr.proficiencies.push(pr); profs.push(pr);
  }
  if (profs.length) entry.profs = profs;
  const spells: string[] = [];
  for (const sid of f.spellIds) {
    if (dr.spellcasting.alwaysPrepared.includes(sid)) continue;
    dr.spellcasting.alwaysPrepared.push(sid);
    if (!dr.spellcasting.known.includes(sid)) dr.spellcasting.known.push(sid);
    spells.push(sid);
  }
  if (spells.length) entry.spellIds = spells;
  dr.features.push(entry);
  return entry;
}

/** Remove a feature and everything it added. Proficiencies/spells another source also grants are kept. */
export function removeFeature(dr: Character, id: string): void {
  const f = dr.features.find((x) => x.id === id); if (!f) return;
  if (f.resourceId) dr.resources = dr.resources.filter((r) => r.id !== f.resourceId);
  if (f.actionIds) dr.actions = dr.actions.filter((a) => !f.actionIds!.includes(a.id));
  for (const p of f.profs ?? []) { const i = dr.proficiencies.findIndex((x) => x.kind === p.kind && x.name === p.name && x.source === p.source); if (i >= 0) dr.proficiencies.splice(i, 1); }
  for (const s of f.spellIds ?? []) { dr.spellcasting.alwaysPrepared = dr.spellcasting.alwaysPrepared.filter((x) => x !== s); dr.spellcasting.known = dr.spellcasting.known.filter((x) => x !== s); }
  dr.features = dr.features.filter((x) => x.id !== id);
}

/** Replace a feature's details and mechanics, keeping its id and position. Resource usage is preserved where possible. */
export function updateFeature(dr: Character, reg: Registry, id: string, f: FeatureInput): void {
  const idx = dr.features.findIndex((x) => x.id === id); if (idx < 0) return;
  const old = dr.features[idx]!;
  const used = dr.resources.find((r) => r.id === old.resourceId)?.used ?? 0;
  removeFeature(dr, id);
  const entry = addFeature(dr, reg, f, id, old.contentId);
  dr.features.pop(); dr.features.splice(idx, 0, entry);
  const r = dr.resources.find((x) => x.id === entry.resourceId); if (r) r.used = Math.min(used, r.formula ? 99 : r.max);
}

/** Reconstruct the editable input from a stored feature (for the edit dialog). */
export function inputFromFeature(c: Character, f: FeatureEntry): FeatureInput {
  const r = c.resources.find((x) => x.id === f.resourceId);
  const a = c.actions.find((x) => f.actionIds?.includes(x.id));
  return { kind: f.kind ?? 'other', name: f.name, summary: f.summary, level: f.level, classId: f.classId, subclassId: f.subclassId, modifiers: (f.modifiers ?? []).map((m) => ({ ...m })),
    resource: r ? { name: r.name, max: r.max, formula: r.formula, recovery: r.recovery } : undefined,
    action: a ? (({ id: _i, source: _s, ...rest }) => { void _i; void _s; return { ...rest, resourceId: rest.resourceId === f.resourceId ? undefined : rest.resourceId }; })(a) : undefined,
    profs: (f.profs ?? []).map((p) => ({ kind: p.kind, name: p.name })), spellIds: [...(f.spellIds ?? [])] };
}

/** Infer a group for features that predate `kind` (built-in features record only a source label). */
export function featureGroup(c: Character, reg: Registry, f: FeatureEntry): { kind: FeatureKind; label: string } {
  if (f.kind) {
    const cls = byId(reg.classes, f.classId)?.name;
    return { kind: f.kind, label: f.kind === 'class' ? `Class: ${cls ?? 'class'}` : f.kind === 'subclass' ? `Subclass: ${byId(reg.subclasses, f.subclassId ?? c.classes.find((x) => x.classId === f.classId)?.subclassId)?.name ?? cls ?? 'subclass'}` : KIND_GROUP[f.kind] };
  }
  const s = f.source;
  if (/^Species/i.test(s)) return { kind: 'species', label: KIND_GROUP.species };
  if (/^Background/i.test(s)) return { kind: 'background', label: KIND_GROUP.background };
  if (/^Feat/i.test(s)) return { kind: 'feat', label: KIND_GROUP.feat };
  for (const cl of c.classes) {
    const def = byId(reg.classes, cl.classId); const sub = byId(reg.subclasses, cl.subclassId);
    if (sub && s.startsWith(sub.name)) return { kind: 'subclass', label: `Subclass: ${sub.name}` };
    if (def && s.startsWith(def.name)) return { kind: 'class', label: `Class: ${def.name}` };
  }
  return { kind: 'other', label: KIND_GROUP.other };
}
const KIND_GROUP: Record<FeatureKind, string> = { class: 'Class features', subclass: 'Subclass features', species: 'Species traits', background: 'Background', feat: 'Feats', other: 'Other features' };

const LIB_CATEGORY: Record<FeatureKind, CustomCategory> = { class: 'classFeature', subclass: 'subclassFeature', species: 'speciesTrait', background: 'backgroundFeature', feat: 'feat', other: 'rule' };

/** Build a library entry from a feature so future characters receive it automatically. */
export function toLibraryContent(c: Character, f: FeatureInput): CustomContent {
  const t = nowIso();
  const subclassId = f.kind === 'subclass' ? (f.subclassId ?? c.classes.find((x) => x.classId === f.classId)?.subclassId) : undefined;
  const res: ResourceDef[] = f.resource ? [{ id: `lib-${uid().slice(0, 8)}`, name: f.resource.name, recovery: f.resource.recovery, ...(f.resource.formula ? { formula: f.resource.formula } : { byLevel: Array(20).fill(f.resource.max) as number[] }) }] : [];
  return { id: `custom-${uid()}`, category: LIB_CATEGORY[f.kind], name: f.name.trim(), rulesets: ['srd51', 'srd521', 'custom'], origin: 'user', sourceLabel: 'My content', version: 1, enabled: true,
    description: f.summary, notes: '', prerequisites: '', levelRequirement: f.level ?? (f.kind === 'species' || f.kind === 'background' ? 1 : 0),
    modifiers: f.modifiers, resources: res, proficiencies: f.profs.map((p) => `${p.kind}:${p.name}`), spellAdditions: f.spellIds,
    actions: f.action ? [{ ...f.action, id: uid(), source: f.name }] : [],
    data: f.kind === 'feat' ? { asi: {} } : { classId: f.classId, subclassId, speciesId: f.kind === 'species' ? c.speciesId : undefined, backgroundId: f.kind === 'background' ? c.backgroundId : undefined },
    createdAt: t, updatedAt: t };
}

/** Apply one library entry to a draft character (feature text + grant for modifiers/resources + proficiencies, spells, actions). */
export function applyContent(dr: Character, cc: CustomContent, source: string, level?: number): void {
  if (dr.grants.includes(cc.id) || dr.features.some((f) => f.contentId === cc.id)) return; // never twice
  dr.grants.push(cc.id);
  dr.features.push({ id: uid(), name: cc.name, summary: cc.description, source, level, contentId: cc.id });
  for (const pr of cc.proficiencies) {
    const [kind, name] = pr.includes(':') ? pr.split(':') : ['tool', pr];
    const n = (name ?? '').trim().toLowerCase();
    if (n && !dr.proficiencies.some((p) => p.kind === kind && p.name === n)) dr.proficiencies.push({ kind: kind as Proficiency['kind'], name: n, source: cc.name });
  }
  for (const sid of cc.spellAdditions) { if (!dr.spellcasting.known.includes(sid)) dr.spellcasting.known.push(sid); if (!dr.spellcasting.alwaysPrepared.includes(sid)) dr.spellcasting.alwaysPrepared.push(sid); }
  for (const a of cc.actions) dr.actions.push({ ...a, id: uid() });
}

/** Library features (from "My content") that a character qualifies for at this point. */
export function libraryFeaturesFor(reg: Registry, m: { classId?: string; subclassId?: string; classLevel?: number; speciesId?: string; backgroundId?: string }): CustomContent[] {
  return reg.custom.filter((cc) => {
    const d = (cc.data ?? {}) as Record<string, unknown>;
    // <= so that a character who already passed the level receives it on their next level-up (applyContent never duplicates)
    if (cc.category === 'classFeature') return !!m.classId && d.classId === m.classId && !d.subclassId && cc.levelRequirement <= (m.classLevel ?? 0);
    if (cc.category === 'subclassFeature') return !!m.subclassId && d.subclassId === m.subclassId && cc.levelRequirement <= (m.classLevel ?? 0);
    if (cc.category === 'speciesTrait') return !!m.speciesId && d.speciesId === m.speciesId;
    if (cc.category === 'backgroundFeature') return !!m.backgroundId && d.backgroundId === m.backgroundId;
    return false;
  });
}
