import { ABILITIES } from '../../types.js';
import { h, btn, card, field, input, num, select, textarea, modal, toast, sign, link, confirmDialog, empty, clear, put, fill } from '../dom.js';
import { state, change, commit, setActive, eventsFor, snapshotsFor, undo, notify } from '../store.js';
import { needCharacter, pageHeader, classLine, charTabs, breakdownTable } from '../components.js';
import { ABILITY_NAMES, cap, compute } from '../../rules/calc.js';
import { byId } from '../../data/registry.js';
import { planLevelUp, applyLevelUp, multiclassCheck, fixedHp, syncAlwaysPrepared } from '../../rules/levelup.js';
import { SKILLS } from '../../data/srd-classes.js';
import { uid, nowIso, clone } from '../../rules/events.js';
import { roll } from '../../rules/dice.js';
import { setGuard } from '../router.js';
// ---------------- Features ----------------
export function featuresView(p) {
    const c = needCharacter(p.id);
    if (c instanceof HTMLElement)
        return c;
    setActive(c);
    const reg = state.registry;
    const grantable = reg.custom.filter((x) => !c.grants.includes(x.id));
    const fName = input({ 'aria-label': 'Feature name', placeholder: 'Feature name' });
    const fSum = textarea('', { rows: 2, 'aria-label': 'Feature description', placeholder: 'What it does' });
    return h('div', { class: 'page' }, pageHeader('Features & traits', `${c.name} · ${classLine(c)}`), charTabs(c.id, 'Features'), card('Unresolved choices', c.pendingChoices.length ? h('ul', { class: 'pending' }, c.pendingChoices.map((pc) => h('li', null, h('span', null, pc.label), btn('Resolve', () => resolveChoice(c, pc), 'btn btn-small btn-primary'), btn('Dismiss', () => void change('feature', `Dismissed: ${pc.label}`, (d) => { d.pendingChoices = d.pendingChoices.filter((x) => x.id !== pc.id); }), 'btn btn-small btn-ghost')))) : h('p', { class: 'hint' }, 'Nothing outstanding.')), card('Features', h('ul', { class: 'feature-list' }, c.features.map((f) => h('li', null, h('details', null, h('summary', null, h('strong', null, f.name), h('small', null, ` · ${f.source}`)), h('p', null, f.summary || 'No description recorded.'), btn('Remove', async () => { if (await confirmDialog('Remove feature?', `Remove “${f.name}”?`, 'Remove', true))
        await change('feature', `Removed feature ${f.name}`, (d) => { d.features = d.features.filter((x) => x.id !== f.id); }); }, 'btn btn-small btn-ghost'))))), h('h3', null, 'Add a feature'), field('Name', fName, { required: true }), field('Description', fSum), btn('Add feature', () => { if (!fName.value.trim())
        return toast('Enter a feature name.', 'warn'); void change('feature', `Added feature ${fName.value.trim()}`, (d) => { d.features.push({ id: uid(), name: fName.value.trim(), summary: fSum.value, source: 'Manual' }); }); }, 'btn btn-small')), card('Feats', c.feats.length ? h('ul', null, c.feats.map((id) => h('li', null, byId(reg.feats, id)?.name ?? `${id} (missing)`, ' ', btn('Remove', () => void change('feature', `Removed feat ${id}`, (d) => { d.feats = d.feats.filter((x) => x !== id); }), 'btn btn-small btn-ghost')))) : h('p', { class: 'hint' }, 'No feats. Feats are usually chosen in place of an Ability Score Improvement.')), card('Applied custom content', h('p', { class: 'hint' }, 'Custom items, feats, invocations, rules and boons apply their structured modifiers and resources to this character.'), c.grants.length ? h('ul', null, c.grants.map((g) => { const cc = byId(reg.custom, g); return h('li', null, cc ? `${cc.name} (${cc.category}, ${cc.sourceLabel})` : `${g} (missing or disabled)`, ' ', btn('Remove', () => void change('feature', `Removed ${cc?.name ?? g}`, (d) => { d.grants = d.grants.filter((x) => x !== g); syncAlwaysPrepared(d, reg); }), 'btn btn-small btn-ghost')); })) : h('p', { class: 'hint' }, 'None applied.'), grantable.length ? (() => { const s = select(grantable.map((x) => ({ value: x.id, label: `${x.name} (${x.category})` })), grantable[0].id, { 'aria-label': 'Custom content to apply' }); return h('div', { class: 'row' }, s, btn('Apply', () => { const cc = byId(reg.custom, s.value); void change('feature', `Applied ${cc.name}`, (d) => { d.grants.push(cc.id); if (cc.description)
        d.features.push({ id: uid(), name: cc.name, summary: cc.description, source: cc.sourceLabel, contentId: cc.id }); cc.proficiencies.forEach((pr) => { const [kind, name] = pr.includes(':') ? pr.split(':') : ['tool', pr]; d.proficiencies.push({ kind: kind, name: name.trim().toLowerCase(), source: cc.name }); }); cc.spellAdditions.forEach((sid) => { if (!d.spellcasting.known.includes(sid))
        d.spellcasting.known.push(sid); if (!d.spellcasting.alwaysPrepared.includes(sid))
        d.spellcasting.alwaysPrepared.push(sid); }); cc.actions.forEach((a) => d.actions.push({ ...a, id: uid() })); syncAlwaysPrepared(d, reg); }); }, 'btn btn-small')); })() : link('#/content', 'Create custom content', 'btn btn-small btn-ghost')), card('Custom actions', actionList(c), btn('Add action', () => actionDialog(), 'btn btn-small')), card('Custom resources', resourceEditor(c)));
}
function actionList(c) {
    return c.actions.length ? h('ul', { class: 'edit-list' }, c.actions.map((a) => h('li', null, h('strong', null, a.name), ` · ${a.economy} · ${a.attackType}${a.damage ? ` · ${a.damage} ${a.damageType}` : ''}`, btn('Edit', () => actionDialog(a), 'btn btn-small btn-ghost'), btn('Delete', () => void change('feature', `Deleted action ${a.name}`, (d) => { d.actions = d.actions.filter((x) => x.id !== a.id); }), 'btn btn-small btn-ghost')))) : h('p', { class: 'hint' }, 'Add spells, features, breath weapons or anything else you use in combat.');
}
export function actionDialog(existing) {
    const a = existing ? clone(existing) : { id: uid(), name: '', economy: 'action', range: '5 ft', target: 'One creature', attackType: 'melee', ability: 'str', proficient: true, attackBonusExtra: 0, damage: '', damageType: '', notes: '', source: 'Custom' };
    const name = input({ value: a.name });
    const eco = select(['action', 'bonus', 'reaction', 'free', 'other'].map((x) => ({ value: x, label: cap(x) })), a.economy);
    const type = select([['melee', 'Melee weapon attack'], ['ranged', 'Ranged weapon attack'], ['spell-melee', 'Melee spell attack'], ['spell-ranged', 'Ranged spell attack'], ['save', 'Saving throw'], ['none', 'No roll']].map(([v, l]) => ({ value: v, label: l })), a.attackType);
    const ab = select([{ value: '', label: 'None' }, ...ABILITIES.map((x) => ({ value: x, label: ABILITY_NAMES[x] }))], a.ability ?? '');
    const prof = h('input', { type: 'checkbox', checked: a.proficient });
    const extra = num(a.attackBonusExtra);
    const saveAb = select([{ value: '', label: '—' }, ...ABILITIES.map((x) => ({ value: x, label: ABILITY_NAMES[x] }))], a.saveAbility ?? '');
    const dc = num(a.saveDC ?? 0, { min: 0 });
    const dmg = input({ value: a.damage, placeholder: '1d8+3' });
    const dt = input({ value: a.damageType, placeholder: 'fire' });
    const ex = input({ value: a.extraDamage ?? '', placeholder: '1d6 (optional)' });
    const vers = input({ value: a.versatile ?? '' });
    const range = input({ value: a.range });
    const target = input({ value: a.target });
    const notes = textarea(a.notes, { rows: 2 });
    const res = select([{ value: '', label: 'None' }, ...(state.derived?.resources ?? []).map((r) => ({ value: r.id, label: r.name }))], a.resourceId ?? '');
    const ammo = select([{ value: '', label: 'None' }, ...(state.active?.inventory ?? []).filter((i) => i.category === 'ammunition').map((i) => ({ value: i.id, label: i.name }))], a.ammoItemId ?? '');
    modal(existing ? `Edit ${a.name}` : 'New action', h('div', { class: 'grid-2' }, field('Name', name, { required: true }), field('Action type', eco), field('Roll', type), field('Ability', ab), h('label', { class: 'check' }, prof, ' Add proficiency bonus'), field('Extra attack bonus', extra), field('Save ability', saveAb), field('Save DC (0 = use spell DC)', dc), field('Damage dice', dmg, { hint: 'Include the modifier, e.g. 2d6+3' }), field('Damage type', dt), field('Additional damage', ex), field('Versatile damage', vers), field('Range', range), field('Target', target), field('Uses resource', res), field('Uses ammunition', ammo), field('Notes', notes)), [{ label: 'Cancel', cls: 'btn btn-ghost' }, { label: 'Save action', cls: 'btn btn-primary', run: async () => {
                if (!name.value.trim()) {
                    toast('Enter a name.', 'error');
                    return false;
                }
                if (dmg.value.trim() && !/^[\dd+\-\s]+$/i.test(dmg.value)) {
                    toast('Damage must be a dice expression such as 2d6+3.', 'error');
                    return false;
                }
                Object.assign(a, { name: name.value.trim(), economy: eco.value, attackType: type.value, ability: (ab.value || undefined), proficient: prof.checked, attackBonusExtra: Number(extra.value) || 0, saveAbility: (saveAb.value || undefined), saveDC: Number(dc.value) || undefined,
                    damage: dmg.value.trim(), damageType: dt.value.trim(), extraDamage: ex.value.trim() || undefined, versatile: vers.value.trim() || undefined, range: range.value, target: target.value, notes: notes.value, resourceId: res.value || undefined, ammoItemId: ammo.value || undefined });
                await change('feature', `${existing ? 'Edited' : 'Added'} action ${a.name}`, (d) => { const i = d.actions.findIndex((x) => x.id === a.id); if (i >= 0)
                    d.actions[i] = a;
                else
                    d.actions.push(a); });
                return true;
            } }], { wide: true });
}
function resourceEditor(c) {
    const custom = c.resources.filter((r) => r.custom);
    const n = input({ placeholder: 'e.g. Luck points', 'aria-label': 'Resource name' });
    const m = num(3, { min: 1, 'aria-label': 'Maximum' });
    const rec = select([{ value: 'long', label: 'Long rest' }, { value: 'short', label: 'Short rest' }, { value: 'dawn', label: 'Dawn' }, { value: 'none', label: 'Never (manual)' }], 'long', { 'aria-label': 'Recovery' });
    return h('div', null, custom.length ? h('ul', { class: 'edit-list' }, custom.map((r) => h('li', null, `${r.name}: max ${r.max}, ${r.recovery}`, btn('Delete', () => void change('resource', `Deleted resource ${r.name}`, (d) => { d.resources = d.resources.filter((x) => x.id !== r.id); }), 'btn btn-small btn-ghost')))) : null, h('div', { class: 'row wrap' }, n, m, rec, btn('Add resource', () => { if (!n.value.trim() || !(Number(m.value) > 0))
        return toast('Enter a name and a maximum above 0.', 'warn'); void change('resource', `Added resource ${n.value.trim()}`, (d) => { d.resources.push({ id: uid(), name: n.value.trim(), max: Number(m.value), used: 0, recovery: rec.value, source: 'Custom', custom: true }); }); }, 'btn btn-small')));
}
function resolveChoice(c, pc) {
    const reg = state.registry;
    const d = state.derived;
    const done = (desc, fn) => change('feature', desc, (dr) => { fn(dr); dr.pendingChoices = dr.pendingChoices.filter((x) => x.id !== pc.id); });
    if (pc.kind === 'subclass') {
        const subs = reg.subclasses.filter((s) => s.classId === pc.classId);
        if (!subs.length)
            return void toast('No subclasses available for this class. Add one under Custom content.', 'warn');
        const s = select(subs.map((x) => ({ value: x.id, label: x.name })), subs[0].id);
        modal(pc.label, field('Subclass', s), [{ label: 'Cancel', cls: 'btn btn-ghost' }, { label: 'Choose', cls: 'btn btn-primary', run: async () => {
                    const sub = byId(reg.subclasses, s.value);
                    const cl = c.classes.find((x) => x.classId === pc.classId);
                    await done(`Chose ${sub.name}`, (dr) => { dr.classes.find((x) => x.classId === pc.classId).subclassId = sub.id; sub.features.filter((f) => f.level <= cl.level).forEach((f) => dr.features.push({ id: uid(), name: f.name, summary: f.summary ?? '', level: f.level, source: sub.name })); });
                } }]);
    }
    else if (pc.kind === 'asi') {
        const mode = select([{ value: 'two', label: '+2 to one ability' }, { value: 'split', label: '+1 to two abilities' }, { value: 'feat', label: 'Take a feat' }], 'two');
        const a1 = select(ABILITIES.map((a) => ({ value: a, label: `${ABILITY_NAMES[a]} (${d.abilities[a].value})` })), 'str');
        const a2 = select(ABILITIES.map((a) => ({ value: a, label: `${ABILITY_NAMES[a]} (${d.abilities[a].value})` })), 'dex');
        const ft = select(reg.feats.map((f) => ({ value: f.id, label: `${f.name}${f.prerequisite ? ` (requires ${f.prerequisite})` : ''}` })), reg.feats[0]?.id ?? '');
        modal(pc.label, h('div', null, field('Choice', mode), field('Ability', a1), field('Second ability (for +1/+1)', a2), field('Feat', ft, { hint: 'Add more feats under Custom content.' })), [{ label: 'Cancel', cls: 'btn btn-ghost' }, { label: 'Apply', cls: 'btn btn-primary', run: async () => {
                    if (mode.value === 'feat') {
                        const f = byId(reg.feats, ft.value);
                        if (!f) {
                            toast('Choose a feat.', 'error');
                            return false;
                        }
                        await done(`Took feat ${f.name}`, (dr) => { dr.feats.push(f.id); dr.features.push({ id: uid(), name: f.name, summary: f.summary, source: 'Feat' }); });
                        return true;
                    }
                    const bonuses = mode.value === 'two' ? [{ ability: a1.value, amount: 2 }] : [{ ability: a1.value, amount: 1 }, { ability: a2.value, amount: 1 }];
                    if (mode.value === 'split' && a1.value === a2.value) {
                        toast('Choose two different abilities.', 'error');
                        return false;
                    }
                    for (const b of bonuses)
                        if (d.abilities[b.ability].value + b.amount > 20) {
                            toast(`${ABILITY_NAMES[b.ability]} cannot exceed 20.`, 'error');
                            return false;
                        }
                    await done(`ASI: ${bonuses.map((b) => `${ABILITY_NAMES[b.ability]} +${b.amount}`).join(', ')}`, (dr) => bonuses.forEach((b) => dr.abilityBonuses.push({ ...b, source: `ASI (${pc.label.replace(/.*\(/, '').replace(')', '')})` })));
                    return true;
                } }]);
    }
    else if (pc.kind === 'expertise') {
        const opts = Object.keys(SKILLS).filter((s) => d.skills[s]?.proficient && !d.skills[s]?.expertise);
        const boxes = opts.map((s) => h('label', { class: 'choice' }, h('input', { type: 'checkbox', value: s }), h('span', null, cap(s))));
        modal(pc.label, h('div', { class: 'choice-grid' }, boxes), [{ label: 'Cancel', cls: 'btn btn-ghost' }, { label: 'Apply', cls: 'btn btn-primary', run: async () => {
                    const sel = boxes.map((b) => b.querySelector('input')).filter((i) => i.checked).map((i) => i.value);
                    if (sel.length !== 2) {
                        toast('Choose exactly two skills.', 'error');
                        return false;
                    }
                    await done(`Expertise: ${sel.join(', ')}`, (dr) => sel.forEach((s) => dr.proficiencies.push({ kind: 'expertise', name: s, source: pc.label })));
                    return true;
                } }]);
    }
    else {
        const n = textarea('', { rows: 2 });
        modal(pc.label, field('What did you choose?', n, { hint: 'Recorded as a feature.' }), [{ label: 'Cancel', cls: 'btn btn-ghost' }, { label: 'Record', cls: 'btn btn-primary', run: async () => { await done(`Resolved: ${pc.label}`, (dr) => dr.features.push({ id: uid(), name: pc.label.replace(/^Choose /, ''), summary: n.value, source: 'Choice' })); } }]);
    }
}
// ---------------- Level up ----------------
export async function levelUpView(p) {
    const c = needCharacter(p.id);
    if (c instanceof HTMLElement)
        return c;
    setActive(c);
    const reg = state.registry;
    const sessions = c.campaignId ? (await state.repo.byIndex('records', 'campaignId', c.campaignId)).filter((r) => r.kind === 'session') : [];
    const inp = { classId: c.classes[0]?.classId ?? '', hpMethod: state.settings.hpOnLevel };
    let sessionId = '';
    let committing = false;
    const root = h('div', { class: 'page' });
    setGuard(() => false);
    const draw = () => {
        clear(root);
        put(root, pageHeader('Level up', `${c.name} · currently level ${compute(c, reg).totalLevel}`), charTabs(c.id, 'Level up'));
        const def = byId(reg.classes, inp.classId);
        const clsSel = select(reg.classes.map((x) => { const cur = c.classes.find((y) => y.classId === x.id); const mc = cur ? { ok: true } : multiclassCheck(c, reg, x.id); return { value: x.id, label: `${x.name}${cur ? ` (→ ${cur.level + 1})` : ' (new class)'}${mc.ok ? '' : ' — prerequisites not met'}` }; }), inp.classId, { on: { change: (e) => { inp.classId = e.target.value; inp.subclassId = undefined; inp.asi = undefined; inp.expertise = undefined; draw(); } } });
        const hpSel = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Hit point method' }, ['fixed', 'roll', 'manual'].map((m) => h('label', { class: inp.hpMethod === m ? 'on' : '' }, h('input', { type: 'radio', name: 'hpm', checked: inp.hpMethod === m, on: { change: () => { inp.hpMethod = m; inp.hpValue = undefined; draw(); } } }), m === 'fixed' ? `Fixed (${def ? fixedHp(def.hitDie) : '—'})` : m === 'roll' ? 'Roll' : 'Manual')));
        const hpVal = num(inp.hpValue ?? 0, { min: 0, 'aria-label': 'Hit point value', on: { change: (e) => { inp.hpValue = Number(e.target.value); draw(); } } });
        const plan = planLevelUp(c, reg, inp);
        const cl = c.classes.find((x) => x.classId === inp.classId);
        const nextLevel = (cl?.level ?? 0) + 1;
        const subs = def ? reg.subclasses.filter((s) => s.classId === def.id) : [];
        const asiHere = def?.asiLevels.includes(nextLevel);
        const expHere = (def?.id === 'rogue' && [1, 6].includes(nextLevel)) || (def?.id === 'bard' && [3, 10].includes(nextLevel));
        const mc = def && !cl ? multiclassCheck(c, reg, def.id) : { ok: true, reasons: [] };
        const before = compute(c, reg);
        let after = null;
        if (plan.ok) {
            const tmp = clone(c);
            try {
                applyLevelUp(tmp, reg, inp, plan);
                after = compute(tmp, reg);
            }
            catch {
                after = null;
            }
        }
        put(root, h('div', { class: 'wizard-layout' }, h('div', null, card('1. Class', field('Class gaining the level', clsSel), !mc.ok ? h('div', { class: 'notice notice-warn' }, h('ul', null, mc.reasons.map((r) => h('li', null, r))), h('label', { class: 'override-toggle' }, h('input', { type: 'checkbox', checked: !!inp.overrideMulticlass, on: { change: (e) => { inp.overrideMulticlass = e.target.checked; draw(); } } }), ' Override prerequisites (custom ruling)')) : null), card('2. Hit points', hpSel, inp.hpMethod !== 'fixed' ? h('div', { class: 'row' }, hpVal, inp.hpMethod === 'roll' && def ? btn(`Roll d${def.hitDie}`, () => { inp.hpValue = roll(`1d${def.hitDie}`).total; draw(); }, 'btn btn-roll') : null) : null, h('p', { class: 'hint' }, 'Your Constitution modifier is added automatically (minimum 1 HP per level).')), def && nextLevel === def.subclassLevel && !cl?.subclassId ? card(`3. ${def.subclassLabel}`, field(def.subclassLabel, select([{ value: '', label: '— Choose later —' }, ...subs.map((s) => ({ value: s.id, label: s.name }))], inp.subclassId ?? '', { on: { change: (e) => { inp.subclassId = e.target.value || undefined; draw(); } } }))) : null, asiHere ? card('Ability Score Improvement or feat', asiPicker(inp, before, draw)) : null, expHere ? card('Expertise', h('div', { class: 'choice-grid' }, Object.keys(SKILLS).filter((s) => before.skills[s]?.proficient && !before.skills[s]?.expertise).map((s) => h('label', { class: 'choice' }, h('input', { type: 'checkbox', checked: inp.expertise?.includes(s), on: { change: (e) => { const on = e.target.checked; inp.expertise = on ? [...(inp.expertise ?? []), s] : (inp.expertise ?? []).filter((x) => x !== s); draw(); } } }), h('span', null, cap(s)))))) : null, sessions.length ? card('Link to session', field('Session', select([{ value: '', label: '— None —' }, ...sessions.map((s) => ({ value: s.id, label: s.title }))], sessionId, { on: { change: (e) => (sessionId = e.target.value) } }))) : null, h('div', { class: 'wizard-nav' }, btn(`Confirm level ${plan.toLevel}`, async () => {
            if (committing)
                return;
            const pl = planLevelUp(c, reg, inp);
            if (!pl.ok)
                return void toast(pl.errors.join(' '), 'error');
            if (!(await confirmDialog(`Confirm level ${pl.toLevel}?`, h('ul', null, pl.summary.map((s) => h('li', null, s))), 'Level up')))
                return;
            committing = true;
            const next = clone(c);
            applyLevelUp(next, reg, inp, pl);
            next.updatedAt = nowIso();
            const snap = { id: uid(), characterId: c.id, ts: next.updatedAt, fromLevel: pl.fromLevel, toLevel: pl.toLevel, classId: inp.classId, before: clone(c), summary: [...pl.summary, ...pl.unresolved.map((u) => `Unresolved: ${u}`)], sessionId: sessionId || undefined };
            const ev = { id: uid(), characterId: c.id, ts: next.updatedAt, category: 'level', description: pl.summary[0], before: null, after: { summary: snap.summary }, reversible: false, undone: false, sessionId: sessionId || undefined };
            await commit(next, [ev], `Reached level ${pl.toLevel}`, snap);
            committing = false;
            location.hash = `/c/${c.id}/timeline`;
        }, 'btn btn-primary', { disabled: !plan.ok }))), h('aside', { class: 'preview card', 'aria-live': 'polite' }, h('h2', { class: 'card-title' }, 'Before → after'), plan.errors.length ? h('div', { class: 'notice notice-warn' }, h('ul', null, plan.errors.map((e) => h('li', null, e)))) : null, h('ul', null, plan.summary.map((s) => h('li', null, s))), after ? h('table', { class: 'breakdown' }, h('tbody', null, [['Level', before.totalLevel, after.totalLevel], ['Max HP', before.hpMax.value, after.hpMax.value], ['Proficiency', before.pb.value, after.pb.value], ['AC', before.ac.value, after.ac.value],
            ['Spell slots', before.slots.map((s) => s.max).join('/') || '—', after.slots.map((s) => s.max).join('/') || '—'], ['Pact slots', before.pact.count ? `${before.pact.count}×L${before.pact.level}` : '—', after.pact.count ? `${after.pact.count}×L${after.pact.level}` : '—']].map(([k, a, b]) => h('tr', { class: String(a) !== String(b) ? 'changed' : '' }, h('th', { scope: 'row' }, k), h('td', null, String(a)), h('td', null, '→'), h('td', null, String(b)))))) : null, plan.unresolved.length ? h('div', { class: 'notice' }, h('strong', null, 'Still to choose:'), h('ul', null, plan.unresolved.map((u) => h('li', null, u)))) : null)));
    };
    draw();
    return root;
}
function asiPicker(inp, d, draw) {
    const cur = inp.asi;
    const mode = !cur ? 'later' : cur.type === 'feat' ? 'feat' : cur.bonuses.length === 1 ? 'two' : 'split';
    const abSel = (val, onCh) => select(ABILITIES.map((a) => ({ value: a, label: `${ABILITY_NAMES[a]} (${d.abilities[a].value})` })), val, { on: { change: (e) => { onCh(e.target.value); draw(); } } });
    return h('div', null, h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'ASI type' }, [['later', 'Decide later'], ['two', '+2 one'], ['split', '+1 two'], ['feat', 'Feat']].map(([v, l]) => h('label', { class: mode === v ? 'on' : '' }, h('input', { type: 'radio', name: 'asi', checked: mode === v, on: { change: () => {
                inp.asi = v === 'later' ? undefined : v === 'two' ? { type: 'asi', bonuses: [{ ability: 'str', amount: 2 }] } : v === 'split' ? { type: 'asi', bonuses: [{ ability: 'str', amount: 1 }, { ability: 'dex', amount: 1 }] } : { type: 'feat', featId: state.registry.feats[0]?.id ?? '' };
                draw();
            } } }), l))), cur?.type === 'asi' ? h('div', { class: 'row' }, cur.bonuses.map((b, i) => abSel(b.ability, (a) => { cur.bonuses[i] = { ...b, ability: a }; }))) : null, cur?.type === 'feat' ? select(state.registry.feats.map((f) => ({ value: f.id, label: f.name })), cur.featId, { 'aria-label': 'Feat', on: { change: (e) => { cur.featId = e.target.value; draw(); } } }) : null);
}
// ---------------- Timeline ----------------
export async function timelineView(p) {
    const c = needCharacter(p.id);
    if (c instanceof HTMLElement)
        return c;
    setActive(c);
    const [events, snaps] = await Promise.all([eventsFor(c.id), snapshotsFor(c.id)]);
    const shown = events.filter((e) => ['create', 'level', 'milestone', 'note', 'import'].includes(e.category) || (e.category === 'feature' && /ASI|feat|Chose/i.test(e.description)) || (e.category === 'inventory' && /attun|magic/i.test(e.description)));
    const latest = snaps[0];
    const t = input({ placeholder: 'e.g. Defeated the sea hag; gained a ship', 'aria-label': 'Milestone' });
    return h('div', { class: 'page' }, pageHeader('Progression timeline', `${c.name} · level ${compute(c, state.registry).totalLevel}`), charTabs(c.id, 'Timeline'), card('Add a milestone or note', h('div', { class: 'row' }, t, btn('Add', () => { if (!t.value.trim())
        return; void addMilestone(c, t.value.trim()); }, 'btn btn-small'))), latest ? card('Reverse the latest level-up', h('p', null, `Restores the character exactly as it was before level ${latest.toLevel} (${byId(state.registry.classes, latest.classId)?.name ?? latest.classId}). Changes made since then will be lost.`), btn(`Reverse level ${latest.toLevel}`, async () => {
        if (compute(c, state.registry).totalLevel !== latest.toLevel)
            return toast('The character’s level no longer matches this snapshot.', 'error');
        if (!(await confirmDialog('Reverse level-up?', 'This restores the saved snapshot. Combat state, inventory and notes changed since the level-up are reverted too.', 'Reverse', true)))
            return;
        const restored = { ...clone(latest.before), updatedAt: nowIso() };
        await commit(restored, [{ id: uid(), characterId: c.id, ts: restored.updatedAt, category: 'level', description: `Reversed level ${latest.toLevel}`, before: null, after: null, reversible: false, undone: false }], `Level ${latest.toLevel} reversed`);
        await state.repo.del('snapshots', latest.id);
        notify();
    }, 'btn btn-danger btn-small')) : null, shown.length ? h('ol', { class: 'timeline' }, shown.map((e) => {
        const sn = snaps.find((s) => Math.abs(Date.parse(s.ts) - Date.parse(e.ts)) < 1000 && e.category === 'level');
        return h('li', { class: `tl-${e.category}` }, h('time', { datetime: e.ts }, new Date(e.ts).toLocaleDateString()), h('div', null, h('strong', null, e.description), sn ? h('ul', null, sn.summary.slice(1).map((s) => h('li', null, s))) : Array.isArray(e.after?.summary) ? h('ul', null, (e.after.summary).slice(1).map((s) => h('li', null, s))) : null, e.note ? h('p', { class: 'hint' }, e.note) : null));
    }))
        : empty('No progression events yet.'));
}
async function addMilestone(c, text) {
    const ev = { id: uid(), characterId: c.id, ts: nowIso(), category: 'milestone', description: text, before: null, after: null, reversible: false, undone: false };
    await state.repo.put('events', ev);
    toast('Milestone added.');
    notify();
}
// ---------------- Audit & inspector ----------------
export async function auditView(p) {
    const c = needCharacter(p.id);
    if (c instanceof HTMLElement)
        return c;
    setActive(c);
    const d = state.derived;
    const events = await eventsFor(c.id);
    const cats = [...new Set(events.map((e) => e.category))];
    let filter = '';
    const list = h('ol', { class: 'audit-list' });
    const drawList = () => fill(list, ...events.filter((e) => !filter || e.category === filter).slice(0, 300).map((e) => h('li', { class: e.undone ? 'undone' : '' }, h('div', { class: 'audit-head' }, h('span', { class: 'badge' }, e.category), h('time', { datetime: e.ts }, new Date(e.ts).toLocaleString()), e.undone ? h('span', { class: 'badge badge-warn' }, 'Undone') : null), h('p', null, e.description), e.before && e.after ? h('details', null, h('summary', null, `Changed: ${Object.keys(e.after).join(', ')}`), h('div', { class: 'diff' }, Object.keys(e.after).map((k) => h('div', null, h('strong', null, k), h('pre', { class: 'before' }, short(e.before[k])), h('pre', { class: 'after' }, short(e.after[k])))))) : null, e.reversible && !e.undone ? btn('Undo', () => void undo(e), 'btn btn-small btn-ghost') : null)));
    drawList();
    const all = [d.pb, d.ac, d.initiative, d.speed, d.hpMax, ...ABILITIES.map((a) => d.abilities[a]), ...ABILITIES.map((a) => d.saves[a]), ...Object.values(d.skills), d.passives.perception, d.passives.investigation, d.passives.insight,
        ...d.spellProfiles.flatMap((s) => [s.dc, s.attack]), ...d.attacks.flatMap((a) => (a.attack ? [a.attack] : [])), d.carrying.weight];
    const report = h('div');
    const recheck = () => {
        const fresh = compute(c, state.registry, state.settings);
        fill(report, ...[
            h('p', null, `Recalculated ${all.length} values at ${new Date().toLocaleTimeString()}.`),
            fresh.warnings.length ? h('ul', { class: 'warn-list' }, fresh.warnings.map((w) => h('li', null, w))) : h('p', { class: 'notice notice-ok' }, 'No warnings: all references resolve and no conflicts were found.'),
            Object.keys(c.overrides).length ? h('table', { class: 'breakdown' }, h('thead', null, h('tr', null, h('th', null, 'Overridden value'), h('th', null, 'Stored'), h('th', null, 'Calculated'))), h('tbody', null, all.filter((s) => s.overridden).map((s) => h('tr', null, h('td', null, s.label), h('td', null, String(s.value)), h('td', null, String(s.calculated)))))) : null
        ].filter((x) => !!x));
    };
    recheck();
    return h('div', { class: 'page' }, pageHeader('Audit & calculation inspector', c.name), charTabs(c.id, 'Audit'), card('Recalculation inspector', btn('Recalculate now', recheck, 'btn btn-small'), report, d.reminders.length ? h('div', null, h('h3', null, 'Reminders (not automated)'), h('ul', null, d.reminders.map((r) => h('li', null, r)))) : null, h('h3', null, 'Active modifiers'), d.modifiers.length ? h('table', { class: 'breakdown' }, h('thead', null, h('tr', null, h('th', null, 'Target'), h('th', null, 'Op'), h('th', null, 'Value'), h('th', null, 'Source'))), h('tbody', null, d.modifiers.map((m) => h('tr', null, h('td', null, m.target), h('td', null, m.op), h('td', null, sign(m.value)), h('td', null, m.source))))) : h('p', { class: 'hint' }, 'No structured modifiers active.'), h('h3', null, 'Every calculated value'), h('div', { class: 'inspect-list' }, all.map((s) => h('details', null, h('summary', null, `${s.label}: ${s.value}${s.overridden ? ' (override)' : ''}`), breakdownTable(s.parts, s.calculated, 'Calculated'), s.notes.map((n) => h('p', { class: 'hint' }, n))))), d.casterLevelParts.length ? h('div', null, h('h3', null, 'Spell-slot caster level'), h('ul', null, d.casterLevelParts.map((x) => h('li', null, `${x.type} caster, class level ${x.classLevel} → contributes ${x.contribution}`)))) : null), card('Change history', h('div', { class: 'row' }, h('label', { for: 'audit-filter' }, 'Filter '), select([{ value: '', label: 'All categories' }, ...cats.map((x) => ({ value: x, label: cap(x) }))], '', { id: 'audit-filter', on: { change: (e) => { filter = e.target.value; drawList(); } } }), h('span', { class: 'hint' }, `${events.length} events`)), list));
}
const short = (v) => { const s = JSON.stringify(v, null, 1) ?? 'null'; return s.length > 600 ? s.slice(0, 600) + '…' : s; };
