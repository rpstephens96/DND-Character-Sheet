// Content packs: converters (against fixture files in each source's format), validation, installation,
// registry merging, ruleset preference, export round trips and backups.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { convert5eDatabase } from '../app/js/content/convert-5edb.js';
import { convertOpen5e } from '../app/js/content/convert-open5e.js';
import { validatePack, toInstalled, fromInstalled, cleanText } from '../app/js/content/pack.js';
import { installPack, removePack, setPackEnabled, exportPack, loadText } from '../app/js/content/service.js';
import { FIVE_E_DB_FILES, OPEN5E_ENDPOINTS } from '../app/js/content/sources.js';
import { buildRegistry, preferRuleset, textFor, byId } from '../app/js/data/registry.js';
import { SPELLS } from '../app/js/data/srd-content.js';
import { memoryRepo } from '../app/js/db/memory.js';
import { compute } from '../app/js/rules/calc.js';
import { sampleCharacters } from '../app/js/data/samples.js';
import { buildExport, readExport } from '../app/js/io/importExport.js';

const fx = (p) => JSON.parse(readFileSync(new URL(`./fixtures/${p}`, import.meta.url), 'utf8'));
const dbInput = Object.fromEntries(Object.entries(FIVE_E_DB_FILES).map(([k, f]) => [k, fx(`5edb/${f}`)]));
const o5Input = Object.fromEntries(Object.entries(OPEN5E_ENDPOINTS).map(([k, e]) => [k, fx(`open5e/${e}.json`)]));
const p51 = () => convert5eDatabase(dbInput, '2026-10-23', '2026-10-23T00:00:00Z');
const p521 = () => convertOpen5e(o5Input, '2026-10-23', '2026-10-23T00:00:00Z');
const entry = (pack, kind, id) => pack.entries.find((e) => e.kind === kind && e.id === id);

test('5e-database converter maps every file in the source format', () => {
  const { pack, report } = p51();
  const v = validatePack(pack);
  assert.equal(v.ok, true, v.errors.join(' | '));
  assert.deepEqual(report.skipped, []);
  assert.deepEqual(v.counts, { spell: 3, weapon: 1, armor: 1, gear: 2, magicItem: 2, monster: 2, condition: 1, feat: 1, background: 1, species: 2, class: 1, subclass: 1, feature: 2, rule: 1 });
  const fb = entry(pack, 'spell', 'fireball').def;
  assert.deepEqual([fb.level, fb.school, fb.components, fb.damage, fb.damageType, fb.save, fb.concentration], [3, 'Evocation', 'V, S, M', '8d6', 'fire', 'dex', false]);
  assert.equal(entry(pack, 'spell', 'web').def.concentration, true);
  assert.equal(entry(pack, 'spell', 'chill-touch').def.attack, 'ranged');
  assert.equal(entry(pack, 'spell', 'chill-touch').def.damage, '1d8');
  assert.ok(entry(pack, 'weapon', 'light-crossbow'), 'crossbow-light aliased to built-in id');
  assert.equal(entry(pack, 'weapon', 'light-crossbow').def.range, '80/320');
  assert.equal(entry(pack, 'armor', 'padded').def.dexCap, null);
  assert.match(entry(pack, 'gear', 'explorers-pack').text, /10 × Torch/);
  assert.equal(entry(pack, 'magicItem', 'cloak-of-protection').def.attunement, true);
  assert.equal(entry(pack, 'magicItem', 'bag-of-holding').def.attunement, false);
  const gob = entry(pack, 'monster', 'goblin');
  assert.deepEqual([gob.def.ac, gob.def.hp, gob.def.cr, gob.def.abilities.dex, gob.meta.sub], [15, 7, 0.25, 14, 'Small humanoid (goblinoid), CR 1/4']);
  assert.match(gob.text, /\| STR \| DEX/); assert.match(gob.text, /Stealth \+6/); assert.match(gob.text, /### Actions/);
  assert.match(entry(pack, 'monster', 'aboleth').text, /### Legendary actions/);
  assert.match(entry(pack, 'species', 'hill-dwarf').text, /Dwarven Toughness[\s\S]*Dwarven Resilience/);
  assert.equal(entry(pack, 'class', 'wizard').link, 'wizard');
  assert.match(entry(pack, 'subclass', 'evocation').text, /Sculpt Spells/);
  assert.equal(entry(pack, 'feature', 'sculpt-spells').meta.subclassId, 'evocation');
  assert.doesNotMatch(entry(pack, 'rule', 'ability-checks').text, /<script/i);
  assert.match(entry(pack, 'rule', 'ability-checks').text, /\| Very easy \| 5 \|/);
});

test('Open5e converter maps the 2024 SRD with tolerant field access', () => {
  const { pack } = p521();
  const v = validatePack(pack);
  assert.equal(v.ok, true, v.errors.join(' | '));
  assert.equal(pack.manifest.ruleset, 'srd521');
  const fb = entry(pack, 'spell', 'x24-fireball');
  assert.deepEqual([fb.def.level, fb.def.save, fb.def.damage, fb.def.damageType, fb.def.components, fb.def.rulesets[0]], [3, 'dex', '8d6', 'fire', 'V, S, M', 'srd521']);
  assert.deepEqual(fb.def.classes, ['sorcerer', 'wizard']);
  assert.equal(entry(pack, 'magicItem', 'x24-rope'), undefined, 'mundane items excluded from magic items');
  assert.equal(entry(pack, 'monster', 'x24-goblin-warrior').def.cr, 0.25);
  const dw = entry(pack, 'species', 'x24-dwarf').def;
  assert.deepEqual([dw.speed, dw.darkvision, dw.size], [30, 120, 'Medium']);
  assert.deepEqual(entry(pack, 'background', 'x24-acolyte').def.skills, ['insight', 'religion']);
  assert.equal(entry(pack, 'subclass', 'x24-evoker').link, 'evocation');
  assert.equal(entry(pack, 'class', 'x24-wizard').link, 'wizard');
  assert.ok(entry(pack, 'feature', 'x24-wizard-arcane-recovery-1'));
  assert.equal(entry(pack, 'condition', 'x24-blinded').link, 'blinded');
});

test('pack validation rejects unsafe or malformed packs and degrades bad definitions to text', () => {
  const { pack } = p51();
  assert.equal(validatePack('{"format":"nope"}').ok, false);
  assert.equal(validatePack({ ...pack, manifest: { ...pack.manifest, licence: '' } }).ok, false);
  assert.equal(validatePack({ ...pack, manifest: { ...pack.manifest, id: 'Bad Id!' } }).ok, false);
  const evil = structuredClone(pack); evil.entries[0].text = 'Hi <script>alert(1)</script>';
  assert.equal(validatePack(evil).ok, false);
  const js = structuredClone(pack); js.entries[0].text = '[x](javascript:alert(1))';
  assert.equal(validatePack(js).ok, false);
  const polluted = JSON.stringify(pack).replace('"entries":[', '"__proto__":{"polluted":1},"entries":[');
  assert.equal(validatePack(polluted).ok, true); assert.equal({}.polluted, undefined);
  const bad = structuredClone(pack); bad.entries.find((e) => e.id === 'web').def.level = 12;
  const r = validatePack(bad);
  assert.equal(r.ok, true); assert.equal(r.pack.entries.find((e) => e.id === 'web').def, undefined); assert.ok(r.warnings.some((w) => w.includes('text only')));
  assert.equal(cleanText('<p>a</p><p>b &amp; c</p>'), 'a\n\nb & c');
});

test('installing packs: built-in mechanics win, new content is added, text loads on demand', async () => {
  const repo = memoryRepo();
  await installPack(repo, p51().pack); await installPack(repo, p521().pack);
  const packs = await repo.all('packs');
  const reg = buildRegistry([], packs);
  assert.equal(byId(reg.spells, 'fireball'), SPELLS.find((s) => s.id === 'fireball'), 'built-in Fireball object kept');
  assert.equal(byId(reg.spells, 'web').source.origin, 'pack');
  assert.ok(byId(reg.spells, 'x24-fireball'));
  assert.equal(byId(reg.armor, 'padded').source.origin, 'srd', 'built-in armour kept');
  assert.equal(reg.monsters.length, 3); assert.equal(reg.magicItems.length, 3);
  assert.ok(byId(reg.species, 'x24-dwarf')); assert.ok(byId(reg.backgrounds, 'x24-acolyte'));
  assert.equal(reg.compendium.length, packs.reduce((n, p) => n + p.index.length, 0));
  assert.match(await loadText(repo, 'srd51', 'spell', 'fireball'), /bright streak/);
  assert.equal(textFor(reg, 'spell', 'fireball', 'srd51')[0].packId, 'srd51');
  assert.equal(textFor(reg, 'class', 'wizard', 'srd521')[0].packId, 'srd521');
  // Same name, two rulesets
  const for51 = preferRuleset(reg.spells, 'srd51').filter((s) => s.name === 'Fireball').map((s) => s.id);
  const for521 = preferRuleset(reg.spells, 'srd521').filter((s) => s.name === 'Fireball').map((s) => s.id);
  assert.deepEqual([for51, for521], [['fireball'], ['x24-fireball']]);
  assert.deepEqual(preferRuleset(reg.spells, 'srd521', ['fireball']).filter((s) => s.name === 'Fireball').map((s) => s.id).sort(), ['fireball', 'x24-fireball']);
});

test('installing packs never changes existing characters’ calculated values', async () => {
  const base = buildRegistry();
  const chars = sampleCharacters(base).map((s) => s.character);
  const before = chars.map((c) => JSON.stringify(compute(c, base)));
  const repo = memoryRepo(); await installPack(repo, p51().pack); await installPack(repo, p521().pack);
  const withPacks = buildRegistry([], await repo.all('packs'));
  assert.deepEqual(chars.map((c) => JSON.stringify(compute(c, withPacks))), before);
});

test('disable, replace, remove, export and re-import', async () => {
  const repo = memoryRepo();
  await installPack(repo, p51().pack);
  await setPackEnabled(repo, 'srd51', false);
  assert.equal(buildRegistry([], await repo.all('packs')).compendium.length, 0);
  const again = await installPack(repo, p51().pack);
  assert.equal(again.replaced, true); assert.equal(again.record.enabled, false, 'replacing keeps the enabled setting');
  const exported = await exportPack(repo, 'srd51');
  const v = validatePack(exported);
  assert.equal(v.ok, true); assert.equal(v.pack.entries.length, p51().pack.entries.length);
  assert.deepEqual(v.pack.entries.find((e) => e.id === 'fireball').def.damage, '8d6');
  await removePack(repo, 'srd51');
  assert.equal((await repo.all('packs')).length, 0); assert.equal((await repo.all('packText')).length, 0);
  const { record, texts } = toInstalled(v.pack, 0, 'now');
  assert.equal(fromInstalled(record, texts).entries.length, v.pack.entries.length);
});

test('backups can include content packs', async () => {
  const { pack } = p51();
  const text = await buildExport('library', { characters: [], events: [], snapshots: [], custom: [], campaigns: [], records: [], encounters: [], packFiles: [pack] });
  const rep = await readExport(text);
  assert.equal(rep.ok, true); assert.equal(rep.integrity, 'verified'); assert.equal(rep.data.packFiles.length, 1);
  assert.equal(rep.data.packFiles[0].entries.length, pack.entries.length);
});

test('only src/content/net.ts may make network requests', () => {
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((f) => (f.isDirectory() ? walk(`${d}/${f.name}`) : [`${d}/${f.name}`]));
  const offenders = walk(new URL('../src', import.meta.url).pathname).filter((f) => f.endsWith('.ts') && !f.endsWith('content/net.ts') && /\bfetch\s*\(/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, []);
});

test('downloaders: 5e-database files and paginated Open5e results (network mocked)', async () => {
  const { fetch5eDatabase, fetchOpen5e } = await import('../app/js/content/net.js');
  const { FIVE_E_DB_BASE, OPEN5E_BASE } = await import('../app/js/content/sources.js');
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    const body = (() => {
      if (url.startsWith(FIVE_E_DB_BASE)) { const f = url.slice(FIVE_E_DB_BASE.length); return f === '5e-SRD-Feats.json' ? null : fx(`5edb/${f}`); }
      const u = new URL(url); const ep = u.pathname.split('/').filter(Boolean)[1];
      const all = fx(`open5e/${ep}.json`); const page = Number(u.searchParams.get('page') ?? 1);
      return { count: all.length, next: page === 1 && all.length > 1 ? `${OPEN5E_BASE}${ep}/?document__key=srd-2024&page=2` : null, results: page === 1 && all.length > 1 ? all.slice(0, 1) : all.slice(page === 1 ? 0 : 1) };
    })();
    return body === null ? { ok: false, status: 404, statusText: 'Not Found', text: async () => '' } : { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  const a = await fetch5eDatabase();
  assert.equal(a.failures.length, 1); assert.match(a.failures[0], /Feats.*404/);
  assert.equal(a.input.spells.length, 3);
  const b = await fetchOpen5e();
  assert.deepEqual(b.failures, []);
  assert.equal(b.input.spells.length, 2, 'both pages collected'); assert.equal(b.input.classes.length, 2);
  assert.ok(calls.every((u) => u.startsWith('https://raw.githubusercontent.com/') || u.startsWith('https://api.open5e.com/')));
  delete globalThis.fetch;
});

test('import script converts local source files into a published pack', async () => {
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const out = mkdtempSync(`${tmpdir()}/ledger-`);
  const script = new URL('../scripts/import-content.mjs', import.meta.url).pathname;
  execFileSync('node', [script, 'srd51', '--from', new URL('./fixtures/5edb', import.meta.url).pathname, '--out', out]);
  execFileSync('node', [script, 'srd521', '--from', new URL('./fixtures/open5e', import.meta.url).pathname, '--out', out]);
  assert.ok(existsSync(`${out}/srd51.json`) && existsSync(`${out}/srd521.json`));
  const list = JSON.parse(readFileSync(`${out}/packs.json`, 'utf8'));
  assert.deepEqual(list.map((x) => x.id), ['srd51', 'srd521']);
  assert.equal(validatePack(readFileSync(`${out}/srd51.json`, 'utf8')).ok, true);
});
