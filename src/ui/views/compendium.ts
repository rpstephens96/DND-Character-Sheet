// Compendium: browse, search and read every installed content-pack entry; add items, learn spells, add monsters to combat.
import type { Encounter, Participant, RulesetId } from '../../types.js';
import type { IndexEntry, EntryKind } from '../../content/types.js';
import { KIND_LABEL, ENTRY_KINDS } from '../../content/types.js';
import { h, btn, card, field, input, select, num, toast, empty, link, modal, fill } from '../dom.js';
import { state, change } from '../store.js';
import { pageHeader } from '../components.js';
import { renderMarkdown } from '../markdown.js';
import { loadText } from '../../content/service.js';
import { byId } from '../../data/registry.js';
import { crText } from '../../content/convert-5edb.js';
import { newItem, itemFromContentId } from '../../rules/factory.js';
import { roll } from '../../rules/dice.js';
import { uid, nowIso } from '../../rules/events.js';
import { castDialog } from './spells.js';
import { go } from '../router.js';

const PAGE = 100;
/** Filters persist while navigating between list and detail. */
const F = { q: '', pack: '', level: '', cls: '', rarity: '', crMin: '', crMax: '', ruleset: '' as '' | RulesetId, shown: PAGE };
const crParse = (s: string): number | null => { if (!s.trim()) return null; if (s.includes('/')) { const [a, b] = s.split('/').map(Number); return a && b ? a / b : null; } const n = Number(s); return Number.isFinite(n) ? n : null; };
const packRuleset = (packId: string) => state.registry.packs.find((p) => p.manifest.id === packId)?.manifest.ruleset;
const detailHref = (e: IndexEntry) => `#/compendium/${e.kind}/${encodeURIComponent(e.packId)}/${encodeURIComponent(e.id)}`;

export function compendiumView(p: Record<string, string>): HTMLElement {
  const all = state.registry.compendium;
  if (!all.length) return h('div', { class: 'page' }, pageHeader('Compendium'), empty('No content packs are installed yet. Download the free SRD content to browse every spell, monster, magic item and rule.', link('#/packs', 'Get content packs', 'btn btn-primary')));
  const counts = new Map<EntryKind, number>(); all.forEach((e) => counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1));
  const kinds = ENTRY_KINDS.filter((k) => counts.get(k));
  const kind = (kinds.includes(p.kind as EntryKind) ? p.kind : kinds[0]) as EntryKind;
  if (!F.ruleset && state.active) F.ruleset = state.active.ruleset;
  const listBox = h('div', { 'aria-live': 'polite' });
  const draw = () => {
    const q = F.q.trim().toLowerCase(); const lo = crParse(F.crMin); const hi = crParse(F.crMax);
    let list = all.filter((e) => e.kind === kind && (!F.pack || e.packId === F.pack) && (!q || e.name.toLowerCase().includes(q) || (e.meta.sub ?? '').toLowerCase().includes(q))
      && (F.level === '' || e.meta.level === Number(F.level)) && (!F.cls || (e.meta.classes ?? []).includes(F.cls) || e.meta.classId === F.cls)
      && (!F.rarity || (e.meta.rarity ?? '').toLowerCase() === F.rarity) && (lo === null || (e.meta.cr ?? -1) >= lo) && (hi === null || (e.meta.cr ?? 99) <= hi));
    if (F.ruleset) { // hide same-named entries from a pack for the other ruleset
      const names = new Map<string, IndexEntry>();
      for (const e of list) { const k = e.name.toLowerCase(); const cur = names.get(k); const score = (x: IndexEntry) => (packRuleset(x.packId) === F.ruleset ? 2 : packRuleset(x.packId) === 'any' ? 1 : 0); if (!cur || score(e) > score(cur)) names.set(k, e); }
      const keep = new Set(names.values()); list = list.filter((e) => keep.has(e));
    }
    list.sort((a, b) => (kind === 'spell' ? (a.meta.level ?? 0) - (b.meta.level ?? 0) : kind === 'monster' ? (a.meta.cr ?? 0) - (b.meta.cr ?? 0) : kind === 'feature' ? (a.meta.level ?? 0) - (b.meta.level ?? 0) : 0) || a.name.localeCompare(b.name));
    const shown = list.slice(0, F.shown);
    fill(listBox, h('p', { class: 'hint' }, `${list.length} result${list.length === 1 ? '' : 's'}`),
      shown.length ? h('ul', { class: 'compendium-list' }, shown.map((e) => h('li', null, h('a', { href: detailHref(e) }, h('strong', null, e.name), e.meta.sub ? h('small', null, e.meta.sub) : null),
        state.registry.packs.length > 1 ? h('span', { class: 'badge badge-src' }, state.registry.packs.find((x) => x.manifest.id === e.packId)?.manifest.shortName ?? e.packId) : null))) : empty('Nothing matches these filters.'),
      list.length > shown.length ? btn(`Show more (${list.length - shown.length} remaining)`, () => { F.shown += PAGE; draw(); }, 'btn btn-ghost') : null);
  };
  const ctl = <E extends HTMLInputElement | HTMLSelectElement>(el: E, key: keyof typeof F): E => { const on = () => { (F as Record<string, unknown>)[key] = el.value; F.shown = PAGE; draw(); }; el.addEventListener('input', on); el.addEventListener('change', on); return el; };
  const levels = [...new Set(all.filter((e) => e.kind === kind && typeof e.meta.level === 'number').map((e) => e.meta.level!))].sort((a, b) => a - b);
  const classes = [...new Set(all.filter((e) => e.kind === kind).flatMap((e) => [...(e.meta.classes ?? []), ...(e.meta.classId ? [e.meta.classId] : [])]))].sort();
  const rarities = [...new Set(all.filter((e) => e.kind === kind && e.meta.rarity).map((e) => e.meta.rarity!.toLowerCase()))].sort();
  const filters = h('div', { class: 'grid-3' },
    field('Search', ctl(input({ type: 'search', value: F.q, placeholder: `Search ${KIND_LABEL[kind].toLowerCase()}` }), 'q')),
    state.registry.packs.length > 1 ? field('Pack', ctl(select([{ value: '', label: 'All packs' }, ...state.registry.packs.filter((x) => x.enabled).map((x) => ({ value: x.manifest.id, label: x.manifest.shortName }))], F.pack), 'pack')) : null,
    state.registry.packs.length > 1 ? field('Prefer rules version', ctl(select([{ value: '', label: 'Show every version' }, { value: 'srd51', label: '2014 (hide 2024 duplicates)' }, { value: 'srd521', label: '2024 (hide 2014 duplicates)' }], F.ruleset), 'ruleset')) : null,
    levels.length > 1 ? field(kind === 'spell' ? 'Spell level' : 'Level', ctl(select([{ value: '', label: 'Any' }, ...levels.map((l) => ({ value: String(l), label: kind === 'spell' && l === 0 ? 'Cantrip' : String(l) }))], F.level), 'level')) : null,
    classes.length ? field('Class', ctl(select([{ value: '', label: 'Any' }, ...classes.map((c) => ({ value: c, label: c.replace(/-/g, ' ') }))], F.cls), 'cls')) : null,
    rarities.length ? field('Rarity', ctl(select([{ value: '', label: 'Any' }, ...rarities.map((r) => ({ value: r, label: r }))], F.rarity), 'rarity')) : null,
    kind === 'monster' ? field('CR from', ctl(input({ value: F.crMin, placeholder: '0', inputmode: 'decimal' }), 'crMin')) : null,
    kind === 'monster' ? field('CR to', ctl(input({ value: F.crMax, placeholder: '30', inputmode: 'decimal' }), 'crMax')) : null);
  draw();
  return h('div', { class: 'page' }, pageHeader('Compendium', `${all.length.toLocaleString('en-GB')} entries from ${state.registry.packs.filter((x) => x.enabled).length} pack(s)`, link('#/packs', 'Manage packs', 'btn btn-ghost btn-small')),
    h('nav', { class: 'subtabs', 'aria-label': 'Compendium sections' }, kinds.map((k) => h('a', { href: `#/compendium/${k}`, class: k === kind ? 'active' : '', 'aria-current': k === kind ? 'page' : undefined, on: { click: () => { F.shown = PAGE; F.level = ''; F.cls = ''; F.rarity = ''; } } }, `${KIND_LABEL[k]} (${counts.get(k)})`))),
    card(null, filters), listBox);
}

export async function compendiumEntryView(p: Record<string, string>): Promise<HTMLElement> {
  const e = state.registry.compendium.find((x) => x.kind === p.kind && x.packId === p.packId && x.id === p.id);
  if (!e) return h('div', { class: 'page' }, empty('That entry is not in any enabled pack.', link('#/compendium', 'Back to compendium', 'btn')));
  const text = await loadText(state.repo, e.packId, e.kind, e.id);
  const pack = state.registry.packs.find((x) => x.manifest.id === e.packId)?.manifest;
  const resolve = (title: string) => { const t = state.registry.compendium.find((x) => x.name.toLowerCase() === title.toLowerCase()); return t ? detailHref(t) : null; };
  const others = state.registry.compendium.filter((x) => x !== e && x.kind === e.kind && x.name.toLowerCase() === e.name.toLowerCase());
  const related = e.kind === 'class' || e.kind === 'subclass' ? state.registry.compendium.filter((x) => x.kind === 'feature' && x.packId === e.packId && (e.kind === 'class' ? x.meta.classId === (e.link ?? e.id) && !x.meta.subclassId : x.meta.subclassId === e.id)) : [];
  return h('div', { class: 'page' },
    h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' }, link('#/compendium', 'Compendium'), ' › ', link(`#/compendium/${e.kind}`, KIND_LABEL[e.kind]), ' › ', e.name),
    pageHeader(e.name, e.meta.sub ?? KIND_LABEL[e.kind], pack ? h('span', { class: 'badge badge-src' }, `${pack.shortName} · ${pack.licence}`) : null),
    actions(e),
    card(null, text ? renderMarkdown(text, resolve) : h('p', { class: 'hint' }, 'No text for this entry.')),
    related.length ? card('Features', h('ul', { class: 'rec-list' }, related.sort((a, b) => (a.meta.level ?? 0) - (b.meta.level ?? 0)).map((x) => h('li', null, h('a', { href: detailHref(x) }, `${x.meta.level ?? ''} · ${x.name}`))))) : null,
    others.length ? card('Other versions', h('ul', { class: 'rec-list' }, others.map((x) => h('li', null, h('a', { href: detailHref(x) }, x.name), h('span', { class: 'badge badge-src' }, state.registry.packs.find((pp) => pp.manifest.id === x.packId)?.manifest.shortName ?? x.packId))))) : null,
    pack ? h('p', { class: 'small-print' }, pack.attribution) : null);
}

function actions(e: IndexEntry): HTMLElement | null {
  const c = state.active; const reg = state.registry;
  const box = h('div', { class: 'row wrap compendium-actions' });
  if (e.kind === 'spell') {
    const sp = byId(reg.spells, e.id) ?? byId(reg.spells, e.link);
    if (sp && c) {
      const known = c.spellcasting.known.includes(sp.id);
      box.append(btn(known ? `Forget (${c.name})` : `Learn (${c.name})`, async () => { await change('spell', `${known ? 'Forgot' : 'Learned'} ${sp.name}`, (d) => { d.spellcasting.known = known ? d.spellcasting.known.filter((x) => x !== sp.id) : [...d.spellcasting.known, sp.id]; }); go(location.hash.slice(1)); }, 'btn btn-primary btn-small'),
        btn('Cast', () => castDialog(c, sp), 'btn btn-small'));
    }
  }
  if (c && (e.kind === 'magicItem' || e.kind === 'gear' || e.kind === 'weapon' || e.kind === 'armor')) {
    box.append(btn(`Add to ${c.name}’s inventory`, () => void addItem(e), 'btn btn-primary btn-small'));
  }
  if (e.kind === 'monster') box.append(btn('Add to encounter', () => addMonster(e), 'btn btn-primary btn-small'));
  if (!c && ['spell', 'magicItem', 'gear', 'weapon', 'armor'].includes(e.kind)) box.append(h('span', { class: 'hint' }, 'Select a character to learn spells or add items.'));
  return box.childNodes.length ? box : null;
}

async function addItem(e: IndexEntry): Promise<void> {
  const reg = state.registry;
  let it = e.kind === 'weapon' || e.kind === 'armor' ? itemFromContentId(reg, e.id) : null;
  if (it) it.equipped = false;
  if (!it && e.kind === 'magicItem') { const m = reg.magicItems.find((x) => x.id === e.id && x.packId === e.packId); if (m) it = newItem({ name: m.name, category: 'magic', requiresAttunement: m.attunement, notes: `${m.rarity}. ${m.summary} (Full text: Compendium.)`, source: e.packId }); }
  if (!it && e.kind === 'gear') { const g = reg.gear.find((x) => x.id === e.id && x.packId === e.packId); if (g) it = newItem({ name: g.name, category: 'gear', weight: g.weight, value: g.cost, notes: g.summary, source: e.packId }); }
  if (!it) it = newItem({ name: e.name, category: e.kind === 'magicItem' ? 'magic' : 'gear', source: e.packId, notes: 'See Compendium.' });
  const item = it;
  await change('inventory', `Added ${item.name}`, (d) => { d.inventory.push(item); });
}

function addMonster(e: IndexEntry): void {
  const m = state.registry.monsters.find((x) => x.id === e.id && x.packId === e.packId);
  if (!m) return void toast('This monster has no statistics in its pack.', 'warn');
  const count = num(1, { min: 1, max: 20, 'aria-label': 'Number of creatures' });
  const hpMode = select([{ value: 'avg', label: `Average (${m.hp})` }, { value: 'roll', label: `Roll ${m.hitDice || 'hit dice'}` }], 'avg', { 'aria-label': 'Hit points' });
  modal(`Add ${m.name} to the encounter`, h('div', null, field('How many', count), field('Hit points', hpMode), h('p', { class: 'hint' }, `AC ${m.ac} · CR ${crText(m.cr)} · initiative d20 ${Math.floor((m.abilities.dex - 10) / 2) >= 0 ? '+' : '−'}${Math.abs(Math.floor((m.abilities.dex - 10) / 2))}`)),
    [{ label: 'Cancel', cls: 'btn btn-ghost' }, { label: 'Add', cls: 'btn btn-primary', run: async () => {
      const n = Math.max(1, Math.min(20, Math.floor(Number(count.value) || 1))); const dex = Math.floor((m.abilities.dex - 10) / 2);
      const all = await state.repo.all<Encounter>('encounters');
      let enc = all.filter((x) => x.active).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (!enc) enc = { id: uid(), name: `Encounter ${all.length + 1}`, round: 1, turnIndex: 0, participants: [], active: true, updatedAt: nowIso(), campaignId: state.active?.campaignId };
      const existing = enc.participants.filter((x) => x.name.replace(/ \d+$/, '') === m.name).length;
      for (let i = 1; i <= n; i++) {
        let hp = m.hp; if (hpMode.value === 'roll' && /^\d+d\d+([+-]\d+)?$/.test(m.hitDice.replace(/\s/g, ''))) { try { hp = Math.max(1, roll(m.hitDice.replace(/\s/g, '')).total); } catch { hp = m.hp; } }
        const pt: Participant = { id: uid(), name: n + existing > 1 ? `${m.name} ${existing + i}` : m.name, initiative: roll(`1d20${dex >= 0 ? '+' : ''}${dex}`).total, dexMod: dex, hp, hpMax: hp, ac: m.ac, disposition: 'hostile', conditions: [], concentrating: false, defeated: false, delayed: false, readied: '', dmNotes: `CR ${crText(m.cr)}. Stat block: Compendium › ${m.name}.` };
        enc.participants.push(pt);
      }
      enc.updatedAt = nowIso(); await state.repo.put('encounters', enc);
      toast(`Added ${n} × ${m.name} to ${enc.name}.`, 'ok', { label: 'Open tracker', run: () => go('/initiative') });
      return true;
    } }]);
}
