// Sample characters and campaign (SRD content and original text only). Loaded only on explicit request.
import type { Character, CharacterEvent, LevelSnapshot, Campaign, CampaignRecord } from '../types.js';
import type { Registry } from './registry.js';
import { blankDraft, buildCharacter, newItem } from '../rules/factory.js';
import { planLevelUp, applyLevelUp, type LevelUpInput } from '../rules/levelup.js';
import { compute } from '../rules/calc.js';
import { uid, nowIso, clone } from '../rules/events.js';

interface Sample { character: Character; events: CharacterEvent[]; snapshots: LevelSnapshot[]; }
const created = (c: Character, note: string): CharacterEvent => ({ id: uid(), characterId: c.id, ts: nowIso(), category: 'create', description: note, before: null, after: null, reversible: false, undone: false });

export function sampleCharacters(reg: Registry): Sample[] {
  const out: Sample[] = [];
  // 1. Level 1 martial
  let d = blankDraft('srd51');
  Object.assign(d, { name: 'Brakka Stonebrook (sample)', playerName: 'Sample', alignment: 'Lawful good', speciesId: 'hill-dwarf', backgroundId: 'acolyte', classId: 'fighter',
    abilityMethod: 'standard', base: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 }, classSkills: ['athletics', 'perception'], languages: 'Celestial, Giant',
    details: { personality: 'Speaks plainly and keeps a ledger of every debt.', backstory: 'A temple guard who left to repay an old kindness.' } });
  const f = buildCharacter(d, reg).character;
  f.inventory.push(newItem({ name: 'Potion of healing', category: 'consumable', quantity: 2, weight: 0.5, value: '50 gp', notes: 'Heals 2d4+2.' }));
  f.actions.push({ id: uid(), name: 'Second Wind', economy: 'bonus', range: 'Self', target: 'Self', attackType: 'none', proficient: false, attackBonusExtra: 0, damage: '1d10+1', damageType: 'healing', notes: 'Regain HP.', resourceId: 'second-wind', source: 'Fighter 1' });
  out.push({ character: f, events: [created(f, 'Sample character created')], snapshots: [] });

  // 2. Level 5 prepared caster
  d = blankDraft('srd51');
  Object.assign(d, { name: 'Sister Maelis (sample)', speciesId: 'half-elf', speciesAsiChoice: ['wis', 'con'], speciesSkills: ['medicine', 'persuasion'], backgroundId: 'acolyte',
    classId: 'cleric', subclassId: 'life', startLevel: 5, abilityMethod: 'pointbuy', base: { str: 10, dex: 12, con: 14, int: 8, wis: 15, cha: 13 }, classSkills: ['history', 'insight'],
    cantrips: ['sacred-flame', 'guidance', 'light'], spells: ['bless', 'cure-wounds', 'healing-word', 'aid', 'spirit-guardians'] });
  const cl = buildCharacter(d, reg).character;
  cl.pendingChoices = cl.pendingChoices.filter((p) => p.kind !== 'asi');
  cl.abilityBonuses.push({ ability: 'wis', amount: 2, source: 'ASI (Cleric 4)' });
  cl.spellcasting.slotsUsed = [1, 1];
  cl.actions.push({ id: uid(), name: 'Sacred Flame', economy: 'action', range: '60 ft', target: 'One creature', attackType: 'save', saveAbility: 'dex', proficient: false, attackBonusExtra: 0, damage: '2d8', damageType: 'radiant', notes: 'Ignores cover.', source: 'Spell' });
  out.push({ character: cl, events: [created(cl, 'Sample character created at level 5')], snapshots: [] });

  // 3. Multiclass with genuine level history: Sorcerer 3 / Warlock 2
  d = blankDraft('srd51');
  Object.assign(d, { name: 'Vex Ashcombe (sample)', speciesId: 'tiefling', backgroundId: 'acolyte', classId: 'sorcerer', subclassId: 'draconic', startLevel: 1, abilityMethod: 'standard',
    base: { str: 8, dex: 14, con: 13, int: 10, wis: 12, cha: 15 }, classSkills: ['arcana', 'deception'], cantrips: ['fire-bolt', 'mage-hand', 'prestidigitation', 'minor-illusion'], spells: ['magic-missile', 'shield'] });
  let m = buildCharacter(d, reg).character;
  const events: CharacterEvent[] = [created(m, 'Sample character created at level 1')]; const snaps: LevelSnapshot[] = [];
  const steps: LevelUpInput[] = [{ classId: 'sorcerer', hpMethod: 'fixed' }, { classId: 'sorcerer', hpMethod: 'fixed' }, { classId: 'warlock', hpMethod: 'fixed', subclassId: 'fiend' }, { classId: 'warlock', hpMethod: 'fixed' }];
  for (const inp of steps) {
    const before = clone(m); const plan = planLevelUp(m, reg, inp);
    applyLevelUp(m, reg, inp, plan); m.updatedAt = nowIso();
    snaps.push({ id: uid(), characterId: m.id, ts: m.updatedAt, fromLevel: plan.fromLevel, toLevel: plan.toLevel, classId: inp.classId, before, summary: plan.summary });
    events.push({ id: uid(), characterId: m.id, ts: m.updatedAt, category: 'level', description: plan.summary[0]!, before: null, after: null, reversible: false, undone: false });
  }
  m.spellcasting.known.push('hex', 'eldritch-blast', 'scorching-ray');
  m.hp.current = compute(m, reg).hpMax.value;
  m = { ...m };
  out.push({ character: m, events, snapshots: snaps });
  return out;
}

export function sampleCampaign(characterId: string): { campaign: Campaign; records: CampaignRecord[] } {
  const t = nowIso(); const id = uid();
  const campaign: Campaign = { id, name: 'The Saltmarsh Ledger (sample)', dm: 'Sample DM', setting: 'A fog-bound coastal barony', summary: 'Smugglers, a drowned chapel and a missing tax ledger.', startDate: t.slice(0, 10), worldDate: '3rd of Harvestmoon', party: 'Brakka, Maelis, Vex', sharedFunds: '120 gp in the party chest', tags: ['sample'], createdAt: t, updatedAt: t };
  const rec = (kind: CampaignRecord['kind'], title: string, body: string, extra: Partial<CampaignRecord> = {}): CampaignRecord => ({ id: uid(), campaignId: id, kind, title, body, tags: [], links: [], pinned: false, status: '', date: '', visibility: 'shared', objectives: [], createdAt: t, updatedAt: t, ...extra });
  const npc = rec('npc', 'Harbourmaster Odell', 'Nervous, owes money to [[The Grey Tide]].\n- Knows the tide tables\n- Hides a key on a chain');
  const loc = rec('location', 'Drowned Chapel', 'Half-flooded at high tide. Smugglers use the crypt.');
  const fac = rec('faction', 'The Grey Tide', 'Smuggling ring. Leader unknown.');
  const quest = rec('quest', 'Recover the tax ledger', 'Lady Venn wants the ledger returned quietly. See [[Harbourmaster Odell]].', { status: 'Active', objectives: [{ id: uid(), text: 'Find who took the ledger', done: true }, { id: uid(), text: 'Search the [[Drowned Chapel]] crypt', done: false }] });
  npc.links = [loc.id, fac.id, quest.id];
  const session = rec('session', 'Session 1: Fog on the Quay', '# Summary\nWe met **Harbourmaster Odell** and learned of the [[Drowned Chapel]].\n- [x] Speak to Odell\n- [ ] Buy rope\n\n# Loot\n- 30 gp, a brass key', { date: t.slice(0, 10), pinned: true, links: [npc.id, loc.id, quest.id] });
  void characterId;
  return { campaign, records: [session, npc, loc, fac, quest] };
}
