// Safe JSON parsing shared by every importer.
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
export const MAX_IMPORT_BYTES = 80 * 1024 * 1024;
/** JSON.parse that strips prototype-pollution keys at every depth. */
export function safeParse(text) {
    if (text.length > MAX_IMPORT_BYTES)
        throw new Error('File is larger than 80 MB and was not imported.');
    try {
        return JSON.parse(text, (k, v) => (FORBIDDEN.has(k) ? undefined : v));
    }
    catch (e) {
        throw new Error(`The file is not valid JSON: ${e.message}`);
    }
}
