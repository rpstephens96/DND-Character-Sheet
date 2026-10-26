# Content packs

A content pack is a single JSON file holding rules content (spells, monsters, magic items, equipment, species, backgrounds, feats, class and subclass text, class features, conditions and rules sections) plus a manifest with its licence and attribution.

## Getting the SRD content

| Pack | Rules | Source | How |
|---|---|---|---|
| `srd51` | 2014 (SRD 5.1) | [5e-database](https://github.com/5e-bits/5e-database) JSON files (archived Oct 2026, still readable) | **More → Content packs → Download SRD 5.1**, or `npm run content:srd51` |
| `srd521` | 2024 (SRD 5.2.1) | [Open5e API v2](https://open5e.com/api-docs), document `srd-2024` | **Download SRD 5.2.1**, or `npm run content:srd521` |

Downloading in the app converts the data **on the device** and stores it in IndexedDB. After that it works offline. These two sites are the only network destinations the app can reach (enforced by the CSP `connect-src` and by `npm run lint`), and only when you press the button.

Some work networks block these sites. Then either download at home, use the GitHub Actions workflow (which publishes the packs with the app), or import a pack file exported from another device.

## How packs combine with the app

- **Built-in mechanics win.** If a pack entry has the same id as built-in content (for example `fireball`, `wizard` or `hill-dwarf`), the built-in definition stays and the pack supplies the full text. Installing packs never changes an existing character's numbers (this is tested).
- **New content is added.** Spells, weapons, armour, species, backgrounds and feats with new ids become selectable in the builder, spellbook and inventory. Monsters can be added to the initiative tracker; magic items and gear can be added to an inventory.
- **2014 and 2024 side by side.** SRD 5.2.1 entries use ids prefixed `x24-` and are tagged for the 2024 ruleset. Where both packs have an entry with the same name, a 2024 character sees the 2024 version and a 2014 character the 2014 version (`preferRuleset`). The Compendium can show either version or both.
- **2024 classes** are provided as text; levelling, spell slots and resources use the built-in SRD class engine (the progression is broadly the same). 2024 background ability increases are applied by hand on the Sheet.
- **Text loads on demand.** The `packs` store holds manifests, a lightweight search index and structured definitions. Full text lives in `packText` and is read only when an entry is opened.

## File format

```json
{
  "format": "adventurers-ledger-pack",
  "formatVersion": 1,
  "manifest": {
    "id": "my-homebrew", "title": "My Homebrew", "shortName": "Homebrew", "version": "2026-10-23",
    "ruleset": "srd51 | srd521 | custom | any", "licence": "Private", "attribution": "Written by me.",
    "source": "Typed in by hand", "generatedAt": "2026-10-23T00:00:00Z"
  },
  "entries": [
    { "kind": "spell", "id": "frost-lance", "name": "Frost Lance", "meta": { "sub": "2nd-level evocation", "level": 2, "classes": ["wizard"] },
      "def": { "level": 2, "school": "Evocation", "castingTime": "1 action", "range": "90 feet", "components": "V, S", "duration": "Instantaneous",
               "concentration": false, "ritual": false, "classes": ["wizard"], "summary": "A lance of ice.", "attack": "ranged", "damage": "3d8", "damageType": "cold" },
      "text": "Your own description. **Bold**, *italic*, lists and | tables | are supported." }
  ]
}
```

- **kind**: `spell, class, subclass, feature, species, background, feat, weapon, armor, gear, magicItem, monster, condition, rule`
- **id**: lower-case letters, digits, `.`, `_`, `-`; unique per kind
- **link** (optional): the id of the built-in entry this text belongs to
- **meta** (optional): fields for lists and filters: `sub, level, school, classes, rarity, attunement, cr, type, category, classId, subclassId`
- **def** (optional): a structured definition matching the TypeScript types (`SpellDef`, `WeaponDef`, `ArmorDef`, `SpeciesDef`, `BackgroundDef`, `FeatDef`, `MonsterDef`, `MagicItemDef`, `GearDef`). Invalid definitions are dropped with a warning and the entry is kept as text.
- **text**: safe Markdown subset. HTML, `javascript:` and script-like content are rejected.

## Private packs

Material from books you own can be entered as a pack with `"licence": "Private"`. Keep these on your devices (they are included in backups when you tick *Include content packs*) and do not commit them to a public repository: `app/content/` is in `.gitignore`.

## Publishing packs with the app

`npm run content:srd51` and `npm run content:srd521` write `app/content/<id>.json` and `app/content/packs.json`. A deployed app then offers **one-tap install** on the Content packs screen without contacting third-party sites. The optional workflow `.github/workflows/pages.yml` does this automatically on every push.

Each run prints a report: entry counts, failed downloads, entries kept as text only, and skipped items. The converters were written against each source's documented format and tested with fixture files (`tests/fixtures/`). Check the report on the first real run; if a source has changed a field name, adjust `src/content/convert-*.ts`.
