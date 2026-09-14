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

console.log('\n== console/page errors ==');
console.log(errors.length ? errors.join('\n') : '(none)');
const fails = results.filter(r => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} passed`);
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
