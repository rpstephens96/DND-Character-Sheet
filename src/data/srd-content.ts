// SRD 5.1 species, background, feat, equipment, conditions and a starter spell list.
// Mechanical data only; summaries are paraphrased. CC BY 4.0, Wizards of the Coast.
import type { SpeciesDef, BackgroundDef, FeatDef, WeaponDef, ArmorDef, ConditionDef, SpellDef } from '../types.js';
import { SRD } from './srd-classes.js';
const R = ['srd51', 'srd521'] as ('srd51' | 'srd521')[];

export const SPECIES: SpeciesDef[] = [
  { id: 'hill-dwarf', name: 'Dwarf (Hill)', source: SRD, rulesets: R, size: 'Medium', speed: 25, asi: { con: 2, wis: 1 }, darkvision: 60,
    languages: ['Common', 'Dwarvish'], weaponProfs: ['battleaxe', 'handaxe', 'light hammer', 'warhammer'], resistances: ['poison'],
    traits: [{ name: 'Dwarven Resilience', summary: 'Advantage on saves against poison; resistance to poison damage.' },
      { name: 'Stonecunning', summary: 'Double proficiency on History checks about stonework.' },
      { name: 'Dwarven Toughness', summary: '+1 maximum HP per level.' }, { name: 'Speed', summary: 'Not reduced by heavy armour.' }],
    modifiers: [{ target: 'hpPerLevel', op: 'add', value: 1, note: 'Dwarven Toughness' }] },
  { id: 'high-elf', name: 'Elf (High)', source: SRD, rulesets: R, size: 'Medium', speed: 30, asi: { dex: 2, int: 1 }, darkvision: 60,
    languages: ['Common', 'Elvish'], languageChoices: 1, skills: ['perception'], weaponProfs: ['longsword', 'shortsword', 'shortbow', 'longbow'],
    traits: [{ name: 'Fey Ancestry', summary: 'Advantage against being charmed; magic cannot put you to sleep.' }, { name: 'Trance', summary: 'Four hours of meditation replaces sleep.' },
      { name: 'Cantrip', summary: 'One wizard cantrip (Int).' }] },
  { id: 'lightfoot-halfling', name: 'Halfling (Lightfoot)', source: SRD, rulesets: R, size: 'Small', speed: 25, asi: { dex: 2, cha: 1 },
    languages: ['Common', 'Halfling'], traits: [{ name: 'Lucky', summary: 'Reroll a natural 1 on attacks, checks and saves.' },
      { name: 'Brave', summary: 'Advantage on saves against being frightened.' }, { name: 'Halfling Nimbleness', summary: 'Move through larger creatures’ spaces.' },
      { name: 'Naturally Stealthy', summary: 'Can hide behind a larger creature.' }] },
  { id: 'human', name: 'Human', source: SRD, rulesets: R, size: 'Medium', speed: 30, asi: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
    languages: ['Common'], languageChoices: 1, traits: [] },
  { id: 'dragonborn', name: 'Dragonborn', source: SRD, rulesets: R, size: 'Medium', speed: 30, asi: { str: 2, cha: 1 }, languages: ['Common', 'Draconic'],
    traits: [{ name: 'Draconic Ancestry', summary: 'Choose a dragon type; sets breath weapon and resistance type.' },
      { name: 'Breath Weapon', summary: '2d6 damage area, Dex or Con save (DC 8 + Con + PB); scales at 6, 11, 16. Recharges on a rest.' },
      { name: 'Damage Resistance', summary: 'Resistance to your ancestry’s damage type (add under Defences).' }] },
  { id: 'rock-gnome', name: 'Gnome (Rock)', source: SRD, rulesets: R, size: 'Small', speed: 25, asi: { int: 2, con: 1 }, darkvision: 60, languages: ['Common', 'Gnomish'],
    traits: [{ name: 'Gnome Cunning', summary: 'Advantage on Int, Wis and Cha saves against magic.' }, { name: "Artificer's Lore", summary: 'Double proficiency on History checks about magic items and devices.' }, { name: 'Tinker', summary: 'Build small clockwork devices.' }] },
  { id: 'half-elf', name: 'Half-Elf', source: SRD, rulesets: R, size: 'Medium', speed: 30, asi: { cha: 2 }, asiChoice: { count: 2, amount: 1, exclude: ['cha'] }, darkvision: 60,
    languages: ['Common', 'Elvish'], languageChoices: 1, skillChoices: 2, traits: [{ name: 'Fey Ancestry', summary: 'Advantage against being charmed; magic cannot put you to sleep.' }, { name: 'Skill Versatility', summary: 'Proficiency in two skills of your choice.' }] },
  { id: 'half-orc', name: 'Half-Orc', source: SRD, rulesets: R, size: 'Medium', speed: 30, asi: { str: 2, con: 1 }, darkvision: 60, languages: ['Common', 'Orc'], skills: ['intimidation'],
    traits: [{ name: 'Relentless Endurance', summary: 'Once per long rest, drop to 1 HP instead of 0.' }, { name: 'Savage Attacks', summary: 'Add one extra weapon die on a melee critical hit.' }] },
  { id: 'tiefling', name: 'Tiefling', source: SRD, rulesets: R, size: 'Medium', speed: 30, asi: { cha: 2, int: 1 }, darkvision: 60, languages: ['Common', 'Infernal'], resistances: ['fire'],
    traits: [{ name: 'Hellish Resistance', summary: 'Resistance to fire damage.' }, { name: 'Infernal Legacy', summary: 'Thaumaturgy; later hellish rebuke (3rd) and darkness (5th), once per long rest each.' }] },
];

export const BACKGROUNDS: BackgroundDef[] = [
  { id: 'acolyte', name: 'Acolyte', source: SRD, rulesets: R, skills: ['insight', 'religion'], tools: [], languageChoices: 2,
    equipment: ['Holy symbol', 'Prayer book', '5 sticks of incense', 'Vestments', 'Common clothes', '15 gp'],
    feature: { name: 'Shelter of the Faithful', summary: 'Temples of your faith will support you and your companions.' } },
  { id: 'custom-background', name: 'Custom background', source: { origin: 'user', label: 'Ledger' }, rulesets: ['srd51', 'srd521', 'custom'], skills: [], tools: [], languageChoices: 0,
    equipment: [], feature: { name: 'Custom feature', summary: 'Record your background feature under Features.' } },
];

export const FEATS: FeatDef[] = [
  { id: 'grappler', name: 'Grappler', prerequisite: 'Strength 13', source: SRD, summary: 'Advantage on attacks against a creature you are grappling; can attempt to pin a grappled creature.' },
];

const w = (id: string, name: string, category: 'simple' | 'martial', kind: 'melee' | 'ranged', damage: string, damageType: string, weight: number, cost: string, properties: string[] = [], extra: Partial<WeaponDef> = {}): WeaponDef =>
  ({ id, name, category, kind, damage, damageType, weight, cost, properties, source: SRD, ...extra });

export const WEAPONS: WeaponDef[] = [
  w('club', 'Club', 'simple', 'melee', '1d4', 'bludgeoning', 2, '1 sp', ['light']),
  w('dagger', 'Dagger', 'simple', 'melee', '1d4', 'piercing', 1, '2 gp', ['finesse', 'light', 'thrown'], { range: '20/60' }),
  w('greatclub', 'Greatclub', 'simple', 'melee', '1d8', 'bludgeoning', 10, '2 sp', ['two-handed']),
  w('handaxe', 'Handaxe', 'simple', 'melee', '1d6', 'slashing', 2, '5 gp', ['light', 'thrown'], { range: '20/60' }),
  w('javelin', 'Javelin', 'simple', 'melee', '1d6', 'piercing', 2, '5 sp', ['thrown'], { range: '30/120' }),
  w('light-hammer', 'Light hammer', 'simple', 'melee', '1d4', 'bludgeoning', 2, '2 gp', ['light', 'thrown'], { range: '20/60' }),
  w('mace', 'Mace', 'simple', 'melee', '1d6', 'bludgeoning', 4, '5 gp'),
  w('quarterstaff', 'Quarterstaff', 'simple', 'melee', '1d6', 'bludgeoning', 4, '2 sp', ['versatile'], { versatile: '1d8' }),
  w('sickle', 'Sickle', 'simple', 'melee', '1d4', 'slashing', 2, '1 gp', ['light']),
  w('spear', 'Spear', 'simple', 'melee', '1d6', 'piercing', 3, '1 gp', ['thrown', 'versatile'], { range: '20/60', versatile: '1d8' }),
  w('light-crossbow', 'Light crossbow', 'simple', 'ranged', '1d8', 'piercing', 5, '25 gp', ['ammunition', 'loading', 'two-handed'], { range: '80/320' }),
  w('dart', 'Dart', 'simple', 'ranged', '1d4', 'piercing', 0.25, '5 cp', ['finesse', 'thrown'], { range: '20/60' }),
  w('shortbow', 'Shortbow', 'simple', 'ranged', '1d6', 'piercing', 2, '25 gp', ['ammunition', 'two-handed'], { range: '80/320' }),
  w('sling', 'Sling', 'simple', 'ranged', '1d4', 'bludgeoning', 0, '1 sp', ['ammunition'], { range: '30/120' }),
  w('battleaxe', 'Battleaxe', 'martial', 'melee', '1d8', 'slashing', 4, '10 gp', ['versatile'], { versatile: '1d10' }),
  w('flail', 'Flail', 'martial', 'melee', '1d8', 'bludgeoning', 2, '10 gp'),
  w('glaive', 'Glaive', 'martial', 'melee', '1d10', 'slashing', 6, '20 gp', ['heavy', 'reach', 'two-handed']),
  w('greataxe', 'Greataxe', 'martial', 'melee', '1d12', 'slashing', 7, '30 gp', ['heavy', 'two-handed']),
  w('greatsword', 'Greatsword', 'martial', 'melee', '2d6', 'slashing', 6, '50 gp', ['heavy', 'two-handed']),
  w('halberd', 'Halberd', 'martial', 'melee', '1d10', 'slashing', 6, '20 gp', ['heavy', 'reach', 'two-handed']),
  w('lance', 'Lance', 'martial', 'melee', '1d12', 'piercing', 6, '10 gp', ['reach', 'special']),
  w('longsword', 'Longsword', 'martial', 'melee', '1d8', 'slashing', 3, '15 gp', ['versatile'], { versatile: '1d10' }),
  w('maul', 'Maul', 'martial', 'melee', '2d6', 'bludgeoning', 10, '10 gp', ['heavy', 'two-handed']),
  w('morningstar', 'Morningstar', 'martial', 'melee', '1d8', 'piercing', 4, '15 gp'),
  w('pike', 'Pike', 'martial', 'melee', '1d10', 'piercing', 18, '5 gp', ['heavy', 'reach', 'two-handed']),
  w('rapier', 'Rapier', 'martial', 'melee', '1d8', 'piercing', 2, '25 gp', ['finesse']),
  w('scimitar', 'Scimitar', 'martial', 'melee', '1d6', 'slashing', 3, '25 gp', ['finesse', 'light']),
  w('shortsword', 'Shortsword', 'martial', 'melee', '1d6', 'piercing', 2, '10 gp', ['finesse', 'light']),
  w('trident', 'Trident', 'martial', 'melee', '1d6', 'piercing', 4, '5 gp', ['thrown', 'versatile'], { range: '20/60', versatile: '1d8' }),
  w('war-pick', 'War pick', 'martial', 'melee', '1d8', 'piercing', 2, '5 gp'),
  w('warhammer', 'Warhammer', 'martial', 'melee', '1d8', 'bludgeoning', 2, '15 gp', ['versatile'], { versatile: '1d10' }),
  w('whip', 'Whip', 'martial', 'melee', '1d4', 'slashing', 3, '2 gp', ['finesse', 'reach']),
  w('blowgun', 'Blowgun', 'martial', 'ranged', '1', 'piercing', 1, '10 gp', ['ammunition', 'loading'], { range: '25/100' }),
  w('hand-crossbow', 'Hand crossbow', 'martial', 'ranged', '1d6', 'piercing', 3, '75 gp', ['ammunition', 'light', 'loading'], { range: '30/120' }),
  w('heavy-crossbow', 'Heavy crossbow', 'martial', 'ranged', '1d10', 'piercing', 18, '50 gp', ['ammunition', 'heavy', 'loading', 'two-handed'], { range: '100/400' }),
  w('longbow', 'Longbow', 'martial', 'ranged', '1d8', 'piercing', 2, '50 gp', ['ammunition', 'heavy', 'two-handed'], { range: '150/600' }),
  w('net', 'Net', 'martial', 'ranged', '0', 'none', 3, '1 gp', ['special', 'thrown'], { range: '5/15' }),
];

const a = (id: string, name: string, type: ArmorDef['type'], base: number, dexCap: number | null, weight: number, cost: string, extra: Partial<ArmorDef> = {}): ArmorDef =>
  ({ id, name, type, base, dexCap, weight, cost, source: SRD, ...extra });

export const ARMOR: ArmorDef[] = [
  a('padded', 'Padded', 'light', 11, null, 8, '5 gp', { stealthDis: true }), a('leather', 'Leather', 'light', 11, null, 10, '10 gp'),
  a('studded-leather', 'Studded leather', 'light', 12, null, 13, '45 gp'),
  a('hide', 'Hide', 'medium', 12, 2, 12, '10 gp'), a('chain-shirt', 'Chain shirt', 'medium', 13, 2, 20, '50 gp'),
  a('scale-mail', 'Scale mail', 'medium', 14, 2, 45, '50 gp', { stealthDis: true }), a('breastplate', 'Breastplate', 'medium', 14, 2, 20, '400 gp'),
  a('half-plate', 'Half plate', 'medium', 15, 2, 40, '750 gp', { stealthDis: true }),
  a('ring-mail', 'Ring mail', 'heavy', 14, 0, 40, '30 gp', { stealthDis: true }), a('chain-mail', 'Chain mail', 'heavy', 16, 0, 55, '75 gp', { strReq: 13, stealthDis: true }),
  a('splint', 'Splint', 'heavy', 17, 0, 60, '200 gp', { strReq: 15, stealthDis: true }), a('plate', 'Plate', 'heavy', 18, 0, 65, '1,500 gp', { strReq: 15, stealthDis: true }),
  a('shield', 'Shield', 'shield', 2, null, 6, '10 gp'),
];

const c = (id: string, name: string, summary: string): ConditionDef => ({ id, name, summary, source: SRD });
export const CONDITIONS: ConditionDef[] = [
  c('blinded', 'Blinded', 'Cannot see; fails sight checks. Attacks against it have advantage; its attacks have disadvantage.'),
  c('charmed', 'Charmed', 'Cannot harm the charmer; charmer has advantage on social checks against it.'),
  c('deafened', 'Deafened', 'Cannot hear; fails hearing checks.'),
  c('frightened', 'Frightened', 'Disadvantage on checks and attacks while the source is in sight; cannot willingly approach it.'),
  c('grappled', 'Grappled', 'Speed becomes 0.'),
  c('incapacitated', 'Incapacitated', 'Cannot take actions or reactions.'),
  c('invisible', 'Invisible', 'Cannot be seen without aid. Its attacks have advantage; attacks against it have disadvantage.'),
  c('paralyzed', 'Paralyzed', 'Incapacitated, cannot move or speak; fails Str and Dex saves; hits from within 5 ft are critical.'),
  c('petrified', 'Petrified', 'Turned to stone; incapacitated; resistance to all damage; fails Str and Dex saves.'),
  c('poisoned', 'Poisoned', 'Disadvantage on attack rolls and ability checks.'),
  c('prone', 'Prone', 'Can only crawl; disadvantage on attacks. Melee attacks against it have advantage, ranged have disadvantage.'),
  c('restrained', 'Restrained', 'Speed 0; disadvantage on attacks and Dex saves; attacks against it have advantage.'),
  c('stunned', 'Stunned', 'Incapacitated, cannot move; fails Str and Dex saves; attacks against it have advantage.'),
  c('unconscious', 'Unconscious', 'Incapacitated, prone, unaware; fails Str and Dex saves; hits from within 5 ft are critical.'),
];

const s = (id: string, name: string, level: number, school: string, castingTime: string, range: string, components: string, duration: string, classes: string[], summary: string, extra: Partial<SpellDef> = {}): SpellDef => ({
  id, name, level, school, castingTime, range, components, duration, classes, summary,
  concentration: duration.toLowerCase().startsWith('concentration'), ritual: false, source: SRD, ...extra,
});

export const SPELLS: SpellDef[] = [
  s('acid-splash', 'Acid Splash', 0, 'Conjuration', '1 action', '60 ft', 'V, S', 'Instantaneous', ['sorcerer', 'wizard'], 'One or two adjacent creatures make a Dex save or take acid damage.', { save: 'dex', damage: '1d6', damageType: 'acid', higher: 'Damage increases at 5th, 11th and 17th level.' }),
  s('eldritch-blast', 'Eldritch Blast', 0, 'Evocation', '1 action', '120 ft', 'V, S', 'Instantaneous', ['warlock'], 'Ranged spell attack beam of force; more beams at higher levels.', { attack: 'ranged', damage: '1d10', damageType: 'force' }),
  s('fire-bolt', 'Fire Bolt', 0, 'Evocation', '1 action', '120 ft', 'V, S', 'Instantaneous', ['sorcerer', 'wizard'], 'Ranged spell attack dealing fire damage.', { attack: 'ranged', damage: '1d10', damageType: 'fire' }),
  s('guidance', 'Guidance', 0, 'Divination', '1 action', 'Touch', 'V, S', 'Concentration, up to 1 minute', ['cleric', 'druid'], 'Target adds 1d4 to one ability check.'),
  s('light', 'Light', 0, 'Evocation', '1 action', 'Touch', 'V, M', '1 hour', ['bard', 'cleric', 'sorcerer', 'wizard'], 'An object sheds bright light.', { material: 'a firefly or phosphorescent moss' }),
  s('mage-hand', 'Mage Hand', 0, 'Conjuration', '1 action', '30 ft', 'V, S', '1 minute', ['bard', 'sorcerer', 'warlock', 'wizard'], 'A spectral hand manipulates light objects.'),
  s('minor-illusion', 'Minor Illusion', 0, 'Illusion', '1 action', '30 ft', 'S, M', '1 minute', ['bard', 'sorcerer', 'warlock', 'wizard'], 'Create a small sound or image.', { material: 'a bit of fleece' }),
  s('prestidigitation', 'Prestidigitation', 0, 'Transmutation', '1 action', '10 ft', 'V, S', 'Up to 1 hour', ['bard', 'sorcerer', 'warlock', 'wizard'], 'Minor magical tricks.'),
  s('ray-of-frost', 'Ray of Frost', 0, 'Evocation', '1 action', '60 ft', 'V, S', 'Instantaneous', ['sorcerer', 'wizard'], 'Ranged spell attack; cold damage and speed reduced by 10 ft.', { attack: 'ranged', damage: '1d8', damageType: 'cold' }),
  s('sacred-flame', 'Sacred Flame', 0, 'Evocation', '1 action', '60 ft', 'V, S', 'Instantaneous', ['cleric'], 'Dex save or radiant damage; ignores cover.', { save: 'dex', damage: '1d8', damageType: 'radiant' }),
  s('shillelagh', 'Shillelagh', 0, 'Transmutation', '1 bonus action', 'Touch', 'V, S, M', '1 minute', ['druid'], 'Club or staff uses your casting ability and deals 1d8.', { material: 'mistletoe, a shamrock leaf, and a club or quarterstaff' }),
  s('thaumaturgy', 'Thaumaturgy', 0, 'Transmutation', '1 action', '30 ft', 'V', 'Up to 1 minute', ['cleric'], 'Minor wonders that signal divine power.'),
  s('vicious-mockery', 'Vicious Mockery', 0, 'Enchantment', '1 action', '60 ft', 'V', 'Instantaneous', ['bard'], 'Wis save or psychic damage and disadvantage on its next attack.', { save: 'wis', damage: '1d4', damageType: 'psychic' }),
  s('produce-flame', 'Produce Flame', 0, 'Conjuration', '1 action', 'Self', 'V, S', '10 minutes', ['druid'], 'A flame in your hand gives light and can be hurled.', { attack: 'ranged', damage: '1d8', damageType: 'fire' }),
  s('bless', 'Bless', 1, 'Enchantment', '1 action', '30 ft', 'V, S, M', 'Concentration, up to 1 minute', ['cleric', 'paladin'], 'Up to three creatures add 1d4 to attacks and saves.', { material: 'a sprinkling of holy water', higher: 'One extra target per slot level above 1st.' }),
  s('burning-hands', 'Burning Hands', 1, 'Evocation', '1 action', 'Self (15-ft cone)', 'V, S', 'Instantaneous', ['sorcerer', 'wizard'], 'Dex save for half; fire damage in a cone.', { save: 'dex', damage: '3d6', damageType: 'fire', higher: '+1d6 per slot level above 1st.' }),
  s('charm-person', 'Charm Person', 1, 'Enchantment', '1 action', '30 ft', 'V, S', '1 hour', ['bard', 'druid', 'sorcerer', 'warlock', 'wizard'], 'Wis save or a humanoid is charmed.', { save: 'wis' }),
  s('cure-wounds', 'Cure Wounds', 1, 'Evocation', '1 action', 'Touch', 'V, S', 'Instantaneous', ['bard', 'cleric', 'druid', 'paladin', 'ranger'], 'Touch heals 1d8 + casting modifier.', { higher: '+1d8 per slot level above 1st.' }),
  s('detect-magic', 'Detect Magic', 1, 'Divination', '1 action', 'Self', 'V, S', 'Concentration, up to 10 minutes', ['bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'wizard'], 'Sense magic within 30 ft.', { ritual: true }),
  s('faerie-fire', 'Faerie Fire', 1, 'Evocation', '1 action', '60 ft', 'V', 'Concentration, up to 1 minute', ['bard', 'druid'], 'Dex save or outlined; attacks against them have advantage.', { save: 'dex' }),
  s('healing-word', 'Healing Word', 1, 'Evocation', '1 bonus action', '60 ft', 'V', 'Instantaneous', ['bard', 'cleric', 'druid'], 'Heal 1d4 + casting modifier at range.', { higher: '+1d4 per slot level above 1st.' }),
  s('hellish-rebuke', 'Hellish Rebuke', 1, 'Evocation', '1 reaction', '60 ft', 'V, S', 'Instantaneous', ['warlock'], 'When damaged, the attacker makes a Dex save against fire damage.', { save: 'dex', damage: '2d10', damageType: 'fire' }),
  s('hex', 'Hex', 1, 'Enchantment', '1 bonus action', '90 ft', 'V, S, M', 'Concentration, up to 1 hour', ['warlock'], 'Extra 1d6 necrotic on your hits against the target; disadvantage on one ability.', { material: 'the petrified eye of a newt' }),
  s('hunters-mark', "Hunter's Mark", 1, 'Divination', '1 bonus action', '90 ft', 'V', 'Concentration, up to 1 hour', ['ranger'], 'Extra 1d6 damage on your weapon hits against the target.'),
  s('mage-armor', 'Mage Armor', 1, 'Abjuration', '1 action', 'Touch', 'V, S, M', '8 hours', ['sorcerer', 'wizard'], 'Unarmoured target’s base AC becomes 13 + Dex.', { material: 'a piece of cured leather' }),
  s('magic-missile', 'Magic Missile', 1, 'Evocation', '1 action', '120 ft', 'V, S', 'Instantaneous', ['sorcerer', 'wizard'], 'Three darts that automatically hit for 1d4+1 force each.', { damage: '1d4+1', damageType: 'force', higher: 'One more dart per slot level above 1st.' }),
  s('protection-from-evil-and-good', 'Protection from Evil and Good', 1, 'Abjuration', '1 action', 'Touch', 'V, S, M', 'Concentration, up to 10 minutes', ['cleric', 'paladin', 'warlock', 'wizard'], 'Protection against certain creature types.', { material: 'holy water or powdered silver and iron (consumed)' }),
  s('sanctuary', 'Sanctuary', 1, 'Abjuration', '1 bonus action', '30 ft', 'V, S, M', '1 minute', ['cleric'], 'Attackers must make a Wis save to target the warded creature.', { material: 'a small silver mirror' }),
  s('shield', 'Shield', 1, 'Abjuration', '1 reaction', 'Self', 'V, S', '1 round', ['sorcerer', 'wizard'], '+5 AC until the start of your next turn.'),
  s('sleep', 'Sleep', 1, 'Enchantment', '1 action', '90 ft', 'V, S, M', '1 minute', ['bard', 'sorcerer', 'wizard'], 'Creatures with total 5d8 HP fall asleep, lowest first.', { material: 'sand, rose petals or a cricket' }),
  s('thunderwave', 'Thunderwave', 1, 'Evocation', '1 action', 'Self (15-ft cube)', 'V, S', 'Instantaneous', ['bard', 'druid', 'sorcerer', 'wizard'], 'Con save or thunder damage and pushed 10 ft.', { save: 'con', damage: '2d8', damageType: 'thunder' }),
  s('aid', 'Aid', 2, 'Abjuration', '1 action', '30 ft', 'V, S, M', '8 hours', ['cleric', 'paladin'], 'Up to three creatures gain 5 maximum and current HP.', { material: 'a strip of white cloth' }),
  s('hold-person', 'Hold Person', 2, 'Enchantment', '1 action', '60 ft', 'V, S, M', 'Concentration, up to 1 minute', ['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'wizard'], 'Wis save or a humanoid is paralysed.', { save: 'wis', material: 'a small piece of iron' }),
  s('lesser-restoration', 'Lesser Restoration', 2, 'Abjuration', '1 action', 'Touch', 'V, S', 'Instantaneous', ['bard', 'cleric', 'druid', 'paladin', 'ranger'], 'End a disease or one of blinded, deafened, paralysed or poisoned.'),
  s('misty-step', 'Misty Step', 2, 'Conjuration', '1 bonus action', 'Self', 'V', 'Instantaneous', ['sorcerer', 'warlock', 'wizard'], 'Teleport up to 30 ft.'),
  s('scorching-ray', 'Scorching Ray', 2, 'Evocation', '1 action', '120 ft', 'V, S', 'Instantaneous', ['sorcerer', 'wizard'], 'Three rays, each a ranged spell attack for 2d6 fire.', { attack: 'ranged', damage: '2d6', damageType: 'fire' }),
  s('shatter', 'Shatter', 2, 'Evocation', '1 action', '60 ft', 'V, S, M', 'Instantaneous', ['bard', 'sorcerer', 'warlock', 'wizard'], 'Con save for half; thunder damage in a 10-ft sphere.', { save: 'con', damage: '3d8', damageType: 'thunder' }),
  s('spiritual-weapon', 'Spiritual Weapon', 2, 'Evocation', '1 bonus action', '60 ft', 'V, S', '1 minute', ['cleric'], 'Floating weapon makes melee spell attacks for 1d8 + modifier force.', { attack: 'melee', damage: '1d8', damageType: 'force' }),
  s('beacon-of-hope', 'Beacon of Hope', 3, 'Abjuration', '1 action', '30 ft', 'V, S', 'Concentration, up to 1 minute', ['cleric'], 'Advantage on Wis and death saves; healing is maximised.'),
  s('counterspell', 'Counterspell', 3, 'Abjuration', '1 reaction', '60 ft', 'S', 'Instantaneous', ['sorcerer', 'warlock', 'wizard'], 'Interrupt a creature casting a spell.'),
  s('fireball', 'Fireball', 3, 'Evocation', '1 action', '150 ft', 'V, S, M', 'Instantaneous', ['sorcerer', 'wizard'], 'Dex save for half; fire damage in a 20-ft sphere.', { save: 'dex', damage: '8d6', damageType: 'fire', material: 'bat guano and sulfur', higher: '+1d6 per slot level above 3rd.' }),
  s('fly', 'Fly', 3, 'Transmutation', '1 action', 'Touch', 'V, S, M', 'Concentration, up to 10 minutes', ['sorcerer', 'warlock', 'wizard'], 'Target gains a 60-ft flying speed.'),
  s('revivify', 'Revivify', 3, 'Necromancy', '1 action', 'Touch', 'V, S, M', 'Instantaneous', ['cleric', 'paladin'], 'Return a creature that died within the last minute to 1 HP.', { material: 'diamonds worth 300 gp (consumed)' }),
  s('spirit-guardians', 'Spirit Guardians', 3, 'Conjuration', '1 action', 'Self (15-ft radius)', 'V, S, M', 'Concentration, up to 10 minutes', ['cleric'], 'Spirits slow enemies and deal damage (Wis save for half).', { save: 'wis', damage: '3d8', damageType: 'radiant' }),
  s('banishment', 'Banishment', 4, 'Abjuration', '1 action', '60 ft', 'V, S, M', 'Concentration, up to 1 minute', ['cleric', 'paladin', 'sorcerer', 'warlock', 'wizard'], 'Cha save or the target is banished.', { save: 'cha' }),
  s('polymorph', 'Polymorph', 4, 'Transmutation', '1 action', '60 ft', 'V, S, M', 'Concentration, up to 1 hour', ['bard', 'druid', 'sorcerer', 'wizard'], 'Transform a creature into a beast.', { save: 'wis' }),
  s('cone-of-cold', 'Cone of Cold', 5, 'Evocation', '1 action', 'Self (60-ft cone)', 'V, S, M', 'Instantaneous', ['sorcerer', 'wizard'], 'Con save for half; 8d8 cold damage.', { save: 'con', damage: '8d8', damageType: 'cold' }),
  s('mass-cure-wounds', 'Mass Cure Wounds', 5, 'Evocation', '1 action', '60 ft', 'V, S', 'Instantaneous', ['bard', 'cleric', 'druid'], 'Up to six creatures heal 3d8 + modifier.'),
];
