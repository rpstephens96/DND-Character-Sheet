import { h, btn, card, field, input, select, textarea, modal, toast, confirmDialog, empty, link, clear, put, fill } from '../dom.js';
import { state, notify } from '../store.js';
import { pageHeader } from '../components.js';
import { renderMarkdown, toggleTaskLine } from '../markdown.js';
import { uid, nowIso } from '../../rules/events.js';
import { cap } from '../../rules/calc.js';
import { go, setGuard } from '../router.js';
const KINDS = [
    { kind: 'session', label: 'Session', plural: 'Sessions' }, { kind: 'npc', label: 'NPC', plural: 'NPCs' }, { kind: 'location', label: 'Location', plural: 'Locations' },
    { kind: 'faction', label: 'Faction', plural: 'Factions' }, { kind: 'quest', label: 'Quest', plural: 'Quests' }, { kind: 'note', label: 'Note', plural: 'Notes' },
    { kind: 'clue', label: 'Clue', plural: 'Clues' }, { kind: 'decision', label: 'Decision', plural: 'Decisions' }, { kind: 'debt', label: 'Debt or favour', plural: 'Debts & favours' }, { kind: 'downtime', label: 'Downtime', plural: 'Downtime' },
];
const SESSION_TEMPLATE = '# Summary\n\n# Key moments\n- \n\n# NPCs met\n- [[ ]]\n\n# Loot & rewards\n- \n\n# Open threads\n- [ ] \n';
const kindLabel = (k) => KINDS.find((x) => x.kind === k)?.label ?? k;
export async function campaignsView() {
    const camps = (await state.repo.all('campaigns')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const records = await state.repo.all('records');
    const q = input({ type: 'search', placeholder: 'Search every campaign', 'aria-label': 'Search all campaigns' });
    const results = h('div', { 'aria-live': 'polite' });
    q.addEventListener('input', () => fill(results, searchResults(records, q.value, camps)));
    return h('div', { class: 'page' }, pageHeader('Campaigns', `${camps.length} campaign${camps.length === 1 ? '' : 's'}`, btn('+ New campaign', () => campaignDialog(), 'btn btn-primary')), camps.length ? card('Search', q, results) : null, camps.length ? h('ul', { class: 'char-list' }, camps.map((c) => h('li', { class: 'char-card' }, h('a', { href: `#/campaign/${c.id}`, class: 'char-main' }, h('span', { class: 'portrait-sm sigil', 'aria-hidden': 'true' }, '⚑'), h('span', null, h('strong', { class: 'char-name' }, c.name), h('span', { class: 'char-sub' }, `${c.setting || 'No setting'} · DM ${c.dm || '—'}`), h('span', { class: 'char-meta' }, `${records.filter((r) => r.campaignId === c.id).length} records · ${state.characters.filter((x) => x.campaignId === c.id).length} characters`))))))
        : empty('No campaigns yet. Create one to keep sessions, NPCs, locations and quests together.', btn('Create campaign', () => campaignDialog(), 'btn btn-primary')));
}
function searchResults(records, q, camps) {
    const t = q.trim().toLowerCase();
    if (t.length < 2)
        return h('p', { class: 'hint' }, 'Type at least two characters.');
    const hits = records.filter((r) => `${r.title} ${r.body} ${r.tags.join(' ')} ${r.status}`.toLowerCase().includes(t)).slice(0, 40);
    return hits.length ? h('ul', { class: 'search-hits' }, hits.map((r) => { const i = r.body.toLowerCase().indexOf(t); return h('li', null, h('a', { href: `#/record/${r.id}` }, r.title || 'Untitled'), h('span', { class: 'badge' }, kindLabel(r.kind)), camps.length > 1 ? h('small', null, ` ${camps.find((c) => c.id === r.campaignId)?.name ?? ''}`) : null, i >= 0 ? h('p', { class: 'hint' }, `…${r.body.slice(Math.max(0, i - 40), i + 60)}…`) : null); })) : h('p', { class: 'hint' }, 'No matches.');
}
function campaignDialog(existing) {
    const c = existing ? { ...existing } : { id: uid(), name: '', dm: '', setting: '', summary: '', startDate: nowIso().slice(0, 10), worldDate: '', party: '', sharedFunds: '', tags: [], createdAt: nowIso(), updatedAt: nowIso() };
    const f = { name: input({ value: c.name }), dm: input({ value: c.dm }), setting: input({ value: c.setting }), start: input({ type: 'date', value: c.startDate }), world: input({ value: c.worldDate, placeholder: 'In-world date' }), party: textarea(c.party, { rows: 2 }), funds: input({ value: c.sharedFunds, placeholder: 'e.g. 240 gp in the party chest' }), summary: textarea(c.summary, { rows: 4 }), tags: input({ value: c.tags.join(', ') }) };
    modal(existing ? 'Edit campaign' : 'New campaign', h('div', { class: 'grid-2' }, field('Name', f.name, { required: true }), field('Dungeon Master', f.dm), field('Setting', f.setting), field('Start date', f.start), field('Current in-world date', f.world), field('Shared party funds & loot', f.funds), field('Party members', f.party), field('Summary', f.summary), field('Tags', f.tags, { hint: 'Comma-separated' })), [{ label: 'Cancel', cls: 'btn btn-ghost' }, { label: 'Save', cls: 'btn btn-primary', run: async () => {
                if (!f.name.value.trim()) {
                    toast('Campaign name is required.', 'error');
                    f.name.focus();
                    return false;
                }
                Object.assign(c, { name: f.name.value.trim(), dm: f.dm.value, setting: f.setting.value, startDate: f.start.value, worldDate: f.world.value, party: f.party.value, sharedFunds: f.funds.value, summary: f.summary.value, tags: f.tags.value.split(',').map((x) => x.trim()).filter(Boolean), updatedAt: nowIso() });
                await state.repo.put('campaigns', c);
                toast('Campaign saved.');
                if (!existing)
                    go(`/campaign/${c.id}`);
                else
                    notify();
                return true;
            } }], { wide: true });
}
export async function campaignView(p) {
    const camp = await state.repo.get('campaigns', p.id);
    if (!camp)
        return empty('Campaign not found.', link('#/campaigns', 'All campaigns', 'btn'));
    const records = await state.repo.byIndex('records', 'campaignId', camp.id);
    const tab = p.tab ?? 'overview';
    const chars = state.characters.filter((c) => c.campaignId === camp.id);
    const root = h('div', { class: 'page' }, pageHeader(camp.name, `${camp.setting || ''}${camp.worldDate ? ` · ${camp.worldDate}` : ''}`, btn('Edit', () => campaignDialog(camp), 'btn btn-ghost btn-small'), btn('Delete', async () => { if (await confirmDialog(`Delete ${camp.name}?`, 'All sessions, NPCs, locations, quests and notes in this campaign will be deleted. Characters are kept.', 'Delete campaign', true)) {
        await state.repo.tx([{ store: 'campaigns', del: [camp.id] }, { store: 'records', del: records.map((r) => r.id) }]);
        go('/campaigns');
    } }, 'btn btn-ghost btn-small danger-text')), h('nav', { class: 'subtabs', 'aria-label': 'Campaign sections' }, [['overview', 'Overview'], ...KINDS.slice(0, 6).map((k) => [k.kind, k.plural]), ['more', 'More']].map(([k, l]) => h('a', { href: `#/campaign/${camp.id}/${k}`, class: tab === k ? 'active' : '', 'aria-current': tab === k ? 'page' : undefined }, l))));
    if (tab === 'overview') {
        const pinned = records.filter((r) => r.pinned);
        const quests = records.filter((r) => r.kind === 'quest' && !/complete|done|failed/i.test(r.status));
        const recent = [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);
        const q = input({ type: 'search', placeholder: 'Search this campaign', 'aria-label': 'Search this campaign' });
        const res = h('div', { 'aria-live': 'polite' });
        q.addEventListener('input', () => fill(res, searchResults(records, q.value, [camp])));
        put(root, card('Search', q, res), card('Summary', h('p', null, camp.summary || 'No summary yet.'), h('dl', { class: 'deflist' }, ...[['DM', camp.dm], ['Party', camp.party], ['Shared funds', camp.sharedFunds], ['Started', camp.startDate], ['Tags', camp.tags.join(', ')]].flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v || '—')]))), card('Characters', chars.length ? h('ul', null, chars.map((c) => h('li', null, link(`#/c/${c.id}`, c.name)))) : h('p', { class: 'hint' }, 'Link a character to this campaign from its Sheet.')), card('Pinned', pinned.length ? recList(pinned) : h('p', { class: 'hint' }, 'Pin important records to show them here.')), card('Active quests', quests.length ? recList(quests) : h('p', { class: 'hint' }, 'No active quests.')), card('Recently edited', recent.length ? recList(recent) : h('p', { class: 'hint' }, 'Nothing yet.')), h('div', { class: 'row wrap' }, KINDS.slice(0, 6).map((k) => btn(`+ ${k.label}`, () => void newRecord(camp.id, k.kind), 'btn btn-small'))));
    }
    else if (tab === 'more') {
        put(root, ...KINDS.slice(6).map((k) => card(k.plural, recList(records.filter((r) => r.kind === k.kind)), btn(`+ ${k.label}`, () => void newRecord(camp.id, k.kind), 'btn btn-small'))));
    }
    else {
        const kind = tab;
        const list = records.filter((r) => r.kind === kind).sort((a, b) => (kind === 'session' ? (b.date || b.createdAt).localeCompare(a.date || a.createdAt) : a.title.localeCompare(b.title)));
        const tags = [...new Set(list.flatMap((r) => r.tags))];
        const box = h('div');
        let tagF = '';
        let txt = '';
        const draw = () => fill(box, recList(list.filter((r) => (!tagF || r.tags.includes(tagF)) && (!txt || `${r.title} ${r.body}`.toLowerCase().includes(txt.toLowerCase())))));
        const s = input({ type: 'search', placeholder: 'Filter', 'aria-label': 'Filter' });
        s.addEventListener('input', () => { txt = s.value; draw(); });
        const t = select([{ value: '', label: 'All tags' }, ...tags.map((x) => ({ value: x, label: x }))], '', { 'aria-label': 'Tag' });
        t.addEventListener('change', () => { tagF = t.value; draw(); });
        draw();
        put(root, card(KINDS.find((k) => k.kind === kind)?.plural ?? cap(kind), h('div', { class: 'row wrap' }, s, tags.length ? t : null, btn(`+ New ${kindLabel(kind)}`, () => void newRecord(camp.id, kind), 'btn btn-primary btn-small')), box));
    }
    return root;
}
function recList(list) {
    if (!list.length)
        return h('p', { class: 'hint' }, 'None yet.');
    return h('ul', { class: 'rec-list' }, list.map((r) => h('li', null, h('a', { href: `#/record/${r.id}` }, r.pinned ? '📌 ' : '', r.title || 'Untitled'), h('span', { class: 'badge' }, kindLabel(r.kind)), r.status ? h('span', { class: 'badge' }, r.status) : null, r.objectives.length ? h('small', null, ` ${r.objectives.filter((o) => o.done).length}/${r.objectives.length} objectives`) : null, r.date ? h('small', null, ` ${r.date}`) : null, r.tags.map((t) => h('span', { class: 'tag' }, `#${t}`)))));
}
async function newRecord(campaignId, kind) {
    const t = nowIso();
    const all = await state.repo.byIndex('records', 'campaignId', campaignId);
    const n = all.filter((r) => r.kind === kind).length + 1;
    const r = { id: uid(), campaignId, kind, title: kind === 'session' ? `Session ${n}` : '', body: kind === 'session' ? SESSION_TEMPLATE : '', tags: [], links: [], pinned: false, status: kind === 'quest' ? 'Active' : '', date: kind === 'session' ? t.slice(0, 10) : '', visibility: 'shared', objectives: [], createdAt: t, updatedAt: t };
    await state.repo.put('records', r);
    go(`/record/${r.id}`);
}
export async function recordView(p) {
    const r = await state.repo.get('records', p.id);
    if (!r)
        return empty('Record not found.', link('#/campaigns', 'All campaigns', 'btn'));
    const camp = await state.repo.get('campaigns', r.campaignId);
    const all = await state.repo.byIndex('records', 'campaignId', r.campaignId);
    const byTitle = (t) => all.find((x) => x.title.toLowerCase() === t.trim().toLowerCase());
    let timer;
    let pending = false;
    const status = h('span', { class: 'save-inline', 'aria-live': 'polite' }, 'Saved');
    const save = async () => { pending = false; r.updatedAt = nowIso(); await state.repo.put('records', r); status.textContent = `Saved ${new Date().toLocaleTimeString()}`; };
    const queue = () => { pending = true; status.textContent = 'Saving…'; clearTimeout(timer); timer = window.setTimeout(() => void save(), 600); };
    setGuard(() => { if (pending) {
        clearTimeout(timer);
        void save();
    } return false; }); // flush autosave on navigation
    const title = input({ value: r.title, 'aria-label': 'Title', class: 'title-input', placeholder: `${kindLabel(r.kind)} title` });
    title.addEventListener('input', () => { r.title = title.value; queue(); });
    const body = textarea(r.body, { rows: 14, 'aria-label': 'Body (Markdown)', class: 'md-editor' });
    const preview = h('div', { class: 'md-preview card' });
    const drawPreview = () => { clear(preview); put(preview, renderMarkdown(r.body, (t) => { const x = byTitle(t); return x ? `#/record/${x.id}` : null; }, (i, ch) => { r.body = toggleTaskLine(r.body, i, ch); body.value = r.body; queue(); drawPreview(); })); };
    body.addEventListener('input', () => { r.body = body.value; queue(); drawPreview(); });
    drawPreview();
    const tags = input({ value: r.tags.join(', ') });
    tags.addEventListener('input', () => { r.tags = tags.value.split(',').map((x) => x.trim()).filter(Boolean); queue(); });
    const st = input({ value: r.status, list: 'status-list' });
    st.addEventListener('input', () => { r.status = st.value; queue(); });
    const dt = input({ type: 'text', value: r.date, placeholder: 'Real or in-world date' });
    dt.addEventListener('input', () => { r.date = dt.value; queue(); });
    const vis = select([{ value: 'shared', label: 'Campaign-shared' }, { value: 'private', label: 'Character-private' }], r.visibility);
    vis.addEventListener('change', () => { r.visibility = vis.value; queue(); });
    const pin = h('input', { type: 'checkbox', checked: r.pinned });
    pin.addEventListener('change', () => { r.pinned = pin.checked; queue(); });
    const objBox = h('div');
    const drawObj = () => fill(objBox, h('ul', { class: 'objectives' }, r.objectives.map((o) => h('li', null, h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: o.done, on: { change: (e) => { o.done = e.target.checked; queue(); } } }), ` ${o.text}`), btn('✕', () => { r.objectives = r.objectives.filter((x) => x !== o); queue(); drawObj(); }, 'icon-btn', { 'aria-label': `Remove objective ${o.text}` })))), (() => { const n = input({ placeholder: 'New objective', 'aria-label': 'New objective' }); return h('form', { class: 'row', on: { submit: (e) => { e.preventDefault(); if (!n.value.trim())
                return; r.objectives.push({ id: uid(), text: n.value.trim(), done: false }); queue(); drawObj(); } } }, n, h('button', { type: 'submit', class: 'btn btn-small' }, 'Add')); })());
    drawObj();
    const linkBox = h('div');
    const drawLinks = () => fill(linkBox, h('ul', { class: 'chips' }, r.links.map((id) => { const x = all.find((y) => y.id === id); return h('li', { class: 'chip' }, x ? h('a', { href: `#/record/${x.id}` }, `${kindLabel(x.kind)}: ${x.title || 'Untitled'}`) : 'Missing record', btn('✕', () => { r.links = r.links.filter((y) => y !== id); queue(); drawLinks(); }, 'icon-btn', { 'aria-label': 'Remove link' })); })), (() => { const opts = all.filter((x) => x.id !== r.id && !r.links.includes(x.id)); if (!opts.length)
        return h('p', { class: 'hint' }, 'No other records to link.'); const s = select(opts.map((x) => ({ value: x.id, label: `${kindLabel(x.kind)}: ${x.title || 'Untitled'}` })), opts[0].id, { 'aria-label': 'Record to link' }); return h('div', { class: 'row' }, s, btn('Link', () => { r.links.push(s.value); queue(); drawLinks(); }, 'btn btn-small')); })());
    drawLinks();
    const backlinks = all.filter((x) => x.id !== r.id && (x.links.includes(r.id) || (r.title && x.body.toLowerCase().includes(`[[${r.title.toLowerCase()}]]`))));
    const levelEvents = r.kind === 'session' ? (await Promise.all(state.characters.filter((c) => c.campaignId === r.campaignId).map(async (c) => (await state.repo.byIndex('events', 'characterId', c.id)).filter((e) => e.sessionId === r.id).map((e) => `${c.name}: ${e.description}`)))).flat() : [];
    const loot = r.kind === 'session' ? state.characters.flatMap((c) => c.inventory.filter((i) => i.acquiredSessionId === r.id).map((i) => `${c.name}: ${i.name}`)) : [];
    return h('div', { class: 'page' }, h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' }, link('#/campaigns', 'Campaigns'), ' › ', camp ? link(`#/campaign/${camp.id}/${r.kind}`, camp.name) : null, ' › ', kindLabel(r.kind)), h('div', { class: 'row' }, title, status), h('div', { class: 'grid-3' }, field('Tags', tags, { hint: 'Comma-separated' }), field('Status', st), h('datalist', { id: 'status-list' }, ['Active', 'Completed', 'Failed', 'On hold', 'Ally', 'Hostile', 'Unknown'].map((x) => h('option', { value: x }))), field('Date', dt), field('Visibility', vis, { hint: 'For future sync; all data is local today.' }), h('label', { class: 'check' }, pin, ' Pinned')), h('div', { class: 'editor-split' }, h('div', null, h('label', { for: body.id || (body.id = 'md-body') }, 'Notes (Markdown: # heading, - list, - [ ] task, **bold**, [[Linked record]])'), body), h('div', null, h('p', { class: 'label' }, 'Preview'), preview)), r.kind === 'quest' ? card('Objectives', objBox) : null, card('Linked records', linkBox), backlinks.length ? card('Referenced by', recList(backlinks)) : null, levelEvents.length ? card('Character progress this session', h('ul', null, levelEvents.map((x) => h('li', null, x)))) : null, loot.length ? card('Items acquired this session', h('ul', null, loot.map((x) => h('li', null, x)))) : null, h('div', { class: 'row' }, btn('Delete record', async () => { if (await confirmDialog('Delete this record?', `“${r.title || 'Untitled'}” will be permanently deleted.`, 'Delete', true)) {
        clearTimeout(timer);
        pending = false;
        await state.repo.del('records', r.id);
        go(`/campaign/${r.campaignId}/${r.kind}`);
    } }, 'btn btn-ghost danger-text')));
}
