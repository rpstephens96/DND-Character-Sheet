// Structured editors for user-entered classes and subclasses (no JSON required).
// They edit a plain data object that matches ClassDef / SubclassDef; validation lives in validateCustom.
import type { Ability, Modifier, RecoveryTiming } from '../../types.js';
import { ABILITIES } from '../../types.js';
import { h, btn, card, field, input, num, select, textarea, toast, fill } from '../dom.js';
import { ABILITY_NAMES, cap } from '../../rules/calc.js';
import { SKILLS } from '../../data/srd-classes.js';
import { RESOURCE_FORMULAS } from '../../rules/features.js';
import { state } from '../store.js';

type D = Record<string, unknown>;
type Mark = () => void;
const arr = <T>(d: D, k: string): T[] => (Array.isArray(d[k]) ? (d[k] as T[]) : ((d[k] = []) as T[]));
const obj = <T extends object>(d: D, k: string, init: T): T => (typeof d[k] === 'object' && d[k] !== null ? (d[k] as T) : ((d[k] = init) as T));

function checks<T extends string>(label: string, options: [T, string][], selected: T[], onChange: (v: T[]) => void, mark: Mark): HTMLElement {
  return h('fieldset', { class: 'check-group' }, h('legend', null, label), options.map(([v, l]) => h('label', { class: 'check' },
    h('input', { type: 'checkbox', checked: selected.includes(v), on: { change: (e) => { const on = (e.target as HTMLInputElement).checked; onChange(on ? [...selected.filter((x) => x !== v), v] : selected.filter((x) => x !== v)); selected = on ? [...selected, v] : selected.filter((x) => x !== v); mark(); } } }), ` ${l}`)));
}
const listInput = (d: D, k: string, mark: Mark, placeholder = '') => { const el = input({ value: arr<string>(d, k).join(', '), placeholder }); el.addEventListener('input', () => { d[k] = el.value.split(',').map((x) => x.trim()).filter(Boolean); mark(); }); return el; };
const numInput = (d: D, k: string, mark: Mark, attrs: Record<string, unknown> = {}) => { const el = num(Number(d[k] ?? 0), attrs); el.addEventListener('input', () => { d[k] = Number(el.value); mark(); }); return el; };
const textInput = (d: D, k: string, mark: Mark, placeholder = '') => { const el = input({ value: String(d[k] ?? ''), placeholder }); el.addEventListener('input', () => { d[k] = el.value; mark(); }); return el; };
const selectInput = (d: D, k: string, opts: [string, string][], mark: Mark, conv: (v: string) => unknown = (v) => v) => { const el = select(opts.map(([v, l]) => ({ value: v, label: l })), String(d[k] ?? opts[0]![0])); el.addEventListener('change', () => { d[k] = conv(el.value); mark(); }); return el; };
const ABIL_OPTS = ABILITIES.map((a): [Ability, string] => [a, ABILITY_NAMES[a]]);

/** Feature rows: level, name, description and an optional automatic bonus. Used by classes and subclasses. */
export function featureRows(d: D, mark: Mark, levelLabel = 'Level'): HTMLElement {
  const box = h('div', { class: 'feature-rows' });
  type F = { level: number; name: string; summary?: string; modifiers?: Modifier[] };
  const list = arr<F>(d, 'features');
  const draw = () => {
    list.sort((a, b) => a.level - b.level);
    fill(box, list.length ? h('ol', { class: 'frow-list' }, list.map((f, i) => {
      const mod = f.modifiers?.[0];
      const tgt = select([{ value: '', label: 'No automatic bonus' }, ...['ac', 'speed', 'initiative', 'hpMax', 'hpPerLevel', 'attack', 'damage', 'spellDC', 'spellAttack', 'save:all'].map((t) => ({ value: t, label: t }))], mod?.target ?? '', { 'aria-label': `Bonus for ${f.name || 'feature'}` });
      const val = num(mod?.value ?? 1, { 'aria-label': 'Bonus amount', class: 'num-sm' });
      const sync = () => { f.modifiers = tgt.value ? [{ target: tgt.value, op: 'add', value: Number(val.value) || 0, note: f.name }] : undefined; mark(); };
      tgt.addEventListener('change', sync); val.addEventListener('input', sync);
      return h('li', { class: 'frow' },
        h('div', { class: 'row wrap' },
          h('label', null, `${levelLabel} `, (() => { const el = num(f.level, { min: 1, max: 20, class: 'num-sm', 'aria-label': `${levelLabel} for feature ${i + 1}` }); el.addEventListener('change', () => { f.level = Math.max(1, Math.min(20, Number(el.value) || 1)); mark(); draw(); }); return el; })()),
          (() => { const el = input({ value: f.name, placeholder: 'Feature name', 'aria-label': `Name of feature ${i + 1}` }); el.addEventListener('input', () => { f.name = el.value; mark(); }); return el; })(),
          btn('Remove', () => { list.splice(i, 1); mark(); draw(); }, 'btn btn-small btn-ghost')),
        (() => { const el = textarea(f.summary ?? '', { rows: 2, placeholder: 'What it does (paste or summarise)', 'aria-label': `Description of feature ${i + 1}` }); el.addEventListener('input', () => { f.summary = el.value; mark(); }); return el; })(),
        h('div', { class: 'row wrap' }, tgt, val, h('span', { class: 'hint' }, 'Optional; more mechanics can be added on the character sheet.')));
    })) : h('p', { class: 'hint' }, 'No features yet.'),
    btn('+ Add feature', () => { list.push({ level: list.length ? list[list.length - 1]!.level : 1, name: '', summary: '' }); mark(); draw(); }, 'btn btn-small'));
  };
  draw();
  return box;
}

/** Limited-use resources gained from the class/subclass: uses per level or a formula. */
export function resourceRows(d: D, mark: Mark, idPrefix: string): HTMLElement {
  const box = h('div');
  type R = { id: string; name: string; recovery: RecoveryTiming; byLevel?: (number | null)[]; formula?: string; shortRestFromLevel?: number };
  const list = arr<R>(d, 'resources');
  const usesText = (r: R) => r.formula ?? (r.byLevel ?? []).map((v) => (v === null ? '-' : v === -1 ? '∞' : String(v))).join(', ');
  const parse = (r: R, t: string): string | null => {
    const v = t.trim();
    if (RESOURCE_FORMULAS.includes(v)) { r.formula = v; delete r.byLevel; return null; }
    const parts = v.split(/[,\s]+/).filter(Boolean);
    if (parts.length === 1 && /^\d+$/.test(parts[0]!)) { r.byLevel = Array(20).fill(Number(parts[0])); delete r.formula; return null; }
    if (parts.length !== 20) return 'Enter one number, a formula, or 20 values (one per level, “-” where the class does not have it yet).';
    const vals = parts.map((p) => (p === '-' ? null : p === '∞' || p === 'u' ? -1 : Number(p)));
    if (vals.some((x) => x !== null && !Number.isFinite(x))) return 'Values must be numbers, “-” or “∞”.';
    r.byLevel = vals as (number | null)[]; delete r.formula; return null;
  };
  const draw = () => fill(box, list.length ? h('ul', { class: 'edit-list' }, list.map((r, i) => {
    const err = h('p', { class: 'field-error', hidden: true });
    const uses = input({ value: usesText(r), 'aria-label': `Uses of ${r.name || 'resource'}`, placeholder: '2, 2, 3 … or abilityMod:wis' });
    uses.addEventListener('change', () => { const e = parse(r, uses.value); err.hidden = !e; err.textContent = e ?? ''; mark(); });
    return h('li', { class: 'frow' }, h('div', { class: 'grid-2' },
      field('Name', (() => { const el = input({ value: r.name }); el.addEventListener('input', () => { r.name = el.value; mark(); }); return el; })()),
      field('Recovers on', (() => { const el = select([['long', 'Long rest'], ['short', 'Short or long rest'], ['dawn', 'Dawn'], ['none', 'Never']].map(([v, l]) => ({ value: v!, label: l! })), r.recovery); el.addEventListener('change', () => { r.recovery = el.value as RecoveryTiming; mark(); }); return el; })()),
      field('Uses', uses, { hint: `One number for every level, 20 comma-separated values (levels 1–20, “-” = not yet), or a formula: ${RESOURCE_FORMULAS.join(', ')}` }),
      field('Becomes short rest from level (optional)', (() => { const el = num(r.shortRestFromLevel ?? 0, { min: 0, max: 20 }); el.addEventListener('input', () => { const n = Number(el.value); if (n > 0) r.shortRestFromLevel = n; else delete r.shortRestFromLevel; mark(); }); return el; })())),
      err, btn('Remove resource', () => { list.splice(i, 1); mark(); draw(); }, 'btn btn-small btn-ghost'));
  })) : h('p', { class: 'hint' }, 'None (e.g. Rage, Ki points, Channel Divinity).'),
  btn('+ Add resource', () => { list.push({ id: `${idPrefix}-res-${list.length + 1}`, name: '', recovery: 'long', byLevel: Array(20).fill(1) }); mark(); draw(); }, 'btn btn-small'));
  draw();
  return box;
}

/** Spells a subclass always has prepared, by level. */
export function preparedRows(d: D, mark: Mark): HTMLElement {
  const box = h('div');
  type P = { level: number; spells: string[] };
  const list = arr<P>(d, 'alwaysPrepared');
  const spells = state.registry.spells;
  const draw = () => fill(box, h('datalist', { id: 'sub-spells' }, spells.map((s) => h('option', { value: s.name }))),
    list.length ? h('ul', { class: 'edit-list' }, list.map((g, i) => h('li', null,
      h('label', null, 'Level ', (() => { const el = num(g.level, { min: 1, max: 20, class: 'num-sm' }); el.addEventListener('change', () => { g.level = Number(el.value) || 1; mark(); }); return el; })()),
      (() => { const el = input({ value: g.spells.map((id) => spells.find((s) => s.id === id)?.name ?? id).join(', '), placeholder: 'Spell names, comma-separated', 'aria-label': `Spells at level ${g.level}` });
        el.addEventListener('change', () => { const names = el.value.split(',').map((x) => x.trim()).filter(Boolean); const missing: string[] = [];
          g.spells = names.map((n) => { const s = spells.find((x) => x.name.toLowerCase() === n.toLowerCase() || x.id === n); if (!s) missing.push(n); return s?.id ?? ''; }).filter(Boolean);
          if (missing.length) toast(`Not found: ${missing.join(', ')}. Add them under My content or install a content pack.`, 'warn'); mark(); }); return el; })(),
      btn('Remove', () => { list.splice(i, 1); mark(); draw(); }, 'btn btn-small btn-ghost')))) : h('p', { class: 'hint' }, 'None.'),
    btn('+ Add spells at a level', () => { list.push({ level: 3, spells: [] }); mark(); draw(); }, 'btn btn-small'));
  draw();
  return box;
}

/** The full class form. */
export function classForm(d: D, mark: Mark, idPrefix: string): HTMLElement[] {
  const skillChoices = obj(d, 'skillChoices', { count: 2, from: [] as string[] });
  const mc = obj(d, 'multiclassReq', {} as { all?: Partial<Record<Ability, number>>; any?: Partial<Record<Ability, number>> });
  const mcMode = mc.any && Object.keys(mc.any).length ? 'any' : 'all';
  const mcVals = { ...(mc.all ?? {}), ...(mc.any ?? {}) } as Partial<Record<Ability, number>>;
  const writeMc = (mode: string) => { const vals = Object.fromEntries(Object.entries(mcVals).filter(([, v]) => (v ?? 0) > 0)); d.multiclassReq = mode === 'any' ? { any: vals } : { all: vals }; mark(); };
  let mode = mcMode;
  const grid = h('div', { class: 'level-grid-wrap table-wrap' });
  const drawGrid = () => {
    const asi = arr<number>(d, 'asiLevels');
    const caster = d.casterType !== 'none' && d.casterType;
    const cantrips = (d.cantrips as number[] | null | undefined) ?? null;
    const known = (d.spellsKnown as number[] | null | undefined) ?? null;
    const setArr = (k: 'cantrips' | 'spellsKnown', i: number, v: number) => { const a = ((d[k] as number[] | null) ?? Array(20).fill(0)) as number[]; a[i] = v; d[k] = a.every((x) => !x) ? null : a; mark(); };
    fill(grid, h('table', { class: 'level-grid' }, h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Level'), h('th', { scope: 'col' }, 'Ability Score Improvement'), caster ? h('th', { scope: 'col' }, 'Cantrips known') : null, caster && d.prepStyle === 'known' ? h('th', { scope: 'col' }, 'Spells known') : null, h('th', { scope: 'col' }, 'Features'))),
      h('tbody', null, Array.from({ length: 20 }, (_, i) => h('tr', null, h('th', { scope: 'row' }, String(i + 1)),
        h('td', null, h('input', { type: 'checkbox', checked: asi.includes(i + 1), 'aria-label': `ASI at level ${i + 1}`, on: { change: (e) => { const on = (e.target as HTMLInputElement).checked; d.asiLevels = on ? [...asi.filter((x) => x !== i + 1), i + 1].sort((a, b) => a - b) : asi.filter((x) => x !== i + 1); mark(); } } })),
        caster ? h('td', null, (() => { const el = num(cantrips?.[i] ?? 0, { min: 0, max: 10, class: 'num-sm', 'aria-label': `Cantrips at level ${i + 1}` }); el.addEventListener('input', () => setArr('cantrips', i, Number(el.value) || 0)); return el; })()) : null,
        caster && d.prepStyle === 'known' ? h('td', null, (() => { const el = num(known?.[i] ?? 0, { min: 0, max: 30, class: 'num-sm', 'aria-label': `Spells known at level ${i + 1}` }); el.addEventListener('input', () => setArr('spellsKnown', i, Number(el.value) || 0)); return el; })()) : null,
        h('td', { class: 'small-print' }, ((d.features as { level: number; name: string }[] | undefined) ?? []).filter((f) => f.level === i + 1).map((f) => f.name || '(unnamed)').join(', ')))))));
  };
  const redrawOnCaster = () => { mark(); drawGrid(); };
  drawGrid();
  return [
    card('Class basics', h('div', { class: 'grid-2' },
      field('Hit die', selectInput(d, 'hitDie', [['6', 'd6'], ['8', 'd8'], ['10', 'd10'], ['12', 'd12']], mark, Number), { required: true, name: 'data.hitDie' }),
      field(`${'Subclass'} chosen at level`, numInput(d, 'subclassLevel', mark, { min: 1, max: 20 }), { required: true, name: 'data.subclassLevel' }),
      field('Subclass is called', textInput(d, 'subclassLabel', mark, 'e.g. Primal Path, Sacred Oath')),
      field('Unarmoured Defence', selectInput(d, 'unarmoredDefense', [['', 'None'], ...ABIL_OPTS.map(([a, l]): [string, string] => [a, `10 + Dex + ${l}`])], mark, (v) => v || undefined))),
      checks('Primary abilities', ABIL_OPTS, arr<Ability>(d, 'primary'), (v) => (d.primary = v), mark),
      checks('Saving throw proficiencies', ABIL_OPTS, arr<Ability>(d, 'saves'), (v) => (d.saves = v), mark)),
    card('Proficiencies',
      checks('Armour', [['light', 'Light'], ['medium', 'Medium'], ['heavy', 'Heavy'], ['shield', 'Shields']], arr<string>(d, 'armor') as ('light' | 'medium' | 'heavy' | 'shield')[], (v) => (d.armor = v), mark),
      h('div', { class: 'grid-2' }, field('Weapons', listInput(d, 'weapons', mark, 'simple, martial, or names: rapier, longbow'), { hint: 'Comma-separated' }), field('Tools', listInput(d, 'tools', mark, "thieves' tools"), { hint: 'Comma-separated' })),
      h('div', { class: 'grid-2' }, field('Number of skills to choose', (() => { const el = num(skillChoices.count, { min: 0, max: 8 }); el.addEventListener('input', () => { skillChoices.count = Number(el.value) || 0; mark(); }); return el; })())),
      checks('Skills to choose from', Object.keys(SKILLS).map((s): [string, string] => [s, cap(s)]), skillChoices.from, (v) => (skillChoices.from = v), mark)),
    card('Multiclassing', h('div', { class: 'grid-2' },
      field('Requirement', (() => { const el = select([{ value: 'all', label: 'All of these scores' }, { value: 'any', label: 'Any one of these scores' }], mode); el.addEventListener('change', () => { mode = el.value; writeMc(mode); }); return el; })()),
      field('Proficiencies gained when multiclassing into it', listInput(d, 'multiclassProfs', mark, 'light, shield, simple'))),
      h('div', { class: 'grid-3' }, ABIL_OPTS.map(([a, l]) => field(`Minimum ${l}`, (() => { const el = num(mcVals[a] ?? 0, { min: 0, max: 20 }); el.addEventListener('input', () => { mcVals[a] = Number(el.value) || 0; writeMc(mode); }); return el; })(), { hint: '0 = no requirement' })))),
    card('Spellcasting', h('div', { class: 'grid-2' },
      field('Caster type', selectInput(d, 'casterType', [['none', 'None'], ['full', 'Full caster (like Wizard)'], ['half', 'Half caster (like Paladin)'], ['third', 'Third caster (like Eldritch Knight)'], ['pact', 'Pact Magic (like Warlock)']], redrawOnCaster)),
      field('Spellcasting ability', selectInput(d, 'spellAbility', [['', '—'], ...ABIL_OPTS], mark, (v) => v || undefined)),
      field('How spells are chosen', selectInput(d, 'prepStyle', [['known', 'Spells known'], ['prepared', 'Prepared each day'], ['spellbook', 'Spellbook']], redrawOnCaster)),
      field('Prepared spell limit', selectInput(d, 'preparedFormula', [['', 'Not used'], ['mod+level', 'Ability modifier + class level'], ['mod+halfLevel', 'Ability modifier + half class level']], mark, (v) => v || undefined))),
      h('p', { class: 'hint' }, 'Spell slots are calculated from the caster type, including multiclassing.')),
    card('Level progression', h('p', { class: 'hint' }, 'Tick the Ability Score Improvement levels and, for spellcasters, fill in cantrips and spells known. Features are listed from the table below.'), grid),
    card('Class features', featureRows(d, () => { mark(); drawGrid(); }, 'Level')),
    card('Limited-use resources', resourceRows(d, mark, idPrefix)),
    card('Starting equipment', field('Item ids', listInput(d, 'startingEquipment', mark, 'rapier, leather, shield'), { hint: `Weapons and armour by id, e.g. ${state.registry.weapons.slice(0, 4).map((w) => w.id).join(', ')}. Unknown ids are ignored.` })),
  ];
}
