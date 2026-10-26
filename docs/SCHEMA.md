# Database schema

IndexedDB database `adventurers-ledger` (name in `src/config.ts`). All keys are stable UUIDs.

| Store | Key | Indexes | Contents |
|---|---|---|---|
| `characters` | `id` | — | `Character` (inputs and choices only; see `src/types.ts`) |
| `events` | `id` | `characterId` | Append-only `CharacterEvent` audit records with before/after values |
| `snapshots` | `id` | `characterId` | `LevelSnapshot`: full character before each level-up, for safe reversal |
| `custom` | `id` | — | `CustomContent` entries |
| `campaigns` | `id` | — | `Campaign` |
| `records` | `id` | `campaignId` | `CampaignRecord`: sessions, NPCs, locations, factions, quests, notes, clues, decisions, debts, downtime |
| `encounters` | `id` | — | Initiative `Encounter` with participants |
| `rolls` | `id` | `ts` | `RollRecord`, with every individual die |
| `settings` | `id` (`'settings'`) | — | App settings |
| `drafts` | `id` (`'wizard'`) | — | Autosaved character-creation draft |
| `meta` | `id` | — | Reserved for sync metadata |
| `packs` | `id` | — | `InstalledPack`: manifest, enabled flag, search index and structured definitions (v3) |
| `packText` | `id` (`pack/kind/entry`) | `packId` | Full Markdown text of pack entries, loaded on demand (v3) |

## Two kinds of migration

1. **Database structure** (`MIGRATIONS` in `src/db/db.ts`): one function per IndexedDB version (currently 3; v3 added `packs` and `packText`). Released migrations are never edited; new ones are appended.
2. **Record schema** (`migrateCharacter` in `src/io/importExport.ts`): upgrades `character.schemaVersion` on load and on import. Each migration on load writes a `migration` audit event. Current schema: **2** (v1 → v2 added `pendingChoices` and `dashboardPanels`).

Records from a newer schema are kept as-is with a warning; unknown fields are preserved.
