import { h, btn, link, card, empty, confirmDialog, toast, readFile, modal } from '../dom.js';
import { state, setActive, commit, notify, saveSettings } from '../store.js';
import { classLine, pageHeader } from '../components.js';
import { compute } from '../../rules/calc.js';
import { uid, nowIso, clone } from '../../rules/events.js';
import { readExport } from '../../io/importExport.js';
import { APP_CONFIG } from '../../config.js';
import { sampleCharacters, sampleCampaign } from '../../data/samples.js';
import { go } from '../router.js';
import { importReportDialog } from './data.js';
export function libraryView() {
    const root = h('div', { class: 'page' });
    root.appendChild(pageHeader(APP_CONFIG.name, 'Your characters', link('#/new', '+ New character', 'btn btn-primary')));
    if (!state.settings.onboarded)
        root.appendChild(intro());
    if (state.characters.length === 0) {
        root.appendChild(empty('No characters yet. Create your first adventurer, import a backup, or load a sample to explore.', h('div', { class: 'row' }, link('#/new', 'Create a character', 'btn btn-primary'), btn('Import character file', () => void importChar(), 'btn'), btn('Load sample characters', () => void loadSamples(), 'btn btn-ghost'))));
        return root;
    }
    const list = h('ul', { class: 'char-list' });
    for (const c of state.characters) {
        const d = compute(c, state.registry, state.settings);
        const sp = state.registry.species.find((s) => s.id === c.speciesId);
        list.appendChild(h('li', { class: `char-card${state.active?.id === c.id ? ' is-active' : ''}` }, h('a', { href: `#/c/${c.id}`, class: 'char-main', on: { click: () => setActive(c) } }, c.portrait ? h('img', { src: c.portrait, alt: '', class: 'portrait-sm' }) : h('span', { class: 'portrait-sm sigil', 'aria-hidden': 'true' }, (c.name[0] ?? '?').toUpperCase()), h('span', null, h('strong', { class: 'char-name' }, c.name), h('span', { class: 'char-sub' }, `Level ${d.totalLevel} ${sp?.name ?? ''} · ${classLine(c)}`), h('span', { class: 'char-meta' }, `HP ${c.hp.current}/${d.hpMax.value} · AC ${d.ac.value} · ${c.ruleset === 'srd521' ? '2024 rules' : c.ruleset === 'srd51' ? '2014 rules' : 'Custom rules'}`))), h('div', { class: 'char-actions' }, btn('Combat', () => { setActive(c); go(`/c/${c.id}/combat`); }, 'btn btn-small'), btn('Duplicate', () => void duplicate(c), 'btn btn-small btn-ghost'), btn('Delete', () => void remove(c), 'btn btn-small btn-ghost danger-text', { 'aria-label': `Delete ${c.name}` }))));
    }
    root.appendChild(list);
    root.appendChild(h('div', { class: 'row' }, btn('Import character file', () => void importChar(), 'btn'), btn('Load sample characters', () => void loadSamples(), 'btn btn-ghost')));
    return root;
}
function intro() {
    return card('Welcome to the Ledger', h('ol', { class: 'intro-list' }, h('li', null, h('strong', null, 'Create or import a character. '), 'The builder walks through each choice and explains its effect.'), h('li', null, h('strong', null, 'Install it. '), 'On iPhone: Share → Add to Home Screen. On Android: menu → Install app. It then works offline at the table.'), h('li', null, h('strong', null, 'Your data stays on this device. '), 'Everything is stored in this browser’s local database. Nothing is uploaded, and it is not encrypted.'), h('li', null, h('strong', null, 'Back up regularly. '), 'Clearing browser data deletes your characters. Use More → Backup to save a file.'), h('li', null, h('strong', null, 'Included vs custom content. '), 'The app includes System Reference Document content only. Add material from books you own under Custom content.')), btn('Got it', () => void saveSettings({ onboarded: true }), 'btn btn-primary'));
}
async function duplicate(c) {
    const copy = clone(c);
    copy.id = uid();
    copy.name = `${c.name} (copy)`;
    copy.createdAt = copy.updatedAt = nowIso();
    await commit(copy, [{ id: uid(), characterId: copy.id, ts: copy.createdAt, category: 'create', description: `Duplicated from ${c.name}`, before: null, after: null, reversible: false, undone: false }], `Created ${copy.name}`);
}
async function remove(c) {
    if (!(await confirmDialog(`Delete ${c.name}?`, h('p', null, 'This permanently removes the character, its history and level snapshots from this device. Export a copy first if you may need it.'), 'Delete permanently', true)))
        return;
    const evs = await state.repo.byIndex('events', 'characterId', c.id);
    const sn = await state.repo.byIndex('snapshots', 'characterId', c.id);
    await state.repo.tx([{ store: 'characters', del: [c.id] }, { store: 'events', del: evs.map((e) => e.id) }, { store: 'snapshots', del: sn.map((s) => s.id) }]);
    state.characters = state.characters.filter((x) => x.id !== c.id);
    if (state.active?.id === c.id)
        setActive(null);
    toast(`${c.name} deleted.`);
    notify();
}
async function importChar() {
    const text = await readFile('.json,application/json');
    if (!text)
        return;
    try {
        importReportDialog(await readExport(text));
    }
    catch (e) {
        toast(e.message, 'error');
    }
}
async function loadSamples() {
    const samples = sampleCharacters(state.registry);
    for (const s of samples)
        await commit(s.character, s.events, undefined, undefined);
    for (const s of samples)
        for (const sn of s.snapshots)
            await state.repo.put('snapshots', sn);
    const { campaign, records } = sampleCampaign(samples[0].character.id);
    await state.repo.tx([{ store: 'campaigns', put: [campaign] }, { store: 'records', put: records }, { store: 'characters', put: [{ ...samples[0].character, campaignId: campaign.id }] }]);
    state.characters = state.characters.map((c) => (c.id === samples[0].character.id ? { ...c, campaignId: campaign.id } : c));
    modal('Samples loaded', h('p', null, `Added ${samples.length} sample characters and a sample campaign. They use SRD content only and can be deleted at any time.`));
    notify();
}
