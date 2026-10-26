// Character construction: blank records, wizard output, item factories and ability-score methods.
import type { Ability, Character, InventoryItem, RulesetId } from '../types.js';
import { ABILITIES } from '../types.js';
import type { Registry } from '../data/registry.js';
import { byId } from '../data/registry.js';
import { APP_CONFIG } from '../config.js';
import { uid, nowIso } from './events.js';
import { applyLevelUp, planLevelUp, syncAlwaysPrepared } from './levelup.js';
import { compute } from './calc.js';
import { libraryFeaturesFor, applyContent } from './features.js';
import type { RandomSource } from './dice.js';
import { secureRandom } from './dice.js';

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
export const POINT_BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUY_BUDGET = 27;

export function pointBuyCost(scores: Record<Ability, number>): { cost: number; valid: boolean; error?: string } {
  let cost = 0;
  for (const ab of ABILITIES) {
    const c = POINT_BUY_COST[scores[ab]];
    if (c === undefined) return { cost: NaN, valid: false, error: 'Point-buy scores must be between 8 and 15 before bonuses.' };
    cost += c;
  }
  return { cost, valid: cost <= POINT_BUY_BUDGET, error: cost > POINT_BUY_BUDGET ? `Point buy uses ${cost} of ${POINT_BUY_BUDGET} points.` : undefined };
}

/** 4d6 drop lowest, returning all dice for auditability. */
export function rollAbilityScore(rng: RandomSource = secureRandom): { dice: number[]; dropped: number; total: number } {
  const dice = [rng(6), rng(6), rng(6), rng(6)];
  const min = Math.min(...dice);
  return { dice, dropped: min, total: dice.reduce((s, x) => s + x, 0) - min };
}

export const DEFAULT_PANELS = ['vitals', 'abilities', 'saves', 'skills', 'attacks', 'resources', 'spells', 'conditions', 'proficiencies', 'features'];

export function blankCharacter(ruleset: RulesetId = 'srd51'): Character {
  const t = nowIso();
  return {
    id: uid(), schemaVersion: APP_CONFIG.schemaVersion, ruleset, name: 'New adventurer', playerName: '', speciesId: '', backgroundId: '', alignment: '',
    xp: 0, levellingMode: 'milestone', inspiration: false, classes: [], baseAbilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    abilityBonuses: [], abilityMethod: 'manual', proficiencies: [], features: [], feats: [], grants: [], resources: [],
    hp: { current: 0, temp: 0 }, hitDiceUsed: {}, deathSaves: { successes: 0, failures: 0, stable: false, dead: false }, exhaustion: 0, effects: [], reactionUsed: false,
    defenses: { resistances: [], immunities: [], vulnerabilities: [], conditionImmunities: [] }, senses: '', speeds: {},
    inventory: [], currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, actions: [],
    spellcasting: { slotsUsed: [], pactUsed: 0, known: [], prepared: [], alwaysPrepared: [], favourites: [], notes: {}, freeCasts: [] },
    companions: [], overrides: {},
    details: { personality: '', ideals: '', bonds: '', flaws: '', appearance: '', age: '', height: '', weight: '', eyes: '', hair: '', skin: '', allies: '', backstory: '', notes: '', treasure: '' },
    dashboardPanels: [...DEFAULT_PANELS], pendingChoices: [], combatNotes: '', createdAt: t, updatedAt: t,
  };
}

export function newItem(partial: Partial<InventoryItem> & { name: string }): InventoryItem {
  return { id: uid(), category: 'gear', quantity: 1, weight: 0, value: '', equipped: false, attuned: false, requiresAttunement: false, location: 'Carried',
    magicBonus: 0, modifiers: [], properties: [], notes: '', source: 'User', ...partial };
}

export function itemFromContentId(reg: Registry, id: string): InventoryItem | null {
  const w = byId(reg.weapons, id);
  if (w) return newItem({ name: w.name, category: 'weapon', weaponId: w.id, weight: w.weight, value: w.cost, properties: w.properties, equipped: true, source: w.source.label });
  const a = byId(reg.armor, id);
  if (a) return newItem({ name: a.name, category: a.type === 'shield' ? 'shield' : 'armor', armorId: a.id, weight: a.weight, value: a.cost, equipped: true, source: a.source.label });
  return null;
}

export interface WizardDraft {
  step: number; ruleset: RulesetId; name: string; playerName: string; alignment: string; concept: string;
  speciesId: string; speciesAsiChoice: Ability[]; speciesSkills: string[];
  backgroundId: string; classId: string; subclassId: string; startLevel: number;
  abilityMethod: 'standard' | 'pointbuy' | 'manual' | 'roll' | 'custom'; base: Record<Ability, number>; rolled: { dice: number[]; total: number }[];
  classSkills: string[]; languages: string; tools: string; expertise: string[];
  takeEquipment: boolean; cantrips: string[]; spells: string[];
  overrides: string[]; // labelled custom rulings
  optionNotes: string; // fighting style, invocations, etc. recorded as a feature
  details: Partial<Character['details']>;
}

export function blankDraft(ruleset: RulesetId): WizardDraft {
  return { step: 0, ruleset, name: '', playerName: '', alignment: '', concept: '', speciesId: '', speciesAsiChoice: [], speciesSkills: [], backgroundId: '', classId: '', subclassId: '',
    startLevel: 1, abilityMethod: 'standard', base: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }, rolled: [], classSkills: [], languages: '', tools: '', expertise: [],
    takeEquipment: true, cantrips: [], spells: [], overrides: [], optionNotes: '', details: {} };
}

/** Validate the draft. Returns field-keyed errors (empty when valid). */
export function validateDraft(d: WizardDraft, reg: Registry): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.name.trim()) e.name = 'Character name is required.';
  if (!d.speciesId || !byId(reg.species, d.speciesId)) e.speciesId = 'Choose a species.';
  if (!d.backgroundId || !byId(reg.backgrounds, d.backgroundId)) e.backgroundId = 'Choose a background.';
  const cls = byId(reg.classes, d.classId);
  if (!cls) e.classId = 'Choose a class.';
  if (!Number.isInteger(d.startLevel) || d.startLevel < 1 || d.startLevel > 20) e.startLevel = 'Starting level must be 1–20.';
  for (const ab of ABILITIES) { const v = d.base[ab]; if (!Number.isInteger(v) || v < 1 || v > 30) e[`base.${ab}`] = 'Scores must be whole numbers from 1 to 30.'; }
  if (d.abilityMethod === 'pointbuy' && !d.overrides.includes('pointbuy')) { const pb = pointBuyCost(d.base); if (!pb.valid) e['base.str'] = pb.error!; }
  if (d.abilityMethod === 'standard' && !d.overrides.includes('standard')) {
    const sorted = ABILITIES.map((a) => d.base[a]).sort((a, b) => b - a);
    if (sorted.join() !== STANDARD_ARRAY.join()) e['base.str'] = 'Assign each standard-array value (15, 14, 13, 12, 10, 8) exactly once.';
  }
  const sp = byId(reg.species, d.speciesId);
  if (sp?.asiChoice && d.speciesAsiChoice.length !== sp.asiChoice.count && !d.overrides.includes('species')) e.speciesAsiChoice = `Choose ${sp.asiChoice.count} abilities to increase.`;
  if (sp?.skillChoices && d.speciesSkills.length !== sp.skillChoices && !d.overrides.includes('species')) e.speciesSkills = `Choose ${sp.skillChoices} species skills.`;
  if (cls && d.classSkills.length !== cls.skillChoices.count && !d.overrides.includes('skills')) e.classSkills = `Choose ${cls.skillChoices.count} class skills.`;
  if (cls && d.subclassId && !reg.subclasses.some((s) => s.id === d.subclassId && s.classId === cls.id)) e.subclassId = 'That subclass does not belong to the chosen class.';
  return e;
}

/** Build a complete character from a validated draft, levelling through each level so progression history is genuine. */
export function buildCharacter(d: WizardDraft, reg: Registry): { character: Character; levelSummaries: string[][] } {
  const errs = validateDraft(d, reg);
  if (Object.keys(errs).length) throw new Error(Object.values(errs).join(' '));
  const c = blankCharacter(d.ruleset);
  const cls = byId(reg.classes, d.classId)!; const sp = byId(reg.species, d.speciesId)!; const bg = byId(reg.backgrounds, d.backgroundId)!;
  c.name = d.name.trim(); c.playerName = d.playerName.trim(); c.alignment = d.alignment; c.speciesId = sp.id; c.backgroundId = bg.id;
  c.baseAbilities = { ...d.base }; c.abilityMethod = d.abilityMethod;
  if (d.rolled.length) c.features.push({ id: uid(), name: 'Rolled ability scores', source: 'Creation', summary: d.rolled.map((r) => `[${r.dice.join(', ')}] → ${r.total}`).join('; ') });
  Object.entries(sp.asi).forEach(([ab, n]) => c.abilityBonuses.push({ ability: ab as Ability, amount: n as number, source: `Species: ${sp.name}` }));
  d.speciesAsiChoice.forEach((ab) => c.abilityBonuses.push({ ability: ab, amount: sp.asiChoice?.amount ?? 1, source: `Species choice: ${sp.name}` }));
  c.speeds.walk = sp.speed;
  if (sp.darkvision) c.senses = `Darkvision ${sp.darkvision} ft`;
  c.defenses.resistances = [...(sp.resistances ?? [])];
  const prof = (kind: Character['proficiencies'][number]['kind'], name: string, source: string) => { if (!c.proficiencies.some((p) => p.kind === kind && p.name === name.toLowerCase())) c.proficiencies.push({ kind, name: name.toLowerCase(), source }); };
  cls.saves.forEach((s) => prof('save', s, cls.name));
  cls.armor.forEach((a) => prof('armor', a.replace(/ \(.*\)$/, ''), cls.name));
  cls.weapons.forEach((w) => prof('weapon', w, cls.name));
  cls.tools.forEach((t) => prof('tool', t, cls.name));
  d.classSkills.forEach((s) => prof('skill', s, cls.name));
  (sp.skills ?? []).forEach((s) => prof('skill', s, sp.name)); d.speciesSkills.forEach((s) => prof('skill', s, sp.name));
  (sp.weaponProfs ?? []).forEach((w) => prof('weapon', w, sp.name)); (sp.armorProfs ?? []).forEach((a) => prof('armor', a, sp.name));
  bg.skills.forEach((s) => prof('skill', s, bg.name)); bg.tools.forEach((t) => prof('tool', t, bg.name));
  sp.languages.forEach((l) => prof('language', l, sp.name));
  d.languages.split(',').map((x) => x.trim()).filter(Boolean).forEach((l) => prof('language', l, 'Choice'));
  d.tools.split(',').map((x) => x.trim()).filter(Boolean).forEach((t) => prof('tool', t, 'Choice'));
  d.expertise.forEach((s) => prof('expertise', s, cls.name));
  sp.traits.forEach((t) => c.features.push({ id: uid(), name: t.name, summary: t.summary, source: `Species: ${sp.name}` }));
  c.features.push({ id: uid(), name: bg.feature.name, summary: bg.feature.summary, source: `Background: ${bg.name}` });
  if (d.optionNotes?.trim()) c.features.push({ id: uid(), name: 'Class options', source: cls.name, summary: d.optionNotes.trim() });
  if (d.overrides.length) c.features.push({ id: uid(), name: 'Custom ruling', source: 'Creation', summary: `Validation overridden for: ${d.overrides.join(', ')}` });
  if (d.takeEquipment) {
    (cls.startingEquipment ?? []).forEach((id) => { const it = itemFromContentId(reg, id); if (it) { if (it.category === 'weapon' && c.inventory.some((x) => x.weaponId === it.weaponId)) { const ex = c.inventory.find((x) => x.weaponId === it.weaponId)!; ex.quantity++; } else c.inventory.push(it); } });
    if (c.inventory.some((i) => i.properties.includes('ammunition'))) c.inventory.push(newItem({ name: 'Arrows / bolts', category: 'ammunition', quantity: 20, weight: 0.05, value: '1 gp per 20' }));
    bg.equipment.forEach((e) => { const m = /^(\d+) gp$/.exec(e); if (m) c.currency.gp += Number(m[1]); else c.inventory.push(newItem({ name: e, category: 'gear', source: bg.name })); });
  }
  c.details = { ...c.details, ...d.details };
  if (d.concept) c.details.notes = `Concept: ${d.concept}\n${c.details.notes}`;
  c.spellcasting.known = [...new Set([...d.cantrips, ...d.spells])];
  if (cls.prepStyle === 'prepared' || cls.prepStyle === 'spellbook') c.spellcasting.prepared = [...d.spells].filter((id) => (byId(reg.spells, id)?.level ?? 0) > 0);
  c.spellcasting.prepared.push(...d.cantrips);

  // Level 1: maximum hit die. Then genuine level-ups using fixed HP.
  c.classes.push({ classId: cls.id, level: 1, hpGains: [cls.hitDie], subclassId: cls.subclassLevel <= 1 && d.subclassId ? d.subclassId : undefined });
  cls.features.filter((f) => f.level === 1).forEach((f) => c.features.push({ id: uid(), name: f.name, summary: f.summary ?? '', level: 1, source: `${cls.name} 1` }));
  const sub = byId(reg.subclasses, c.classes[0]!.subclassId);
  sub?.features.filter((f) => f.level === 1).forEach((f) => c.features.push({ id: uid(), name: f.name, summary: f.summary ?? '', level: 1, source: sub.name }));
  if (cls.subclassLevel === 1 && !c.classes[0]!.subclassId) c.pendingChoices.push({ id: uid(), kind: 'subclass', classId: cls.id, classLevel: 1, label: `Choose ${cls.subclassLabel}` });
  const expAt1 = cls.id === 'rogue' && d.expertise.length < 2;
  if (expAt1) c.pendingChoices.push({ id: uid(), kind: 'expertise', classId: cls.id, classLevel: 1, label: 'Choose two Expertise skills (Rogue 1)' });
  for (const cc of libraryFeaturesFor(reg, { classId: cls.id, subclassId: c.classes[0]!.subclassId, classLevel: 1, speciesId: sp.id, backgroundId: bg.id })) applyContent(c, cc, `${cc.category === 'speciesTrait' ? `Species: ${sp.name}` : cc.category === 'backgroundFeature' ? `Background: ${bg.name}` : `${cls.name} 1`} (My content)`, cc.category.endsWith('Feature') && cc.category !== 'backgroundFeature' ? 1 : undefined);
  syncAlwaysPrepared(c, reg);
  const levelSummaries: string[][] = [[`${cls.name} 1: created with maximum hit die (${cls.hitDie})`]];
  for (let L = 2; L <= d.startLevel; L++) {
    const input = { classId: cls.id, hpMethod: 'fixed' as const, subclassId: L === cls.subclassLevel && d.subclassId ? d.subclassId : undefined };
    const plan = planLevelUp(c, reg, input);
    applyLevelUp(c, reg, input, plan);
    levelSummaries.push(plan.summary);
  }
  c.hp.current = compute(c, reg).hpMax.value;
  return { character: c, levelSummaries };
}
