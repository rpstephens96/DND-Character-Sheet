import { ABILITIES } from '../types.js';
import { byId } from '../data/registry.js';
import { SKILLS } from '../data/srd-classes.js';
import { combinedCasterLevel, pactSlots, slotsForCasterLevel } from './spellslots.js';
export const abilityMod = (score) => Math.floor((score - 10) / 2);
export const proficiencyBonus = (level) => 2 + Math.floor((Math.max(1, Math.min(20, level)) - 1) / 4);
export const totalLevel = (c) => c.classes.reduce((s, x) => s + x.level, 0);
export const ABILITY_NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
function mkStat(key, label, parts, overrides, notes = []) {
    const calculated = parts.reduce((s, p) => s + p.value, 0);
    const ov = overrides[key];
    const overridden = typeof ov === 'number' && Number.isFinite(ov);
    return { key, label, value: overridden ? ov : calculated, calculated, parts, overridden, notes };
}
/** Collect every modifier active on the character with its source label. */
export function collectModifiers(c, reg) {
    const out = [];
    const push = (mods, source) => mods?.forEach((m) => out.push({ ...m, source }));
    const sp = byId(reg.species, c.speciesId);
    if (sp)
        push(sp.modifiers, `Species: ${sp.name}`);
    for (const fid of c.feats) {
        const ft = byId(reg.feats, fid);
        if (ft)
            push(ft.modifiers, `Feat: ${ft.name}`);
    }
    for (const gid of c.grants) {
        const g = byId(reg.custom, gid);
        if (g)
            push(g.modifiers, `${g.sourceLabel || 'Custom'}: ${g.name}`);
    }
    for (const it of c.inventory)
        if (itemActive(it))
            push(it.modifiers, `Item: ${it.name}`);
    for (const e of c.effects) {
        push(e.modifiers, `Effect: ${e.name}`);
        if (e.conditionId) {
            const cd = byId(reg.conditions, e.conditionId);
            if (cd)
                push(cd.modifiers, `Condition: ${cd.name}`);
        }
    }
    return out;
}
export const itemActive = (it) => it.equipped && (!it.requiresAttunement || it.attuned);
function modParts(mods, targets) {
    return mods.filter((m) => m.op === 'add' && targets.includes(m.target)).map((m) => ({ label: m.note || m.target, value: m.value, source: m.source }));
}
export function resourceMax(def, classLevel, mods) {
    if (def.byLevel) {
        const v = def.byLevel[Math.min(20, classLevel) - 1];
        return v === undefined ? null : v;
    }
    if (def.formula) {
        const m = /^(1\+)?abilityMod:(\w{3})$/.exec(def.formula);
        if (m)
            return Math.max(1, (m[1] ? 1 : 0) + mods[m[2]]);
        if (def.formula === 'level')
            return classLevel;
        if (def.formula === 'level*5')
            return classLevel * 5;
    }
    return null;
}
export function hasProficiency(c, kind, name) {
    const n = name.toLowerCase();
    return c.proficiencies.some((p) => p.kind === kind && (p.name.toLowerCase() === n || p.name.toLowerCase() === n + 's'));
}
export function compute(c, reg, settings) {
    const warnings = [];
    const reminders = [];
    const ov = c.overrides || {};
    const mods = collectModifiers(c, reg);
    const lvl = totalLevel(c);
    const ruleset = c.ruleset;
    const classDefs = c.classes.map((cl) => ({ cl, def: byId(reg.classes, cl.classId) }));
    classDefs.forEach(({ cl, def }) => { if (!def)
        warnings.push(`Class “${cl.classId}” is not in the content library (missing or disabled custom content).`); });
    const classLevel = (id) => c.classes.find((x) => x.classId === id)?.level ?? 0;
    // Proficiency bonus
    const pb = mkStat('pb', 'Proficiency bonus', [{ label: `Total character level ${lvl}`, value: proficiencyBonus(lvl), source: 'Level table' }], ov);
    // Ability scores
    const abilities = {};
    const am = {};
    for (const ab of ABILITIES) {
        const parts = [{ label: `Base score (${c.abilityMethod || 'manual'})`, value: c.baseAbilities[ab], source: 'Character creation' }];
        for (const b of c.abilityBonuses.filter((x) => x.ability === ab))
            parts.push({ label: 'Bonus', value: b.amount, source: b.source });
        parts.push(...modParts(mods, [`ability:${ab}`]));
        if ((ab === 'str' || ab === 'con') && classLevel('barbarian') >= 20)
            parts.push({ label: 'Primal Champion (max 24)', value: 4, source: 'Barbarian 20' });
        const notes = [];
        let total = parts.reduce((s, p) => s + p.value, 0);
        for (const m of mods.filter((x) => x.op === 'setMin' && x.target === `ability:${ab}`)) {
            if (m.value > total) {
                parts.push({ label: `Set to ${m.value} (${m.note || 'item'})`, value: m.value - total, source: m.source });
                total = m.value;
            }
        }
        const st = mkStat(`ability:${ab}`, ABILITY_NAMES[ab], parts, ov, notes);
        abilities[ab] = st;
        am[ab] = abilityMod(st.value);
    }
    const setMinTargets = mods.filter((m) => m.op === 'setMin').map((m) => m.target);
    new Set(setMinTargets.filter((t, i) => setMinTargets.indexOf(t) !== i)).forEach((t) => warnings.push(`Several “set minimum” modifiers target ${t}; only the highest applies.`));
    const exh = c.exhaustion;
    const exh2024 = ruleset === 'srd521' && exh > 0 ? [{ label: `Exhaustion ${exh} (−2 per level)`, value: -2 * exh, source: 'Condition: Exhaustion' }] : [];
    if (ruleset !== 'srd521' && exh >= 1)
        reminders.push('Exhaustion 1+: disadvantage on ability checks.');
    if (ruleset !== 'srd521' && exh >= 3)
        reminders.push('Exhaustion 3+: disadvantage on attack rolls and saving throws.');
    if (exh >= 6)
        warnings.push('Exhaustion level 6: the character dies.');
    // Saving throws
    const auraLevel = classLevel('paladin');
    const saves = {};
    for (const ab of ABILITIES) {
        const prof = hasProficiency(c, 'save', ab);
        const parts = [{ label: `${ABILITY_NAMES[ab]} modifier`, value: am[ab], source: 'Ability score' }];
        if (prof)
            parts.push({ label: 'Proficiency', value: pb.value, source: 'Saving throw proficiency' });
        if (auraLevel >= 6)
            parts.push({ label: 'Aura of Protection (Cha, min +1)', value: Math.max(1, am.cha), source: 'Paladin 6' });
        parts.push(...modParts(mods, [`save:${ab}`, 'save:all']), ...exh2024);
        saves[ab] = { ...mkStat(`save:${ab}`, `${ABILITY_NAMES[ab]} save`, parts, ov), proficient: prof };
    }
    // Skills
    const joat = classLevel('bard') >= 2;
    const skills = {};
    for (const [skill, ab] of Object.entries(SKILLS)) {
        const prof = hasProficiency(c, 'skill', skill);
        const exp = hasProficiency(c, 'expertise', skill);
        const parts = [{ label: `${ABILITY_NAMES[ab]} modifier`, value: am[ab], source: 'Ability score' }];
        if (exp)
            parts.push({ label: 'Expertise (proficiency × 2)', value: pb.value * 2, source: 'Expertise' });
        else if (prof)
            parts.push({ label: 'Proficiency', value: pb.value, source: 'Skill proficiency' });
        else if (joat)
            parts.push({ label: 'Jack of All Trades (½ proficiency, round down)', value: Math.floor(pb.value / 2), source: 'Bard 2' });
        parts.push(...modParts(mods, [`skill:${skill}`, 'check:all', `check:${ab}`]), ...exh2024);
        skills[skill] = { ...mkStat(`skill:${skill}`, cap(skill), parts, ov), ability: ab, proficient: prof || exp, expertise: exp };
    }
    const passive = (sk, key) => mkStat(`passive:${key}`, `Passive ${cap(key)}`, [{ label: 'Base', value: 10, source: 'Rules' }, { label: `${cap(sk)} bonus`, value: skills[sk].value, source: 'Skill' }, ...modParts(mods, [`passive:${key}`])], ov);
    const passives = { perception: passive('perception', 'perception'), investigation: passive('investigation', 'investigation'), insight: passive('insight', 'insight') };
    // Armour Class
    const equippedArmor = c.inventory.filter((i) => i.equipped && i.category === 'armor');
    const equippedShield = c.inventory.filter((i) => i.equipped && i.category === 'shield');
    if (equippedArmor.length > 1)
        warnings.push('More than one suit of armour is equipped; only the first is used.');
    if (equippedShield.length > 1)
        warnings.push('More than one shield is equipped; only the first is used.');
    const armorItem = equippedArmor[0];
    const shieldItem = equippedShield[0];
    const armorDef = armorItem ? byId(reg.armor, armorItem.armorId) : undefined;
    if (armorItem && !armorDef)
        warnings.push(`Armour “${armorItem.name}” has no linked armour definition; it does not affect AC.`);
    const acParts = [];
    const acNotes = [];
    if (armorDef) {
        acParts.push({ label: `${armorDef.name} base`, value: armorDef.base, source: `Item: ${armorItem.name}` });
        if (armorDef.dexCap !== 0) {
            const dex = armorDef.dexCap === null ? am.dex : Math.min(am.dex, armorDef.dexCap);
            acParts.push({ label: armorDef.dexCap === null ? 'Dexterity modifier' : `Dexterity modifier (max ${armorDef.dexCap})`, value: dex, source: 'Ability score' });
        }
        if (armorItem.magicBonus)
            acParts.push({ label: 'Magic bonus', value: armorItem.magicBonus, source: `Item: ${armorItem.name}` });
        if (!hasProficiency(c, 'armor', armorDef.type))
            warnings.push(`Not proficient with ${armorDef.type} armour: disadvantage on Str/Dex rolls and no spellcasting.`);
        if (armorDef.stealthDis)
            reminders.push(`${armorDef.name}: disadvantage on Stealth checks.`);
    }
    else {
        const candidates = [{ label: 'Unarmoured (10 + Dex)', base: 10, source: 'Rules' }];
        for (const { cl, def } of classDefs)
            if (def?.unarmoredDefense)
                candidates.push({ label: `Unarmored Defense (10 + Dex + ${def.unarmoredDefense.toUpperCase()})`, base: 10, ab2: def.unarmoredDefense, source: `${def.name} ${cl.level}`, noShield: def.id === 'monk' });
        if (c.classes.some((x) => x.subclassId === 'draconic'))
            candidates.push({ label: 'Draconic Resilience (13 + Dex)', base: 13, source: 'Draconic Bloodline' });
        for (const m of mods.filter((x) => x.target === 'acBaseUnarmored'))
            candidates.push({ label: `${m.note || 'Base AC'} (${m.value} + Dex)`, base: m.value, source: m.source });
        const scored = candidates.filter((k) => !(k.noShield && shieldItem)).map((k) => ({ k, v: k.base + am.dex + (k.ab2 ? am[k.ab2] : 0) }));
        scored.sort((x, y) => y.v - x.v);
        const best = scored[0].k;
        acParts.push({ label: best.label.split(' (')[0] + ' base', value: best.base, source: best.source }, { label: 'Dexterity modifier', value: am.dex, source: 'Ability score' });
        if (best.ab2)
            acParts.push({ label: `${ABILITY_NAMES[best.ab2]} modifier`, value: am[best.ab2], source: best.source });
        if (scored.length > 1)
            acNotes.push(`Best of: ${scored.map((s) => `${s.k.label} = ${s.v}`).join('; ')}`);
    }
    if (shieldItem) {
        const sd = byId(reg.armor, shieldItem.armorId) ?? { base: 2 };
        acParts.push({ label: 'Shield', value: sd.base, source: `Item: ${shieldItem.name}` });
        if (shieldItem.magicBonus)
            acParts.push({ label: 'Shield magic bonus', value: shieldItem.magicBonus, source: `Item: ${shieldItem.name}` });
        if (!hasProficiency(c, 'armor', 'shield'))
            warnings.push('Not proficient with shields.');
    }
    acParts.push(...modParts(mods, ['ac']));
    const ac = mkStat('ac', 'Armour Class', acParts, ov, acNotes);
    // Initiative
    const initParts = [{ label: 'Dexterity modifier', value: am.dex, source: 'Ability score' }];
    if (joat)
        initParts.push({ label: 'Jack of All Trades', value: Math.floor(pb.value / 2), source: 'Bard 2' });
    initParts.push(...modParts(mods, ['initiative', 'check:all', 'check:dex']), ...exh2024);
    const initiative = mkStat('initiative', 'Initiative', initParts, ov);
    // Carrying and encumbrance
    const coinsPerLb = settings?.coinWeight ?? 50;
    const coinCount = c.currency.cp + c.currency.sp + c.currency.ep + c.currency.gp + c.currency.pp;
    const wParts = [{ label: 'Inventory items', value: round2(c.inventory.reduce((s, i) => s + i.weight * i.quantity, 0)), source: 'Inventory' }];
    if (coinsPerLb > 0)
        wParts.push({ label: `Coins (${coinCount} at ${coinsPerLb} per lb)`, value: round2(coinCount / coinsPerLb), source: 'Settings' });
    const weight = mkStat('weight', 'Carried weight (lb)', wParts, {});
    weight.value = round2(weight.value);
    const str = abilities.str.value;
    const capacity = str * 15;
    let enc = weight.value > capacity ? 'over' : 'none';
    if (settings?.encumbranceVariant)
        enc = weight.value > str * 10 ? (weight.value > capacity ? 'over' : 'heavily') : weight.value > str * 5 ? 'encumbered' : enc;
    if (enc === 'over')
        warnings.push(`Carrying ${weight.value} lb exceeds capacity of ${capacity} lb.`);
    // Speed
    const sp = byId(reg.species, c.speciesId);
    if (c.speciesId && !sp)
        warnings.push(`Species “${c.speciesId}” is not in the content library.`);
    const spParts = [{ label: 'Species base speed', value: c.speeds.walk ?? sp?.speed ?? 30, source: sp ? `Species: ${sp.name}` : 'Manual' }];
    const noHeavyArmor = !(armorDef?.type === 'heavy');
    if (classLevel('barbarian') >= 5 && noHeavyArmor)
        spParts.push({ label: 'Fast Movement', value: 10, source: 'Barbarian 5' });
    const monk = classLevel('monk');
    if (monk >= 2 && !armorDef && !shieldItem)
        spParts.push({ label: 'Unarmored Movement', value: monk >= 18 ? 30 : monk >= 14 ? 25 : monk >= 10 ? 20 : monk >= 6 ? 15 : 10, source: `Monk ${monk}` });
    if (armorDef?.strReq && str < armorDef.strReq && c.speciesId !== 'hill-dwarf')
        spParts.push({ label: `Heavy armour without Str ${armorDef.strReq}`, value: -10, source: `Item: ${armorItem.name}` });
    if (enc === 'encumbered')
        spParts.push({ label: 'Encumbered (variant)', value: -10, source: 'Encumbrance' });
    if (enc === 'heavily')
        spParts.push({ label: 'Heavily encumbered (variant)', value: -20, source: 'Encumbrance' });
    spParts.push(...modParts(mods, ['speed']));
    if (ruleset === 'srd521' && exh > 0)
        spParts.push({ label: `Exhaustion ${exh} (−5 ft per level)`, value: -5 * exh, source: 'Condition: Exhaustion' });
    let subtotal = spParts.reduce((s, p) => s + p.value, 0);
    if (ruleset !== 'srd521' && exh >= 2 && exh < 5) {
        spParts.push({ label: 'Exhaustion 2+: speed halved', value: -Math.ceil(subtotal / 2), source: 'Condition: Exhaustion' });
        subtotal = Math.floor(subtotal / 2);
    }
    const zeroSpeed = c.effects.filter((e) => ['grappled', 'restrained', 'paralyzed', 'stunned', 'unconscious', 'petrified'].includes(e.conditionId ?? ''));
    if (zeroSpeed.length || (ruleset !== 'srd521' && exh >= 5))
        spParts.push({ label: `Speed 0 (${zeroSpeed.map((e) => e.name).join(', ') || 'Exhaustion 5'})`, value: -subtotal, source: 'Conditions' });
    const speed = mkStat('speed', 'Speed (ft)', spParts, ov);
    if (speed.value < 0)
        speed.value = 0;
    // Hit points
    const hpParts = [];
    let clamp = 0;
    for (const { cl, def } of classDefs) {
        const gains = cl.hpGains.slice(0, cl.level);
        if (gains.length < cl.level)
            warnings.push(`${def?.name ?? cl.classId}: hit-point gains recorded for ${gains.length} of ${cl.level} levels.`);
        hpParts.push({ label: `${def?.name ?? cl.classId} hit dice (${gains.join(' + ') || 0})`, value: gains.reduce((s, g) => s + g, 0), source: `Class levels` });
        for (const g of gains)
            if (g + am.con < 1)
                clamp += 1 - (g + am.con);
    }
    hpParts.push({ label: `Constitution modifier × ${lvl} levels`, value: am.con * lvl, source: 'Ability score' });
    if (clamp)
        hpParts.push({ label: 'Minimum 1 HP per level', value: clamp, source: 'Rules' });
    for (const m of mods.filter((x) => x.op === 'add' && x.target === 'hpPerLevel'))
        hpParts.push({ label: `${m.note || 'Per-level bonus'} × ${lvl}`, value: m.value * lvl, source: m.source });
    const draconic = c.classes.find((x) => x.subclassId === 'draconic');
    if (draconic)
        hpParts.push({ label: `Draconic Resilience × ${draconic.level}`, value: draconic.level, source: 'Draconic Bloodline' });
    hpParts.push(...modParts(mods, ['hpMax']));
    if (ruleset !== 'srd521' && exh >= 4) {
        const sub = hpParts.reduce((s, p) => s + p.value, 0);
        hpParts.push({ label: 'Exhaustion 4+: maximum halved', value: -Math.ceil(sub / 2), source: 'Condition: Exhaustion' });
    }
    const hpMax = mkStat('hpMax', 'Hit point maximum', hpParts, ov);
    if (hpMax.value < 1 && lvl > 0)
        hpMax.value = 1;
    // Hit dice
    const dieTotals = {};
    for (const { cl, def } of classDefs)
        if (def)
            dieTotals[`d${def.hitDie}`] = (dieTotals[`d${def.hitDie}`] ?? 0) + cl.level;
    const hitDice = Object.entries(dieTotals).sort((a, b) => Number(b[0].slice(1)) - Number(a[0].slice(1))).map(([die, total]) => ({ die, total, used: Math.min(total, c.hitDiceUsed[die] ?? 0) }));
    // Spellcasting
    const spellProfiles = [];
    const casterEntries = [];
    let warlockLevel = 0;
    for (const { cl, def } of classDefs) {
        if (!def)
            continue;
        const sub = byId(reg.subclasses, cl.subclassId);
        const type = def.casterType !== 'none' ? def.casterType : sub?.casterType ?? 'none';
        const ab = def.spellAbility ?? sub?.spellAbility;
        if (type === 'pact')
            warlockLevel += cl.level;
        else
            casterEntries.push({ casterType: type, level: cl.level });
        if (type === 'none' || !ab)
            continue;
        if (type === 'half' && cl.level < 2 && def.casterType === 'half')
            continue;
        const name = def.name;
        const dc = mkStat(`spellDC:${def.id}`, `${name} spell save DC`, [{ label: 'Base', value: 8, source: 'Rules' }, { label: 'Proficiency bonus', value: pb.value, source: 'Level' }, { label: `${ABILITY_NAMES[ab]} modifier`, value: am[ab], source: 'Spellcasting ability' }, ...modParts(mods, ['spellDC'])], ov);
        const atk = mkStat(`spellAttack:${def.id}`, `${name} spell attack`, [{ label: 'Proficiency bonus', value: pb.value, source: 'Level' }, { label: `${ABILITY_NAMES[ab]} modifier`, value: am[ab], source: 'Spellcasting ability' }, ...modParts(mods, ['spellAttack']), ...exh2024], ov);
        let preparedMax = null;
        if (def.preparedFormula === 'mod+level')
            preparedMax = Math.max(1, am[ab] + cl.level);
        if (def.preparedFormula === 'mod+halfLevel')
            preparedMax = Math.max(1, am[ab] + Math.floor(cl.level / 2));
        spellProfiles.push({ classId: def.id, className: name, ability: ab, dc, attack: atk, cantripsMax: def.cantrips?.[cl.level - 1] ?? null, knownMax: def.spellsKnown?.[cl.level - 1] ?? null, preparedMax, prepStyle: def.prepStyle ?? 'known' });
    }
    const ccl = combinedCasterLevel(casterEntries);
    const slotMax = slotsForCasterLevel(ccl.level);
    const slots = slotMax.map((max, i) => ({ level: i + 1, max, used: Math.min(max, c.spellcasting.slotsUsed[i] ?? 0) }));
    const pk = pactSlots(warlockLevel);
    const pact = { ...pk, used: Math.min(pk.count, c.spellcasting.pactUsed) };
    for (const p of spellProfiles) {
        if (p.preparedMax !== null) {
            const own = c.spellcasting.prepared.filter((id) => byId(reg.spells, id)?.classes.includes(p.classId) && (byId(reg.spells, id)?.level ?? 0) > 0).length;
            if (own > p.preparedMax)
                warnings.push(`${p.className}: ${own} spells prepared, limit is ${p.preparedMax}.`);
        }
    }
    for (const id of [...c.spellcasting.known, ...c.spellcasting.prepared])
        if (!byId(reg.spells, id))
            warnings.push(`Spell “${id}” is not in the content library.`);
    if (armorDef && !hasProficiency(c, 'armor', armorDef.type) && spellProfiles.length)
        warnings.push('Spellcasting is not possible while wearing armour you are not proficient with.');
    // Attacks
    const attacks = [];
    const atkMods = modParts(mods, ['attack']);
    const dmgMods = modParts(mods, ['damage']);
    for (const it of c.inventory.filter((i) => i.equipped && i.category === 'weapon')) {
        const wd = byId(reg.weapons, it.weaponId);
        if (!wd) {
            warnings.push(`Weapon “${it.name}” has no linked weapon definition; add a custom action instead.`);
            continue;
        }
        const finesse = wd.properties.includes('finesse');
        const ab = wd.kind === 'ranged' ? 'dex' : finesse ? (am.dex > am.str ? 'dex' : 'str') : 'str';
        const prof = hasProficiency(c, 'weapon', wd.category) || hasProficiency(c, 'weapon', wd.name) || hasProficiency(c, 'weapon', wd.id.replace(/-/g, ' '));
        const parts = [{ label: `${ABILITY_NAMES[ab]} modifier${finesse ? ' (finesse: higher of Str/Dex)' : ''}`, value: am[ab], source: 'Ability score' }];
        if (prof)
            parts.push({ label: 'Proficiency', value: pb.value, source: `Weapon proficiency (${wd.category})` });
        if (it.magicBonus)
            parts.push({ label: 'Magic bonus', value: it.magicBonus, source: `Item: ${it.name}` });
        parts.push(...atkMods, ...exh2024);
        const dParts = [{ label: `${ABILITY_NAMES[ab]} modifier`, value: am[ab], source: 'Ability score' }];
        if (it.magicBonus)
            dParts.push({ label: 'Magic bonus', value: it.magicBonus, source: `Item: ${it.name}` });
        dParts.push(...dmgMods);
        const flat = dParts.reduce((s, p) => s + p.value, 0);
        const ammo = wd.properties.includes('ammunition') ? c.inventory.find((i) => i.category === 'ammunition' && i.quantity > 0) : undefined;
        attacks.push({ id: `weapon:${it.id}`, itemId: it.id, name: it.name, range: wd.range ?? (wd.properties.includes('reach') ? '10 ft' : '5 ft'), attack: mkStat(`attack:${it.id}`, `${it.name} attack`, parts, ov),
            saveDC: null, damage: joinDice(wd.damage, flat), damageParts: dParts, damageType: wd.damageType, versatile: wd.versatile ? joinDice(wd.versatile, flat) : undefined,
            properties: wd.properties, ammoItemId: ammo?.id, economy: 'action', notes: prof ? '' : 'Not proficient', source: `Item: ${it.name}` });
    }
    for (const a of c.actions) {
        const ab = a.ability;
        let attack = null;
        if (a.attackType !== 'save' && a.attackType !== 'none') {
            const parts = [];
            if (ab)
                parts.push({ label: `${ABILITY_NAMES[ab]} modifier`, value: am[ab], source: 'Ability score' });
            if (a.proficient)
                parts.push({ label: 'Proficiency', value: pb.value, source: 'Proficient' });
            if (a.attackBonusExtra)
                parts.push({ label: 'Additional bonus', value: a.attackBonusExtra, source: a.source || 'Action' });
            if (a.attackType.startsWith('spell'))
                parts.push(...modParts(mods, ['spellAttack']));
            else
                parts.push(...atkMods);
            parts.push(...exh2024);
            attack = mkStat(`attack:${a.id}`, `${a.name} attack`, parts, ov);
        }
        let saveDC = a.saveDC ?? null;
        if (a.attackType === 'save' && saveDC === null && spellProfiles[0])
            saveDC = spellProfiles[0].dc.value;
        attacks.push({ id: `action:${a.id}`, name: a.name, range: a.range, attack, saveDC, saveAbility: a.saveAbility, damage: a.damage + (a.extraDamage ? ` + ${a.extraDamage}` : ''), damageParts: [], damageType: a.damageType, versatile: a.versatile, properties: [], ammoItemId: a.ammoItemId, economy: a.economy, resourceId: a.resourceId, notes: a.notes, source: a.source || 'Custom action' });
    }
    // Resources
    const resources = [];
    const addRes = (def, level, source, scaleByTotal = false) => {
        const max = resourceMax(def, scaleByTotal ? lvl : level, am);
        if (max === null)
            return;
        const st = c.resources.find((r) => r.id === def.id);
        const rec = def.shortRestFromLevel && level >= def.shortRestFromLevel ? 'short' : def.recovery;
        resources.push({ id: def.id, name: def.name + (max === -1 ? ' (unlimited)' : ''), max: max === -1 ? 99 : max, used: st?.used ?? 0, recovery: rec, source, custom: false });
    };
    for (const { cl, def } of classDefs) {
        def?.resources?.forEach((r) => addRes(r, cl.level, `${def.name} ${cl.level}`));
        byId(reg.subclasses, cl.subclassId)?.resources?.forEach((r) => addRes(r, cl.level, `${def?.name ?? ''} ${cl.level}`));
    }
    for (const gid of c.grants)
        byId(reg.custom, gid)?.resources.forEach((r) => addRes(r, lvl, byId(reg.custom, gid).name, true));
    for (const r of c.resources.filter((x) => x.custom))
        resources.push({ id: r.id, name: r.name, max: r.max, used: r.used, recovery: r.recovery, source: r.source, custom: true });
    for (const r of resources)
        if (r.used > r.max)
            r.used = r.max;
    // Attunement and reference checks
    const attuned = c.inventory.filter((i) => i.attuned).length;
    const attunementLimit = settings?.attunementLimit ?? 3;
    if (attuned > attunementLimit)
        warnings.push(`${attuned} items attuned; the limit is ${attunementLimit}.`);
    for (const it of c.inventory)
        if (it.containerId && !c.inventory.some((x) => x.id === it.containerId))
            warnings.push(`“${it.name}” is stored in a container that no longer exists.`);
    for (const gid of c.grants)
        if (!byId(reg.custom, gid))
            warnings.push(`Custom content “${gid}” is applied to this character but is missing or disabled.`);
    for (const k of Object.keys(ov))
        warnings.push(`Manual override active: ${k} = ${ov[k]}.`);
    for (const e of c.effects) {
        if (e.modifiers.length === 0 && !e.conditionId)
            reminders.push(`${e.name}: reminder only (no automated modifiers).`);
        else if (e.conditionId) {
            const cd = byId(reg.conditions, e.conditionId);
            if (cd)
                reminders.push(`${cd.name}: ${cd.summary}`);
        }
    }
    return { totalLevel: lvl, pb, abilities, mods: am, saves, skills, passives, ac, initiative, speed, hpMax, hitDice, spellProfiles, slots, pact, casterLevelParts: ccl.parts,
        carrying: { capacity, weight, encumbrance: enc, pushDrag: str * 30 }, attacks, resources, attuned, attunementLimit, warnings, reminders, modifiers: mods };
}
export function joinDice(dice, flat) { return flat === 0 ? dice : `${dice}${flat > 0 ? '+' : '-'}${Math.abs(flat)}`; }
const round2 = (n) => Math.round(n * 100) / 100;
export const cap = (s) => s.replace(/\b\w/g, (m) => m.toUpperCase());
