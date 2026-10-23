// Application entry: shell, navigation, routes and service-worker registration.
import { APP_CONFIG } from './config.js';
import { h, clear, link, toast } from './ui/dom.js';
import { state, init, subscribe, applyTheme, setSaveState } from './ui/store.js';
import { route, resolve, isDirty } from './ui/router.js';
import { libraryView } from './ui/views/library.js';
import { wizardView } from './ui/views/wizard.js';
import { dashboardView, sheetView } from './ui/views/character.js';
import { featuresView, levelUpView, timelineView, auditView } from './ui/views/progression.js';
import { combatView, initiativeView, diceView } from './ui/views/combat.js';
import { spellsView } from './ui/views/spells.js';
import { inventoryView } from './ui/views/inventory.js';
import { campaignsView, campaignView, recordView } from './ui/views/campaign.js';
import { contentView, contentEditView } from './ui/views/content.js';
import { dataView, settingsView, aboutView, moreView, printView } from './ui/views/data.js';
const NAV = [
    { key: 'character', label: 'Character', icon: '📜' }, { key: 'combat', label: 'Combat', icon: '⚔' }, { key: 'spells', label: 'Spells', icon: '✦' },
    { key: 'inventory', label: 'Inventory', icon: '🎒' }, { key: 'campaign', label: 'Campaign', icon: '⚑' }, { key: 'more', label: 'More', icon: '☰' },
];
function navHref(key) {
    const id = state.active?.id;
    switch (key) {
        case 'character': return id ? `#/c/${id}` : '#/';
        case 'combat': return id ? `#/c/${id}/combat` : '#/';
        case 'spells': return id ? `#/c/${id}/spells` : '#/';
        case 'inventory': return id ? `#/c/${id}/inventory` : '#/';
        case 'campaign': return state.active?.campaignId ? `#/campaign/${state.active.campaignId}` : '#/campaigns';
        default: return '#/more';
    }
}
function shell() {
    const app = document.getElementById('app');
    clear(app);
    const title = h('span', { class: 'top-title' }, APP_CONFIG.name);
    const main = h('main', { id: 'main', tabindex: '-1' });
    const nav = h('nav', { class: 'bottom-nav', 'aria-label': 'Primary' });
    app.append(h('a', { href: '#main', class: 'skip-link', on: { click: (e) => { e.preventDefault(); main.focus(); } } }, 'Skip to content'), h('header', { class: 'topbar' }, link('#/', h('span', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, '❦'), title)), h('span', { id: 'save-state', class: 'save-state', role: 'status', 'data-state': 'saved' }, 'All changes saved')), main, nav, h('div', { id: 'roll-tray', class: 'roll-tray', 'aria-live': 'polite' }), h('div', { id: 'toasts', class: 'toasts' }), h('div', { id: 'live', class: 'visually-hidden', 'aria-live': 'polite', role: 'status' }));
    return { main, nav, title };
}
function drawNav(nav, active) {
    clear(nav);
    nav.append(...NAV.map((n) => h('a', { href: navHref(n.key), class: `nav-item${active === n.key ? ' active' : ''}`, 'aria-current': active === n.key ? 'page' : undefined }, h('span', { class: 'nav-icon', 'aria-hidden': 'true' }, n.icon), h('span', { class: 'nav-label' }, n.label))));
}
async function start() {
    applyTheme();
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    const { main, nav } = shell();
    try {
        await init();
    }
    catch (e) {
        main.append(h('div', { class: 'page' }, h('h1', null, 'The ledger could not open'), h('p', null, e.message), h('p', null, 'Private browsing modes sometimes block local storage. Try a normal window.')));
        return;
    }
    applyTheme();
    route('/', () => libraryView(), 'character', 'Characters');
    route('/new', () => wizardView(), 'character', 'New character');
    route('/c/:id', (p) => dashboardView(p), 'character', 'Character');
    route('/c/:id/sheet', (p) => sheetView(p), 'character', 'Sheet');
    route('/c/:id/features', (p) => featuresView(p), 'character', 'Features');
    route('/c/:id/levelup', (p) => levelUpView(p), 'character', 'Level up');
    route('/c/:id/timeline', (p) => timelineView(p), 'character', 'Timeline');
    route('/c/:id/audit', (p) => auditView(p), 'character', 'Audit');
    route('/c/:id/combat', (p) => combatView(p), 'combat', 'Combat');
    route('/c/:id/spells', (p) => spellsView(p), 'spells', 'Spellbook');
    route('/c/:id/inventory', (p) => inventoryView(p), 'inventory', 'Inventory');
    route('/initiative', () => initiativeView(), 'combat', 'Initiative');
    route('/dice', () => diceView(), 'more', 'Dice');
    route('/campaigns', () => campaignsView(), 'campaign', 'Campaigns');
    route('/campaign/:id', (p) => campaignView(p), 'campaign', 'Campaign');
    route('/campaign/:id/:tab', (p) => campaignView(p), 'campaign', 'Campaign');
    route('/record/:id', (p) => recordView(p), 'campaign', 'Record');
    route('/content', () => contentView(), 'more', 'Custom content');
    route('/content/new/:cat', (p) => contentEditView(p), 'more', 'New content');
    route('/content/edit/:id', (p) => contentEditView(p), 'more', 'Edit content');
    route('/data', () => dataView(), 'more', 'Backup');
    route('/settings', () => settingsView(), 'more', 'Settings');
    route('/about', () => aboutView(), 'more', 'About');
    route('/more', () => moreView(), 'more', 'More');
    route('/print/:id', (p) => printView(p), 'character', 'Print');
    let lastPath = '';
    const render = (el, navKey, title) => {
        const path = location.hash;
        const keepScroll = path === lastPath ? window.scrollY : 0;
        clear(main);
        main.append(el);
        drawNav(nav, navKey);
        document.title = `${title} · ${APP_CONFIG.name}`;
        document.body.classList.toggle('printing', path.startsWith('#/print'));
        window.scrollTo(0, keepScroll);
        if (path !== lastPath)
            main.focus({ preventScroll: true });
        lastPath = path;
    };
    const go = () => void resolve(render).catch((e) => { toast(`Something went wrong: ${e.message}`, 'error'); console.error(e); });
    window.addEventListener('hashchange', go);
    // Re-render on data changes, except when a form has unsaved edits (it would discard them).
    subscribe(() => { if (!isDirty())
        go(); });
    window.addEventListener('beforeunload', (e) => { if (isDirty()) {
        e.preventDefault();
        e.returnValue = '';
    } });
    window.addEventListener('error', (e) => setSaveState('error', e.message));
    go();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register('./sw.js').then((reg) => {
            reg.addEventListener('updatefound', () => { const w = reg.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller)
                toast('An update is ready.', 'ok', { label: 'Reload', run: () => location.reload() }); }); });
        }).catch(() => toast('Offline mode is unavailable in this browser.', 'warn'));
    }
}
void start();
