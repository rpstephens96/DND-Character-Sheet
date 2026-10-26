// Content packs: download SRD content, import/export pack files, enable/disable and remove.
import type { InstalledPack, PackFile } from '../../content/types.js';
import { KIND_LABEL, type EntryKind } from '../../content/types.js';
import { h, btn, card, toast, confirmDialog, download, readFile, empty, link, modal, fill } from '../dom.js';
import { state, reloadContent, saveSettings } from '../store.js';
import { pageHeader } from '../components.js';
import { installPack, installPackText, removePack, setPackEnabled, exportPack } from '../../content/service.js';
import { validatePack, type PackReport } from '../../content/pack.js';
import { fetch5eDatabase, fetchOpen5e, fetchBundledList, fetchBundledPack } from '../../content/net.js';
import { convert5eDatabase, type ConvertReport } from '../../content/convert-5edb.js';
import { convertOpen5e } from '../../content/convert-open5e.js';

const countLine = (c: Partial<Record<EntryKind, number>> | undefined) => Object.entries(c ?? {}).filter(([, n]) => n).map(([k, n]) => `${n} ${KIND_LABEL[k as EntryKind].toLowerCase()}`).join(' · ') || 'No entries';

export async function packsView(): Promise<HTMLElement> {
  const packs = [...state.packs].sort((a, b) => a.order - b.order);
  const bundled = await fetchBundledList();
  const status = h('div', { class: 'download-status', 'aria-live': 'polite', role: 'status' });
  let busy = false;

  const runDownload = async (label: string, job: () => Promise<{ pack: PackFile; report: ConvertReport; failures: string[] }>) => {
    if (busy) return; busy = true;
    const bar = h('progress', { max: '1', value: '0', 'aria-label': `${label} progress` });
    const msg = h('p', null, `Starting ${label}…`);
    fill(status, h('div', { class: 'notice' }, msg, bar));
    try {
      const { pack, report, failures } = await job();
      msg.textContent = 'Checking and installing…';
      const v = validatePack(pack);
      if (!v.ok || !v.pack) throw new Error(v.errors.slice(0, 3).join(' ') || 'The converted pack failed validation.');
      await installPack(state.repo, v.pack); await unmarkRemoved(v.pack.manifest.id); await reloadContent();
      fill(status, reportBox(`${label} installed`, v, report, failures));
      toast(`${v.pack.manifest.shortName} installed: ${v.pack.entries.length} entries.`);
    } catch (e) {
      fill(status, h('div', { class: 'notice notice-warn' }, h('strong', null, `${label} failed. `), (e as Error).message,
        h('p', null, 'Check your internet connection. Some work networks block these sites; try at home, or import a pack file instead.')));
    } finally { busy = false; }
  };
  const progress = (bar: () => HTMLProgressElement | null) => (m: string, done: number, total: number) => { const b = bar(); if (b) { b.max = total; b.value = done; } const p = status.querySelector('p'); if (p) p.textContent = m; };
  const barOf = () => status.querySelector('progress') as HTMLProgressElement | null;

  return h('div', { class: 'page' }, pageHeader('Content packs', 'Rules content available to the builder, spellbook, inventory and compendium'),
    state.ephemeral ? h('p', { class: 'notice notice-warn' }, 'Preview mode: this browser is not allowing storage for this file, so installed packs disappear when you close the page.') : null,
    card('Get SRD content',
      h('p', null, 'Download the complete free System Reference Document content and convert it on this device. This is the only time the app connects to the internet, and only to the sites named below.'),
      h('div', { class: 'pack-sources' },
        h('div', { class: 'pack-source' }, h('h3', null, '2014 rules: SRD 5.1'), h('p', { class: 'hint' }, 'All SRD spells, monsters, magic items, equipment, species, class features and rules. From 5e-database (raw.githubusercontent.com), about 5 MB.'),
          btn(state.packs.some((p) => p.id === 'srd51') ? 'Update SRD 5.1' : 'Download SRD 5.1', () => void runDownload('SRD 5.1', async () => {
            const { input, failures } = await fetch5eDatabase(progress(barOf));
            if (!Object.keys(input).length) throw new Error(failures.join('; ') || 'Nothing could be downloaded.');
            return { ...convert5eDatabase(input, new Date().toISOString().slice(0, 10)), failures };
          }), 'btn btn-primary')),
        h('div', { class: 'pack-source' }, h('h3', null, '2024 rules: SRD 5.2.1'), h('p', { class: 'hint' }, 'The revised spells, species, backgrounds, feats, monsters and class text. From the Open5e API (api.open5e.com).'),
          btn(state.packs.some((p) => p.id === 'srd521') ? 'Update SRD 5.2.1' : 'Download SRD 5.2.1', () => void runDownload('SRD 5.2.1', async () => {
            const { input, failures } = await fetchOpen5e(progress(barOf));
            if (!Object.keys(input).length) throw new Error(failures.join('; ') || 'Nothing could be downloaded.');
            return { ...convertOpen5e(input, new Date().toISOString().slice(0, 10)), failures };
          }), 'btn btn-primary'))),
      status),
    bundled.length ? card('Packs published with this app', h('ul', { class: 'rec-list' }, bundled.map((b) => h('li', null, h('span', null, `${b.title} (${b.version})`),
      btn(state.packs.some((p) => p.id === b.id && p.manifest.version === b.version) ? 'Installed' : 'Install', async () => {
        try { const { report, result } = await installPackText(state.repo, await fetchBundledPack(b.file)); if (!result) return void toast(report.errors[0] ?? 'Pack is invalid.', 'error'); await unmarkRemoved(b.id); await reloadContent(); toast(`${b.title} installed.`); }
        catch (e) { toast((e as Error).message, 'error'); }
      }, 'btn btn-small'))))) : null,
    card('Installed packs', packs.length ? h('ul', { class: 'pack-list' }, packs.map((p) => packRow(p))) : empty('No packs installed yet. Only the small built-in SRD set is available.'),
      h('div', { class: 'row wrap' }, btn('Import pack file…', () => void importPackFile(), 'btn'), link('#/compendium', 'Open compendium', 'btn btn-ghost'))),
    card('Your own content', h('p', null, 'Material from books you own can be added privately in My content, or as a pack file you create (format in docs/CONTENT-PACKS.md). Private packs stay on this device and in your backups; do not publish them.')));
}

function packRow(p: InstalledPack): HTMLElement {
  const m = p.manifest;
  return h('li', { class: `pack${p.enabled ? '' : ' disabled'}` },
    h('div', { class: 'pack-head' }, h('strong', null, m.title), h('span', { class: 'badge' }, m.ruleset === 'srd521' ? '2024' : m.ruleset === 'srd51' ? '2014' : m.ruleset), h('span', { class: 'badge badge-src' }, m.licence), !p.enabled ? h('span', { class: 'badge badge-warn' }, 'Disabled') : null),
    h('p', { class: 'hint' }, `${countLine(m.counts)} · version ${m.version} · ${m.source}`),
    h('details', null, h('summary', null, 'Licence and attribution'), h('p', { class: 'small-print' }, m.attribution)),
    h('div', { class: 'row wrap' },
      btn(p.enabled ? 'Disable' : 'Enable', async () => { await setPackEnabled(state.repo, p.id, !p.enabled); await reloadContent(); toast(`${m.shortName} ${p.enabled ? 'disabled' : 'enabled'}.`); }, 'btn btn-small'),
      btn('Export pack file', async () => { download(`${p.id}-${m.version}.ledger-pack.json`, await exportPack(state.repo, p.id)); }, 'btn btn-small btn-ghost'),
      btn('Remove', async () => {
        const used = state.characters.filter((c) => [...c.spellcasting.known, ...c.spellcasting.prepared].some((id) => p.index.some((e) => e.id === id && e.kind === 'spell' && !e.link)) || p.index.some((e) => (e.id === c.speciesId && e.kind === 'species') || (e.id === c.backgroundId && e.kind === 'background')));
        if (!(await confirmDialog(`Remove ${m.shortName}?`, used.length ? `Used by ${used.map((c) => c.name).join(', ')}. Those characters will show missing-content warnings until it is reinstalled.` : 'You can download or import it again later.', 'Remove', true))) return;
        await removePack(state.repo, p.id); await saveSettings({ removedPacks: [...new Set([...(state.settings.removedPacks ?? []), p.id])] }); await reloadContent(); toast(`${m.shortName} removed. It will not be reinstalled automatically.`);
      }, 'btn btn-small btn-ghost danger-text')));
}

async function importPackFile(): Promise<void> {
  const text = await readFile('.json,application/json'); if (!text) return;
  let report: PackReport;
  try { report = validatePack(text); } catch (e) { return void toast((e as Error).message, 'error'); }
  if (!report.ok || !report.pack) return void modal('Pack not imported', reportBox('Problems found', report));
  const pack = report.pack;
  const existing = state.packs.find((p) => p.id === pack.manifest.id);
  if (!(await confirmDialog(`Install ${pack.manifest.title}?`, h('div', null, h('p', null, countLine(report.counts)), h('p', { class: 'hint' }, `${pack.manifest.licence}. ${pack.manifest.source}`),
    existing ? h('p', { class: 'notice' }, `Replaces the installed version ${existing.manifest.version}.`) : null, report.warnings.length ? h('p', { class: 'hint' }, `${report.warnings.length} warning(s); affected entries are kept as text only.`) : null), 'Install'))) return;
  try { await installPack(state.repo, pack); await unmarkRemoved(pack.manifest.id); await reloadContent(); toast(`${pack.manifest.shortName} installed.`); } catch (e) { toast((e as Error).message, 'error'); }
}

function reportBox(title: string, v: PackReport, conv?: ConvertReport, failures: string[] = []): HTMLElement {
  return h('div', { class: `notice ${v.ok && !failures.length ? 'notice-ok' : 'notice-warn'}` }, h('strong', null, title), h('p', null, countLine(v.counts)),
    failures.length ? h('div', null, h('p', null, 'Some downloads failed; the rest was installed:'), h('ul', null, failures.map((f) => h('li', null, f)))) : null,
    v.errors.length ? h('details', { open: true }, h('summary', null, `${v.errors.length} error(s)`), h('ul', null, v.errors.slice(0, 30).map((e) => h('li', null, e)))) : null,
    v.warnings.length || conv?.skipped.length ? h('details', null, h('summary', null, `${v.warnings.length + (conv?.skipped.length ?? 0)} item(s) kept as text only or skipped`), h('ul', null, [...v.warnings, ...(conv?.skipped ?? [])].slice(0, 60).map((e) => h('li', null, e)))) : null,
    conv?.notes.length ? h('ul', { class: 'hint' }, conv.notes.map((n) => h('li', null, n))) : null);
}

const unmarkRemoved = async (id: string) => { if (state.settings.removedPacks?.includes(id)) await saveSettings({ removedPacks: state.settings.removedPacks.filter((x) => x !== id) }); };

/**
 * Install the packs published with the app (app/content/packs.json) on first start, and update them when a newer
 * version is published. Packs the user removed are left alone. Silent if offline or none are published.
 */
export async function autoInstallBundled(): Promise<string[]> {
  const list = await fetchBundledList();
  const removed = new Set(state.settings.removedPacks ?? []); const done: string[] = [];
  for (const b of list) {
    if (removed.has(b.id)) continue;
    const cur = state.packs.find((p) => p.id === b.id);
    if (cur && cur.manifest.version >= b.version) continue;
    try { const { result } = await installPackText(state.repo, await fetchBundledPack(b.file)); if (result) done.push(result.record.manifest.shortName); }
    catch { /* offline or not published: try again next start */ }
  }
  if (done.length) await reloadContent();
  return done;
}
