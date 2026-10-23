import { h, btn, card, field, input, num, select, textarea, modal, toast, confirmDialog, empty, fill } from '../dom.js';
import { state, change, setActive, eventsFor } from '../store.js';
import { needCharacter, pageHeader, statButton, classLine } from '../components.js';
import { newItem, itemFromContentId } from '../../rules/factory.js';
import { cap } from '../../rules/calc.js';
import { clone } from '../../rules/events.js';
import { MODIFIER_TARGET_HINT } from '../../io/importExport.js';
const CATS = ['weapon', 'armor', 'shield', 'gear', 'consumable', 'ammunition', 'magic', 'treasure', 'container', 'tool'];
const COIN_GP = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 };
export function inventoryView(p) {
    const c = needCharacter(p.id);
    if (c instanceof HTMLElement)
        return c;
    setActive(c);
    const d = state.derived;
    const f = { q: '', cat: '', loc: '' };
    const listBox = h('div');
    const draw = () => {
        const match = (i) => (!f.q || `${i.name} ${i.notes}`.toLowerCase().includes(f.q.toLowerCase())) && (!f.cat || i.category === f.cat) && (!f.loc || i.location === f.loc);
        const top = c.inventory.filter((i) => !i.containerId || !c.inventory.some((x) => x.id === i.containerId));
        const rows = [];
        for (const it of top) {
            const kids = c.inventory.filter((x) => x.containerId === it.id);
            if (match(it) || kids.some(match))
                rows.push(itemRow(c, it, kids.filter(match)));
        }
        fill(listBox, rows.length ? h('ul', { class: 'item-list' }, rows) : empty(c.inventory.length ? 'No items match the filters.' : 'No items yet. Add equipment below.'));
    };
    const enc = d.carrying;
    const pct = Math.min(100, (enc.weight.value / Math.max(1, enc.capacity)) * 100);
    const locs = [...new Set(['Carried', 'Stored', 'Party stash', ...c.inventory.map((i) => i.location)])];
    const totalGp = Object.entries(c.currency).reduce((s, [k, v]) => s + v * (COIN_GP[k] ?? 0), 0);
    const invWarn = d.warnings.filter((w) => /item|armour|weapon|attun|container|carrying|shield/i.test(w));
    const root = h('div', { class: 'page' }, pageHeader('Inventory', `${c.name} · ${classLine(c)}`), invWarn.length ? h('ul', { class: 'notice notice-warn warn-list' }, invWarn.map((w) => h('li', null, w))) : null, card('Carrying', h('div', { class: 'stat-row' }, statButton(enc.weight, { label: 'Carried (lb)' }), h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, String(enc.capacity)), h('span', { class: 'stat-label' }, 'Capacity (Str × 15)')), h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, `${d.attuned}/${d.attunementLimit}`), h('span', { class: 'stat-label' }, 'Attuned'))), h('div', { class: 'hp-bar', role: 'meter', 'aria-label': 'Carried weight', 'aria-valuemin': '0', 'aria-valuemax': String(enc.capacity), 'aria-valuenow': String(enc.weight.value) }, h('div', { class: `hp-fill${pct > 66 ? ' low' : pct > 33 ? ' mid' : ''}`, style: `width:${pct}%` })), h('p', { class: 'hint' }, `Status: ${enc.encumbrance === 'none' ? 'unencumbered' : enc.encumbrance === 'over' ? 'over capacity' : enc.encumbrance}. Push/drag/lift ${enc.pushDrag} lb.${state.settings.encumbranceVariant ? ' Variant encumbrance is on.' : ''}`)), card('Currency', currency(c), h('p', { class: 'hint' }, `Total value ≈ ${totalGp.toFixed(2)} gp.`)), card('Items', h('div', { class: 'grid-3' }, field('Search', (() => { const i = input({ type: 'search' }); i.addEventListener('input', () => { f.q = i.value; draw(); }); return i; })()), field('Category', (() => { const s = select([{ value: '', label: 'All' }, ...CATS.map((x) => ({ value: x, label: cap(x) }))], ''); s.addEventListener('change', () => { f.cat = s.value; draw(); }); return s; })()), field('Location', (() => { const s = select([{ value: '', label: 'All' }, ...locs.map((x) => ({ value: x, label: x }))], ''); s.addEventListener('change', () => { f.loc = s.value; draw(); }); return s; })())), listBox, h('div', { class: 'row wrap' }, btn('+ Add item', () => itemDialog(c), 'btn btn-primary'), btn('+ Add SRD weapon or armour', () => quickAdd(), 'btn'))));
    draw();
    return root;
}
function itemRow(c, it, kids) {
    const canEquip = ['weapon', 'armor', 'shield', 'magic', 'gear', 'tool'].includes(it.category);
    return h('li', { class: `item${it.equipped ? ' is-equipped' : ''}` }, h('div', { class: 'item-head' }, h('strong', null, it.name), it.quantity !== 1 ? h('span', { class: 'badge' }, `×${it.quantity}`) : null, it.magicBonus ? h('span', { class: 'badge' }, `+${it.magicBonus}`) : null, it.equipped ? h('span', { class: 'badge badge-ok' }, 'Equipped') : null, it.attuned ? h('span', { class: 'badge badge-conc' }, 'Attuned') : it.requiresAttunement ? h('span', { class: 'badge' }, 'Requires attunement') : null, it.location !== 'Carried' ? h('span', { class: 'badge' }, it.location) : null, h('span', { class: 'hint' }, `${cap(it.category)} · ${(it.weight * it.quantity).toFixed(2).replace(/\.00$/, '')} lb${it.value ? ` · ${it.value}` : ''}`)), h('div', { class: 'row wrap' }, h('span', { class: 'stepper' }, btn('−', () => void qty(it, -1), 'icon-btn', { 'aria-label': `Remove one ${it.name}` }), h('span', null, String(it.quantity)), btn('+', () => void qty(it, 1), 'icon-btn', { 'aria-label': `Add one ${it.name}` })), canEquip ? btn(it.equipped ? 'Unequip' : 'Equip', () => void change('inventory', `${it.equipped ? 'Unequipped' : 'Equipped'} ${it.name}`, (dr) => { dr.inventory.find((x) => x.id === it.id).equipped = !it.equipped; }), 'btn btn-small') : null, it.requiresAttunement ? btn(it.attuned ? 'End attunement' : 'Attune', () => void attune(c, it), 'btn btn-small') : null, it.charges ? h('span', { class: 'stepper' }, h('span', null, 'Charges '), btn('−', () => void charge(it, -1), 'icon-btn', { 'aria-label': `Use a charge of ${it.name}` }), h('span', null, `${it.charges.current}/${it.charges.max}`), btn('+', () => void charge(it, 1), 'icon-btn', { 'aria-label': `Restore a charge of ${it.name}` })) : null, btn('Edit', () => itemDialog(c, it), 'btn btn-small btn-ghost'), btn('Delete', async () => { if (await confirmDialog(`Delete ${it.name}?`, kids.length ? 'Items inside this container will be moved out of it.' : 'This removes the item.', 'Delete', true))
        await change('inventory', `Removed ${it.name}`, (dr) => { dr.inventory = dr.inventory.filter((x) => x.id !== it.id); dr.inventory.forEach((x) => { if (x.containerId === it.id)
            delete x.containerId; }); }); }, 'btn btn-small btn-ghost danger-text')), it.notes ? h('p', { class: 'hint' }, it.notes) : null, kids.length ? h('ul', { class: 'item-list nested', 'aria-label': `Inside ${it.name}` }, kids.map((k) => itemRow(c, k, []))) : null);
}
const qty = (it, delta) => change('inventory', `${delta > 0 ? 'Added' : 'Removed'} ${Math.abs(delta)} ${it.name}`, (dr) => { const x = dr.inventory.find((y) => y.id === it.id); x.quantity = Math.max(0, x.quantity + delta); });
const charge = (it, delta) => change('inventory', `${delta < 0 ? 'Used' : 'Restored'} a charge of ${it.name}`, (dr) => { const x = dr.inventory.find((y) => y.id === it.id).charges; x.current = Math.max(0, Math.min(x.max, x.current + delta)); });
async function attune(c, it) {
    if (!it.attuned) {
        const n = c.inventory.filter((i) => i.attuned).length;
        if (n >= state.settings.attunementLimit && !(await confirmDialog('Attunement limit reached', `${c.name} is already attuned to ${n} items (limit ${state.settings.attunementLimit}). Attune anyway as a custom ruling?`, 'Attune anyway')))
            return;
    }
    await change('attunement', `${it.attuned ? 'Ended attunement to' : 'Attuned to'} ${it.name}`, (dr) => { dr.inventory.find((x) => x.id === it.id).attuned = !it.attuned; });
}
function currency(c) {
    const coins = ['cp', 'sp', 'ep', 'gp', 'pp'];
    const amt = num(0, { min: 0, 'aria-label': 'Amount' });
    const coin = select(coins.map((x) => ({ value: x, label: x })), 'gp', { 'aria-label': 'Coin' });
    const reason = input({ placeholder: 'Reason (optional)', 'aria-label': 'Reason' });
    const tx = (sign) => {
        const v = Math.floor(Number(amt.value));
        if (!(v > 0))
            return toast('Enter an amount above 0.', 'warn');
        const k = coin.value;
        if (sign < 0 && c.currency[k] < v)
            return toast(`Only ${c.currency[k]} ${k} available. Convert coins first or edit directly.`, 'error');
        void change('currency', `${sign > 0 ? 'Gained' : 'Spent'} ${v} ${k}${reason.value ? `: ${reason.value}` : ''}`, (dr) => { dr.currency[k] += sign * v; });
    };
    return h('div', null, h('div', { class: 'coin-row' }, coins.map((k) => h('div', { class: 'coin' }, h('span', { class: 'coin-v' }, String(c.currency[k])), h('span', { class: 'coin-k' }, k.toUpperCase())))), h('div', { class: 'row wrap' }, amt, coin, reason, btn('Gain', () => tx(1), 'btn btn-small btn-ok'), btn('Spend', () => tx(-1), 'btn btn-small')), h('details', null, h('summary', null, 'Convert or set coins'), h('div', { class: 'row wrap' }, coins.map((k) => { const n = num(c.currency[k], { min: 0, 'aria-label': k, class: 'num-sm' }); n.dataset.k = k; return h('label', null, `${k} `, n); }), btn('Save coins', (e) => { const box = e.target.closest('details'); const next = { ...c.currency }; box.querySelectorAll('input[data-k]').forEach((i) => (next[i.dataset.k] = Math.max(0, Math.floor(Number(i.value) || 0)))); void change('currency', 'Adjusted coins', (dr) => { dr.currency = next; }); }, 'btn btn-small'))));
}
function quickAdd() {
    const reg = state.registry;
    const s = select([...reg.weapons.map((w) => ({ value: w.id, label: `Weapon: ${w.name} (${w.damage} ${w.damageType})` })), ...reg.armor.map((a) => ({ value: a.id, label: `${a.type === 'shield' ? 'Shield' : `Armour (${a.type})`}: ${a.name} (AC ${a.base})` }))], reg.weapons[0].id);
    const eq = h('input', { type: 'checkbox', checked: false });
    modal('Add SRD equipment', h('div', null, field('Item', s), h('label', { class: 'check' }, eq, ' Equip now')), [{ label: 'Cancel', cls: 'btn btn-ghost' }, { label: 'Add', cls: 'btn btn-primary', run: async () => {
                const it = itemFromContentId(reg, s.value);
                if (!it)
                    return false;
                it.equipped = eq.checked;
                await change('inventory', `Added ${it.name}`, (dr) => { if (eq.checked && (it.category === 'armor' || it.category === 'shield'))
                    dr.inventory.forEach((x) => { if (x.category === it.category)
                        x.equipped = false; }); dr.inventory.push(it); });
                return true;
            } }]);
}
function itemDialog(c, existing) {
    const it = existing ? clone(existing) : newItem({ name: '' });
    const reg = state.registry;
    const name = input({ value: it.name });
    const cat = select(CATS.map((x) => ({ value: x, label: cap(x) })), it.category);
    const qtyI = num(it.quantity, { min: 0 });
    const wt = num(it.weight, { min: 0, step: '0.01' });
    const val = input({ value: it.value, placeholder: '10 gp' });
    const loc = input({ value: it.location, list: 'loc-list' });
    const locList = h('datalist', { id: 'loc-list' }, ['Carried', 'Stored', 'Party stash'].map((x) => h('option', { value: x })));
    const cont = select([{ value: '', label: '— Not in a container —' }, ...c.inventory.filter((x) => x.category === 'container' && x.id !== it.id).map((x) => ({ value: x.id, label: x.name }))], it.containerId ?? '');
    const wlink = select([{ value: '', label: '— None —' }, ...reg.weapons.map((w) => ({ value: w.id, label: w.name }))], it.weaponId ?? '');
    const alink = select([{ value: '', label: '— None —' }, ...reg.armor.map((a) => ({ value: a.id, label: a.name }))], it.armorId ?? '');
    const bonus = num(it.magicBonus);
    const reqAtt = h('input', { type: 'checkbox', checked: it.requiresAttunement });
    const chMax = num(it.charges?.max ?? 0, { min: 0 });
    const chRec = select([{ value: 'dawn', label: 'Dawn' }, { value: 'long', label: 'Long rest' }, { value: 'short', label: 'Short rest' }, { value: 'none', label: 'Never' }], it.charges?.recovery ?? 'dawn');
    const sess = select([{ value: '', label: '— None —' }], '', { 'aria-label': 'Acquired in session' });
    if (c.campaignId)
        void state.repo.byIndex('records', 'campaignId', c.campaignId).then((rs) => { rs.filter((r) => r.kind === 'session').forEach((r) => sess.append(h('option', { value: r.id }, r.title || 'Untitled session'))); sess.value = it.acquiredSessionId ?? ''; });
    const props = input({ value: it.properties.join(', ') });
    const notes = textarea(it.notes, { rows: 3 });
    const src = input({ value: it.source });
    const mods = it.modifiers.map((m) => ({ ...m }));
    const modBox = h('div');
    const drawMods = () => fill(modBox, h('ul', { class: 'edit-list' }, mods.map((m, i) => h('li', null, `${m.target} ${m.op} ${m.value}`, btn('Remove', () => { mods.splice(i, 1); drawMods(); }, 'btn btn-small btn-ghost')))), (() => {
        const t = input({ placeholder: 'ac', 'aria-label': 'Target' });
        const o = select([{ value: 'add', label: 'add' }, { value: 'setMin', label: 'set minimum' }], 'add', { 'aria-label': 'Operation' });
        const v = num(1, { 'aria-label': 'Value' });
        return h('div', { class: 'row wrap' }, t, o, v, btn('Add modifier', () => { if (!t.value.trim())
            return toast('Enter a target.', 'warn'); mods.push({ target: t.value.trim(), op: o.value, value: Number(v.value) || 0 }); drawMods(); }, 'btn btn-small'));
    })());
    drawMods();
    const historyBox = h('div', { class: 'hint' }, existing ? 'Loading history…' : '');
    if (existing)
        void eventsFor(c.id).then((evs) => { const rel = evs.filter((e) => ['inventory', 'attunement'].includes(e.category) && e.description.includes(existing.name)).slice(0, 15); fill(historyBox, rel.length ? h('ul', null, rel.map((e) => h('li', null, `${new Date(e.ts).toLocaleDateString()}: ${e.description}`))) : h('p', null, 'No recorded history.')); });
    const form = h('div', null, h('div', { class: 'error-summary', role: 'alert', tabindex: '-1', hidden: true }), h('div', { class: 'grid-2' }, field('Name', name, { required: true, name: 'name' }), field('Category', cat), field('Quantity', qtyI), field('Weight each (lb)', wt), field('Value', val), field('Location', loc), locList, field('Container', cont), field('Weapon statistics', wlink, { hint: 'Link to SRD weapon data so attacks are calculated.' }), field('Armour statistics', alink, { hint: 'Link to SRD armour data so AC is calculated.' }), field('Magic bonus', bonus, { hint: 'Adds to attack and damage, or AC.' }), h('label', { class: 'check' }, reqAtt, ' Requires attunement'), field('Charges (0 = none)', chMax), field('Charges recover', chRec), field('Properties', props, { hint: 'Comma-separated' }), field('Source', src), c.campaignId ? field('Acquired in session', sess) : null), field('Notes', notes), h('h3', null, 'Structured modifiers (apply while equipped, and attuned if required)'), h('p', { class: 'hint' }, `Targets: ${MODIFIER_TARGET_HINT}`), modBox, existing ? h('h3', null, 'Item history') : null, historyBox);
    modal(existing ? `Edit ${it.name}` : 'Add item', form, [{ label: 'Cancel', cls: 'btn btn-ghost' }, { label: 'Save item', cls: 'btn btn-primary', run: async () => {
                if (!name.value.trim()) {
                    toast('Item name is required.', 'error');
                    name.focus();
                    return false;
                }
                if (!(Number(qtyI.value) >= 0) || !(Number(wt.value) >= 0)) {
                    toast('Quantity and weight must be 0 or more.', 'error');
                    return false;
                }
                const max = Math.floor(Number(chMax.value) || 0);
                Object.assign(it, { name: name.value.trim(), category: cat.value, quantity: Math.floor(Number(qtyI.value)), weight: Number(wt.value), value: val.value, location: loc.value.trim() || 'Carried', containerId: cont.value || undefined,
                    weaponId: wlink.value || undefined, armorId: alink.value || undefined, magicBonus: Number(bonus.value) || 0, requiresAttunement: reqAtt.checked, attuned: reqAtt.checked ? it.attuned : false,
                    charges: max > 0 ? { max, current: Math.min(max, it.charges?.current ?? max), recovery: chRec.value } : undefined,
                    acquiredSessionId: sess.value || undefined, properties: props.value.split(',').map((x) => x.trim()).filter(Boolean), notes: notes.value, source: src.value || 'User', modifiers: mods });
                if (it.weaponId && it.category !== 'weapon')
                    toast('Weapon statistics only apply to items in the Weapon category.', 'warn');
                await change('inventory', `${existing ? 'Edited' : 'Added'} ${it.name}`, (dr) => { const i = dr.inventory.findIndex((x) => x.id === it.id); if (i >= 0)
                    dr.inventory[i] = it;
                else
                    dr.inventory.push(it); });
                return true;
            } }], { wide: true });
}
