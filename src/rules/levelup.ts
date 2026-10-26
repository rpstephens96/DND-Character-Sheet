// Level progression: validation, planning (preview) and application. Every level is an explicit event with a snapshot.
import type { Ability, Character, ClassDef, PendingChoice } from '../types.js';
import { ABILITIES } from '../types.js';
import type { Registry } from '../data/registry.js';
import { byId } from '../data/registry.js';
import { compute, totalLevel, ABILITY_NAMES } from './calc.js';
import { uid } from './events.js';
import { libraryFeaturesFor, applyContent } from './features.js';

export const fixedHp = (hitDie: number): number => hitDie / 2 + 1;

export function multiclassCheck(c: Character, reg: Registry, classId: string): { ok: boolean; reasons: string[] } {
  if (c.classes.some((x) => x.classId === classId) || c.classes.length === 0) return { ok: true, reasons: [] };
  const d = compute(c, reg);
  const reasons: string[] = [];
  const test = (def: ClassDef, label: string) => {
    const r = def.multiclassReq;
    for (const [ab, min] of Object.entries(r.all ?? {})) if (d.abilities[ab as Ability].value < (min as number)) reasons.push(`${label}: ${ABILITY_NAMES[ab as Ability]} ${min} required (have ${d.abilities[ab as Ability].value}).`);
    if (r.any && !Object.entries(r.any).some(([ab, min]) => d.abilities[ab as Ability].value >= (min as number)))
      reasons.push(`${label}: one of ${Object.entries(r.any).map(([ab, m]) => `${ABILITY_NAMES[ab as Ability]} ${m}`).join(' or ')} required.`);
  };
  const target = byId(reg.classes, classId);
  if (!target) return { ok: false, reasons: ['Unknown class.'] };
  test(target, `Entering ${target.name}`);
  for (const cl of c.classes) { const def = byId(reg.classes, cl.classId); if (def) test(def, `Leaving ${def.name}`); }
  return { ok: reasons.length === 0, reasons };
}

export interface LevelUpInput {
  classId: string;
  hpMethod: 'fixed' | 'roll' | 'manual';
  hpValue?: number;          // roll result or manual value (excluding Con)
  subclassId?: string;
  asi?: { type: 'asi'; bonuses: { ability: Ability; amount: number }[] } | { type: 'feat'; featId: string };
  expertise?: string[];
  overrideMulticlass?: boolean;
}

export interface LevelUpPlan { ok: boolean; errors: string[]; unresolved: string[]; summary: string[]; fromLevel: number; toLevel: number; classLevel: number; hpGain: number; newFeatures: { name: string; summary: string; level: number }[]; }

export function planLevelUp(c: Character, reg: Registry, input: LevelUpInput): LevelUpPlan {
  const errors: string[] = []; const unresolved: string[] = []; const summary: string[] = [];
  const def = byId(reg.classes, input.classId);
  const fromLevel = totalLevel(c);
  if (!def) return { ok: false, errors: ['Select a class.'], unresolved, summary, fromLevel, toLevel: fromLevel, classLevel: 0, hpGain: 0, newFeatures: [] };
  if (fromLevel >= 20) errors.push('Characters cannot exceed level 20.');
  const existing = c.classes.find((x) => x.classId === def.id);
  const classLevel = (existing?.level ?? 0) + 1;
  if (!existing) {
    const mc = multiclassCheck(c, reg, def.id);
    if (!mc.ok && !input.overrideMulticlass) errors.push(...mc.reasons);
    if (!mc.ok && input.overrideMulticlass) summary.push(`Custom ruling: multiclass prerequisites overridden (${mc.reasons.join(' ')})`);
  }
  let hpGain = fixedHp(def.hitDie);
  if (input.hpMethod !== 'fixed') {
    const v = input.hpValue;
    if (v === undefined || !Number.isInteger(v)) errors.push('Enter the hit-point roll or value.');
    else if (input.hpMethod === 'roll' && (v < 1 || v > def.hitDie)) errors.push(`A d${def.hitDie} roll must be from 1 to ${def.hitDie}.`);
    else if (v < 0) errors.push('Hit-point gain cannot be negative.');
    else hpGain = v;
  }
  const d = compute(c, reg);
  summary.push(`${def.name} ${classLevel} (character level ${fromLevel} → ${fromLevel + 1})`);
  summary.push(`Hit points: +${hpGain} (${input.hpMethod}) + Con ${d.mods.con >= 0 ? '+' : ''}${d.mods.con} = +${Math.max(1, hpGain + d.mods.con)}`);
  const pbBefore = d.pb.value; const pbAfter = 2 + Math.floor(fromLevel / 4);
  if (pbAfter !== pbBefore) summary.push(`Proficiency bonus: +${pbBefore} → +${pbAfter}`);

  const subId = input.subclassId ?? existing?.subclassId;
  if (classLevel === def.subclassLevel && !subId) unresolved.push(`Choose a ${def.subclassLabel}.`);
  const sub = byId(reg.subclasses, subId);
  const newFeatures = [...def.features.filter((f) => f.level === classLevel), ...(sub?.features.filter((f) => f.level === classLevel) ?? [])].map((f) => ({ name: f.name, summary: f.summary ?? '', level: f.level }));
  newFeatures.forEach((f) => summary.push(`New feature: ${f.name}`));

  if (def.asiLevels.includes(classLevel)) {
    if (!input.asi) unresolved.push('Ability Score Improvement or feat (can be resolved later from Features).');
    else if (input.asi.type === 'asi') {
      const total = input.asi.bonuses.reduce((s, b) => s + b.amount, 0);
      if (total !== 2) errors.push('An Ability Score Improvement must add exactly 2 points (+2 to one or +1 to two).');
      for (const b of input.asi.bonuses) if (d.abilities[b.ability].value + b.amount > 20) errors.push(`${ABILITY_NAMES[b.ability]} cannot exceed 20 through an ASI.`);
      input.asi.bonuses.forEach((b) => summary.push(`${ABILITY_NAMES[b.ability]} +${b.amount}`));
    } else { const ft = byId(reg.feats, input.asi.featId); if (!ft) errors.push('Choose a feat.'); else summary.push(`Feat: ${ft.name}`); }
  }
  const expLevels = def.id === 'rogue' ? [1, 6] : def.id === 'bard' ? [3, 10] : [];
  if (expLevels.includes(classLevel) && (!input.expertise || input.expertise.length < 2)) unresolved.push('Choose two Expertise skills (can be resolved later).');

  const before = d.spellProfiles.find((p) => p.classId === def.id);
  const cantNow = def.cantrips?.[classLevel - 1] ?? 0, cantBefore = def.cantrips?.[classLevel - 2] ?? 0;
  if (cantNow > cantBefore) unresolved.push(`Learn ${cantNow - cantBefore} new cantrip(s) in the Spellbook.`);
  const knownNow = def.spellsKnown?.[classLevel - 1] ?? 0, knownBefore = def.spellsKnown?.[classLevel - 2] ?? 0;
  if (knownNow > knownBefore) unresolved.push(`Learn ${knownNow - knownBefore} new spell(s) in the Spellbook.`);
  if (def.prepStyle === 'spellbook') unresolved.push('Add two wizard spells to your spellbook.');
  if (before?.preparedMax != null) summary.push(`Prepared spell limit will increase.`);
  if (def.casterType !== 'none') summary.push('Spell slots will be recalculated.');
  return { ok: errors.length === 0, errors, unresolved, summary, fromLevel, toLevel: fromLevel + 1, classLevel, hpGain, newFeatures };
}

/** Apply a validated plan to a draft character. */
export function applyLevelUp(dr: Character, reg: Registry, input: LevelUpInput, plan: LevelUpPlan): void {
  if (!plan.ok) throw new Error(plan.errors.join(' '));
  const def = byId(reg.classes, input.classId)!;
  let cl = dr.classes.find((x) => x.classId === def.id);
  if (!cl) {
    cl = { classId: def.id, level: 0, hpGains: [] };
    dr.classes.push(cl);
    for (const p of def.multiclassProfs) addProf(dr, p, `${def.name} (multiclass)`, reg);
  }
  cl.level += 1; cl.hpGains.push(plan.hpGain);
  if (input.subclassId) cl.subclassId = input.subclassId;
  for (const f of plan.newFeatures) dr.features.push({ id: uid(), name: f.name, summary: f.summary, level: f.level, source: `${def.name} ${cl.level}` });
  if (input.asi?.type === 'asi') input.asi.bonuses.forEach((b) => dr.abilityBonuses.push({ ability: b.ability, amount: b.amount, source: `ASI (${def.name} ${cl!.level})` }));
  if (input.asi?.type === 'feat') { dr.feats.push(input.asi.featId); const ft = byId(reg.feats, input.asi.featId); ft?.asi && Object.entries(ft.asi).forEach(([ab, n]) => dr.abilityBonuses.push({ ability: ab as Ability, amount: n as number, source: `Feat: ${ft.name}` })); }
  input.expertise?.forEach((s) => dr.proficiencies.push({ kind: 'expertise', name: s, source: `${def.name} ${cl!.level}` }));
  const pend = (kind: PendingChoice['kind'], label: string) => dr.pendingChoices.push({ id: uid(), kind, classId: def.id, classLevel: cl!.level, label });
  if (cl.level === def.subclassLevel && !cl.subclassId) pend('subclass', `Choose ${def.subclassLabel} (${def.name} ${cl.level})`);
  if (def.asiLevels.includes(cl.level) && !input.asi) pend('asi', `Ability Score Improvement or feat (${def.name} ${cl.level})`);
  const expLevels = def.id === 'rogue' ? [1, 6] : def.id === 'bard' ? [3, 10] : [];
  if (expLevels.includes(cl.level) && !(input.expertise && input.expertise.length >= 2)) pend('expertise', `Choose two Expertise skills (${def.name} ${cl.level})`);
  for (const cc of libraryFeaturesFor(reg, { classId: def.id, subclassId: cl.subclassId, classLevel: cl.level })) applyContent(dr, cc, `${cc.category === 'subclassFeature' ? byId(reg.subclasses, cl.subclassId)?.name ?? def.name : def.name} ${cc.levelRequirement || cl.level} (My content)`, cc.levelRequirement || cl.level);
  syncAlwaysPrepared(dr, reg);
  if (dr.hp.current > 0) dr.hp.current += Math.max(1, plan.hpGain + Math.floor(((computeCon(dr, reg)) - 10) / 2));
}

const computeCon = (c: Character, reg: Registry) => compute(c, reg).abilities.con.value;

export function syncAlwaysPrepared(dr: Character, reg: Registry): void {
  const ids = new Set<string>();
  for (const cl of dr.classes) byId(reg.subclasses, cl.subclassId)?.alwaysPrepared?.forEach((g) => { if (cl.level >= g.level) g.spells.forEach((s) => ids.add(s)); });
  for (const gid of dr.grants) byId(reg.custom, gid)?.spellAdditions.forEach((s) => ids.add(s)); // spells granted by applied custom content
  for (const f of dr.features) f.spellIds?.forEach((s) => ids.add(s)); // spells granted by user-added features
  dr.spellcasting.alwaysPrepared = [...ids];
}

export function addProf(dr: Character, raw: string, source: string, reg?: Registry): void {
  const name = raw.toLowerCase();
  const isWeapon = ['simple', 'martial'].includes(name) || !!reg?.weapons.some((w) => w.name.toLowerCase() === name);
  const kind = ['light', 'medium', 'heavy', 'shield'].includes(name) ? 'armor' : isWeapon ? 'weapon' : name.startsWith('one ') ? null : 'tool';
  if (!kind) { dr.pendingChoices.push({ id: uid(), kind: 'other', classId: '', classLevel: 0, label: `Choose ${raw} (${source})` }); return; }
  if (!dr.proficiencies.some((p) => p.kind === kind && p.name === name)) dr.proficiencies.push({ kind, name, source });
}

export function asiOptions(): Ability[] { return [...ABILITIES]; }
