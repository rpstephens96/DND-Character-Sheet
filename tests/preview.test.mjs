// The single-file preview (dist/ledger-preview.html) must be self-contained, CSP-consistent and actually start.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { installDom } from './support/minidom.mjs';

const html = readFileSync(new URL('../dist/ledger-preview.html', import.meta.url), 'utf8');
const between = (a, b) => { const i = html.lastIndexOf(a); return html.slice(i + a.length, html.indexOf(b, i)); };
const sha = (s) => createHash('sha256').update(s).digest('base64');

test('preview file is self-contained and its CSP hashes match the inline script and style', () => {
  const script = between('<script>', '</script>'); const style = between('<style>', '</style>');
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  assert.ok(csp.includes(`'sha256-${sha(script)}'`), 'script hash'); assert.ok(csp.includes(`'sha256-${sha(style)}'`), 'style hash');
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  assert.doesNotMatch(html, /src="js\/|href="styles\.css"|rel="manifest"/, 'no external app files referenced');
  assert.match(csp, /connect-src https:\/\/raw\.githubusercontent\.com https:\/\/api\.open5e\.com/);
});

test('preview starts from a file with no storage available and shows the preview banner', async () => {
  const doc = installDom();
  const app = doc.createElement('div'); app.id = 'app'; doc.body.append(app);
  globalThis.location.protocol = 'file:';
  vm.runInThisContext(between('<script>', '</script>'), { filename: 'ledger-preview.html' });
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5));
  const text = doc.body.textContent;
  assert.match(text, /Preview mode/);
  assert.match(text, /Your characters/);
  assert.match(text, /Compendium|Character/);
});
