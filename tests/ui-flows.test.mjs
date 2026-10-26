// End-to-end-style UI flows on the DOM shim: assert real state changes through the actual views and dialogs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom, memoryRepo } from './support/minidom.mjs';

installDom();
const { state, DEFAULT_SETTINGS } = await import('../app/js/ui/store.js');
const { buildRegistry } = await import('../app/js/data/registry.js');
const { sampleCharacters } = await import('../app/js/data/samples.js');
const { compute } = await import('../app/js/rules/calc.js');
const wizard = await import('../app/js/ui/views/wizard.js');
const combat = await import('../app/js/ui/views/combat.js');
const prog = await import('../app/js/ui/views/progression.js');
const spells = await import('../app/js/ui/views/spells.js');

const tick = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
const host = () => document.getElementById('app');
const byText = (root, sel, re) => root.querySelectorAll(sel).find((b) => re.test(b.textContent.trim()));
const dialog = () => document.body.querySelectorAll('dialog').find((d) => d.open);
const dialogBtn = (re) => byText(dialog(), '.dialog-actions button', re);
const byAria = (root, tag, label) => root.querySelectorAll(tag).find((el) => (el.getAttribute('aria-label') ?? '').startsWith(label));
const setVal = (el, v, ev = 'input') => { el.value = v; el.dispatchEvent(new Event(ev)); el.dispatchEvent(new Event('change')); };

async function fresh() {
  Object.assign(state, { repo: memoryRepo(), settings: { ...DEFAULT_SETTINGS, onboarded: true }, custom: [], registry: buildRegistry([]), characters: [], active: null, derived: null, packs: [], ephemeral: false });
  for (const id of ['app', 'toasts', 'roll-tray', 'live', 'save-state']) if (!document.getElementById(id)) { const el = document.createElement('div'); el.id = id; document.body.append(el); }
  document.body.querySelectorAll('dialog').forEach((d) => d.remove());
}
const useSample = async (i) => { const s = sampleCharacters(state.registry)[i]; await state.repo.tx([{ store: 'characters', put: [s.character] }, { store: 'snapshots', put: s.snapshots }]); state.characters = [s.character]; state.active = s.character; state.derived = compute(s.character, state.registry, state.settings); return s.character; };

test('wizard: create a level 3 high-elf wizard through all 12 steps', async () => {
  await fresh();
  const root = await wizard.wizardView(); host().replaceChildren(root);
  const next = async () => { byText(root, 'button', /^Next/).click(); await tick(); };
  byText(root, 'label', /2014 rules/).querySelector('input').click(); await tick(); await next();
  await next(); // name missing → blocked
  assert.match(root.querySelector('.error-summary').textContent, /name is required/i);
  setVal(root.querySelector('[data-field="name"] input'), 'Ione'); setVal(root.querySelector('[data-field="startLevel"] input'), '3'); await tick(); await next();
  setVal(root.querySelector('[data-field="speciesId"] select'), 'high-elf'); await tick(); await next();
  setVal(root.querySelector('[data-field="backgroundId"] select'), 'acolyte'); await tick(); await next();
  setVal(root.querySelector('[data-field="classId"] select'), 'wizard'); await tick(); await next();
  await next(); // standard array default is valid
  for (const s of ['Arcana', 'History']) byText(root, 'label.choice', new RegExp(s)).querySelector('input').click();
  await tick(); await next(); await next();
  for (const s of ['Fire Bolt', 'Mage Hand', 'Light']) byText(root, 'label.choice', new RegExp(`^${s}`)).querySelector('input').click();
  for (const s of ['Magic Missile', 'Shield', 'Sleep']) byText(root, 'label.choice', new RegExp(`^${s}`)).querySelector('input').click();
  await tick(); await next();
  setVal(root.querySelector('[data-field="subclassId"] select'), 'evocation'); await tick(); await next(); await next();
  byText(root, 'button', /Create character/).click(); await tick(6);
  const c = state.characters.find((x) => x.name === 'Ione');
  assert.ok(c, 'character created');
  const d = compute(c, state.registry);
  assert.equal(d.totalLevel, 3); assert.equal(c.classes[0].subclassId, 'evocation');
  assert.equal(d.hpMax.value, 6 + 4 + 4 + 3 * 1); // CON 13 (+1)
  assert.ok(c.spellcasting.known.includes('magic-missile'));
  assert.equal((await state.repo.byIndex('events', 'characterId', c.id)).length, 3); // create + 2 level events
  assert.equal(await state.repo.get('drafts', 'wizard'), undefined, 'draft cleared');
});

test('combat: damage dialog applies resistance after confirmation and supports undo', async () => {
  await fresh(); const c = await useSample(0); c.defenses.resistances = ['fire'];
  const root = await combat.combatView({ id: c.id }); host().replaceChildren(root);
  byText(root, 'button', /^Damage$/).click(); await tick();
  setVal(dialog().querySelector('input'), '10'); setVal(dialog().querySelector('select'), 'fire', 'change'); await tick();
  assert.match(dialog().textContent, /Resistant: halved/);
  dialogBtn(/Apply damage/).click(); await tick(6);
  assert.equal(state.active.hp.current, c.hp.current - 5);
  const evs = await state.repo.byIndex('events', 'characterId', c.id);
  const hpEv = evs.find((e) => e.category === 'hp');
  assert.ok(hpEv && hpEv.reversible);
  const { undo } = await import('../app/js/ui/store.js');
  await undo(hpEv); await tick();
  assert.equal(state.active.hp.current, c.hp.current);
});

test('level up: confirm creates a snapshot and can be reversed from the timeline', async () => {
  await fresh(); const c = await useSample(0);
  const root = await prog.levelUpView({ id: c.id }); host().replaceChildren(root);
  byText(root, 'button', /Confirm level 2/).click(); await tick();
  dialogBtn(/Level up/).click(); await tick(8);
  assert.equal(compute(state.active, state.registry).totalLevel, 2);
  assert.equal((await state.repo.all('snapshots')).length, 1);
  const tl = await prog.timelineView({ id: c.id }); host().replaceChildren(tl);
  byText(tl, 'button', /Reverse level 2/).click(); await tick();
  dialogBtn(/Reverse/).click(); await tick(8);
  assert.equal(compute(state.active, state.registry).totalLevel, 1);
});

test('spells: casting uses the chosen slot and sets concentration', async () => {
  await fresh(); const c = await useSample(1); // cleric 5 with slots used [1,1]
  const s = state.registry.spells.find((x) => x.id === 'bless');
  spells.castDialog(c, s); await tick();
  dialogBtn(/^Cast$/).click(); await tick(8);
  assert.equal(state.active.spellcasting.slotsUsed[0], 2);
  assert.equal(state.active.concentration?.name, 'Bless');
});

test('rests: long rest restores HP, slots and reduces exhaustion', async () => {
  await fresh(); const c = await useSample(1); c.hp.current = 3; c.exhaustion = 2; state.derived = compute(c, state.registry);
  combat.longRestDialog(c); await tick();
  dialogBtn(/Take long rest/).click(); await tick(6);
  assert.equal(state.active.hp.current, state.derived.hpMax.value);
  assert.deepEqual(state.active.spellcasting.slotsUsed, []); assert.equal(state.active.exhaustion, 1);
});

test('compendium: read entries, learn a pack spell, add a magic item and add monsters to combat', async () => {
  await fresh(); const c = await useSample(2);
  const { convert5eDatabase } = await import('../app/js/content/convert-5edb.js');
  const { installPack } = await import('../app/js/content/service.js');
  const { FIVE_E_DB_FILES } = await import('../app/js/content/sources.js');
  const { readFileSync } = await import('node:fs');
  const input = Object.fromEntries(Object.entries(FIVE_E_DB_FILES).map(([k, f]) => [k, JSON.parse(readFileSync(new URL(`./fixtures/5edb/${f}`, import.meta.url), 'utf8'))]));
  await installPack(state.repo, convert5eDatabase(input, 'test').pack);
  const { reloadContent } = await import('../app/js/ui/store.js'); await reloadContent();
  const comp = await import('../app/js/ui/views/compendium.js');

  const list = comp.compendiumView({ kind: 'monster' }); host().replaceChildren(list);
  assert.match(list.textContent, /Goblin/); assert.match(list.textContent, /2 results/);

  const rule = await comp.compendiumEntryView({ kind: 'rule', packId: 'srd51', id: 'ability-checks' });
  assert.ok(rule.querySelector('table'), 'Markdown table rendered'); assert.match(rule.textContent, /Very easy/);

  const sp = await comp.compendiumEntryView({ kind: 'spell', packId: 'srd51', id: 'web' }); host().replaceChildren(sp);
  byText(sp, 'button', /^Learn/).click(); await tick(6);
  assert.ok(state.active.spellcasting.known.includes('web'));

  const it = await comp.compendiumEntryView({ kind: 'magicItem', packId: 'srd51', id: 'cloak-of-protection' }); host().replaceChildren(it);
  byText(it, 'button', /Add to/).click(); await tick(6);
  const cloak = state.active.inventory.find((i) => i.name === 'Cloak of Protection');
  assert.ok(cloak); assert.equal(cloak.requiresAttunement, true); assert.equal(cloak.category, 'magic');

  const mo = await comp.compendiumEntryView({ kind: 'monster', packId: 'srd51', id: 'goblin' }); host().replaceChildren(mo);
  byText(mo, 'button', /Add to encounter/).click(); await tick();
  setVal(dialog().querySelector('input'), '3'); dialogBtn(/^Add$/).click(); await tick(6);
  const enc = (await state.repo.all('encounters'))[0];
  assert.deepEqual(enc.participants.map((p) => p.name), ['Goblin 1', 'Goblin 2', 'Goblin 3']);
  assert.ok(enc.participants.every((p) => p.ac === 15 && p.hp === 7 && p.disposition === 'hostile'));

  const spells = await import('../app/js/ui/views/spells.js');
  const book = spells.spellsView({ id: c.id }); host().replaceChildren(book);
  assert.ok(book.querySelectorAll('a').some((a) => /Full text/.test(a.textContent) && a.getAttribute('href').includes('/compendium/spell/srd51/')), 'spellbook links to full text');
});

test('My content: build a class with the structured form (copying Fighter), then create a character with it', async () => {
  await fresh();
  const content = await import('../app/js/ui/views/content.js');
  const { compute: comp } = await import('../app/js/rules/calc.js');
  const root = await content.contentEditView({ cat: 'class' }); host().replaceChildren(root);
  setVal(root.querySelector('[data-field="name"] input'), 'Duelist');
  const copy = root.querySelectorAll('select').find((s) => s.getAttribute('aria-label') === 'Start from a copy of');
  setVal(copy, 'fighter', 'change'); byText(root, 'button', /^Copy$/).click(); await tick();
  dialogBtn(/^Copy$/).click(); await tick(4); // confirm replacing the details (the name was already typed)
  setVal(root.querySelector('[data-field="data.hitDie"] select'), '8', 'change');
  byText(root, 'button', /^\+ Add feature$/).click(); await tick();
  const rows = root.querySelectorAll('.frow-list li'); const last = rows[rows.length - 1];
  setVal(byAria(last, 'input', 'Name of feature'), 'Riposte');
  setVal(byAria(last, 'input', 'Level for feature'), '2', 'change'); await tick();
  const row = root.querySelectorAll('.frow-list li').find((li) => byAria(li, 'input', 'Name of feature')?.value === 'Riposte');
  setVal(row.querySelector('select'), 'ac', 'change');
  root.querySelector('form').dispatchEvent(new Event('submit')); await tick(6);
  const saved = state.custom.find((x) => x.name === 'Duelist');
  assert.ok(saved, 'class saved'); assert.equal(saved.category, 'class'); assert.equal(saved.data.hitDie, 8);
  assert.ok(saved.data.features.some((f) => f.name === 'Second Wind'), 'copied Fighter features');
  assert.deepEqual(saved.data.features.find((f) => f.name === 'Riposte').modifiers[0], { target: 'ac', op: 'add', value: 1, note: 'Riposte' });
  assert.ok(state.registry.classes.some((c) => c.id === saved.id), 'playable immediately');
  const { blankDraft, buildCharacter } = await import('../app/js/rules/factory.js');
  const d = blankDraft('srd51');
  Object.assign(d, { name: 'Vale', speciesId: 'human', backgroundId: 'acolyte', classId: saved.id, startLevel: 2, abilityMethod: 'manual', base: { str: 15, dex: 14, con: 12, int: 10, wis: 10, cha: 10 }, classSkills: saved.data.skillChoices.from.slice(0, 2) });
  const ch = buildCharacter(d, state.registry).character;
  const der = comp(ch, state.registry);
  assert.equal(der.hpMax.value, 8 + 5 + 2 * 1, 'd8 hit die; CON 13 (+1) with the human bonus');
  assert.equal(der.ac.value, 16 + 2 + 1, 'chain mail + shield + Riposte');
  assert.ok(der.resources.some((r) => r.name === 'Action Surge' && r.id.startsWith(saved.id)), 'copied resources work, with their own ids');
});

test('Features screen: add a class feature with a bonus and limited uses, edit it, remove it', async () => {
  await fresh(); const c = await useSample(0);
  const prog = await import('../app/js/ui/views/progression.js');
  const { compute: comp } = await import('../app/js/rules/calc.js');
  const ac0 = comp(state.active, state.registry).ac.value;
  let root = prog.featuresView({ id: c.id }); host().replaceChildren(root);
  byText(root, 'button', /^\+ Class feature$/).click(); await tick();
  const dlg = dialog();
  dialogBtn(/Add to sheet/).click(); await tick(3);
  assert.match(dlg.querySelector('.error-summary').textContent, /name is required/i, 'validation blocks empty name');
  setVal(dlg.querySelector('[data-field="name"] input'), 'Defensive Duelist');
  setVal(byAria(dlg, 'select', 'Bonus applies to'), 'ac', 'change'); setVal(byAria(dlg, 'input', 'Amount'), '2');
  byText(dlg, 'button', /^Add bonus$/).click(); await tick();
  byText(dlg, 'button', /^Add limited uses$/).click(); await tick();
  setVal(byAria(dlg, 'select', 'How many uses'), 'abilityMod:dex', 'change'); await tick();
  dialogBtn(/Add to sheet/).click(); await tick(8);
  const f = state.active.features.find((x) => x.name === 'Defensive Duelist');
  assert.ok(f); assert.equal(f.kind, 'class'); assert.equal(f.classId, 'fighter'); assert.equal(f.source, 'Fighter 1');
  const d1 = comp(state.active, state.registry);
  assert.equal(d1.ac.value, ac0 + 2); assert.equal(d1.resources.find((r) => r.id === f.resourceId).max, 1, 'Dex 13 → +1');

  root = prog.featuresView({ id: c.id }); host().replaceChildren(root);
  assert.ok(root.querySelectorAll('.feature-group h3').some((x) => x.textContent === 'Class: Fighter'));
  const li = root.querySelectorAll('.feature-list li').find((x) => /Defensive Duelist/.test(x.textContent));
  byText(li, 'button', /^Edit$/).click(); await tick();
  assert.equal(dialog().querySelector('[data-field="name"] input').value, 'Defensive Duelist', 'edit dialog prefilled');
  dialogBtn(/Save changes/).click(); await tick(8);
  assert.equal(comp(state.active, state.registry).ac.value, ac0 + 2, 'unchanged after re-save');

  root = prog.featuresView({ id: c.id }); host().replaceChildren(root);
  const li2 = root.querySelectorAll('.feature-list li').find((x) => /Defensive Duelist/.test(x.textContent));
  byText(li2, 'button', /^Remove$/).click(); await tick(); dialogBtn(/^Remove$/).click(); await tick(8);
  assert.ok(!state.active.features.some((x) => x.name === 'Defensive Duelist'));
  assert.equal(comp(state.active, state.registry).ac.value, ac0); assert.ok(!state.active.resources.some((r) => r.id === f.resourceId));
});

test('packs published with the app install automatically once, and removed packs stay removed', async () => {
  await fresh();
  const { convert5eDatabase } = await import('../app/js/content/convert-5edb.js');
  const { FIVE_E_DB_FILES } = await import('../app/js/content/sources.js');
  const { readFileSync } = await import('node:fs');
  const input = Object.fromEntries(Object.entries(FIVE_E_DB_FILES).map(([k, f]) => [k, JSON.parse(readFileSync(new URL(`./fixtures/5edb/${f}`, import.meta.url), 'utf8'))]));
  const pack = convert5eDatabase(input, '2026-10-24').pack;
  const served = { 'content/packs.json': JSON.stringify([{ id: 'srd51', file: 'srd51.json', title: pack.manifest.title, version: '2026-10-24' }]), 'content/srd51.json': JSON.stringify(pack) };
  globalThis.fetch = async (url) => (served[url] ? { ok: true, status: 200, text: async () => served[url] } : { ok: false, status: 404, statusText: 'Not Found', text: async () => '' });
  const prev = globalThis.location.protocol; globalThis.location.protocol = 'https:';
  try {
    const packs = await import('../app/js/ui/views/packs.js');
    const { saveSettings } = await import('../app/js/ui/store.js');
    assert.deepEqual(await packs.autoInstallBundled(), ['SRD 5.1']);
    assert.ok(state.registry.compendium.length > 0);
    assert.deepEqual(await packs.autoInstallBundled(), [], 'not reinstalled when up to date');
    const { removePack } = await import('../app/js/content/service.js');
    await removePack(state.repo, 'srd51'); await saveSettings({ removedPacks: ['srd51'] });
    assert.deepEqual(await packs.autoInstallBundled(), [], 'user removal respected');
  } finally { globalThis.location.protocol = prev; delete globalThis.fetch; }
});
