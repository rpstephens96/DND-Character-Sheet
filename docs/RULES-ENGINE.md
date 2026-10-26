# Rules engine

All rules live in `src/rules/` and are pure functions with no DOM access.

## `compute(character, registry, settings) → Derived`

Every statistic is a `Stat`: `{ key, label, value, calculated, parts[], overridden, notes[] }`. Each `Part` is `{ label, value, source }`, which is what the “How is this calculated?” dialog and the Audit inspector display.

Order of evaluation: proficiency bonus → ability scores (base + bonuses + modifiers + set-minimum) → saves → skills → passives → AC → initiative → carrying/encumbrance → speed → HP → hit dice → spellcasting profiles and slots → attacks → resources → warnings.

## Modifiers

Small and debuggable: `{ target, op: 'add' | 'setMin', value, note }`. Sources: species, feats, applied custom content, active items (equipped, and attuned if required) and active effects/conditions. Targets include `ac`, `acBaseUnarmored`, `speed`, `initiative`, `hpMax`, `hpPerLevel`, `attack`, `damage`, `spellDC`, `spellAttack`, `save:all|str…`, `skill:<name>`, `check:all|<ability>`, `ability:<ability>`, `passive:<skill>`.

Anything that cannot be automated safely is shown as a **reminder** (for example advantage or disadvantage from conditions) rather than silently applied.

## Key rules implemented

- Proficiency bonus by **total** level; expertise ×2; Jack of All Trades (½, round down) on checks and initiative.
- AC: armour formulas with Dex caps; best-of unarmoured candidates (10+Dex, Barbarian Con, Monk Wis without shield, Draconic 13+Dex, Mage Armor); shield; magic bonuses.
- Max HP: recorded hit-die gains + Con × level, minimum 1 per level, Hill Dwarf / Draconic per-level bonuses, 2014 exhaustion 4 halving.
- Spell slots: combined caster level (full + ½ or ⅓ rounded **down** when multiclassed, rounded **up** single-classed); Pact Magic is a separate pool.
- Separate DC/attack/limits per spellcasting class; prepared limits (mod + level, or mod + ½ level).
- Damage: immunity → resistance (halve, round down) → vulnerability (double); temp HP first; damage at 0 HP adds death save failures (2 on a crit); massive damage; concentration DC = max(10, ½ damage). Resistance is **suggested**, never auto-applied; the player confirms.
- Temporary HP do not stack (keep the higher unless explicitly replaced).
- Death saves including natural 1 and natural 20.
- Rests: short (hit dice + Con, chosen short-rest resources, pact slots); long (full HP, half hit dice in 2014 / all in 2024, slots, resources, exhaustion −1).
- Exhaustion: 2014 table effects (speed halved/0, HP halved, reminders) vs 2024 (−2 × level to d20 tests, −5 ft × level).
- Multiclass prerequisites (entering *and* leaving), with labelled override.
- Level-up: planned (preview) and applied separately; unresolved choices become `pendingChoices`.

## Audit and undo

`mutate()` records changed top-level fields. `undoEvent()` only reverses if those fields still hold the values the event produced; otherwise it explains which later change conflicts. Level-ups store full snapshots and are reversed from the Timeline (latest only).
