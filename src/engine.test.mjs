/*
 * engine.test.mjs —— 数织求解引擎自测
 * 运行：node engine.test.mjs  （必须全绿）
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const NG = require('./engine.js');

const {
  mulberry32,
  cluesFromSolution,
  solveLine,
  solveClassic,
  countSolutions,
  generateClassic,
  mosaikCluesFromSolution,
  mosaikCountSolutions,
  mosaikGenerate,
} = NG;

function solutionToNumeric(rows) {
  return rows.map((r) => [...r].map((ch) => (ch === '#' ? 1 : 0)));
}
function solutionFill(rows) {
  let f = 0;
  for (const row of rows) for (const ch of row) if (ch === '#') f++;
  return f;
}
function hrMs(t0) {
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

/* ==================== 0. API 形状 & mulberry32 ==================== */
{
  for (const name of [
    'mulberry32', 'hashSeed', 'cluesFromSolution', 'solveLine', 'solveClassic',
    'countSolutions', 'generateClassic',
    'mosaikCluesFromSolution', 'mosaikCountSolutions', 'mosaikGenerate',
    'mosaikPropagate', 'mosaikSolve',
  ]) {
    assert.equal(typeof NG[name], 'function', `API.${name} 应为函数`);
  }
  // 同种子序列完全一致
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 200; i++) assert.equal(a(), b());
  // 取值范围 [0,1)
  const c = mulberry32(7);
  for (let i = 0; i < 1000; i++) {
    const v = c();
    assert.ok(v >= 0 && v < 1, 'mulberry32 取值应在 [0,1)');
  }
  console.log('[ok] API 形状 + mulberry32 确定性');
}

/* ==================== 1. cluesFromSolution ==================== */
{
  const rows = ['#..#', '##.#', '....', '#.##'];
  const { rowClues, colClues } = cluesFromSolution(rows);
  assert.deepEqual(rowClues, [[1, 1], [2, 1], [], [1, 2]]);
  assert.deepEqual(colClues, [[2, 1], [1], [1], [2, 1]]);

  // 空行 / 空盘
  const e = cluesFromSolution(['...', '...']);
  assert.deepEqual(e.rowClues, [[], []]);
  assert.deepEqual(e.colClues, [[], [], []]);

  // 整行填满
  const f = cluesFromSolution(['####']);
  assert.deepEqual(f.rowClues, [[4]]);
  assert.deepEqual(f.colClues, [[1], [1], [1], [1]]);
  console.log('[ok] cluesFromSolution');
}

/* ==================== 2. solveLine 传播 ==================== */
{
  // 线索 [3]、行宽 5：中间格必然填充，其余不定
  assert.deepEqual(solveLine([3], [-1, -1, -1, -1, -1]), [-1, -1, 1, -1, -1]);
  // 端部已知填充 → 块被顶死，另一端必然为空
  assert.deepEqual(solveLine([3], [-1, -1, -1, -1, 1]), [0, 0, 1, 1, 1]);
  assert.deepEqual(solveLine([3], [1, -1, -1, -1, -1]), [1, 1, 1, 0, 0]);
  // 已知两格相连且恰为整块 → 两端必然为空
  assert.deepEqual(solveLine([2], [-1, -1, 1, 1, -1]), [0, 0, 1, 1, 0]);
  // 已知填充格收窄块位置 → 触及不到的端部为空
  assert.deepEqual(solveLine([2], [-1, 1, -1, -1, -1]), [-1, 1, -1, 0, 0]);
  assert.deepEqual(solveLine([3], [-1, -1, -1, 1, -1, -1]), [0, -1, -1, 1, -1, -1]);
  // 结合已知空格
  assert.deepEqual(solveLine([2], [0, -1, -1, -1, 0]), [0, -1, 1, -1, 0]);
  assert.deepEqual(solveLine([1], [0, -1, 0]), [0, 1, 0]);
  // 空行（[] 与 [0] 等价）
  assert.deepEqual(solveLine([], [-1, 0, -1]), [0, 0, 0]);
  assert.deepEqual(solveLine([0], [-1, -1]), [0, 0]);
  // 整块已知
  assert.deepEqual(solveLine([2, 2], [-1, -1, -1, -1, -1]), [1, 1, 0, 1, 1]);

  // 矛盾 → null
  assert.equal(solveLine([3], [1, 0, 0, -1, -1]), null);
  assert.equal(solveLine([2, 2], [-1, 0, -1, -1, -1]), null);
  assert.equal(solveLine([5], [1, 1, 1, 0, 1]), null);
  assert.equal(solveLine([4], [-1, -1, -1]), null);

  // 不修改输入行
  const src = [-1, -1, 1, -1, 0];
  const snapshot = src.slice();
  solveLine([2], src);
  assert.deepEqual(src, snapshot);
  // 返回的是新数组
  const ret = solveLine([2], src);
  assert.notEqual(ret, src);
  console.log('[ok] solveLine 传播正确性');
}

/* ==================== 3. solveClassic ==================== */
{
  // 手工构造的 5x5 小局（线传播可解）
  const sol5 = ['.###.', '#####', '##.##', '#####', '.###.'];
  const rowClues = [[3], [5], [2, 2], [5], [3]];
  const colClues = [[3], [5], [2, 2], [5], [3]];

  const res = solveClassic(rowClues, colClues);
  assert.equal(res.contradiction, false);
  assert.equal(res.solved, true);
  assert.deepEqual(res.grid, solutionToNumeric(sol5));

  // 带初始已知格求解，且不修改传入 grid
  const partial = [
    [0, -1, -1, -1, -1],
    [-1, -1, -1, -1, -1],
    [-1, -1, -1, -1, -1],
    [-1, -1, -1, -1, -1],
    [-1, -1, -1, -1, -1],
  ];
  const res2 = solveClassic(rowClues, colClues, partial);
  assert.equal(res2.solved, true);
  assert.equal(res2.grid[0][0], 0);
  assert.equal(res2.grid[2][2], 0);
  assert.equal(partial[1][1], -1, '传入 grid 不应被修改');

  // 矛盾局
  const bad = solveClassic([[2], [2]], [[1], [1]]);
  assert.equal(bad.contradiction, true);
  assert.equal(bad.solved, false);

  // 仅靠行/列传播无法推进的局：不矛盾也未完成
  const amb = solveClassic([[1], [1]], [[1], [1]]);
  assert.equal(amb.contradiction, false);
  assert.equal(amb.solved, false);
  assert.deepEqual(amb.grid, [[-1, -1], [-1, -1]]);
  console.log('[ok] solveClassic');
}

/* ==================== 4. countSolutions ==================== */
{
  // 2x2 双解局（两条对角线）
  assert.equal(countSolutions([[1], [1]], [[1], [1]], 10), 2);
  // limit 提前返回
  assert.equal(countSolutions([[1], [1]], [[1], [1]], 1), 1);
  // 唯一解 5x5
  assert.equal(countSolutions([[3], [5], [2, 2], [5], [3]], [[3], [5], [2, 2], [5], [3]], 2), 1);
  // 矛盾局 → 0
  assert.equal(countSolutions([[2], [2]], [[1], [1]], 10), 0);
  // 全空盘只有 1 解（[] 与 [0] 等价）
  assert.equal(countSolutions([[], []], [[], [], []], 10), 1);
  assert.equal(countSolutions([[0], [0]], [[0], [0], [0]], 10), 1);
  // 2x3 构造：行各填 1、前两列各恰好 1、末列全空 → 第一二行分别占前两列之一，共 2 解
  assert.equal(countSolutions([[1], [1]], [[1], [1], [0]], 100), 2);
  // 行计 2 填 vs 列计 3 填 → 交叉矛盾 → 0
  assert.equal(countSolutions([[1], [1]], [[1], [1], [1]], 100), 0);
  console.log('[ok] countSolutions（含双解=2、limit 提前返回、矛盾=0）');
}

/* ==================== 5. generateClassic ==================== */
for (const [w, h, seeds] of [[5, 5, 50], [10, 10, 50]]) {
  const label = `generateClassic(${w},${h}) x${seeds}`;
  const t0 = process.hrtime.bigint();
  console.time(label);
  const results = [];
  for (let seed = 1; seed <= seeds; seed++) {
    results.push(generateClassic(w, h, mulberry32(seed), 300));
  }
  console.timeEnd(label);
  const avg = hrMs(t0) / seeds;

  results.forEach((g, i) => {
    const seed = i + 1;
    assert.equal(g.unique, true, `${w}x${h} seed=${seed} 应生成唯一解局`);
    assert.equal(g.solution.length, h);
    for (const row of g.solution) assert.equal(row.length, w);
    // 回头验算：cluesFromSolution 与返回线索一致
    const back = cluesFromSolution(g.solution);
    assert.deepEqual(back.rowClues, g.rowClues, `${w}x${h} seed=${seed} 行线索验算`);
    assert.deepEqual(back.colClues, g.colClues, `${w}x${h} seed=${seed} 列线索验算`);
    // 再次确认唯一，且传播不矛盾
    assert.equal(countSolutions(g.rowClues, g.colClues, 2), 1);
    assert.equal(solveClassic(g.rowClues, g.colClues).contradiction, false);
    // 填充率约 45%~55%
    const fill = solutionFill(g.solution) / (w * h);
    assert.ok(fill >= 0.43 && fill <= 0.57, `${w}x${h} seed=${seed} 填充率 ${fill.toFixed(2)} 应在 45%~55% 附近`);
  });

  console.log(`     平均 ${avg.toFixed(2)}ms/次`);
  if (w === 10) assert.ok(avg <= 50, `generateClassic(10,10) 平均耗时 ${avg.toFixed(2)}ms 超过 50ms`);
}

/* ==================== 6. 马赛克 (Mosaik) ==================== */
{
  // 线索生成
  assert.deepEqual(mosaikCluesFromSolution(['###', '###', '###']), [[4, 6, 4], [6, 9, 6], [4, 6, 4]]);
  assert.deepEqual(mosaikCluesFromSolution(['#']), [[1]]);
  assert.deepEqual(mosaikCluesFromSolution(['..', '..']), [[0, 0], [0, 0]]);
  assert.deepEqual(mosaikCluesFromSolution(['#.', '.#']), [[2, 2], [2, 2]]);

  // 计数：唯一 / 双解 / 提前返回
  assert.equal(mosaikCountSolutions([[4, 6, 4], [6, 9, 6], [4, 6, 4]], 10), 1);
  assert.equal(mosaikCountSolutions([[0, 0], [0, 0]], 10), 1);
  assert.equal(mosaikCountSolutions([[1, 1]], 10), 2);   // 1x2 一填一空，两种
  assert.equal(mosaikCountSolutions([[1, 1]], 1), 1);    // limit 提前返回
  assert.equal(mosaikCountSolutions([[3, 3, 2], [3, 3, 2]], 10), 2); // ['##.','.#.'] 恰好双解
  assert.equal(mosaikCountSolutions([[0]], 10), 1);
  assert.equal(mosaikCountSolutions([[1]], 10), 1);
  // 矛盾线索（1x1 不可能填 2 个）
  assert.equal(mosaikCountSolutions([[2]], 10), 0);
  console.log('[ok] mosaikCluesFromSolution + mosaikCountSolutions');
}

for (const [w, h, seeds] of [[6, 6, 30], [8, 8, 30]]) {
  const label = `mosaikGenerate(${w},${h}) x${seeds}`;
  const t0 = process.hrtime.bigint();
  console.time(label);
  const results = [];
  for (let seed = 1; seed <= seeds; seed++) {
    results.push(mosaikGenerate(w, h, mulberry32(seed), 300));
  }
  console.timeEnd(label);
  const avg = hrMs(t0) / seeds;

  results.forEach((g, i) => {
    const seed = i + 1;
    assert.equal(g.unique, true, `mosaik ${w}x${h} seed=${seed} 应生成唯一解局`);
    assert.equal(g.solution.length, h);
    for (const row of g.solution) assert.equal(row.length, w);
    // 回头验算：线索与解一致
    assert.deepEqual(mosaikCluesFromSolution(g.solution), g.clues, `mosaik ${w}x${h} seed=${seed} 线索验算`);
  });
  // 计时外再独立复验唯一性
  for (const g of results) assert.equal(mosaikCountSolutions(g.clues, 2), 1);

  console.log(`     平均 ${avg.toFixed(2)}ms/次`);
  if (w === 8) assert.ok(avg <= 50, `mosaikGenerate(8,8) 平均耗时 ${avg.toFixed(2)}ms 超过 50ms`);
}

/* ==================== 7. hashSeed / 字符串种子 ==================== */
{
  assert.equal(typeof NG.hashSeed, 'function', 'API.hashSeed 应为函数');
  assert.equal(NG.hashSeed('d20260914'), NG.hashSeed('d20260914'), '散列应确定');
  assert.notEqual(NG.hashSeed('d20260914'), NG.hashSeed('d20260915'), '相邻日期散列应不同');
  assert.ok(NG.hashSeed('d20260914') > 0, '散列应为正整数');

  // 回归：字符串种子直接喂给 mulberry32 时，'d20260914' >>> 0 === 0，
  // 于是所有日期共用同一个种子（每日挑战实际只有一道题在循环）。
  assert.equal('d20260914' >>> 0, 0, '前提：字符串直接 >>> 0 会塌成 0');
  const a = mulberry32('d20260914'), b = mulberry32('d20260915');
  assert.notDeepEqual([a(), a(), a()], [b(), b(), b()], '不同日期字符串应产生不同随机序列');

  // 同字符串仍确定；数字种子行为不变
  const c1 = mulberry32('d20260914'), c2 = mulberry32('d20260914');
  for (let i = 0; i < 50; i++) assert.equal(c1(), c2());
  const n1 = mulberry32(42), n2 = mulberry32(42);
  for (let i = 0; i < 50; i++) assert.equal(n1(), n2());

  // 28 个连续日期种子两两不同
  const seeds = [];
  for (let d = 1; d <= 28; d++) seeds.push(NG.hashSeed('d2026' + (900 + d) + String(d).padStart(2, '0')));
  assert.equal(new Set(seeds).size, 28, '28 个日期种子应互不相同');
  console.log('[ok] hashSeed + mulberry32 字符串种子');
}

/* ==================== 8. mosaikSolve（约束传播）手工例 ==================== */
{
  assert.equal(typeof NG.mosaikPropagate, 'function', 'API.mosaikPropagate 应为函数');
  assert.equal(typeof NG.mosaikSolve, 'function', 'API.mosaikSolve 应为函数');

  const g = (rows) => NG.mosaikSolve(rows).grid;
  assert.deepEqual(g([[1]]), [[1]]);                        // 1x1 线索 1 → 必填
  assert.deepEqual(g([[0]]), [[0]]);                        // 1x1 线索 0 → 必空
  assert.deepEqual(g([[2]]).length, 1);
  assert.equal(NG.mosaikSolve([[2]]).contradiction, true);  // 1x1 邻域只 1 格，填不了 2
  assert.deepEqual(g([[2, 2]]), [[1, 1]]);                  // 互为邻域、线索 2 → 两格都填
  assert.deepEqual(g([[0, 0], [0, 0]]), [[0, 0], [0, 0]]);  // 全 0 → 全空
  assert.deepEqual(g([[4, 6, 4], [6, 9, 6], [4, 6, 4]]), [[1, 1, 1], [1, 1, 1], [1, 1, 1]]);

  // 不修改传入 grid
  const src = [[-1, -1], [-1, -1]];
  const snap = src.map((r) => r.slice());
  NG.mosaikSolve([[3, 3], [3, 3]], src);
  assert.deepEqual(src, snap, 'mosaikSolve 不应修改传入 grid');

  // 对真实马赛克局：传播推出的每一格都必须与解一致，且不得误报矛盾
  for (let seed = 1; seed <= 10; seed++) {
    const mg = mosaikGenerate(6, 6, mulberry32(seed), 300);
    const res = NG.mosaikSolve(mg.clues);
    assert.equal(res.contradiction, false, `seed=${seed} 传播不应报矛盾`);
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        const v = res.grid[y][x];
        if (v === -1) continue;
        assert.equal(v, mg.solution[y][x] === '#' ? 1 : 0, `seed=${seed} (${x},${y}) 推导与解不符`);
      }
    }
  }
  console.log('[ok] mosaikSolve 手工例 + 与真实唯一解一致');
}

/* ==================== 9. mosaikPropagate 可靠性（对照暴力枚举） ==================== */
{
  // 暴力枚举该线索下所有 0/1 盘面解
  function brute(clues) {
    const h = clues.length, w = clues[0].length, total = w * h;
    const sols = [];
    const b = new Uint8Array(total);
    for (let mask = 0; mask < (1 << total); mask++) {
      for (let i = 0; i < total; i++) b[i] = (mask >> i) & 1;
      let ok = true;
      for (let y = 0; y < h && ok; y++) {
        for (let x = 0; x < w && ok; x++) {
          const y0 = Math.max(0, y - 1), y1 = Math.min(h - 1, y + 1);
          const x0 = Math.max(0, x - 1), x1 = Math.min(w - 1, x + 1);
          let s = 0;
          for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) s += b[yy * w + xx];
          if (s !== clues[y][x]) ok = false;
        }
      }
      if (ok) sols.push(b.slice());
    }
    return sols;
  }
  function cluesOf(g2, w, h) {
    const out = [];
    for (let y = 0; y < h; y++) {
      const row = [];
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy++)
          for (let xx = Math.max(0, x - 1); xx <= Math.min(w - 1, x + 1); xx++) s += g2[yy * w + xx];
        row.push(s);
      }
      out.push(row);
    }
    return out;
  }

  let checked = 0, deduced = 0;
  const rng = mulberry32(20260914);
  for (const [w, h, n] of [[3, 3, 512], [4, 4, 300], [3, 5, 200]]) {
    for (let t = 0; t < n; t++) {
      let raw;
      if (w === 3 && h === 3) {           // 3x3 全枚举 512 个盘面
        raw = new Uint8Array(9);
        for (let i = 0; i < 9; i++) raw[i] = (t >> i) & 1;
      } else {
        raw = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) raw[i] = rng() < 0.5 ? 1 : 0;
      }
      const clues = cluesOf(raw, w, h);
      const sols = brute(clues);
      if (sols.length === 0) continue;
      const res = NG.mosaikSolve(clues);
      checked++;
      assert.equal(res.contradiction, false, `有解却报矛盾: ${JSON.stringify(clues)}`);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const v = res.grid[y][x];
          if (v === -1) continue;
          deduced++;
          for (const s of sols) {
            assert.equal(s[y * w + x], v, `推导不可靠: clues=${JSON.stringify(clues)} (${x},${y}) 推出 ${v}`);
          }
        }
      }
      if (res.solved) assert.equal(sols.length, 1, '声称 solved 时解必须唯一');
    }
  }
  assert.ok(checked > 900, `抽样量偏少: ${checked}`);
  console.log(`[ok] mosaikPropagate 可靠性：${checked} 组线索、${deduced} 个推导，全部与暴力枚举一致`);
}

console.log('ALL TESTS PASSED');
