// The only module allowed to make network requests (see scripts/lint.mjs). Requests happen only when the user
// presses a download button, and only to the origins listed in CONTENT_ORIGINS (enforced by the CSP).
import { FIVE_E_DB_BASE, FIVE_E_DB_FILES, OPEN5E_BASE, OPEN5E_DOCUMENT, OPEN5E_ENDPOINTS } from './sources.js';
import type { FiveEDbInput } from './convert-5edb.js';
import type { Open5eInput } from './convert-open5e.js';
import { safeParse } from '../io/safe.js';

export type Progress = (message: string, done: number, total: number) => void;
type J = Record<string, unknown>;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${new URL(url).host}`);
  return safeParse(await res.text());
}

export async function fetch5eDatabase(progress: Progress = () => {}): Promise<{ input: FiveEDbInput; failures: string[] }> {
  const keys = Object.keys(FIVE_E_DB_FILES) as (keyof typeof FIVE_E_DB_FILES)[];
  const input: FiveEDbInput = {}; const failures: string[] = [];
  let done = 0;
  for (const k of keys) {
    progress(`Downloading ${FIVE_E_DB_FILES[k]}`, done, keys.length);
    try { const data = await getJson(FIVE_E_DB_BASE + FIVE_E_DB_FILES[k]); input[k] = Array.isArray(data) ? (data as J[]) : []; }
    catch (e) { failures.push(`${FIVE_E_DB_FILES[k]}: ${(e as Error).message}`); }
    progress(`Downloaded ${FIVE_E_DB_FILES[k]}`, ++done, keys.length);
  }
  return { input, failures };
}

export async function fetchOpen5e(progress: Progress = () => {}): Promise<{ input: Open5eInput; failures: string[] }> {
  const keys = Object.keys(OPEN5E_ENDPOINTS) as (keyof typeof OPEN5E_ENDPOINTS)[];
  const input: Open5eInput = {}; const failures: string[] = [];
  let done = 0;
  for (const k of keys) {
    const results: J[] = [];
    let url: string | null = `${OPEN5E_BASE}${OPEN5E_ENDPOINTS[k]}/?document__key=${OPEN5E_DOCUMENT}&limit=500${k === 'magicItems' ? '&is_magic_item=true' : ''}`;
    try {
      for (let page = 1; url && page <= 40; page++) {
        progress(`Downloading ${OPEN5E_ENDPOINTS[k]} (page ${page})`, done, keys.length);
        const body = await getJson(url) as J;
        if (Array.isArray(body.results)) results.push(...(body.results as J[]));
        url = typeof body.next === 'string' && body.next.startsWith(OPEN5E_BASE) ? body.next : null;
      }
      input[k] = results;
    } catch (e) { failures.push(`${OPEN5E_ENDPOINTS[k]}: ${(e as Error).message}`); }
    progress(`Downloaded ${OPEN5E_ENDPOINTS[k]}`, ++done, keys.length);
  }
  return { input, failures };
}

/** Same-origin bundled packs published with the app (app/content/packs.json). Returns [] if none. */
export async function fetchBundledList(): Promise<{ id: string; file: string; title: string; version: string }[]> {
  if (location.protocol === 'file:') return [];
  try { const l = await getJson('content/packs.json'); return Array.isArray(l) ? (l as { id: string; file: string; title: string; version: string }[]).filter((x) => typeof x.file === 'string' && /^[\w.-]+\.json$/.test(x.file)) : []; }
  catch { return []; }
}
export async function fetchBundledPack(file: string): Promise<string> {
  if (!/^[\w.-]+\.json$/.test(file)) throw new Error('Invalid pack file name.');
  const res = await fetch(`content/${file}`, { credentials: 'omit' }); if (!res.ok) throw new Error(`Could not load ${file}.`); return res.text();
}
