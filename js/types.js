// Domain types for The Adventurer's Ledger.
// Stored records contain *inputs and choices*; derived statistics are always
// recomputed by the rules engine (src/rules/calc.ts) so they never drift.
export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
