# -*- coding: utf-8 -*-
# 内联 src/engine.js / src/art.js → 生成根目录 index.html（各文件包裹 IIFE 隔离作用域）
import io, os
base = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(base, 'src')
eng = io.open(os.path.join(src, 'engine.js'), encoding='utf-8').read()
art = io.open(os.path.join(src, 'art.js'), encoding='utf-8').read()
tpl = io.open(os.path.join(src, 'template.html'), encoding='utf-8').read()
assert '/*__ENGINE__*/' in tpl and '/*__ART__*/' in tpl
NL = chr(10)
wrap = lambda code: '(function(){' + NL + code + NL + '})();'
out = tpl.replace('/*__ENGINE__*/', wrap(eng)).replace('/*__ART__*/', wrap(art))
io.open(os.path.join(base, 'index.html'), 'w', encoding='utf-8').write(out)
print('built index.html,', len(out) // 1024, 'KB')
