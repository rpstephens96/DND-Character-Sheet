// Content registry: merges included SRD content with enabled user/imported content.
import type { ClassDef, SubclassDef, SpeciesDef, BackgroundDef, SpellDef, WeaponDef, ArmorDef, ConditionDef, FeatDef, CustomContent, RulesetId } from '../types.js';
import { CLASSES, SUBCLASSES } from './srd-classes.js';
import { SPECIES, BACKGROUNDS, FEATS, WEAPONS, ARMOR, CONDITIONS, SPELLS } from './srd-content.js';
import type { InstalledPack, IndexEntry, MonsterDef, MagicItemDef, GearDef, PackManifest } from '../content/types.js';

export interface Registry {
  classes: ClassDef[]; subclasses: SubclassDef[]; species: SpeciesDef[]; backgrounds: BackgroundDef[];
  spells: SpellDef[]; weapons: WeaponDef[]; armor: ArmorDef[]; conditions: ConditionDef[]; feats: FeatDef[];
  custom: CustomContent[];
  /** From enabled content packs. */
  magicItems: (MagicItemDef & { packId: string })[]; monsters: (MonsterDef & { packId: string })[]; gear: (GearDef & { packId: string })[];
  compendium: IndexEntry[]; packs: { manifest: PackManifest; enabled: boolean }[];
}

const STRUCTURAL: Record<string, keyof Registry> = {
  class: 'classes', subclass: 'subclasses', species: 'species', background: 'backgrounds', spell: 'spells',
  weapon: 'weapons', armor: 'armor', condition: 'conditions', feat: 'feats',
};

/** Build a registry. Custom content with a `data` payload for a structural category is merged in; custom ids override nothing (they are namespaced). */
export function buildRegistry(custom: CustomContent[] = [], packs: InstalledPack[] = []): Registry {
  const reg: Registry = {
    classes: [...CLASSES], subclasses: [...SUBCLASSES], species: [...SPECIES], backgrounds: [...BACKGROUNDS],
    spells: [...SPELLS], weapons: [...WEAPONS], armor: [...ARMOR], conditions: [...CONDITIONS], feats: [...FEATS], custom: [],
    magicItems: [], monsters: [], gear: [], compendium: [], packs: [],
  };
  mergePacks(reg, packs);
  for (const cc of custom) {
    if (!cc.enabled) continue;
    reg.custom.push(cc);
    const key = STRUCTURAL[cc.category];
    if (key && cc.data && typeof cc.data === 'object') {
      const raw = cc.data as Record<string, unknown>;
      const def = { ...raw, rulesets: raw.rulesets ?? cc.rulesets, id: cc.id, name: cc.name, source: { origin: cc.origin, label: cc.sourceLabel || 'Custom' } };
      if (cc.category === 'feat') { (def as Record<string, unknown>).summary ??= cc.description; (def as Record<string, unknown>).modifiers ??= cc.modifiers; }
      (reg[key] as unknown[]).push(def);
    }
  }
  return reg;
}

export const byId = <T extends { id: string }>(list: T[], id: string | undefined): T | undefined => list.find((x) => x.id === id);
export const forRuleset = <T extends { rulesets?: RulesetId[] }>(list: T[], r: RulesetId): T[] =>
  r === 'custom' ? list : list.filter((x) => !x.rulesets || x.rulesets.includes(r) || x.rulesets.includes('custom'));

/**
 * Merge enabled packs, in install order. Built-in mechanics always win: a pack definition whose id already exists
 * is ignored (its text is still available through the compendium). Only new ids are added.
 */
function mergePacks(reg: Registry, packs: InstalledPack[]): void {
  const lists: Record<string, { id: string }[]> = { spell: reg.spells, weapon: reg.weapons, armor: reg.armor, condition: reg.conditions, feat: reg.feats, species: reg.species, background: reg.backgrounds };
  for (const p of [...packs].sort((a, b) => a.order - b.order)) {
    reg.packs.push({ manifest: p.manifest, enabled: p.enabled });
    if (!p.enabled) continue;
    reg.compendium.push(...p.index);
    for (const [kind, list] of Object.entries(lists)) {
      const defs = (p.defs as Record<string, { id: string }[] | undefined>)[kind] ?? [];
      const have = new Set(list.map((x) => x.id));
      for (const d of defs) if (!have.has(d.id)) { list.push(d); have.add(d.id); }
    }
    for (const d of p.defs.monster ?? []) reg.monsters.push({ ...d, packId: p.id });
    for (const d of p.defs.magicItem ?? []) reg.magicItems.push({ ...d, packId: p.id });
    for (const d of p.defs.gear ?? []) reg.gear.push({ ...d, packId: p.id });
  }
}

/**
 * Remove same-named duplicates, keeping the version that best matches the ruleset:
 * an entry made only for this ruleset beats a shared one; a shared one beats one for another ruleset.
 * `keep` ids are always retained (e.g. spells a character already knows).
 */
export function preferRuleset<T extends { id: string; name: string; rulesets?: RulesetId[] }>(list: T[], r: RulesetId, keep: Iterable<string> = []): T[] {
  const must = new Set(keep);
  const score = (x: T) => (!x.rulesets ? 1 : x.rulesets.includes(r) ? (x.rulesets.length === 1 ? 3 : 2) : 0);
  const best = new Map<string, T>();
  for (const x of list) { const k = x.name.trim().toLowerCase(); const cur = best.get(k); if (!cur || score(x) > score(cur)) best.set(k, x); }
  const chosen = new Set([...best.values()].map((x) => x.id));
  return list.filter((x) => chosen.has(x.id) || must.has(x.id));
}

/** Compendium entries holding text for a registry id (built-in or pack), best ruleset match first. */
export function textFor(reg: Registry, kind: IndexEntry['kind'], id: string, r?: RulesetId): IndexEntry[] {
  const hits = reg.compendium.filter((e) => e.kind === kind && e.hasText && (e.id === id || e.link === id));
  const rs = (e: IndexEntry) => reg.packs.find((p) => p.manifest.id === e.packId)?.manifest.ruleset;
  return hits.sort((a, b) => Number(rs(b) === r) - Number(rs(a) === r));
}
