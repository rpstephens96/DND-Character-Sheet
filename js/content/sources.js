// Content sources and licence notices. Change URLs here if a source moves.
export const SRD51_ATTRIBUTION = 'This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.';
export const SRD521_ATTRIBUTION = 'This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.';
/** 5e-database (archived October 2026; files remain available read-only). */
export const FIVE_E_DB_BASE = 'https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2014/en/';
export const FIVE_E_DB_FILES = {
    spells: '5e-SRD-Spells.json', magicItems: '5e-SRD-Magic-Items.json', monsters: '5e-SRD-Monsters.json', equipment: '5e-SRD-Equipment.json', conditions: '5e-SRD-Conditions.json',
    races: '5e-SRD-Races.json', subraces: '5e-SRD-Subraces.json', traits: '5e-SRD-Traits.json', backgrounds: '5e-SRD-Backgrounds.json', feats: '5e-SRD-Feats.json',
    classes: '5e-SRD-Classes.json', subclasses: '5e-SRD-Subclasses.json', features: '5e-SRD-Features.json', ruleSections: '5e-SRD-Rule-Sections.json',
};
/** Open5e API v2, filtered to the SRD 5.2 document. */
export const OPEN5E_BASE = 'https://api.open5e.com/v2/';
export const OPEN5E_DOCUMENT = 'srd-2024';
export const OPEN5E_ENDPOINTS = {
    spells: 'spells', creatures: 'creatures', magicItems: 'items', species: 'species', backgrounds: 'backgrounds', feats: 'feats', classes: 'classes', conditions: 'conditions', rules: 'rules',
};
/** Origins the app may contact, only when the user presses a download button. Mirrored in the CSP connect-src. */
export const CONTENT_ORIGINS = ['https://raw.githubusercontent.com', 'https://api.open5e.com'];
