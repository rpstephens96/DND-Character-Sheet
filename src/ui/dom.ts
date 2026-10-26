// Safe DOM helpers. User content is only ever inserted as text nodes or attribute values, never as HTML.
type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, unknown> & { class?: string; on?: Record<string, (e: Event) => void> };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'on') { for (const [ev, fn] of Object.entries(v as Record<string, (e: Event) => void>)) el.addEventListener(ev, fn); continue; }
    if (k === 'class') { el.className = String(v); continue; }
    if (k === 'style') { el.style.cssText = String(v); continue; } // CSSOM is permitted by the CSP; style attributes are not
    if (k === 'value' && 'value' in el) { (el as HTMLInputElement).value = String(v); continue; }
    if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'required' || k === 'multiple') { (el as unknown as Record<string, boolean>)[k] = Boolean(v); if (v) el.setAttribute(k, ''); continue; }
    if (/^on/i.test(k)) continue; // never allow inline handlers
    if ((k === 'href' || k === 'src') && /^\s*javascript:/i.test(String(v))) continue;
    el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

export function append(el: Node, children: Child[]): void {
  for (const c of children.flat(Infinity as 1) as Child[]) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T | null => root.querySelector<T>(sel);
export const clear = (el: Element): void => { while (el.firstChild) el.removeChild(el.firstChild); };

let fieldSeq = 0;
export const fid = (p = 'f'): string => `${p}-${++fieldSeq}`;

/** Accessible labelled field. `required` adds a visible marker; errors are linked via aria-describedby. */
export function field(label: string, control: HTMLElement, opts: { required?: boolean; hint?: string; error?: string; name?: string } = {}): HTMLElement {
  const id = control.id || fid(); control.id = id;
  if (opts.name) control.setAttribute('name', opts.name);
  const describedBy: string[] = [];
  const hint = opts.hint ? h('p', { class: 'hint', id: `${id}-hint` }, opts.hint) : null;
  if (hint) describedBy.push(`${id}-hint`);
  const err = h('p', { class: 'field-error', id: `${id}-err`, role: 'alert', hidden: !opts.error }, opts.error ?? '');
  describedBy.push(`${id}-err`);
  control.setAttribute('aria-describedby', describedBy.join(' '));
  if (opts.required) control.setAttribute('aria-required', 'true');
  if (opts.error) control.setAttribute('aria-invalid', 'true');
  return h('div', { class: `field${opts.error ? ' has-error' : ''}`, 'data-field': opts.name ?? '' },
    h('label', { for: id }, label, opts.required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : h('span', { class: 'opt' }, ' (optional)')), control, hint, err);
}

export const input = (attrs: Attrs = {}) => h('input', { type: 'text', ...attrs });
export const num = (value: number, attrs: Attrs = {}) => h('input', { type: 'number', inputmode: 'numeric', value, ...attrs });
export const textarea = (value: string, attrs: Attrs = {}) => { const t = h('textarea', { rows: 4, ...attrs }); t.value = value; return t; };
export function select(options: { value: string; label: string; disabled?: boolean }[], value: string, attrs: Attrs = {}): HTMLSelectElement {
  const s = h('select', attrs, options.map((o) => h('option', { value: o.value, disabled: o.disabled }, o.label)));
  s.value = value; return s;
}
export const btn = (label: Child, onClick: (e: Event) => void, cls = 'btn', attrs: Attrs = {}) => h('button', { type: 'button', class: cls, ...attrs, on: { click: onClick } }, label);
export const link = (href: string, label: Child, cls = '') => h('a', { href, class: cls }, label);

/** Show validation errors: summary at top, inline per field, focus first invalid. Returns true if valid. */
export function showErrors(form: HTMLElement, errors: Record<string, string>): boolean {
  form.querySelectorAll('.field').forEach((f) => { f.classList.remove('has-error'); const e = f.querySelector('.field-error') as HTMLElement | null; if (e) { e.hidden = true; e.textContent = ''; } f.querySelector('[aria-invalid]')?.removeAttribute('aria-invalid'); });
  const summary = form.querySelector('.error-summary') as HTMLElement | null;
  const keys = Object.keys(errors);
  if (summary) {
    clear(summary); summary.hidden = keys.length === 0;
    if (keys.length) append(summary, [h('h3', null, `Please complete ${keys.length} field${keys.length > 1 ? 's' : ''}:`), h('ul', null, keys.map((k) => h('li', null, errors[k]!)))]);
  }
  let first: HTMLElement | null = null;
  for (const k of keys) {
    const f = form.querySelector(`[data-field="${CSS.escape(k)}"]`);
    if (!f) continue;
    f.classList.add('has-error');
    const e = f.querySelector('.field-error') as HTMLElement | null; if (e) { e.hidden = false; e.textContent = errors[k]!; }
    const ctl = f.querySelector('input,select,textarea,button') as HTMLElement | null;
    ctl?.setAttribute('aria-invalid', 'true');
    if (!first) first = ctl;
  }
  if (keys.length) { (first ?? summary)?.focus(); (first ?? summary)?.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }); }
  return keys.length === 0;
}

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce';

// ---- Live announcements and toasts ----
export function announce(msg: string): void { const r = document.getElementById('live'); if (r) { r.textContent = ''; setTimeout(() => (r.textContent = msg), 30); } }
export function toast(msg: string, kind: 'ok' | 'warn' | 'error' = 'ok', action?: { label: string; run: () => void }): void {
  const host = document.getElementById('toasts'); if (!host) return;
  const t = h('div', { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, h('span', null, msg), action ? btn(action.label, () => { action.run(); t.remove(); }, 'btn btn-small') : null, btn('✕', () => t.remove(), 'icon-btn', { 'aria-label': 'Dismiss' }));
  host.appendChild(t); setTimeout(() => t.remove(), action ? 8000 : 4000);
}

// ---- Dialogs (native <dialog> provides focus trapping and Escape handling) ----
export function modal(title: string, body: Child, actions: { label: string; cls?: string; run?: () => boolean | void | Promise<boolean | void> }[] = [{ label: 'Close' }], opts: { wide?: boolean } = {}): HTMLDialogElement {
  const prev = document.activeElement as HTMLElement | null;
  const titleId = fid('dlg');
  const d = h('dialog', { class: `dialog${opts.wide ? ' dialog-wide' : ''}`, 'aria-labelledby': titleId });
  let busy = false;
  const footer = h('div', { class: 'dialog-actions' }, actions.map((a) => btn(a.label, async () => {
    if (busy) return; busy = true;
    try { const r = a.run ? await a.run() : undefined; if (r !== false) close(); } finally { busy = false; }
  }, a.cls ?? 'btn')));
  const close = () => { d.close(); d.remove(); prev?.focus?.(); };
  append(d, [h('div', { class: 'dialog-head' }, h('h2', { id: titleId }, title), btn('✕', close, 'icon-btn', { 'aria-label': 'Close dialog' })), h('div', { class: 'dialog-body' }, body), footer]);
  d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  document.body.appendChild(d); d.showModal();
  const firstInput = d.querySelector<HTMLElement>('.dialog-body input, .dialog-body select, .dialog-body textarea');
  (firstInput ?? d.querySelector<HTMLElement>('.dialog-actions button'))?.focus();
  return d;
}

export function confirmDialog(title: string, message: Child, confirmLabel = 'Confirm', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const d = modal(title, h('div', null, message), [{ label: 'Cancel', cls: 'btn btn-ghost', run: () => { done = true; resolve(false); } }, { label: confirmLabel, cls: danger ? 'btn btn-danger' : 'btn btn-primary', run: () => { done = true; resolve(true); } }]);
    d.addEventListener('close', () => { if (!done) resolve(false); });
  });
}

export function download(filename: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename }); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function readFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const i = h('input', { type: 'file', accept, class: 'visually-hidden' });
    i.addEventListener('change', async () => { const f = i.files?.[0]; i.remove(); resolve(f ? await f.text() : null); });
    document.body.appendChild(i); i.click();
  });
}

export const sign = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
export const card = (title: Child, ...body: Child[]) => h('section', { class: 'card' }, title ? h('h2', { class: 'card-title' }, title) : null, ...body);
export const empty = (msg: string, ...actions: Child[]) => h('div', { class: 'empty' }, h('p', null, msg), ...actions);

/** Append children, skipping null/false (keeps conditional UI terse). */
export const put = (el: Element, ...kids: Child[]): void => append(el, kids);
/** Replace all children, skipping null/false. */
export const fill = (el: Element, ...kids: Child[]): void => { clear(el); append(el, kids); };
