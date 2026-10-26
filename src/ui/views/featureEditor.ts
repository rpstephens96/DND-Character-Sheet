// "Add class feature / subclass feature / species trait / background feature / feat / other" dialog for the character sheet.
import type { Character, FeatureKind, FeatureEntry, Modifier, Proficiency, RecoveryTiming, Ability, ActionDef } from '../../types.js';
import { ABILITIES } from '../../types.js';
import { h, btn, field, input, num, select, textarea, modal, toast, fill, showErrors } from '../dom.js';
import { state, change, reloadCustom } from '../store.js';
import { byId } from '../../data/registry.js';
import { ABILITY_NAMES, cap } from '../../rules/calc.js';
import { addFeature, updateFeature, inputFromFeature, validateFeatureInput, toLibraryContent, KIND_LABELS, RESOURCE_FORMULAS, type FeatureInput } from '../../rules/features.js';
import { MODIFIER_TARGET_HINT } from '../../io/importExport.js';
import { SKILLS } from '../../data/srd-classes.js';

const COMMON_TARGETS: [string, string][] = [['ac', 'Armour Class'], ['speed', 'Speed (ft)'], ['initiative', 'Initiative'], ['hpMax', 'Hit point maximum'], ['hpPerLevel', 'HP per level'], ['attack', 'Weapon attack rolls'], ['damage', 'Weapon damage'],
  ['spellDC', 'Spell save DC'], ['spellAttack', 'Spell attack'], ['save:all', 'All saving throws'], ...ABILITIES.map((a): [string, string] => [`save:${a}`, `${ABILITY_NAMES[a]} saves`]),
  ...ABILITIES.map((a): [string, string] => [`ability:${a}`, `${ABILITY_NAMES[a]} score`]), ['check:all', 'All ability checks'], ...Object.keys(SKILLS).map((s): [string, string] => [`skill:${s}`, `${cap(s)} skill`]),
  ['passive:perception', 'Passive Perception'], ['acBaseUnarmored', 'Unarmoured base AC (set minimum)']];

/** Open the dialog. `kind` preselects the type; `existing` edits a feature in place. */
export function featureDialog(c: Character, kind: FeatureKind, existing?: FeatureEntry): void {
  const reg = state.registry;
  const f: FeatureInput = existing ? inputFromFeature(c, existing) : { kind, name: '', summary: '', modifiers: [], profs: [], spellIds: [],
    classId: kind === 'class' || kind === 'subclass' ? c.classes[0]?.classId : undefined, level: kind === 'class' || kind === 'subclass' ? c.classes[0]?.level : undefined };
  if (existing && !f.classId && (f.kind === 'class' || f.kind === 'subclass')) { // built-in features only record a source label such as "Wizard 3"
    const cl = c.classes.find((x) => [byId(reg.classes, x.classId)?.name, byId(reg.subclasses, x.subclassId)?.name].some((n) => n && existing.source.startsWith(n))) ?? c.classes[0];
    f.classId = cl?.classId; f.level ??= existing.level ?? cl?.level;
  }
  let saveToLibrary = false;
  const form = h('form', { novalidate: true, class: 'feature-form', on: { submit: (e) => e.preventDefault() } });
  const set = <K extends keyof FeatureInput>(k: K, v: FeatureInput[K]) => { f[k] = v; };
  const draw = () => {
    const classOpts = c.classes.map((cl) => ({ value: cl.classId, label: `${byId(reg.classes, cl.classId)?.name ?? cl.classId} (level ${cl.level})` }));
    const cl = c.classes.find((x) => x.classId === f.classId);
    const subName = byId(reg.subclasses, cl?.subclassId)?.name;
    fill(form, h('div', { class: 'error-summary', role: 'alert', tabindex: '-1', hidden: true }),
      field('Type', select((Object.keys(KIND_LABELS) as FeatureKind[]).map((k) => ({ value: k, label: KIND_LABELS[k] })), f.kind, { on: { change: (e) => { f.kind = (e.target as HTMLSelectElement).value as FeatureKind; if ((f.kind === 'class' || f.kind === 'subclass') && !f.classId) f.classId = c.classes[0]?.classId; draw(); } } })),
      f.kind === 'class' || f.kind === 'subclass' ? h('div', { class: 'grid-2' },
        field('Class', select(classOpts.length ? classOpts : [{ value: '', label: 'This character has no class' }], f.classId ?? '', { on: { change: (e) => { f.classId = (e.target as HTMLSelectElement).value; draw(); } } }), { required: true, name: 'classId' }),
        field('Gained at class level', num(f.level ?? 1, { min: 1, max: 20, on: { input: (e) => set('level', Number((e.target as HTMLInputElement).value)) } }), { name: 'level' }),
        f.kind === 'subclass' ? h('p', { class: 'hint' }, subName ? `Subclass: ${subName}` : 'This class has no subclass chosen yet; the feature is still recorded against the class.') : null) : null,
      field('Name', input({ value: f.name, autocomplete: 'off', on: { input: (e) => set('name', (e.target as HTMLInputElement).value) } }), { required: true, name: 'name' }),
      field('Description', textarea(f.summary, { rows: 4, on: { input: (e) => set('summary', (e.target as HTMLTextAreaElement).value) } }), { hint: 'Paste or summarise the rules text. Markdown-style **bold** and lists are fine.' }),
      h('details', { class: 'mech', open: !!(f.modifiers.length || f.resource || f.action || f.profs.length || f.spellIds.length) }, h('summary', null, 'Mechanics (optional): bonuses, uses per rest, an action, proficiencies, spells'),
        h('h3', null, 'Bonuses'), h('p', { class: 'hint' }, 'Applied automatically and shown in every calculation breakdown.'), modRows(f),
        h('h3', null, 'Limited uses'), resourceBox(f),
        h('h3', null, 'Action'), actionBox(f),
        h('h3', null, 'Proficiencies'), profRows(f),
        h('h3', null, 'Spells always prepared'), spellBox(f)),
      f.kind !== 'other' ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: saveToLibrary, on: { change: (e) => (saveToLibrary = (e.target as HTMLInputElement).checked) } }),
        ` Also save to My content, so future ${f.kind === 'class' ? `${byId(reg.classes, f.classId)?.name ?? 'class'} characters get it at level ${f.level ?? 1}` : f.kind === 'subclass' ? `${subName ?? 'subclass'} characters get it at level ${f.level ?? 1}` : f.kind === 'species' ? `${byId(reg.species, c.speciesId)?.name ?? 'species'} characters get it` : f.kind === 'background' ? `${byId(reg.backgrounds, c.backgroundId)?.name ?? 'background'} characters get it` : 'characters can choose it as a feat'}`) : null);
  };
  const modRows = (x: FeatureInput) => {
    const box = h('div');
    const dr = () => fill(box, h('ul', { class: 'edit-list' }, x.modifiers.map((m, i) => h('li', null, `${COMMON_TARGETS.find(([t]) => t === m.target)?.[1] ?? m.target}: ${m.op === 'setMin' ? 'at least ' : m.value >= 0 ? '+' : ''}${m.value}`, btn('Remove', () => { x.modifiers.splice(i, 1); dr(); }, 'btn btn-small btn-ghost')))),
      (() => { const t = select(COMMON_TARGETS.map(([v, l]) => ({ value: v, label: l })), 'ac', { 'aria-label': 'Bonus applies to' }); const o = select([{ value: 'add', label: 'add' }, { value: 'setMin', label: 'set minimum' }], 'add', { 'aria-label': 'Operation' }); const v = num(1, { 'aria-label': 'Amount' });
        return h('div', { class: 'row wrap' }, t, o, v, btn('Add bonus', () => { const n = Number(v.value); if (!Number.isFinite(n)) return toast('Enter a number.', 'warn'); x.modifiers.push({ target: t.value, op: o.value as Modifier['op'], value: n }); dr(); }, 'btn btn-small')); })(),
      h('p', { class: 'hint' }, `Other targets can be added from My content: ${MODIFIER_TARGET_HINT}.`));
    dr(); return box;
  };
  const resourceBox = (x: FeatureInput) => {
    const box = h('div');
    const dr = () => {
      if (!x.resource) return fill(box, btn('Add limited uses', () => { x.resource = { name: x.name || 'Uses', max: 1, recovery: 'long' }; dr(); }, 'btn btn-small'));
      const r = x.resource;
      const mode = select([{ value: 'fixed', label: 'Fixed number' }, ...RESOURCE_FORMULAS.map((fm) => ({ value: fm, label: fm.replace('abilityMod:', '').replace(/^(1\+)?(\w{3})$/, (_m, one: string | undefined, ab: string) => `${one ? '1 + ' : ''}${ABILITY_NAMES[ab as Ability] ?? ab} modifier`).replace('level*5', '5 × level').replace(/^level$/, 'Character level') }))], r.formula ?? 'fixed', { 'aria-label': 'How many uses', on: { change: (e) => { const v = (e.target as HTMLSelectElement).value; r.formula = v === 'fixed' ? undefined : v; dr(); } } });
      fill(box, h('div', { class: 'grid-2', 'data-field': 'resource' },
        field('Resource name', input({ value: r.name, on: { input: (e) => (r.name = (e.target as HTMLInputElement).value) } })), field('Uses', mode),
        !r.formula ? field('Number of uses', num(r.max, { min: 1, on: { input: (e) => (r.max = Number((e.target as HTMLInputElement).value)) } })) : null,
        field('Recovers on', select([{ value: 'long', label: 'Long rest' }, { value: 'short', label: 'Short or long rest' }, { value: 'dawn', label: 'Dawn' }, { value: 'none', label: 'Never (manual)' }], r.recovery, { on: { change: (e) => (r.recovery = (e.target as HTMLSelectElement).value as RecoveryTiming) } })),
        btn('Remove limited uses', () => { x.resource = undefined; dr(); }, 'btn btn-small btn-ghost')), h('p', { class: 'field-error', hidden: true }));
    };
    dr(); return box;
  };
  const actionBox = (x: FeatureInput) => {
    const box = h('div');
    const blank: Omit<ActionDef, 'id' | 'source'> = { name: '', economy: 'action', range: '5 ft', target: 'One creature', attackType: 'none', proficient: true, attackBonusExtra: 0, damage: '', damageType: '', notes: '' };
    const dr = () => {
      if (!x.action) return fill(box, btn('Add an action to the combat screen', () => { x.action = { ...blank, name: x.name }; dr(); }, 'btn btn-small'));
      const a = x.action;
      const bind = <K extends keyof typeof a>(k: K, el: HTMLInputElement | HTMLSelectElement, conv: (v: string) => (typeof a)[K]) => { el.addEventListener('input', () => (a[k] = conv(el.value))); el.addEventListener('change', () => (a[k] = conv(el.value))); return el; };
      fill(box, h('div', { class: 'grid-2', 'data-field': 'action' },
        field('Action name', bind('name', input({ value: a.name }), (v) => v)),
        field('Uses', bind('economy', select(['action', 'bonus', 'reaction', 'free', 'other'].map((v) => ({ value: v, label: v === 'bonus' ? 'Bonus action' : cap(v) })), a.economy), (v) => v as ActionDef['economy'])),
        field('Roll', bind('attackType', select([['none', 'No roll'], ['melee', 'Melee weapon attack'], ['ranged', 'Ranged weapon attack'], ['spell-melee', 'Melee spell attack'], ['spell-ranged', 'Ranged spell attack'], ['save', 'Saving throw']].map(([v, l]) => ({ value: v!, label: l! })), a.attackType), (v) => v as ActionDef['attackType'])),
        field('Ability', bind('ability', select([{ value: '', label: 'None' }, ...ABILITIES.map((ab) => ({ value: ab, label: ABILITY_NAMES[ab] }))], a.ability ?? ''), (v) => (v || undefined) as Ability | undefined)),
        field('Save ability', bind('saveAbility', select([{ value: '', label: '—' }, ...ABILITIES.map((ab) => ({ value: ab, label: ABILITY_NAMES[ab] }))], a.saveAbility ?? ''), (v) => (v || undefined) as Ability | undefined)),
        field('Damage or healing dice', bind('damage', input({ value: a.damage, placeholder: '2d6+3' }), (v) => v.trim())),
        field('Damage type', bind('damageType', input({ value: a.damageType, placeholder: 'fire' }), (v) => v.trim())),
        field('Range', bind('range', input({ value: a.range }), (v) => v)),
        btn('Remove action', () => { x.action = undefined; dr(); }, 'btn btn-small btn-ghost')), h('p', { class: 'field-error', hidden: true }),
        x.resource ? h('p', { class: 'hint' }, 'Using this action spends one of the limited uses above.') : null);
    };
    dr(); return box;
  };
  const profRows = (x: FeatureInput) => {
    const box = h('div');
    const kinds: Proficiency['kind'][] = ['skill', 'expertise', 'save', 'armor', 'weapon', 'tool', 'language'];
    const dr = () => fill(box, h('ul', { class: 'chips' }, x.profs.map((p, i) => h('li', { class: 'chip' }, `${cap(p.kind)}: ${p.name}`, btn('✕', () => { x.profs.splice(i, 1); dr(); }, 'icon-btn', { 'aria-label': `Remove ${p.name}` })))),
      (() => { const k = select(kinds.map((v) => ({ value: v, label: cap(v) })), 'skill', { 'aria-label': 'Proficiency type' }); const n = input({ placeholder: 'e.g. stealth, heavy, Draconic', 'aria-label': 'Proficiency', list: 'prof-names' });
        return h('div', { class: 'row wrap' }, h('datalist', { id: 'prof-names' }, [...Object.keys(SKILLS), ...ABILITIES, 'light', 'medium', 'heavy', 'shield', 'simple', 'martial'].map((v) => h('option', { value: v }))), k, n,
          btn('Add proficiency', () => { if (!n.value.trim()) return; x.profs.push({ kind: k.value as Proficiency['kind'], name: n.value.trim() }); dr(); }, 'btn btn-small')); })());
    dr(); return box;
  };
  const spellBox = (x: FeatureInput) => {
    const box = h('div');
    const dr = () => fill(box, h('ul', { class: 'chips' }, x.spellIds.map((id, i) => h('li', { class: 'chip' }, byId(reg.spells, id)?.name ?? id, btn('✕', () => { x.spellIds.splice(i, 1); dr(); }, 'icon-btn', { 'aria-label': 'Remove spell' })))),
      (() => { const n = input({ placeholder: 'Start typing a spell name', 'aria-label': 'Spell', list: 'spell-names' });
        return h('div', { class: 'row wrap' }, h('datalist', { id: 'spell-names' }, reg.spells.map((s) => h('option', { value: s.name }))), n,
          btn('Add spell', () => { const s = reg.spells.find((sp) => sp.name.toLowerCase() === n.value.trim().toLowerCase()); if (!s) return toast('Spell not found. Add it under My content or install a content pack first.', 'warn'); if (!x.spellIds.includes(s.id)) x.spellIds.push(s.id); dr(); }, 'btn btn-small')); })());
    dr(); return box;
  };
  draw();
  modal(existing ? `Edit ${existing.name}` : `Add ${KIND_LABELS[kind].toLowerCase()}`, form, [{ label: 'Cancel', cls: 'btn btn-ghost' }, { label: existing ? 'Save changes' : 'Add to sheet', cls: 'btn btn-primary', run: async () => {
    f.name = f.name.trim();
    const errs = validateFeatureInput(f);
    if (!showErrors(form, errs)) return false;
    if (f.kind !== 'class' && f.kind !== 'subclass') { f.classId = undefined; f.subclassId = undefined; if (f.kind !== 'feat') f.level = undefined; }
    if (f.kind === 'subclass') f.subclassId = c.classes.find((x) => x.classId === f.classId)?.subclassId;
    let contentId: string | undefined;
    if (saveToLibrary && !existing?.contentId) {
      const lib = toLibraryContent(c, f); contentId = lib.id;
      await state.repo.put('custom', lib); await reloadCustom();
    }
    const ev = await change('feature', `${existing ? 'Edited' : 'Added'} ${KIND_LABELS[f.kind].toLowerCase()}: ${f.name}`, (dr) => {
      if (existing) updateFeature(dr, state.registry, existing.id, f);
      else { addFeature(dr, state.registry, f, undefined, contentId); if (contentId) dr.grants = dr.grants.filter((g) => g !== contentId); }
    });
    if (ev && contentId) toast(`${f.name} saved to My content.`);
    return !!ev || !!existing;
  } }], { wide: true });
}
