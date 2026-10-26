# The Adventurer’s Ledger

A local-first, installable, offline **D&D Fifth Edition character sheet, character builder, combat assistant, spellbook, inventory manager and campaign journal**, styled as a light parchment ledger. It is designed for phone use at the table.

- **No account, server or network calls.** All data stays in your browser’s IndexedDB.
- **Every calculated number is traceable.** Tap any value to see its full breakdown and source, or apply a flagged override.
- **Every material change is audited** in an append-only history, with conflict-checked undo.
- **Your own classes, subclasses, races, backgrounds and feats.** Enter anything that is not in the free SRD under **More → My content** with structured forms (no JSON), starting from a copy of an SRD class if you like. It then works like built-in content in the builder, level-up and sheet.
- **Adjustable character sheet.** Add class features, subclass features, species traits, background features, feats or other features to any character, each with optional automatic bonuses, uses per rest, a combat action, proficiencies and spells. Optionally save them to My content so future characters get them automatically.
- **Full SRD content on demand.** Download the complete SRD 5.1 (2014) and SRD 5.2.1 (2024) content packs from inside the app: every free spell, monster, magic item, piece of equipment and rule, browsable in the **Compendium**. Add material from books you own privately (see [docs/CONTENT-PACKS.md](docs/CONTENT-PACKS.md)).

## Preview without installing anything

Run `npm run build` (or use the copy supplied with each update) and **double-click `dist/ledger-preview.html`**. It is a single self-contained file that opens in Edge or Chrome with no server. In Edge and Chrome, characters you create in the preview are kept between sessions on that computer. If a browser blocks storage for local files, the app shows a *Preview mode* banner and keeps data in memory only. Offline install and *Add to Home Screen* need the published (HTTPS) version.

To check the phone layout on a computer: press **F12**, then **Ctrl+Shift+M**, and choose a phone.

## Quick start

```bash
npm install          # installs TypeScript only (no runtime dependencies)
npm run check        # typecheck + lint + build + all tests
npm run serve        # serves ./app at http://localhost:8080
```

Without npm: `python3 -m http.server 8080 -d app`, then open http://localhost:8080.

The `app/` folder is the complete, deployable build. It is already built in this package.

## Put it on your phone

Service workers (offline mode) require **HTTPS** (or `localhost`). The simplest route:

1. Upload the contents of `app/` to any static HTTPS host (for example GitHub Pages, Netlify or Cloudflare Pages).
2. Open the URL on your phone.
3. **iPhone (Safari):** Share → *Add to Home Screen*. **Android (Chrome):** ⋮ menu → *Install app* / *Add to Home screen*.
4. Open it once while online; afterwards it works fully offline.

Your data lives on each device separately. Use **More → Backup** to move characters between devices.

## Scripts

| Command | What it does |
|---|---|
| `npm run build` | Compiles `src/` to native ES modules in `app/js`, regenerates `app/sw.js`, and builds the single-file preview `dist/ledger-preview.html` |
| `npm run content:srd51` / `content:srd521` | Downloads and converts an SRD content pack into `app/content/` so it is published with the app |
| `npm run typecheck` | `tsc --noEmit` in strict mode |
| `npm run lint` | Project rules: no HTML-string injection, `eval`, network calls, `localStorage`, `any`, suppressions or TODO markers |
| `npm test` | Rules, import/export, content packs, preview, UI smoke and UI flow tests (Node’s built-in test runner) |
| `npm run check` | All of the above, in order |

## Documentation

- [Architecture](docs/ARCHITECTURE.md): structure, data flow and the stack decision
- [Database schema & migrations](docs/SCHEMA.md)
- [Rules engine](docs/RULES-ENGINE.md)
- [Publishing to GitHub Pages (with SRD content built in)](docs/PUBLISHING.md)
- [Content packs (SRD downloads, pack format, private packs)](docs/CONTENT-PACKS.md)
- [Custom content JSON specification](docs/CUSTOM-CONTENT.md)
- [Backup & recovery](docs/BACKUP.md)
- [Testing](docs/TESTING.md)
- [Licensing & attribution](docs/LICENSING.md)
- [Future cloud sync](docs/SYNC.md)
- [Requirements compliance & known limitations](docs/COMPLIANCE.md)

## Renaming

Change the product name in `src/config.ts` (and the `<title>` and `manifest.webmanifest` name, which are static files), then run `npm run build`.
