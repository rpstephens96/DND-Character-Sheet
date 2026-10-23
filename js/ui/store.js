import { openDb, requestPersistence } from '../db/db.js';
import { memoryRepo } from '../db/memory.js';
import { buildRegistry } from '../data/registry.js';
import { compute } from '../rules/calc.js';
import { mutate, undoEvent } from '../rules/events.js';
import { validateCharacter } from '../io/importExport.js';
import { toast, announce } from './dom.js';
export const DEFAULT_SETTINGS = { id: 'settings', theme: 'system', defaultRuleset: 'srd51', hpOnLevel: 'fixed', encumbranceVariant: false, coinWeight: 50,
    attunementLimit: 3, onboarded: false, reduceMotion: false, favouriteRolls: [{ id: 'fav-d20', label: 'Plain d20', expression: '1d20' }] };
export const state = {};
const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const notify = () => listeners.forEach((f) => f());
export function setSaveState(s, msg) {
    const el = document.getElementById('save-state');
    if (!el)
        return;
    el.dataset.state = s;
    el.textContent = s === 'saving' ? 'Saving…' : s === 'saved' ? 'All changes saved' : `Not saved: ${msg ?? 'error'}`;
}
export async function init() {
    state.ephemeral = false;
    try {
        state.repo = await openDb();
    }
    catch {
        state.repo = memoryRepo();
        state.ephemeral = true;
    } // e.g. a browser that blocks storage for local files
    state.settings = { ...DEFAULT_SETTINGS, ...((await state.repo.get('settings', 'settings')) ?? {}) };
    state.custom = await state.repo.all('custom');
    state.packs = await state.repo.all('packs');
    state.registry = buildRegistry(state.custom, state.packs);
    state.characters = [];
    for (const raw of await state.repo.all('characters')) {
        if ((raw.schemaVersion ?? 1) < 2) { // migrate on load and log
            const r = validateCharacter(raw);
            if (r.character) {
                await state.repo.tx([{ store: 'characters', put: [r.character] }, { store: 'events', put: [migrationEvent(r.character, r.warnings)] }]);
                state.characters.push(r.character);
                continue;
            }
        }
        state.characters.push(raw);
    }
    state.characters.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    state.persisted = await requestPersistence();
    const act = state.settings.activeCharacterId && state.characters.find((c) => c.id === state.settings.activeCharacterId);
    setActive(act || null);
}
function migrationEvent(c, notes) {
    return { id: crypto.randomUUID(), characterId: c.id, ts: new Date().toISOString(), category: 'migration', description: notes.join(' ') || 'Schema migration', before: null, after: null, reversible: false, undone: false };
}
export function setActive(c) {
    state.active = c;
    state.derived = c ? compute(c, state.registry, state.settings) : null;
    if (c && state.settings.activeCharacterId !== c.id) {
        state.settings.activeCharacterId = c.id;
        void state.repo.put('settings', state.settings);
    }
}
export const recompute = () => { if (state.active)
    state.derived = compute(state.active, state.registry, state.settings); };
/** Apply a change to the active character with audit logging. Returns the event (or null if nothing changed). */
export async function change(category, description, fn, opts = {}) {
    const c = state.active;
    if (!c)
        throw new Error('No character selected.');
    let m;
    try {
        m = mutate(c, category, description, fn, opts);
    }
    catch (e) {
        toast(e.message, 'error');
        return null;
    }
    if (!m.event)
        return null;
    return commit(m.next, [m.event], opts.silent ? undefined : description);
}
export async function commit(next, events, message, snapshot) {
    setSaveState('saving');
    try {
        await state.repo.tx([{ store: 'characters', put: [next] }, { store: 'events', put: events }, ...(snapshot ? [{ store: 'snapshots', put: [snapshot] }] : [])]);
        const i = state.characters.findIndex((x) => x.id === next.id);
        if (i >= 0)
            state.characters[i] = next;
        else
            state.characters.unshift(next);
        if (state.active?.id === next.id || !state.active)
            setActive(next);
        setSaveState('saved');
        if (message) {
            announce(message);
            const ev = events[events.length - 1];
            toast(message, 'ok', ev?.reversible ? { label: 'Undo', run: () => void undo(ev) } : undefined);
        }
        notify();
        return events[events.length - 1] ?? null;
    }
    catch (e) {
        setSaveState('error', e.message);
        toast(`Save failed: ${e.message}`, 'error');
        return null;
    }
}
export async function undo(ev) {
    const c = state.characters.find((x) => x.id === ev.characterId);
    if (!c)
        return;
    try {
        const next = undoEvent(c, ev);
        const marker = { ...ev, undone: true };
        const log = { id: crypto.randomUUID(), characterId: c.id, ts: next.updatedAt, category: ev.category, description: `Undo: ${ev.description}`, before: ev.after, after: ev.before, reversible: false, undone: false };
        await commit(next, [marker, log], `Undone: ${ev.description}`);
    }
    catch (e) {
        toast(e.message, 'error');
    }
}
export async function saveSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    await state.repo.put('settings', state.settings);
    applyTheme();
    recompute();
    notify();
}
export async function reloadCustom() {
    state.custom = await state.repo.all('custom');
    state.packs = await state.repo.all('packs');
    state.registry = buildRegistry(state.custom, state.packs);
    recompute();
    notify();
}
export const reloadContent = reloadCustom;
export function applyTheme() {
    const t = state.settings?.theme ?? 'system';
    const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.motion = state.settings?.reduceMotion ? 'reduce' : '';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#2a211b' : '#efe4cf');
}
export const eventsFor = (id) => state.repo.byIndex('events', 'characterId', id).then((l) => l.sort((a, b) => b.ts.localeCompare(a.ts)));
export const snapshotsFor = (id) => state.repo.byIndex('snapshots', 'characterId', id).then((l) => l.sort((a, b) => b.ts.localeCompare(a.ts)));
