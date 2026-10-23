export const PACK_FORMAT = 'adventurers-ledger-pack';
export const PACK_FORMAT_VERSION = 1;
export const ENTRY_KINDS = ['spell', 'class', 'subclass', 'feature', 'species', 'background', 'feat', 'weapon', 'armor', 'gear', 'magicItem', 'monster', 'condition', 'rule'];
export const KIND_LABEL = { spell: 'Spells', class: 'Classes', subclass: 'Subclasses', feature: 'Class features', species: 'Species', background: 'Backgrounds', feat: 'Feats',
    weapon: 'Weapons', armor: 'Armour', gear: 'Gear', magicItem: 'Magic items', monster: 'Monsters', condition: 'Conditions', rule: 'Rules' };
export const textKey = (packId, kind, id) => `${packId}/${kind}/${id}`;
