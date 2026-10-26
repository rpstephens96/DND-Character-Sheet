// Build a content pack from the SRD sources and publish it with the app (app/content/).
//
//   node scripts/import-content.mjs srd51                 download 5e-database (2014 SRD) and convert
//   node scripts/import-content.mjs srd521                download Open5e (srd-2024) and convert
//   node scripts/import-content.mjs srd51 --from <dir>    convert local files instead of downloading
//   ... --out <dir>                                       output folder (default app/content)
//
// Run `npm run build` first: this script uses the compiled converters in app/js so the app and the
// script always convert identically. The output is a normal pack file the app can also import by hand.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const js = (p) => import(new URL(`../app/js/${p}`, import.meta.url).href);
const [, , which, ...rest] = process.argv;
const opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
if (!['srd51', 'srd521'].includes(which)) { console.error('Usage: node scripts/import-content.mjs <srd51|srd521> [--from <dir>] [--out <dir>]'); process.exit(2); }
if (!existsSync(join(root, 'app/js/content/convert-5edb.js'))) { console.error('Run `npm run build` first.'); process.exit(2); }

const { FIVE_E_DB_FILES, OPEN5E_ENDPOINTS } = await js('content/sources.js');
const { validatePack } = await js('content/pack.js');
const from = opt('--from'); const out = resolve(opt('--out') ?? join(root, 'app/content'));
const version = new Date().toISOString().slice(0, 10);
const readLocal = (file) => { const p = join(from, file); if (!existsSync(p)) { console.warn(`  missing ${file}`); return undefined; } return JSON.parse(readFileSync(p, 'utf8')); };
const progress = (m, d, t) => process.stdout.write(`\r  [${d}/${t}] ${m}`.padEnd(70));

let input, failures = [], converted;
if (which === 'srd51') {
  const { convert5eDatabase } = await js('content/convert-5edb.js');
  if (from) { input = {}; for (const [k, f] of Object.entries(FIVE_E_DB_FILES)) input[k] = readLocal(f); }
  else { const { fetch5eDatabase } = await js('content/net.js'); ({ input, failures } = await fetch5eDatabase(progress)); process.stdout.write('\n'); }
  converted = convert5eDatabase(input, version);
} else {
  const { convertOpen5e } = await js('content/convert-open5e.js');
  if (from) { input = {}; for (const [k, e] of Object.entries(OPEN5E_ENDPOINTS)) input[k] = readLocal(`${e}.json`); }
  else { const { fetchOpen5e } = await js('content/net.js'); ({ input, failures } = await fetchOpen5e(progress)); process.stdout.write('\n'); }
  converted = convertOpen5e(input, version);
}

const v = validatePack(converted.pack);
console.log(`\n${converted.pack.manifest.title}`);
console.log('  Entries:', Object.entries(v.counts).map(([k, n]) => `${k} ${n}`).join(', ') || 'none');
for (const f of failures) console.warn('  Download failed:', f);
for (const n of converted.report.notes) console.log('  Note:', n);
if (converted.report.skipped.length) console.warn(`  Skipped ${converted.report.skipped.length}:`, converted.report.skipped.slice(0, 10).join('; '));
if (v.warnings.length) console.warn(`  ${v.warnings.length} entr(ies) kept as text only, e.g.`, v.warnings.slice(0, 5).join(' | '));
if (!v.ok) { console.error('  Pack failed validation:', v.errors.slice(0, 10).join(' | ')); process.exit(1); }

mkdirSync(out, { recursive: true });
const file = `${v.pack.manifest.id}.json`;
writeFileSync(join(out, file), JSON.stringify(v.pack));
const listPath = join(out, 'packs.json');
const list = existsSync(listPath) ? JSON.parse(readFileSync(listPath, 'utf8')).filter((x) => x.id !== v.pack.manifest.id) : [];
list.push({ id: v.pack.manifest.id, file, title: v.pack.manifest.title, version: v.pack.manifest.version });
writeFileSync(listPath, JSON.stringify(list, null, 2));
console.log(`  Wrote ${join(out, file)} (${(JSON.stringify(v.pack).length / 1e6).toFixed(2)} MB) and updated packs.json.`);
