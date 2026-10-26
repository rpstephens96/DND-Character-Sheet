// Import / export / backup, settings, about & licences, "More" menu and printable sheet.
import type { Character, CharacterEvent, LevelSnapshot, CustomContent, Campaign, CampaignRecord, Encounter } from '../../types.js';
import { ABILITIES } from '../../types.js';
import { h, btn, card, field, select, num, modal, toast, confirmDialog, download, readFile, link, sign } from '../dom.js';
import { state, saveSettings, notify, reloadCustom, setActive } from '../store.js';
import { pageHeader, classLine } from '../components.js';
import { buildExport, readExport, characterSummaryText, type ImportReport } from '../../io/importExport.js';
import { compute, ABILITY_NAMES, cap } from '../../rules/calc.js';
import { byId } from '../../data/registry.js';
import { uid, nowIso } from '../../rules/events.js';
import { APP_CONFIG } from '../../config.js';
import { NoSync } from '../../db/sync.js';
import { exportPack, installPack } from '../../content/service.js';
import type { PackFile } from '../../content/types.js';

async function libraryData(includePacks = false): Promise<Parameters<typeof buildExport>[1]> {
  const packFiles = includePacks ? await Promise.all(state.packs.map(async (p) => JSON.parse(await exportPack(state.repo, p.id)) as PackFile)) : undefined;
  const [characters, events, snapshots, custom, campaigns, records, encounters] = await Promise.all([state.repo.all<Character>('characters'), state.repo.all<CharacterEvent>('events'), state.repo.all<LevelSnapshot>('snapshots'), state.repo.all<CustomContent>('custom'), state.repo.all<Campaign>('campaigns'), state.repo.all<CampaignRecord>('records'), state.repo.all<Encounter>('encounters')]);
  return { characters, events, snapshots, custom, campaigns, records, encounters, settings: state.settings, ...(packFiles ? { packFiles } : {}) };
}

export async function exportCharacter(c: Character): Promise<void> {
  const [events, snapshots] = await Promise.all([state.repo.byIndex<CharacterEvent>('events', 'characterId', c.id), state.repo.byIndex<LevelSnapshot>('snapshots', 'characterId', c.id)]);
  const deps = state.custom.filter((x) => c.grants.includes(x.id) || c.classes.some((k) => k.classId === x.id || k.subclassId === x.id) || c.speciesId === x.id || c.backgroundId === x.id || c.feats.includes(x.id) || [...c.spellcasting.known, ...c.spellcasting.prepared].includes(x.id) || c.inventory.some((i) => i.weaponId === x.id || i.armorId === x.id));
  const campaigns = c.campaignId ? [await state.repo.get<Campaign>('campaigns', c.campaignId)].filter((x): x is Campaign => !!x) : [];
  download(`${c.name.replace(/[^\w-]+/g, '_')}.ledger.json`, await buildExport('character', { characters: [c], events, snapshots, custom: deps, campaigns, records: [], encounters: [] }));
  toast(`Exported ${c.name}${deps.length ? ` with ${deps.length} custom content dependencies` : ''}.`);
}

export function summaryText(c: Character): string {
  const d = compute(c, state.registry, state.settings);
  const sp = byId(state.registry.species, c.speciesId); const bg = byId(state.registry.backgrounds, c.backgroundId);
  return characterSummaryText([
    ['', `${c.name}${c.playerName ? ` (played by ${c.playerName})` : ''}`], ['', `Level ${d.totalLevel} ${sp?.name ?? ''} ${classLine(c)} · ${bg?.name ?? ''} · ${c.alignment}`], ['', ''],
    ['HP', `${c.hp.current}/${d.hpMax.value}${c.hp.temp ? ` (+${c.hp.temp} temp)` : ''}`], ['AC', String(d.ac.value)], ['Initiative', sign(d.initiative.value)], ['Speed', `${d.speed.value} ft`], ['Proficiency bonus', sign(d.pb.value)],
    ['Abilities', ABILITIES.map((a) => `${a.toUpperCase()} ${d.abilities[a].value} (${sign(d.mods[a])})`).join(', ')],
    ['Saves', ABILITIES.map((a) => `${a.toUpperCase()} ${sign(d.saves[a].value)}${d.saves[a].proficient ? '*' : ''}`).join(', ')],
    ['Skills', Object.entries(d.skills).filter(([, s]) => s.proficient).map(([k, s]) => `${cap(k)} ${sign(s.value)}${s.expertise ? ' (exp)' : ''}`).join(', ')],
    ['Passive Perception', String(d.passives.perception.value)],
    ['Attacks', d.attacks.map((a) => `${a.name} ${a.attack ? sign(a.attack.value) : a.saveDC ? `DC ${a.saveDC}` : ''} ${a.damage} ${a.damageType}`).join('; ') || '—'],
    ...d.spellProfiles.map((p) => [`${p.className} spells`, `DC ${p.dc.value}, attack ${sign(p.attack.value)}`] as [string, string]),
    ['Spell slots', d.slots.map((s) => `L${s.level} ${s.max - s.used}/${s.max}`).join(', ') + (d.pact.count ? `; pact ${d.pact.count - d.pact.used}/${d.pact.count} at L${d.pact.level}` : '') || '—'],
    ['Known spells', c.spellcasting.known.map((id) => byId(state.registry.spells, id)?.name ?? id).join(', ') || '—'],
    ['Features', c.features.map((f) => f.name).join(', ')], ['Equipment', c.inventory.map((i) => `${i.name}${i.quantity !== 1 ? ` ×${i.quantity}` : ''}`).join(', ')],
    ['Coins', Object.entries(c.currency).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(', ') || '—'],
    ['', ''], ['', `Exported from ${APP_CONFIG.name} on ${new Date().toLocaleDateString()}. Includes SRD content (CC BY 4.0, Wizards of the Coast).`]]);
}

export function importReportDialog(rep: ImportReport): void {
  const existingIds = new Set(state.characters.map((c) => c.id));
  const dups = rep.data.characters.filter((c) => existingIds.has(c.id));
  const mode = select([{ value: 'copy', label: 'Keep both (import duplicates as copies)' }, { value: 'replace', label: 'Replace existing characters with the same id' }, { value: 'skip', label: 'Skip characters that already exist' }], 'copy');
  const counts = Object.entries(rep.data).filter(([, v]) => Array.isArray(v) && v.length).map(([k, v]) => `${(v as unknown[]).length} ${k}`).join(', ');
  modal('Import report', h('div', null,
    h('p', null, counts ? `Found: ${counts}.` : 'Nothing importable was found.'),
    h('p', { class: `notice ${rep.integrity === 'verified' ? 'notice-ok' : rep.integrity === 'mismatch' ? 'notice-warn' : ''}` }, rep.integrity === 'verified' ? 'Integrity verified (SHA-256).' : rep.integrity === 'mismatch' ? 'Integrity check FAILED: the file was modified after export.' : 'No integrity data in this file.'),
    rep.errors.length ? h('div', { class: 'notice notice-warn' }, h('strong', null, `${rep.errors.length} problem(s); affected records are skipped:`), h('ul', null, rep.errors.slice(0, 20).map((e) => h('li', null, e)))) : null,
    rep.warnings.length ? h('details', null, h('summary', null, `${rep.warnings.length} warning(s)`), h('ul', null, rep.warnings.slice(0, 40).map((e) => h('li', null, e)))) : null,
    dups.length ? field(`${dups.length} character(s) already exist`, mode) : null,
    h('p', { class: 'hint' }, 'Nothing in your current library is deleted by this import.')),
    [{ label: 'Cancel', cls: 'btn btn-ghost' }, { label: 'Import', cls: 'btn btn-primary', run: async () => {
      if (!counts) return true;
      const chars: Character[] = []; const idMap = new Map<string, string>();
      for (const c of rep.data.characters) {
        if (existingIds.has(c.id)) { if (mode.value === 'skip') continue; if (mode.value === 'copy') { const nid = uid(); idMap.set(c.id, nid); chars.push({ ...c, id: nid, name: `${c.name} (imported)` }); continue; } }
        chars.push(c);
      }
      const remap = <T extends { characterId: string; id: string }>(l: T[]) => l.filter((e) => !existingIds.has(e.characterId) || mode.value !== 'skip').map((e) => (idMap.has(e.characterId) ? { ...e, id: uid(), characterId: idMap.get(e.characterId)! } : e));
      const importEvents: CharacterEvent[] = chars.map((c) => ({ id: uid(), characterId: c.id, ts: nowIso(), category: 'import', description: `Imported from file (integrity: ${rep.integrity})`, before: null, after: null, reversible: false, undone: false }));
      const existingCustom = new Map(state.custom.map((x) => [x.id, x]));
      const custom = rep.data.custom.filter((x) => !existingCustom.has(x.id) || x.version >= existingCustom.get(x.id)!.version);
      try {
        await state.repo.tx([{ store: 'characters', put: chars }, { store: 'events', put: [...remap(rep.data.events), ...importEvents] }, { store: 'snapshots', put: remap(rep.data.snapshots) }, { store: 'custom', put: custom },
          { store: 'campaigns', put: rep.data.campaigns }, { store: 'records', put: rep.data.records }, { store: 'encounters', put: rep.data.encounters }]);
      } catch (e) { toast(`Import failed; nothing was changed. ${(e as Error).message}`, 'error'); return false; }
      for (const pf of rep.data.packFiles ?? []) { const ex = state.packs.find((p) => p.id === pf.manifest.id); if (!ex || ex.manifest.version <= pf.manifest.version) await installPack(state.repo, pf); }
      state.characters = await state.repo.all<Character>('characters'); await reloadCustom();
      toast(`Imported ${chars.length} character(s), ${custom.length} content entries.`); notify();
      return true;
    } }], { wide: true });
}

export function dataView(): HTMLElement {
  const c = state.active;
  const includePacks = h('input', { type: 'checkbox', checked: state.packs.some((p) => !['srd51', 'srd521'].includes(p.id)) });
  const packsBox = state.packs.length ? h('label', { class: 'check' }, includePacks, ` Include content packs (${state.packs.map((p) => p.manifest.shortName).join(', ')}). Makes the file larger; SRD packs can be re-downloaded instead. Always include private packs.`) : null;
  return h('div', { class: 'page' }, pageHeader('Backup, import & export', 'Your data lives only in this browser'),
    h('div', { class: 'notice notice-warn' }, h('strong', null, 'Back up regularly. '), 'Clearing site data, private browsing, or uninstalling the app deletes your characters. Browser storage is not encrypted. ', state.persisted ? 'Persistent storage has been granted.' : 'This browser has not granted persistent storage, so data could be evicted under storage pressure.'),
    card('Full library', h('p', null, 'Every character, history, level snapshot, campaign, encounter, custom content and setting.'), packsBox, h('div', { class: 'row wrap' },
      btn('Download full backup', async () => { download(`ledger-backup-${nowIso().slice(0, 10)}.json`, await buildExport('library', await libraryData(includePacks.checked))); await saveSettings({}); toast('Backup downloaded.'); }, 'btn btn-primary'),
      btn('Restore or merge a backup…', async () => { const t = await readFile('.json,application/json'); if (!t) return; try { importReportDialog(await readExport(t)); } catch (e) { toast((e as Error).message, 'error'); } }, 'btn'),
      btn('Replace everything with a backup…', () => void replaceAll(), 'btn btn-ghost danger-text'))),
    c ? card(`Current character: ${c.name}`, h('div', { class: 'row wrap' }, btn('Export character (JSON)', () => void exportCharacter(c), 'btn'), btn('Download text summary', () => download(`${c.name.replace(/[^\w-]+/g, '_')}.txt`, summaryText(c), 'text/plain'), 'btn'),
      btn('Copy summary', async () => { try { await navigator.clipboard.writeText(summaryText(c)); toast('Summary copied.'); } catch { toast('Clipboard unavailable; use Download instead.', 'warn'); } }, 'btn btn-ghost'), link(`#/print/${c.id}`, 'Printable sheet', 'btn btn-ghost'))) : card('Character export', h('p', { class: 'hint' }, 'Select a character from the library to export it.')),
    card('Moving to another device', h('ol', null, h('li', null, 'Download a full backup here.'), h('li', null, 'Send the file to the other device (email, cloud drive, AirDrop).'), h('li', null, 'Open the app there, go to More → Backup, and choose Restore or merge.'))),
    card('Sync', h('p', null, `Sync adapter: ${NoSync.name}. Cloud sync is not part of this release; the data layer is ready for an encrypted sync adapter (see docs/SYNC.md).`)));
}

async function replaceAll(): Promise<void> {
  const t = await readFile('.json,application/json'); if (!t) return;
  let rep: ImportReport; try { rep = await readExport(t); } catch (e) { return toast((e as Error).message, 'error'); }
  if (!rep.data.characters.length && !rep.data.custom.length) return toast('That file contains nothing to restore.', 'error');
  const ok = await confirmDialog('Replace your entire library?', h('div', null, h('p', null, `Your current ${state.characters.length} characters and all other data will be deleted and replaced by the ${rep.data.characters.length} characters in this backup.`),
    rep.errors.length ? h('p', { class: 'notice notice-warn' }, `${rep.errors.length} records in the backup are invalid and will be skipped.`) : null, rep.integrity === 'mismatch' ? h('p', { class: 'notice notice-warn' }, 'The backup failed its integrity check.') : null, h('p', null, 'Download a backup of your current library first if you are unsure.')), 'Replace everything', true);
  if (!ok) return;
  const stores = ['characters', 'events', 'snapshots', 'custom', 'campaigns', 'records', 'encounters'] as const;
  try {
    await state.repo.tx(stores.map((s) => ({ store: s, clear: true, put: rep.data[s] as unknown[] })));
    if (rep.data.packFiles?.length) { await state.repo.tx([{ store: 'packs', clear: true }, { store: 'packText', clear: true }]); for (const pf of rep.data.packFiles) await installPack(state.repo, pf); }
    state.characters = await state.repo.all<Character>('characters'); setActive(null); await reloadCustom(); toast('Library restored.'); location.hash = '/';
  } catch (e) { toast(`Restore failed; your data was not changed. ${(e as Error).message}`, 'error'); }
}

export function settingsView(): HTMLElement {
  const s = state.settings;
  const sel = (label: string, key: keyof typeof s, opts: [string, string][], hint?: string) => field(label, select(opts.map(([v, l]) => ({ value: v, label: l })), String(s[key]), { on: { change: (e) => void saveSettings({ [key]: (e.target as HTMLSelectElement).value } as Partial<typeof s>).then(() => toast('Saved.')) } }), { hint });
  const chk = (label: string, key: 'encumbranceVariant' | 'reduceMotion', hint?: string) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s[key], on: { change: (e) => void saveSettings({ [key]: (e.target as HTMLInputElement).checked }).then(() => toast('Saved.')) } }), ` ${label}`, hint ? h('small', { class: 'hint' }, ` ${hint}`) : null);
  return h('div', { class: 'page' }, pageHeader('Settings'),
    card('Appearance', sel('Theme', 'theme', [['system', 'Match device'], ['light', 'Parchment (light)'], ['dark', 'Leather & candlelight (dark)']]), chk('Reduce motion', 'reduceMotion')),
    card('Rules', sel('Default ruleset for new characters', 'defaultRuleset', [['srd51', '2014 (SRD 5.1)'], ['srd521', '2024 (SRD 5.2.1)'], ['custom', 'Custom']]),
      sel('Hit points on level up', 'hpOnLevel', [['fixed', 'Fixed average'], ['roll', 'Roll'], ['manual', 'Manual entry']]),
      chk('Variant encumbrance', 'encumbranceVariant', '(speed penalties above 5× and 10× Strength)'),
      field('Coins per pound (0 = coins weightless)', num(s.coinWeight, { min: 0, on: { change: (e) => void saveSettings({ coinWeight: Math.max(0, Number((e.target as HTMLInputElement).value) || 0) }).then(() => toast('Saved.')) } })),
      field('Attunement limit', num(s.attunementLimit, { min: 0, max: 10, on: { change: (e) => void saveSettings({ attunementLimit: Math.max(0, Number((e.target as HTMLInputElement).value) || 0) }).then(() => toast('Saved.')) } }), { hint: 'Default 3. Changing this is a table ruling.' })),
    card('Introduction', btn('Show the welcome guide again', () => void saveSettings({ onboarded: false }).then(() => (location.hash = '/')), 'btn btn-ghost')));
}

export function aboutView(): HTMLElement {
  return h('div', { class: 'page' }, pageHeader(`About ${APP_CONFIG.name}`, `Version ${APP_CONFIG.version} · data schema ${APP_CONFIG.schemaVersion}`),
    card('What is included', h('p', null, 'This app includes game mechanics from the System Reference Document 5.1 (SRD 5.1) only: the twelve SRD classes with one subclass each, nine species, one background, one feat, SRD weapons, armour and conditions, and a starter set of SRD spells. Rules summaries are paraphrased. The 2024 rules option changes core rule behaviour (exhaustion and long-rest hit dice); add other 2024 content as custom content.'),
      h('p', null, 'The complete SRD 5.1 and SRD 5.2.1 can be added from More → Content packs. ', h('a', { href: '#/packs' }, 'Get content packs'), '.'),
      h('p', null, 'It does not include, and is not, a source of all official Dungeons & Dragons content. Material from other books can be entered privately by you in Custom content, if you own it.')),
    card('Licence and attribution', h('p', null, 'This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.'),
      h('p', null, 'The 2024 rules option references the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, also licensed under CC BY 4.0.'),
      h('p', null, 'Dungeons & Dragons and D&D are trademarks of Wizards of the Coast LLC. This app is unofficial and is not endorsed by Wizards of the Coast.'),
      state.registry.packs.length ? h('div', null, h('h3', null, 'Installed content packs'), state.registry.packs.map((p) => h('div', { class: 'small-print' }, h('strong', null, `${p.manifest.title} (${p.manifest.licence}). `), p.manifest.attribution, ` Source: ${p.manifest.source}.`))) : null),
    card('Privacy', h('ul', null, h('li', null, 'No accounts, analytics or tracking.'), h('li', null, 'No network requests after installation, except when you press a Download button on the Content packs screen (to raw.githubusercontent.com or api.open5e.com only). Everything is stored in this browser’s IndexedDB.'), h('li', null, 'Local storage is not encrypted. Anyone with access to this device and browser profile can read it.'))),
    card('Randomness', h('p', null, 'Dice use the browser’s cryptographically secure random number generator with unbiased sampling. Results are pseudorandom, not physical; you can enter physical dice results instead.')));
}

export function moreView(): HTMLElement {
  const c = state.active;
  const item = (href: string, label: string, sub: string) => h('li', null, h('a', { href, class: 'more-link' }, h('strong', null, label), h('small', null, sub)));
  return h('div', { class: 'page' }, pageHeader('More'), h('ul', { class: 'more-list' },
    item('#/', 'Character library', 'All characters, create, duplicate, import'),
    c ? item(`#/c/${c.id}/sheet`, 'Full character sheet', c.name) : null, c ? item(`#/c/${c.id}/features`, 'Features & traits', 'Choices, feats, custom actions') : null,
    c ? item(`#/c/${c.id}/levelup`, 'Level up', 'Add a level with preview') : null, c ? item(`#/c/${c.id}/timeline`, 'Progression timeline', 'Every level and milestone') : null,
    c ? item(`#/c/${c.id}/audit`, 'Audit & calculation inspector', 'History, undo, every formula') : null,
    item('#/dice', 'Dice roller', 'Any expression, advantage, history'), item('#/initiative', 'Initiative tracker', 'Turn order, HP, conditions'),
    item('#/compendium', 'Compendium', 'Every spell, monster, item and rule in your packs'), item('#/packs', 'Content packs', 'Download SRD content, import pack files'),
    item('#/content', 'My content', 'Your classes, subclasses, races, backgrounds, feats, spells'), item('#/data', 'Backup, import & export', 'Keep your data safe'),
    item('#/settings', 'Settings', 'Theme, rules options'), item('#/about', 'About & licences', 'SRD attribution, privacy')));
}

export function printView(p: Record<string, string>): HTMLElement {
  const c = state.characters.find((x) => x.id === p.id); if (!c) return h('p', null, 'Character not found.');
  const d = compute(c, state.registry, state.settings);
  const sp = byId(state.registry.species, c.speciesId); const bg = byId(state.registry.backgrounds, c.backgroundId);
  const box = (t: string, ...b: (Node | string | null)[]) => h('section', { class: 'p-box' }, h('h3', null, t), ...b);
  return h('div', { class: 'print-sheet' },
    h('div', { class: 'no-print row' }, btn('Print', () => window.print(), 'btn btn-primary'), link(`#/c/${c.id}`, 'Back', 'btn btn-ghost')),
    h('header', { class: 'p-head' }, h('h1', null, c.name), h('p', null, `Level ${d.totalLevel} ${sp?.name ?? ''} · ${classLine(c)} · ${bg?.name ?? ''} · ${c.alignment} · Player: ${c.playerName || '—'} · XP ${c.xp}`)),
    h('div', { class: 'p-grid' },
      box('Abilities', h('table', null, h('tbody', null, ABILITIES.map((a) => h('tr', null, h('th', null, ABILITY_NAMES[a]), h('td', null, String(d.abilities[a].value)), h('td', null, sign(d.mods[a])), h('td', null, `save ${sign(d.saves[a].value)}${d.saves[a].proficient ? '•' : ''}`)))))),
      box('Combat', h('p', null, `AC ${d.ac.value} · Initiative ${sign(d.initiative.value)} · Speed ${d.speed.value} ft · Proficiency ${sign(d.pb.value)}`), h('p', null, `HP max ${d.hpMax.value} · Current ____ · Temp ____`), h('p', null, `Hit dice: ${d.hitDice.map((x) => `${x.total}${x.die}`).join(' + ')}`), h('p', null, 'Death saves: ○○○ / ○○○'),
        h('ul', null, d.attacks.map((a) => h('li', null, `${a.name}: ${a.attack ? sign(a.attack.value) : a.saveDC ? `DC ${a.saveDC}` : ''}, ${a.damage} ${a.damageType}`)))),
      box('Skills', h('ul', { class: 'cols' }, Object.entries(d.skills).map(([k, s]) => h('li', null, `${s.expertise ? '◆' : s.proficient ? '●' : '○'} ${cap(k)} ${sign(s.value)}`))), h('p', null, `Passive Perception ${d.passives.perception.value} · Investigation ${d.passives.investigation.value} · Insight ${d.passives.insight.value}`)),
      box('Proficiencies & languages', h('p', null, ['armor', 'weapon', 'tool', 'language'].map((k) => `${cap(k)}: ${c.proficiencies.filter((x) => x.kind === k).map((x) => x.name).join(', ') || '—'}`).join(' · '))),
      d.spellProfiles.length ? box('Spellcasting', h('p', null, d.spellProfiles.map((pr) => `${pr.className}: DC ${pr.dc.value}, attack ${sign(pr.attack.value)}`).join(' · ')), h('p', null, `Slots: ${d.slots.map((s) => `L${s.level}×${s.max}`).join(' ')}${d.pact.count ? ` · Pact ${d.pact.count}×L${d.pact.level}` : ''}`),
        h('p', null, `Spells: ${[...new Set([...c.spellcasting.known, ...c.spellcasting.prepared, ...c.spellcasting.alwaysPrepared])].map((id) => byId(state.registry.spells, id)?.name ?? id).join(', ')}`)) : null,
      box('Resources', h('ul', null, d.resources.map((r) => h('li', null, `${r.name}: ${'○'.repeat(Math.min(r.max, 20))} (${r.recovery} rest)`)))),
      box('Features & traits', h('ul', null, c.features.map((f) => h('li', null, h('strong', null, f.name), f.summary ? ` – ${f.summary}` : '')))),
      box('Equipment', h('ul', { class: 'cols' }, c.inventory.map((i) => h('li', null, `${i.name}${i.quantity !== 1 ? ` ×${i.quantity}` : ''}${i.equipped ? ' (E)' : ''}${i.attuned ? ' (A)' : ''}`))), h('p', null, `Coins: ${Object.entries(c.currency).map(([k, v]) => `${v} ${k}`).join(', ')}`)),
      box('Personality', h('p', null, `Traits: ${c.details.personality}`), h('p', null, `Ideals: ${c.details.ideals}`), h('p', null, `Bonds: ${c.details.bonds}`), h('p', null, `Flaws: ${c.details.flaws}`)),
      c.details.backstory ? box('Backstory', h('p', null, c.details.backstory)) : null),
    h('footer', { class: 'p-foot' }, `Includes SRD 5.1 material by Wizards of the Coast LLC, CC BY 4.0. Printed ${new Date().toLocaleDateString()}.`));
}
