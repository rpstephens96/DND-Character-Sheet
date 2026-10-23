/** Suggest a defence from the character's recorded defences. Returns 'normal' if the type is unknown/blank (ambiguous: user confirms). */
export function suggestDefense(c, damageType) {
    const t = damageType.trim().toLowerCase();
    if (!t)
        return 'normal';
    const has = (l) => l.some((x) => x.trim().toLowerCase() === t);
    if (has(c.defenses.immunities))
        return 'immune';
    const r = has(c.defenses.resistances), v = has(c.defenses.vulnerabilities);
    if (r && v)
        return 'normal'; // they cancel out
    return r ? 'resistant' : v ? 'vulnerable' : 'normal';
}
export function proposeDamage(c, hpMax, raw, defense, opts = {}) {
    const explanation = [`Incoming damage: ${raw}`];
    let adjusted = Math.max(0, Math.floor(raw));
    if (defense === 'immune') {
        adjusted = 0;
        explanation.push('Immune: reduced to 0');
    }
    if (defense === 'resistant') {
        adjusted = Math.floor(adjusted / 2);
        explanation.push(`Resistant: halved (round down) to ${adjusted}`);
    }
    if (defense === 'vulnerable') {
        adjusted *= 2;
        explanation.push(`Vulnerable: doubled to ${adjusted}`);
    }
    const toTemp = Math.min(c.hp.temp, adjusted);
    if (toTemp)
        explanation.push(`Temporary HP absorbs ${toTemp}`);
    const toHp = adjusted - toTemp;
    const newHp = Math.max(0, c.hp.current - toHp);
    const overflow = toHp - c.hp.current;
    const instantDeath = c.hp.current > 0 ? overflow >= hpMax : toHp >= hpMax;
    let deathSaveFailures = 0;
    if (c.hp.current === 0 && toHp > 0) {
        deathSaveFailures = opts.critical ? 2 : 1;
        explanation.push(`Damage at 0 HP: ${deathSaveFailures} death save failure(s)`);
    }
    if (instantDeath && toHp > 0)
        explanation.push('Remaining damage equals or exceeds HP maximum: instant death (massive damage rule).');
    const concentrationDC = c.concentration && adjusted > 0 ? Math.max(10, Math.floor(adjusted / 2)) : null;
    if (concentrationDC)
        explanation.push(`Concentration check: Con save DC ${concentrationDC}`);
    return { raw, adjusted, defense, toTemp, toHp, newHp, newTemp: c.hp.temp - toTemp, dropsToZero: newHp === 0 && c.hp.current > 0, instantDeath: instantDeath && toHp > 0, concentrationDC, deathSaveFailures, explanation };
}
export function applyDamage(d, p) {
    d.hp.temp = p.newTemp;
    d.hp.current = p.newHp;
    if (p.deathSaveFailures) {
        d.deathSaves.failures = Math.min(3, d.deathSaves.failures + p.deathSaveFailures);
        d.deathSaves.stable = false;
    }
    if (p.dropsToZero) {
        d.deathSaves = { successes: 0, failures: 0, stable: false, dead: false };
    }
    if (p.instantDeath || d.deathSaves.failures >= 3)
        d.deathSaves.dead = true;
}
export function applyHealing(d, hpMax, amount) {
    if (d.deathSaves.dead)
        throw new Error('A dead character cannot regain hit points without revival magic.');
    const before = d.hp.current;
    d.hp.current = Math.min(hpMax, d.hp.current + Math.max(0, Math.floor(amount)));
    if (before === 0 && d.hp.current > 0)
        d.deathSaves = { successes: 0, failures: 0, stable: false, dead: false };
    return d.hp.current - before;
}
/** Temporary HP do not stack: keep the higher unless the player explicitly replaces. */
export function applyTempHp(d, amount, replace) {
    const n = Math.max(0, Math.floor(amount));
    d.hp.temp = replace ? n : Math.max(d.hp.temp, n);
}
export function recordDeathSave(d, roll) {
    if (roll === 20) {
        d.hp.current = 1;
        d.deathSaves = { successes: 0, failures: 0, stable: false, dead: false };
        return 'Natural 20: regains 1 HP.';
    }
    if (roll === 1)
        d.deathSaves.failures = Math.min(3, d.deathSaves.failures + 2);
    else if (roll >= 10)
        d.deathSaves.successes = Math.min(3, d.deathSaves.successes + 1);
    else
        d.deathSaves.failures = Math.min(3, d.deathSaves.failures + 1);
    if (d.deathSaves.failures >= 3) {
        d.deathSaves.dead = true;
        return 'Three failures: the character dies.';
    }
    if (d.deathSaves.successes >= 3) {
        d.deathSaves.stable = true;
        return 'Three successes: the character is stable.';
    }
    return roll === 1 ? 'Natural 1: two failures.' : roll >= 10 ? 'Success.' : 'Failure.';
}
