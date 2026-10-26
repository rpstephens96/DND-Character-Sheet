// Shared UI components: calculation breakdowns, roll helpers, headers.
import type { Stat, Part } from '../rules/calc.js';
import type { RollRecord, Character } from '../types.js';
import { roll, type RollOptions, type RollResult } from '../rules/dice.js';
import { uid, nowIso } from '../rules/events.js';
import { h, btn, modal, sign, announce, toast, link, empty, num, field } from './dom.js';
import { state, change } from './store.js';

/** A tappable statistic that opens its "How is this calculated?" breakdown. */
export function statButton(stat: Stat, opts: { label?: string; display?: string; cls?: string; signed?: boolean } = {}): HTMLElement {
  const shown = opts.display ?? (opts.signed ? sign(stat.value) : String(stat.value));
  return h('button', { type: 'button', class: `stat ${opts.cls ?? ''}${stat.overridden ? ' is-override' : ''}`, 'aria-label': `${opts.label ?? stat.label}: ${shown}. Show calculation`, on: { click: () => showBreakdown(stat) } },
    h('span', { class: 'stat-value' }, shown), h('span', { class: 'stat-label' }, opts.label ?? stat.label), stat.overridden ? h('span', { class: 'badge badge-warn' }, 'Override') : null);
}

export function breakdownTable(parts: Part[], total: number, label = 'Result'): HTMLElement {
  return h('table', { class: 'breakdown' }, h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Contribution'), h('th', { scope: 'col' }, 'Value'), h('th', { scope: 'col' }, 'Source'))),
    h('tbody', null, parts.map((p) => h('tr', null, h('td', null, p.label), h('td', { class: 'num' }, sign(p.value)), h('td', { class: 'src' }, p.source)))),
    h('tfoot', null, h('tr', null, h('th', { scope: 'row' }, label), h('td', { class: 'num' }, String(Math.round(total * 100) / 100)), h('td', null, ''))));
}

export function showBreakdown(stat: Stat): void {
  const c = state.active;
  const ovInput = num(stat.overridden ? stat.value : stat.calculated, { 'aria-label': 'Override value' });
  const body = h('div', null,
    h('p', { class: 'lede' }, 'How is this calculated?'),
    breakdownTable(stat.parts, stat.calculated, 'Calculated total'),
    stat.notes.map((n) => h('p', { class: 'hint' }, n)),
    stat.overridden ? h('p', { class: 'notice notice-warn' }, `A manual override of ${stat.value} replaces the calculated ${stat.calculated}.`) : null,
    c && stat.key && !stat.key.startsWith('weight') ? h('details', { class: 'override' }, h('summary', null, 'Manual override (custom ruling)'),
      h('p', { class: 'hint' }, 'Overrides are recorded in the audit history and flagged everywhere the value appears. They never change silently.'),
      field('Override value', ovInput),
      h('div', { class: 'row' },
        btn('Apply override', async () => { const v = Number(ovInput.value); if (!Number.isFinite(v)) return toast('Enter a number.', 'error'); await change('override', `Override ${stat.label} = ${v} (calculated ${stat.calculated})`, (d) => { d.overrides[stat.key] = v; }); document.querySelector('dialog')?.close(); document.querySelector('dialog')?.remove(); }, 'btn btn-small'),
        stat.overridden ? btn('Remove override', async () => { await change('override', `Removed override on ${stat.label}`, (d) => { delete d.overrides[stat.key]; }); document.querySelector('dialog')?.close(); document.querySelector('dialog')?.remove(); }, 'btn btn-small btn-ghost') : null)) : null);
  modal(`${stat.label}: ${stat.value}`, body);
}

/** Roll, record to history and show an auditable result. */
export async function rollAndShow(label: string, expression: string, opts: RollOptions = {}, characterId?: string): Promise<RollResult | null> {
  let r: RollResult;
  try { r = roll(expression, opts); } catch (e) { toast((e as Error).message, 'error'); return null; }
  const rec: RollRecord = { id: uid(), ts: nowIso(), label, expression, dice: r.dice, modifier: r.modifier, total: r.total, mode: r.mode, manual: !!opts.manual, characterId: characterId ?? state.active?.id };
  void state.repo.put('rolls', rec);
  showRoll(rec);
  return r;
}

export function rollFaces(rec: Pick<RollRecord, 'dice' | 'modifier'>): HTMLElement {
  return h('div', { class: 'dice-faces', 'aria-label': 'Individual dice' }, rec.dice.map((d) => h('span', { class: `die${d.kept ? '' : ' dropped'}${d.sides === 20 && d.value === 20 ? ' nat20' : ''}${d.sides === 20 && d.value === 1 ? ' nat1' : ''}`, title: `d${d.sides}${d.kept ? '' : ' (not kept)'}` }, h('small', null, `d${d.sides}`), String(d.value))),
    rec.modifier ? h('span', { class: 'die mod' }, h('small', null, 'mod'), sign(rec.modifier)) : null);
}

export function showRoll(rec: RollRecord): void {
  const host = document.getElementById('roll-tray'); if (!host) return;
  const d20 = rec.dice.find((d) => d.sides === 20 && d.kept);
  const crit = d20?.value === 20 ? 'Natural 20!' : d20?.value === 1 ? 'Natural 1' : '';
  const el = h('div', { class: 'roll-card', role: 'status' }, h('div', { class: 'roll-head' }, h('strong', null, rec.label), btn('✕', () => el.remove(), 'icon-btn', { 'aria-label': 'Dismiss roll' })),
    h('div', { class: 'roll-total' }, String(rec.total)), crit ? h('div', { class: 'roll-crit' }, crit) : null,
    h('div', { class: 'roll-expr' }, `${rec.expression}${rec.mode !== 'normal' ? ` (${rec.mode})` : ''}${rec.manual ? ' · physical dice' : ''}`), rollFaces(rec));
  host.prepend(el); while (host.children.length > 3) host.lastElementChild?.remove();
  announce(`${rec.label}: ${rec.total}${crit ? `, ${crit}` : ''}`);
  setTimeout(() => el.remove(), 12000);
}

/** d20 roller with advantage controls (long-press free; explicit buttons). */
export function d20Buttons(label: string, bonus: number): HTMLElement {
  const expr = `1d20${bonus >= 0 ? '+' : ''}${bonus}`;
  return h('span', { class: 'roll-group' },
    btn(h('span', null, '🎲 ', sign(bonus)), () => void rollAndShow(label, expr), 'btn btn-roll', { 'aria-label': `Roll ${label} ${sign(bonus)}` }),
    btn('Adv', () => void rollAndShow(`${label} (advantage)`, expr, { mode: 'advantage' }), 'btn btn-roll btn-small', { 'aria-label': `Roll ${label} with advantage` }),
    btn('Dis', () => void rollAndShow(`${label} (disadvantage)`, expr, { mode: 'disadvantage' }), 'btn btn-roll btn-small', { 'aria-label': `Roll ${label} with disadvantage` }));
}

export function needCharacter(id: string | undefined): Character | HTMLElement {
  const c = id ? state.characters.find((x) => x.id === id) : state.active;
  if (!c) return empty('No character selected. Choose or create one from the library.', link('#/', 'Open character library', 'btn btn-primary'));
  if (state.active?.id !== c.id) { state.active = c; }
  return c;
}

export function pageHeader(title: string, sub?: string, ...actions: (HTMLElement | null)[]): HTMLElement {
  return h('header', { class: 'page-head' }, h('div', null, h('h1', null, title), sub ? h('p', { class: 'sub' }, sub) : null), h('div', { class: 'page-actions' }, ...actions));
}

export function classLine(c: Character): string {
  return c.classes.map((cl) => { const d = state.registry.classes.find((x) => x.id === cl.classId); const s = state.registry.subclasses.find((x) => x.id === cl.subclassId); return `${d?.name ?? cl.classId} ${cl.level}${s ? ` (${s.name})` : ''}`; }).join(' / ') || 'No class';
}

export const charTabs = (id: string, active: string) => h('nav', { class: 'subtabs', 'aria-label': 'Character sections' },
  [['', 'Dashboard'], ['/sheet', 'Sheet'], ['/features', 'Features'], ['/levelup', 'Level up'], ['/timeline', 'Timeline'], ['/audit', 'Audit']].map(([p, l]) =>
    h('a', { href: `#/c/${id}${p}`, class: active === l ? 'active' : '', 'aria-current': active === l ? 'page' : undefined }, l!)));
