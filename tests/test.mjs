import { chromium } from 'playwright-core';
import { resolveChrome } from './chrome.mjs';

const PAGE_URL = new URL('../index.html', import.meta.url).href;
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
};

const browser = await chromium.launch({ headless: true, ...resolveChrome() });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(PAGE_URL);
await page.waitForSelector('.cell', { timeout: 8000 });
await page.waitForTimeout(400);
if (await page.isVisible('#modalHelp.show')) await page.click('#btnHelpOk');

/* ---------- 1. 引擎：生成器唯一性 ---------- */
const gen = await page.evaluate(() => {
  let c = 0, m = 0;
  for (let i = 0; i < 30; i++) if (__nong.gen('classic', 5, 5)?.unique) c++;
  for (let i = 0; i < 20; i++) if (__nong.gen('mosaik', 6, 6)?.unique) m++;
  for (let i = 0; i < 10; i++) if (__nong.gen('classic', 10, 10)?.unique) c++;
  for (let i = 0; i < 10; i++) if (__nong.gen('mosaik', 8, 8)?.unique) m++;
  return { c, m };
});
check('生成器唯一解：经典 40/40、马赛克 30/30', gen.c === 40 && gen.m === 30, JSON.stringify(gen));

/* ---------- 2. 经典随机局：填满 → 胜利 ---------- */
for (let round = 0; round < 3; round++) {
  await page.evaluate(() => __nong.newRandomPuzzle());
  await page.waitForTimeout(250);
  const dims = await page.evaluate(() => __nong.dims());
  await page.evaluate(() => __nong.fillAllCorrect());
  await page.waitForTimeout(800);
  const won = await page.evaluate(() => __nong.state().done && document.querySelector('#modalWin').classList.contains('show'));
  check(`经典 ${dims.w}×${dims.h}：填满 → 胜利弹窗`, won);
  if (round === 0) {
    const name = await page.evaluate(() => document.querySelector('#winName').textContent);
    const artShown = await page.evaluate(() => { const cv = document.querySelector('#winCanvas'); return cv && cv.width > 0; });
    check('胜利卡显示名称与像素画', !!name && artShown, name);
  }
  await page.evaluate(() => document.querySelector('#modalWin').classList.remove('show'));
}

/* ---------- 3. 真实点击：填充 / 失误 / 标记 ---------- */
await page.evaluate(() => __nong.newRandomPuzzle());
await page.waitForTimeout(300);
const probe = await page.evaluate(() => {
  for (let i = 0; i < __nong.solArr().length; i++) {
    if (__nong.solArr()[i] === 1) return { fill: i };
  }
  return null;
});
// 找一个 sol=1 和一个 sol=0 的格子
const cells = await page.evaluate(() => {
  const sol = __nong.solArr();
  let f = -1, e = -1;
  for (let i = 0; i < sol.length; i++) { if (sol[i] === 1 && f < 0) f = i; if (sol[i] === 0 && e < 0) e = i; }
  return { f, e };
});
const __e = cells.e, __f = cells.f;
const total = await page.evaluate(() => __nong.solArr().length);
const cellPt = async idx => {
  const bb = await page.locator(`.cell[data-i="${idx}"]`).boundingBox();
  return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
};
let pt = await cellPt(cells.f);
await page.mouse.click(pt.x, pt.y);
await page.waitForTimeout(120);
const fState = await page.evaluate(i => document.querySelector(`.cell[data-i="${i}"]`).classList.contains('f'), __f);
check('左键点击正确格 → 填充', fState);
const missBefore = await page.evaluate(() => __nong.state().strikes);
pt = await cellPt(cells.e);
await page.mouse.click(pt.x, pt.y);
await page.waitForTimeout(150);
const selE = '.cell[data-i="' + __e + '"]';
const elState = await page.evaluate(sel => {
  const el = document.querySelector(sel);
  return { marked: el.classList.contains('x'), cls: el.className.includes('err') };
}, selE);
const strikesNow = await page.evaluate(() => __nong.state().strikes);
const missAfter = { strikes: strikesNow, marked: elState.marked, cls: elState.cls };
check('左键点击错误格 → 计失误 + 自动改标记', missAfter.strikes === missBefore + 1 && missAfter.marked, JSON.stringify({strikes:missAfter.strikes, marked:missAfter.marked}));
pt = await cellPt((cells.f + 1) % total);
await page.click(`.cell[data-i="${(cells.f + 1) % total}"]`, { button: 'right' });
await page.waitForTimeout(120);
const markIdx = (__f + 1) % total;
const markState = await page.evaluate(i => document.querySelector(`.cell[data-i="${i}"]`).classList.contains('x'), markIdx);
check('右键点击 → 标记 ✕', markState);

/* ---------- 4. 提示 ---------- */
const hBefore = await page.evaluate(() => __nong.state().hints);
await page.click('#btnHint');
await page.waitForTimeout(150);
const hAfter = await page.evaluate(() => __nong.state().hints);
check('提示按钮：计数+1 且揭示格子', hAfter === hBefore + 1);

/* ---------- 5. 马赛克模式 ---------- */
await page.click('#modeSeg button[data-mode="mosaik"]');
await page.waitForTimeout(400);
const mo = await page.evaluate(() => ({
  cells: document.querySelectorAll('#board .cell').length,
  md: document.querySelectorAll('#board .cell .md').length,
  headers: document.querySelectorAll('#board .rc').length,
  dims: __nong.dims(),
}));
check('马赛克棋盘：格内数字、无行列表头', mo.cells === mo.dims.w * mo.dims.h && mo.md === mo.cells && mo.headers === 0, JSON.stringify(mo));
await page.evaluate(() => __nong.fillAllCorrect());
await page.waitForTimeout(800);
check('马赛克：填满 → 胜利', await page.evaluate(() => __nong.state().done) && await page.isVisible('#modalWin.show'));
await page.evaluate(() => document.querySelector('#modalWin').classList.remove('show'));

/* ---------- 6. 每日挑战：确定性 ---------- */
await page.click('#modeSeg button[data-mode="daily"]');
await page.waitForTimeout(500);
const daily1 = await page.evaluate(() => ({ sol: __nong.solArr(), name: document.querySelector('#puzzleName').textContent }));
check('每日挑战生成（名称含日期）', /\d{4}\.\d{2}\.\d{2}/.test(daily1.name), daily1.name);
await page.reload();
await page.waitForSelector('.cell');
await page.waitForTimeout(500);
if (await page.isVisible('#modalHelp.show')) await page.click('#btnHelpOk');
await page.click('#modeSeg button[data-mode="daily"]');
await page.waitForTimeout(500);
const daily2 = await page.evaluate(() => __nong.solArr());
check('每日挑战跨刷新确定性（全服同题）', JSON.stringify(daily1.sol) === JSON.stringify(daily2));

/* ---------- 7. 画廊 ---------- */
await page.click('#btnGallery');
await page.waitForTimeout(300);
const gal = await page.evaluate(() => ({
  items: document.querySelectorAll('#galleryGrid .gal-item').length,
  locked: document.querySelectorAll('#galleryGrid .gal-item.locked').length,
}));
check('画廊 16 幅且全部未解锁', gal.items === 16 && gal.locked === 16, JSON.stringify(gal));
// 解第一幅
await page.click('#galleryGrid .gal-item');
await page.waitForTimeout(400);
await page.evaluate(() => __nong.fillAllCorrect());
await page.waitForTimeout(900);
await page.evaluate(() => document.querySelector('#modalWin').classList.remove('show'));
await page.click('#btnGallery');
await page.waitForTimeout(300);
const gal2 = await page.evaluate(() => ({
  unlocked: 16 - document.querySelectorAll('#galleryGrid .gal-item.locked').length,
  firstName: document.querySelector('#galleryGrid .gal-item:not(.locked) .gn')?.textContent,
}));
check('解出后画廊点亮彩色原画', gal2.unlocked === 1 && gal2.firstName && gal2.firstName !== '？？？', JSON.stringify(gal2));
await page.click('#btnGalClose');

/* ---------- 8. 刷新持久化 ---------- */
await page.reload();
await page.waitForSelector('.cell');
await page.waitForTimeout(400);
if (await page.isVisible('#modalHelp.show')) await page.click('#btnHelpOk');
const persisted = await page.evaluate(() => localStorage.getItem('nonogram.v1')?.includes('p01') || localStorage.getItem('nonogram.v1')?.includes('"p01"'));
check('刷新后解锁进度持久化', persisted);

/* ---------- 9. 音效开关 ---------- */
await page.click('#btnSound');
const snd = await page.evaluate(() => document.querySelector('#btnSound').textContent);
await page.click('#btnSound');
check('音效开关正常', snd === '🔇');

/* ---------- 10. 马赛克棋盘几何（回归：曾整盘塌成一条 2px 横线） ---------- */
await page.click('#modeSeg button[data-mode="mosaik"]');
await page.waitForTimeout(500);
const mg = await page.evaluate(() => {
  const b = document.querySelector('#board').getBoundingClientRect();
  const c = document.querySelector('#board .cell').getBoundingClientRect();
  const cs = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cs'));
  const st = __nong.state();
  return { cellW: +c.width.toFixed(1), cellH: +c.height.toFixed(1), cs, boardH: +b.height.toFixed(1),
           w: st.w, h: st.h, mosaikClass: document.querySelector('#board').classList.contains('mosaik') };
});
check('马赛克棋盘：格子为正方形且边长 = --cs', Math.abs(mg.cellW - mg.cellH) <= 1 && Math.abs(mg.cellW - mg.cs) <= 1,
  `${mg.cellW}×${mg.cellH} (--cs=${mg.cs})`);
check('马赛克棋盘：高度 ≈ 行数×格子边长（不再塌陷）', Math.abs(mg.boardH - mg.h * mg.cs) <= mg.h + 2,
  `board ${mg.boardH} vs ${(mg.h * mg.cs).toFixed(0)}`);
check('马赛克棋盘带 mosaik 类（角标样式依赖它）', mg.mosaikClass);

/* ---------- 11. 马赛克：标记符不覆盖格内数字 ---------- */
const mkIdx = await page.evaluate(() => __nong.solArr().findIndex((v) => v === 0));
await page.click(`.cell[data-i="${mkIdx}"]`, { button: 'right' });
await page.waitForTimeout(220);
const mk = await page.evaluate((i) => {
  const el = document.querySelector(`.cell[data-i="${i}"]`);
  const ca = getComputedStyle(el, '::after');
  return { display: ca.display, fontSize: parseFloat(ca.fontSize), cell: el.getBoundingClientRect().width };
}, mkIdx);
check('马赛克标记 ✕ 改为右上角小角标（数字仍可读）', mk.display === 'block' && mk.fontSize < mk.cell * 0.45, JSON.stringify(mk));
await page.click(`.cell[data-i="${mkIdx}"]`, { button: 'right' });
await page.waitForTimeout(150);

/* ---------- 12. 马赛克：提示落在「可推理」的格子 ---------- */
const hRes = await page.evaluate(() => {
  let visible = 0, wrong = 0;
  for (let t = 0; t < 6; t++) {
    const before = __nong.gridArr();
    __nong.hint();
    const after = __nong.gridArr(), sol = __nong.solArr();
    const changed = after.map((v, i) => (v !== before[i] ? i : -1)).filter((i) => i >= 0);
    if (changed.length === 1) visible++;
    for (const i of changed) if ((sol[i] === 1) !== (after[i] === 1)) wrong++;
  }
  return { visible, wrong };
});
check('马赛克：每次提示都有可见变化且与解一致', hRes.visible === 6 && hRes.wrong === 0, JSON.stringify(hRes));

/* ---------- 13. 马赛克：演示用推理推进到胜利 ---------- */
await page.click('#modeSeg button[data-mode="mosaik"]');
await page.waitForTimeout(400);
await page.evaluate(async () => { await __nong.demo(); });
await page.waitForTimeout(300);
const dRes = await page.evaluate(() => ({ done: __nong.state().done, mismatch: __nong.state().mismatch }));
check('马赛克演示：走完 → 胜利且零错格', dRes.done && dRes.mismatch === 0, JSON.stringify(dRes));
await page.evaluate(() => document.querySelector('#modalWin').classList.remove('show'));

/* ---------- 14. 每日挑战：日期种子 / 按钮高亮 / 通关记录 ---------- */
await page.reload();
await page.waitForSelector('.cell');
await page.waitForTimeout(300);
if (await page.isVisible('#modalHelp.show')) await page.click('#btnHelpOk');
const dailyAt = async (iso) => {
  await page.evaluate((s) => {
    const R = Date, fixed = new R(s + 'T12:00:00').getTime();
    window.Date = class extends R {
      constructor(...a) { a.length === 0 ? super(fixed) : super(...a); }
      static now() { return fixed; }
    };
  }, iso);
  await page.click('#modeSeg button[data-mode="daily"]');
  await page.waitForTimeout(650);
  return page.evaluate(() => ({ sol: __nong.solArr().join(''), st: __nong.state() }));
};
const d14 = await dailyAt('2026-09-14');
const d15 = await dailyAt('2026-09-15');
const d16 = await dailyAt('2026-09-16');
const d17 = await dailyAt('2026-09-17');
check('每日挑战：连续 4 天出 4 道不同的题（回归：曾经隔天就重复）',
  new Set([d14.sol, d15.sol, d16.sol, d17.sol]).size === 4);
check('每日挑战：同一天重复进入题目一致（全服同题）', (await dailyAt('2026-09-16')).sol === d16.sol);
check('每日挑战：模式按钮保持在「每日」高亮', d16.st.onBtn === 'daily' && d16.st.daily === true,
  JSON.stringify({ onBtn: d16.st.onBtn, mode: d16.st.mode }));
check('每日挑战：题名含日期', /^\d{4}\.\d{2}\.\d{2}$/.test(d16.st.name), d16.st.name);

await page.evaluate(() => __nong.fillAllCorrect());
await page.waitForTimeout(900);
const dw = await page.evaluate(() => ({
  name: document.querySelector('#puzzleName').textContent,
  rec: JSON.parse(localStorage.getItem('nonogram.v1') || '{}').daily,
  dk: __nong.state().dk,
}));
check('每日通关：标题出现 ✓', dw.name.includes('✓'), dw.name);
check('每日通关：写入当天的 done/best/plays 记录',
  !!dw.rec[dw.dk] && dw.rec[dw.dk].done === true && dw.rec[dw.dk].plays >= 1, JSON.stringify(dw.rec));
await page.evaluate(() => document.querySelector('#modalWin').classList.remove('show'));
await page.reload();
await page.waitForSelector('.cell');
await page.waitForTimeout(300);
if (await page.isVisible('#modalHelp.show')) await page.click('#btnHelpOk');
await page.evaluate(() => {
  const R = Date, fixed = new R('2026-09-16T12:00:00').getTime();
  window.Date = class extends R {
    constructor(...a) { a.length === 0 ? super(fixed) : super(...a); }
    static now() { return fixed; }
  };
});
await page.click('#modeSeg button[data-mode="daily"]');
await page.waitForTimeout(700);
const re = await page.evaluate(() => ({
  name: document.querySelector('#puzzleName').textContent,
  toast: document.querySelector('#toast').textContent,
}));
check('每日通关：刷新后再进能看到已完成状态', re.name.includes('✓') && /今日已完成/.test(re.toast), JSON.stringify(re));

console.log('\n== console/page errors ==');
console.log(errors.length ? errors.join('\n') : '(none)');
const fails = results.filter(r => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} passed`);
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
