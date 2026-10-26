# Requirements compliance checklist

✅ done · ◐ done with a stated limitation · ✗ not done

| Area | Status | Notes |
|---|---|---|
| Installable PWA, offline, local-first | ✅ | Manifest, icons, generated service worker; no account or server |
| Preferred stack | ◐ | Fallback used (no package install possible); see ARCHITECTURE.md |
| Ruleset packages 2014 / 2024 / custom | ◐ | 2024 mode changes core rule behaviour; 2024-specific content must be added as custom content |
| SRD-only content + CC BY 4.0 attribution | ✅ | About screen and LICENSING.md |
| Custom content for all 25 listed categories | ✅ | Structured editors for spell/weapon/armour/species/background/subclass/feat; class via validated JSON; others via description + modifiers/resources/actions |
| Origin labelling (SRD / user / imported / homebrew) | ✅ | |
| Mobile-first from 320 px, safe areas, bottom nav, 44 px targets | ✅ | Not verified on a physical device in this environment |
| Rustic parchment design, light default, dark leather mode | ✅ | CSS-generated texture; system serif fonts; no external assets |
| WCAG 2.2 AA practices | ◐ | Semantic HTML, labels, focus styles, native dialogs, aria-live, reduced motion. Not audited with a screen reader |
| Full data model and stable UUIDs | ✅ | `src/types.ts`, SCHEMA.md |
| Schema versioning and migrations | ✅ | DB and record migrations, migration events |
| Character profile fields | ✅ | Including companions, defences, senses, speeds, portrait |
| Customisable dashboard panels | ✅ | |
| 12-step wizard, autosaved, previews, overrides | ✅ | Standard array, point buy, 4d6 roll (all dice shown), manual, custom |
| Start above level 1, duplication, import, manual sheet editing | ✅ | Templates: duplicate a sample or an existing character |
| Level-up workflow, before/after, snapshots, reversal | ✅ | Reversal is limited to the latest level-up |
| Multiclassing incl. pact and separate profiles | ✅ | |
| Central calculation engine with breakdowns everywhere | ✅ | Tap any stat; Audit shows every value |
| Overrides never silent | ✅ | Flagged, logged and warned |
| Recalculation inspector | ✅ | |
| Combat dashboard and all listed controls | ✅ | |
| Initiative tracker | ✅ | Ties broken by Dex; delay, readied, duplicates, DM notes |
| Dice roller | ✅ | CSPRNG with unbiased sampling; manual physical dice entry |
| Attacks and actions | ✅ | Weapons auto-generated; custom actions editor |
| Spellbook and casting workflow | ✅ | Upcast dice are not auto-scaled (shown as guidance) |
| Inventory, containers, attunement, encumbrance, item history | ✅ | |
| Rests with preview and undo | ✅ | |
| Conditions/effects engine | ✅ | Ambiguous effects are reminders |
| Campaigns, cross-links, search, journal | ✅ | Safe Markdown subset; autosave |
| Backup, restore, integrity, duplicate handling, print | ✅ | PDF via the browser’s Print → Save as PDF |
| Append-only audit with safe undo | ✅ | |
| Security & privacy items | ✅ | CSP, no innerHTML/eval/network (lint-enforced), safe import |
| Tests | ◐ | 38 passing; UI tests use a DOM shim (no browser available) |
| Documentation | ✅ | |

## Update 1.1 (content packs and preview)

| Item | Status | Notes |
|---|---|---|
| Content-pack system (manifest, validation, install, enable/disable, remove, export, backup) | ✅ | |
| Full SRD 5.1 and SRD 5.2.1 content, downloaded on demand | ◐ | Converters tested against fixture files only; first live run should be checked |
| Compendium with search, filters, full text, add to inventory / learn / add to combat | ✅ | |
| 2014/2024 duplicate handling | ✅ | |
| Import script and optional publishing workflow | ✅ | |
| Single-file preview | ✅ | Edge/Chrome; no offline install from a file |

## Update 1.2 (your own content and adjustable sheet)

| Item | Status | Notes |
|---|---|---|
| Structured forms for classes, subclasses, species, backgrounds, feats | ✅ | Class editor replaces raw JSON |
| Start from a copy of existing content | ✅ | |
| Custom content is fully playable (builder, level-up, slots, resources, ASIs, feature bonuses) | ✅ | Tested to level 5 with a custom half-caster class and subclass |
| Add / edit / remove class, subclass, species, background, feat and other features on the sheet with mechanics | ✅ | |
| Save sheet features to My content for future characters | ✅ | |
| SRD packs installed automatically when published with the app | ✅ | Needs the GitHub Actions publishing route (docs/PUBLISHING.md) |

## Known limitations

1. **Content breadth:** the full SRD 5.1 and 5.2.1 can be downloaded as packs, but the SRD has one subclass per class and none of the non-SRD book content. That is a licensing constraint; use private packs or Custom content for books you own.
2. **2024 rules:** behavioural differences (exhaustion, hit-dice recovery, Heroic Inspiration naming) are implemented. 2024 class and species changes are not bundled.
3. **Automation boundaries:** advantage/disadvantage, feature-specific triggers (for example Sneak Attack dice, Smite, Rage damage) and upcast dice scaling are reminders or custom actions, not automatic.
4. **Fighting styles, invocations, metamagic** are recorded as features and choices. Their mechanics apply only if you create custom content with modifiers.
5. **Untested in a real browser here:** layout, IndexedDB, service worker and assistive technology need a manual check on your devices.
6. **No cloud sync**; transfer between devices is by backup file.
7. **PDF** relies on the browser’s print-to-PDF.
