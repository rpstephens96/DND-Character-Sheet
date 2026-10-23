export function h(tag, attrs = null, ...children) {
    const el = document.createElement(tag);
    if (attrs)
        for (const [k, v] of Object.entries(attrs)) {
            if (v === undefined || v === null || v === false)
                continue;
            if (k === 'on') {
                for (const [ev, fn] of Object.entries(v))
                    el.addEventListener(ev, fn);
                continue;
            }
            if (k === 'class') {
                el.className = String(v);
                continue;
            }
            if (k === 'style') {
                el.style.cssText = String(v);
                continue;
            } // CSSOM is permitted by the CSP; style attributes are not
            if (k === 'value' && 'value' in el) {
                el.value = String(v);
                continue;
            }
            if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'required' || k === 'multiple') {
                el[k] = Boolean(v);
                if (v)
                    el.setAttribute(k, '');
                continue;
            }
            if (/^on/i.test(k))
                continue; // never allow inline handlers
            if ((k === 'href' || k === 'src') && /^\s*javascript:/i.test(String(v)))
                continue;
            el.setAttribute(k, v === true ? '' : String(v));
        }
    append(el, children);
    return el;
}
export function append(el, children) {
    for (const c of children.flat(Infinity)) {
        if (c === null || c === undefined || c === false)
            continue;
        el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const clear = (el) => { while (el.firstChild)
    el.removeChild(el.firstChild); };
let fieldSeq = 0;
export const fid = (p = 'f') => `${p}-${++fieldSeq}`;
/** Accessible labelled field. `required` adds a visible marker; errors are linked via aria-describedby. */
export function field(label, control, opts = {}) {
    const id = control.id || fid();
    control.id = id;
    if (opts.name)
        control.setAttribute('name', opts.name);
    const describedBy = [];
    const hint = opts.hint ? h('p', { class: 'hint', id: `${id}-hint` }, opts.hint) : null;
    if (hint)
        describedBy.push(`${id}-hint`);
    const err = h('p', { class: 'field-error', id: `${id}-err`, role: 'alert', hidden: !opts.error }, opts.error ?? '');
    describedBy.push(`${id}-err`);
    control.setAttribute('aria-describedby', describedBy.join(' '));
    if (opts.required)
        control.setAttribute('aria-required', 'true');
    if (opts.error)
        control.setAttribute('aria-invalid', 'true');
    return h('div', { class: `field${opts.error ? ' has-error' : ''}`, 'data-field': opts.name ?? '' }, h('label', { for: id }, label, opts.required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : h('span', { class: 'opt' }, ' (optional)')), control, hint, err);
}
export const input = (attrs = {}) => h('input', { type: 'text', ...attrs });
export const num = (value, attrs = {}) => h('input', { type: 'number', inputmode: 'numeric', value, ...attrs });
export const textarea = (value, attrs = {}) => { const t = h('textarea', { rows: 4, ...attrs }); t.value = value; return t; };
export function select(options, value, attrs = {}) {
    const s = h('select', attrs, options.map((o) => h('option', { value: o.value, disabled: o.disabled }, o.label)));
    s.value = value;
    return s;
}
export const btn = (label, onClick, cls = 'btn', attrs = {}) => h('button', { type: 'button', class: cls, ...attrs, on: { click: onClick } }, label);
export const link = (href, label, cls = '') => h('a', { href, class: cls }, label);
/** Show validation errors: summary at top, inline per field, focus first invalid. Returns true if valid. */
export function showErrors(form, errors) {
    form.querySelectorAll('.field').forEach((f) => { f.classList.remove('has-error'); const e = f.querySelector('.field-error'); if (e) {
        e.hidden = true;
        e.textContent = '';
    } f.querySelector('[aria-invalid]')?.removeAttribute('aria-invalid'); });
    const summary = form.querySelector('.error-summary');
    const keys = Object.keys(errors);
    if (summary) {
        clear(summary);
        summary.hidden = keys.length === 0;
        if (keys.length)
            append(summary, [h('h3', null, `Please complete ${keys.length} field${keys.length > 1 ? 's' : ''}:`), h('ul', null, keys.map((k) => h('li', null, errors[k])))]);
    }
    let first = null;
    for (const k of keys) {
        const f = form.querySelector(`[data-field="${CSS.escape(k)}"]`);
        if (!f)
            continue;
        f.classList.add('has-error');
        const e = f.querySelector('.field-error');
        if (e) {
            e.hidden = false;
            e.textContent = errors[k];
        }
        const ctl = f.querySelector('input,select,textarea,button');
        ctl?.setAttribute('aria-invalid', 'true');
        if (!first)
            first = ctl;
    }
    if (keys.length) {
        (first ?? summary)?.focus();
        (first ?? summary)?.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
    return keys.length === 0;
}
export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce';
// ---- Live announcements and toasts ----
export function announce(msg) { const r = document.getElementById('live'); if (r) {
    r.textContent = '';
    setTimeout(() => (r.textContent = msg), 30);
} }
export function toast(msg, kind = 'ok', action) {
    const host = document.getElementById('toasts');
    if (!host)
        return;
    const t = h('div', { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, h('span', null, msg), action ? btn(action.label, () => { action.run(); t.remove(); }, 'btn btn-small') : null, btn('✕', () => t.remove(), 'icon-btn', { 'aria-label': 'Dismiss' }));
    host.appendChild(t);
    setTimeout(() => t.remove(), action ? 8000 : 4000);
}
// ---- Dialogs (native <dialog> provides focus trapping and Escape handling) ----
export function modal(title, body, actions = [{ label: 'Close' }], opts = {}) {
    const prev = document.activeElement;
    const titleId = fid('dlg');
    const d = h('dialog', { class: `dialog${opts.wide ? ' dialog-wide' : ''}`, 'aria-labelledby': titleId });
    let busy = false;
    const footer = h('div', { class: 'dialog-actions' }, actions.map((a) => btn(a.label, async () => {
        if (busy)
            return;
        busy = true;
        try {
            const r = a.run ? await a.run() : undefined;
            if (r !== false)
                close();
        }
        finally {
            busy = false;
        }
    }, a.cls ?? 'btn')));
    const close = () => { d.close(); d.remove(); prev?.focus?.(); };
    append(d, [h('div', { class: 'dialog-head' }, h('h2', { id: titleId }, title), btn('✕', close, 'icon-btn', { 'aria-label': 'Close dialog' })), h('div', { class: 'dialog-body' }, body), footer]);
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    document.body.appendChild(d);
    d.showModal();
    const firstInput = d.querySelector('.dialog-body input, .dialog-body select, .dialog-body textarea');
    (firstInput ?? d.querySelector('.dialog-actions button'))?.focus();
    return d;
}
export function confirmDialog(title, message, confirmLabel = 'Confirm', danger = false) {
    return new Promise((resolve) => {
        let done = false;
        const d = modal(title, h('div', null, message), [{ label: 'Cancel', cls: 'btn btn-ghost', run: () => { done = true; resolve(false); } }, { label: confirmLabel, cls: danger ? 'btn btn-danger' : 'btn btn-primary', run: () => { done = true; resolve(true); } }]);
        d.addEventListener('close', () => { if (!done)
            resolve(false); });
    });
}
export function download(filename, text, type = 'application/json') {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = h('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function readFile(accept) {
    return new Promise((resolve) => {
        const i = h('input', { type: 'file', accept, class: 'visually-hidden' });
        i.addEventListener('change', async () => { const f = i.files?.[0]; i.remove(); resolve(f ? await f.text() : null); });
        document.body.appendChild(i);
        i.click();
    });
}
export const sign = (n) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
export const card = (title, ...body) => h('section', { class: 'card' }, title ? h('h2', { class: 'card-title' }, title) : null, ...body);
export const empty = (msg, ...actions) => h('div', { class: 'empty' }, h('p', null, msg), ...actions);
/** Append children, skipping null/false (keeps conditional UI terse). */
export const put = (el, ...kids) => append(el, kids);
/** Replace all children, skipping null/false. */
export const fill = (el, ...kids) => { clear(el); append(el, kids); };
