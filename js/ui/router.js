// Hash router with unsaved-change protection.
import { confirmDialog } from './dom.js';
const routes = [];
let guard = null;
let current = '';
let suppress = false;
export function route(path, view, nav, title) {
    const keys = [];
    const pattern = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ pattern, keys, view, nav, title });
}
/** Register a check that returns true when there are unsaved changes on the current screen. */
export const setGuard = (fn) => { guard = fn; };
export const isDirty = () => !!guard?.();
export const go = (hash) => { location.hash = hash; };
export async function resolve(render) {
    const path = location.hash.replace(/^#/, '') || '/';
    if (suppress) {
        suppress = false;
        return;
    }
    if (guard?.() && path !== current) {
        const ok = await confirmDialog('Discard unsaved changes?', 'You have changes on this screen that have not been saved.', 'Discard changes', true);
        if (!ok) {
            suppress = true;
            location.hash = current;
            return;
        }
    }
    guard = null;
    current = path;
    for (const r of routes) {
        const m = r.pattern.exec(path);
        if (m) {
            const params = {};
            r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
            render(await r.view(params), r.nav, r.title);
            return;
        }
    }
    location.hash = '/';
}
