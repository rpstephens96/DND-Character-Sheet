// UI smoke test: renders every route with sample data and clicks every visible button/link/checkbox,
// failing on any thrown error or unhandled rejection. Uses a minimal DOM shim (tests/support/minidom.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom, memoryRepo } from './support/minidom.mjs';

installDom();
const errors = [];
process.on('unhandledRejection', (e) => errors.push(e));
const { state, DEFAULT_SETTINGS } = await import('../app/js/ui/store.js');
const { buildRegistry } = await import('../app/js/data/registry.js');
const { sampleCharacters, sampleCampaign } = await import('../app/js/data/samples.js');
const { compute } = await import('../app/js/rules/calc.js');
const { convert5eDatabase } = await import('../app/js/content/convert-5edb.js');
const { convertOpen5e } = await import('../app/js/content/convert-open5e.js');
const { installPack } = await import('../app/js/content/service.js');
const { FIVE_E_DB_FILES, OPEN5E_ENDPOINTS } = await import('../app/js/content/sources.js');
const { readFileSync } = await import('node:fs');
const fx = (p) => JSON.parse(readFileSync(new URL(`./fixtures/${p}`, import.meta.url), 'utf8'));
globalThis.fetch = async () => { throw new Error('offline (test)'); };
const views = {
  packs: await import('../app/js/ui/views/packs.js'), compendium: await import('../app/js/ui/views/compendium.js'),
  library: await import('../app/js/ui/views/library.js'), wizard: await import('../app/js/ui/views/wizard.js'), character: await import('../app/js/ui/views/character.js'),
  progression: await import('../app/js/ui/views/progression.js'), combat: await import('../app/js/ui/views/combat.js'), spells: await import('../app/js/ui/views/spells.js'),
  inventory: await import('../app/js/ui/views/inventory.js'), campaign: await import('../app/js/ui/views/campaign.js'), content: await import('../app/js/ui/views/content.js'), data: await import('../app/js/ui/views/data.js'),
};

async function setup() {
  const repo = memoryRepo();
  Object.assign(state, { repo, settings: { ...DEFAULT_SETTINGS, onboarded: false }, custom: [], registry: buildRegistry([]), characters: [], active: null, derived: null, persisted: false, packs: [], ephemeral: false });
  await installPack(repo, convert5eDatabase(Object.fromEntries(Object.entries(FIVE_E_DB_FILES).map(([k, f]) => [k, fx(`5edb/${f}`)])), 'test').pack);
  await installPack(repo, convertOpen5e(Object.fromEntries(Object.entries(OPEN5E_ENDPOINTS).map(([k, e]) => [k, fx(`open5e/${e}.json`)])), 'test').pack);
  state.packs = await repo.all('packs'); state.registry = buildRegistry([], state.packs);
  const samples = sampleCharacters(state.registry);
  const { campaign, records } = sampleCampaign(samples[0].character.id);
  samples[0].character.campaignId = campaign.id;
  await repo.tx([{ store: 'characters', put: samples.map((s) => s.character) }, { store: 'events', put: samples.flatMap((s) => s.events) }, { store: 'snapshots', put: samples.flatMap((s) => s.snapshots) }, { store: 'campaigns', put: [campaign] }, { store: 'records', put: records }]);
  state.characters = samples.map((s) => s.character);
  state.active = state.characters[2]; state.derived = compute(state.active, state.registry, state.settings);
  for (const id of ['app', 'toasts', 'roll-tray', 'live', 'save-state']) { const el = document.createElement('div'); el.id = id; document.body.append(el); }
  return { campaign, records, samples };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
async function exercise(name, render) {
  const host = document.getElementById('app');
  const el = await render(); host.replaceChildren(el);
  const controls = el.querySelectorAll('button, a, input[type="checkbox"], input[type="radio"]').length;
  let clicked = 0;
  for (let i = 0; i < controls; i++) {
    const fresh = await render(); host.replaceChildren(fresh);
    const ctl = fresh.querySelectorAll('button, a, input[type="checkbox"], input[type="radio"]')[i];
    if (!ctl || /Delete|Remove|Reverse|Replace|Clear/i.test(ctl.textContent)) continue;
    try { ctl.click(); clicked++; await tick(); await tick();
      // Exercise the primary action of any dialog that opened, then close all dialogs.
      for (const d of document.body.querySelectorAll('dialog')) { const acts = d.querySelectorAll('.dialog-actions button'); const last = acts[acts.length - 1]; if (last && !/Delete|Replace/i.test(last.textContent)) { last.click(); await tick(); await tick(); } d.remove(); }
    } catch (e) { errors.push(new Error(`${name}: “${ctl.textContent.trim()}”: ${e.message}`)); }
  }
  return { controls, clicked };
}

test('every screen renders and every control runs without errors', async () => {
  const { campaign, records } = await setup();
  const c = () => state.active; const id = () => state.active.id;
  const routes = [
    ['library', () => views.library.libraryView()], ['wizard', () => views.wizard.wizardView()],
    ['dashboard', () => views.character.dashboardView({ id: id() })], ['sheet', () => views.character.sheetView({ id: id() })],
    ['features', () => views.progression.featuresView({ id: id() })], ['levelup', () => views.progression.levelUpView({ id: id() })],
    ['timeline', () => views.progression.timelineView({ id: id() })], ['audit', () => views.progression.auditView({ id: id() })],
    ['combat', () => views.combat.combatView({ id: id() })], ['initiative', () => views.combat.initiativeView()], ['dice', () => views.combat.diceView()],
    ['spells', () => views.spells.spellsView({ id: id() })], ['inventory', () => views.inventory.inventoryView({ id: id() })],
    ['campaigns', () => views.campaign.campaignsView()], ['campaign', () => views.campaign.campaignView({ id: campaign.id })], ['campaign-sessions', () => views.campaign.campaignView({ id: campaign.id, tab: 'session' })],
    ['record', () => views.campaign.recordView({ id: records[4].id })], ['content', () => views.content.contentView()], ['content-new', () => views.content.contentEditView({ cat: 'magicItem' })],
    ['content-class', () => views.content.contentEditView({ cat: 'class' })], ['content-subclass', () => views.content.contentEditView({ cat: 'subclass' })], ['content-species', () => views.content.contentEditView({ cat: 'species' })], ['content-background', () => views.content.contentEditView({ cat: 'background' })], ['content-feat', () => views.content.contentEditView({ cat: 'feat' })], ['data', () => views.data.dataView()], ['settings', () => views.data.settingsView()], ['about', () => views.data.aboutView()],
    ['more', () => views.data.moreView()],
    ['compendium', () => views.compendium.compendiumView({})], ['compendium-monsters', () => views.compendium.compendiumView({ kind: 'monster' })], ['compendium-items', () => views.compendium.compendiumView({ kind: 'magicItem' })],
    ['entry-spell', () => views.compendium.compendiumEntryView({ kind: 'spell', packId: 'srd51', id: 'web' })], ['entry-monster', () => views.compendium.compendiumEntryView({ kind: 'monster', packId: 'srd51', id: 'goblin' })],
    ['entry-item', () => views.compendium.compendiumEntryView({ kind: 'magicItem', packId: 'srd51', id: 'cloak-of-protection' })], ['entry-class', () => views.compendium.compendiumEntryView({ kind: 'class', packId: 'srd51', id: 'wizard' })],
    ['entry-rule', () => views.compendium.compendiumEntryView({ kind: 'rule', packId: 'srd51', id: 'ability-checks' })], ['entry-gear', () => views.compendium.compendiumEntryView({ kind: 'gear', packId: 'srd51', id: 'explorers-pack' })], ['print', () => views.data.printView({ id: id() })], ['packs', () => views.packs.packsView()],
  ];
  let total = 0;
  for (const [name, r] of routes) {
    for (const ch of [2, 1, 0]) { // multiclass caster, prepared caster, martial
      state.active = state.characters[ch] ?? state.active; state.derived = compute(state.active, state.registry, state.settings);
      const res = await exercise(`${name}[${c().name}]`, r); total += res.clicked;
      if (!['dashboard', 'combat', 'spells', 'inventory', 'features', 'levelup', 'sheet', 'entry-spell'].includes(name)) break;
    }
  }
  await tick();
  if (errors.length) console.error(errors.slice(0, 15).map((e) => e.stack ?? e).join('\n\n'));
  assert.equal(errors.length, 0, `${errors.length} errors`);
  assert.ok(total > 300, `clicked ${total} controls`);
  const evs = await state.repo.all('events');
  assert.ok(evs.length > 10, 'actions produced audit events');
});
