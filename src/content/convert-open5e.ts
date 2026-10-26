// Converter: Open5e API v2 (document 'srd-2024', i.e. SRD 5.2 / 2024 rules) → Adventurer's Ledger content pack.
// Field access is deliberately tolerant: Open5e v2 field names have changed over time, so every field is read
// through fallbacks and anything unrecognised is kept as text and listed in the report.
import type { PackFile, PackEntry, MonsterDef, MagicItemDef } from './types.js';
import { PACK_FORMAT, PACK_FORMAT_VERSION } from './types.js';
import type { SpellDef, SpeciesDef, Ability } from '../types.js';
import { cleanText, firstSentence, slug } from './pack.js';
import { SRD521_ATTRIBUTION } from './sources.js';
import { crText, type ConvertReport } from './convert-5edb.js';

type J = Record<string, unknown>;
export interface Open5eInput { spells?: J[]; creatures?: J[]; magicItems?: J[]; species?: J[]; backgrounds?: J[]; feats?: J[]; classes?: J[]; conditions?: J[]; rules?: J[]; }

const o = (v: unknown): J => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as J) : {});
const a = (v: unknown): J[] => (Array.isArray(v) ? (v.filter((x) => typeof x === 'object' && x !== null) as J[]) : []);
const s = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : typeof v === 'object' && v !== null && 'name' in v ? s((v as J).name) : '');
const n = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
/** First present value among keys. */
const pick = (x: J, ...keys: string[]): unknown => { for (const k of keys) if (x[k] !== undefined && x[k] !== null && x[k] !== '') return x[k]; return undefined; };
const ABBR: Record<string, Ability> = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha', str: 'str', dex: 'dex', con: 'con', int: 'int', wis: 'wis', cha: 'cha' };
const ord = (l: number) => (l === 0 ? 'Cantrip' : `${l}${l === 1 ? 'st' : l === 2 ? 'nd' : l === 3 ? 'rd' : 'th'}-level`);

/** Built-in 2014 SRD subclass for each class (the 2024 SRD also has exactly one per class). */
const SUBCLASS_BY_CLASS: Record<string, string> = { barbarian: 'berserker', bard: 'lore', cleric: 'life', druid: 'land', fighter: 'champion', monk: 'open-hand', paladin: 'devotion', ranger: 'hunter', rogue: 'thief', sorcerer: 'draconic', warlock: 'fiend', wizard: 'evocation' };
const ID_PREFIX = 'x24-';

/** 'srd-2024_fireball' → 'fireball' */
const baseKey = (x: J): string => slug(s(pick(x, 'key', 'slug', 'index', 'name')).replace(/^srd-?2024[_-]/i, ''));
const named = (list: unknown, heading?: string): string => { const l = a(list).filter((x) => s(x.name) || s(x.desc)); return l.length ? `${heading ? `### ${heading}\n\n` : ''}${l.map((x) => (s(x.name) ? `**${s(x.name)}.** ${cleanText(x.desc)}` : cleanText(x.desc))).join('\n\n')}` : ''; };

export function convertOpen5e(input: Open5eInput, version: string, generatedAt = new Date().toISOString()): { pack: PackFile; report: ConvertReport } {
  const entries: PackEntry[] = []; const skipped: string[] = []; const notes: string[] = [];
  const add = (e: PackEntry) => { if (!e.id || e.id === ID_PREFIX || !e.name) { skipped.push(`${e.kind}: missing id or name`); return; } entries.push(e); };
  const src = { origin: 'pack' as const, label: 'SRD 5.2.1' };

  for (const sp of a(input.spells)) {
    const level = n(pick(sp, 'level')); const desc = cleanText(sp.desc); const higher = cleanText(pick(sp, 'higher_level', 'higher_levels'));
    const comps = [sp.verbal ? 'V' : '', sp.somatic ? 'S' : '', sp.material ? 'M' : ''].filter(Boolean).join(', ') || s(sp.components);
    const save = ABBR[s(pick(sp, 'saving_throw_ability')).toLowerCase()];
    const classes = (Array.isArray(sp.classes) ? (sp.classes as unknown[]) : []).map((c) => slug(s(c)));
    const dmgTypes = Array.isArray(sp.damage_types) ? (sp.damage_types as unknown[]).map(s) : [];
    const def: SpellDef = { id: ID_PREFIX + baseKey(sp), name: s(sp.name), level, school: s(sp.school), castingTime: s(pick(sp, 'casting_time')), range: s(pick(sp, 'range_text', 'range')),
      components: comps, material: s(pick(sp, 'material_specified', 'material')) || undefined, duration: s(sp.duration), concentration: sp.concentration === true || /concentration/i.test(s(sp.duration)),
      ritual: sp.ritual === true, classes, summary: firstSentence(desc), higher: higher || undefined, attack: sp.attack_roll === true ? 'ranged' : undefined, save,
      damage: s(pick(sp, 'damage_roll')) || undefined, damageType: dmgTypes[0]?.toLowerCase() || undefined, rulesets: ['srd521'], source: src };
    add({ kind: 'spell', id: def.id, name: def.name, meta: { sub: `${ord(level)} ${def.school.toLowerCase()}`.trim(), level, school: def.school, classes }, def,
      text: [desc, higher ? `**Using a higher-level spell slot.** ${higher}` : ''].filter(Boolean).join('\n\n') });
  }

  for (const m of a(input.creatures)) {
    const sc = o(pick(m, 'ability_scores')); const sp = o(m.speed);
    const ab = { str: n(pick(sc, 'strength'), n(m.strength, 10)), dex: n(pick(sc, 'dexterity'), n(m.dexterity, 10)), con: n(pick(sc, 'constitution'), n(m.constitution, 10)),
      int: n(pick(sc, 'intelligence'), n(m.intelligence, 10)), wis: n(pick(sc, 'wisdom'), n(m.wisdom, 10)), cha: n(pick(sc, 'charisma'), n(m.charisma, 10)) };
    const speed = Object.keys(sp).length ? Object.entries(sp).filter(([k, v]) => typeof v === 'number' && !/unit|hover/.test(k)).map(([k, v]) => (k === 'walk' ? `${s(v)} ft.` : `${k} ${s(v)} ft.`)).join(', ') : s(pick(m, 'speed_all'));
    const def: MonsterDef = { id: ID_PREFIX + baseKey(m), name: s(m.name), size: s(m.size), type: s(m.type), alignment: s(m.alignment), ac: n(pick(m, 'armor_class'), 10), hp: n(pick(m, 'hit_points')),
      hitDice: s(pick(m, 'hit_dice')), speed, cr: n(pick(m, 'challenge_rating_decimal', 'challenge_rating', 'cr')), xp: n(pick(m, 'experience_points', 'xp')), abilities: ab };
    const head = [`*${def.size} ${def.type}, ${def.alignment}*`, `**Armour Class** ${def.ac} · **Hit Points** ${def.hp}${def.hitDice ? ` (${def.hitDice})` : ''} · **Speed** ${def.speed || '—'}`,
      `| STR | DEX | CON | INT | WIS | CHA |\n|---|---|---|---|---|---|\n| ${(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((k) => { const v = def.abilities[k]; const md = Math.floor((v - 10) / 2); return `${v} (${md >= 0 ? '+' : '−'}${Math.abs(md)})`; }).join(' | ')} |`,
      `**Challenge** ${crText(def.cr)}${def.xp ? ` (${def.xp.toLocaleString('en-GB')} XP)` : ''}${s(o(m.languages).as_string) ? `  \n**Languages** ${s(o(m.languages).as_string)}` : ''}`];
    const acts = a(m.actions);
    const byType = (t: string) => acts.filter((x) => (s(x.action_type) || 'ACTION').toUpperCase() === t);
    add({ kind: 'monster', id: def.id, name: def.name, meta: { sub: `${def.size} ${def.type}, CR ${crText(def.cr)}`, cr: def.cr, type: def.type.toLowerCase() }, def,
      text: [...head, named(m.traits, 'Traits'), named(byType('ACTION'), 'Actions'), named(byType('BONUS_ACTION'), 'Bonus actions'), named(byType('REACTION'), 'Reactions'), named(byType('LEGENDARY_ACTION'), 'Legendary actions'), cleanText(m.desc)].filter(Boolean).join('\n\n') });
  }

  for (const it of a(input.magicItems)) {
    if (it.is_magic_item === false) continue;
    const text = cleanText(it.desc);
    const def: MagicItemDef = { id: ID_PREFIX + baseKey(it), name: s(it.name), category: s(pick(it, 'category', 'type')) || 'Item', rarity: s(it.rarity) || 'Varies', attunement: it.requires_attunement === true, summary: firstSentence(text) };
    add({ kind: 'magicItem', id: def.id, name: def.name, meta: { sub: `${def.category}, ${def.rarity.toLowerCase()}${def.attunement ? ' (attunement)' : ''}`, rarity: def.rarity, attunement: def.attunement, category: def.category }, def,
      text: [def.attunement && s(it.attunement_detail) ? `*Requires attunement ${s(it.attunement_detail)}*` : '', text].filter(Boolean).join('\n\n') });
  }

  for (const sp of a(input.species)) {
    const traits = a(sp.traits); const speedTrait = traits.find((t) => /^speed$/i.test(s(t.name))); const sizeTrait = traits.find((t) => /^size$/i.test(s(t.name)));
    const speed = n((/(\d+)\s*feet/.exec(cleanText(speedTrait?.desc)) ?? [])[1], 30);
    const def: SpeciesDef = { id: ID_PREFIX + baseKey(sp), name: s(sp.name), source: src, rulesets: ['srd521'], size: /small/i.test(cleanText(sizeTrait?.desc)) && !/medium/i.test(cleanText(sizeTrait?.desc)) ? 'Small' : 'Medium', speed, asi: {},
      darkvision: n((/darkvision[^.]*?(\d+)\s*feet/i.exec(traits.map((t) => cleanText(t.desc)).join(' ')) ?? [])[1]) || undefined, languages: ['Common'], languageChoices: 2,
      traits: [...traits.filter((t) => t !== speedTrait && t !== sizeTrait).map((t) => ({ name: s(t.name), summary: firstSentence(cleanText(t.desc), 300) })),
        { name: 'Ability scores (2024 rules)', summary: 'Ability score increases come from your background: add them on the Sheet under Ability bonuses.' }] };
    add({ kind: 'species', id: def.id, name: def.name, meta: { sub: sp.is_subspecies ? 'Lineage' : `${def.size}, speed ${speed} ft` }, def: sp.is_subspecies ? undefined : def, text: [cleanText(sp.desc), named(traits, 'Traits')].filter(Boolean).join('\n\n') });
  }

  for (const b of a(input.backgrounds)) {
    const ben = a(b.benefits);
    const find = (re: RegExp) => ben.find((x) => re.test(s(x.type)) || re.test(s(x.name)));
    const skills = cleanText(find(/skill/i)?.desc).split(/,| and /).map((x) => x.trim().toLowerCase().replace(/\.$/, '')).filter((x) => x && x.length < 20);
    const feat = find(/feat/i);
    add({ kind: 'background', id: ID_PREFIX + baseKey(b), name: s(b.name), meta: { sub: feat ? `Feat: ${cleanText(feat.desc).split(/[.(]/)[0]}` : undefined },
      def: skills.length ? { id: '', name: s(b.name), source: src, rulesets: ['srd521'], skills, tools: [cleanText(find(/tool/i)?.desc)].filter(Boolean), languageChoices: 0,
        equipment: [cleanText(find(/equipment/i)?.desc)].filter(Boolean), feature: { name: feat ? `Origin feat: ${cleanText(feat.desc).split(/[.(]/)[0]}` : 'Origin feat', summary: `Ability scores: ${cleanText(find(/ability/i)?.desc) || 'see text'}. Add the increases on the Sheet.` } } : undefined,
      text: [cleanText(b.desc), named(ben, 'Benefits')].filter(Boolean).join('\n\n') });
  }

  for (const f of a(input.feats)) {
    add({ kind: 'feat', id: ID_PREFIX + baseKey(f), name: s(f.name), meta: { sub: [s(pick(f, 'type')), s(pick(f, 'prerequisite')) ? `Prerequisite: ${s(f.prerequisite)}` : ''].filter(Boolean).join(' · ') || undefined },
      text: [cleanText(f.desc), a(f.benefits).map((x) => `- ${cleanText(x.desc)}`).join('\n')].filter(Boolean).join('\n\n') });
  }

  for (const c of a(input.classes)) {
    const parent = s(o(c.subclass_of).key || c.subclass_of); const base = baseKey(c);
    const feats = a(c.features).map((f) => ({ name: s(f.name), desc: cleanText(f.desc), level: n(pick(o(a(f.gained_at)[0]), 'level'), n(f.level)) })).sort((x, y) => x.level - y.level);
    const list = feats.filter((f) => f.name).map((f) => `- **${f.level || '—'}:** ${f.name}`).join('\n');
    if (parent) {
      const classId = slug(parent.replace(/^srd-?2024[_-]/i, ''));
      add({ kind: 'subclass', id: ID_PREFIX + base, name: s(c.name), link: SUBCLASS_BY_CLASS[classId], meta: { sub: `${classId} subclass (2024)`, classId }, text: [cleanText(c.desc), '## Features by level', list].filter(Boolean).join('\n\n') });
    } else {
      add({ kind: 'class', id: ID_PREFIX + base, name: s(c.name), link: SUBCLASS_BY_CLASS[base] ? base : undefined, meta: { sub: `${s(pick(c, 'hit_dice', 'hit_die'))} hit die (2024)` },
        text: [cleanText(c.desc), `**Hit die:** ${s(pick(c, 'hit_dice', 'hit_die'))} · **Saving throws:** ${a(c.saving_throws).map(s).join(', ') || '—'}`, '## Features by level', list].filter(Boolean).join('\n\n') });
    }
    for (const f of feats) if (f.name && f.desc) add({ kind: 'feature', id: `${ID_PREFIX}${base}-${slug(f.name)}-${f.level}`.slice(0, 80), name: f.name, meta: { sub: `${s(c.name)} ${f.level || ''}`.trim(), level: f.level, classId: parent ? undefined : base }, text: f.desc });
  }

  for (const c of a(input.conditions)) add({ kind: 'condition', id: ID_PREFIX + baseKey(c), name: s(c.name), link: baseKey(c), meta: {}, text: [cleanText(c.desc), a(c.descriptions).map((x) => cleanText(x.desc)).join('\n\n')].filter(Boolean).join('\n\n') });
  for (const r of a(input.rules)) add({ kind: 'rule', id: ID_PREFIX + baseKey(r), name: s(r.name), meta: {}, text: [cleanText(r.desc), named(r.rules)].filter(Boolean).join('\n\n') });

  const seen = new Set<string>(); const unique = entries.filter((e) => { const k = `${e.kind}/${e.id}`; if (seen.has(k)) { skipped.push(`duplicate ${k}`); return false; } seen.add(k); return true; });
  const counts: Record<string, number> = {}; for (const e of unique) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
  for (const k of Object.keys(input) as (keyof Open5eInput)[]) if (!a(input[k]).length) notes.push(`No data for “${k}”.`);
  notes.push('2024 classes and subclasses are provided as text; mechanics use the built-in SRD class engine. 2024 background ability increases are applied manually.');
  return { pack: { format: PACK_FORMAT, formatVersion: PACK_FORMAT_VERSION, entries: unique,
    manifest: { id: 'srd521', title: 'System Reference Document 5.2.1 (2024 rules)', shortName: 'SRD 5.2.1', version, ruleset: 'srd521', licence: 'CC BY 4.0', attribution: SRD521_ATTRIBUTION,
      source: 'Converted from the Open5e API v2 (document srd-2024)', generatedAt, counts } }, report: { counts, skipped, notes } };
}
