// Domain types for The Adventurer's Ledger.
// Stored records contain *inputs and choices*; derived statistics are always
// recomputed by the rules engine (src/rules/calc.ts) so they never drift.

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export type RulesetId = 'srd51' | 'srd521' | 'custom';
export type ContentOrigin = 'srd' | 'user' | 'imported' | 'homebrew' | 'pack';
export type RecoveryTiming = 'short' | 'long' | 'dawn' | 'none';
export type CasterType = 'none' | 'full' | 'half' | 'third' | 'pact';
export type PrepStyle = 'prepared' | 'known' | 'spellbook';

/** A single structured modifier. Kept intentionally small so it is debuggable. */
export interface Modifier {
  target: string; // e.g. 'ac', 'speed', 'save:all', 'save:dex', 'skill:stealth', 'ability:str', 'hpMax', 'hpPerLevel', 'initiative', 'attack', 'damage', 'spellDC', 'spellAttack', 'passive:perception'
  op: 'add' | 'setMin';
  value: number;
  note?: string;
}

export interface SourceRef { origin: ContentOrigin; label: string; }

export interface ResourceDef {
  id: string;
  name: string;
  /** Max uses per class level (index 0 = level 1). null entry = unavailable; -1 = unlimited. */
  byLevel?: (number | null)[];
  /** Alternative formula: 'abilityMod:cha' (min 1), 'level', 'level*5', '1+abilityMod:cha' */
  formula?: string;
  recovery: RecoveryTiming;
  /** Level at which recovery becomes short rest (e.g. Bardic Inspiration at 5) */
  shortRestFromLevel?: number;
}

/** A class/subclass feature at a level. Optional modifiers apply automatically once the class level is reached. */
export interface FeatureDef { level: number; name: string; summary?: string; modifiers?: Modifier[]; }

export interface SubclassDef {
  id: string; classId: string; name: string; source: SourceRef;
  features: FeatureDef[];
  resources?: ResourceDef[];
  casterType?: CasterType; // e.g. third-casters supplied as custom content
  spellAbility?: Ability;
  alwaysPrepared?: { level: number; spells: string[] }[];
}

export interface ClassDef {
  id: string; name: string; source: SourceRef; rulesets: RulesetId[];
  hitDie: number;
  primary: Ability[];
  saves: Ability[];
  armor: string[]; weapons: string[]; tools: string[];
  skillChoices: { count: number; from: string[] };
  multiclassReq: { all?: Partial<Record<Ability, number>>; any?: Partial<Record<Ability, number>> };
  multiclassProfs: string[];
  casterType: CasterType;
  spellAbility?: Ability;
  prepStyle?: PrepStyle;
  /** Cantrips known by class level (index 0 = level 1) */
  cantrips?: number[];
  /** Spells known by class level for 'known' casters */
  spellsKnown?: number[];
  /** 'mod+level' | 'mod+halfLevel' */
  preparedFormula?: string;
  subclassLevel: number;
  subclassLabel: string;
  asiLevels: number[];
  features: FeatureDef[];
  resources?: ResourceDef[];
  unarmoredDefense?: Ability; // barbarian: con, monk: wis
  startingEquipment?: string[];
}

export interface SpeciesDef {
  id: string; name: string; source: SourceRef; rulesets: RulesetId[];
  size: string; speed: number;
  asi: Partial<Record<Ability, number>>;
  asiChoice?: { count: number; amount: number; exclude?: Ability[] };
  darkvision?: number;
  languages: string[]; languageChoices?: number;
  skills?: string[]; skillChoices?: number;
  weaponProfs?: string[]; armorProfs?: string[];
  resistances?: string[];
  traits: { name: string; summary: string }[];
  modifiers?: Modifier[];
}

export interface BackgroundDef {
  id: string; name: string; source: SourceRef; rulesets: RulesetId[];
  skills: string[]; tools: string[]; languageChoices: number;
  equipment: string[]; feature: { name: string; summary: string };
}

export interface SpellDef {
  id: string; name: string; level: number; school: string;
  castingTime: string; range: string; components: string; material?: string;
  duration: string; concentration: boolean; ritual: boolean;
  classes: string[]; summary: string; higher?: string; rulesets?: RulesetId[];
  attack?: 'melee' | 'ranged'; save?: Ability; damage?: string; damageType?: string;
  source: SourceRef;
}

export interface WeaponDef {
  id: string; name: string; category: 'simple' | 'martial'; kind: 'melee' | 'ranged';
  damage: string; damageType: string; properties: string[]; versatile?: string;
  range?: string; weight: number; cost: string; source: SourceRef;
}

export interface ArmorDef {
  id: string; name: string; type: 'light' | 'medium' | 'heavy' | 'shield';
  base: number; dexCap: number | null; strReq?: number; stealthDis?: boolean;
  weight: number; cost: string; source: SourceRef;
}

export interface ConditionDef { id: string; name: string; summary: string; modifiers?: Modifier[]; source: SourceRef; }

export interface FeatDef { id: string; name: string; rulesets?: RulesetId[]; prerequisite?: string; summary: string; modifiers?: Modifier[]; asi?: Partial<Record<Ability, number>>; source: SourceRef; }

/** User-authored or imported content. `data` holds the category-specific definition. */
export interface CustomContent {
  id: string; category: CustomCategory; name: string;
  rulesets: RulesetId[]; origin: ContentOrigin; sourceLabel: string;
  version: number; enabled: boolean;
  description: string; notes: string;
  prerequisites: string; levelRequirement: number;
  modifiers: Modifier[];
  resources: ResourceDef[];
  proficiencies: string[];
  spellAdditions: string[];
  actions: ActionDef[];
  data?: Record<string, unknown>; // full ClassDef/SpellDef/etc for structural categories
  createdAt: string; updatedAt: string;
}
export type CustomCategory =
  | 'class' | 'subclass' | 'species' | 'background' | 'feat' | 'spell' | 'equipment' | 'weapon' | 'armor'
  | 'tool' | 'language' | 'condition' | 'classFeature' | 'subclassFeature' | 'speciesTrait' | 'backgroundFeature'
  | 'invocation' | 'fightingStyle' | 'metamagic' | 'transformation' | 'companion' | 'magicItem' | 'monster'
  | 'resource' | 'rule';

// ---------------- Character ----------------

export interface ClassLevel {
  classId: string; level: number; subclassId?: string;
  /** HP gained at each class level (index 0 = 1st level in this class), excluding Con. */
  hpGains: number[];
}

export interface Proficiency { kind: 'skill' | 'expertise' | 'save' | 'armor' | 'weapon' | 'tool' | 'language'; name: string; source: string; }

export type FeatureKind = 'class' | 'subclass' | 'species' | 'background' | 'feat' | 'other';
/** A feature on a character. Features added by the user can carry their own mechanics; linked items are removed with the feature. */
export interface FeatureEntry {
  id: string; name: string; source: string; level?: number; summary: string; contentId?: string;
  kind?: FeatureKind; classId?: string; subclassId?: string;
  modifiers?: Modifier[];
  resourceId?: string; actionIds?: string[]; profs?: Proficiency[]; spellIds?: string[];
}

export interface ResourceState { id: string; name: string; max: number; used: number; recovery: RecoveryTiming; source: string; custom?: boolean; /** e.g. 'abilityMod:wis', '1+abilityMod:cha', 'level', 'level*5'; overrides max when set */ formula?: string; }

export interface InventoryItem {
  id: string; name: string; category: 'weapon' | 'armor' | 'shield' | 'gear' | 'consumable' | 'ammunition' | 'magic' | 'treasure' | 'container' | 'tool';
  quantity: number; weight: number; value: string;
  equipped: boolean; attuned: boolean; requiresAttunement: boolean;
  containerId?: string; location: string;
  charges?: { current: number; max: number; recovery: RecoveryTiming };
  weaponId?: string; armorId?: string;
  magicBonus: number; modifiers: Modifier[];
  properties: string[]; notes: string; source: string;
  acquiredSessionId?: string;
}

export interface ActionDef {
  id: string; name: string; economy: 'action' | 'bonus' | 'reaction' | 'free' | 'other';
  range: string; target: string;
  attackType: 'melee' | 'ranged' | 'spell-melee' | 'spell-ranged' | 'save' | 'none';
  ability?: Ability; proficient: boolean; attackBonusExtra: number;
  saveAbility?: Ability; saveDC?: number;
  damage: string; damageType: string; extraDamage?: string; versatile?: string;
  ammoItemId?: string; resourceId?: string; notes: string; source: string;
}

export interface ActiveEffect {
  id: string; name: string; conditionId?: string; startedRound?: number; startedAt: string;
  duration: string; saveAbility?: Ability; saveDC?: number; source: string;
  concentrationLinked: boolean; modifiers: Modifier[]; endCondition: string; notes: string;
}

export interface SpellcastingState {
  slotsUsed: number[];        // index 0 = 1st-level slots used
  pactUsed: number;
  known: string[];            // spell ids known / in spellbook
  prepared: string[];         // spell ids prepared
  alwaysPrepared: string[];
  favourites: string[];
  notes: Record<string, string>;
  freeCasts: { id: string; spellId: string; name: string; max: number; used: number; recovery: RecoveryTiming }[];
}

export interface Character {
  id: string; schemaVersion: number; ruleset: RulesetId;
  name: string; playerName: string; campaignId?: string; portrait?: string; // data URL (small)
  speciesId: string; backgroundId: string; alignment: string;
  xp: number; levellingMode: 'xp' | 'milestone';
  inspiration: boolean;
  classes: ClassLevel[];
  baseAbilities: Record<Ability, number>;
  abilityBonuses: { ability: Ability; amount: number; source: string }[]; // species choices, ASIs, feats
  abilityMethod: string;
  proficiencies: Proficiency[];
  features: FeatureEntry[];
  feats: string[];
  grants: string[]; // custom content ids applied to this character
  resources: ResourceState[];
  hp: { current: number; temp: number; };
  hitDiceUsed: Record<string, number>; // keyed by die size 'd8'
  deathSaves: { successes: number; failures: number; stable: boolean; dead: boolean };
  exhaustion: number;
  effects: ActiveEffect[];
  concentration?: { spellId?: string; name: string; since: string };
  reactionUsed: boolean;
  defenses: { resistances: string[]; immunities: string[]; vulnerabilities: string[]; conditionImmunities: string[] };
  senses: string; speeds: { walk?: number; fly?: number; swim?: number; climb?: number; burrow?: number };
  inventory: InventoryItem[];
  currency: { cp: number; sp: number; ep: number; gp: number; pp: number };
  actions: ActionDef[];
  spellcasting: SpellcastingState;
  companions: { id: string; name: string; kind: string; ac: number; hpMax: number; hp: number; notes: string }[];
  overrides: Record<string, number>;
  details: {
    personality: string; ideals: string; bonds: string; flaws: string; appearance: string;
    age: string; height: string; weight: string; eyes: string; hair: string; skin: string;
    allies: string; backstory: string; notes: string; treasure: string;
  };
  dashboardPanels: string[];
  pendingChoices: PendingChoice[];
  combatNotes: string;
  createdAt: string; updatedAt: string;
}

export interface CharacterEvent {
  id: string; characterId: string; ts: string; category: EventCategory; description: string;
  before: Record<string, unknown> | null; after: Record<string, unknown> | null;
  reversible: boolean; undone: boolean; sessionId?: string; note?: string; source?: string;
}
export type EventCategory = 'create' | 'level' | 'hp' | 'temphp' | 'rest' | 'spell' | 'resource' | 'inventory' | 'currency'
  | 'condition' | 'attunement' | 'ability' | 'feature' | 'override' | 'import' | 'migration' | 'edit' | 'deathsave' | 'note' | 'milestone';

export interface LevelSnapshot { id: string; characterId: string; ts: string; fromLevel: number; toLevel: number; classId: string; before: Character; summary: string[]; sessionId?: string; }

export interface Campaign { id: string; name: string; dm: string; setting: string; summary: string; startDate: string; worldDate: string; party: string; sharedFunds: string; tags: string[]; createdAt: string; updatedAt: string; }

export type RecordKind = 'session' | 'npc' | 'location' | 'faction' | 'quest' | 'note' | 'clue' | 'decision' | 'debt' | 'downtime';
export interface CampaignRecord {
  id: string; campaignId: string; kind: RecordKind; title: string; body: string; tags: string[];
  links: string[]; pinned: boolean; status: string; date: string; visibility: 'private' | 'shared';
  objectives: { id: string; text: string; done: boolean }[];
  createdAt: string; updatedAt: string;
}

export interface Participant { id: string; name: string; initiative: number; dexMod: number; hp?: number; hpMax?: number; ac?: number; disposition: 'friendly' | 'neutral' | 'hostile'; conditions: string[]; concentrating: boolean; defeated: boolean; delayed: boolean; readied: string; dmNotes: string; characterId?: string; }
export interface Encounter { id: string; name: string; campaignId?: string; round: number; turnIndex: number; participants: Participant[]; active: boolean; updatedAt: string; }

export interface RollRecord { id: string; ts: string; label: string; expression: string; dice: { sides: number; value: number; kept: boolean }[]; modifier: number; total: number; mode: 'normal' | 'advantage' | 'disadvantage'; manual: boolean; characterId?: string; }

export interface Settings {
  id: 'settings'; theme: 'light' | 'dark' | 'system'; defaultRuleset: RulesetId;
  hpOnLevel: 'fixed' | 'roll' | 'manual'; encumbranceVariant: boolean; coinWeight: number;
  attunementLimit: number; activeCharacterId?: string; onboarded: boolean; reduceMotion: boolean;
  favouriteRolls: { id: string; label: string; expression: string }[];
  /** Bundled content packs the user removed, so they are not reinstalled automatically. */
  removedPacks?: string[];
}

export interface PendingChoice { id: string; kind: 'asi' | 'subclass' | 'expertise' | 'spells' | 'other'; classId: string; classLevel: number; label: string; }
