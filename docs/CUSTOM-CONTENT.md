# My content (custom content)

**More → My content** is where anything that is not in the free SRD is entered: classes, subclasses, species (races), backgrounds, feats, spells, items, invocations, rules and so on. Entries are private to the device; use *Export all* / *Import JSON* to move them between devices or keep a backup.

## Structured forms

| Category | Form |
|---|---|
| Class | Hit die; subclass level and name; unarmoured defence; primary abilities; saves; armour, weapon and tool proficiencies; skill choices; multiclass requirements and proficiencies; caster type, spellcasting ability, how spells are chosen, prepared limit; a **level 1–20 table** (Ability Score Improvement levels, cantrips known, spells known); **features by level** with an optional automatic bonus; **limited-use resources** (uses per level, a fixed number, or a formula such as `abilityMod:wis`); starting equipment |
| Subclass | Parent class; optional spellcasting (third or half caster); features by class level with optional bonus; spells always prepared by level; resources |
| Species | Size, speed, darkvision, languages, skills, resistances, weapon proficiencies; fixed ability increases and/or a player choice (e.g. two abilities +1); traits |
| Background | Skills, tools, language choices, equipment, feature |
| Feat | Ability increases, plus bonuses, resources, proficiencies, spells and actions in the shared sections |

**Start from a copy of…** copies an existing class, subclass, species, background or feat (including SRD and content-pack ones) so only the differences need entering. Copied resources get new ids, so the copy and the original never share usage counters.

## Features on the character sheet

On a character's **Features** screen, the buttons *+ Class feature, + Subclass feature, + Species trait, + Background feature, + Feat, + Other feature* add a feature with a name, description and optional mechanics: automatic bonuses (shown in every calculation breakdown), limited uses with a fixed number or a formula, a combat action, proficiencies and spells always prepared. Features are grouped by source and can be edited or removed. Removing a feature also removes everything it added, but keeps a proficiency or spell another source also grants. Every change is recorded in the audit history with undo.

Ticking **Also save to My content** creates a library entry (`classFeature`, `subclassFeature`, `speciesTrait`, `backgroundFeature` or `feat`). Characters of that class or subclass receive it automatically at the stated level, and characters of that species or background at creation. A character never receives the same library entry twice.

# Custom content JSON specification

Custom content is exported and imported inside the standard export envelope:

```json
{
  "format": "adventurers-ledger-export",
  "appVersion": "1.0.0",
  "schemaVersion": 2,
  "exportedAt": "2026-10-23T17:00:00.000Z",
  "kind": "content",
  "rulesets": [],
  "integrity": { "algorithm": "SHA-256", "digest": "<hex of JSON.stringify(data)>" },
  "data": { "characters": [], "events": [], "snapshots": [], "custom": [ /* entries */ ], "campaigns": [], "records": [], "encounters": [] }
}
```

## Entry

```json
{
  "id": "custom-ring-of-warding",
  "category": "magicItem",
  "name": "Ring of Warding",
  "rulesets": ["srd51", "srd521"],
  "origin": "homebrew",
  "sourceLabel": "My table",
  "version": 1,
  "enabled": true,
  "description": "Your own summary.",
  "notes": "",
  "prerequisites": "",
  "levelRequirement": 0,
  "modifiers": [{ "target": "ac", "op": "add", "value": 1, "note": "Ring" }, { "target": "save:all", "op": "add", "value": 1 }],
  "resources": [{ "id": "warding-charges", "name": "Warding", "recovery": "long", "formula": "abilityMod:wis" }],
  "proficiencies": ["skill:insight", "language:Celestial"],
  "spellAdditions": ["shield"],
  "actions": [],
  "data": null
}
```

- **category**: `class, subclass, species, background, feat, spell, equipment, weapon, armor, tool, language, condition, classFeature, subclassFeature, speciesTrait, backgroundFeature, invocation, fightingStyle, metamagic, transformation, companion, magicItem, monster, resource, rule`.
- **origin**: `user` (from a book you own), `homebrew`, `imported`. Imports are re-labelled `imported`.
- **resources**: `formula` is `abilityMod:<ab>`, `1+abilityMod:<ab>`, `level` or `level*5`; or use `byLevel` (20 numbers; `null` = unavailable, `-1` = unlimited).
- **Structural categories** (`class, subclass, species, background, spell, weapon, armor, condition, feat`) put the full definition in `data`, matching the TypeScript interfaces in `src/types.ts` (`ClassDef`, `SubclassDef`, `SpeciesDef` and so on). They then appear in the builder, level-up and spellbook like SRD content.

Minimal subclass `data`: `{ "classId": "fighter", "features": [{ "level": 3, "name": "Feature", "summary": "…" }], "casterType": "third", "spellAbility": "int" }`

Validation rejects unknown categories, invalid modifier operations, non-numeric values, malformed class/spell data and script-like strings. An entry with the same `id` is replaced only if the imported `version` is greater than or equal to the existing one.
