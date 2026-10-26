// Short and long rest planning. Plans are previewed, then applied to a draft inside mutate().
import type { Character } from '../types.js';
import type { Derived } from './calc.js';

export interface ShortRestPlan { hitDiceRolls: { die: string; roll: number; con: number; healed: number }[]; totalHealed: number; resourcesRecovered: string[]; pactRecovered: boolean; newHp: number; }

export function planShortRest(c: Character, d: Derived, rolls: { die: string; roll: number }[], recoverIds?: string[]): ShortRestPlan {
  const available: Record<string, number> = {}; d.hitDice.forEach((h) => (available[h.die] = h.total - h.used));
  const hitDiceRolls = rolls.map((r) => {
    if (!available[r.die]) throw new Error(`No ${r.die} hit dice remaining.`);
    available[r.die]!--;
    const sides = Number(r.die.slice(1));
    if (!Number.isInteger(r.roll) || r.roll < 1 || r.roll > sides) throw new Error(`A ${r.die} roll must be from 1 to ${sides}.`);
    return { die: r.die, roll: r.roll, con: d.mods.con, healed: Math.max(0, r.roll + d.mods.con) };
  });
  const totalHealed = hitDiceRolls.reduce((s, x) => s + x.healed, 0);
  const eligible = d.resources.filter((r) => r.recovery === 'short' && r.used > 0);
  const resourcesRecovered = eligible.filter((r) => !recoverIds || recoverIds.includes(r.id)).map((r) => r.id);
  return { hitDiceRolls, totalHealed, resourcesRecovered, pactRecovered: d.pact.used > 0, newHp: Math.min(d.hpMax.value, c.hp.current + totalHealed) };
}

export function applyShortRest(dr: Character, plan: ShortRestPlan): void {
  if (dr.hp.current > 0 || plan.totalHealed > 0) dr.hp.current = plan.newHp;
  for (const r of plan.hitDiceRolls) dr.hitDiceUsed[r.die] = (dr.hitDiceUsed[r.die] ?? 0) + 1;
  for (const id of plan.resourcesRecovered) setUsed(dr, id, 0);
  if (plan.pactRecovered) dr.spellcasting.pactUsed = 0;
  dr.spellcasting.freeCasts.forEach((f) => { if (f.recovery === 'short') f.used = 0; });
  dr.inventory.forEach((i) => { if (i.charges?.recovery === 'short') i.charges.current = i.charges.max; });
}

export interface LongRestPlan { hpRestored: number; hitDiceRecovered: Record<string, number>; resources: string[]; slots: boolean; exhaustionAfter: number; clearTemp: boolean; endEffects: string[]; }

/** 2014 (SRD 5.1): regain up to half total hit dice (min 1). 2024 (SRD 5.2.1): regain all hit dice. Exhaustion drops by 1 in both. */
export function planLongRest(c: Character, d: Derived, endEffectIds: string[] = []): LongRestPlan {
  const totalDice = d.hitDice.reduce((s, h) => s + h.total, 0);
  let budget = c.ruleset === 'srd521' ? totalDice : Math.max(1, Math.floor(totalDice / 2));
  const hitDiceRecovered: Record<string, number> = {};
  for (const h of d.hitDice) { const n = Math.min(h.used, budget); if (n > 0) { hitDiceRecovered[h.die] = n; budget -= n; } }
  return { hpRestored: d.hpMax.value - c.hp.current, hitDiceRecovered, resources: d.resources.filter((r) => r.used > 0).map((r) => r.id), slots: true,
    exhaustionAfter: Math.max(0, c.exhaustion - 1), clearTemp: c.hp.temp > 0, endEffects: endEffectIds };
}

export function applyLongRest(dr: Character, d: Derived, plan: LongRestPlan): void {
  if (dr.deathSaves.dead) throw new Error('A dead character cannot benefit from a long rest.');
  dr.hp.current = d.hpMax.value; dr.hp.temp = 0;
  for (const [die, n] of Object.entries(plan.hitDiceRecovered)) dr.hitDiceUsed[die] = Math.max(0, (dr.hitDiceUsed[die] ?? 0) - n);
  for (const id of plan.resources) setUsed(dr, id, 0);
  dr.spellcasting.slotsUsed = []; dr.spellcasting.pactUsed = 0;
  dr.spellcasting.freeCasts.forEach((f) => { if (f.recovery !== 'none') f.used = 0; });
  dr.inventory.forEach((i) => { if (i.charges && i.charges.recovery !== 'none') i.charges.current = i.charges.max; });
  dr.exhaustion = plan.exhaustionAfter;
  dr.deathSaves = { successes: 0, failures: 0, stable: false, dead: false };
  dr.effects = dr.effects.filter((e) => !plan.endEffects.includes(e.id));
  dr.reactionUsed = false;
}

export function setUsed(dr: Character, id: string, used: number): void {
  const r = dr.resources.find((x) => x.id === id);
  if (r) r.used = used; else dr.resources.push({ id, name: id, max: 0, used, recovery: 'long', source: 'class' });
}
