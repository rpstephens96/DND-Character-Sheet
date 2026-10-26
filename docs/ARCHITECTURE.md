# Architecture

## Stack decision

The brief preferred React, Vite, Dexie, Zustand, Zod, Tailwind, Vitest and Playwright, with a fallback to "the closest suitable alternative" if the environment lacked them. The build environment had TypeScript and Node but no package installation, so the app uses:

| Preferred | Used | Why it is equivalent |
|---|---|---|
| React | Typed DOM builder `h()` (`src/ui/dom.ts`) + view functions | Declarative views; user content is only ever inserted as text nodes (XSS-safe by construction) |
| Vite | `tsc` → native ES modules, `scripts/build.mjs` | Browsers load modules directly; no bundler needed |
| Dexie | Thin promise wrapper over IndexedDB (`src/db/db.ts`) | Versioned migrations, indexes, atomic multi-store transactions |
| Zustand | `src/ui/store.ts` (state + subscribe/notify) | Single store; every character change goes through `change()` |
| React Hook Form + Zod | `field()`/`showErrors()` + hand-written validators (`validateDraft`, `validateCharacter`, `validateCustom`) | Required markers, inline errors, summary, focus first invalid |
| Tailwind | `app/styles.css` with CSS variables | Theme tokens for light/dark |
| Vitest | `node --test` | Same assertions, zero dependencies |
| Playwright | DOM-shim UI tests (`tests/support/minidom.mjs`) | Renders every route and clicks every control; see TESTING.md for limits |
| vite-plugin-pwa | Generated `app/sw.js` + `manifest.webmanifest` | Cache-first shell, hashed versioning, update prompt |

Migrating to React/Vite later is straightforward because **all rules logic is DOM-free** (`src/rules`, `src/io`, `src/data`) and already unit-tested.

## Folder structure

```
src/
  config.ts              Product name, versions (single place to rename)
  types.ts               Domain types (stored records hold inputs/choices only)
  app.ts                 Shell, routes, bottom navigation, service-worker registration
  data/                  SRD content packages, sample data, content registry
  rules/                 Pure rules engine: calc, dice, spell slots, combat, rests, level-up, factory, events
  io/                    Import/export, validation, migrations, integrity hashing, safe JSON parsing
  content/               Content packs: types, validation, install service, SRD converters, sources, network (the only module allowed to fetch)
  db/                    IndexedDB repository + migrations; in-memory fallback; sync interface
  ui/                    DOM helpers, store, router, markdown, shared components
  ui/views/              Screens (library, wizard, character, progression, combat, spells, inventory, campaign, content, data)
app/                     Deployable PWA (index.html, styles.css, manifest, icons, sw.js, compiled js/, optional content/ packs)
dist/ledger-preview.html Single-file preview (generated)
tests/                   Rules, IO, UI smoke and UI flow tests (+ DOM shim)
scripts/                 build and lint
docs/                    This documentation
```

## Single-file preview

`scripts/build.mjs` also compiles the same sources with TypeScript's AMD `outFile` mode into one bundle, wraps it in a 15-line module loader, and inlines it with the CSS and icon into `dist/ledger-preview.html`. The preview's CSP allows only that exact script and stylesheet (SHA-256 hashes) and the two content origins. If IndexedDB is unavailable, the store falls back to `src/db/memory.ts` and the UI shows a *Preview mode* banner. `tests/preview.test.mjs` checks the hashes and starts the preview in the DOM shim.

## Data flow

1. A view reads `state.active` and `state.derived` (from `compute()`).
2. A user action calls `change(category, description, draftFn)`.
3. `mutate()` clones the character, applies `draftFn`, diffs top-level fields, and produces an audit event with before/after values.
4. `commit()` writes the character and event in **one IndexedDB transaction**, recomputes derived values, updates the save indicator, announces via `aria-live`, and offers Undo.
5. Subscribers re-render the current route, unless a form has unsaved edits.

Derived statistics are **never stored**; they are recomputed from inputs, so they cannot drift. Manual overrides are stored separately in `character.overrides` and flagged everywhere.

## Security

- CSP in `index.html`: `default-src 'self'`, no inline scripts or style attributes, `object-src 'none'`.
- No `innerHTML`; enforced by `npm run lint`.
- Imports are parsed with a reviver that strips `__proto__`/`constructor`/`prototype`, are validated and conformed to the schema, reject script-like strings, and accept only `data:image/*` portraits.
- No analytics and no secrets stored. Network access is limited to `src/content/net.ts` (lint-enforced), runs only when the user presses a download button, and can only reach the two content sources in the CSP `connect-src`.
- IndexedDB is not encrypted; the About screen says so.
