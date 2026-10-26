// Spellbook: search/filter, known/prepared management with limits, notes, free casts, and the casting workflow.
import type { Character, SpellDef, RecoveryTiming } from '../../types.js';
import { h, btn, card, field, input, num, select, textarea, modal, toast, sign, confirmDialog, empty, clear, put, fill } from '../dom.js';
import { state, change, setActive } from '../store.js';
import { needCharacter, pageHeader, statButton, rollAndShow, classLine } from '../components.js';
import { byId, forRuleset, preferRuleset, textFor } from '../../data/registry.js';
import { uid, nowIso } from '../../rules/events.js';
import { ABILITY_NAMES } from '../../rules/calc.js';

const ord = (n: number) => (n === 0 ? 'Cantrip' : `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'} level`);

export function spellsView(p: Record<string, string>): HTMLElement {
  const c = needCharacter(p.id); if (c instanceof HTMLElement) return c;
  setActive(c); const d = state.derived!;
  const root = h('div', { class: 'page' });
  const myClasses = c.classes.map((x) => x.classId);
  const f = { q: '', level: '', status: c.spellcasting.known.length ? 'mine' : 'class', school: '', conc: false, ritual: false, sort: 'level' };
  const listBox = h('div', { 'aria-live': 'polite' });
  const sc = c.spellcasting;
  const isMine = (s: SpellDef) => sc.known.includes(s.id) || sc.prepared.includes(s.id) || sc.alwaysPrepared.includes(s.id);
  const drawList = () => {
    const mine = [...sc.known, ...sc.prepared, ...sc.alwaysPrepared];
    const allowed = new Set(forRuleset(state.registry.spells, c.ruleset).map((x) => x.id));
    let spells = preferRuleset(state.registry.spells.filter((x) => allowed.has(x.id) || mine.includes(x.id)), c.ruleset, mine).filter((s) => (!f.q || `${s.name} ${s.summary}`.toLowerCase().includes(f.q.toLowerCase())) && (f.level === '' || s.level === Number(f.level)) && (!f.school || s.school === f.school) && (!f.conc || s.concentration) && (!f.ritual || s.ritual));
    if (f.status === 'mine') spells = spells.filter(isMine);
    if (f.status === 'prepared') spells = spells.filter((s) => sc.prepared.includes(s.id) || sc.alwaysPrepared.includes(s.id));
    if (f.status === 'class') spells = spells.filter((s) => s.classes.some((k) => myClasses.includes(k)) || isMine(s));
    if (f.status === 'fav') spells = spells.filter((s) => sc.favourites.includes(s.id));
    spells.sort((a, b) => (f.sort === 'name' ? a.name.localeCompare(b.name) : a.level - b.level || a.name.localeCompare(b.name)));
    fill(listBox, spells.length ? h('ul', { class: 'spell-list' }, spells.map((s) => spellRow(c, s))) : empty(f.status === 'mine' ? 'No spells known yet. Switch the filter to “My class lists” to learn spells.' : 'No spells match these filters.'));
  };
  const counts = d.spellProfiles.map((pr) => {
    const own = (ids: string[], lvl: (n: number) => boolean) => ids.filter((id) => { const s = byId(state.registry.spells, id); return s && lvl(s.level) && (s.classes.includes(pr.classId) || c.classes.length === 1); }).length;
    return h('div', { class: 'profile' }, h('strong', null, pr.className), statButton(pr.dc, { label: 'Save DC', cls: 'stat-inline' }), statButton(pr.attack, { label: 'Spell attack', signed: true, cls: 'stat-inline' }),
      h('span', { class: 'hint' }, [pr.cantripsMax !== null ? `Cantrips ${own(sc.known, (n) => n === 0)}/${pr.cantripsMax}` : '', pr.knownMax !== null ? `Known ${own(sc.known, (n) => n > 0)}/${pr.knownMax}` : '', pr.preparedMax !== null ? `Prepared ${own(sc.prepared, (n) => n > 0)}/${pr.preparedMax}` : '', `(${ABILITY_NAMES[pr.ability]})`].filter(Boolean).join(' · ')));
  });
  const schools = [...new Set(state.registry.spells.map((s) => s.school))].sort();
  const ctl = (el: HTMLInputElement | HTMLSelectElement, key: keyof typeof f) => { el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => { (f as Record<string, unknown>)[key] = el.type === 'checkbox' ? (el as HTMLInputElement).checked : el.value; drawList(); }); el.addEventListener('change', () => { (f as Record<string, unknown>)[key] = el.type === 'checkbox' ? (el as HTMLInputElement).checked : el.value; drawList(); }); return el; };
  clear(root);
  put(root, pageHeader('Spellbook', `${c.name} · ${classLine(c)}`),
    !d.spellProfiles.length && !d.pact.count ? h('p', { class: 'notice' }, 'This character has no spellcasting class yet. You can still track spells granted by items or species via free casts below.') : null,
    d.spellProfiles.length ? card('Spellcasting', counts, h('p', null, d.slots.map((s) => `L${s.level} ${s.max - s.used}/${s.max}`).join(' · '), d.pact.count ? ` · Pact L${d.pact.level} ${d.pact.count - d.pact.used}/${d.pact.count}` : ''),
      c.concentration ? h('p', { class: 'badge badge-conc' }, `Concentrating: ${c.concentration.name}`) : null) : null,
    card('Filters', h('div', { class: 'grid-3' },
      field('Search', ctl(input({ type: 'search', placeholder: 'Name or text' }), 'q')),
      field('Show', ctl(select([{ value: 'mine', label: 'My spells' }, { value: 'prepared', label: 'Prepared' }, { value: 'class', label: 'My class lists' }, { value: 'fav', label: 'Favourites' }, { value: 'all', label: 'All spells' }], f.status), 'status')),
      field('Level', ctl(select([{ value: '', label: 'Any' }, ...Array.from({ length: 10 }, (_, i) => ({ value: String(i), label: ord(i) }))], ''), 'level')),
      field('School', ctl(select([{ value: '', label: 'Any' }, ...schools.map((s) => ({ value: s, label: s }))], ''), 'school')),
      field('Sort', ctl(select([{ value: 'level', label: 'Level' }, { value: 'name', label: 'Name' }], 'level'), 'sort')),
      h('div', null, h('label', { class: 'check' }, ctl(h('input', { type: 'checkbox' }), 'conc'), ' Concentration'), h('label', { class: 'check' }, ctl(h('input', { type: 'checkbox' }), 'ritual'), ' Ritual')))),
    listBox, card('Free and item castings', freeCasts(c)));
  drawList();
  return root;
}

function spellRow(c: Character, s: SpellDef): HTMLElement {
  const sc = c.spellcasting; const d = state.derived!;
  const known = sc.known.includes(s.id), prepared = sc.prepared.includes(s.id), always = sc.alwaysPrepared.includes(s.id), fav = sc.favourites.includes(s.id);
  const prof = d.spellProfiles.find((p) => s.classes.includes(p.classId)) ?? d.spellProfiles[0];
  const needsPrep = d.spellProfiles.some((p) => p.preparedMax !== null);
  const note = textarea(sc.notes[s.id] ?? '', { rows: 2, 'aria-label': `Notes for ${s.name}` });
  const togglePrep = async () => {
    if (!prepared && s.level > 0 && prof?.preparedMax != null) {
      const cnt = sc.prepared.filter((id) => (byId(state.registry.spells, id)?.level ?? 0) > 0 && (byId(state.registry.spells, id)?.classes.includes(prof.classId) || c.classes.length === 1)).length;
      if (cnt >= prof.preparedMax && !(await confirmDialog('Preparation limit reached', `${prof.className} can prepare ${prof.preparedMax} spells. Prepare anyway as a custom ruling?`, 'Prepare anyway'))) return;
    }
    await change('spell', `${prepared ? 'Unprepared' : 'Prepared'} ${s.name}`, (dr) => { dr.spellcasting.prepared = prepared ? dr.spellcasting.prepared.filter((x) => x !== s.id) : [...dr.spellcasting.prepared, s.id]; if (!prepared && !dr.spellcasting.known.includes(s.id) && d.spellProfiles.some((p) => p.prepStyle !== 'prepared')) dr.spellcasting.known.push(s.id); });
  };
  return h('li', { class: `spell${prepared || always ? ' is-prepared' : ''}` }, h('details', null,
    h('summary', null, h('span', { class: 'spell-name' }, s.name), h('span', { class: 'spell-meta' }, `${ord(s.level)} · ${s.school}`),
      s.concentration ? h('span', { class: 'badge', title: 'Concentration' }, 'C') : null, s.ritual ? h('span', { class: 'badge', title: 'Ritual' }, 'R') : null,
      always ? h('span', { class: 'badge badge-ok' }, 'Always') : prepared ? h('span', { class: 'badge badge-ok' }, 'Prepared') : known ? h('span', { class: 'badge' }, 'Known') : null, fav ? h('span', { class: 'badge' }, '★') : null,
      s.source.origin !== 'srd' ? h('span', { class: 'badge badge-src' }, s.source.label) : null),
    h('dl', { class: 'deflist' }, ...[['Casting time', s.castingTime], ['Range', s.range], ['Components', s.components + (s.material ? ` (${s.material})` : '')], ['Duration', s.duration], ['Classes', s.classes.join(', ')], ['Source', s.source.label],
      ...(s.attack ? [['Attack', `${s.attack} spell attack ${prof ? sign(prof.attack.value) : ''}`]] : []), ...(s.save ? [['Save', `${ABILITY_NAMES[s.save]} DC ${prof?.dc.value ?? '—'}`]] : []), ...(s.damage ? [['Damage', `${s.damage} ${s.damageType ?? ''}`]] : [])].flatMap(([k, v]) => [h('dt', null, k!), h('dd', null, v!)])),
    h('p', null, s.summary), s.higher ? h('p', { class: 'hint' }, `At higher levels: ${s.higher}`) : null,
    field('My notes', note), h('div', { class: 'row wrap' },
      btn('Cast', () => castDialog(c, s), 'btn btn-primary btn-small'),
      ...textFor(state.registry, 'spell', s.id, c.ruleset).slice(0, 1).map((t) => h('a', { href: `#/compendium/spell/${encodeURIComponent(t.packId)}/${encodeURIComponent(t.id)}`, class: 'btn btn-small btn-ghost' }, 'Full text')),
      btn(known ? 'Forget' : 'Learn', () => void change('spell', `${known ? 'Forgot' : 'Learned'} ${s.name}`, (dr) => { dr.spellcasting.known = known ? dr.spellcasting.known.filter((x) => x !== s.id) : [...dr.spellcasting.known, s.id]; if (known) dr.spellcasting.prepared = dr.spellcasting.prepared.filter((x) => x !== s.id); }), 'btn btn-small'),
      needsPrep && !always ? btn(prepared ? 'Unprepare' : 'Prepare', () => void togglePrep(), 'btn btn-small') : null,
      btn(fav ? '★ Unfavourite' : '☆ Favourite', () => void change('spell', `${fav ? 'Unfavourited' : 'Favourited'} ${s.name}`, (dr) => { dr.spellcasting.favourites = fav ? dr.spellcasting.favourites.filter((x) => x !== s.id) : [...dr.spellcasting.favourites, s.id]; }, { silent: true }), 'btn btn-small btn-ghost'),
      btn('Save note', () => void change('note', `Note on ${s.name}`, (dr) => { dr.spellcasting.notes[s.id] = note.value; }), 'btn btn-small btn-ghost'))));
}

export function castDialog(c: Character, s: SpellDef): void {
  const d = state.derived!; const sc = c.spellcasting;
  const prof = d.spellProfiles.find((p) => s.classes.includes(p.classId)) ?? d.spellProfiles[0];
  type Opt = { value: string; label: string; disabled?: boolean };
  const opts: Opt[] = [];
  if (s.level === 0) opts.push({ value: 'none', label: 'Cantrip: no slot needed' });
  else {
    d.slots.filter((x) => x.level >= s.level).forEach((x) => opts.push({ value: `slot:${x.level}`, label: `Level ${x.level} slot (${x.max - x.used}/${x.max} left)${x.level > s.level ? ' – upcast' : ''}`, disabled: x.used >= x.max }));
    if (d.pact.count && d.pact.level >= s.level) opts.push({ value: 'pact', label: `Pact slot, cast at level ${d.pact.level} (${d.pact.count - d.pact.used}/${d.pact.count} left)`, disabled: d.pact.used >= d.pact.count });
    if (s.ritual) opts.push({ value: 'ritual', label: 'As a ritual (+10 minutes, no slot)' });
    sc.freeCasts.filter((fc) => fc.spellId === s.id).forEach((fc) => opts.push({ value: `free:${fc.id}`, label: `${fc.name} (${fc.max - fc.used}/${fc.max} left)`, disabled: fc.used >= fc.max }));
    c.inventory.filter((i) => i.charges && i.charges.current > 0).forEach((i) => opts.push({ value: `item:${i.id}`, label: `${i.name}: 1 charge (${i.charges!.current} left)` }));
    opts.push({ value: 'none', label: 'Do not consume anything (already tracked / custom ruling)' });
  }
  const firstOk = opts.find((o) => !o.disabled)?.value ?? 'none';
  const sel = select(opts, firstOk, { 'aria-label': 'Resource to use' });
  const known = sc.known.includes(s.id) || sc.prepared.includes(s.id) || sc.alwaysPrepared.includes(s.id);
  modal(`Cast ${s.name}`, h('div', null,
    !known ? h('p', { class: 'notice notice-warn' }, 'This spell is not known or prepared by this character.') : null,
    h('dl', { class: 'deflist' }, ...[['Level', ord(s.level)], ['Casting time', s.castingTime], ['Range', s.range], ['Components', s.components], ...(s.material ? [['Material', s.material]] : []), ['Duration', s.duration],
      ...(s.attack && prof ? [['Spell attack', sign(prof.attack.value)]] : []), ...(s.save && prof ? [['Save', `${ABILITY_NAMES[s.save]} DC ${prof.dc.value}`]] : [])].flatMap(([k, v]) => [h('dt', null, k!), h('dd', null, v!)])),
    /consumed|worth/i.test(s.material ?? '') ? h('p', { class: 'notice notice-warn' }, 'This spell needs a costly material component. Check your inventory.') : null,
    s.concentration && c.concentration ? h('p', { class: 'notice notice-warn' }, `You are concentrating on ${c.concentration.name}. Casting this ends it.`) : null,
    field('Use', sel), s.higher ? h('p', { class: 'hint' }, `Higher levels: ${s.higher}`) : null),
    [{ label: 'Cancel', cls: 'btn btn-ghost' }, { label: 'Cast', cls: 'btn btn-primary', run: async () => {
      const v = sel.value;
      if (opts.find((o) => o.value === v)?.disabled) { toast('That resource has no uses left.', 'error'); return false; }
      if (s.concentration && c.concentration && !(await confirmDialog('Replace concentration?', `End concentration on ${c.concentration.name} and concentrate on ${s.name}?`, 'Replace'))) return false;
      const castLevel = v.startsWith('slot:') ? Number(v.slice(5)) : v === 'pact' ? d.pact.level : s.level;
      const how = v.startsWith('slot:') ? `level ${castLevel} slot` : v === 'pact' ? 'pact slot' : v === 'ritual' ? 'ritual' : v.startsWith('free:') ? 'free casting' : v.startsWith('item:') ? 'item charge' : 'no resource';
      const ev = await change('spell', `Cast ${s.name}${s.level ? ` at level ${castLevel}` : ''} (${how})`, (dr) => {
        if (v.startsWith('slot:')) { const i = castLevel - 1; for (let k = 0; k <= i; k++) dr.spellcasting.slotsUsed[k] ??= 0; dr.spellcasting.slotsUsed[i] = (dr.spellcasting.slotsUsed[i] ?? 0) + 1; }
        if (v === 'pact') dr.spellcasting.pactUsed += 1;
        if (v.startsWith('free:')) { const fc = dr.spellcasting.freeCasts.find((x) => x.id === v.slice(5)); if (fc) fc.used += 1; }
        if (v.startsWith('item:')) { const it = dr.inventory.find((x) => x.id === v.slice(5)); if (it?.charges) it.charges.current -= 1; }
        if (s.concentration) { dr.effects = dr.effects.filter((e) => !e.concentrationLinked); dr.concentration = { spellId: s.id, name: s.name, since: nowIso() }; }
        if (s.id === 'mage-armor') dr.effects.push({ id: uid(), name: 'Mage Armor', startedAt: nowIso(), duration: '8 hours', source: 'Spell', concentrationLinked: false, modifiers: [{ target: 'acBaseUnarmored', op: 'setMin', value: 13, note: 'Mage Armor' }], endCondition: 'Donning armour or dismissed', notes: '' });
        if (s.id === 'shield') dr.effects.push({ id: uid(), name: 'Shield (spell)', startedAt: nowIso(), duration: 'Until start of your next turn', source: 'Spell', concentrationLinked: false, modifiers: [{ target: 'ac', op: 'add', value: 5, note: 'Shield spell' }], endCondition: 'Start of your next turn', notes: '' });
        if (s.id === 'bless' || s.id === 'hex' || s.id === 'hunters-mark') dr.effects.push({ id: uid(), name: s.name, startedAt: nowIso(), duration: s.duration, source: 'Spell', concentrationLinked: true, modifiers: [], endCondition: 'Concentration ends', notes: s.summary });
      });
      if (ev && prof && (s.attack || s.damage)) {
        modal(`${s.name}: rolls`, h('div', { class: 'row wrap' },
          s.attack ? btn(`Attack ${sign(prof.attack.value)}`, () => void rollAndShow(`${s.name} attack`, `1d20${prof.attack.value >= 0 ? '+' : ''}${prof.attack.value}`), 'btn btn-roll') : null,
          s.damage ? btn(`Damage ${s.damage}`, () => void rollAndShow(`${s.name} damage`, s.damage!), 'btn btn-roll') : null,
          s.damage && s.attack ? btn('Critical damage', () => void rollAndShow(`${s.name} critical`, s.damage!, { critical: true }), 'btn btn-roll') : null,
          s.save ? h('p', null, `Targets make a ${ABILITY_NAMES[s.save]} save against DC ${prof.dc.value}.`) : null,
          castLevel > s.level && s.higher ? h('p', { class: 'hint' }, `Cast at level ${castLevel}: ${s.higher} Adjust the dice in the dice roller if needed.`) : null));
      }
      return true;
    } }]);
}

function freeCasts(c: Character): HTMLElement {
  const sc = c.spellcasting;
  const name = input({ placeholder: 'e.g. Infernal Legacy: hellish rebuke', 'aria-label': 'Source name' });
  const spell = select(state.registry.spells.map((s) => ({ value: s.id, label: s.name })), state.registry.spells[0]?.id ?? '', { 'aria-label': 'Spell' });
  const max = num(1, { min: 1, 'aria-label': 'Uses' });
  const rec = select([{ value: 'long', label: 'Long rest' }, { value: 'short', label: 'Short rest' }, { value: 'dawn', label: 'Dawn' }, { value: 'none', label: 'Never' }], 'long', { 'aria-label': 'Recovery' });
  return h('div', null, sc.freeCasts.length ? h('ul', { class: 'res-list' }, sc.freeCasts.map((fc) => h('li', null, h('strong', null, fc.name), h('span', null, byId(state.registry.spells, fc.spellId)?.name ?? fc.spellId), h('span', { class: 'num' }, `${fc.max - fc.used}/${fc.max}`),
    btn('Cast', () => { const s = byId(state.registry.spells, fc.spellId); if (s) castDialog(c, s); }, 'btn btn-small'), btn('Delete', () => void change('spell', `Removed free casting ${fc.name}`, (dr) => { dr.spellcasting.freeCasts = dr.spellcasting.freeCasts.filter((x) => x.id !== fc.id); }), 'btn btn-small btn-ghost')))) : h('p', { class: 'hint' }, 'Track species, feat or item spells that do not use slots.'),
    h('div', { class: 'row wrap' }, name, spell, max, rec, btn('Add', () => { if (!name.value.trim()) return toast('Enter a name.', 'warn'); void change('spell', `Added free casting ${name.value.trim()}`, (dr) => { dr.spellcasting.freeCasts.push({ id: uid(), spellId: spell.value, name: name.value.trim(), max: Number(max.value) || 1, used: 0, recovery: rec.value as RecoveryTiming }); }); }, 'btn btn-small')));
}
