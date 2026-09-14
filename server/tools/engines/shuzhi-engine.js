/*
 * games/nonogram/engine.js —— 数织 (Nonogram) 求解引擎（纯 JS，单文件）
 *
 * 格子状态约定：-1=未知，0=空，1=填充。
 * solution 约定：字符串数组，'#'=填充，'.'=空；行数=高度，每行等宽（列数=宽度）。
 * 随机性约定：所有随机均由调用方注入 rng()（返回 [0,1) 的函数），
 *             可用导出的 mulberry32(seed) 构造确定性 rng。
 * 本文件不使用 DOM、不使用 Math.random、不依赖任何外部库。
 */

'use strict';

/* ==================== 确定性随机 ==================== */

/*
 * FNV-1a 32 位字符串散列。
 *
 * 存在的理由：把非数字种子里直接喂给 mulberry32 会踩一个静默的坑——
 * `'d20260914' >>> 0` 先 ToNumber 得到 NaN、再 ToUint32 得到 0，
 * 于是「按日期定种子」的每一颗种子都塌成同一个 0，每日挑战永远出同一道题。
 * 任何字符串种子都应该先过一遍这里。
 */
function hashSeed(str) {
  const s = String(str);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // 散列撞到 0 时换一个非零常量，避免与「缺省种子」撞车
  return h === 0 ? 0x9e3779b9 : h;
}

// mulberry32 PRNG：mulberry32(seed) 返回 () => [0,1) 的确定性随机函数。
// seed 为数字时按 uint32 解释；为字符串时先经 hashSeed 散列。
function mulberry32(seed) {
  let a = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ==================== 基础工具 ==================== */

// 去掉线索中的 0（空行可能被表示为 [] 或 [0]，两者等价）
function normalizeClue(clue) {
  const out = [];
  for (let i = 0; i < clue.length; i++) if (clue[i] > 0) out.push(clue[i]);
  return out;
}

// 由一行 0/1 求经典线索（连续填充段长度；空行 → []）
function clueOfCells(cells) {
  const clue = [];
  let run = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i]) run++;
    else if (run > 0) { clue.push(run); run = 0; }
  }
  if (run > 0) clue.push(run);
  return clue;
}

// 字符串盘面 → 0/1 数字盘面（二维数组）
function solutionToGrid(rows) {
  const h = rows.length;
  const w = h > 0 ? rows[0].length : 0;
  const grid = new Array(h);
  for (let y = 0; y < h; y++) {
    const row = new Array(w);
    for (let x = 0; x < w; x++) row[x] = rows[y][x] === '#' ? 1 : 0;
    grid[y] = row;
  }
  return grid;
}

// 数字盘面（二维数组）→ 字符串盘面
function gridToSolution(grid) {
  const h = grid.length;
  const rows = new Array(h);
  for (let y = 0; y < h; y++) {
    const row = grid[y];
    let s = '';
    for (let x = 0; x < row.length; x++) s += row[x] === 1 ? '#' : '.';
    rows[y] = s;
  }
  return rows;
}

// 一维 0/1 图案 → 字符串盘面
function flatToSolution(grid, w, h) {
  const rows = new Array(h);
  for (let y = 0; y < h; y++) {
    let s = '';
    const base = y * w;
    for (let x = 0; x < w; x++) s += grid[base + x] ? '#' : '.';
    rows[y] = s;
  }
  return rows;
}

// cluesFromSolution(rows) → { rowClues, colClues }（经典数织线索，空行为 []）
function cluesFromSolution(rows) {
  const grid = solutionToGrid(rows);
  const h = grid.length;
  const w = h > 0 ? grid[0].length : 0;
  const rowClues = new Array(h);
  for (let y = 0; y < h; y++) rowClues[y] = clueOfCells(grid[y]);
  const colClues = new Array(w);
  const col = new Array(h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) col[y] = grid[y][x];
    colClues[x] = clueOfCells(col);
  }
  return { rowClues, colClues };
}

/* ==================== 单行求解核心 ==================== */

/*
 * 单行 DP。canPlace[j][i]：线索块 j..k-1 能否全部放进 cells[i..n-1]，
 * 且尊重已知格（值为 1 的格不能摆成空，值为 0 的格不能被块覆盖）。
 * 返回 null 表示该行无任何合法摆放（矛盾）。
 */
function lineDP(clue, line) {
  const n = line.length;
  const cl = normalizeClue(clue);
  const k = cl.length;

  // 前缀和：ones[i]/zeros[i] = line[0..i-1] 中 1/0 的个数，用于 O(1) 区间判断
  const ones = new Int32Array(n + 1);
  const zeros = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) {
    ones[i + 1] = ones[i] + (line[i] === 1 ? 1 : 0);
    zeros[i + 1] = zeros[i] + (line[i] === 0 ? 1 : 0);
  }

  // 长度下界：所有块 + 最少分隔空格 > 行宽 → 矛盾
  let need = k > 0 ? k - 1 : 0;
  for (let j = 0; j < k; j++) need += cl[j];
  if (need > n) return null;

  const canPlace = new Array(k + 1);
  for (let j = 0; j <= k; j++) canPlace[j] = new Uint8Array(n + 1);
  // j == k：没有剩余块，后缀必须不含 1
  for (let i = 0; i <= n; i++) canPlace[k][i] = ones[n] - ones[i] === 0 ? 1 : 0;

  for (let j = k - 1; j >= 0; j--) {
    const L = cl[j];
    const next = canPlace[j + 1];
    const cur = canPlace[j];
    for (let i = 0; i <= n; i++) {
      // 枚举块 j 的起点 s >= i，要求前缀 cells[i..s-1] 无 1
      let s = i;
      let ok = 0;
      for (;;) {
        if (s + L <= n && zeros[s + L] - zeros[s] === 0) {
          if (j === k - 1) {
            // 最后一块：块后的剩余格子必须全空
            if (ones[n] - ones[s + L] === 0) { ok = 1; break; }
          } else if (s + L < n && line[s + L] !== 1 && next[s + L + 1]) {
            ok = 1; break;
          }
        }
        // 尝试把 s 纳入空前缀；遇到已知的 1 则无法继续右移起点
        if (s >= n || line[s] === 1) break;
        s++;
      }
      cur[i] = ok;
    }
  }
  if (!canPlace[0][0]) return null;
  return { n, k, cl, ones, zeros, canPlace };
}

// solveLine(clue, line) → 新数组：
// 只保留所有合法摆放下都确定的格子（0/1），不确定保持 -1；无合法摆放返回 null。
function solveLine(clue, line) {
  const dp = lineDP(clue, line);
  if (!dp) return null;
  const n = dp.n, k = dp.k, cl = dp.cl;
  const ones = dp.ones, zeros = dp.zeros, canPlace = dp.canPlace;

  const canBeZero = new Uint8Array(n);
  const canBeOne = new Uint8Array(n);
  // reach[j][i]：状态 (i, j) 可从行首到达（且后缀可补全）
  const reach = new Array(k + 1);
  for (let j = 0; j <= k; j++) reach[j] = new Uint8Array(n + 1);
  reach[0][0] = 1;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= k; j++) {
      if (!reach[j][i]) continue;
      // 转移一：格子 i 摆空
      if (line[i] !== 1 && canPlace[j][i + 1]) {
        canBeZero[i] = 1;
        reach[j][i + 1] = 1;
      }
      // 转移二：块 j 恰好从格子 i 开始
      if (j < k) {
        const L = cl[j];
        if (i + L <= n && zeros[i + L] - zeros[i] === 0) {
          if (j === k - 1) {
            // 最后一块：块后剩余必须全空，整行就此完成
            if (ones[n] - ones[i + L] === 0) {
              for (let t = i; t < i + L; t++) canBeOne[t] = 1;
              for (let t = i + L; t < n; t++) canBeZero[t] = 1;
            }
          } else if (i + L < n && line[i + L] !== 1 && canPlace[j + 1][i + L + 1]) {
            for (let t = i; t < i + L; t++) canBeOne[t] = 1;
            canBeZero[i + L] = 1; // 块间分隔格
            reach[j + 1][i + L + 1] = 1;
          }
        }
      }
    }
  }

  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    if (line[i] === 1) { if (!canBeOne[i]) return null; out[i] = 1; }
    else if (line[i] === 0) { if (!canBeZero[i]) return null; out[i] = 0; }
    else if (canBeOne[i] && canBeZero[i]) out[i] = -1;
    else if (canBeOne[i]) out[i] = 1;
    else if (canBeZero[i]) out[i] = 0;
    else return null;
  }
  return out;
}

// 枚举一行在当前已知格约束下的全部合法摆放（0/1 数组）；无解返回 []。
function enumerateLine(clue, line) {
  const dp = lineDP(clue, line);
  if (!dp) return [];
  const n = dp.n, k = dp.k, cl = dp.cl;
  const ones = dp.ones, zeros = dp.zeros, canPlace = dp.canPlace;
  const out = [];
  const acc = new Array(n);

  (function dfs(i, j) {
    if (i >= n) { if (j === k) out.push(acc.slice()); return; }
    // 格子 i 摆空
    if (line[i] !== 1 && canPlace[j][i + 1]) {
      acc[i] = 0;
      dfs(i + 1, j);
    }
    // 块 j 从格子 i 开始
    if (j < k) {
      const L = cl[j];
      if (i + L <= n && zeros[i + L] - zeros[i] === 0) {
        if (j === k - 1) {
          if (ones[n] - ones[i + L] === 0) {
            for (let t = i; t < i + L; t++) acc[t] = 1;
            for (let t = i + L; t < n; t++) acc[t] = 0;
            out.push(acc.slice());
          }
        } else if (i + L < n && line[i + L] !== 1 && canPlace[j + 1][i + L + 1]) {
          for (let t = i; t < i + L; t++) acc[t] = 1;
          acc[i + L] = 0;
          dfs(i + L + 1, j + 1);
        }
      }
    }
  })(0, 0);

  return out;
}

/* ==================== 整盘传播与求解 ==================== */

// 不动点约束传播（带脏标记加速）。原地修改 grid。
// 返回 'solved'（无未知且无矛盾）| 'open'（仍有未知）| 'contradiction'（某行/列无合法摆放）
function propagate(grid, rowClues, colClues) {
  const h = rowClues.length;
  const w = colClues.length;
  const rowDirty = new Uint8Array(h).fill(1);
  const colDirty = new Uint8Array(w).fill(1);
  for (;;) {
    let any = false;
    for (let r = 0; r < h; r++) {
      if (!rowDirty[r]) continue;
      rowDirty[r] = 0;
      const res = solveLine(rowClues[r], grid[r]);
      if (!res) return 'contradiction';
      const row = grid[r];
      for (let c = 0; c < w; c++) {
        if (res[c] !== row[c]) {
          row[c] = res[c];
          if (!colDirty[c]) colDirty[c] = 1;
          any = true;
        }
      }
    }
    for (let c = 0; c < w; c++) {
      if (!colDirty[c]) continue;
      colDirty[c] = 0;
      const col = new Array(h);
      for (let r = 0; r < h; r++) col[r] = grid[r][c];
      const res = solveLine(colClues[c], col);
      if (!res) return 'contradiction';
      for (let r = 0; r < h; r++) {
        if (res[r] !== grid[r][c]) {
          grid[r][c] = res[r];
          if (!rowDirty[r]) rowDirty[r] = 1;
          any = true;
        }
      }
    }
    if (!any) break;
  }
  for (let r = 0; r < h; r++) {
    const row = grid[r];
    for (let c = 0; c < w; c++) if (row[c] === -1) return 'open';
  }
  return 'solved';
}

// solveClassic(rowClues, colClues, grid?) → { solved, grid, contradiction }
// 反复对每行每列做 solveLine 直到不动点；不修改传入的 grid。
function solveClassic(rowClues, colClues, grid) {
  const h = rowClues.length;
  const w = colClues.length;
  const g = new Array(h);
  for (let y = 0; y < h; y++) {
    if (grid) g[y] = grid[y].slice();
    else {
      const row = new Array(w);
      for (let x = 0; x < w; x++) row[x] = -1;
      g[y] = row;
    }
  }
  const st = propagate(g, rowClues, colClues);
  return {
    solved: st === 'solved',
    grid: g,
    contradiction: st === 'contradiction',
  };
}

// countSolutions(rowClues, colClues, limit)：
// 完整解计数。先做迭代传播，再对未知格回溯分支（选未知格最少的行），
// 找到 limit 个解即提前返回。
function countSolutions(rowClues, colClues, limit) {
  const lim = limit == null ? Infinity : limit;
  const h = rowClues.length;
  const w = colClues.length;
  const grid = new Array(h);
  for (let y = 0; y < h; y++) {
    const row = new Array(w);
    for (let x = 0; x < w; x++) row[x] = -1;
    grid[y] = row;
  }
  const st = propagate(grid, rowClues, colClues);
  if (st === 'contradiction') return 0;
  if (st === 'solved') return 1;

  let count = 0;
  (function search(g) {
    if (count >= lim) return;
    // 分支：选未知格最少的行
    let bestR = -1;
    let bestU = w + 1;
    for (let r = 0; r < h; r++) {
      let u = 0;
      const row = g[r];
      for (let c = 0; c < w; c++) if (row[c] === -1) u++;
      if (u > 0 && u < bestU) {
        bestU = u;
        bestR = r;
        if (u === 1) break;
      }
    }
    if (bestR < 0) return;
    const placements = enumerateLine(rowClues[bestR], g[bestR]);
    for (let p = 0; p < placements.length; p++) {
      if (count >= lim) return;
      const ng = new Array(h);
      for (let r = 0; r < h; r++) ng[r] = g[r].slice();
      ng[bestR] = placements[p].slice();
      const st2 = propagate(ng, rowClues, colClues);
      if (st2 === 'contradiction') continue;
      if (st2 === 'solved') { count++; continue; }
      search(ng);
    }
  })(grid);

  return count;
}

/* ==================== 随机聚块图案生成 ==================== */

// 随机游走聚块：全空起步 → 随机起点 → 逐步向相邻格扩张，
// 直到填充率达到约 45%~55%，避免大面积单行孤立点。返回一维 Uint8Array(0/1)。
function randomClusterGrid(w, h, rng) {
  const total = w * h;
  const grid = new Uint8Array(total);
  if (total === 0) return grid;
  let target = Math.round(total * (0.45 + rng() * 0.10)); // 45%~55%
  if (target < 1) target = 1;
  if (target > total) target = total;

  const inFrontier = new Uint8Array(total);
  const frontier = new Int32Array(total); // 每格至多入队一次，容量即 total
  let fLen = 0;
  let filled = 1;
  const start = Math.floor(rng() * total);
  grid[start] = 1;

  function addNeighbors(idx) {
    const x = idx % w;
    if (x > 0 && grid[idx - 1] === 0 && inFrontier[idx - 1] === 0) { inFrontier[idx - 1] = 1; frontier[fLen++] = idx - 1; }
    if (x < w - 1 && grid[idx + 1] === 0 && inFrontier[idx + 1] === 0) { inFrontier[idx + 1] = 1; frontier[fLen++] = idx + 1; }
    if (idx >= w && grid[idx - w] === 0 && inFrontier[idx - w] === 0) { inFrontier[idx - w] = 1; frontier[fLen++] = idx - w; }
    if (idx + w < total && grid[idx + w] === 0 && inFrontier[idx + w] === 0) { inFrontier[idx + w] = 1; frontier[fLen++] = idx + w; }
  }
  addNeighbors(start);

  while (filled < target && fLen > 0) {
    const p = Math.floor(rng() * fLen);
    const idx = frontier[p];
    frontier[p] = frontier[fLen - 1];
    fLen--;
    inFrontier[idx] = 0;
    grid[idx] = 1;
    filled++;
    addNeighbors(idx);
  }
  return grid;
}

// generateClassic(w, h, rng, maxAttempts) → { solution, rowClues, colClues, unique }
// 随机聚块图案 → 生成线索 → countSolutions(…, 2) 验证唯一解；唯一才返回。
// 全部尝试失败返回 { unique:false, ... }（带上最后一次尝试的内容）。
function generateClassic(w, h, rng, maxAttempts) {
  const attempts = maxAttempts == null ? 100 : maxAttempts;
  let last = null;
  for (let t = 0; t < attempts; t++) {
    const g = randomClusterGrid(w, h, rng);
    const solution = flatToSolution(g, w, h);
    const c = cluesFromSolution(solution);
    if (countSolutions(c.rowClues, c.colClues, 2) === 1) {
      return { solution, rowClues: c.rowClues, colClues: c.colClues, unique: true };
    }
    last = { solution, rowClues: c.rowClues, colClues: c.colClues };
  }
  if (last) return { solution: last.solution, rowClues: last.rowClues, colClues: last.colClues, unique: false };
  return { solution: null, rowClues: null, colClues: null, unique: false };
}

/* ==================== 马赛克模式 (Mosaik) ==================== */

// 线索含义：每格自身 + 周围 3×3 邻域内的填充数（0~9，越界部分不计）。

// 一维 0/1 图案 → 马赛克线索（二维数字数组 clues[y][x]）
function mosaikCluesFromFlat(grid, w, h) {
  const clues = new Array(h);
  for (let y = 0; y < h; y++) {
    const row = new Array(w);
    for (let x = 0; x < w; x++) {
      const y0 = y > 0 ? y - 1 : 0, y1 = y < h - 1 ? y + 1 : h - 1;
      const x0 = x > 0 ? x - 1 : 0, x1 = x < w - 1 ? x + 1 : w - 1;
      let s = 0;
      for (let yy = y0; yy <= y1; yy++) {
        const base = yy * w;
        for (let xx = x0; xx <= x1; xx++) s += grid[base + xx];
      }
      row[x] = s;
    }
    clues[y] = row;
  }
  return clues;
}

// mosaikCluesFromSolution(rows) → 二维数字数组
function mosaikCluesFromSolution(rows) {
  const h = rows.length;
  const w = h > 0 ? rows[0].length : 0;
  const grid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) grid[y * w + x] = rows[y][x] === '#' ? 1 : 0;
  }
  return mosaikCluesFromFlat(grid, w, h);
}

/*
 * mosaikCountSolutions(clues, limit)：按行序回溯逐格放置（0/1）并计数。
 * 剪枝：线索格 (cx,cy) 的 3×3 邻域在放置完 (min(cx+1,w-1), min(cy+1,h-1)) 后
 * 恰好全部确定，因此放置 (x,y) 后立刻校验：
 *   - (x-1, y-1)（其邻域此时恰好全部确定）；
 *   - 最右列 (w-1, y-1)（整行完成时）；
 *   - 最下行 (x-1, h-1)（整列/末行推进时）；
 *   - 右下角 (w-1, h-1)（最后一格）。
 */
function mosaikCountSolutions(clues, limit) {
  const lim = limit == null ? Infinity : limit;
  const h = clues.length;
  const w = h > 0 ? clues[0].length : 0;
  const total = w * h;
  if (total === 0) return lim > 0 ? 1 : 0;

  const grid = new Uint8Array(total);
  // checkIdx[idx]：放置 idx 后需要校验的线索格（打包为 cy*w+cx）
  const checkIdx = new Array(total);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const list = [];
      if (x > 0 && y > 0) list.push((y - 1) * w + (x - 1)); // (x-1, y-1)
      if (x === w - 1 && y > 0) list.push((y - 1) * w + x); // (w-1, y-1) 最右列
      if (y === h - 1 && x > 0) list.push(y * w + (x - 1)); // (x-1, h-1) 最下行
      if (x === w - 1 && y === h - 1) list.push(y * w + x); // 右下角
      checkIdx[y * w + x] = list;
    }
  }

  function checkCell(packed) {
    const cy = (packed / w) | 0;
    const cx = packed - cy * w;
    const y0 = cy > 0 ? cy - 1 : 0, y1 = cy < h - 1 ? cy + 1 : h - 1;
    const x0 = cx > 0 ? cx - 1 : 0, x1 = cx < w - 1 ? cx + 1 : w - 1;
    let s = 0;
    for (let yy = y0; yy <= y1; yy++) {
      const base = yy * w;
      for (let xx = x0; xx <= x1; xx++) s += grid[base + xx];
    }
    return s === clues[cy][cx];
  }

  let count = 0;
  (function dfs(idx) {
    if (idx >= total) { count++; return; }
    const checks = checkIdx[idx];
    for (let v = 0; v <= 1 && count < lim; v++) {
      grid[idx] = v;
      let ok = true;
      for (let i = 0; i < checks.length; i++) {
        if (!checkCell(checks[i])) { ok = false; break; }
      }
      if (ok) dfs(idx + 1);
    }
  })(0);

  return count;
}

// mosaikGenerate(w, h, rng, maxAttempts) → { solution, clues, unique }
// 随机聚块图案 → 马赛克线索 → 唯一解验证；全部失败返回 { unique:false, ... }。
function mosaikGenerate(w, h, rng, maxAttempts) {
  const attempts = maxAttempts == null ? 100 : maxAttempts;
  let last = null;
  for (let t = 0; t < attempts; t++) {
    const g = randomClusterGrid(w, h, rng);
    const clues = mosaikCluesFromFlat(g, w, h);
    if (mosaikCountSolutions(clues, 2) === 1) {
      return { solution: flatToSolution(g, w, h), clues, unique: true };
    }
    last = { grid: g, clues };
  }
  if (last) return { solution: flatToSolution(last.grid, w, h), clues: last.clues, unique: false };
  return { solution: null, clues: null, unique: false };
}

/* ==================== 马赛克：约束传播 ==================== */

/*
 * 马赛克约束传播（原地修改 grid）。
 *
 * 每个线索格 (x,y) 给出的数字，是它 3×3 邻域（越界裁剪）内填充格的总数。
 * 设该邻域内「已确定填充」数为 filled、「未确定」数为 unknown，则必须有
 *      filled ≤ clue ≤ filled + unknown
 * 两端取等时即可定死整片邻域：
 *   clue === filled            → 邻域内所有未定格必为空（置 0）
 *   clue === filled + unknown  → 邻域内所有未定格必为填充（置 1）
 * 新定的格子会改变相邻线索格的 filled，故反复迭代到不动点。
 *
 * 返回 'solved'（无未知且无矛盾）| 'open'（仍有未知）| 'contradiction'
 */
function mosaikPropagate(clues, grid) {
  const h = clues.length;
  const w = h > 0 ? clues[0].length : 0;
  if (h === 0 || w === 0) return 'solved';

  const yLo = new Int32Array(h), yHi = new Int32Array(h);
  for (let y = 0; y < h; y++) { yLo[y] = y > 0 ? y - 1 : 0; yHi[y] = y < h - 1 ? y + 1 : h - 1; }
  const xLo = new Int32Array(w), xHi = new Int32Array(w);
  for (let x = 0; x < w; x++) { xLo[x] = x > 0 ? x - 1 : 0; xHi[x] = x < w - 1 ? x + 1 : w - 1; }

  for (;;) {
    let changed = false;
    for (let y = 0; y < h; y++) {
      const y0 = yLo[y], y1 = yHi[y];
      for (let x = 0; x < w; x++) {
        const clue = clues[y][x];
        const x0 = xLo[x], x1 = xHi[x];
        let filled = 0, unknown = 0;
        for (let yy = y0; yy <= y1; yy++) {
          const row = grid[yy];
          for (let xx = x0; xx <= x1; xx++) {
            const v = row[xx];
            if (v === 1) filled++;
            else if (v === -1) unknown++;
          }
        }
        if (filled > clue || filled + unknown < clue) return 'contradiction';
        if (unknown === 0) continue;
        let to;
        if (filled === clue) to = 0;
        else if (filled + unknown === clue) to = 1;
        else continue;
        for (let yy = y0; yy <= y1; yy++) {
          const row = grid[yy];
          for (let xx = x0; xx <= x1; xx++) if (row[xx] === -1) { row[xx] = to; changed = true; }
        }
      }
    }
    if (!changed) break;
  }

  for (let y = 0; y < h; y++) {
    const row = grid[y];
    for (let x = 0; x < w; x++) if (row[x] === -1) return 'open';
  }
  return 'solved';
}

// mosaikSolve(clues, grid?) → { solved, grid, contradiction }
// 与 solveClassic 同形：复制一份再传播，不修改传入的 grid。
function mosaikSolve(clues, grid) {
  const h = clues.length;
  const w = h > 0 ? clues[0].length : 0;
  const g = new Array(h);
  for (let y = 0; y < h; y++) {
    if (grid) g[y] = grid[y].slice();
    else {
      const row = new Array(w);
      for (let x = 0; x < w; x++) row[x] = -1;
      g[y] = row;
    }
  }
  const st = mosaikPropagate(clues, g);
  return { solved: st === 'solved', grid: g, contradiction: st === 'contradiction' };
}

/* ==================== 导出 ==================== */

const API = {
  mulberry32,
  hashSeed,
  cluesFromSolution,
  solveLine,
  solveClassic,
  countSolutions,
  generateClassic,
  mosaikCluesFromSolution,
  mosaikCountSolutions,
  mosaikGenerate,
  mosaikPropagate,
  mosaikSolve,
};

if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
else if (typeof window !== 'undefined') { window.NG = API; }
