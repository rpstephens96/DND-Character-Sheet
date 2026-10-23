import { CLASSES, SUBCLASSES } from './srd-classes.js';
import { SPECIES, BACKGROUNDS, FEATS, WEAPONS, ARMOR, CONDITIONS, SPELLS } from './srd-content.js';
const STRUCTURAL = {
    class: 'classes', subclass: 'subclasses', species: 'species', background: 'backgrounds', spell: 'spells',
    weapon: 'weapons', armor: 'armor', condition: 'conditions', feat: 'feats',
};
/** Build a registry. Custom content with a `data` payload for a structural category is merged in; custom ids override nothing (they are namespaced). */
export function buildRegistry(custom = []) {
    var _a, _b;
    const reg = {
        classes: [...CLASSES], subclasses: [...SUBCLASSES], species: [...SPECIES], backgrounds: [...BACKGROUNDS],
        spells: [...SPELLS], weapons: [...WEAPONS], armor: [...ARMOR], conditions: [...CONDITIONS], feats: [...FEATS], custom: [],
    };
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
