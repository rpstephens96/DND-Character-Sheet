// Character dashboard (customisable panels) and full editable character sheet.
import type { Ability, Character, Campaign } from '../../types.js';
import { ABILITIES } from '../../types.js';
import { h, btn, card, field, input, num, select, textarea, sign, modal, toast, link, showErrors, put, fill } from '../dom.js';
import { state, change, setActive } from '../store.js';
import { statButton, d20Buttons, rollAndShow, needCharacter, pageHeader, classLine, charTabs } from '../components.js';
import { ABILITY_NAMES, cap, type Derived } from '../../rules/calc.js';
import { byId } from '../../data/registry.js';
import { setGuard } from '../router.js';
import { DEFAULT_PANELS } from '../../rules/factory.js';

const PANEL_LABELS: Record<string, string> = { vitals: 'Vitals', abilities: 'Ability scores', saves: 'Saving throws', skills: 'Skills', attacks: 'Attacks & actions', resources: 'Limited-use resources', spells: 'Spellcasting', conditions: 'Conditions & effects', proficiencies: 'Proficiencies & languages', features: 'Features & pending choices', notes: 'Quick notes' };

export function dashboardView(p: Record<string, string>): HTMLElement {
  const c = needCharacter(p.id); if (c instanceof HTMLElement) return c;
  setActive(c); const d = state.derived!;
  const sp = byId(state.registry.species, c.speciesId);
  const root = h('div', { class: 'page' },
    pageHeader(c.name, `Level ${d.totalLevel} ${sp?.name ?? ''} · ${classLine(c)}`, btn('Customise', () => customise(c), 'btn btn-ghost btn-small'), link(`#/c/${c.id}/combat`, 'Combat mode', 'btn btn-primary btn-small')),
    charTabs(c.id, 'Dashboard'));
  if (d.warnings.length) put(root, h('div', { class: 'notice notice-warn' }, h('strong', null, `${d.warnings.length} rules warning${d.warnings.length > 1 ? 's' : ''}. `), d.warnings[0], ' ', link(`#/c/${c.id}/audit`, 'Open inspector')));
  if (c.pendingChoices.length) put(root, h('div', { class: 'notice' }, h('strong', null, `${c.pendingChoices.length} unresolved choice${c.pendingChoices.length > 1 ? 's' : ''}. `), link(`#/c/${c.id}/features`, 'Resolve in Features')));
  const panels: Record<string, () => HTMLElement> = {
    vitals: () => vitalsPanel(c, d), abilities: () => abilitiesPanel(d), saves: () => savesPanel(d), skills: () => skillsPanel(d), attacks: () => attacksPanel(c, d),
    resources: () => resourcesPanel(c, d), spells: () => spellsSummary(c, d), conditions: () => conditionsPanel(c, d), proficiencies: () => profPanel(c), features: () => featuresSummary(c), notes: () => notesPanel(c),
  };
  put(root, h('div', { class: 'panel-grid' }, c.dashboardPanels.filter((k) => panels[k]).map((k) => panels[k]!())));
  return root;
}

function customise(c: Character): void {
  const all = Object.keys(PANEL_LABELS); let sel = [...c.dashboardPanels];
  const list = h('ul', { class: 'reorder' });
  const draw = () => { fill(list, ...all.sort((a, b) => (sel.indexOf(a) + 1 || 99) - (sel.indexOf(b) + 1 || 99)).map((k) => h('li', null,
    h('label', null, h('input', { type: 'checkbox', checked: sel.includes(k), on: { change: (e) => { sel = (e.target as HTMLInputElement).checked ? [...sel, k] : sel.filter((x) => x !== k); draw(); } } }), ' ', PANEL_LABELS[k]!),
    sel.includes(k) ? btn('↑', () => { const i = sel.indexOf(k); if (i > 0) { [sel[i - 1], sel[i]] = [sel[i]!, sel[i - 1]!]; draw(); } }, 'icon-btn', { 'aria-label': `Move ${PANEL_LABELS[k]} up` }) : null))); };
  draw();
  modal('Customise dashboard', h('div', null, h('p', { class: 'hint' }, 'Choose and order the panels shown on this character’s dashboard.'), list), [{ label: 'Reset', cls: 'btn btn-ghost', run: () => { sel = [...DEFAULT_PANELS]; draw(); return false; } }, { label: 'Save', cls: 'btn btn-primary', run: () => void change('edit', 'Customised dashboard', (dr) => { dr.dashboardPanels = sel; }, { silent: true }) }]);
}

export function hpBar(c: Character, max: number): HTMLElement {
  const pct = Math.max(0, Math.min(100, (c.hp.current / Math.max(1, max)) * 100));
  return h('div', { class: 'hp-bar', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(max), 'aria-valuenow': String(c.hp.current), 'aria-label': 'Hit points' },
    h('div', { class: `hp-fill${pct <= 25 ? ' low' : pct <= 50 ? ' mid' : ''}`, style: `width:${pct}%` }), c.hp.temp ? h('div', { class: 'hp-temp', style: `width:${Math.min(100, (c.hp.temp / Math.max(1, max)) * 100)}%` }) : null);
}

function vitalsPanel(c: Character, d: Derived): HTMLElement {
  return card('Vitals',
    h('div', { class: 'hp-line' }, h('span', { class: 'hp-big' }, `${c.hp.current}`, h('small', null, ` / ${d.hpMax.value}`)), c.hp.temp ? h('span', { class: 'badge' }, `+${c.hp.temp} temp`) : null, statButton(d.hpMax, { label: 'Max HP', cls: 'stat-mini' })),
    hpBar(c, d.hpMax.value),
    h('div', { class: 'stat-row' }, statButton(d.ac, { label: 'AC' }), statButton(d.initiative, { label: 'Initiative', signed: true }), statButton(d.speed, { label: 'Speed', display: `${d.speed.value} ft` }), statButton(d.pb, { label: 'Proficiency', signed: true })),
    h('div', { class: 'row' }, h('span', { class: 'hint' }, `Hit dice: ${d.hitDice.map((x) => `${x.total - x.used}/${x.total} ${x.die}`).join(', ') || '—'}`),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: c.inspiration, on: { change: (e) => void change('edit', (e.target as HTMLInputElement).checked ? 'Gained inspiration' : 'Used inspiration', (dr) => { dr.inspiration = (e.target as HTMLInputElement).checked; }) } }), c.ruleset === 'srd521' ? ' Heroic Inspiration' : ' Inspiration')),
    h('p', { class: 'hint' }, `Passive Perception ${d.passives.perception.value} · Investigation ${d.passives.investigation.value} · Insight ${d.passives.insight.value}${c.senses ? ` · ${c.senses}` : ''}`),
    c.exhaustion ? h('p', { class: 'badge badge-warn' }, `Exhaustion ${c.exhaustion}`) : null);
}

function abilitiesPanel(d: Derived): HTMLElement {
  return card('Ability scores', h('div', { class: 'ability-grid' }, ABILITIES.map((a) => h('div', { class: 'ability' },
    statButton(d.abilities[a], { label: ABILITY_NAMES[a], display: String(d.abilities[a].value) }),
    btn(sign(d.mods[a]), () => void rollAndShow(`${ABILITY_NAMES[a]} check`, `1d20${d.mods[a] >= 0 ? '+' : ''}${d.mods[a]}`), 'btn btn-roll ability-mod', { 'aria-label': `Roll ${ABILITY_NAMES[a]} check ${sign(d.mods[a])}` })))));
}

function savesPanel(d: Derived): HTMLElement {
  return card('Saving throws', h('ul', { class: 'roll-list' }, ABILITIES.map((a) => { const s = d.saves[a]; return h('li', null, h('span', { class: `prof-dot${s.proficient ? ' on' : ''}`, 'aria-label': s.proficient ? 'Proficient' : 'Not proficient', role: 'img' }),
    statButton(s, { label: ABILITY_NAMES[a], signed: true, cls: 'stat-inline' }), d20Buttons(`${ABILITY_NAMES[a]} save`, s.value)); })));
}

function skillsPanel(d: Derived): HTMLElement {
  return card('Skills', h('ul', { class: 'roll-list compact' }, Object.entries(d.skills).map(([k, s]) => h('li', null,
    h('span', { class: `prof-dot${s.expertise ? ' exp' : s.proficient ? ' on' : ''}`, role: 'img', 'aria-label': s.expertise ? 'Expertise' : s.proficient ? 'Proficient' : 'Not proficient' }),
    statButton(s, { label: `${cap(k)} (${s.ability.toUpperCase()})`, signed: true, cls: 'stat-inline' }),
    btn('🎲', () => void rollAndShow(`${cap(k)} check`, `1d20${s.value >= 0 ? '+' : ''}${s.value}`), 'btn btn-roll btn-small', { 'aria-label': `Roll ${k} ${sign(s.value)}` })))));
}

export function attacksPanel(c: Character, d: Derived): HTMLElement {
  if (!d.attacks.length) return card('Attacks & actions', h('p', { class: 'hint' }, 'Equip a weapon in Inventory or add a custom action in Features.'));
  return card('Attacks & actions', h('ul', { class: 'attack-list' }, d.attacks.map((a) => h('li', null,
    h('div', { class: 'attack-head' }, h('strong', null, a.name), h('span', { class: 'hint' }, `${a.economy} · ${a.range}${a.properties.length ? ` · ${a.properties.join(', ')}` : ''}`)),
    h('div', { class: 'row' },
      a.attack ? statButton(a.attack, { label: 'to hit', signed: true, cls: 'stat-inline' }) : a.saveDC ? h('span', { class: 'badge' }, `DC ${a.saveDC} ${a.saveAbility?.toUpperCase() ?? ''}`) : null,
      a.attack ? d20Buttons(`${a.name} attack`, a.attack.value) : null,
      a.damage && a.damage !== '0' ? btn(`${a.damage} ${a.damageType}`, () => void rollDamage(c, a.name, a.damage, a.ammoItemId), 'btn btn-roll btn-small', { 'aria-label': `Roll ${a.name} damage ${a.damage}` }) : null,
      a.damage && a.damage !== '0' ? btn('Crit', () => void rollAndShow(`${a.name} critical damage`, a.damage, { critical: true }), 'btn btn-roll btn-small') : null,
      a.versatile ? btn(`2H ${a.versatile}`, () => void rollAndShow(`${a.name} (two-handed) damage`, a.versatile!), 'btn btn-roll btn-small') : null,
      a.resourceId ? btn('Use', () => void useResource(c, a.resourceId!, d), 'btn btn-small') : null),
    a.damageParts.length ? h('details', null, h('summary', null, 'Damage modifiers'), h('ul', null, a.damageParts.map((p) => h('li', null, `${p.label}: ${sign(p.value)} (${p.source})`)))) : null,
    a.notes ? h('p', { class: 'hint' }, a.notes) : null))));
}

async function rollDamage(c: Character, name: string, expr: string, ammoId?: string): Promise<void> {
  await rollAndShow(`${name} damage`, expr);
  if (ammoId) { const it = c.inventory.find((i) => i.id === ammoId); if (it && it.quantity > 0) await change('inventory', `Used 1 ${it.name}`, (dr) => { dr.inventory.find((i) => i.id === ammoId)!.quantity -= 1; }); }
}

export async function useResource(c: Character, id: string, d: Derived, delta = 1): Promise<void> {
  const r = d.resources.find((x) => x.id === id); if (!r) return toast('That resource is not available.', 'error');
  const next = Math.max(0, Math.min(r.max, r.used + delta));
  if (next === r.used) return toast(delta > 0 ? `No ${r.name} uses remaining.` : `${r.name} is already full.`, 'warn');
  await change('resource', `${delta > 0 ? 'Used' : 'Recovered'} ${r.name} (${r.max - next}/${r.max} left)`, (dr) => {
    const ex = dr.resources.find((x) => x.id === id); if (ex) ex.used = next; else dr.resources.push({ id, name: r.name, max: r.max, used: next, recovery: r.recovery, source: r.source });
  });
  void c;
}

export function resourcesPanel(c: Character, d: Derived): HTMLElement {
  if (!d.resources.length) return card('Limited-use resources', h('p', { class: 'hint' }, 'None yet. Class resources appear automatically; add custom ones in Features.'));
  return card('Limited-use resources', h('ul', { class: 'res-list' }, d.resources.map((r) => h('li', null,
    h('span', null, h('strong', null, r.name), h('small', null, ` ${r.recovery === 'short' ? 'short rest' : r.recovery === 'long' ? 'long rest' : r.recovery}`)),
    r.max <= 10 ? h('span', { class: 'pips', 'aria-label': `${r.max - r.used} of ${r.max} remaining` }, Array.from({ length: r.max }, (_, i) => h('span', { class: `pip${i < r.max - r.used ? ' on' : ''}` }))) : h('span', { class: 'num' }, `${r.max - r.used}/${r.max}`),
    btn('−', () => void useResource(c, r.id, d, 1), 'icon-btn', { 'aria-label': `Use ${r.name}` }), btn('+', () => void useResource(c, r.id, d, -1), 'icon-btn', { 'aria-label': `Recover ${r.name}` })))));
}

function spellsSummary(c: Character, d: Derived): HTMLElement {
  if (!d.spellProfiles.length && !d.pact.count) return card('Spellcasting', h('p', { class: 'hint' }, 'This character has no spellcasting.'));
  return card('Spellcasting', d.spellProfiles.map((p) => h('div', { class: 'row' }, h('strong', null, p.className), statButton(p.dc, { label: 'Save DC', cls: 'stat-inline' }), statButton(p.attack, { label: 'Attack', signed: true, cls: 'stat-inline' }))),
    h('p', null, d.slots.map((s) => `L${s.level}: ${s.max - s.used}/${s.max}`).join(' · '), d.pact.count ? ` · Pact (L${d.pact.level}): ${d.pact.count - d.pact.used}/${d.pact.count}` : ''),
    c.concentration ? h('p', { class: 'badge' }, `Concentrating: ${c.concentration.name}`) : null, link(`#/c/${c.id}/spells`, 'Open spellbook', 'btn btn-small'));
}

function conditionsPanel(c: Character, d: Derived): HTMLElement {
  return card('Conditions & effects', c.effects.length ? h('ul', null, c.effects.map((e) => h('li', null, h('strong', null, e.name), e.duration ? ` (${e.duration})` : ''))) : h('p', { class: 'hint' }, 'No active conditions.'),
    d.reminders.length ? h('ul', { class: 'reminders' }, d.reminders.map((r) => h('li', null, r))) : null, link(`#/c/${c.id}/combat`, 'Manage in combat', 'btn btn-small btn-ghost'));
}

function profPanel(c: Character): HTMLElement {
  const by = (k: string) => c.proficiencies.filter((p) => p.kind === k).map((p) => cap(p.name)).join(', ') || '—';
  return card('Proficiencies & languages', h('dl', { class: 'deflist' }, ...[['Armour', by('armor')], ['Weapons', by('weapon')], ['Tools', by('tool')], ['Languages', by('language')],
    ['Resistances', c.defenses.resistances.join(', ') || '—'], ['Immunities', c.defenses.immunities.join(', ') || '—'], ['Vulnerabilities', c.defenses.vulnerabilities.join(', ') || '—']].flatMap(([k, v]) => [h('dt', null, k!), h('dd', null, v!)])));
}

function featuresSummary(c: Character): HTMLElement {
  return card('Features', c.pendingChoices.length ? h('ul', { class: 'pending' }, c.pendingChoices.map((p) => h('li', null, p.label))) : null,
    h('ul', { class: 'feature-names' }, c.features.slice(0, 14).map((f) => h('li', null, f.name))), link(`#/c/${c.id}/features`, 'All features', 'btn btn-small btn-ghost'));
}

function notesPanel(c: Character): HTMLElement {
  const t = textarea(c.combatNotes, { rows: 3, 'aria-label': 'Quick notes' });
  return card('Quick notes', t, btn('Save note', () => void change('note', 'Updated quick notes', (dr) => { dr.combatNotes = t.value; }), 'btn btn-small'));
}

// ---------------- Full sheet ----------------
export async function sheetView(p: Record<string, string>): Promise<HTMLElement> {
  const c = needCharacter(p.id); if (c instanceof HTMLElement) return c;
  setActive(c); const d = state.derived!;
  const campaigns = await state.repo.all<Campaign>('campaigns');
  let dirty = false; setGuard(() => dirty);
  const draft: Character = JSON.parse(JSON.stringify(c));
  const mark = () => { dirty = true; saveBar.hidden = false; };
  const bind = (getter: () => string, setter: (v: string) => void, el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => { el.value = getter(); el.addEventListener('input', () => { setter(el.value); mark(); }); el.addEventListener('change', () => { setter(el.value); mark(); }); return el; };
  const tx = (label: string, get: () => string, set: (v: string) => void, opts: { required?: boolean; name?: string; rows?: number } = {}) => field(label, bind(get, set, opts.rows ? textarea('', { rows: opts.rows }) : input()), opts);
  const list = (label: string, arr: () => string[], setArr: (v: string[]) => void) => field(label, bind(() => arr().join(', '), (v) => setArr(v.split(',').map((x) => x.trim()).filter(Boolean)), input()), { hint: 'Comma-separated' });
  const portrait = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' });
  portrait.addEventListener('change', async () => { const f = portrait.files?.[0]; if (f) { draft.portrait = await resizeImage(f); mark(); toast('Portrait ready; save to keep it.'); } });

  const form = h('form', { class: 'sheet', novalidate: true, on: { submit: (e) => { e.preventDefault(); void save(); } } },
    h('div', { class: 'error-summary', role: 'alert', tabindex: '-1', hidden: true }),
    card('Identity', h('div', { class: 'grid-2' },
      tx('Character name', () => draft.name, (v) => (draft.name = v), { required: true, name: 'name' }), tx('Player name', () => draft.playerName, (v) => (draft.playerName = v)),
      tx('Alignment', () => draft.alignment, (v) => (draft.alignment = v)),
      field('Ruleset', bind(() => draft.ruleset, (v) => (draft.ruleset = v as Character['ruleset']), select([{ value: 'srd51', label: '2014 (SRD 5.1)' }, { value: 'srd521', label: '2024 (SRD 5.2.1)' }, { value: 'custom', label: 'Custom' }], draft.ruleset))),
      field('Campaign', bind(() => draft.campaignId ?? '', (v) => (draft.campaignId = v || undefined), select([{ value: '', label: '— None —' }, ...campaigns.map((x) => ({ value: x.id, label: x.name }))], draft.campaignId ?? ''))),
      field('Levelling', bind(() => draft.levellingMode, (v) => (draft.levellingMode = v as 'xp' | 'milestone'), select([{ value: 'milestone', label: 'Milestone' }, { value: 'xp', label: 'Experience points' }], draft.levellingMode))),
      field('Experience points', bind(() => String(draft.xp), (v) => (draft.xp = Math.max(0, Number(v) || 0)), num(draft.xp, { min: 0 })), { name: 'xp' }),
      field('Portrait', portrait, { hint: 'Stored on this device, resized to 256 px.' })),
      draft.portrait ? h('div', { class: 'row' }, h('img', { src: draft.portrait, alt: 'Current portrait', class: 'portrait' }), btn('Remove portrait', () => { delete draft.portrait; mark(); toast('Portrait will be removed when you save.'); }, 'btn btn-small btn-ghost')) : null),
    card('Species & background', h('div', { class: 'grid-2' },
      field('Species', bind(() => draft.speciesId, (v) => (draft.speciesId = v), select(state.registry.species.map((s) => ({ value: s.id, label: s.name })), draft.speciesId)), { hint: 'Changing species here does not re-apply species bonuses; adjust ability bonuses below.' }),
      field('Background', bind(() => draft.backgroundId, (v) => (draft.backgroundId = v), select(state.registry.backgrounds.map((s) => ({ value: s.id, label: s.name })), draft.backgroundId))))),
    card('Base ability scores', h('p', { class: 'hint' }, 'Base scores before bonuses. Bonuses from species, ASIs and feats are listed underneath and shown in every calculation breakdown.'),
      h('div', { class: 'grid-3' }, ABILITIES.map((a) => field(ABILITY_NAMES[a], bind(() => String(draft.baseAbilities[a]), (v) => (draft.baseAbilities[a] = Number(v)), num(draft.baseAbilities[a], { min: 1, max: 30 })), { name: `base.${a}`, required: true }))),
      h('h3', null, 'Ability bonuses'), bonusEditor(draft, mark)),
    card('Proficiencies', profEditor(draft, mark)),
    card('Defences, senses and speeds', h('div', { class: 'grid-2' },
      list('Resistances', () => draft.defenses.resistances, (v) => (draft.defenses.resistances = v)), list('Immunities', () => draft.defenses.immunities, (v) => (draft.defenses.immunities = v)),
      list('Vulnerabilities', () => draft.defenses.vulnerabilities, (v) => (draft.defenses.vulnerabilities = v)), list('Condition immunities', () => draft.defenses.conditionImmunities, (v) => (draft.defenses.conditionImmunities = v)),
      tx('Senses', () => draft.senses, (v) => (draft.senses = v)),
      ...(['walk', 'fly', 'swim', 'climb', 'burrow'] as const).map((k) => field(`${cap(k)} speed (ft)`, bind(() => String(draft.speeds[k] ?? ''), (v) => { if (v === '') delete draft.speeds[k]; else draft.speeds[k] = Number(v); }, num(draft.speeds[k] ?? 0, { min: 0 })), { hint: k === 'walk' ? 'Base walking speed before modifiers.' : undefined })))),
    card('Personality & story', h('div', { class: 'grid-3' }, (['age', 'height', 'weight', 'eyes', 'hair', 'skin'] as const).map((k) => tx(cap(k), () => draft.details[k], (v) => (draft.details[k] = v)))),
      (['appearance', 'personality', 'ideals', 'bonds', 'flaws', 'allies', 'backstory', 'treasure', 'notes'] as const).map((k) => tx(k === 'allies' ? 'Allies & organisations' : k === 'notes' ? 'Additional notes' : cap(k), () => draft.details[k], (v) => (draft.details[k] = v), { rows: k === 'backstory' ? 6 : 3 }))),
    card('Companions, familiars & summons', companionEditor(draft, mark)),
    card('Calculated values', h('p', { class: 'hint' }, 'Tap any value to see how it is calculated or to apply an override.'),
      h('div', { class: 'stat-row wrap' }, statButton(d.ac), statButton(d.hpMax), statButton(d.initiative, { signed: true }), statButton(d.speed), statButton(d.passives.perception), statButton(d.passives.investigation), statButton(d.passives.insight), statButton(d.carrying.weight))));
  const saveBar = h('div', { class: 'save-bar', hidden: true }, h('span', null, 'Unsaved changes'), btn('Discard', () => { dirty = false; location.reload(); }, 'btn btn-ghost'), h('button', { type: 'submit', class: 'btn btn-primary' }, 'Save sheet'));
  put(form, saveBar);
  let saving = false;
  async function save(): Promise<void> {
    if (saving) return;
    const errs: Record<string, string> = {};
    if (!draft.name.trim()) errs.name = 'Character name is required.';
    ABILITIES.forEach((a) => { const v = draft.baseAbilities[a]; if (!Number.isInteger(v) || v < 1 || v > 30) errs[`base.${a}`] = `${ABILITY_NAMES[a]} must be a whole number from 1 to 30.`; });
    if (!showErrors(form, errs)) return;
    saving = true;
    const ev = await change('edit', 'Edited character sheet', (dr) => { Object.assign(dr, draft, { id: c!.id, classes: dr.classes, hp: dr.hp, inventory: dr.inventory, effects: dr.effects, spellcasting: dr.spellcasting, resources: dr.resources, overrides: dr.overrides, features: dr.features, pendingChoices: dr.pendingChoices }); if (!draft.portrait) delete dr.portrait; });
    saving = false; dirty = false; saveBar.hidden = true;
    if (!ev) toast('No changes to save.');
  }
  return h('div', { class: 'page' }, pageHeader(`${c.name}: full sheet`, classLine(c), link(`#/print/${c.id}`, 'Print sheet', 'btn btn-ghost btn-small')), charTabs(c.id, 'Sheet'), form);
}

function bonusEditor(draft: Character, mark: () => void): HTMLElement {
  const box = h('div');
  const draw = () => fill(box, h('ul', { class: 'edit-list' }, draft.abilityBonuses.map((b, i) => h('li', null, `${ABILITY_NAMES[b.ability]} ${sign(b.amount)} — ${b.source}`, btn('Remove', () => { draft.abilityBonuses.splice(i, 1); mark(); draw(); }, 'btn btn-small btn-ghost')))),
    (() => { const ab = select(ABILITIES.map((a) => ({ value: a, label: ABILITY_NAMES[a] })), 'str', { 'aria-label': 'Ability' }); const n = num(1, { 'aria-label': 'Amount' }); const s = input({ placeholder: 'Source (e.g. Belt of Giant Strength)', 'aria-label': 'Source' });
      return h('div', { class: 'row' }, ab, n, s, btn('Add bonus', () => { if (!s.value.trim()) return toast('Enter a source.', 'warn'); draft.abilityBonuses.push({ ability: ab.value as Ability, amount: Number(n.value) || 0, source: s.value.trim() }); mark(); draw(); }, 'btn btn-small')); })());
  draw(); return box;
}

function profEditor(draft: Character, mark: () => void): HTMLElement {
  const box = h('div');
  const kinds = ['skill', 'expertise', 'save', 'armor', 'weapon', 'tool', 'language'] as const;
  const draw = () => fill(box, ...kinds.map((k) => h('div', { class: 'prof-group' }, h('h3', null, cap(k)), h('ul', { class: 'chips' }, draft.proficiencies.filter((p) => p.kind === k).map((p) => h('li', { class: 'chip' }, cap(p.name), h('small', null, ` ${p.source}`), btn('✕', () => { draft.proficiencies = draft.proficiencies.filter((x) => x !== p); mark(); draw(); }, 'icon-btn', { 'aria-label': `Remove ${p.name}` })))))),
    (() => { const k = select(kinds.map((x) => ({ value: x, label: cap(x) })), 'skill', { 'aria-label': 'Kind' }); const n = input({ placeholder: 'Name, e.g. stealth or dex', 'aria-label': 'Proficiency name' });
      return h('div', { class: 'row' }, k, n, btn('Add', () => { const name = n.value.trim().toLowerCase(); if (!name) return; draft.proficiencies.push({ kind: k.value as typeof kinds[number], name, source: 'Manual' }); mark(); draw(); }, 'btn btn-small')); })());
  draw(); return box;
}

function companionEditor(draft: Character, mark: () => void): HTMLElement {
  const box = h('div');
  const draw = () => fill(box, h('ul', { class: 'edit-list' }, draft.companions.map((cp, i) => h('li', null, h('strong', null, cp.name), ` (${cp.kind}) AC ${cp.ac}, HP `,
    num(cp.hp, { 'aria-label': `${cp.name} current HP`, class: 'num-sm', on: { change: (e) => { cp.hp = Number((e.target as HTMLInputElement).value); mark(); } } }), ` / ${cp.hpMax}`, cp.notes ? h('small', null, ` ${cp.notes}`) : null, btn('Remove', () => { draft.companions.splice(i, 1); mark(); draw(); }, 'btn btn-small btn-ghost')))),
    (() => { const n = input({ placeholder: 'Name', 'aria-label': 'Companion name' }); const k = input({ placeholder: 'Familiar, mount, summon, wild shape…', 'aria-label': 'Kind' }); const ac = num(12, { 'aria-label': 'AC' }); const hp = num(10, { 'aria-label': 'HP max' }); const nt = input({ placeholder: 'Notes / statistics', 'aria-label': 'Notes' });
      return h('div', { class: 'row wrap' }, n, k, ac, hp, nt, btn('Add companion', () => { if (!n.value.trim()) return toast('Enter a name.', 'warn'); draft.companions.push({ id: crypto.randomUUID(), name: n.value.trim(), kind: k.value || 'Companion', ac: Number(ac.value) || 10, hpMax: Number(hp.value) || 1, hp: Number(hp.value) || 1, notes: nt.value }); mark(); draw(); }, 'btn btn-small')); })());
  draw(); return box;
}

async function resizeImage(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 256 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * scale); cv.height = Math.round(bmp.height * scale);
  cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', 0.85);
}
