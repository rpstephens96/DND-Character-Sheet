// Rules-engine tests. Expected values are worked out by hand from the SRD rules, not from the engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistry } from '../app/js/data/registry.js';
import { compute, abilityMod, proficiencyBonus } from '../app/js/rules/calc.js';
import { blankCharacter, buildCharacter, blankDraft, pointBuyCost, newItem, itemFromContentId } from '../app/js/rules/factory.js';
import { combinedCasterLevel, slotsForCasterLevel, pactSlots } from '../app/js/rules/spellslots.js';
import { planLevelUp, applyLevelUp, multiclassCheck } from '../app/js/rules/levelup.js';
import { proposeDamage, applyDamage, applyHealing, applyTempHp, recordDeathSave, suggestDefense } from '../app/js/rules/combat.js';
import { planShortRest, applyShortRest, planLongRest, applyLongRest } from '../app/js/rules/rest.js';
import { mutate, undoEvent } from '../app/js/rules/events.js';
import { parseDice, roll, averageOf } from '../app/js/rules/dice.js';

const reg = buildRegistry();
const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };

function fighter(level = 1) {
  const d = blankDraft('srd51');
  Object.assign(d, { name: 'Brakka', speciesId: 'human', backgroundId: 'acolyte', classId: 'fighter', startLevel: level, abilityMethod: 'standard',
    base: { str: 15, dex: 14, con: 13, int: 8, wis: 12, cha: 10 }, classSkills: ['athletics', 'perception'] });
  return buildCharacter(d, reg).character;
}

test('ability modifiers', () => {
  assert.deepEqual([1, 8, 9, 10, 11, 12, 15, 20, 30].map(abilityMod), [-5, -1, -1, 0, 0, 1, 2, 5, 10]);
});

test('proficiency bonus by level', () => {
  assert.deepEqual([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(proficiencyBonus), [2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
});

test('martial character: human fighter level 1', () => {
  const c = fighter(1); const d = compute(c, reg);
  // Human +1 all: STR 16 DEX 15 CON 14 INT 9 WIS 13 CHA 11
  assert.equal(d.abilities.str.value, 16); assert.equal(d.mods.con, 2);
  assert.equal(d.hpMax.value, 12);              // d10 max 10 + Con 2
  assert.equal(d.saves.str.value, 5);           // +3 +2
  assert.equal(d.saves.dex.value, 2);           // not proficient
  assert.equal(d.skills.athletics.value, 5);
  assert.equal(d.passives.perception.value, 13); // 10 + 1 + 2
  assert.equal(d.ac.value, 18);                 // chain mail 16 + shield 2
  assert.equal(d.speed.value, 30);              // chain mail Str 13 met
  const ls = d.attacks.find((a) => a.name === 'Longsword');
  assert.equal(ls.attack.value, 5); assert.equal(ls.damage, '1d8+3'); assert.equal(ls.versatile, '1d10+3');
  assert.equal(d.initiative.value, 2);
  assert.equal(d.carrying.capacity, 240);
});

test('fixed HP progression and level-up history', () => {
  const c = fighter(5); const d = compute(c, reg);
  assert.equal(d.hpMax.value, 10 + 4 * 6 + 5 * 2); // 44
  assert.equal(d.pb.value, 3);
  assert.ok(c.features.some((f) => f.name === 'Extra Attack'));
  assert.ok(c.pendingChoices.some((p) => p.kind === 'asi'));
  assert.ok(c.pendingChoices.some((p) => p.kind === 'subclass'));
  assert.equal(d.resources.find((r) => r.id === 'action-surge').max, 1);
});

test('ASI validation rejects exceeding 20 and wrong totals', () => {
  const c = fighter(3);
  const bad = planLevelUp(c, reg, { classId: 'fighter', hpMethod: 'fixed', asi: { type: 'asi', bonuses: [{ ability: 'str', amount: 1 }] } });
  assert.equal(bad.ok, false);
  const good = planLevelUp(c, reg, { classId: 'fighter', hpMethod: 'fixed', asi: { type: 'asi', bonuses: [{ ability: 'str', amount: 2 }] } });
  assert.equal(good.ok, true);
  applyLevelUp(c, reg, { classId: 'fighter', hpMethod: 'fixed', asi: { type: 'asi', bonuses: [{ ability: 'str', amount: 2 }] } }, good);
  assert.equal(compute(c, reg).abilities.str.value, 18);
});

test('roll HP validation', () => {
  const c = fighter(1);
  assert.equal(planLevelUp(c, reg, { classId: 'fighter', hpMethod: 'roll', hpValue: 11 }).ok, false);
  assert.equal(planLevelUp(c, reg, { classId: 'fighter', hpMethod: 'roll', hpValue: 7 }).hpGain, 7);
});

test('multiclass prerequisites', () => {
  const c = fighter(2); // CHA 11, WIS 13
  assert.equal(multiclassCheck(c, reg, 'wizard').ok, false); // INT 9
  assert.equal(multiclassCheck(c, reg, 'ranger').ok, true);  // DEX 15, WIS 13; fighter needs STR or DEX 13
  const p = planLevelUp(c, reg, { classId: 'wizard', hpMethod: 'fixed', overrideMulticlass: true });
  assert.equal(p.ok, true); assert.ok(p.summary.some((s) => s.startsWith('Custom ruling')));
});

function caster(classId, level, base, extra = {}) {
  const d = blankDraft('srd51');
  const cls = reg.classes.find((c) => c.id === classId);
  Object.assign(d, { name: 'Caster', speciesId: 'human', backgroundId: 'acolyte', classId, startLevel: level, abilityMethod: 'manual', base, classSkills: cls.skillChoices.from.slice(0, cls.skillChoices.count), ...extra });
  return buildCharacter(d, reg).character;
}

test('prepared caster: cleric 5', () => {
  const c = caster('cleric', 5, { str: 10, dex: 12, con: 14, int: 10, wis: 16, cha: 10 }, { subclassId: 'life' });
  const d = compute(c, reg); const p = d.spellProfiles[0];
  // WIS 17 (+3), PB 3 → DC 14, attack +6, prepared 3 + 5 = 8
  assert.equal(p.dc.value, 14); assert.equal(p.attack.value, 6); assert.equal(p.preparedMax, 8);
  assert.deepEqual(d.slots.map((s) => s.max), [4, 3, 2]);
  assert.ok(c.spellcasting.alwaysPrepared.includes('revivify'));
  assert.equal(d.resources.find((r) => r.id === 'channel-divinity').max, 1);
});

test('known caster: sorcerer 3 with Draconic Resilience', () => {
  const c = caster('sorcerer', 3, { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 16 }, { subclassId: 'draconic' });
  const d = compute(c, reg);
  assert.equal(d.spellProfiles[0].knownMax, 4); assert.equal(d.spellProfiles[0].cantripsMax, 4);
  assert.equal(d.ac.value, 15);                  // 13 + Dex 2 (DEX 15)
  assert.equal(d.hpMax.value, 6 + 4 + 4 + 3 * 2 + 3); // 23
});

test('combined multiclass spell slots and pact magic', () => {
  assert.equal(combinedCasterLevel([{ casterType: 'full', level: 3 }, { casterType: 'half', level: 5 }]).level, 5);
  assert.equal(combinedCasterLevel([{ casterType: 'half', level: 3 }]).level, 2); // single-class rounds up
  assert.equal(combinedCasterLevel([{ casterType: 'half', level: 3 }, { casterType: 'half', level: 3 }]).level, 2);
  assert.deepEqual(slotsForCasterLevel(5), [4, 3, 2]);
  assert.deepEqual(pactSlots(1), { count: 1, level: 1 }); assert.deepEqual(pactSlots(5), { count: 2, level: 3 });
  assert.deepEqual(pactSlots(11), { count: 3, level: 5 }); assert.deepEqual(pactSlots(17), { count: 4, level: 5 });
});

test('multiclass spellcaster keeps separate profiles and pact pool', () => {
  const c = caster('sorcerer', 3, { str: 8, dex: 14, con: 14, int: 10, wis: 13, cha: 16 }, { subclassId: 'draconic' });
  for (let i = 0; i < 2; i++) { const inp = { classId: 'warlock', hpMethod: 'fixed', subclassId: i === 0 ? 'fiend' : undefined }; applyLevelUp(c, reg, inp, planLevelUp(c, reg, inp)); }
  const d = compute(c, reg);
  assert.equal(d.totalLevel, 5);
  assert.deepEqual(d.slots.map((s) => s.max), [4, 2]); // caster level 3 (warlock excluded)
  assert.deepEqual([d.pact.count, d.pact.level], [2, 1]);
  assert.equal(d.spellProfiles.length, 2);
});

test('expertise and Jack of All Trades', () => {
  const c = caster('bard', 2, { str: 8, dex: 14, con: 12, int: 10, wis: 12, cha: 16 }, { classSkills: ['stealth', 'persuasion', 'insight'] });
  c.proficiencies.push({ kind: 'expertise', name: 'stealth', source: 'test' });
  const d = compute(c, reg);
  assert.equal(d.skills.stealth.value, 2 + 4);   // Dex +2, expertise 2×2
  assert.equal(d.skills.athletics.value, -1 + 1); // Str −1 (STR 9), JoAT floor(2/2)
  assert.equal(d.initiative.value, 2 + 1);
});

test('custom content modifiers and overrides', () => {
  const cc = { id: 'cc-ring', category: 'magicItem', name: 'Ring of Testing', rulesets: ['srd51'], origin: 'user', sourceLabel: 'Homebrew', version: 1, enabled: true, description: '', notes: '', prerequisites: '', levelRequirement: 0,
    modifiers: [{ target: 'ac', op: 'add', value: 1 }, { target: 'save:all', op: 'add', value: 1 }], resources: [{ id: 'luck', name: 'Luck', recovery: 'long', formula: 'abilityMod:cha' }], proficiencies: [], spellAdditions: [], actions: [], createdAt: '', updatedAt: '' };
  const r2 = buildRegistry([cc]);
  const c = fighter(1); c.grants.push('cc-ring');
  let d = compute(c, r2);
  assert.equal(d.ac.value, 19); assert.equal(d.saves.dex.value, 3); assert.equal(d.resources.find((r) => r.id === 'luck').max, 1);
  c.overrides.ac = 21; d = compute(c, r2);
  assert.equal(d.ac.value, 21); assert.equal(d.ac.calculated, 19); assert.ok(d.ac.overridden);
  assert.ok(compute(c, reg).warnings.some((w) => w.includes('cc-ring')));
});

test('damage, temp HP, resistance, immunity, vulnerability, concentration', () => {
  const c = fighter(1); c.hp.temp = 5; c.concentration = { name: 'Bless', since: '' };
  let p = proposeDamage(c, 12, 9, 'normal');
  assert.deepEqual([p.toTemp, p.toHp, p.newHp, p.concentrationDC], [5, 4, 8, 10]);
  assert.equal(proposeDamage(c, 12, 9, 'resistant').adjusted, 4);
  assert.equal(proposeDamage(c, 12, 9, 'immune').adjusted, 0);
  assert.equal(proposeDamage(c, 12, 9, 'vulnerable').adjusted, 18);
  assert.equal(proposeDamage(c, 12, 30, 'normal').concentrationDC, 15);
  c.defenses.resistances = ['fire']; assert.equal(suggestDefense(c, 'Fire'), 'resistant'); assert.equal(suggestDefense(c, ''), 'normal');
  c.defenses.vulnerabilities = ['fire']; assert.equal(suggestDefense(c, 'fire'), 'normal');
});

test('massive damage, death saves, healing from 0', () => {
  const c = fighter(1); c.hp.current = 6;
  const p = proposeDamage(c, 12, 18, 'normal'); assert.equal(p.instantDeath, true);
  const p2 = proposeDamage(c, 12, 10, 'normal'); applyDamage(c, p2); assert.equal(c.hp.current, 0); assert.equal(c.deathSaves.dead, false);
  applyDamage(c, proposeDamage(c, 12, 3, 'normal', { critical: true })); assert.equal(c.deathSaves.failures, 2);
  recordDeathSave(c, 12); assert.equal(c.deathSaves.successes, 1);
  applyHealing(c, 12, 4); assert.equal(c.hp.current, 4); assert.equal(c.deathSaves.failures, 0);
  c.hp.current = 0; c.deathSaves.failures = 2; assert.match(recordDeathSave(c, 5), /dies/); assert.throws(() => applyHealing(c, 12, 5));
  const c2 = fighter(1); c2.hp.current = 0; recordDeathSave(c2, 20); assert.equal(c2.hp.current, 1);
});

test('temporary HP do not stack unless replaced', () => {
  const c = fighter(1); applyTempHp(c, 8, false); applyTempHp(c, 5, false); assert.equal(c.hp.temp, 8);
  applyTempHp(c, 5, true); assert.equal(c.hp.temp, 5);
});

test('short rest: hit dice, Con and short-rest resources', () => {
  const c = fighter(3); c.hp.current = 10; c.resources = [{ id: 'second-wind', name: 'Second Wind', max: 1, used: 1, recovery: 'short', source: '' }];
  const d = compute(c, reg);
  const plan = planShortRest(c, d, [{ die: 'd10', roll: 4 }, { die: 'd10', roll: 1 }]);
  assert.equal(plan.totalHealed, 6 + 3); assert.deepEqual(plan.resourcesRecovered, ['second-wind']);
  applyShortRest(c, plan); assert.equal(c.hp.current, 19); assert.equal(c.hitDiceUsed.d10, 2); assert.equal(c.resources[0].used, 0);
  assert.throws(() => planShortRest(c, compute(c, reg), [{ die: 'd10', roll: 11 }]));
  assert.throws(() => planShortRest(c, compute(c, reg), [{ die: 'd10', roll: 3 }, { die: 'd10', roll: 3 }]));
});

test('long rest: 2014 half hit dice vs 2024 all hit dice, exhaustion', () => {
  const c = fighter(5); c.hitDiceUsed = { d10: 5 }; c.hp.current = 3; c.exhaustion = 2; c.spellcasting.slotsUsed = [1];
  let plan = planLongRest(c, compute(c, reg)); assert.deepEqual(plan.hitDiceRecovered, { d10: 2 });
  applyLongRest(c, compute(c, reg), plan); assert.equal(c.hp.current, compute(c, reg).hpMax.value); assert.equal(c.exhaustion, 1); assert.equal(c.hitDiceUsed.d10, 3);
  const c2 = fighter(5); c2.ruleset = 'srd521'; c2.hitDiceUsed = { d10: 5 };
  plan = planLongRest(c2, compute(c2, reg)); assert.deepEqual(plan.hitDiceRecovered, { d10: 5 });
});

test('exhaustion effects differ by ruleset', () => {
  const c = fighter(1); c.exhaustion = 2;
  assert.equal(compute(c, reg).speed.value, 15);
  c.ruleset = 'srd521'; const d = compute(c, reg);
  assert.equal(d.speed.value, 20); assert.equal(d.saves.str.value, 1);
});

test('conditions: grappled sets speed 0', () => {
  const c = fighter(1); c.effects.push({ id: 'e', name: 'Grappled', conditionId: 'grappled', startedAt: '', duration: '', source: '', concentrationLinked: false, modifiers: [], endCondition: '', notes: '' });
  assert.equal(compute(c, reg).speed.value, 0);
});

test('encumbrance and coin weight', () => {
  const c = fighter(1); c.inventory.push(newItem({ name: 'Anvil', weight: 200 })); c.currency.gp = 500;
  const d = compute(c, reg, { coinWeight: 50, encumbranceVariant: true });
  assert.ok(d.carrying.weight.value > 160);
  assert.equal(d.carrying.encumbrance, 'over');
});

test('unarmored defense and monk/barbarian speed', () => {
  const c = caster('barbarian', 5, { str: 15, dex: 14, con: 15, int: 8, wis: 10, cha: 8 }, { takeEquipment: false });
  const d = compute(c, reg); assert.equal(d.ac.value, 10 + 2 + 3); assert.equal(d.speed.value, 40);
  const sh = itemFromContentId(reg, 'shield'); c.inventory.push(sh); assert.equal(compute(c, reg).ac.value, 17);
});

test('point buy', () => {
  assert.equal(pointBuyCost({ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 }).cost, 27);
  assert.equal(pointBuyCost({ str: 15, dex: 15, con: 15, int: 9, wis: 8, cha: 8 }).valid, false);
});

test('audit: mutate records changes and undo is conflict-checked', () => {
  const c = fighter(1);
  const m1 = mutate(c, 'hp', 'Took 5', (d) => { d.hp.current -= 5; });
  assert.equal(m1.event.before.hp.current, 12); assert.equal(m1.next.hp.current, 7);
  const m2 = mutate(m1.next, 'hp', 'Took 2', (d) => { d.hp.current -= 2; });
  assert.throws(() => undoEvent(m2.next, m1.event), /Later changes/);
  const back = undoEvent(m2.next, m2.event); assert.equal(back.hp.current, 7);
  assert.equal(undoEvent(back, m1.event).hp.current, 12);
  assert.equal(mutate(c, 'hp', 'noop', () => {}).event, null);
});

test('dice parsing, advantage, critical, manual entry', () => {
  assert.deepEqual(parseDice('2d6+3'), { terms: [{ count: 2, sides: 6, sign: 1 }], modifier: 3 });
  assert.throws(() => parseDice('2d7')); assert.throws(() => parseDice('hello'));
  const r = roll('1d20+5', { mode: 'advantage', rng: seq(4, 17) });
  assert.equal(r.total, 22); assert.equal(r.dice.filter((x) => x.kept).length, 1);
  assert.equal(roll('1d20', { mode: 'disadvantage', rng: seq(4, 17) }).total, 4);
  assert.equal(roll('2d6+1', { critical: true, rng: seq(1, 2, 3, 4) }).total, 11);
  assert.equal(roll('1d8-1', { manual: [8] }).total, 7);
  assert.throws(() => roll('1d8', { manual: [9] }));
  assert.equal(averageOf('2d6+3'), 10);
});

test('secure random stays in range', () => {
  for (let i = 0; i < 500; i++) { const v = roll('1d20').total; assert.ok(v >= 1 && v <= 20); }
});
