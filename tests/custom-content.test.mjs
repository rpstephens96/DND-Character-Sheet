// User-defined classes/subclasses/species/backgrounds/feats and user-added features on the sheet.
// Expected values are worked out by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistry } from '../app/js/data/registry.js';
import { compute } from '../app/js/rules/calc.js';
import { blankDraft, buildCharacter } from '../app/js/rules/factory.js';
import { planLevelUp, applyLevelUp } from '../app/js/rules/levelup.js';
import { addFeature, removeFeature, updateFeature, inputFromFeature, validateFeatureInput, toLibraryContent, featureGroup } from '../app/js/rules/features.js';
import { blankCustom, validateCustom, buildExport, readExport } from '../app/js/io/importExport.js';
import { mutate, undoEvent } from '../app/js/rules/events.js';

const cc = (category, name, data, extra = {}) => ({ ...blankCustom(category), id: `custom-${name.toLowerCase().replace(/\W+/g, '-')}`, name, data, ...extra });

// A complete user-entered class, as the structured class form produces it.
const BLADESINGER_CLASS = cc('class', 'Spellblade', {
  hitDie: 8, primary: ['dex', 'int'], saves: ['dex', 'int'], armor: ['light'], weapons: ['simple', 'martial'], tools: [],
  skillChoices: { count: 2, from: ['acrobatics', 'arcana', 'stealth'] }, multiclassReq: { all: { dex: 13, int: 13 } }, multiclassProfs: ['light'],
  casterType: 'half', spellAbility: 'int', prepStyle: 'prepared', preparedFormula: 'mod+halfLevel', cantrips: [2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  subclassLevel: 3, subclassLabel: 'Blade Tradition', asiLevels: [4, 8, 12, 16, 19], unarmoredDefense: null,
  features: [{ level: 1, name: 'Arcane Edge', summary: 'Fight with spell and sword.' }, { level: 2, name: 'Quickstep', summary: '+5 ft speed.', modifiers: [{ target: 'speed', op: 'add', value: 5 }] }, { level: 5, name: 'Extra Attack' }],
  resources: [{ id: 'edge-points', name: 'Edge Points', recovery: 'short', byLevel: [null, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11] }],
  startingEquipment: ['rapier', 'leather'], rulesets: ['srd51', 'srd521', 'custom'],
});
const SUB = cc('subclass', 'Way of the Mirror', { classId: 'custom-spellblade', features: [{ level: 3, name: 'Mirror Guard', summary: '+1 AC.', modifiers: [{ target: 'ac', op: 'add', value: 1 }] }],
  alwaysPrepared: [{ level: 3, spells: ['shield'] }], resources: [{ id: 'mirror', name: 'Mirror Images', recovery: 'long', formula: 'abilityMod:int' }] });
const SPECIES = cc('species', 'Glimmerkin', { size: 'Small', speed: 30, asi: { dex: 2 }, asiChoice: { count: 1, amount: 1, exclude: ['dex'] }, darkvision: 60, languages: ['Common', 'Sylvan'], traits: [{ name: 'Glimmer', summary: 'Shed dim light.' }], resistances: ['radiant'] });
const BG = cc('background', 'Tide Warden', { skills: ['athletics', 'survival'], tools: ["navigator's tools"], languageChoices: 1, equipment: ['Rope', '10 gp'], feature: { name: 'Harbour Friends', summary: 'Free passage.' } });
const FEAT = cc('feat', 'Keen Edge', { asi: { dex: 1 } }, { modifiers: [{ target: 'initiative', op: 'add', value: 2 }] });
const ALL = [BLADESINGER_CLASS, SUB, SPECIES, BG, FEAT];

function build(level = 1, reg = buildRegistry(ALL)) {
  const d = blankDraft('srd51');
  Object.assign(d, { name: 'Ysolde', speciesId: 'custom-glimmerkin', speciesAsiChoice: ['int'], backgroundId: 'custom-tide-warden', classId: 'custom-spellblade', subclassId: 'custom-way-of-the-mirror', startLevel: level,
    abilityMethod: 'manual', base: { str: 10, dex: 15, con: 14, int: 15, wis: 10, cha: 8 }, classSkills: ['arcana', 'stealth'] });
  return { c: buildCharacter(d, reg).character, reg };
}

test('every user-entered category validates and is playable', () => {
  for (const x of ALL) assert.deepEqual(validateCustom(x).errors, [], x.name);
  const reg = buildRegistry(ALL);
  assert.ok(reg.classes.some((c) => c.id === 'custom-spellblade')); assert.ok(reg.subclasses.some((s) => s.id === 'custom-way-of-the-mirror'));
  assert.ok(reg.species.some((s) => s.id === 'custom-glimmerkin')); assert.ok(reg.backgrounds.some((b) => b.id === 'custom-tide-warden')); assert.ok(reg.feats.some((f) => f.id === 'custom-keen-edge'));
});

test('character built on a custom class, subclass, species and background: level 1', () => {
  const { c, reg } = build(1); const d = compute(c, reg);
  // DEX 17 (+3), INT 16 (+3), CON 14 (+2)
  assert.deepEqual([d.abilities.dex.value, d.abilities.int.value], [17, 16]);
  assert.equal(d.hpMax.value, 8 + 2);
  assert.equal(d.ac.value, 11 + 3, 'leather from starting equipment');
  assert.equal(d.speed.value, 30); assert.equal(c.senses, 'Darkvision 60 ft');
  assert.ok(c.defenses.resistances.includes('radiant'));
  assert.ok(d.saves.int.proficient && d.saves.dex.proficient);
  assert.ok(d.skills.athletics.proficient, 'background skill');
  assert.ok(c.features.some((f) => f.name === 'Arcane Edge')); assert.ok(c.features.some((f) => f.name === 'Harbour Friends'));
  assert.equal(d.spellProfiles.length, 0, 'half caster has no spellcasting at level 1');
  assert.equal(d.resources.find((r) => r.id === 'edge-points'), undefined, 'no Edge Points at level 1');
});

test('levelling a custom class to 5: features, feature modifiers, resources, subclass, ASI, spellcasting', () => {
  const { c, reg } = build(5); const d = compute(c, reg);
  assert.equal(d.hpMax.value, 8 + 4 * 5 + 5 * 2); // 38
  assert.equal(d.speed.value, 35, 'Quickstep +5 ft from level 2 feature modifier');
  assert.ok(d.speed.parts.some((p) => /Quickstep/.test(p.source)), 'breakdown names the feature');
  assert.equal(d.ac.value, 15, 'Mirror Guard +1 AC from subclass level 3');
  assert.equal(d.resources.find((r) => r.id === 'edge-points').max, 4);
  assert.equal(d.resources.find((r) => r.id === 'mirror').max, 3, 'subclass resource Int modifier');
  assert.ok(c.spellcasting.alwaysPrepared.includes('shield'));
  assert.ok(c.features.some((f) => f.name === 'Extra Attack'));
  assert.ok(c.pendingChoices.some((p) => p.kind === 'asi'));
  const p = d.spellProfiles[0];
  assert.equal(p.className, 'Spellblade'); assert.equal(p.dc.value, 8 + 3 + 3); assert.equal(p.preparedMax, 3 + 2); assert.equal(p.cantripsMax, 3);
  assert.deepEqual(d.slots.map((s) => s.max), [4, 2], 'half caster level 5 → caster level 3');
});

test('custom feat chosen at an ASI applies its ability bonus and modifiers', () => {
  const { c, reg } = build(3);
  const inp = { classId: 'custom-spellblade', hpMethod: 'fixed', asi: { type: 'feat', featId: 'custom-keen-edge' } };
  applyLevelUp(c, reg, inp, planLevelUp(c, reg, inp));
  const d = compute(c, reg);
  assert.equal(d.abilities.dex.value, 18); assert.equal(d.initiative.value, 4 + 2);
});

test('add a class feature with a bonus, a formula resource, an action, proficiencies and spells; then edit and remove it', () => {
  const { c, reg } = build(3);
  const before = compute(c, reg);
  const input = { kind: 'class', classId: 'custom-spellblade', level: 3, name: 'Riposte Stance', summary: 'Parry and strike back.',
    modifiers: [{ target: 'ac', op: 'add', value: 1 }, { target: 'skill:acrobatics', op: 'add', value: 2 }],
    resource: { name: 'Riposte', max: 1, formula: '1+abilityMod:int', recovery: 'short' },
    action: { name: 'Riposte', economy: 'reaction', range: '5 ft', target: 'One creature', attackType: 'melee', ability: 'dex', proficient: true, attackBonusExtra: 0, damage: '1d8+3', damageType: 'piercing', notes: '' },
    profs: [{ kind: 'skill', name: 'Athletics' }, { kind: 'tool', name: "smith's tools" }], spellIds: ['misty-step'] };
  assert.deepEqual(validateFeatureInput(input), {});
  const m = mutate(c, 'feature', 'Added', (dr) => { addFeature(dr, reg, input); });
  const d = compute(m.next, reg);
  assert.equal(d.ac.value, before.ac.value + 1);
  assert.equal(d.skills.acrobatics.value, before.skills.acrobatics.value + 2);
  assert.ok(d.ac.parts.some((p) => p.source === 'Feature: Riposte Stance'));
  assert.equal(d.resources.find((r) => r.name === 'Riposte').max, 1 + 3);
  const atk = d.attacks.find((a) => a.name === 'Riposte'); assert.ok(atk); assert.equal(atk.resourceId, m.next.features.at(-1).resourceId);
  assert.ok(m.next.proficiencies.some((p) => p.kind === 'tool' && p.name === "smith's tools"));
  assert.equal(m.next.proficiencies.filter((p) => p.name === 'athletics').length, 1, 'already proficient: not duplicated');
  assert.ok(m.next.spellcasting.alwaysPrepared.includes('misty-step'));
  assert.equal(featureGroup(m.next, reg, m.next.features.at(-1)).label, 'Class: Spellblade');

  // Edit: change the bonus; the resource keeps its usage
  const f = m.next.features.at(-1);
  m.next.resources.find((r) => r.id === f.resourceId).used = 2;
  const edited = mutate(m.next, 'feature', 'Edited', (dr) => { const inp = inputFromFeature(dr, f); inp.modifiers[0].value = 2; updateFeature(dr, reg, f.id, inp); });
  assert.equal(compute(edited.next, reg).ac.value, before.ac.value + 2);
  assert.equal(edited.next.resources.find((r) => r.name === 'Riposte').used, 2);
  assert.equal(edited.next.features.findIndex((x) => x.id === f.id), m.next.features.length - 1, 'position kept');

  // Remove: everything it added goes, nothing else
  const removed = mutate(edited.next, 'feature', 'Removed', (dr) => removeFeature(dr, f.id));
  const after = compute(removed.next, reg);
  assert.equal(after.ac.value, before.ac.value); assert.equal(after.skills.acrobatics.value, before.skills.acrobatics.value);
  assert.ok(!removed.next.resources.some((r) => r.name === 'Riposte')); assert.ok(!removed.next.actions.some((a) => a.name === 'Riposte'));
  assert.ok(!removed.next.proficiencies.some((p) => p.name === "smith's tools")); assert.ok(removed.next.proficiencies.some((p) => p.name === 'athletics'), 'background athletics kept');
  assert.ok(!removed.next.spellcasting.alwaysPrepared.includes('misty-step'));
  // And undo restores it
  assert.equal(compute(undoEvent(removed.next, removed.event), reg).ac.value, before.ac.value + 2);
});

test('feature validation', () => {
  const base = { kind: 'class', name: '', summary: '', modifiers: [], profs: [], spellIds: [] };
  const e = validateFeatureInput({ ...base, resource: { name: '', max: 0, recovery: 'long' }, action: { name: 'x', damage: 'lots' } });
  assert.ok(e.name && e.classId && e.resource && e.action);
});

test('a feature saved to the library is given to future characters at that level, once', () => {
  const { c, reg } = build(2);
  const input = { kind: 'class', classId: 'custom-spellblade', level: 3, name: 'Blade Song', summary: 'Dance of steel.', modifiers: [{ target: 'ac', op: 'add', value: 1 }], profs: [], spellIds: [] };
  const lib = toLibraryContent(c, input);
  assert.equal(lib.category, 'classFeature'); assert.equal(lib.levelRequirement, 3); assert.deepEqual(validateCustom(lib).errors, []);
  const reg2 = buildRegistry([...ALL, lib]);
  const { c: other } = build(2, reg2);
  assert.ok(!other.features.some((f) => f.name === 'Blade Song'), 'not before level 3');
  const ac2 = compute(other, reg2).ac.value;
  const inp = { classId: 'custom-spellblade', hpMethod: 'fixed', subclassId: 'custom-way-of-the-mirror' };
  applyLevelUp(other, reg2, inp, planLevelUp(other, reg2, inp));
  assert.equal(other.features.filter((f) => f.name === 'Blade Song').length, 1);
  assert.equal(compute(other, reg2).ac.value, ac2 + 1 + 1, 'Blade Song +1 and Mirror Guard +1');
  const inp4 = { classId: 'custom-spellblade', hpMethod: 'fixed' };
  applyLevelUp(other, reg2, inp4, planLevelUp(other, reg2, inp4));
  assert.equal(other.features.filter((f) => f.name === 'Blade Song').length, 1, 'never applied twice');
  // Species trait saved to library reaches new characters of that species at creation
  const trait = toLibraryContent(c, { kind: 'species', name: 'Shimmer Step', summary: '', modifiers: [{ target: 'speed', op: 'add', value: 5 }], profs: [], spellIds: [] });
  const reg3 = buildRegistry([...ALL, trait]);
  const { c: third } = build(1, reg3);
  assert.equal(compute(third, reg3).speed.value, 35);
});

test('My content round trip: export and re-import keeps classes playable', async () => {
  const text = await buildExport('content', { characters: [], events: [], snapshots: [], custom: ALL, campaigns: [], records: [], encounters: [] });
  const rep = await readExport(text);
  assert.equal(rep.ok, true); assert.equal(rep.data.custom.length, ALL.length);
  const { c, reg } = build(5, buildRegistry(rep.data.custom));
  assert.equal(compute(c, reg).hpMax.value, 38);
});
