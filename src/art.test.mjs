/**
 * art.js 素材库校验脚本（node 可直接运行）
 *
 *   node art.test.mjs
 *
 * 校验项：
 *   1. puzzles 共 16 幅，id 为 p01~p16 且唯一，name 唯一
 *   2. 每幅 rows 行宽一致，字符只含 # 和 .
 *   3. 尺寸在 8x8 ~ 12x12 之间，填充率在 25% ~ 65% 之间
 *   4. palette 长度 16 且均为合法 hex，颜色不重复
 *   5. colorOf 对每幅返回合法 hex、结果确定且取自 palette
 *   6. art.js 结尾必须是规定的导出代码
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const requireCjs = createRequire(import.meta.url);
const art = requireCjs(join(here, 'art.js'));

const HEX = /^#[0-9a-fA-F]{6}$/;
const { puzzles, palette, colorOf } = art;

// ---------- 1. puzzles 基本结构 ----------
assert.ok(Array.isArray(puzzles), 'puzzles 应该是数组');
assert.equal(puzzles.length, 16, `应有 16 幅谜题，实际 ${puzzles.length}`);

const ids = new Set();
const names = new Set();
const summary = [];

puzzles.forEach((p, i) => {
  const tag = `puzzles[${i}]`;
  assert.ok(p && typeof p === 'object' && !Array.isArray(p), `${tag} 应该是对象`);
  assert.equal(typeof p.id, 'string', `${tag}.id 应该是字符串`);
  assert.match(p.id, /^p\d{2}$/, `${tag}.id "${p.id}" 应形如 p01~p16`);
  assert.ok(!ids.has(p.id), `id 重复: ${p.id}`);
  ids.add(p.id);

  assert.equal(typeof p.name, 'string', `${p.id}.name 应该是字符串`);
  assert.ok(p.name.length >= 2, `${p.id}.name 应该是中文名`);
  assert.ok(!names.has(p.name), `name 重复: ${p.name}`);
  names.add(p.name);

  assert.ok(Array.isArray(p.rows), `${p.id}.rows 应该是字符串数组`);
  const h = p.rows.length;
  assert.ok(h >= 8 && h <= 12, `${p.id}(${p.name}) 高度 ${h} 超出 8~12`);

  for (const row of p.rows) {
    assert.equal(typeof row, 'string', `${p.id}.rows 元素应该是字符串`);
    assert.match(row, /^[#.]*$/, `${p.id}(${p.name}) 行 "${row}" 只能包含 # 和 .`);
  }

  const w = p.rows[0].length;
  assert.ok(w >= 8 && w <= 12, `${p.id}(${p.name}) 宽度 ${w} 超出 8~12`);
  assert.ok(
    p.rows.every((r) => r.length === w),
    `${p.id}(${p.name}) 行宽不一致: ${[...new Set(p.rows.map((r) => r.length))].join(',')}`
  );

  const filled = [...p.rows.join('')].filter((c) => c === '#').length;
  const rate = filled / (w * h);
  assert.ok(
    rate >= 0.25 && rate <= 0.65,
    `${p.id}(${p.name}) 填充率 ${(rate * 100).toFixed(1)}% 超出 25%~65%`
  );
  summary.push({ id: p.id, name: p.name, w, h, rate });
});

const expectedIds = new Set(
  Array.from({ length: 16 }, (_, i) => `p${String(i + 1).padStart(2, '0')}`)
);
assert.deepEqual(ids, expectedIds, 'id 应恰好覆盖 p01~p16');

// ---------- 2. palette ----------
assert.ok(Array.isArray(palette), 'palette 应该是数组');
assert.equal(palette.length, 16, `palette 应有 16 色，实际 ${palette.length}`);
palette.forEach((c, i) => assert.match(c, HEX, `palette[${i}] "${c}" 不是合法 hex 颜色`));
assert.equal(new Set(palette).size, 16, 'palette 中不应有重复颜色');

// ---------- 3. colorOf ----------
assert.equal(typeof colorOf, 'function', 'colorOf 应该是函数');
for (const p of puzzles) {
  const c1 = colorOf(p.id);
  assert.match(c1, HEX, `colorOf("${p.id}") 返回 "${c1}" 不是合法 hex`);
  assert.equal(c1, colorOf(p.id), `colorOf("${p.id}") 结果不确定（两次调用不同）`);
  assert.ok(palette.includes(c1), `colorOf("${p.id}") 返回值不在 palette 中`);
}

// ---------- 4. art.js 结尾必须是规定的导出代码 ----------
const src = readFileSync(join(here, 'art.js'), 'utf8').replace(/\r\n/g, '\n');
const ending =
  "if (typeof module !== 'undefined' && module.exports) { module.exports = API; }\n" +
  "else if (typeof window !== 'undefined') { window.ART = API; }";
assert.ok(
  src.trimEnd().endsWith(ending),
  'art.js 结尾必须是规定的 module.exports / window.ART 导出代码'
);

// ---------- 汇总输出 ----------
console.log('[OK] art.test.mjs 全部校验通过\n');
console.log('  ID   名称     尺寸      填充率  上色');
for (const it of summary) {
  const size = `${it.w}x${it.h}`.padEnd(9);
  const rate = `${(it.rate * 100).toFixed(1)}%`.padStart(6);
  console.log(`  ${it.id}  ${it.name}   ${size}  ${rate}  ${colorOf(it.id)}`);
}
console.log(`\n  共 ${summary.length} 幅像素画，palette ${palette.length} 色`);
