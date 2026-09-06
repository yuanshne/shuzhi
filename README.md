# 数织·奇想 · Nonogram Fantasy

原神风格 UI 的轻量数织（Nonogram）网页游戏。**单文件、零依赖、离线可玩**——下载 `index.html` 双击即玩。

## 三种玩法

- **经典 CLASSIC**：行/列数字 = 连续填充段长度（5×5 / 10×10 / 15×15 随机）。
- **马赛克 MOSAIK**：每个格子的数字 = 以它为中心的 3×3 邻域（含自身）填充总数——推理方式完全不同。
- **每日 DAILY**：按日期生成全服同一题（经典/马赛克隔日轮换），记录当日最佳时间。

## 特色

- **唯一解保证**：每道随机谜题都经求解器验证恰好一个解（算法自带拒绝采样 + 回溯计数）；
- **画廊**：16 幅手绘像素画，解出一幅永久点亮彩色原画；
- **计分**：基础分 − 时间 − 失误×100 − 提示×50，失误即时判定（填错自动改 ✕）；
- **提示**：经典模式优先揭示"可推理"的格子（基于行约束传播求解器）；
- **演示**：逐步动画展示求解器推理过程；
- 拖拽批量涂格 / 右键排除 / 标记模式 / 音效（Web Audio 合成，可开关）/ 移动端触控 / 进度本地存档。

## 技术要点

- 纯 CSS Grid + DOM，零依赖单文件；数字与线索为真实文本，清晰锐利；
- 引擎（`src/engine.js`）：线索计算、单行约束传播（DP）、回溯解计数、聚块图案生成、
  马赛克 3×3 邻域约束求解——Node 与浏览器双端可用；
- 构建：`python build.py` 把 `src/engine.js` + `src/art.js` + `src/template.html`
  内联为根目录 `index.html`（各文件包裹 IIFE 隔离作用域）。

## 目录结构

```
index.html            游戏（构建产物，双击即玩）
src/                  源码：engine.js（引擎）/ art.js（像素画素材）/ template.html（界面）
tests/test.mjs        Playwright 真实 UI 测试：17 项
src/engine.test.mjs   引擎测试（求解器/生成器/马赛克，含与暴力枚举交叉验证）
src/art.test.mjs      素材校验
build.py              构建
```

## 运行测试

```bash
cd tests
npm install           # 仅安装 playwright-core（不下载浏览器）
node test.mjs         # 17/17 通过即为绿
cd ../src
node engine.test.mjs  # 引擎测试
node art.test.mjs     # 素材校验
```

## 姊妹项目

[立方数独 Cube Sudoku 3D](https://github.com/yuanshne/cubershudu)——魔方数独，同一风格与工程范式。
