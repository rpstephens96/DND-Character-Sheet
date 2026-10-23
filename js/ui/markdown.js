// Safe Markdown subset rendered directly to DOM nodes (no innerHTML).
// Supports: # headings, - lists, - [ ] / - [x] checkboxes, **bold**, *italic*, `code`, [[cross-links]].
import { h } from './dom.js';
export function renderMarkdown(src, resolveLink, onToggle) {
    const root = h('div', { class: 'md' });
    let list = null;
    src.split('\n').forEach((line, idx) => {
        const t = line.trimEnd();
        const task = /^\s*[-*] \[( |x|X)\] (.*)$/.exec(t);
        const item = /^\s*[-*] (.*)$/.exec(t);
        const head = /^(#{1,3}) (.*)$/.exec(t);
        if (task || item) {
            if (!list) {
                list = h('ul');
                root.appendChild(list);
            }
            if (task) {
                const cb = h('input', { type: 'checkbox', checked: task[1] !== ' ', 'aria-label': task[2] });
                if (onToggle)
                    cb.addEventListener('change', () => onToggle(idx, cb.checked));
                else
                    cb.disabled = true;
                list.appendChild(h('li', { class: 'task' }, h('label', null, cb, ' ', ...inline(task[2], resolveLink))));
            }
            else
                list.appendChild(h('li', null, ...inline(item[1], resolveLink)));
            return;
        }
        list = null;
        if (head) {
            root.appendChild(h(head[1].length === 1 ? 'h3' : 'h4', null, ...inline(head[2], resolveLink)));
            return;
        }
        if (t.trim())
            root.appendChild(h('p', null, ...inline(t, resolveLink)));
    });
    return root;
}
function inline(text, resolveLink) {
    const out = [];
    const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[\[[^\]]+\]\])/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
        if (m.index > last)
            out.push(document.createTextNode(text.slice(last, m.index)));
        const tok = m[0];
        if (tok.startsWith('**'))
            out.push(h('strong', null, tok.slice(2, -2)));
        else if (tok.startsWith('[[')) {
            const title = tok.slice(2, -2);
            const href = resolveLink(title);
            out.push(href ? h('a', { href, class: 'xlink' }, title) : h('span', { class: 'xlink-missing', title: 'No record with this title' }, title));
        }
        else if (tok.startsWith('`'))
            out.push(h('code', null, tok.slice(1, -1)));
        else
            out.push(h('em', null, tok.slice(1, -1)));
        last = m.index + tok.length;
    }
    if (last < text.length)
        out.push(document.createTextNode(text.slice(last)));
    return out;
}
export function toggleTaskLine(src, lineIndex, checked) {
    const lines = src.split('\n');
    lines[lineIndex] = lines[lineIndex].replace(/\[( |x|X)\]/, checked ? '[x]' : '[ ]');
    return lines.join('\n');
}
