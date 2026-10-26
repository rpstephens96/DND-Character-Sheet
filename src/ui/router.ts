// Hash router with unsaved-change protection.
import { confirmDialog } from './dom.js';

export type View = (params: Record<string, string>) => HTMLElement | Promise<HTMLElement>;
interface Route { pattern: RegExp; keys: string[]; view: View; nav: string; title: string; }
const routes: Route[] = [];
let guard: (() => boolean) | null = null;
let current = '';
let suppress = false;

export function route(path: string, view: View, nav: string, title: string): void {
  const keys: string[] = [];
  const pattern = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ pattern, keys, view, nav, title });
}

/** Register a check that returns true when there are unsaved changes on the current screen. */
export const setGuard = (fn: (() => boolean) | null) => { guard = fn; };
export const isDirty = () => !!guard?.();
export const go = (hash: string) => { location.hash = hash; };

export async function resolve(render: (el: HTMLElement, nav: string, title: string) => void): Promise<void> {
  const path = location.hash.replace(/^#/, '') || '/';
  if (suppress) { suppress = false; return; }
  if (guard?.() && path !== current) {
    const ok = await confirmDialog('Discard unsaved changes?', 'You have changes on this screen that have not been saved.', 'Discard changes', true);
    if (!ok) { suppress = true; location.hash = current; return; }
  }
  guard = null; current = path;
  for (const r of routes) {
    const m = r.pattern.exec(path);
    if (m) { const params: Record<string, string> = {}; r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]!))); render(await r.view(params), r.nav, r.title); return; }
  }
  location.hash = '/';
}
