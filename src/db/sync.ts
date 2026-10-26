// Future cloud synchronisation seam. Not active in this release: the app is local-first and makes no network calls.
// A sync adapter must encrypt client-side before upload (e.g. AES-GCM with a user-held key) and never store secrets in IndexedDB unencrypted.
import type { StoreName } from './db.js';

export interface SyncChange { store: StoreName; id: string; updatedAt: string; deleted?: boolean; payload?: unknown; }
export interface SyncAdapter {
  readonly name: string;
  isConfigured(): boolean;
  push(changes: SyncChange[]): Promise<{ accepted: string[]; conflicts: SyncChange[] }>;
  pull(since: string): Promise<SyncChange[]>;
}

/** Default adapter: does nothing. Present so the UI and data layer can be written against the interface today. */
export const NoSync: SyncAdapter = { name: 'Local only', isConfigured: () => false, push: async () => ({ accepted: [], conflicts: [] }), pull: async () => [] };
