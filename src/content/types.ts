// Content-pack types. A pack is a single JSON file containing a manifest and entries.
// On install it is split into a lightweight record (manifest, index, structured defs) and full text loaded on demand.
import type { RulesetId, SpellDef, WeaponDef, ArmorDef, ConditionDef, FeatDef, SpeciesDef, BackgroundDef } from '../types.js';

export const PACK_FORMAT = 'adventurers-ledger-pack';
export const PACK_FORMAT_VERSION = 1;

export type EntryKind = 'spell' | 'class' | 'subclass' | 'feature' | 'species' | 'background' | 'feat' | 'weapon' | 'armor' | 'gear' | 'magicItem' | 'monster' | 'condition' | 'rule';
export const ENTRY_KINDS: EntryKind[] = ['spell', 'class', 'subclass', 'feature', 'species', 'background', 'feat', 'weapon', 'armor', 'gear', 'magicItem', 'monster', 'condition', 'rule'];
export const KIND_LABEL: Record<EntryKind, string> = { spell: 'Spells', class: 'Classes', subclass: 'Subclasses', feature: 'Class features', species: 'Species', background: 'Backgrounds', feat: 'Feats',
  weapon: 'Weapons', armor: 'Armour', gear: 'Gear', magicItem: 'Magic items', monster: 'Monsters', condition: 'Conditions', rule: 'Rules' };

export interface PackManifest {
  id: string;              // slug, e.g. 'srd51'
  title: string;           // 'System Reference Document 5.1'
  shortName: string;       // 'SRD 5.1'
  version: string;         // data version, e.g. '2026-10-23'
  ruleset: RulesetId | 'any';
  licence: string;         // 'CC BY 4.0'
  attribution: string;     // full attribution notice required by the licence
  source: string;          // where the data came from
  generatedAt: string;
  counts?: Partial<Record<EntryKind, number>>;
}

/** Fields used for listing, searching and filtering without loading full text. */
export interface IndexMeta {
  sub?: string;            // short subtitle, e.g. '3rd-level evocation'
  level?: number;          // spell level / feature level
  school?: string;
  classes?: string[];
  rarity?: string;
  attunement?: boolean;
  cr?: number;
  type?: string;
  category?: string;
  classId?: string;        // features and subclasses
  subclassId?: string;
}

export interface MonsterDef {
  id: string; name: string; size: string; type: string; alignment: string;
  ac: number; hp: number; hitDice: string; speed: string; cr: number; xp: number;
  abilities: Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', number>;
}

export interface MagicItemDef { id: string; name: string; category: string; rarity: string; attunement: boolean; summary: string; }
export interface GearDef { id: string; name: string; category: string; cost: string; weight: number; summary: string; }

/** Structured, mechanically usable definitions by kind (all optional). */
export interface EntryDefs {
  spell: SpellDef; weapon: WeaponDef; armor: ArmorDef; condition: ConditionDef; feat: FeatDef; species: SpeciesDef; background: BackgroundDef;
  monster: MonsterDef; magicItem: MagicItemDef; gear: GearDef;
}

export interface PackEntry {
  kind: EntryKind;
  id: string;
  name: string;
  /** Id of an existing registry entry this text belongs to (e.g. built-in class 'wizard'). */
  link?: string;
  meta?: IndexMeta;
  def?: EntryDefs[keyof EntryDefs];
  text: string;            // safe Markdown subset
}

export interface PackFile { format: typeof PACK_FORMAT; formatVersion: number; manifest: PackManifest; entries: PackEntry[]; }

export interface IndexEntry { packId: string; kind: EntryKind; id: string; name: string; link?: string; meta: IndexMeta; hasText: boolean; }

/** Stored in the 'packs' object store. */
export interface InstalledPack {
  id: string; manifest: PackManifest; enabled: boolean; installedAt: string; order: number;
  index: IndexEntry[];
  defs: { [K in keyof EntryDefs]?: EntryDefs[K][] };
}

/** Stored in the 'packText' object store; id = `${packId}/${kind}/${entryId}`. */
export interface PackText { id: string; packId: string; text: string; }
export const textKey = (packId: string, kind: EntryKind, id: string): string => `${packId}/${kind}/${id}`;
