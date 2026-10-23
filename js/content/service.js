import { textKey } from './types.js';
import { validatePack, toInstalled, fromInstalled } from './pack.js';
/** Install (or replace) a validated pack atomically: old text records are removed in the same transaction. */
export async function installPack(repo, pack, now = new Date().toISOString()) {
    const existing = await repo.all('packs');
    const prev = existing.find((p) => p.id === pack.manifest.id);
    const order = prev?.order ?? existing.reduce((m, p) => Math.max(m, p.order), -1) + 1;
    const { record, texts } = toInstalled(pack, order, now);
    if (prev)
        record.enabled = prev.enabled;
    const oldTexts = prev ? (await repo.byIndex('packText', 'packId', prev.id)).map((t) => t.id) : [];
    await repo.tx([{ store: 'packText', del: oldTexts }, { store: 'packText', put: texts }, { store: 'packs', put: [record] }]);
    return { replaced: !!prev, record };
}
export async function installPackText(repo, text) {
    const report = validatePack(text);
    if (!report.ok || !report.pack)
        return { report };
    return { report, result: await installPack(repo, report.pack) };
}
export async function removePack(repo, id) {
    const texts = (await repo.byIndex('packText', 'packId', id)).map((t) => t.id);
    await repo.tx([{ store: 'packText', del: texts }, { store: 'packs', del: [id] }]);
}
export async function setPackEnabled(repo, id, enabled) {
    const p = await repo.get('packs', id);
    if (!p)
        throw new Error('Pack not found.');
    await repo.put('packs', { ...p, enabled });
}
export async function exportPack(repo, id) {
    const p = await repo.get('packs', id);
    if (!p)
        throw new Error('Pack not found.');
    return JSON.stringify(fromInstalled(p, await repo.byIndex('packText', 'packId', id)));
}
export async function loadText(repo, packId, kind, id) {
    return (await repo.get('packText', textKey(packId, kind, id)))?.text ?? '';
}
