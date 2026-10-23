import { ABILITIES } from '../../types.js';
import { h, btn, card, field, input, num, select, textarea, toast, confirmDialog, empty, link, download, readFile, showErrors, clear, put, fill } from '../dom.js';
import { state, reloadCustom } from '../store.js';
import { pageHeader } from '../components.js';
import { blankCustom, validateCustom, CUSTOM_CATEGORIES, MODIFIER_TARGET_HINT, buildExport, readExport } from '../../io/importExport.js';
import { buildRegistry } from '../../data/registry.js';
import { blankDraft, buildCharacter } from '../../rules/factory.js';
import { compute, cap, ABILITY_NAMES } from '../../rules/calc.js';
import { nowIso, uid, clone } from '../../rules/events.js';
import { go, setGuard } from '../router.js';
const LABEL = { class: 'Class', subclass: 'Subclass', species: 'Species / race', background: 'Background', feat: 'Feat', spell: 'Spell', equipment: 'Equipment', weapon: 'Weapon', armor: 'Armour', tool: 'Tool', language: 'Language', condition: 'Condition',
    classFeature: 'Class feature', subclassFeature: 'Subclass feature', speciesTrait: 'Species trait', backgroundFeature: 'Background feature', invocation: 'Invocation / selectable option', fightingStyle: 'Fighting style', metamagic: 'Metamagic / class option', transformation: 'Wild Shape / transformation form',
    companion: 'Companion / familiar / summon', magicItem: 'Magic item', monster: 'Monster / NPC template', resource: 'Custom resource', rule: 'Custom rule' };
const ORIGIN = { srd: 'Included SRD', user: 'User-created', imported: 'Imported', homebrew: 'Homebrew' };
export function contentView() {
    const list = state.custom;
    const reg = state.registry;
    let cat = '';
    let origin = '';
    const box = h('div');
    const draw = () => fill(box, ...(() => {
        const l = list.filter((x) => (!cat || x.category === cat) && (!origin || x.origin === origin));
        return l.length ? [h('ul', { class: 'rec-list' }, l.map((x) => h('li', { class: x.enabled ? '' : 'disabled' }, h('a', { href: `#/content/edit/${x.id}` }, x.name), h('span', { class: 'badge' }, LABEL[x.category]), h('span', { class: `badge badge-src` }, ORIGIN[x.origin] ?? x.origin), h('small', null, ` ${x.sourceLabel} · v${x.version}`), !x.enabled ? h('span', { class: 'badge badge-warn' }, 'Disabled') : null, btn(x.enabled ? 'Disable' : 'Enable', async () => { await state.repo.put('custom', { ...x, enabled: !x.enabled, updatedAt: nowIso() }); await reloadCustom(); }, 'btn btn-small btn-ghost'), btn('Duplicate', async () => { await state.repo.put('custom', { ...clone(x), id: `custom-${uid()}`, name: `${x.name} (copy)`, createdAt: nowIso(), updatedAt: nowIso() }); await reloadCustom(); }, 'btn btn-small btn-ghost'), btn('Delete', async () => {
                const users = state.characters.filter((c) => c.grants.includes(x.id) || c.classes.some((k) => k.classId === x.id || k.subclassId === x.id) || c.speciesId === x.id || c.backgroundId === x.id || c.feats.includes(x.id) || c.spellcasting.known.includes(x.id));
                if (await confirmDialog(`Delete ${x.name}?`, users.length ? `Used by: ${users.map((u) => u.name).join(', ')}. Those characters will show a missing-content warning.` : 'This cannot be undone. Export it first if you may need it.', 'Delete', true)) {
                    await state.repo.del('custom', x.id);
                    await reloadCustom();
                }
            }, 'btn btn-small btn-ghost danger-text'))))] : [empty(list.length ? 'Nothing matches the filters.' : 'No custom content yet. Add material from books you own, or your own homebrew.')];
    })());
    draw();
    const catSel = select([{ value: '', label: 'All categories' }, ...CUSTOM_CATEGORIES.map((c) => ({ value: c, label: LABEL[c] }))], '', { 'aria-label': 'Category filter', on: { change: (e) => { cat = e.target.value; draw(); } } });
    const oSel = select([{ value: '', label: 'All origins' }, { value: 'user', label: 'User-created' }, { value: 'homebrew', label: 'Homebrew' }, { value: 'imported', label: 'Imported' }], '', { 'aria-label': 'Origin filter', on: { change: (e) => { origin = e.target.value; draw(); } } });
    const newCat = select(CUSTOM_CATEGORIES.map((c) => ({ value: c, label: LABEL[c] })), 'feat', { 'aria-label': 'New content category' });
    return h('div', { class: 'page' }, pageHeader('Custom content', 'Your private library of classes, spells, items and rules'), h('p', { class: 'notice' }, 'Only System Reference Document content is included with the app. Use this library to enter material from books you legally own, or your own homebrew. It stays on this device unless you export it.'), card('Create', h('div', { class: 'row wrap' }, newCat, btn('New entry', () => go(`/content/new/${newCat.value}`), 'btn btn-primary'), btn('Import JSON', () => void importContent(), 'btn'), btn('Export all', () => void exportContent(list), 'btn btn-ghost', { disabled: !list.length }))), card('Library', h('div', { class: 'row wrap' }, catSel, oSel), box), card('Included SRD content', h('ul', null, [['Classes', reg.classes], ['Subclasses', reg.subclasses], ['Species', reg.species], ['Backgrounds', reg.backgrounds], ['Spells', reg.spells], ['Weapons', reg.weapons], ['Armour', reg.armor], ['Conditions', reg.conditions], ['Feats', reg.feats]].map(([k, l]) => h('li', null, `${k}: ${l.filter((x) => x.source.origin === 'srd').length} SRD${l.some((x) => x.source.origin !== 'srd') ? ` + ${l.filter((x) => x.source.origin !== 'srd').length} custom` : ''}`))), link('#/about', 'Licence and attribution')));
}
async function exportContent(list) {
    download(`ledger-content-${nowIso().slice(0, 10)}.json`, await buildExport('content', { characters: [], events: [], snapshots: [], custom: list, campaigns: [], records: [], encounters: [] }));
}
async function importContent() {
    const text = await readFile('.json,application/json');
    if (!text)
        return;
    try {
        const rep = await readExport(text);
        if (!rep.data.custom.length)
            return toast(rep.errors[0] ?? 'No custom content found in that file.', 'error');
        const existing = new Set(state.custom.map((c) => c.id));
        const dup = rep.data.custom.filter((c) => existing.has(c.id));
        const ok = await confirmDialog('Import custom content?', h('div', null, h('p', null, `${rep.data.custom.length} entries. ${dup.length ? `${dup.length} already exist and will be updated if the imported version is newer or equal.` : ''}`), rep.integrity === 'mismatch' ? h('p', { class: 'notice notice-warn' }, 'Integrity check failed: the file was changed after export.') : null, rep.errors.length ? h('ul', { class: 'warn-list' }, rep.errors.slice(0, 10).map((e) => h('li', null, e))) : null), 'Import');
        if (!ok)
            return;
        const put = rep.data.custom.filter((c) => { const ex = state.custom.find((x) => x.id === c.id); return !ex || c.version >= ex.version; });
        await state.repo.tx([{ store: 'custom', put }]);
        await reloadCustom();
        toast(`Imported ${put.length} entries.`);
    }
    catch (e) {
        toast(e.message, 'error');
    }
}
// --------------- Editor ---------------
export async function contentEditView(p) {
    const existing = p.id ? state.custom.find((x) => x.id === p.id) : undefined;
    if (p.id && !existing)
        return empty('Entry not found.', link('#/content', 'Back to library', 'btn'));
    const cc = existing ? clone(existing) : blankCustom(p.cat || 'feat');
    if (!existing && cc.category !== 'rule')
        cc.data = templateFor(cc.category);
    let dirty = false;
    setGuard(() => dirty);
    const mark = () => { dirty = true; void updatePreview(); };
    const root = h('div', { class: 'page' });
    const preview = h('div', { 'aria-live': 'polite' });
    const form = h('form', { novalidate: true, on: { submit: (e) => { e.preventDefault(); void save(); } } });
    const bindT = (get, set, el) => { el.value = get(); el.addEventListener('input', () => { set(el.value); mark(); }); el.addEventListener('change', () => { set(el.value); mark(); }); return el; };
    const dataField = (label, key, kind = 'text', hint) => {
        const d = (cc.data ?? (cc.data = {}));
        if (kind === 'bool') {
            const cb = h('input', { type: 'checkbox', checked: !!d[key], on: { change: (e) => { d[key] = e.target.checked; mark(); } } });
            return h('label', { class: 'check' }, cb, ` ${label}`);
        }
        const el = kind === 'area' ? textarea('', { rows: 3 }) : kind === 'number' ? num(0) : input();
        return field(label, bindT(() => kind === 'list' ? (d[key] ?? []).join(', ') : String(d[key] ?? ''), (v) => { d[key] = kind === 'number' ? Number(v) : kind === 'list' ? v.split(',').map((x) => x.trim()).filter(Boolean) : v; }, el), { hint: hint ?? (kind === 'list' ? 'Comma-separated' : undefined), name: `data.${key}` });
    };
    const draw = () => {
        clear(form);
        put(form, h('div', { class: 'error-summary', role: 'alert', tabindex: '-1', hidden: true }), card('Basics', h('div', { class: 'grid-2' }, field('Name', bindT(() => cc.name, (v) => (cc.name = v), input()), { required: true, name: 'name' }), field('Category', bindT(() => cc.category, (v) => { cc.category = v; if (!existing)
            cc.data = templateFor(cc.category); draw(); }, select(CUSTOM_CATEGORIES.map((c) => ({ value: c, label: LABEL[c] })), cc.category)), { required: true, name: 'category' }), field('Origin', bindT(() => cc.origin, (v) => (cc.origin = v), select([{ value: 'user', label: 'User-created (from a book I own)' }, { value: 'homebrew', label: 'Homebrew' }, { value: 'imported', label: 'Imported' }], cc.origin))), field('Source label', bindT(() => cc.sourceLabel, (v) => (cc.sourceLabel = v), input({ placeholder: 'e.g. My homebrew, or the book title' }))), field('Version', bindT(() => String(cc.version), (v) => (cc.version = Math.max(1, Math.floor(Number(v) || 1))), num(cc.version, { min: 1 }))), h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: cc.enabled, on: { change: (e) => { cc.enabled = e.target.checked; mark(); } } }), ' Enabled'), h('fieldset', null, h('legend', null, 'Ruleset compatibility'), ['srd51', 'srd521', 'custom'].map((r) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: cc.rulesets.includes(r), on: { change: (e) => { cc.rulesets = e.target.checked ? [...cc.rulesets, r] : cc.rulesets.filter((x) => x !== r); mark(); } } }), ` ${r === 'srd51' ? '2014' : r === 'srd521' ? '2024' : 'Custom'}`))), field('Prerequisites', bindT(() => cc.prerequisites, (v) => (cc.prerequisites = v), input({ placeholder: 'e.g. Strength 13' }))), field('Level requirement', bindT(() => String(cc.levelRequirement), (v) => (cc.levelRequirement = Math.max(0, Number(v) || 0)), num(cc.levelRequirement, { min: 0, max: 20 })))), field('Description (your own summary)', bindT(() => cc.description, (v) => (cc.description = v), textarea('', { rows: 4 }))), field('Notes', bindT(() => cc.notes, (v) => (cc.notes = v), textarea('', { rows: 2 })))), categoryCard(), card('Structured modifiers', h('p', { class: 'hint' }, `Applied when this entry is granted to a character. Targets: ${MODIFIER_TARGET_HINT}.`), modEditor()), card('Limited-use resources', resEditor()), card('Proficiency grants', field('Proficiencies', bindT(() => cc.proficiencies.join(', '), (v) => (cc.proficiencies = v.split(',').map((x) => x.trim()).filter(Boolean)), input({ placeholder: 'skill:stealth, armor:heavy, tool:smith’s tools, language:Draconic' })), { hint: 'kind:name, comma-separated' })), card('Spell additions', field('Spells always known/prepared', bindT(() => cc.spellAdditions.join(', '), (v) => (cc.spellAdditions = v.split(',').map((x) => x.trim()).filter(Boolean)), input({ placeholder: 'spell ids, e.g. misty-step, shield' })), { hint: `Available ids include: ${state.registry.spells.slice(0, 6).map((s) => s.id).join(', ')}…` })), card('Actions', actEditor()), card('Preview on a sample character', preview), h('div', { class: 'save-bar' }, link('#/content', 'Back', 'btn btn-ghost'), h('button', { type: 'submit', class: 'btn btn-primary' }, 'Save entry')));
        void updatePreview();
    };
    const categoryCard = () => {
        switch (cc.category) {
            case 'spell': return card('Spell details', h('div', { class: 'grid-2' }, dataField('Level (0 = cantrip)', 'level', 'number'), dataField('School', 'school'), dataField('Casting time', 'castingTime'), dataField('Range', 'range'), dataField('Components', 'components'), dataField('Material', 'material'), dataField('Duration', 'duration'), dataField('Concentration', 'concentration', 'bool'), dataField('Ritual', 'ritual', 'bool'), dataField('Classes', 'classes', 'list', 'Class ids, e.g. wizard, sorcerer'), dataField('Attack (melee/ranged)', 'attack'), dataField('Save ability (str…cha)', 'save'), dataField('Damage dice', 'damage'), dataField('Damage type', 'damageType')), dataField('Summary', 'summary', 'area'), dataField('At higher levels', 'higher', 'area'));
            case 'weapon': return card('Weapon statistics', h('div', { class: 'grid-2' }, dataField('Category (simple/martial)', 'category'), dataField('Kind (melee/ranged)', 'kind'), dataField('Damage dice', 'damage'), dataField('Damage type', 'damageType'), dataField('Versatile dice', 'versatile'), dataField('Range', 'range'), dataField('Weight', 'weight', 'number'), dataField('Cost', 'cost'), dataField('Properties', 'properties', 'list')));
            case 'armor': return card('Armour statistics', h('div', { class: 'grid-2' }, dataField('Type (light/medium/heavy/shield)', 'type'), dataField('Base AC', 'base', 'number'), dataField('Dex cap (blank = none, 0 = no Dex)', 'dexCap', 'number'), dataField('Strength requirement', 'strReq', 'number'), dataField('Stealth disadvantage', 'stealthDis', 'bool'), dataField('Weight', 'weight', 'number'), dataField('Cost', 'cost')));
            case 'species': return card('Species details', h('div', { class: 'grid-2' }, dataField('Size', 'size'), dataField('Speed', 'speed', 'number'), dataField('Darkvision (ft)', 'darkvision', 'number'), dataField('Languages', 'languages', 'list'), dataField('Extra language choices', 'languageChoices', 'number'), dataField('Skill proficiencies', 'skills', 'list'), dataField('Resistances', 'resistances', 'list'), dataField('Weapon proficiencies', 'weaponProfs', 'list')), asiEditor('asi'), traitsEditor('traits'));
            case 'background': return card('Background details', h('div', { class: 'grid-2' }, dataField('Skills', 'skills', 'list'), dataField('Tools', 'tools', 'list'), dataField('Language choices', 'languageChoices', 'number'), dataField('Equipment', 'equipment', 'list')), featureEditor());
            case 'subclass': return card('Subclass details', h('div', { class: 'grid-2' }, field('Parent class', bindT(() => String(cc.data.classId ?? ''), (v) => (cc.data.classId = v), select(state.registry.classes.map((c) => ({ value: c.id, label: c.name })), String(cc.data.classId ?? 'fighter'))), { required: true, name: 'data.classId' }), dataField('Caster type (none/third)', 'casterType'), dataField('Spellcasting ability (int/wis/cha)', 'spellAbility')), levelFeatures());
            case 'feat': return card('Feat details', asiEditor('asi'));
            case 'class': return card('Class definition', h('p', { class: 'hint' }, 'Classes have many interlocking parts, so they are edited as structured JSON. Start from the template: hit die, saves, proficiencies, spellcasting progression and features by level. Validation runs before saving.'), (() => { const t = textarea(JSON.stringify(cc.data, null, 2), { rows: 22, class: 'code', 'aria-label': 'Class JSON' }); const err = h('p', { class: 'field-error', role: 'alert' }); t.addEventListener('input', () => { try {
                cc.data = JSON.parse(t.value);
                err.textContent = '';
                mark();
            }
            catch (e) {
                err.textContent = `JSON error: ${e.message}`;
            } }); return h('div', { 'data-field': 'data.class' }, t, err); })(), levelFeatures());
            default: return null;
        }
    };
    const levelFeatures = () => {
        const d = cc.data;
        const t = textarea((d.features ?? []).map((f) => `${f.level}: ${f.name}${f.summary ? ` — ${f.summary}` : ''}`).join('\n'), { rows: 6, 'aria-label': 'Features by level' });
        t.addEventListener('input', () => { d.features = t.value.split('\n').map((l) => /^(\d+)\s*:\s*([^—]+?)(?:\s*—\s*(.*))?$/.exec(l.trim())).filter((m) => !!m).map((m) => ({ level: Number(m[1]), name: m[2].trim(), summary: m[3]?.trim() })); mark(); });
        return field('Features by level', t, { hint: 'One per line: “3: Feature name — short summary”' });
    };
    const asiEditor = (key) => {
        const d = cc.data;
        const asi = (d[key] ?? (d[key] = {}));
        return h('fieldset', null, h('legend', null, 'Ability score increases'), h('div', { class: 'grid-3' }, ABILITIES.map((a) => field(ABILITY_NAMES[a], bindT(() => String(asi[a] ?? 0), (v) => { const n = Number(v) || 0; if (n)
            asi[a] = n;
        else
            delete asi[a]; }, num(asi[a] ?? 0))))));
    };
    const traitsEditor = (key) => {
        const d = cc.data;
        const t = textarea((d[key] ?? []).map((x) => `${x.name} — ${x.summary}`).join('\n'), { rows: 4 });
        t.addEventListener('input', () => { d[key] = t.value.split('\n').filter((l) => l.trim()).map((l) => { const [n, ...r] = l.split('—'); return { name: n.trim(), summary: r.join('—').trim() }; }); mark(); });
        return field('Traits', t, { hint: 'One per line: “Trait name — summary”' });
    };
    const featureEditor = () => {
        const d = cc.data;
        const f = (d.feature ?? (d.feature = { name: '', summary: '' }));
        return h('div', { class: 'grid-2' }, field('Feature name', bindT(() => f.name, (v) => (f.name = v), input())), field('Feature summary', bindT(() => f.summary, (v) => (f.summary = v), textarea('', { rows: 2 }))));
    };
    const modEditor = () => {
        const box = h('div');
        const dr = () => fill(box, h('ul', { class: 'edit-list' }, cc.modifiers.map((m, i) => h('li', null, `${m.target} ${m.op} ${m.value}${m.note ? ` (${m.note})` : ''}`, btn('Remove', () => { cc.modifiers.splice(i, 1); mark(); dr(); }, 'btn btn-small btn-ghost')))), (() => {
            const t = input({ placeholder: 'ac', 'aria-label': 'Target', list: 'mod-targets' });
            const o = select([{ value: 'add', label: 'add' }, { value: 'setMin', label: 'set minimum' }], 'add', { 'aria-label': 'Operation' });
            const v = num(1, { 'aria-label': 'Value' });
            const n = input({ placeholder: 'note', 'aria-label': 'Note' });
            return h('div', { class: 'row wrap' }, h('datalist', { id: 'mod-targets' }, MODIFIER_TARGET_HINT.split(', ').map((x) => h('option', { value: x }))), t, o, v, n, btn('Add modifier', () => { if (!t.value.trim())
                return toast('Enter a target.', 'warn'); cc.modifiers.push({ target: t.value.trim(), op: o.value, value: Number(v.value) || 0, note: n.value || undefined }); mark(); dr(); }, 'btn btn-small'));
        })());
        dr();
        return box;
    };
    const resEditor = () => {
        const box = h('div');
        const dr = () => fill(box, h('ul', { class: 'edit-list' }, cc.resources.map((r, i) => h('li', null, `${r.name}: ${r.formula ?? r.byLevel?.join('/') ?? ''} per ${r.recovery}`, btn('Remove', () => { cc.resources.splice(i, 1); mark(); dr(); }, 'btn btn-small btn-ghost')))), (() => {
            const n = input({ placeholder: 'Name', 'aria-label': 'Resource name' });
            const f = input({ placeholder: 'abilityMod:cha, level, level*5, or 3', 'aria-label': 'Uses' });
            const r = select([{ value: 'long', label: 'Long rest' }, { value: 'short', label: 'Short rest' }, { value: 'dawn', label: 'Dawn' }, { value: 'none', label: 'Never' }], 'long', { 'aria-label': 'Recovery' });
            return h('div', { class: 'row wrap' }, n, f, r, btn('Add resource', () => { if (!n.value.trim() || !f.value.trim())
                return toast('Enter a name and uses.', 'warn'); const fixed = /^\d+$/.test(f.value.trim()); const res = { id: `${cc.id}-${uid().slice(0, 6)}`, name: n.value.trim(), recovery: r.value, ...(fixed ? { byLevel: Array(20).fill(Number(f.value)) } : { formula: f.value.trim() }) }; cc.resources.push(res); mark(); dr(); }, 'btn btn-small'));
        })());
        dr();
        return box;
    };
    const actEditor = () => {
        const box = h('div');
        const dr = () => fill(box, h('ul', { class: 'edit-list' }, cc.actions.map((a, i) => h('li', null, `${a.name}: ${a.economy}, ${a.attackType}${a.damage ? `, ${a.damage} ${a.damageType}` : ''}`, btn('Remove', () => { cc.actions.splice(i, 1); mark(); dr(); }, 'btn btn-small btn-ghost')))), (() => {
            const n = input({ placeholder: 'Action name', 'aria-label': 'Action name' });
            const e = select(['action', 'bonus', 'reaction', 'free', 'other'].map((x) => ({ value: x, label: x })), 'action', { 'aria-label': 'Economy' });
            const t = select(['melee', 'ranged', 'spell-melee', 'spell-ranged', 'save', 'none'].map((x) => ({ value: x, label: x })), 'none', { 'aria-label': 'Roll type' });
            const ab = select(ABILITIES.map((a) => ({ value: a, label: a.toUpperCase() })), 'str', { 'aria-label': 'Ability' });
            const dmg = input({ placeholder: '2d6', 'aria-label': 'Damage' });
            const dt = input({ placeholder: 'fire', 'aria-label': 'Damage type' });
            return h('div', { class: 'row wrap' }, n, e, t, ab, dmg, dt, btn('Add action', () => { if (!n.value.trim())
                return toast('Enter a name.', 'warn'); cc.actions.push({ id: uid(), name: n.value.trim(), economy: e.value, range: '', target: '', attackType: t.value, ability: ab.value, proficient: true, attackBonusExtra: 0, damage: dmg.value, damageType: dt.value, notes: '', source: cc.name }); mark(); dr(); }, 'btn btn-small'));
        })());
        dr();
        return box;
    };
    const updatePreview = async () => {
        const v = validateCustom(cc);
        const r2 = buildRegistry([...state.custom.filter((x) => x.id !== cc.id), { ...cc, enabled: true }]);
        let sample = null;
        try {
            const d = blankDraft('srd51');
            const sc = cc.category === 'class' ? cc.id : cc.category === 'subclass' ? String(cc.data?.classId ?? 'fighter') : 'fighter';
            const clsDef = r2.classes.find((c) => c.id === sc);
            Object.assign(d, { name: 'Sample', speciesId: cc.category === 'species' ? cc.id : 'human', backgroundId: cc.category === 'background' ? cc.id : 'acolyte', classId: sc, subclassId: cc.category === 'subclass' ? cc.id : '', startLevel: Math.max(5, cc.levelRequirement), abilityMethod: 'manual', base: { str: 14, dex: 14, con: 14, int: 12, wis: 12, cha: 12 }, classSkills: clsDef?.skillChoices.from.slice(0, clsDef.skillChoices.count) ?? [], overrides: ['species', 'skills'] });
            sample = buildCharacter(d, r2).character;
        }
        catch (e) {
            fill(preview, h('p', { class: 'hint' }, `Preview unavailable: ${e.message}`), v.errors.length ? h('ul', { class: 'warn-list' }, v.errors.map((x) => h('li', null, x))) : h('span'));
            return;
        }
        const before = compute(sample, r2);
        const withG = clone(sample);
        withG.grants.push(cc.id);
        const after = compute(withG, r2);
        const rows = [['Max HP', before.hpMax.value, after.hpMax.value], ['AC', before.ac.value, after.ac.value], ['Speed', before.speed.value, after.speed.value], ['Initiative', before.initiative.value, after.initiative.value], ['Dex save', before.saves.dex.value, after.saves.dex.value], ['Perception', before.skills.perception.value, after.skills.perception.value], ['Resources', before.resources.length, after.resources.length]];
        fill(preview, h('p', { class: 'hint' }, `Sample: level ${before.totalLevel} ${r2.classes.find((c) => c.id === sample.classes[0]?.classId)?.name ?? ''}, all scores 12–14${['class', 'subclass', 'species', 'background'].includes(cc.category) ? ', built with this entry' : ', with this entry applied'}.`), h('table', { class: 'breakdown' }, h('thead', null, h('tr', null, h('th', null, 'Value'), h('th', null, 'Without'), h('th', null, 'With'))), h('tbody', null, rows.map(([k, a, b]) => h('tr', { class: String(a) !== String(b) ? 'changed' : '' }, h('th', { scope: 'row' }, k), h('td', null, String(a)), h('td', null, String(b)))))), v.errors.length ? h('div', { class: 'notice notice-warn' }, h('strong', null, 'Fix before saving:'), h('ul', null, v.errors.map((x) => h('li', null, x)))) : h('p', { class: 'notice notice-ok' }, 'Valid.'));
    };
    let saving = false;
    const save = async () => {
        if (saving)
            return;
        const v = validateCustom(cc);
        const errs = {};
        v.errors.forEach((e) => { if (/Name/.test(e))
            errs.name = e;
        else if (/Class data|hitDie|subclassLevel/.test(e))
            errs['data.class'] = e;
        else
            errs[`x${Object.keys(errs).length}`] = e; });
        if (cc.category === 'subclass' && !cc.data?.classId)
            errs['data.classId'] = 'Choose the parent class.';
        if (!showErrors(form, errs))
            return;
        saving = true;
        cc.updatedAt = nowIso();
        await state.repo.put('custom', cc);
        await reloadCustom();
        dirty = false;
        saving = false;
        toast(`${cc.name} saved.`);
        if (!existing)
            go(`/content/edit/${cc.id}`);
    };
    draw();
    put(root, pageHeader(existing ? `Edit: ${cc.name}` : `New ${LABEL[cc.category]}`, `${ORIGIN[cc.origin]} content · id ${cc.id}`), form);
    return root;
}
function templateFor(cat) {
    switch (cat) {
        case 'spell': return { level: 1, school: 'Evocation', castingTime: '1 action', range: '60 ft', components: 'V, S', duration: 'Instantaneous', concentration: false, ritual: false, classes: ['wizard'], summary: '' };
        case 'weapon': return { category: 'martial', kind: 'melee', damage: '1d8', damageType: 'slashing', properties: [], weight: 3, cost: '' };
        case 'armor': return { type: 'medium', base: 14, dexCap: 2, weight: 20, cost: '' };
        case 'species': return { size: 'Medium', speed: 30, asi: {}, languages: ['Common'], traits: [] };
        case 'background': return { skills: [], tools: [], languageChoices: 0, equipment: [], feature: { name: '', summary: '' } };
        case 'subclass': return { classId: 'fighter', features: [] };
        case 'feat': return { asi: {} };
        case 'class': return { hitDie: 8, primary: ['str'], saves: ['str', 'con'], armor: ['light'], weapons: ['simple'], tools: [], skillChoices: { count: 2, from: ['athletics', 'perception'] }, multiclassReq: { all: { str: 13 } }, multiclassProfs: ['light'],
            casterType: 'none', spellAbility: null, prepStyle: 'known', cantrips: null, spellsKnown: null, preparedFormula: null, subclassLevel: 3, subclassLabel: 'Archetype', asiLevels: [4, 8, 12, 16, 19],
            features: [{ level: 1, name: 'Example feature', summary: 'Describe in your own words.' }], resources: [], startingEquipment: [] };
        default: return {};
    }
}
void cap;
