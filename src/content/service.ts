// Pack installation service: install, enable/disable, remove and export, using the app repository.
import type { PackFile, InstalledPack, PackText, EntryKind } from './types.js';
import { textKey } from './types.js';
import { validatePack, toInstalled, fromInstalled, type PackReport } from './pack.js';
import type { Repository } from '../db/db.js';

export interface InstallResult { replaced: boolean; record: InstalledPack; }

/** Install (or replace) a validated pack atomically: old text records are removed in the same transaction. */
export async function installPack(repo: Repository, pack: PackFile, now = new Date().toISOString()): Promise<InstallResult> {
  const existing = await repo.all<InstalledPack>('packs');
  const prev = existing.find((p) => p.id === pack.manifest.id);
  const order = prev?.order ?? existing.reduce((m, p) => Math.max(m, p.order), -1) + 1;
  const { record, texts } = toInstalled(pack, order, now);
  if (prev) record.enabled = prev.enabled;
  const oldTexts = prev ? (await repo.byIndex<PackText>('packText', 'packId', prev.id)).map((t) => t.id) : [];
  await repo.tx([{ store: 'packText', del: oldTexts }, { store: 'packText', put: texts }, { store: 'packs', put: [record] }]);
  return { replaced: !!prev, record };
}

export async function installPackText(repo: Repository, text: string): Promise<{ report: PackReport; result?: InstallResult }> {
  const report = validatePack(text);
  if (!report.ok || !report.pack) return { report };
  return { report, result: await installPack(repo, report.pack) };
}

export async function removePack(repo: Repository, id: string): Promise<void> {
  const texts = (await repo.byIndex<PackText>('packText', 'packId', id)).map((t) => t.id);
  await repo.tx([{ store: 'packText', del: texts }, { store: 'packs', del: [id] }]);
}

export async function setPackEnabled(repo: Repository, id: string, enabled: boolean): Promise<void> {
  const p = await repo.get<InstalledPack>('packs', id); if (!p) throw new Error('Pack not found.');
  await repo.put('packs', { ...p, enabled });
}

export async function exportPack(repo: Repository, id: string): Promise<string> {
  const p = await repo.get<InstalledPack>('packs', id); if (!p) throw new Error('Pack not found.');
  return JSON.stringify(fromInstalled(p, await repo.byIndex<PackText>('packText', 'packId', id)));
}

export async function loadText(repo: Repository, packId: string, kind: EntryKind, id: string): Promise<string> {
  return (await repo.get<PackText>('packText', textKey(packId, kind, id)))?.text ?? '';
}
