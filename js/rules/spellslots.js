/** Full-caster slot table by caster level 1–20, slots for spell levels 1–9. */
export const FULL_CASTER_SLOTS = [
    [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
    [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
    [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];
/** Pact Magic by warlock level: [slotCount, slotLevel] */
export function pactSlots(warlockLevel) {
    if (warlockLevel < 1)
        return { count: 0, level: 0 };
    const count = warlockLevel === 1 ? 1 : warlockLevel <= 10 ? 2 : warlockLevel <= 16 ? 3 : 4;
    const level = Math.min(5, Math.ceil(warlockLevel / 2));
    return { count, level };
}
/** Caster-level contribution of one class. Single-classed half casters round up; multiclassed they round down (SRD 5.1). */
export function casterLevelContribution(type, level, multiclass) {
    switch (type) {
        case 'full': return level;
        case 'half': return multiclass ? Math.floor(level / 2) : (level >= 2 ? Math.ceil(level / 2) : 0);
        case 'third': return multiclass ? Math.floor(level / 3) : (level >= 3 ? Math.ceil(level / 3) : 0);
        default: return 0;
    }
}
export function combinedCasterLevel(entries) {
    const casters = entries.filter((e) => e.casterType === 'full' || e.casterType === 'half' || e.casterType === 'third');
    const multi = casters.length > 1;
    const parts = casters.map((e) => ({ type: e.casterType, classLevel: e.level, contribution: casterLevelContribution(e.casterType, e.level, multi) }));
    return { level: parts.reduce((s, p) => s + p.contribution, 0), parts };
}
export function slotsForCasterLevel(level) {
    if (level < 1)
        return [];
    return [...FULL_CASTER_SLOTS[Math.min(20, level) - 1]];
}
