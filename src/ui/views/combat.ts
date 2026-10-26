// Combat dashboard, damage/heal/temp HP, death saves, conditions, rests, initiative tracker and dice roller.
import type { Character, ActiveEffect, Encounter, Participant, RollRecord, Ability } from '../../types.js';
import { ABILITIES } from '../../types.js';
import { h, btn, card, field, input, num, select, textarea, modal, toast, sign, link, confirmDialog, empty, clear, put, fill } from '../dom.js';
import { state, change, setActive, eventsFor, undo, saveSettings, notify } from '../store.js';
import { needCharacter, pageHeader, statButton, d20Buttons, rollAndShow, rollFaces } from '../components.js';
import { attacksPanel, resourcesPanel, hpBar } from './character.js';
import { proposeDamage, applyDamage, applyHealing, applyTempHp, recordDeathSave, suggestDefense, type DefenseChoice } from '../../rules/combat.js';
import { planShortRest, applyShortRest, planLongRest, applyLongRest } from '../../rules/rest.js';
import { roll, parseDice } from '../../rules/dice.js';
import { uid, nowIso } from '../../rules/events.js';
import { ABILITY_NAMES, cap } from '../../rules/calc.js';
import { castDialog } from './spells.js';
import { byId } from '../../data/registry.js';

const DAMAGE_TYPES = ['', 'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];

/** Resolve "12" or "2d6+3" into a number (rolling if needed, and logging the roll). */
async function amountFrom(text: string, label: string): Promise<number | null> {
  const t = text.trim();
  if (!t) { toast('Enter an amount or a dice expression.', 'error'); return null; }
  if (/^\d+$/.test(t)) return Number(t);
  try { parseDice(t); } catch (e) { toast((e as Error).message, 'error'); return null; }
  const r = await rollAndShow(label, t); return r ? Math.max(0, r.total) : null;
}

export async function combatView(p: Record<string, string>): Promise<HTMLElement> {
  const c = needCharacter(p.id); if (c instanceof HTMLElement) return c;
  setActive(c); const d = state.derived!;
  const recent = (await eventsFor(c.id)).filter((e) => !e.undone).slice(0, 8);
  const consumables = c.inventory.filter((i) => i.category === 'consumable' || i.category === 'ammunition' || i.charges);
  const favSpells = [...new Set([...c.spellcasting.favourites, ...c.spellcasting.prepared, ...c.spellcasting.alwaysPrepared])].map((id) => byId(state.registry.spells, id)).filter((s) => !!s).slice(0, 8);
  const down = c.hp.current === 0 && !c.deathSaves.dead;

  return h('div', { class: 'page combat' },
    pageHeader(`${c.name}`, 'Combat mode', link(`#/c/${c.id}`, 'Dashboard', 'btn btn-ghost btn-small'), link('#/initiative', 'Initiative', 'btn btn-ghost btn-small')),
    h('section', { class: 'combat-hud card', 'aria-label': 'Vitals' },
      h('div', { class: 'hp-line' }, h('span', { class: 'hp-big' }, String(c.hp.current), h('small', null, ` / ${d.hpMax.value}`)), c.hp.temp ? h('span', { class: 'badge' }, `+${c.hp.temp} temp`) : null, c.deathSaves.dead ? h('span', { class: 'badge badge-danger' }, 'Dead') : null),
      hpBar(c, d.hpMax.value),
      h('div', { class: 'hud-actions' }, btn('Damage', () => damageDialog(c), 'btn btn-danger btn-lg'), btn('Heal', () => healDialog(c), 'btn btn-ok btn-lg'), btn('Temp HP', () => tempDialog(c), 'btn btn-lg')),
      h('div', { class: 'stat-row' }, statButton(d.ac, { label: 'AC' }), h('div', { class: 'stat-stack' }, statButton(d.initiative, { label: 'Init', signed: true }), btn('Roll', () => void rollAndShow('Initiative', `1d20${d.initiative.value >= 0 ? '+' : ''}${d.initiative.value}`), 'btn btn-roll btn-small')), statButton(d.speed, { label: 'Speed', display: `${d.speed.value} ft` })),
      down ? deathSaves(c) : null,
      h('div', { class: 'row wrap' },
        h('label', { class: 'check big' }, h('input', { type: 'checkbox', checked: c.reactionUsed, on: { change: (e) => void change('edit', (e.target as HTMLInputElement).checked ? 'Reaction used' : 'Reaction available', (dr) => { dr.reactionUsed = (e.target as HTMLInputElement).checked; }, { silent: true }) } }), ' Reaction used'),
        c.concentration ? h('span', { class: 'badge badge-conc' }, `Concentrating: ${c.concentration.name}`, btn('End', () => void change('condition', `Ended concentration on ${c.concentration!.name}`, (dr) => { delete dr.concentration; dr.effects = dr.effects.filter((e) => !e.concentrationLinked); }), 'btn btn-small btn-ghost')) : btn('Start concentration', () => concDialog(), 'btn btn-small btn-ghost'),
        h('span', { class: 'stepper' }, h('span', null, 'Exhaustion '), btn('−', () => void change('condition', `Exhaustion ${Math.max(0, c.exhaustion - 1)}`, (dr) => { dr.exhaustion = Math.max(0, dr.exhaustion - 1); }), 'icon-btn', { 'aria-label': 'Decrease exhaustion' }), h('strong', null, String(c.exhaustion)), btn('+', () => void change('condition', `Exhaustion ${Math.min(6, c.exhaustion + 1)}`, (dr) => { dr.exhaustion = Math.min(6, dr.exhaustion + 1); }), 'icon-btn', { 'aria-label': 'Increase exhaustion' })))),
    card('Turn checklist', turnChecklist(c)),
    card('Conditions & effects', h('ul', { class: 'chips' }, c.effects.map((e) => h('li', { class: 'chip' }, e.name, e.saveDC ? h('small', null, ` DC ${e.saveDC} ${e.saveAbility?.toUpperCase() ?? ''}`) : null, btn('✕', () => void change('condition', `Removed ${e.name}`, (dr) => { dr.effects = dr.effects.filter((x) => x.id !== e.id); }), 'icon-btn', { 'aria-label': `Remove ${e.name}` })))),
      btn('+ Add condition or effect', () => conditionDialog(c), 'btn btn-small'), d.reminders.length ? h('ul', { class: 'reminders' }, d.reminders.map((r) => h('li', null, r))) : null),
    attacksPanel(c, d),
    d.slots.length || d.pact.count ? card('Spell slots', slotsControl(c), favSpells.length ? h('div', null, h('h3', null, 'Quick cast'), h('div', { class: 'row wrap' }, favSpells.map((s) => btn(s.name, () => castDialog(c, s), 'btn btn-small')))) : null) : null,
    resourcesPanel(c, d),
    card('Saving throws', h('ul', { class: 'roll-list' }, ABILITIES.map((a) => h('li', null, h('span', { class: 'lbl' }, ABILITY_NAMES[a]), d20Buttons(`${ABILITY_NAMES[a]} save`, d.saves[a].value))))),
    card('Ability checks & skills', checksQuick(d)),
    consumables.length ? card('Consumables & ammunition', h('ul', { class: 'res-list' }, consumables.map((i) => h('li', null, h('strong', null, i.name), h('span', { class: 'num' }, i.charges ? `${i.charges.current}/${i.charges.max} charges` : `×${i.quantity}`),
      btn('Use 1', () => void change('inventory', `Used ${i.name}`, (dr) => { const it = dr.inventory.find((x) => x.id === i.id)!; if (it.charges) { if (it.charges.current <= 0) throw new Error(`${it.name} has no charges.`); it.charges.current--; } else { if (it.quantity <= 0) throw new Error(`No ${it.name} left.`); it.quantity--; } }), 'btn btn-small'))))) : null,
    card('Rests', h('div', { class: 'row' }, btn('Short rest', () => shortRestDialog(c), 'btn'), btn('Long rest', () => longRestDialog(c), 'btn'))),
    card('Combat notes', (() => { const t = textarea(c.combatNotes, { rows: 3, 'aria-label': 'Combat notes' }); return h('div', null, t, btn('Save notes', () => void change('note', 'Updated combat notes', (dr) => { dr.combatNotes = t.value; }), 'btn btn-small')); })()),
    card('Recent changes', recent.length ? h('ul', { class: 'history' }, recent.map((e) => h('li', null, h('span', null, e.description), e.reversible ? btn('Undo', () => void undo(e), 'btn btn-small btn-ghost') : null))) : h('p', { class: 'hint' }, 'Changes appear here with undo.'), link(`#/c/${c.id}/audit`, 'Full history', 'btn btn-small btn-ghost')),
    h('div', { class: 'row' }, btn('Add me to the active encounter', () => void addToEncounter(c), 'btn btn-ghost')));
}

function turnChecklist(c: Character): HTMLElement {
  const items = ['Movement', 'Action', 'Bonus action', 'Object interaction'];
  const boxes = items.map((i) => h('label', { class: 'check big' }, h('input', { type: 'checkbox' }), ` ${i}`));
  return h('div', null, h('div', { class: 'row wrap' }, boxes), btn('New turn (clear checklist, restore reaction)', () => { boxes.forEach((b) => (b.querySelector('input')!.checked = false)); if (c.reactionUsed) void change('edit', 'New turn: reaction restored', (dr) => { dr.reactionUsed = false; }, { silent: true }); }, 'btn btn-small btn-ghost'));
}

function checksQuick(d: NonNullable<typeof state.derived>): HTMLElement {
  const s = select(Object.keys(d.skills).map((k) => ({ value: k, label: `${cap(k)} ${sign(d.skills[k]!.value)}` })), 'perception', { 'aria-label': 'Skill' });
  const a = select(ABILITIES.map((x) => ({ value: x, label: `${ABILITY_NAMES[x]} ${sign(d.mods[x])}` })), 'str', { 'aria-label': 'Ability' });
  const go = (label: string, v: number, mode: 'normal' | 'advantage' | 'disadvantage') => void rollAndShow(label, `1d20${v >= 0 ? '+' : ''}${v}`, { mode });
  return h('div', null, h('div', { class: 'row wrap' }, s, btn('Roll', () => go(`${cap(s.value)} check`, d.skills[s.value]!.value, 'normal'), 'btn btn-roll'), btn('Adv', () => go(`${cap(s.value)} (adv)`, d.skills[s.value]!.value, 'advantage'), 'btn btn-roll btn-small'), btn('Dis', () => go(`${cap(s.value)} (dis)`, d.skills[s.value]!.value, 'disadvantage'), 'btn btn-roll btn-small')),
    h('div', { class: 'row wrap' }, a, btn('Roll check', () => go(`${ABILITY_NAMES[a.value as Ability]} check`, d.mods[a.value as Ability], 'normal'), 'btn btn-roll')));
}

function deathSaves(c: Character): HTMLElement {
  const ds = c.deathSaves;
  const pips = (n: number, cls: string, label: string) => h('span', { class: 'pips', 'aria-label': `${label}: ${n} of 3` }, [0, 1, 2].map((i) => h('span', { class: `pip ${cls}${i < n ? ' on' : ''}` })));
  return h('div', { class: 'death-saves notice notice-warn', role: 'group', 'aria-label': 'Death saving throws' },
    h('strong', null, ds.stable ? 'Stable at 0 HP' : 'Death saving throws'), h('div', { class: 'row' }, h('span', null, 'Successes '), pips(ds.successes, 'ok', 'Successes'), h('span', null, ' Failures '), pips(ds.failures, 'bad', 'Failures')),
    h('div', { class: 'row wrap' },
      btn('Roll death save', async () => { const r = await rollAndShow('Death saving throw', '1d20'); if (r) await change('deathsave', `Death save: ${r.total}`, (dr) => { const msg = recordDeathSave(dr, r.total); toast(msg, dr.deathSaves.dead ? 'error' : 'ok'); }); }, 'btn btn-primary'),
      btn('+ Success', () => void change('deathsave', 'Death save success', (dr) => { recordDeathSave(dr, 10); }), 'btn btn-small'),
      btn('+ Failure', () => void change('deathsave', 'Death save failure', (dr) => { recordDeathSave(dr, 2); }), 'btn btn-small'),
      btn('Stabilise', () => void change('deathsave', 'Stabilised', (dr) => { dr.deathSaves.stable = true; }), 'btn btn-small btn-ghost')));
}

function damageDialog(c: Character): void {
  const d = state.derived!;
  const amt = input({ inputmode: 'text', placeholder: '12 or 2d6+3', 'aria-label': 'Damage amount' });
  const type = select(DAMAGE_TYPES.map((t) => ({ value: t, label: t ? cap(t) : '— Unknown / not specified —' })), '');
  const crit = h('input', { type: 'checkbox' });
  const defBox = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Defence' });
  let defense: DefenseChoice = 'normal'; let lastAmount: number | null = null;
  const preview = h('div', { class: 'preview-box', 'aria-live': 'polite' });
  const drawDef = (suggested: DefenseChoice) => fill(defBox, ...(['normal', 'resistant', 'immune', 'vulnerable'] as DefenseChoice[]).map((x) => h('label', { class: defense === x ? 'on' : '' }, h('input', { type: 'radio', name: 'def', checked: defense === x, on: { change: () => { defense = x; drawDef(suggested); upd(); } } }), cap(x), x === suggested && x !== 'normal' ? ' (suggested)' : '')));
  const upd = () => {
    const sug = suggestDefense(c, type.value);
    const v = /^\d+$/.test(amt.value.trim()) ? Number(amt.value) : lastAmount;
    fill(preview, ...(v === null ? [h('p', { class: 'hint' }, 'Enter a number, or a dice expression (it will be rolled when you press Calculate).')] : [h('ul', null, proposeDamage(c, d.hpMax.value, v, defense, { critical: crit.checked }).explanation.map((x) => h('li', null, x)))]),
      ...(type.value && sug !== 'normal' && defense !== sug ? [h('p', { class: 'notice notice-warn' }, `Your recorded defences suggest “${sug}” for ${type.value}. Choose it above if it applies.`)] : []),
      ...(!type.value ? [h('p', { class: 'hint' }, 'No damage type: resistance and vulnerability are not applied automatically.')] : []));
  };
  type.addEventListener('change', () => { const s = suggestDefense(c, type.value); defense = s; drawDef(s); upd(); });
  amt.addEventListener('input', () => { lastAmount = null; upd(); }); crit.addEventListener('change', upd);
  drawDef('normal'); upd();
  modal('Take damage', h('div', null, field('Amount', amt, { required: true, hint: 'Number or dice expression' }), field('Damage type', type), h('p', { class: 'label' }, 'Defence (confirm)'), defBox,
    c.hp.current === 0 ? h('label', { class: 'check' }, crit, ' Critical hit (two death save failures)') : null, preview),
    [{ label: 'Cancel', cls: 'btn btn-ghost' }, { label: 'Calculate', cls: 'btn', run: async () => { const v = await amountFrom(amt.value, 'Damage'); if (v !== null) { lastAmount = v; amt.value = String(v); upd(); } return false; } },
      { label: 'Apply damage', cls: 'btn btn-danger', run: async () => {
        const v = /^\d+$/.test(amt.value.trim()) ? Number(amt.value) : await amountFrom(amt.value, 'Damage'); if (v === null) return false;
        const p = proposeDamage(c, d.hpMax.value, v, defense, { critical: crit.checked });
        await change('hp', `Took ${p.adjusted}${type.value ? ` ${type.value}` : ''} damage (${p.explanation.slice(1).join('; ') || 'no adjustments'}) → ${p.newHp} HP`, (dr) => applyDamage(dr, p));
        if (p.concentrationDC) toast(`Concentration: make a Con save, DC ${p.concentrationDC}.`, 'warn', { label: 'Roll', run: () => void rollAndShow('Concentration save', `1d20${d.saves.con.value >= 0 ? '+' : ''}${d.saves.con.value}`) });
        if (p.instantDeath) toast('Massive damage: instant death.', 'error'); else if (p.dropsToZero) toast('Dropped to 0 HP: unconscious and making death saves.', 'warn');
        return true;
      } }]);
}

function healDialog(_c: Character): void {
  const amt = input({ placeholder: '8 or 2d4+2', 'aria-label': 'Healing amount' });
  modal('Heal', field('Amount', amt, { required: true, hint: 'Number or dice expression' }), [{ label: 'Cancel', cls: 'btn btn-ghost' }, { label: 'Apply healing', cls: 'btn btn-ok', run: async () => {
    const v = await amountFrom(amt.value, 'Healing'); if (v === null) return false;
    await change('hp', `Healed ${v}`, (dr) => { const got = applyHealing(dr, state.derived!.hpMax.value, v); if (got < v) toast(`Healed ${got} (capped at maximum).`); });
    return true;
  } }]);
}

function tempDialog(c: Character): void {
  const amt = num(0, { min: 0, 'aria-label': 'Temporary HP' }); const rep = h('input', { type: 'checkbox' });
  modal('Temporary hit points', h('div', null, h('p', { class: 'hint' }, `Current: ${c.hp.temp}. Temporary HP do not stack: by default the higher value is kept.`), field('Amount', amt, { required: true }), h('label', { class: 'check' }, rep, ' Replace even if lower')),
    [{ label: 'Cancel', cls: 'btn btn-ghost' }, { label: 'Apply', cls: 'btn btn-primary', run: async () => { const v = Number(amt.value); if (!(v >= 0)) { toast('Enter 0 or more.', 'error'); return false; } await change('temphp', `Temporary HP ${rep.checked ? 'set to' : 'offered'} ${v}`, (dr) => applyTempHp(dr, v, rep.checked)); return true; } }]);
}

function concDialog(): void {
  const n = input({ placeholder: 'Spell or effect', 'aria-label': 'Concentration on' });
  modal('Start concentrating', field('Concentrating on', n, { required: true }), [{ label: 'Cancel', cls: 'btn btn-ghost' }, { label: 'Start', cls: 'btn btn-primary', run: async () => { if (!n.value.trim()) { toast('Enter a name.', 'error'); return false; } await change('condition', `Concentrating on ${n.value.trim()}`, (dr) => { dr.concentration = { name: n.value.trim(), since: nowIso() }; }); return true; } }]);
}

export function conditionDialog(c: Character): void {
  const conds = state.registry.conditions;
  const sel = select([{ value: '', label: '— Custom effect —' }, ...conds.map((x) => ({ value: x.id, label: x.name }))], '');
  const name = input({ placeholder: 'e.g. Bless, Haste, Poisoned by spider', 'aria-label': 'Effect name' }); const dur = input({ placeholder: '1 minute, until end of next turn…' });
  const saveAb = select([{ value: '', label: '—' }, ...ABILITIES.map((a) => ({ value: a, label: ABILITY_NAMES[a] }))], ''); const dc = num(0, { min: 0 });
  const src = input({ placeholder: 'Who or what caused it' }); const end = input({ placeholder: 'Ends when…' });
  const conc = h('input', { type: 'checkbox' });
  const modT = input({ placeholder: 'e.g. ac, speed, save:all', 'aria-label': 'Modifier target' }); const modV = num(0, { 'aria-label': 'Modifier value' });
  const notes = textarea('', { rows: 2 });
  const desc = h('p', { class: 'hint' });
  sel.addEventListener('change', () => { const cd = byId(conds, sel.value); desc.textContent = cd?.summary ?? ''; if (cd) name.value = cd.name; });
  modal('Add condition or effect', h('div', { class: 'grid-2' }, field('Standard condition', sel), desc, field('Name', name, { required: true }), field('Duration', dur), field('Save to end', saveAb), field('Save DC', dc), field('Source', src), field('Ends when', end),
    h('label', { class: 'check' }, conc, ' Ends if my concentration ends'), field('Modifier target (optional)', modT, { hint: 'Leave blank to track as a reminder only.' }), field('Modifier value', modV), field('Notes', notes)),
    [{ label: 'Cancel', cls: 'btn btn-ghost' }, { label: 'Add', cls: 'btn btn-primary', run: async () => {
      if (!name.value.trim()) { toast('Enter a name.', 'error'); return false; }
      if (c.defenses.conditionImmunities.map((x) => x.toLowerCase()).includes(name.value.trim().toLowerCase()) && !(await confirmDialog('Immune', `${c.name} is recorded as immune to ${name.value}. Add anyway?`, 'Add anyway'))) return false;
      const e: ActiveEffect = { id: uid(), name: name.value.trim(), conditionId: sel.value || undefined, startedAt: nowIso(), duration: dur.value, saveAbility: (saveAb.value || undefined) as Ability | undefined, saveDC: Number(dc.value) || undefined, source: src.value, concentrationLinked: conc.checked,
        modifiers: modT.value.trim() && Number(modV.value) ? [{ target: modT.value.trim(), op: 'add', value: Number(modV.value), note: name.value.trim() }] : [], endCondition: end.value, notes: notes.value };
      await change('condition', `Gained ${e.name}`, (dr) => { dr.effects.push(e); });
      return true;
    } }], { wide: true });
}

function slotsControl(c: Character): HTMLElement {
  const d = state.derived!;
  const row = (label: string, max: number, used: number, set: (n: number) => void) => h('li', null, h('strong', null, label),
    h('span', { class: 'pips' }, Array.from({ length: max }, (_, i) => h('button', { type: 'button', class: `pip pip-btn${i < max - used ? ' on' : ''}`, 'aria-label': `${label}: ${i < max - used ? 'available, tap to use' : 'used, tap to restore'}`, on: { click: () => set(i < max - used ? used + 1 : used - 1) } }))),
    h('span', { class: 'num' }, `${max - used}/${max}`));
  return h('ul', { class: 'res-list' }, d.slots.map((s) => row(`Level ${s.level}`, s.max, s.used, (n) => void change('spell', `${n > s.used ? 'Used' : 'Restored'} a level ${s.level} slot`, (dr) => { dr.spellcasting.slotsUsed[s.level - 1] = Math.max(0, Math.min(s.max, n)); for (let i = 0; i < s.level - 1; i++) dr.spellcasting.slotsUsed[i] ??= 0; }))),
    d.pact.count ? row(`Pact (level ${d.pact.level})`, d.pact.count, d.pact.used, (n) => void change('spell', `${n > d.pact.used ? 'Used' : 'Restored'} a pact slot`, (dr) => { dr.spellcasting.pactUsed = Math.max(0, Math.min(d.pact.count, n)); })) : null);
  void c;
}

export function shortRestDialog(c: Character): void {
  const d = state.derived!;
  const rolls: { die: string; roll: number }[] = [];
  const eligible = d.resources.filter((r) => r.recovery === 'short' && r.used > 0);
  const resBoxes = eligible.map((r) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: true, value: r.id }), ` ${r.name} (${r.max - r.used}/${r.max})`));
  const out = h('div', { 'aria-live': 'polite' });
  const draw = () => {
    let plan; try { plan = planShortRest(c, d, rolls, resBoxes.map((b) => b.querySelector('input')!).filter((i) => i.checked).map((i) => i.value)); } catch (e) { fill(out, h('p', { class: 'field-error' }, (e as Error).message)); return; }
    fill(out, h('ul', null, plan.hitDiceRolls.map((r) => h('li', null, `${r.die}: ${r.roll} ${sign(r.con)} Con = ${r.healed}`))), h('p', null, `HP: ${c.hp.current} → ${plan.newHp} (+${plan.totalHealed})`),
      plan.pactRecovered ? h('p', null, 'Pact Magic slots recovered.') : null, plan.resourcesRecovered.length ? h('p', null, `Recovering: ${plan.resourcesRecovered.map((id) => d.resources.find((r) => r.id === id)?.name).join(', ')}`) : null);
  };
  resBoxes.forEach((b) => b.addEventListener('change', draw));
  const manual = num(1, { min: 1, 'aria-label': 'Manual hit die result' });
  const dice = h('div', { class: 'row wrap' }, d.hitDice.map((hd) => h('span', null, `${hd.die}: ${hd.total - hd.used} left `,
    btn(`Roll ${hd.die}`, () => { const left = hd.total - hd.used - rolls.filter((r) => r.die === hd.die).length; if (left <= 0) return toast(`No ${hd.die} left.`, 'warn'); rolls.push({ die: hd.die, roll: roll(`1${hd.die}`).total }); draw(); }, 'btn btn-roll btn-small'),
    btn('Add manual', () => { rolls.push({ die: hd.die, roll: Number(manual.value) }); draw(); }, 'btn btn-small btn-ghost'))), h('label', null, ' Manual result ', manual), btn('Clear rolls', () => { rolls.length = 0; draw(); }, 'btn btn-small btn-ghost'));
  draw();
  modal('Short rest', h('div', null, h('p', { class: 'hint' }, 'Spend hit dice to heal (each die + Con modifier). Then choose which short-rest resources to recover.'), dice, eligible.length ? h('fieldset', null, h('legend', null, 'Recover'), resBoxes) : null, out),
    [{ label: 'Cancel', cls: 'btn btn-ghost' }, { label: 'Take short rest', cls: 'btn btn-primary', run: async () => {
      try { const plan = planShortRest(c, d, rolls, resBoxes.map((b) => b.querySelector('input')!).filter((i) => i.checked).map((i) => i.value)); await change('rest', `Short rest: +${plan.totalHealed} HP, ${rolls.length} hit dice spent`, (dr) => applyShortRest(dr, plan)); return true; }
      catch (e) { toast((e as Error).message, 'error'); return false; }
    } }], { wide: true });
}

export function longRestDialog(c: Character): void {
  const d = state.derived!;
  const effBoxes = c.effects.map((e) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !/permanent|until removed/i.test(e.duration), value: e.id }), ` End ${e.name}`));
  const plan = planLongRest(c, d);
  modal('Long rest', h('div', null, h('ul', null, h('li', null, `HP restored to ${d.hpMax.value} (+${plan.hpRestored})`), h('li', null, `Hit dice recovered: ${Object.entries(plan.hitDiceRecovered).map(([k, v]) => `${v}${k}`).join(', ') || 'none needed'} (${c.ruleset === 'srd521' ? 'all, 2024 rules' : 'up to half your total, 2014 rules'})`),
    h('li', null, 'All spell slots and pact slots restored'), h('li', null, `Resources restored: ${plan.resources.length}`), h('li', null, `Exhaustion: ${c.exhaustion} → ${plan.exhaustionAfter}`), plan.clearTemp ? h('li', null, 'Temporary HP removed') : null),
    effBoxes.length ? h('fieldset', null, h('legend', null, 'Effects to end'), effBoxes) : null, h('p', { class: 'hint' }, 'You can change prepared spells in the Spellbook after resting.')),
    [{ label: 'Cancel', cls: 'btn btn-ghost' }, { label: 'Take long rest', cls: 'btn btn-primary', run: async () => {
      const p = planLongRest(c, d, effBoxes.map((b) => b.querySelector('input')!).filter((i) => i.checked).map((i) => i.value));
      try { await change('rest', 'Long rest', (dr) => applyLongRest(dr, d, p)); return true; } catch (e) { toast((e as Error).message, 'error'); return false; }
    } }]);
}

// ---------------- Initiative tracker ----------------
async function activeEncounter(): Promise<Encounter | undefined> { return (await state.repo.all<Encounter>('encounters')).filter((e) => e.active).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]; }

async function addToEncounter(c: Character): Promise<void> {
  let enc = await activeEncounter();
  if (!enc) enc = { id: uid(), name: 'Encounter', round: 1, turnIndex: 0, participants: [], active: true, updatedAt: nowIso(), campaignId: c.campaignId };
  if (enc.participants.some((p) => p.characterId === c.id)) { toast(`${c.name} is already in the encounter.`, 'warn'); location.hash = '/initiative'; return; }
  const d = state.derived!; const r = await rollAndShow(`${c.name} initiative`, `1d20${d.initiative.value >= 0 ? '+' : ''}${d.initiative.value}`);
  if (!r) return;
  enc.participants.push({ id: uid(), name: c.name, initiative: r.total, dexMod: d.mods.dex, hp: c.hp.current, hpMax: d.hpMax.value, ac: d.ac.value, disposition: 'friendly', conditions: c.effects.map((e) => e.name), concentrating: !!c.concentration, defeated: false, delayed: false, readied: '', dmNotes: '', characterId: c.id });
  enc.updatedAt = nowIso(); await state.repo.put('encounters', enc); location.hash = '/initiative';
}

const order = (ps: Participant[]) => [...ps].sort((a, b) => b.initiative - a.initiative || b.dexMod - a.dexMod || a.name.localeCompare(b.name));

export async function initiativeView(): Promise<HTMLElement> {
  const root = h('div', { class: 'page' });
  const all = (await state.repo.all<Encounter>('encounters')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  let enc = all.find((e) => e.active);
  const save = async () => { if (!enc) return; enc.updatedAt = nowIso(); await state.repo.put('encounters', enc); draw(); };
  const draw = () => {
    clear(root);
    put(root, pageHeader('Initiative tracker', enc ? `${enc.name} · Round ${enc.round}` : 'No active encounter', btn('New encounter', async () => { if (enc && !(await confirmDialog('Start a new encounter?', 'The current encounter will be ended and kept in history.', 'New encounter'))) return; if (enc) { enc.active = false; await state.repo.put('encounters', enc); } enc = { id: uid(), name: `Encounter ${all.length + 1}`, round: 1, turnIndex: 0, participants: [], active: true, updatedAt: nowIso() }; all.unshift(enc); await save(); }, 'btn btn-small')));
    if (!enc) { put(root, empty('Start an encounter to track turn order, HP and conditions.', state.active ? btn(`Add ${state.active.name}`, () => void addToEncounter(state.active!), 'btn btn-primary') : null)); return; }
    const e = enc; const ps = order(e.participants);
    const live = ps.filter((p) => !p.defeated && !p.delayed);
    const current = live.length ? live[e.turnIndex % live.length] : undefined;
    const step = async (dir: 1 | -1) => { if (!live.length) return; let i = e.turnIndex + dir; if (i >= live.length) { i = 0; e.round++; } if (i < 0) { if (e.round > 1) { e.round--; i = live.length - 1; } else i = 0; } e.turnIndex = i; await save(); const n = live[i]; if (n) toast(`Round ${e.round}: ${n.name}’s turn`); };
    put(root, h('div', { class: 'init-controls card' }, btn('◀ Previous', () => void step(-1), 'btn'), h('div', { class: 'round' }, h('span', null, 'Round'), h('strong', null, String(e.round))), btn('Next turn ▶', () => void step(1), 'btn btn-primary btn-lg')),
      h('ol', { class: 'init-list' }, ps.map((p) => h('li', { class: `init-row disp-${p.disposition}${p === current ? ' current' : ''}${p.defeated ? ' defeated' : ''}${p.delayed ? ' delayed' : ''}`, 'aria-current': p === current ? 'true' : undefined },
        h('div', { class: 'init-main' }, h('span', { class: 'init-score', title: `Tie-break Dex ${sign(p.dexMod)}` }, String(p.initiative)), h('strong', null, p.name), h('span', { class: 'badge' }, p.disposition), p.concentrating ? h('span', { class: 'badge badge-conc' }, 'Conc.') : null, p.delayed ? h('span', { class: 'badge' }, 'Holding') : null, p.defeated ? h('span', { class: 'badge badge-danger' }, 'Defeated') : null),
        h('div', { class: 'row wrap' },
          p.hpMax !== undefined ? h('span', { class: 'stepper' }, btn('−', () => void hpAdj(p, -1), 'icon-btn', { 'aria-label': `Reduce ${p.name} HP` }), h('span', null, `HP ${p.hp ?? '?'} / ${p.hpMax}`), btn('+', () => void hpAdj(p, 1), 'icon-btn', { 'aria-label': `Increase ${p.name} HP` }), btn('±', () => hpDialog(p), 'icon-btn', { 'aria-label': `Change ${p.name} HP by an amount` })) : null,
          p.ac ? h('span', { class: 'hint' }, `AC ${p.ac}`) : null,
          p.conditions.map((cn) => h('span', { class: 'chip' }, cn, btn('✕', () => { p.conditions = p.conditions.filter((x) => x !== cn); void save(); }, 'icon-btn', { 'aria-label': `Remove ${cn}` })))),
        h('details', null, h('summary', null, 'More'), h('div', { class: 'row wrap' },
          btn('+ Condition', () => { const s = select(state.registry.conditions.map((x) => ({ value: x.name, label: x.name })), 'Prone'); modal(`Condition on ${p.name}`, field('Condition', s), [{ label: 'Cancel', cls: 'btn btn-ghost' }, { label: 'Add', cls: 'btn btn-primary', run: () => { p.conditions.push(s.value); void save(); } }]); }, 'btn btn-small'),
          btn(p.concentrating ? 'End concentration' : 'Concentrating', () => { p.concentrating = !p.concentrating; void save(); }, 'btn btn-small btn-ghost'),
          btn(p.delayed ? 'Act now' : 'Delay / hold', () => { p.delayed = !p.delayed; void save(); }, 'btn btn-small btn-ghost'),
          btn(p.defeated ? 'Revive' : 'Defeated', () => { p.defeated = !p.defeated; void save(); }, 'btn btn-small btn-ghost'),
          btn('Duplicate', () => { const n = e.participants.filter((x) => x.name.replace(/ \d+$/, '') === p.name.replace(/ \d+$/, '')).length + 1; e.participants.push({ ...p, id: uid(), name: `${p.name.replace(/ \d+$/, '')} ${n}`, characterId: undefined }); void save(); }, 'btn btn-small btn-ghost'),
          btn('Remove', () => { e.participants = e.participants.filter((x) => x.id !== p.id); void save(); }, 'btn btn-small btn-ghost danger-text')),
          field('Initiative', num(p.initiative, { on: { change: (ev) => { p.initiative = Number((ev.target as HTMLInputElement).value); void save(); } } })),
          field('Readied action', input({ value: p.readied, on: { change: (ev) => { p.readied = (ev.target as HTMLInputElement).value; void save(); } } })),
          field('DM-only notes', textarea(p.dmNotes, { rows: 2, on: { change: (ev) => { p.dmNotes = (ev.target as HTMLTextAreaElement).value; void save(); } } }), { hint: 'Kept on this device. Reserved for a future DM mode.' })),
        p.readied ? h('p', { class: 'hint' }, `Readied: ${p.readied}`) : null))),
      card('Add participants', addForm(e, save)),
      h('div', { class: 'row' }, state.active ? btn(`Add ${state.active.name}`, () => void addToEncounter(state.active!), 'btn') : null, btn('End encounter', async () => { e.active = false; await state.repo.put('encounters', e); enc = undefined; draw(); }, 'btn btn-ghost')));
  };
  const hpAdj = async (p: Participant, delta: number) => {
    const ch = p.characterId && state.active?.id === p.characterId ? state.active : null;
    if (ch && delta < 0) {
      const pr = proposeDamage(ch, state.derived!.hpMax.value, -delta, 'normal');
      p.hp = pr.newHp; await persist();
      await change('hp', `Took ${-delta} damage (initiative tracker)`, (dr) => applyDamage(dr, pr));
      return;
    }
    if (ch && delta > 0) {
      p.hp = Math.min(state.derived!.hpMax.value, ch.hp.current + delta); await persist();
      await change('hp', `Healed ${delta} (initiative tracker)`, (dr) => { applyHealing(dr, state.derived!.hpMax.value, delta); });
      return;
    }
    p.hp = Math.max(0, Math.min(p.hpMax ?? 9999, (p.hp ?? 0) + delta));
    if (p.hp === 0) p.defeated = true;
    await save();
  };
  const persist = async () => { if (enc) { enc.updatedAt = nowIso(); await state.repo.put('encounters', enc); } };
  const hpDialog = (p: Participant) => { const n = num(0, { 'aria-label': 'Amount' }); modal(`${p.name}: change HP`, field('Amount (negative for damage)', n), [{ label: 'Cancel', cls: 'btn btn-ghost' }, { label: 'Apply', cls: 'btn btn-primary', run: () => void hpAdj(p, Number(n.value) || 0) }]); };
  draw();
  return root;
}

function addForm(e: Encounter, save: () => Promise<void>): HTMLElement {
  const name = input({ placeholder: 'Goblin', 'aria-label': 'Name' }); const init = input({ placeholder: '15 or blank to roll', 'aria-label': 'Initiative' }); const dex = num(0, { 'aria-label': 'Dex modifier' });
  const hp = num(7, { min: 0, 'aria-label': 'HP' }); const ac = num(13, { min: 0, 'aria-label': 'AC' }); const count = num(1, { min: 1, max: 20, 'aria-label': 'How many' });
  const disp = select([{ value: 'hostile', label: 'Hostile' }, { value: 'neutral', label: 'Neutral' }, { value: 'friendly', label: 'Friendly' }], 'hostile', { 'aria-label': 'Disposition' });
  let busy = false;
  return h('form', { class: 'grid-3', on: { submit: async (ev) => { ev.preventDefault(); if (busy) return; if (!name.value.trim()) return toast('Enter a name.', 'error');
    const n = Math.max(1, Math.min(20, Number(count.value) || 1)); busy = true;
    for (let i = 1; i <= n; i++) {
      let iv = init.value.trim() ? Number(init.value) : roll(`1d20${Number(dex.value) >= 0 ? '+' : ''}${Number(dex.value) || 0}`).total;
      if (!Number.isFinite(iv)) iv = 10;
      e.participants.push({ id: uid(), name: n > 1 ? `${name.value.trim()} ${i}` : name.value.trim(), initiative: iv, dexMod: Number(dex.value) || 0, hp: Number(hp.value), hpMax: Number(hp.value), ac: Number(ac.value) || undefined, disposition: disp.value as Participant['disposition'], conditions: [], concentrating: false, defeated: false, delayed: false, readied: '', dmNotes: '' });
    }
    await save(); busy = false; } } },
    field('Name', name, { required: true }), field('Initiative', init, { hint: 'Blank rolls d20 + Dex' }), field('Dex modifier', dex), field('HP', hp), field('AC', ac), field('Count', count, { hint: 'Adds numbered copies' }), field('Disposition', disp), h('button', { type: 'submit', class: 'btn btn-primary' }, 'Add'));
}

// ---------------- Dice roller ----------------
export async function diceView(): Promise<HTMLElement> {
  const root = h('div', { class: 'page' });
  const expr = input({ value: '1d20', 'aria-label': 'Dice expression', autocomplete: 'off' });
  const label = input({ placeholder: 'Label (optional)', 'aria-label': 'Roll label' });
  let mode: 'normal' | 'advantage' | 'disadvantage' = 'normal'; let crit = false;
  const manualToggle = h('input', { type: 'checkbox' }); const manual = input({ placeholder: 'e.g. 14 or 3,5', 'aria-label': 'Physical dice results', hidden: true });
  manualToggle.addEventListener('change', () => (manual.hidden = !manualToggle.checked));
  const hist = h('ol', { class: 'roll-history' });
  const drawHist = async () => { const rolls = (await state.repo.all<RollRecord>('rolls')).sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 50);
    fill(hist, ...rolls.map((r) => h('li', null, h('div', { class: 'row' }, h('strong', null, `${r.total}`), h('span', null, r.label), h('small', null, `${r.expression}${r.mode !== 'normal' ? ` · ${r.mode}` : ''}${r.manual ? ' · physical' : ''} · ${new Date(r.ts).toLocaleTimeString()}`)), rollFaces(r)))); };
  const go = async () => {
    const opts = { mode, critical: crit, manual: manualToggle.checked ? manual.value.split(/[ ,]+/).filter(Boolean).map(Number) : undefined };
    await rollAndShow(label.value.trim() || expr.value, expr.value, opts); await drawHist();
  };
  const addDie = (s: number) => { const m = new RegExp(`(^|[+-])(\\d*)d${s}(?!\\d)`).exec(expr.value); if (m) { const n = (Number(m[2]) || 1) + 1; expr.value = expr.value.replace(m[0], `${m[1]}${n}d${s}`); } else expr.value = expr.value && expr.value !== '0' ? `${expr.value}+1d${s}` : `1d${s}`; };
  const segs = (opts: [string, string][], get: () => string, set: (v: string) => void) => { const box = h('div', { class: 'seg', role: 'radiogroup' }); const dr = () => fill(box, ...opts.map(([v, l]) => h('label', { class: get() === v ? 'on' : '' }, h('input', { type: 'radio', checked: get() === v, on: { change: () => { set(v); dr(); } } }), l))); dr(); return box; };
  const favs = h('div', { class: 'row wrap' });
  const drawFavs = () => fill(favs, ...state.settings.favouriteRolls.map((f) => h('span', { class: 'chip' }, btn(`${f.label} (${f.expression})`, () => { expr.value = f.expression; label.value = f.label; void go(); }, 'btn btn-small'), btn('✕', () => { void saveSettings({ favouriteRolls: state.settings.favouriteRolls.filter((x) => x.id !== f.id) }).then(drawFavs); }, 'icon-btn', { 'aria-label': `Delete favourite ${f.label}` }))));
  drawFavs();
  put(root, pageHeader('Dice roller', 'Cryptographically secure pseudorandom rolls, with every die shown'),
    card(null, h('div', { class: 'dice-pad' }, [4, 6, 8, 10, 12, 20, 100].map((s) => btn(`d${s}`, () => addDie(s), 'btn die-btn', { 'aria-label': `Add a d${s}` }))),
      h('div', { class: 'row wrap' }, btn('+1', () => (expr.value += '+1'), 'btn btn-small'), btn('−1', () => (expr.value += '-1'), 'btn btn-small'), btn('Clear', () => (expr.value = ''), 'btn btn-small btn-ghost')),
      field('Expression', expr, { hint: 'For example 2d6+1d4+3' }), field('Label', label),
      segs([['normal', 'Normal'], ['advantage', 'Advantage'], ['disadvantage', 'Disadvantage']], () => mode, (v) => (mode = v as typeof mode)),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', on: { change: (e) => (crit = (e.target as HTMLInputElement).checked) } }), ' Critical hit (double dice)'),
      h('label', { class: 'check' }, manualToggle, ' I rolled physical dice'), manual,
      h('div', { class: 'row' }, btn('Roll', () => void go(), 'btn btn-primary btn-lg'), btn('Save as favourite', () => { try { parseDice(expr.value); } catch (e) { return toast((e as Error).message, 'error'); } void saveSettings({ favouriteRolls: [...state.settings.favouriteRolls, { id: uid(), label: label.value.trim() || expr.value, expression: expr.value }] }).then(drawFavs); }, 'btn btn-ghost'))),
    card('Favourites', favs),
    card('History', btn('Clear history', async () => { if (await confirmDialog('Clear roll history?', 'This deletes all recorded rolls.', 'Clear', true)) { const all = await state.repo.all<RollRecord>('rolls'); await state.repo.tx([{ store: 'rolls', del: all.map((r) => r.id) }]); void drawHist(); } }, 'btn btn-small btn-ghost'), hist));
  await drawHist();
  void notify;
  return root;
}
