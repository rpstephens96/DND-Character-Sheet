import { PACK_FORMAT, PACK_FORMAT_VERSION } from './types.js';
import { cleanText, firstSentence } from './pack.js';
import { SRD51_ATTRIBUTION } from './sources.js';
const o = (v) => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v : {});
const a = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'object' && x !== null) : []);
const s = (v) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const n = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const name = (v) => s(o(v).name);
const idx = (v) => s(o(v).index);
const ord = (l) => (l === 0 ? 'Cantrip' : `${l}${l === 1 ? 'st' : l === 2 ? 'nd' : l === 3 ? 'rd' : 'th'}-level`);
const ABIL = new Set(['str', 'dex', 'con', 'int', 'wis', 'cha']);
/** 5e-database index → built-in id, where they differ. */
export const ID_ALIASES = {
    'padded-armor': 'padded', 'leather-armor': 'leather', 'studded-leather-armor': 'studded-leather', 'hide-armor': 'hide', 'half-plate-armor': 'half-plate',
    'splint-armor': 'splint', 'plate-armor': 'plate', 'crossbow-light': 'light-crossbow', 'crossbow-hand': 'hand-crossbow', 'crossbow-heavy': 'heavy-crossbow',
};
const alias = (id) => ID_ALIASES[id] ?? id;
export function convert5eDatabase(input, version, generatedAt = new Date().toISOString()) {
    const entries = [];
    const skipped = [];
    const notes = [];
    const add = (e) => { if (!e.id) {
        skipped.push(`${e.kind}: missing id (${e.name})`);
        return;
    } entries.push(e); };
    // Spells
    for (const sp of a(input.spells)) {
        const level = n(sp.level);
        const desc = cleanText(sp.desc);
        const higher = cleanText(sp.higher_level);
        const dmg = o(sp.damage);
        const atSlot = o(dmg.damage_at_slot_level);
        const atChar = o(dmg.damage_at_character_level);
        const damage = s(atSlot[String(level)]) || s(Object.values(atSlot)[0]) || s(atChar['1']) || undefined;
        const save = idx(o(sp.dc).dc_type);
        const attack = s(sp.attack_type).toLowerCase();
        const def = { id: s(sp.index), name: s(sp.name), level, school: name(sp.school), castingTime: s(sp.casting_time), range: s(sp.range),
            components: Array.isArray(sp.components) ? sp.components.map(s).join(', ') : s(sp.components), material: s(sp.material) || undefined,
            duration: s(sp.duration), concentration: sp.concentration === true, ritual: sp.ritual === true, classes: a(sp.classes).map(idx), summary: firstSentence(desc),
            higher: higher || undefined, attack: attack === 'melee' || attack === 'ranged' ? attack : undefined, save: ABIL.has(save) ? save : undefined,
            damage, damageType: name(dmg.damage_type).toLowerCase() || undefined, source: { origin: 'pack', label: 'SRD 5.1' } };
        add({ kind: 'spell', id: def.id, name: def.name, meta: { sub: `${ord(level)} ${def.school.toLowerCase()}`.trim(), level, school: def.school, classes: def.classes }, def,
            text: [desc, higher ? `**At higher levels.** ${higher}` : '', a(sp.subclasses).length ? `*Also on subclass lists:* ${a(sp.subclasses).map(name).join(', ')}` : ''].filter(Boolean).join('\n\n') });
    }
    // Equipment: weapons, armour, gear
    for (const eq of a(input.equipment)) {
        const cat = idx(eq.equipment_category);
        const id = alias(s(eq.index));
        const cost = o(eq.cost);
        const costStr = cost.quantity !== undefined ? `${s(cost.quantity)} ${s(cost.unit)}` : '';
        const text = cleanText(eq.desc);
        const weight = n(eq.weight);
        if (cat === 'weapon') {
            const dmg = o(eq.damage);
            const props = a(eq.properties).map((p) => name(p).toLowerCase());
            const r = o(eq.range);
            const tr = o(eq.throw_range);
            const range = s(eq.weapon_range) === 'Ranged' ? `${s(r.normal)}/${s(r.long)}` : props.includes('thrown') ? `${s(tr.normal)}/${s(tr.long)}` : undefined;
            const def = { id, name: s(eq.name), category: s(eq.weapon_category).toLowerCase() === 'martial' ? 'martial' : 'simple', kind: s(eq.weapon_range) === 'Ranged' ? 'ranged' : 'melee',
                damage: s(dmg.damage_dice) || '0', damageType: name(dmg.damage_type).toLowerCase() || 'none', properties: props, versatile: s(o(eq.two_handed_damage).damage_dice) || undefined,
                range, weight, cost: costStr, source: { origin: 'pack', label: 'SRD 5.1' } };
            add({ kind: 'weapon', id, name: def.name, meta: { sub: `${def.category} ${def.kind} weapon`, category: def.category }, def, text: [`**${def.damage} ${def.damageType}**${props.length ? ` · ${props.join(', ')}` : ''}${range ? ` · range ${range}` : ''} · ${costStr} · ${weight} lb`, text].filter(Boolean).join('\n\n') });
        }
        else if (cat === 'armor') {
            const ac = o(eq.armor_class);
            const type = s(eq.armor_category).toLowerCase();
            const def = { id, name: s(eq.name), type: ['light', 'medium', 'heavy', 'shield'].includes(type) ? type : 'light', base: n(ac.base, 10),
                dexCap: ac.dex_bonus === false ? 0 : typeof ac.max_bonus === 'number' ? ac.max_bonus : null, strReq: n(eq.str_minimum) || undefined, stealthDis: eq.stealth_disadvantage === true, weight, cost: costStr, source: { origin: 'pack', label: 'SRD 5.1' } };
            add({ kind: 'armor', id, name: def.name, meta: { sub: `${def.type} armour`, category: def.type }, def, text: [`**AC ${def.base}${def.dexCap === null ? ' + Dex' : def.dexCap ? ` + Dex (max ${def.dexCap})` : ''}** · ${costStr} · ${weight} lb${def.strReq ? ` · Str ${def.strReq}` : ''}${def.stealthDis ? ' · Stealth disadvantage' : ''}`, text].filter(Boolean).join('\n\n') });
        }
        else {
            const category = name(eq.gear_category) || name(eq.equipment_category) || 'Gear';
            const def = { id, name: s(eq.name), category, cost: costStr, weight, summary: firstSentence(text) };
            const contents = a(eq.contents).map((c) => `- ${s(c.quantity)} × ${name(c.item)}`).join('\n');
            add({ kind: 'gear', id, name: def.name, meta: { sub: category, category }, def, text: [`${costStr}${weight ? ` · ${weight} lb` : ''}`, text, contents ? `**Contents**\n${contents}` : ''].filter(Boolean).join('\n\n') });
        }
    }
    // Magic items
    for (const mi of a(input.magicItems)) {
        const text = cleanText(mi.desc);
        const head = text.split('\n')[0] ?? '';
        const def = { id: s(mi.index), name: s(mi.name), category: name(mi.equipment_category), rarity: name(mi.rarity) || 'Varies', attunement: /requires attunement/i.test(head), summary: firstSentence(text.split('\n\n').slice(1).join('\n\n') || text) };
        add({ kind: 'magicItem', id: def.id, name: def.name, meta: { sub: `${def.category}, ${def.rarity.toLowerCase()}${def.attunement ? ' (attunement)' : ''}`, rarity: def.rarity, attunement: def.attunement, category: def.category }, def, text });
    }
    // Monsters
    for (const m of a(input.monsters)) {
        const acRaw = Array.isArray(m.armor_class) ? o(m.armor_class[0]) : {};
        const ac = typeof m.armor_class === 'number' ? m.armor_class : n(acRaw.value, 10);
        const speed = Object.entries(o(m.speed)).map(([k, v]) => (k === 'walk' ? s(v) : `${k} ${s(v)}`)).join(', ');
        const ab = { str: n(m.strength, 10), dex: n(m.dexterity, 10), con: n(m.constitution, 10), int: n(m.intelligence, 10), wis: n(m.wisdom, 10), cha: n(m.charisma, 10) };
        const def = { id: s(m.index), name: s(m.name), size: s(m.size), type: [s(m.type), s(m.subtype) ? `(${s(m.subtype)})` : ''].filter(Boolean).join(' '), alignment: s(m.alignment),
            ac, hp: n(m.hit_points), hitDice: s(m.hit_points_roll) || s(m.hit_dice), speed, cr: n(m.challenge_rating), xp: n(m.xp), abilities: ab };
        add({ kind: 'monster', id: def.id, name: def.name, meta: { sub: `${def.size} ${def.type}, CR ${crText(def.cr)}`, cr: def.cr, type: s(m.type) }, def, text: monsterText(m, def) });
    }
    // Conditions, feats, backgrounds
    for (const c of a(input.conditions))
        add({ kind: 'condition', id: s(c.index), name: s(c.name), meta: {}, text: cleanText(c.desc) });
    for (const f of a(input.feats))
        add({ kind: 'feat', id: s(f.index), name: s(f.name), meta: { sub: a(f.prerequisites).map((p) => `${idx(p.ability_score).toUpperCase()} ${s(p.minimum_score)}`).join(', ') || undefined }, text: cleanText(f.desc) });
    for (const b of a(input.backgrounds)) {
        const feat = o(b.feature);
        add({ kind: 'background', id: s(b.index), name: s(b.name), meta: {}, text: [`**Proficiencies:** ${a(b.starting_proficiencies).map(name).join(', ') || '—'}`, cleanText(b.desc), name(feat) ? `### Feature: ${name(feat)}\n\n${cleanText(feat.desc)}` : ''].filter(Boolean).join('\n\n') });
    }
    // Species: races and subraces (subrace text includes the parent race)
    const traitText = new Map(a(input.traits).map((t) => [s(t.index), `**${s(t.name)}.** ${cleanText(t.desc)}`]));
    const raceText = new Map();
    for (const r of a(input.races)) {
        const body = [`**Ability scores:** ${a(r.ability_bonuses).map((x) => `${idx(x.ability_score).toUpperCase()} +${s(x.bonus)}`).join(', ') || '—'} · **Speed** ${s(r.speed)} ft · **Size** ${s(r.size)}`,
            [s(r.age), s(r.alignment), s(r.size_description), s(r.language_desc)].filter(Boolean).join('\n\n'), a(r.traits).map((t) => traitText.get(idx(t)) ?? `**${name(t)}.**`).join('\n\n')].filter(Boolean).join('\n\n');
        raceText.set(s(r.index), body);
        add({ kind: 'species', id: s(r.index), name: s(r.name), meta: { sub: a(r.subraces).length ? `${a(r.subraces).length} subrace(s)` : undefined }, text: body });
    }
    for (const sr of a(input.subraces)) {
        const parent = idx(sr.race);
        add({ kind: 'species', id: s(sr.index), name: s(sr.name), meta: { sub: `Subrace of ${name(sr.race)}` },
            text: [`## ${s(sr.name)}`, cleanText(sr.desc), `**Additional ability scores:** ${a(sr.ability_bonuses).map((x) => `${idx(x.ability_score).toUpperCase()} +${s(x.bonus)}`).join(', ') || '—'}`,
                a(sr.racial_traits).map((t) => traitText.get(idx(t)) ?? `**${name(t)}.**`).join('\n\n'), `## ${name(sr.race)} traits`, raceText.get(parent) ?? ''].filter(Boolean).join('\n\n') });
    }
    // Classes, subclasses and features
    const feats = a(input.features);
    const featureList = (pred) => feats.filter(pred).sort((x, y) => n(x.level) - n(y.level)).map((f) => `- **${s(f.level)}:** ${s(f.name)}`).join('\n');
    for (const c of a(input.classes)) {
        const id = s(c.index);
        const profs = a(c.proficiencies).map(name).join(', ');
        const choices = a(c.proficiency_choices).map((pc) => cleanText(pc.desc)).filter(Boolean).join(' ');
        add({ kind: 'class', id, name: s(c.name), link: id, meta: { sub: `d${s(c.hit_die)} hit die` },
            text: [`**Hit die:** d${s(c.hit_die)} · **Saving throws:** ${a(c.saving_throws).map(name).join(', ')}`, `**Proficiencies:** ${profs || '—'}`, choices ? `**Choices:** ${choices}` : '',
                c.spellcasting ? `**Spellcasting ability:** ${name(o(c.spellcasting).spellcasting_ability)}` : '', '## Features by level', featureList((f) => idx(f.class) === id && !f.subclass)].filter(Boolean).join('\n\n') });
    }
    for (const sc of a(input.subclasses)) {
        const id = s(sc.index);
        add({ kind: 'subclass', id, name: s(sc.name), link: id, meta: { sub: `${name(sc.class)}: ${s(sc.subclass_flavor)}`, classId: idx(sc.class) },
            text: [cleanText(sc.desc), '## Features by level', featureList((f) => idx(f.subclass) === id)].filter(Boolean).join('\n\n') });
    }
    for (const f of feats) {
        add({ kind: 'feature', id: s(f.index), name: s(f.name), meta: { sub: `${name(f.class)}${f.subclass ? ` (${name(f.subclass)})` : ''} ${s(f.level)}`, level: n(f.level), classId: idx(f.class), subclassId: idx(f.subclass) || undefined }, text: cleanText(f.desc) });
    }
    // Rules
    for (const r of a(input.ruleSections))
        add({ kind: 'rule', id: s(r.index), name: s(r.name), meta: {}, text: cleanText(r.desc) });
    const counts = {};
    for (const e of entries)
        counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    for (const k of Object.keys(input))
        if (!a(input[k]).length)
            notes.push(`No data for “${k}”.`);
    return { pack: { format: PACK_FORMAT, formatVersion: PACK_FORMAT_VERSION, entries,
            manifest: { id: 'srd51', title: 'System Reference Document 5.1', shortName: 'SRD 5.1', version, ruleset: 'srd51', licence: 'CC BY 4.0', attribution: SRD51_ATTRIBUTION,
                source: 'Converted from 5e-database (github.com/5e-bits/5e-database)', generatedAt, counts } }, report: { counts, skipped, notes } };
}
export const crText = (cr) => (cr === 0.125 ? '1/8' : cr === 0.25 ? '1/4' : cr === 0.5 ? '1/2' : String(cr));
const modStr = (v) => { const m = Math.floor((v - 10) / 2); return `${v} (${m >= 0 ? '+' : '−'}${Math.abs(m)})`; };
function monsterText(m, d) {
    const list = (k) => (Array.isArray(m[k]) ? m[k].map((x) => (typeof x === 'string' ? x : name(x))).filter(Boolean).join(', ') : '');
    const profs = a(m.proficiencies);
    const saves = profs.filter((p) => name(p.proficiency).startsWith('Saving Throw')).map((p) => `${name(p.proficiency).replace('Saving Throw: ', '')} +${s(p.value)}`).join(', ');
    const skills = profs.filter((p) => name(p.proficiency).startsWith('Skill')).map((p) => `${name(p.proficiency).replace('Skill: ', '')} +${s(p.value)}`).join(', ');
    const senses = Object.entries(o(m.senses)).map(([k, v]) => `${k.replace(/_/g, ' ')} ${s(v)}`).join(', ');
    const block = (title, k) => { const l = a(m[k]); return l.length ? `### ${title}\n\n${l.map((x) => `**${s(x.name)}.** ${cleanText(x.desc)}`).join('\n\n')}` : ''; };
    return [`*${d.size} ${d.type}, ${d.alignment}*`,
        `**Armour Class** ${d.ac} · **Hit Points** ${d.hp} (${d.hitDice}) · **Speed** ${d.speed}`,
        `| STR | DEX | CON | INT | WIS | CHA |\n|---|---|---|---|---|---|\n| ${['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k) => modStr(d.abilities[k])).join(' | ')} |`,
        [saves && `**Saving Throws** ${saves}`, skills && `**Skills** ${skills}`, list('damage_vulnerabilities') && `**Damage Vulnerabilities** ${list('damage_vulnerabilities')}`,
            list('damage_resistances') && `**Damage Resistances** ${list('damage_resistances')}`, list('damage_immunities') && `**Damage Immunities** ${list('damage_immunities')}`,
            list('condition_immunities') && `**Condition Immunities** ${list('condition_immunities')}`, senses && `**Senses** ${senses}`, `**Languages** ${s(m.languages) || '—'}`,
            `**Challenge** ${crText(d.cr)} (${d.xp.toLocaleString('en-GB')} XP)`].filter(Boolean).join('  \n'),
        block('Traits', 'special_abilities'), block('Actions', 'actions'), block('Bonus actions', 'bonus_actions'), block('Reactions', 'reactions'), block('Legendary actions', 'legendary_actions')].filter(Boolean).join('\n\n');
}
