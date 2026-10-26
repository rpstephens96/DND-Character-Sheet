// Minimal DOM shim for smoke-testing view rendering and control handlers in Node (no browser available).
// Implements only what the app uses. It is a test harness, not a browser.
class Node_ {
  constructor() { this.childNodes = []; this.parentNode = null; }
  get firstChild() { return this.childNodes[0] ?? null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] ?? null; }
  appendChild(n) { if (n instanceof Fragment) { [...n.childNodes].forEach((c) => this.appendChild(c)); return n; } n.parentNode?.removeChild(n); n.parentNode = this; this.childNodes.push(n); return n; }
  removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  insertBefore(n, ref) { n.parentNode?.removeChild(n); const i = ref ? this.childNodes.indexOf(ref) : -1; n.parentNode = this; if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n); return n; }
  remove() { this.parentNode?.removeChild(this); }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { this.childNodes.forEach((c) => (c.parentNode = null)); this.childNodes = []; if (v !== '' && v != null) this.appendChild(new Text_(String(v))); }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
}
class Text_ extends Node_ { constructor(t) { super(); this.data = t; } get textContent() { return this.data; } set textContent(v) { this.data = v; } }
class Fragment extends Node_ {}
const listeners = new WeakMap();
class Element_ extends Node_ {
  constructor(tag) { super(); this.tagName = tag.toUpperCase(); this.localName = tag; this.attrs = new Map(); this.style = { cssText: '' }; this.dataset = {}; this._value = ''; this.checked = false; this.disabled = false; this.hidden = false; this.files = null; }
  get children() { return this.childNodes.filter((c) => c instanceof Element_); }
  get lastElementChild() { const c = this.children; return c[c.length - 1] ?? null; }
  get id() { return this.attrs.get('id') ?? ''; } set id(v) { this.attrs.set('id', v); }
  get className() { return this.attrs.get('class') ?? ''; } set className(v) { this.attrs.set('class', v); }
  get classList() { const el = this; const get = () => el.className.split(/\s+/).filter(Boolean); return { add: (...c) => (el.className = [...new Set([...get(), ...c])].join(' ')), remove: (...c) => (el.className = get().filter((x) => !c.includes(x)).join(' ')), contains: (c) => get().includes(c), toggle: (c, f) => { const on = f ?? !get().includes(c); on ? this.classList.add(c) : this.classList.remove(c); return on; } }; }
  setAttribute(k, v) { if (k === 'hidden') this.hidden = true; this.attrs.set(k, String(v)); if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = String(v); }
  getAttribute(k) { return k === 'hidden' ? (this.hidden ? '' : null) : this.attrs.get(k) ?? null; }
  hasAttribute(k) { return k === 'hidden' ? this.hidden : k === 'open' ? !!this.open : this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); if (k === 'hidden') this.hidden = false; }
  append(...n) { n.forEach((x) => this.appendChild(typeof x === 'string' ? new Text_(x) : x)); }
  before(...n) { const p = this.parentNode; if (!p) return; n.forEach((x) => p.insertBefore(typeof x === 'string' ? new Text_(x) : x, this)); }
  prepend(...n) { n.reverse().forEach((x) => this.insertBefore(typeof x === 'string' ? new Text_(x) : x, this.firstChild)); }
  replaceChildren(...n) { this.textContent = ''; this.append(...n); }
  get value() { if (this.tagName === 'SELECT') { const opts = this.querySelectorAll('option'); const sel = opts.find((o) => o._selected) ?? opts[0]; return sel ? sel.value : ''; } if (this.tagName === 'OPTION') return this.attrs.get('value') ?? this.textContent; return this._value; }
  set value(v) { if (this.tagName === 'OPTION') { this.attrs.set('value', String(v)); return; } if (this.tagName === 'SELECT') { this.querySelectorAll('option').forEach((o) => (o._selected = o.value === String(v))); return; } this._value = String(v); }
  get options() { return this.querySelectorAll('option'); }
  addEventListener(t, fn) { const m = listeners.get(this) ?? {}; (m[t] ??= []).push(fn); listeners.set(this, m); }
  removeEventListener() {}
  dispatchEvent(ev) { ev.target ??= this; ev.currentTarget = this; for (const fn of (listeners.get(this) ?? {})[ev.type] ?? []) fn(ev); if (ev.bubbles && !ev._stop && this.parentNode instanceof Element_) this.parentNode.dispatchEvent(ev); return !ev.defaultPrevented; }
  click() {
    if (this.disabled) return;
    if (this.tagName === 'INPUT' && (this.attrs.get('type') === 'checkbox' || this.attrs.get('type') === 'radio')) { this.checked = this.attrs.get('type') === 'radio' ? true : !this.checked; }
    this.dispatchEvent(new Event_('click', { bubbles: true }));
    if (this.tagName === 'INPUT' && ['checkbox', 'radio'].includes(this.attrs.get('type'))) this.dispatchEvent(new Event_('change', { bubbles: true }));
    if (this.tagName === 'BUTTON' && this.attrs.get('type') === 'submit') this.closest('form')?.dispatchEvent(new Event_('submit', { bubbles: true }));
    if (this.tagName === 'A' && this.attrs.get('href')?.startsWith('#')) globalThis.location.hash = this.attrs.get('href').slice(1);
  }
  focus() { globalThis.document.activeElement = this; } blur() {} scrollIntoView() {} select() {}
  closest(sel) { for (let x = this; x instanceof Element_; x = x.parentNode) if (matches(x, sel)) return x; return null; }
  matches(sel) { return matches(this, sel); }
  querySelectorAll(sel) { const out = []; const walk = (n) => n.children.forEach((c) => { if (matches(c, sel)) out.push(c); walk(c); }); walk(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  showModal() { this.open = true; } close() { this.open = false; this.dispatchEvent(new Event_('close')); }
  getContext() { return { drawImage() {} }; } toDataURL() { return 'data:image/jpeg;base64,AA=='; }
}
function matchCompound(el, c) {
  const m = c.match(/^([a-z0-9-]*)((?:[#.][\w-]+|\[[^\]]+\])*)$/i); if (!m) return false;
  if (m[1] && el.localName !== m[1].toLowerCase()) return false;
  for (const part of m[2].match(/[#.][\w-]+|\[[^\]]+\]/g) ?? []) {
    if (part[0] === '#' && el.id !== part.slice(1)) return false;
    if (part[0] === '.' && !el.classList.contains(part.slice(1))) return false;
    if (part[0] === '[') { const [, k, v] = part.match(/^\[([\w-]+)(?:="?([^"\]]*)"?)?\]$/) ?? []; if (!k) return false; if (k === 'open') { if (!el.open) return false; continue; } if (v === undefined ? !el.hasAttribute(k) : el.getAttribute(k) !== v) return false; }
  }
  return true;
}
function matches(el, sel) {
  return sel.split(',').some((group) => { const parts = group.trim().split(/\s+/); if (!matchCompound(el, parts[parts.length - 1])) return false;
    let x = el.parentNode; for (let i = parts.length - 2; i >= 0; i--) { while (x instanceof Element_ && !matchCompound(x, parts[i])) x = x.parentNode; if (!(x instanceof Element_)) return false; x = x.parentNode; } return true; });
}
class Event_ { constructor(type, o = {}) { this.type = type; this.bubbles = !!o.bubbles; this.defaultPrevented = false; } preventDefault() { this.defaultPrevented = true; } stopPropagation() { this._stop = true; } }

export function installDom() {
  const document = new Element_('#document');
  document.documentElement = new Element_('html'); document.body = new Element_('body'); document.head = new Element_('head');
  document.appendChild(document.documentElement); document.documentElement.append(document.head, document.body);
  Object.assign(document, { createElement: (t) => new Element_(t), createTextNode: (t) => new Text_(t), createDocumentFragment: () => new Fragment(), getElementById: (id) => document.querySelector(`#${id}`), activeElement: null, title: '' });
  const g = globalThis;
  g.document = document; g.Node = Node_; g.Element = Element_; g.HTMLElement = Element_; g.Event = Event_;
  g.window = g; g.CSS = { escape: (s) => s };
  g.matchMedia = () => ({ matches: false, addEventListener() {} });
  g.location = { hash: '', protocol: 'http:', reload() {} };
  g.scrollTo = () => {}; g.scrollY = 0; g.alert = () => {}; g.print = () => {};
  g.addEventListener = () => {};
  g.URL.createObjectURL = () => 'blob:x'; g.URL.revokeObjectURL = () => {};
  g.Blob ??= class {};
  g.window.setTimeout = setTimeout;
  try { Object.defineProperty(g, 'navigator', { value: { clipboard: { writeText: async () => {} }, storage: {} }, configurable: true }); } catch { /* read-only in some runtimes */ }
  return document;
}

/** In-memory Repository with the same contract as src/db/db.ts. */
export function memoryRepo() {
  const stores = new Map();
  const s = (n) => { if (!stores.has(n)) stores.set(n, new Map()); return stores.get(n); };
  const cl = (v) => (v === undefined ? v : structuredClone(v));
  return {
    get: async (n, id) => cl(s(n).get(id)), all: async (n) => [...s(n).values()].map(cl),
    byIndex: async (n, k, v) => [...s(n).values()].filter((x) => x[k] === v).map(cl),
    put: async (n, v) => { s(n).set(v.id, cl(v)); }, del: async (n, id) => { s(n).delete(id); },
    tx: async (ops) => { for (const o of ops) { if (o.clear) s(o.store).clear(); o.del?.forEach((id) => s(o.store).delete(id)); o.put?.forEach((v) => s(o.store).set(v.id, cl(v))); } },
    _stores: stores,
  };
}
