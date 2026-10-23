// Dice parsing and rolling. Uses crypto.getRandomValues with rejection sampling (unbiased).
// Results are pseudorandom from a cryptographically secure generator, not physical dice.
export const secureRandom = (sides) => {
    const c = globalThis.crypto;
    if (!c?.getRandomValues)
        return 1 + Math.floor(Math.random() * sides);
    const limit = Math.floor(0x100000000 / sides) * sides;
    const buf = new Uint32Array(1);
    for (;;) {
        c.getRandomValues(buf);
        if (buf[0] < limit)
            return 1 + (buf[0] % sides);
    }
};
const VALID_SIDES = new Set([2, 3, 4, 6, 8, 10, 12, 20, 100]);
/** Parse expressions such as "2d6+3", "1d8 + 1d6 - 1", "d20", "4". Throws a helpful Error on invalid input. */
export function parseDice(input) {
    const src = input.replace(/\s+/g, '').toLowerCase();
    if (!src)
        throw new Error('Enter a dice expression, for example 2d6+3.');
    if (!/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(src))
        throw new Error(`“${input}” is not a valid dice expression. Use forms like 1d20+5 or 2d6+1d4-1.`);
    const parsed = { terms: [], modifier: 0 };
    const re = /([+-]?)(\d*d\d+|\d+)/g;
    let m;
    while ((m = re.exec(src))) {
        const sign = m[1] === '-' ? -1 : 1;
        const tok = m[2];
        if (tok.includes('d')) {
            const [c, s] = tok.split('d');
            const count = c === '' ? 1 : Number(c);
            const sides = Number(s);
            if (count < 1 || count > 100)
                throw new Error('Dice count must be between 1 and 100.');
            if (!VALID_SIDES.has(sides))
                throw new Error(`d${sides} is not a supported die.`);
            parsed.terms.push({ count, sides, sign });
        }
        else {
            const n = Number(tok);
            if (n > 1000)
                throw new Error('Modifiers above 1000 are not supported.');
            parsed.modifier += sign * n;
        }
    }
    return parsed;
}
/** Roll an expression. Advantage/disadvantage applies to the first d20 term only. Critical doubles the dice count. */
export function roll(expression, opts = {}) {
    const p = parseDice(expression);
    const rng = opts.rng ?? secureRandom;
    const manual = opts.manual ? [...opts.manual] : null;
    const next = (sides) => {
        if (manual) {
            const v = manual.shift();
            if (v === undefined || !Number.isInteger(v) || v < 1 || v > sides)
                throw new Error(`Manual result must be a whole number from 1 to ${sides}.`);
            return v;
        }
        return rng(sides);
    };
    const mode = opts.mode ?? 'normal';
    const dice = [];
    let total = p.modifier;
    let advUsed = false;
    let d20;
    for (const t of p.terms) {
        const count = opts.critical ? t.count * 2 : t.count;
        if (t.sides === 20 && count === 1 && mode !== 'normal' && !advUsed) {
            advUsed = true;
            const a = next(20), b = next(20);
            const keepA = mode === 'advantage' ? a >= b : a <= b;
            dice.push({ sides: 20, value: a, kept: keepA }, { sides: 20, value: b, kept: !keepA });
            const kept = keepA ? a : b;
            d20 = kept;
            total += t.sign * kept;
            continue;
        }
        for (let i = 0; i < count; i++) {
            const v = next(t.sides);
            dice.push({ sides: t.sides, value: v, kept: true });
            if (t.sides === 20 && d20 === undefined)
                d20 = v;
            total += t.sign * v;
        }
    }
    return { expression, dice, modifier: p.modifier, total, mode, d20 };
}
/** Average value of an expression (used for fixed HP and previews). */
export function averageOf(expression) {
    const p = parseDice(expression);
    return p.terms.reduce((s, t) => s + t.sign * t.count * (t.sides + 1) / 2, p.modifier);
}
export const fmtMod = (n) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
