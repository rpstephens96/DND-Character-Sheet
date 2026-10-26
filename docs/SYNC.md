# Future cloud synchronisation

This release is local-only. `src/db/sync.ts` defines the seam:

```ts
interface SyncAdapter { name; isConfigured(); push(changes): { accepted, conflicts }; pull(since): SyncChange[] }
interface SyncChange { store; id; updatedAt; deleted?; payload? }
```

Every record already carries `id` and `updatedAt`. Campaign records carry `visibility` (`private` | `shared`) for future party sharing.

Requirements for any adapter:

1. **Client-side encryption** before upload (for example AES-GCM with a key derived from a user passphrase via PBKDF2/Argon2). The server stores ciphertext only.
2. Never store credentials or keys unencrypted in IndexedDB.
3. Conflict policy: last-writer-wins per record by `updatedAt`, but **never** for `events` (append-only: union). Characters in conflict should surface both versions to the user.
4. Deletions as tombstones (`deleted: true`).
5. Add the adapter’s origin to the CSP `connect-src`, and update the lint rule that forbids network calls with a single documented exception.
