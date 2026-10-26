// Project lint: TypeScript strict checks are run separately (npm run typecheck).
// This enforces security and quality rules that the compiler cannot.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const RULES = [
  [/\.innerHTML\s*=|insertAdjacentHTML|outerHTML\s*=/, 'Do not assign HTML strings; build DOM nodes with h().'],
  [/\beval\s*\(|new Function\s*\(/, 'Dynamic code execution is forbidden.'],
  [/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|WebSocket\(/, 'No network calls in app code (local-first).'],
  [/localStorage|sessionStorage|document\.cookie/, 'Persist through the IndexedDB repository only.'],
  [/\bTODO\b|FIXME|XXX/, 'Unfinished-work markers are not allowed.'],
  [/console\.log\(/, 'Remove debugging output.'],
  [/:\s*any\b|as any\b|<any>/, 'Avoid `any`; use explicit types.'],
  [/@ts-ignore|@ts-nocheck|eslint-disable/, 'Do not suppress checks.'],
];
const files = []; const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') && files.push(p); });
walk(new URL('../src', import.meta.url).pathname);
let problems = 0;
// Documented exception: src/content/net.ts is the single module allowed to fetch (user-initiated content downloads).
const NETWORK_ALLOWED = /[\\/]content[\\/]net\.ts$/;
for (const f of files) readFileSync(f, 'utf8').split('\n').forEach((line, i) => RULES.forEach(([re, msg]) => { if (NETWORK_ALLOWED.test(f) && /network/.test(msg)) return; if (re.test(line)) { problems++; console.error(`${f}:${i + 1}  ${msg}`); } }));
if (problems) { console.error(`\n${problems} lint problem(s).`); process.exit(1); }
console.log(`Lint passed: ${files.length} files, ${RULES.length} rules.`);
