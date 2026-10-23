import { ABILITIES } from '../../types.js';
import { h, btn, field, input, num, select, textarea, showErrors, card, toast, sign, clear, confirmDialog, put } from '../dom.js';
import { state, commit } from '../store.js';
import { blankDraft, buildCharacter, validateDraft, pointBuyCost, POINT_BUY_BUDGET, STANDARD_ARRAY, rollAbilityScore } from '../../rules/factory.js';
import { compute, abilityMod, ABILITY_NAMES, cap } from '../../rules/calc.js';
import { forRuleset, byId, preferRuleset } from '../../data/registry.js';
import { SKILLS } from '../../data/srd-classes.js';
import { uid, nowIso } from '../../rules/events.js';
import { setGuard, go } from '../router.js';
import { pageHeader } from '../components.js';
const STEPS = ['Ruleset', 'Concept & identity', 'Species', 'Background', 'Class', 'Ability scores', 'Proficiencies & languages', 'Equipment', 'Spells', 'Class options', 'Appearance & roleplay', 'Review & create'];
const FIELD_STEP = { name: 1, startLevel: 1, speciesId: 2, speciesAsiChoice: 2, speciesSkills: 2, backgroundId: 3, classId: 4, classSkills: 6, subclassId: 9 };
ABILITIES.forEach((a) => (FIELD_STEP[`base.${a}`] = 5));
const ALIGNMENTS = ['', 'Lawful good', 'Neutral good', 'Chaotic good', 'Lawful neutral', 'True neutral', 'Chaotic neutral', 'Lawful evil', 'Neutral evil', 'Chaotic evil', 'Unaligned'];
export async function wizardView() {
    const saved = await state.repo.get('drafts', 'wizard');
    let d = saved?.draft ? { ...blankDraft(state.settings.defaultRuleset), ...saved.draft } : blankDraft(state.settings.defaultRuleset);
    let creating = false;
    const root = h('div', { class: 'page wizard' });
    const persist = () => void state.repo.put('drafts', { id: 'wizard', draft: d });
    setGuard(() => false); // draft autosaves; nothing is lost on navigation
    const render = () => {
        clear(root);
        const reg = state.registry;
        root.appendChild(pageHeader('New character', `Step ${d.step + 1} of ${STEPS.length}: ${STEPS[d.step]}`, saved?.draft ? h('span', { class: 'badge' }, 'Draft restored') : null, btn('Start over', async () => { if (await confirmDialog('Start over?', 'This clears the saved draft.', 'Clear draft', true)) {
            d = blankDraft(state.settings.defaultRuleset);
            persist();
            render();
        } }, 'btn btn-ghost btn-small')));
        root.appendChild(h('ol', { class: 'progress', 'aria-label': 'Wizard progress' }, STEPS.map((s, i) => h('li', { class: i === d.step ? 'current' : i < d.step ? 'done' : '' }, h('button', { type: 'button', class: 'progress-dot', 'aria-current': i === d.step ? 'step' : undefined, 'aria-label': `Step ${i + 1}: ${s}`, on: { click: () => { d.step = i; persist(); render(); } } }, String(i + 1))))));
        const form = h('form', { class: 'wizard-form', novalidate: true, on: { submit: (e) => e.preventDefault() } }, h('div', { class: 'error-summary', role: 'alert', tabindex: '-1', hidden: true }));
        const set = (k, v, rerender = false) => { d[k] = v; persist(); if (rerender)
            render();
        else
            updatePreview(); };
        const overrideBox = (key, label) => h('label', { class: 'override-toggle' }, h('input', { type: 'checkbox', checked: d.overrides.includes(key), on: { change: (e) => { const on = e.target.checked; set('overrides', on ? [...d.overrides, key] : d.overrides.filter((x) => x !== key), true); } } }), ` Override: ${label} (recorded as a custom ruling)`);
        const choiceGrid = (opts, selected, max, onChange, name, allowOver = false) => h('fieldset', { class: 'choice-grid' }, h('legend', { class: 'visually-hidden' }, name), opts.map((o) => h('label', { class: `choice${selected.includes(o.value) ? ' on' : ''}` }, h('input', { type: 'checkbox', checked: selected.includes(o.value), on: { change: (e) => { const on = e.target.checked; let next = on ? [...selected, o.value] : selected.filter((x) => x !== o.value); if (on && next.length > max && !allowOver) {
                    e.target.checked = false;
                    toast(`You can choose ${max}.`, 'warn');
                    return;
                } onChange(next); render(); } } }), h('span', null, o.label, o.sub ? h('small', null, o.sub) : null))));
        const cls = byId(reg.classes, d.classId);
        const sp = byId(reg.species, d.speciesId);
        const bg = byId(reg.backgrounds, d.backgroundId);
        switch (d.step) {
            case 0:
                put(form, card('Which rules are you playing?', h('p', null, 'This sets rule behaviour such as exhaustion and long-rest hit-dice recovery. Included content is from the SRD; your custom content can be tagged for either.'), h('div', { class: 'choice-grid big' }, [['srd51', '2014 rules (SRD 5.1)', 'Classic Fifth Edition rules.'], ['srd521', '2024 revised rules (SRD 5.2.1)', 'Exhaustion −2 per level to d20 tests; long rests restore all hit dice.'], ['custom', 'Custom / homebrew', 'All content available; 2014 rule behaviour.']].map(([v, l, s]) => h('label', { class: `choice${d.ruleset === v ? ' on' : ''}` }, h('input', { type: 'radio', name: 'ruleset', checked: d.ruleset === v, on: { change: () => set('ruleset', v, true) } }), h('span', null, l, h('small', null, s)))))));
                break;
            case 1:
                put(form, card('Concept and identity', field('Character name', input({ value: d.name, autocomplete: 'off', on: { input: (e) => set('name', e.target.value) } }), { required: true, name: 'name' }), field('Player name', input({ value: d.playerName, on: { input: (e) => set('playerName', e.target.value) } })), field('Alignment', select(ALIGNMENTS.map((a) => ({ value: a, label: a || '— Choose —' })), d.alignment, { on: { change: (e) => set('alignment', e.target.value) } })), field('Concept', textarea(d.concept, { rows: 2, placeholder: 'e.g. A disgraced temple guard seeking redemption', on: { input: (e) => set('concept', e.target.value) } })), field('Starting level', num(d.startLevel, { min: 1, max: 20, on: { change: (e) => set('startLevel', Number(e.target.value), true) } }), { required: true, name: 'startLevel', hint: 'Above 1, the builder levels you up one level at a time with fixed hit points so your history is complete. Add other classes later with Level up.' })));
                break;
            case 2: {
                const list = preferRuleset(forRuleset(reg.species, d.ruleset), d.ruleset);
                put(form, card('Species', field('Species', select([{ value: '', label: '— Choose —' }, ...list.map((s) => ({ value: s.id, label: `${s.name}${s.source.origin !== 'srd' ? ` · ${s.source.label}` : ''}` }))], d.speciesId, { on: { change: (e) => { d.speciesAsiChoice = []; d.speciesSkills = []; set('speciesId', e.target.value, true); } } }), { required: true, name: 'speciesId' }), sp ? h('div', { class: 'explain' }, h('p', null, h('strong', null, 'Effect: '), `${Object.entries(sp.asi).map(([a, n]) => `${a.toUpperCase()} +${n}`).join(', ')}; speed ${sp.speed} ft; ${sp.size}${sp.darkvision ? `; darkvision ${sp.darkvision} ft` : ''}; languages ${sp.languages.join(', ')}${sp.languageChoices ? ` + ${sp.languageChoices} of your choice` : ''}.`), h('ul', null, sp.traits.map((t) => h('li', null, h('strong', null, t.name), ` – ${t.summary}`))), h('p', { class: 'src' }, `Source: ${sp.source.label}`)) : null, sp?.asiChoice ? h('div', { 'data-field': 'speciesAsiChoice', class: 'field' }, h('p', { class: 'label' }, `Choose ${sp.asiChoice.count} abilities to increase by ${sp.asiChoice.amount}`, h('span', { class: 'req' }, ' *')), choiceGrid(ABILITIES.filter((a) => !sp.asiChoice.exclude?.includes(a)).map((a) => ({ value: a, label: ABILITY_NAMES[a] })), d.speciesAsiChoice, sp.asiChoice.count, (v) => set('speciesAsiChoice', v), 'Species ability choices', d.overrides.includes('species')), h('p', { class: 'field-error', hidden: true })) : null, sp?.skillChoices ? h('div', { 'data-field': 'speciesSkills', class: 'field' }, h('p', { class: 'label' }, `Choose ${sp.skillChoices} skills`, h('span', { class: 'req' }, ' *')), choiceGrid(Object.keys(SKILLS).map((s) => ({ value: s, label: cap(s) })), d.speciesSkills, sp.skillChoices, (v) => set('speciesSkills', v), 'Species skills', d.overrides.includes('species')), h('p', { class: 'field-error', hidden: true })) : null, sp?.asiChoice || sp?.skillChoices ? overrideBox('species', 'species choice limits') : null));
                break;
            }
            case 3:
                put(form, card('Background', field('Background', select([{ value: '', label: '— Choose —' }, ...preferRuleset(forRuleset(reg.backgrounds, d.ruleset), d.ruleset).map((b) => ({ value: b.id, label: b.name }))], d.backgroundId, { on: { change: (e) => set('backgroundId', e.target.value, true) } }), { required: true, name: 'backgroundId', hint: 'The SRD includes one background. Add others under Custom content, or use “Custom background”.' }), bg ? h('div', { class: 'explain' }, h('p', null, h('strong', null, 'Effect: '), `Skills: ${bg.skills.map(cap).join(', ') || 'choose in step 7'}. ${bg.languageChoices ? `${bg.languageChoices} extra language(s). ` : ''}Equipment: ${bg.equipment.join(', ') || 'none'}.`), h('p', null, h('strong', null, bg.feature.name), ` – ${bg.feature.summary}`), h('p', { class: 'src' }, `Source: ${bg.source.label}`)) : null));
                break;
            case 4: {
                put(form, card('Class', field('Class', select([{ value: '', label: '— Choose —' }, ...forRuleset(reg.classes, d.ruleset).map((c) => ({ value: c.id, label: `${c.name} (d${c.hitDie})${c.source.origin !== 'srd' ? ` · ${c.source.label}` : ''}` }))], d.classId, { on: { change: (e) => { d.classSkills = []; d.subclassId = ''; d.cantrips = []; d.spells = []; d.expertise = []; set('classId', e.target.value, true); } } }), { required: true, name: 'classId' }), cls ? h('div', { class: 'explain' }, h('p', null, h('strong', null, 'Effect: '), `Hit die d${cls.hitDie}; level 1 HP = ${cls.hitDie} + Con. Saves: ${cls.saves.map((s) => ABILITY_NAMES[s]).join(', ')}. Armour: ${cls.armor.join(', ') || 'none'}. Weapons: ${cls.weapons.join(', ')}. ${cls.casterType !== 'none' ? `Spellcasting (${cls.casterType}, ${cls.spellAbility?.toUpperCase()}).` : ''}`), h('p', null, `Primary ability: ${cls.primary.map((a) => ABILITY_NAMES[a]).join(' / ')}. ${cls.subclassLabel} at level ${cls.subclassLevel}.`), h('details', null, h('summary', null, 'Features by level'), h('ul', null, cls.features.map((f) => h('li', null, `${f.level}: ${f.name}${f.summary ? ` – ${f.summary}` : ''}`)))), h('p', { class: 'src' }, `Source: ${cls.source.label}`)) : null, h('p', { class: 'hint' }, 'Multiclassing: create the character in their first class, then add levels in other classes from Level up (prerequisites are checked).')));
                break;
            }
            case 5:
                put(form, abilityStep(d, set, overrideBox));
                break;
            case 6:
                if (!cls) {
                    put(form, card('Proficiencies', h('p', null, 'Choose a class first (step 5).')));
                    break;
                }
                put(form, card('Proficiencies and languages', h('div', { 'data-field': 'classSkills', class: 'field' }, h('p', { class: 'label' }, `${cls.name}: choose ${cls.skillChoices.count} skills`, h('span', { class: 'req' }, ' *')), choiceGrid(cls.skillChoices.from.map((s) => ({ value: s, label: cap(s), sub: SKILLS[s]?.toUpperCase() })), d.classSkills, cls.skillChoices.count, (v) => set('classSkills', v), 'Class skills', d.overrides.includes('skills')), h('p', { class: 'field-error', hidden: true })), overrideBox('skills', 'class skill count'), (bg?.skills.length ? h('p', { class: 'hint' }, `Background already grants: ${bg.skills.map(cap).join(', ')}. Pick different class skills if possible.`) : null), ['rogue'].includes(cls.id) ? h('div', { class: 'field' }, h('p', { class: 'label' }, 'Expertise: choose two proficient skills'), choiceGrid([...new Set([...d.classSkills, ...(bg?.skills ?? []), ...d.speciesSkills])].map((s) => ({ value: s, label: cap(s) })), d.expertise, 2, (v) => set('expertise', v), 'Expertise')) : null, field('Additional languages', input({ value: d.languages, placeholder: 'Comma-separated, e.g. Elvish, Celestial', on: { input: (e) => set('languages', e.target.value) } }), { hint: `Already known: ${sp?.languages.join(', ') ?? '—'}. Choices available: ${(sp?.languageChoices ?? 0) + (bg?.languageChoices ?? 0)}.` }), field('Tool and instrument proficiencies', input({ value: d.tools, placeholder: 'Comma-separated', on: { input: (e) => set('tools', e.target.value) } }), { hint: cls.tools.length ? `Class grants: ${cls.tools.join(', ')}` : undefined })));
                break;
            case 7:
                put(form, card('Equipment', h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: d.takeEquipment, on: { change: (e) => set('takeEquipment', e.target.checked, true) } }), ' Take standard starting equipment'), cls && d.takeEquipment ? h('ul', null, (cls.startingEquipment ?? []).map((id) => h('li', null, byId(reg.weapons, id)?.name ?? byId(reg.armor, id)?.name ?? id)), (bg?.equipment ?? []).map((e) => h('li', null, e))) : h('p', { class: 'hint' }, 'You can add items later from Inventory.'), h('p', { class: 'hint' }, 'Weapons and armour are equipped automatically so AC and attacks are calculated straight away.')));
                break;
            case 8:
                put(form, spellStep(d, set));
                break;
            case 9: {
                const subs = cls ? reg.subclasses.filter((s) => s.classId === cls.id) : [];
                put(form, card('Class options', cls && cls.subclassLevel <= d.startLevel ? field(cls.subclassLabel, select([{ value: '', label: '— Choose later —' }, ...subs.map((s) => ({ value: s.id, label: `${s.name}${s.source.origin !== 'srd' ? ` · ${s.source.label}` : ''}` }))], d.subclassId, { on: { change: (e) => set('subclassId', e.target.value, true) } }), { name: 'subclassId', hint: `Available at ${cls.name} ${cls.subclassLevel}. The SRD includes one per class; add more under Custom content.` }) : h('p', null, cls ? `${cls.subclassLabel} is chosen at ${cls.name} ${cls.subclassLevel}.` : 'Choose a class first.'), d.subclassId ? h('ul', { class: 'explain' }, byId(reg.subclasses, d.subclassId)?.features.map((f) => h('li', null, `${f.level}: ${f.name}${f.summary ? ` – ${f.summary}` : ''}`))) : null, field('Other class choices', textarea(d.optionNotes, { rows: 3, placeholder: 'e.g. Fighting Style: Defence; Favoured Enemy: undead', on: { input: (e) => set('optionNotes', e.target.value) } }), { hint: 'Recorded as a feature. For mechanical effects (e.g. +1 AC), add a custom content entry and apply it from Features.' })));
                break;
            }
            case 10: {
                const det = d.details;
                const t = (k, label, rows = 2) => field(label, textarea(det[k] ?? '', { rows, on: { input: (e) => { d.details = { ...d.details, [k]: e.target.value }; persist(); } } }));
                const i = (k, label) => field(label, input({ value: det[k] ?? '', on: { input: (e) => { d.details = { ...d.details, [k]: e.target.value }; persist(); } } }));
                put(form, card('Appearance and roleplay', h('div', { class: 'grid-3' }, i('age', 'Age'), i('height', 'Height'), i('weight', 'Weight'), i('eyes', 'Eyes'), i('hair', 'Hair'), i('skin', 'Skin')), t('appearance', 'Appearance'), t('personality', 'Personality traits'), t('ideals', 'Ideals'), t('bonds', 'Bonds'), t('flaws', 'Flaws'), t('backstory', 'Backstory', 5)));
                break;
            }
            case 11: {
                const errs = validateDraft(d, reg);
                put(form, card('Review', Object.keys(errs).length ? h('div', { class: 'notice notice-warn' }, h('p', null, 'Some choices still need attention:'), h('ul', null, Object.entries(errs).map(([k, m]) => h('li', null, m, ' ', btn(`Go to ${STEPS[FIELD_STEP[k] ?? 0]}`, () => { d.step = FIELD_STEP[k] ?? 0; persist(); render(); }, 'btn btn-small btn-ghost')))))
                    : h('p', { class: 'notice notice-ok' }, 'Everything required is complete.'), d.overrides.length ? h('p', { class: 'badge badge-warn' }, `Custom rulings: ${d.overrides.join(', ')}`) : null));
            }
        }
        const preview = h('aside', { class: 'preview card', 'aria-live': 'polite', 'aria-label': 'Character preview' });
        const updatePreview = () => { clear(preview); put(preview, previewOf(d)); };
        updatePreview();
        const nav = h('div', { class: 'wizard-nav' }, btn('← Back', () => { d.step = Math.max(0, d.step - 1); persist(); render(); }, 'btn btn-ghost', { disabled: d.step === 0 }), d.step < STEPS.length - 1 ? btn('Next →', () => {
            const errs = validateDraft(d, state.registry);
            const stepErrs = Object.fromEntries(Object.entries(errs).filter(([k]) => (FIELD_STEP[k] ?? 99) === d.step));
            if (!showErrors(form, stepErrs))
                return;
            d.step++;
            persist();
            render();
            window.scrollTo(0, 0);
        }, 'btn btn-primary') : btn('Create character', async () => {
            if (creating)
                return;
            const errs = validateDraft(d, state.registry);
            if (Object.keys(errs).length) {
                showErrors(form, errs);
                return;
            }
            creating = true;
            try {
                const { character, levelSummaries } = buildCharacter(d, state.registry);
                const ts = nowIso();
                const events = [{ id: uid(), characterId: character.id, ts, category: 'create', description: `Created ${character.name}: ${levelSummaries[0][0]}`, before: null, after: null, reversible: false, undone: false }];
                levelSummaries.slice(1).forEach((s, i) => events.push({ id: uid(), characterId: character.id, ts, category: 'level', description: s[0] ?? `Level ${i + 2}`, before: null, after: { summary: s }, reversible: false, undone: false }));
                await commit(character, events, `${character.name} created`);
                await state.repo.del('drafts', 'wizard');
                go(`/c/${character.id}`);
            }
            catch (e) {
                toast(e.message, 'error');
            }
            finally {
                creating = false;
            }
        }, 'btn btn-primary'));
        put(root, h('div', { class: 'wizard-layout' }, h('div', null, form, nav), preview));
    };
    render();
    return root;
}
function abilityStep(d, set, overrideBox) {
    const methods = [['standard', 'Standard array'], ['pointbuy', 'Point buy'], ['roll', 'Roll 4d6 (drop lowest)'], ['manual', 'Manual entry'], ['custom', 'Custom array']];
    const sp = byId(state.registry.species, d.speciesId);
    const bonus = (a) => (sp?.asi[a] ?? 0) + (d.speciesAsiChoice.includes(a) ? sp?.asiChoice?.amount ?? 1 : 0);
    const pb = d.abilityMethod === 'pointbuy' ? pointBuyCost(d.base) : null;
    const pool = d.abilityMethod === 'standard' ? STANDARD_ARRAY : d.abilityMethod === 'roll' ? d.rolled.map((r) => r.total) : null;
    const ctl = (a) => {
        if (pool) {
            return select([{ value: '', label: '—' }, ...pool.map((v, i) => ({ value: String(v), label: `${v}${d.abilityMethod === 'roll' ? ` (roll ${i + 1})` : ''}` }))], String(d.base[a]), { 'aria-label': ABILITY_NAMES[a], on: { change: (e) => { d.base = { ...d.base, [a]: Number(e.target.value) || 0 }; set('base', d.base, true); } } });
        }
        const min = d.abilityMethod === 'pointbuy' ? 8 : 1, max = d.abilityMethod === 'pointbuy' ? 15 : 30;
        return num(d.base[a], { min, max, 'aria-label': ABILITY_NAMES[a], on: { change: (e) => { d.base = { ...d.base, [a]: Number(e.target.value) }; set('base', d.base, true); } } });
    };
    return card('Ability scores', h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Method' }, methods.map(([v, l]) => h('label', { class: d.abilityMethod === v ? 'on' : '' }, h('input', { type: 'radio', name: 'method', checked: d.abilityMethod === v, on: { change: () => { d.abilityMethod = v; if (v === 'pointbuy')
                d.base = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 }; if (v === 'standard')
                d.base = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }; set('abilityMethod', d.abilityMethod, true); } } }), l))), d.abilityMethod === 'roll' ? h('div', { class: 'row' }, btn(d.rolled.length ? 'Reroll all six' : 'Roll six scores', () => { d.rolled = Array.from({ length: 6 }, () => rollAbilityScore()); set('rolled', d.rolled, true); }, 'btn'), d.rolled.length ? h('p', { class: 'hint' }, d.rolled.map((r) => `[${r.dice.join(',')}]→${r.total}`).join('  ')) : null) : null, pb ? h('p', { class: `notice ${pb.valid ? 'notice-ok' : 'notice-warn'}` }, pb.error ?? `Points used: ${pb.cost} / ${POINT_BUY_BUDGET}`) : null, d.abilityMethod === 'standard' || d.abilityMethod === 'roll' ? h('p', { class: 'hint' }, 'Assign each value once.') : null, d.abilityMethod === 'custom' ? h('p', { class: 'hint' }, 'Enter the array your table agreed on.') : null, h('table', { class: 'ability-table' }, h('thead', null, h('tr', null, ['Ability', 'Base', 'Species', 'Total', 'Mod'].map((t) => h('th', { scope: 'col' }, t)))), h('tbody', null, ABILITIES.map((a) => { const tot = d.base[a] + bonus(a); return h('tr', { 'data-field': `base.${a}`, class: 'field' }, h('th', { scope: 'row' }, ABILITY_NAMES[a]), h('td', null, ctl(a)), h('td', null, bonus(a) ? `+${bonus(a)}` : '—'), h('td', null, String(tot)), h('td', null, sign(abilityMod(tot)))); }))), h('p', { class: 'field-error', hidden: true }), d.abilityMethod === 'standard' ? overrideBox('standard', 'standard array') : d.abilityMethod === 'pointbuy' ? overrideBox('pointbuy', 'point-buy budget') : null);
}
function spellStep(d, set) {
    const cls = byId(state.registry.classes, d.classId);
    if (!cls || cls.casterType === 'none')
        return card('Spells', h('p', null, cls ? `${cls.name} does not cast spells at level ${d.startLevel} (subclass or custom content may add spellcasting later).` : 'Choose a class first.'));
    const lvl = d.startLevel;
    const cantripMax = cls.cantrips?.[lvl - 1] ?? 0;
    const tmp = (() => { try {
        return compute(buildCharacter({ ...d, name: d.name || 'x', cantrips: [], spells: [] }, state.registry).character, state.registry);
    }
    catch {
        return null;
    } })();
    const prof = tmp?.spellProfiles[0];
    const maxSlot = tmp ? (tmp.slots.length || (tmp.pact.level)) : 1;
    const spellMax = cls.spellsKnown ? cls.spellsKnown[lvl - 1] ?? 0 : cls.prepStyle === 'spellbook' ? 6 + (lvl - 1) * 2 : prof?.preparedMax ?? 0;
    const avail = preferRuleset(forRuleset(state.registry.spells, d.ruleset), d.ruleset).filter((s) => s.classes.includes(cls.id));
    const pick = (lvlFilter, key, max) => h('div', { class: 'choice-grid' }, avail.filter((s) => lvlFilter(s.level)).map((s) => {
        const sel = d[key].includes(s.id);
        return h('label', { class: `choice${sel ? ' on' : ''}` }, h('input', { type: 'checkbox', checked: sel, on: { change: (e) => { const on = e.target.checked; if (on && d[key].length >= max) {
                    e.target.checked = false;
                    toast(`Limit is ${max}.`, 'warn');
                    return;
                } set(key, on ? [...d[key], s.id] : d[key].filter((x) => x !== s.id), true); } } }), h('span', null, s.name, h('small', null, `${s.level ? `Level ${s.level}` : 'Cantrip'} · ${s.school}${s.concentration ? ' · C' : ''}${s.ritual ? ' · R' : ''}`)));
    }));
    const label = cls.prepStyle === 'spellbook' ? 'spellbook spells' : cls.prepStyle === 'prepared' ? 'prepared spells' : 'known spells';
    return card('Spells', prof ? h('p', null, `Spell save DC ${prof.dc.value}, spell attack ${sign(prof.attack.value)} (${ABILITY_NAMES[prof.ability]}).`) : null, cantripMax ? h('div', null, h('h3', null, `Cantrips (${d.cantrips.length}/${cantripMax})`), pick((n) => n === 0, 'cantrips', cantripMax)) : null, spellMax ? h('div', null, h('h3', null, `${cap(label)} (${d.spells.length}/${spellMax}), up to level ${maxSlot}`), pick((n) => n > 0 && n <= maxSlot, 'spells', spellMax)) : h('p', { class: 'hint' }, 'No levelled spells at this level.'), h('p', { class: 'hint' }, 'The included spell list is a starter set of SRD spells. Add others under Custom content.'));
}
function previewOf(d) {
    const reg = state.registry;
    const box = h('div', null, h('h2', { class: 'card-title' }, d.name || 'Your character'));
    const cls = byId(reg.classes, d.classId);
    const sp = byId(reg.species, d.speciesId);
    put(box, h('p', { class: 'sub' }, [sp?.name, cls ? `${cls.name} ${d.startLevel}` : null].filter(Boolean).join(' · ') || 'Choices appear here as you make them.'));
    try {
        const { character } = buildCharacter({ ...d, name: d.name || 'Preview' }, reg);
        const x = compute(character, reg);
        put(box, h('dl', { class: 'preview-stats' }, ...[['HP', x.hpMax.value], ['AC', x.ac.value], ['Init', sign(x.initiative.value)], ['Speed', `${x.speed.value} ft`], ['Prof.', sign(x.pb.value)]].flatMap(([k, v]) => [h('dt', null, String(k)), h('dd', null, String(v))])), h('p', { class: 'hint' }, ABILITIES.map((a) => `${a.toUpperCase()} ${x.abilities[a].value}`).join(' · ')));
    }
    catch {
        put(box, h('p', { class: 'hint' }, 'Full statistics appear once the required choices are made.'));
    }
    return box;
}
