import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeParse, validateCharacter, validateCustom, buildExport, readExport, migrateCharacter, blankCustom } from '../app/js/io/importExport.js';
import { buildRegistry } from '../app/js/data/registry.js';
import { buildCharacter, blankDraft } from '../app/js/rules/factory.js';
import { compute } from '../app/js/rules/calc.js';

const reg = buildRegistry();
const mk = () => { const d = blankDraft('srd51'); Object.assign(d, { name: 'Ione', speciesId: 'high-elf', backgroundId: 'acolyte', classId: 'wizard', startLevel: 3, subclassId: 'evocation', abilityMethod: 'manual', base: { str: 8, dex: 14, con: 14, int: 15, wis: 12, cha: 10 }, classSkills: ['arcana', 'history'] }); return buildCharacter(d, reg).character; };

test('safeParse strips prototype pollution keys', () => {
  const o = safeParse('{"a":1,"__proto__":{"polluted":true},"b":{"constructor":{"x":1}}}');
  assert.equal(({}).polluted, undefined); assert.equal(Object.prototype.hasOwnProperty.call(o, '__proto__'), false); assert.equal(o.b.constructor, Object);
  assert.throws(() => safeParse('{bad'), /not valid JSON/);
});

test('validateCharacter rejects script content and bad levels', () => {
  const c = mk();
  assert.ok(validateCharacter({ ...c, name: '<script>alert(1)</script>' }).errors.length > 0);
  assert.ok(validateCharacter({ ...c, classes: [{ classId: 'wizard', level: 25, hpGains: [] }] }).errors.length > 0);
  assert.ok(validateCharacter({ ...c, portrait: 'https://evil.example/x.png' }).warnings.some((w) => w.includes('Portrait')));
});

test('migration v1 → v2 adds fields', () => {
  const c = mk(); delete c.pendingChoices; delete c.dashboardPanels; c.schemaVersion = 1;
  const m = migrateCharacter(c); assert.ok(Array.isArray(m.data.pendingChoices)); assert.equal(m.data.schemaVersion, 2); assert.equal(m.notes.length, 1);
  assert.ok(validateCharacter(c).character);
});

test('export and re-import round trip preserves derived values; integrity detects tampering', async () => {
  const c = mk();
  const text = await buildExport('character', { characters: [c], events: [], snapshots: [], custom: [blankCustom()].map((x) => ({ ...x, name: 'Test feat' })), campaigns: [], records: [], encounters: [] });
  const rep = await readExport(text);
  assert.equal(rep.ok, true); assert.equal(rep.integrity, 'verified');
  assert.deepEqual(compute(rep.data.characters[0], reg).hpMax.value, compute(c, reg).hpMax.value);
  assert.equal(rep.data.custom[0].origin, 'imported');
  const tampered = text.replace('"Ione"', '"Ione2"');
  assert.equal((await readExport(tampered)).integrity, 'mismatch');
  assert.equal((await readExport('{"hello":1}')).ok, false);
});

test('custom content validation', () => {
  assert.ok(validateCustom({ ...blankCustom(), name: 'X', modifiers: [{ target: 'ac', op: 'mul', value: 1 }] }).errors.length);
  assert.ok(validateCustom({ ...blankCustom(), name: 'X', category: 'class', data: { hitDie: 7 } }).errors.length);
  assert.equal(validateCustom({ ...blankCustom(), name: 'Ring', modifiers: [{ target: 'ac', op: 'add', value: 1 }] }).errors.length, 0);
});

test('custom class from content becomes playable', () => {
  const cls = { ...blankCustom('class'), id: 'custom-hb', name: 'Hedge Knight', data: { hitDie: 10, primary: ['str'], saves: ['str', 'con'], armor: ['light'], weapons: ['simple'], tools: [], skillChoices: { count: 1, from: ['athletics'] }, multiclassReq: {}, multiclassProfs: [], casterType: 'none', subclassLevel: 3, subclassLabel: 'Oath', asiLevels: [4, 8, 12, 16, 19], features: [{ level: 1, name: 'Vigil' }], rulesets: ['srd51'] } };
  const r = buildRegistry([cls]);
  const d = blankDraft('srd51'); Object.assign(d, { name: 'Dunk', speciesId: 'human', backgroundId: 'acolyte', classId: 'custom-hb', startLevel: 2, abilityMethod: 'manual', base: { str: 15, dex: 10, con: 14, int: 10, wis: 10, cha: 10 }, classSkills: ['athletics'] });
  const c = buildCharacter(d, r).character;
  assert.equal(compute(c, r).hpMax.value, 10 + 6 + 2 * 2);
  assert.ok(c.features.some((f) => f.name === 'Vigil'));
});
