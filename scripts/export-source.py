# Writes every source file into one text file (ledger-source.txt) for carrying the project between sessions.
import os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
skip_dirs = {'node_modules', 'build', 'dist', '.git'}
out = []
for dp, dns, fns in os.walk(root):
    rel = os.path.relpath(dp, root)
    dns[:] = [d for d in sorted(dns) if d not in skip_dirs and not (rel == 'app' and d in ('js', 'content'))]
    for f in sorted(fns):
        p = os.path.relpath(os.path.join(dp, f), root).replace('\\', '/')
        if p == 'app/sw.js' or f.endswith('.png'): continue
        out.append(f"===== FILE: {p} =====\n" + open(os.path.join(root, p), encoding='utf-8').read())
dest = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'ledger-source.txt')
open(dest, 'w', encoding='utf-8', newline='\n').write('\n'.join(out))
print(len(out), 'files', os.path.getsize(dest), 'bytes')
