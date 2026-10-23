import { CLASSES, SUBCLASSES } from './srd-classes.js';
import { SPECIES, BACKGROUNDS, FEATS, WEAPONS, ARMOR, CONDITIONS, SPELLS } from './srd-content.js';
const STRUCTURAL = {
    class: 'classes', subclass: 'subclasses', species: 'species', background: 'backgrounds', spell: 'spells',
    weapon: 'weapons', armor: 'armor', condition: 'conditions', feat: 'feats',
};
/** Build a registry. Custom content with a `data` payload for a structural category is merged in; custom ids override nothing (they are namespaced). */
export function buildRegistry(custom = [], packs = []) {
    var _a, _b;
    const reg = {
        classes: [...CLASSES], subclasses: [...SUBCLASSES], species: [...SPECIES], backgrounds: [...BACKGROUNDS],
        spells: [...SPELLS], weapons: [...WEAPONS], armor: [...ARMOR], conditions: [...CONDITIONS], feats: [...FEATS], custom: [],
        magicItems: [], monsters: [], gear: [], compendium: [], packs: [],
    };
    mergePacks(reg, packs);
    for (const cc of custom) {
        if (!cc.enabled)
            continue;
        reg.custom.push(cc);
        const key = STRUCTURAL[cc.category];
        if (key && cc.data && typeof cc.data === 'object') {
            const raw = cc.data;
            const def = { ...raw, rulesets: raw.rulesets ?? cc.rulesets, id: cc.id, name: cc.name, source: { origin: cc.origin, label: cc.sourceLabel || 'Custom' } };
            if (cc.category === 'feat') {
                (_a = def).summary ?? (_a.summary = cc.description);
                (_b = def).modifiers ?? (_b.modifiers = cc.modifiers);
            }
            reg[key].push(def);
        }
    }
    return reg;
}
export const byId = (list, id) => list.find((x) => x.id === id);
export const forRuleset = (list, r) => r === 'custom' ? list : list.filter((x) => !x.rulesets || x.rulesets.includes(r) || x.rulesets.includes('custom'));
/**
 * Merge enabled packs, in install order. Built-in mechanics always win: a pack definition whose id already exists
 * is ignored (its text is still available through the compendium). Only new ids are added.
 */
function mergePacks(reg, packs) {
    const lists = { spell: reg.spells, weapon: reg.weapons, armor: reg.armor, condition: reg.conditions, feat: reg.feats, species: reg.species, background: reg.backgrounds };
    for (const p of [...packs].sort((a, b) => a.order - b.order)) {
        reg.packs.push({ manifest: p.manifest, enabled: p.enabled });
        if (!p.enabled)
            continue;
        reg.compendium.push(...p.index);
        for (const [kind, list] of Object.entries(lists)) {
            const defs = p.defs[kind] ?? [];
            const have = new Set(list.map((x) => x.id));
            for (const d of defs)
                if (!have.has(d.id)) {
                    list.push(d);
                    have.add(d.id);
                }
        }
        for (const d of p.defs.monster ?? [])
            reg.monsters.push({ ...d, packId: p.id });
        for (const d of p.defs.magicItem ?? [])
            reg.magicItems.push({ ...d, packId: p.id });
        for (const d of p.defs.gear ?? [])
            reg.gear.push({ ...d, packId: p.id });
    }
}
/**
 * Remove same-named duplicates, keeping the version that best matches the ruleset:
 * an entry made only for this ruleset beats a shared one; a shared one beats one for another ruleset.
 * `keep` ids are always retained (e.g. spells a character already knows).
 */
export function preferRuleset(list, r, keep = []) {
    const must = new Set(keep);
    const score = (x) => (!x.rulesets ? 1 : x.rulesets.includes(r) ? (x.rulesets.length === 1 ? 3 : 2) : 0);
    const best = new Map();
    for (const x of list) {
        const k = x.name.trim().toLowerCase();
        const cur = best.get(k);
        if (!cur || score(x) > score(cur))
            best.set(k, x);
    }
    const chosen = new Set([...best.values()].map((x) => x.id));
    return list.filter((x) => chosen.has(x.id) || must.has(x.id));
}
/** Compendium entries holding text for a registry id (built-in or pack), best ruleset match first. */
export function textFor(reg, kind, id, r) {
    const hits = reg.compendium.filter((e) => e.kind === kind && e.hasText && (e.id === id || e.link === id));
    const rs = (e) => reg.packs.find((p) => p.manifest.id === e.packId)?.manifest.ruleset;
    return hits.sort((a, b) => Number(rs(b) === r) - Number(rs(a) === r));
}
