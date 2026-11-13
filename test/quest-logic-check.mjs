// quest-logic-check.mjs —— 可重复运行的逻辑验证脚本（不 spawn、不开浏览器）
// 做法：给 globalThis 打最小桩 → 用 TypeScript 编译器 API（transpileModule）把 src 转成
//       CommonJS 到临时目录 → require 产物 → 直接驱动 QuestManager 状态机。
// 断言入口遵循规格 §8：setGameTime / deadlineInfo / markers / markerScreen / turnIn 等。
// 结论：§9 的 18 条 AC + §2.4 十行临界值逐条断言；发现实现缺陷时以非零退出码收尾。

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');           // life-sim-ts
const SRC = join(ROOT, 'src');

// ---------------------------------------------------------------------------
// 1) 最小运行时桩（必须先于任何 src 模块加载）
// ---------------------------------------------------------------------------
globalThis.location = { search: '' };
if (!globalThis.window) globalThis.window = globalThis;
function fakeCanvas() {
  const g = {
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    fillRect() {}, strokeRect() {}, beginPath() {}, closePath() {}, arc() {},
    fill() {}, stroke() {}, moveTo() {}, lineTo() {}, clip() {}, drawImage() {},
    fillText() {}, strokeText() {}, clearRect() {}, setLineDash() {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData() {}, measureText: () => ({ width: 0 }),
    set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {},
    set font(v) {}, set textAlign(v) {}, set textBaseline(v) {}, set globalAlpha(v) {},
  };
  return { width: 0, height: 0, getContext: () => g, addEventListener() {} };
}
if (!globalThis.document) {
  globalThis.document = {
    createElement: () => fakeCanvas(),
    getElementById: () => null,
    addEventListener() {},
    body: { appendChild() {} },
    documentElement: {},
    hidden: false,
    fullscreenElement: null,
  };
}
if (!globalThis.performance) globalThis.performance = { now: () => Date.now() };
if (!globalThis.localStorage) globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
if (!globalThis.AudioContext) globalThis.AudioContext = function AudioContext() { return { resume() {}, close() {} }; };
if (!globalThis.Audio) globalThis.Audio = function Audio() { return { play() {} }; };

// ---------------------------------------------------------------------------
// 2) TypeScript → CommonJS 到临时目录（transpileModule 不触发 spawn）
// ---------------------------------------------------------------------------
const ts = require(join(ROOT, 'node_modules', 'typescript'));

function collectTs(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) collectTs(p, out);
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const TMP = join(os.tmpdir(), 'qlc-' + process.pid + '-' + Date.now());
const OUT = join(TMP, 'src');
for (const f of collectTs(SRC)) {
  const rel = relative(SRC, f).replace(/\.ts$/, '.js');
  const target = join(OUT, rel);
  mkdirSync(dirname(target), { recursive: true });
  const src = readFileSync(f, 'utf8');
  const r = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: false,
      isolatedModules: true,
    },
    fileName: f,
  });
  writeFileSync(target, r.outputText);
}

// ---------------------------------------------------------------------------
// 3) 加载编译产物
// ---------------------------------------------------------------------------
const daynight = require(join(OUT, 'core', 'daynight.js'));
const qmod = require(join(OUT, 'quest', 'questManager.js'));
const { QuestManager, defaultTimeLimitDays, turnInNpc } = qmod;
const { RESIDENTS } = require(join(OUT, 'data', 'residents.js'));
const { PLACES, QUESTS_BY_ID } = require(join(OUT, 'quest', 'data.js'));

const TILE = 32;

// ---------------------------------------------------------------------------
// 4) 断言与沙箱
// ---------------------------------------------------------------------------
let PASS = 0, FAIL = 0, SKIP = 0;
const specConflicts = [];
function ok(cond, label) {
  if (cond) { PASS++; console.log('  \u2713 ' + label); }
  else { FAIL++; console.log('  \u2717 ' + label); }
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { PASS++; console.log('  \u2713 ' + label); }
  else { FAIL++; console.log('  \u2717 ' + label + '\n      got: ' + a + '\n      want: ' + e); }
}
function approx(actual, expected, label, eps = 0.05) {
  if (Math.abs(actual - expected) <= eps) { PASS++; console.log('  \u2713 ' + label); }
  else { FAIL++; console.log('  \u2717 ' + label + ' (got ' + actual + ', want \u2248' + expected + ')'); }
}
function note(label) { SKIP++; console.log('  ~ ' + label + '  [spec-conflict / 说明见报告]'); }

function buildResidents() {
  return RESIDENTS.map((def) => {
    const seg = def.schedule[0];
    return {
      def,
      x: seg.x * TILE + (TILE - 24) / 2,
      y: seg.y * TILE + (TILE - 28),
      affinity: 0,
      distTo(px, py) { return Math.hypot(px - (this.x + 12), py - (this.y + 14)); },
    };
  });
}

function setup(day = 100, hour = 10, age = 6) {
  daynight.setGameTime(day, hour);
  const toasts = [];
  const residents = buildResidents();
  const overworld = { residents: { list: residents } };
  const scenes = { current: overworld, set(s) { this.current = s; } };
  const player = {
    x: 0, y: 0, w: 24, h: 28, money: 0, _age: age, stats: {},
    get age() { return this._age; },
    centerTile() { return { tx: Math.floor((this.x + this.w / 2) / TILE), ty: Math.floor((this.y + this.h / 2) / TILE) }; },
    placeAtTile(tx, ty) { this.x = tx * TILE + (TILE - this.w) / 2; this.y = ty * TILE + (TILE - this.h); },
  };
  const ctx = {
    player, scenes, overworld,
    world: { regionAt: () => ({ name: '城里' }), w: 640, h: 176 },
    hud: { toast: (t) => toasts.push(t) },
    health: { active: null },
    weather: { isRainy: () => false },
    schoolState: { isSchoolTime: () => false },
  };
  const q = new QuestManager();
  q.bind(ctx);
  const tick = (n = 2) => { for (let i = 0; i < n; i++) q.update(); };
  return { ctx, q, residents, toasts, tick };
}
const residentOf = (env, id) => env.residents.find((r) => r.def.id === id);

console.log('== \u00a72 \u65f6\u95f4\u57fa\u51c6\u4e0e setGameTime\uff08R-2-01..03\u3001\u00a72.2\uff09 ==');
{
  daynight.setGameTime(100, 10);
  eq(daynight.gameDayIndex(), 100, 'setGameTime(100,10) \u2192 gameDayIndex 100');
  approx(daynight.gameHour(), 10, 'gameHour \u2248 10');
  approx(daynight.absGameHour(), 2410, 'absGameHour \u2248 2410');
  eq(daynight.dayOfAbsHour(2410), 100, 'dayOfAbsHour(2410) = 100');
  daynight.setGameTime(100, 6);
  approx(daynight.absGameHour(), 2406, 'setGameTime(100,6) \u2192 absGameHour 2406');
  daynight.setGameTime(100, 4);
  approx(daynight.gameHour(), 28, 'setGameTime(100,4) \u2192 gameHour 28 (R-2-03 \u516c\u5f0f\uff0c\u975e R-8-01 \u6587\u5b57)');
  approx(daynight.absGameHour(), 2428, 'setGameTime(100,4) \u2192 absGameHour 2428');
}

console.log('\n== \u00a72.4 \u5341\u884c\u4e34\u754c\u503c\u603b\u8868 ==');
{
  // \u884c1 \u5230\u671f >= \u7b97\u8d85\u65f6\uff08\u534a\u5f00\u533a\u95f4\uff09
  let env = setup(100, 20.5);
  env.q.accept('d-wgf-med-night', true);
  env.tick();
  eq(env.q.runtime('d-wgf-med-night').deadlineAbsHour, 2421, '\u884c1/\u5f53\u5929\u6574\u70b9: deadlineAbsHour 2421');
  daynight.setGameTime(100, 20.99); env.tick();
  eq(env.q.runtime('d-wgf-med-night').status, 'active', '\u884c1: 20.99 \u672a\u5230\u70b9\u4ecd active');
  daynight.setGameTime(100, 21); env.tick();
  ok(env.q.runtime('d-wgf-med-night').status !== 'active', '\u884c1: 21:00 \u6574\u5230\u70b9\u7b97\u8d85\u65f6');

  // \u884c2 \u4e34\u671f\u4e00\u6863 remaining===2
  env = setup(100, 10);
  residentOf(env, 'cdw').affinity = 2;
  env.q.accept('s-cdw-parcel', false);
  env.tick();
  eq(env.q.runtime('s-cdw-parcel').deadlineAbsHour, 2478, '\u884c2 \u524d\u63d0: s-cdw-parcel deadlineAbsHour 2478');
  daynight.setGameTime(102, 4); env.tick();
  eq(env.q.runtime('s-cdw-parcel').warnStage, 1, '\u884c2: remaining===2 \u7b97\u4e34\u671f\u4e00\u6863');

  // \u884c3 \u4e34\u671f\u4e8c\u6863 remaining===0.5
  daynight.setGameTime(102, 5.5); env.tick();
  eq(env.q.runtime('s-cdw-parcel').warnStage, 2, '\u884c3: remaining===0.5 \u7b97\u6700\u540e\u4e00\u6863');

  // \u884c4 \u4ea4\u4ed8\u8ddd\u79bb distTo<=56\uff0c===56 \u5141\u8bb8
  env = setup(100, 10);
  env.q.accept('d-fj-tofu', true);
  const rt = env.q.runtime('d-fj-tofu');
  rt.progress = [1, 1];
  env.tick();
  eq(rt.status, 'ready', '\u884c4 \u524d\u63d0: d-fj-tofu ready');
  const cds = env.residents.find((r) => r.def.id === 'cds');
  cds.x = 0; cds.y = 0;
  env.ctx.player.x = 56; env.ctx.player.y = 0;   // \u4e2d\u5fc3 (68,14)\uff0cdistTo(12,14)=56
  approx(cds.distTo(env.ctx.player.x + 12, env.ctx.player.y + 14), 56, '\u884c4 \u524d\u7f6e: \u8ddd\u79bb\u6784\u9020\u4e3a 56', 1e-6);
  const r56 = env.q.turnIn('d-fj-tofu');
  eq(r56.ok, true, '\u884c4: distTo===56 \u5141\u8bb8\u4ea4\u4ed8');
  env = setup(100, 10);
  env.q.accept('d-fj-tofu', true);
  env.q.runtime('d-fj-tofu').progress = [1, 1];
  env.tick();
  const cds2 = env.residents.find((r) => r.def.id === 'cds');
  cds2.x = 0; cds2.y = 0;
  env.ctx.player.x = 56.001; env.ctx.player.y = 0;  // distTo \u2248 56.001
  const r56x = env.q.turnIn('d-fj-tofu');
  eq(r56x.ok, false, '\u884c4: distTo>56 \u62d2\u7edd\uff0856.001\uff09');

  // \u884c5 \u5730\u56fe\u6807\u8bb0\u6570\u91cf \u22643\uff08MAX_ACTIVE=3 \u4e0a\u9650\u5df2\u4fdd\u8bc1\uff0c\u622a\u65ad\u4e3a\u9632\u5fa1\uff09
  env = setup(100, 10);
  residentOf(env, 'cdw').affinity = 2;
  residentOf(env, 'zxm').affinity = 1;
  residentOf(env, 'wjg').affinity = 2;
  env.q.accept('s-cdw-parcel', false);
  env.q.accept('s-zxm-bugs', false);
  env.q.accept('s-wjg-boxes', false);
  env.tick();
  eq(env.q.markers().length, 3, '\u884c5: \u4e09\u4e2a\u4e0d\u540c\u70b9\u6807\u8bb0\u6570\u91cf===3\uff08\u2264MAX_MARKERS\uff09');

  // \u884c6 \u540c\u70b9\u5408\u5e76 Math.round(tx):Math.round(ty)
  env = setup(100, 10);
  residentOf(env, 'cdw').affinity = 2;
  env.q.accept('s-cdw-parcel', false);
  env.q.accept('d-xwt-flower', false);
  env.q.runtime('d-xwt-flower').progress = [1, 0];
  env.tick();
  eq(env.q.markers().length, 1, '\u884c6: \u4e24\u4efb\u52a1\u540c\u6307 cdw \u5408\u5e76\u4e3a 1 \u4e2a\u6807\u8bb0');

  // \u884c7 \u53ef\u63a5\u51b7\u5374\uff08\u666e\u901a\u8d85\u65f6\uff09>=3
  env = setup(100, 10);
  residentOf(env, 'cdw').affinity = 2;
  env.q.accept('s-cdw-parcel', false);
  env.tick();
  daynight.setGameTime(103, 6); env.tick();
  eq(env.q.runtime('s-cdw-parcel').status, 'expired', '\u884c7 \u524d\u63d0: s-cdw-parcel expired @day103');
  daynight.setGameTime(105, 7); env.tick();
  ok(!env.q.availableDefs().some((d) => d.id === 's-cdw-parcel'), '\u884c7: day105 \u51b7\u5374\u671f\u5185\u4e0d\u53ef\u63a5');
  daynight.setGameTime(106, 7); env.tick();
  ok(env.q.availableDefs().some((d) => d.id === 's-cdw-parcel'), '\u884c7: day106 (106-103>=3) \u53ef\u518d\u63a5');

  // \u884c8 \u65e5\u5e38\u91cd\u590d\u51b7\u5374 >=5\uff08completed daily repeat\uff09
  env = setup(100, 10);
  env.q.accept('d-fj-tofu', true);
  env.q.runtime('d-fj-tofu').progress = [1, 1];
  env.tick();
  const cds3 = env.residents.find((r) => r.def.id === 'cds');
  env.ctx.player.x = cds3.x - 4; env.ctx.player.y = cds3.y - 4; // \u8d34\u8fd1
  env.q.turnIn('d-fj-tofu');
  env.tick();
  eq(env.q.runtime('d-fj-tofu').status, 'completed', '\u884c8 \u524d\u63d0: d-fj-tofu completed');
  daynight.setGameTime(104, 7); env.tick();
  ok(!env.q.availableDefs().some((d) => d.id === 'd-fj-tofu'), '\u884c8: day104 \u65e5\u5e38\u91cd\u590d\u51b7\u5374\u5185\u4e0d\u53ef\u63a5');
  daynight.setGameTime(105, 7); env.tick();
  ok(env.q.availableDefs().some((d) => d.id === 'd-fj-tofu'), '\u884c8: day105 (105-100>=5) \u53ef\u518d\u63a5');

  // \u884c9 \u4e3b\u7ebf\u8d85\u65f6\u91cd\u63a5\u65e0\u51b7\u5374
  env = setup(100, 10);
  env.q.accept('main-first-day', false);
  env.tick();
  const mfd = env.q.runtime('main-first-day');
  ok(mfd && mfd.status === 'active', '\u884c9 \u524d\u63d0: main-first-day active');
  const dl = mfd.deadlineAbsHour;
  const ddl = daynight.dayOfAbsHour(dl) + 1;
  daynight.setGameTime(ddl, 6); env.tick();
  eq(env.q.runtime('main-first-day').status, 'available', '\u884c9: \u4e3b\u7ebf\u8d85\u65f6\u56de available');
  const re = env.q.accept('main-first-day', false);
  eq(re.ok, true, '\u884c9: \u4e3b\u7ebf\u8d85\u65f6\u5f53\u5e27\u5373\u53ef\u91cd\u63a5\uff08\u65e0\u51b7\u5374\uff09');

  // \u884c10 \u5f53\u65e5\u622a\u6b62\uff08\u65e5\u578b\uff09\u6b21\u65e5 06:00 \u6574\u7b97\u8d85\u65f6
  env = setup(100, 10);
  env.q.accept('d-fj-tofu', true);
  env.tick();
  const tofu = env.q.runtime('d-fj-tofu');
  eq(tofu.deadlineAbsHour, 2430, '\u884c10/AC-01: d-fj-tofu\uff08\u65e5\u578b N=0\uff09deadlineAbsHour 2430');
  daynight.setGameTime(101, 6); env.tick();
  ok(env.q.runtime('d-fj-tofu').status !== 'active', '\u884c10: \u6b21\u65e5 06:00 \u6574\u7b97\u8d85\u65f6');
}

console.log('\n== AC-01 \u63a5\u53d6\u5373\u4ea7\u751f\u5f53\u5929\u578b\u622a\u6b62\uff08\u65e5\u578b N=0\uff09 ==');
{
  const env = setup(100, 10);
  const res = env.q.accept('d-fj-tofu', true);
  env.tick();
  const rt = env.q.runtime('d-fj-tofu');
  eq(rt.deadlineAbsHour, 2430, 'AC-01.1 deadlineAbsHour === 2430\uff08\u7b2c 101 \u65e5 06:00\uff09');
  eq(env.q.deadlineText(rt), '\u660e\u65e9 06:00 \u524d\u5230\u671f', 'AC-01.2 deadlineText');
  ok(res.text.includes('\u622a\u6b62\uff1a\u660e\u65e9 06:00 \u524d\u5230\u671f'), 'AC-01.3a \u63a5\u53d6\u6587\u672c\u542b \u622a\u6b62\uff1a\u660e\u65e9 06:00 \u524d\u5230\u671f');
  ok(res.text.includes('\u4ea4\u4ed8\uff1a\u66f9\u5fb7\u987a'), 'AC-01.3b \u63a5\u53d6\u6587\u672c\u542b \u4ea4\u4ed8\uff1a\u66f9\u5fb7\u987a');
  eq(rt.warnStage, 0, 'AC-01.4a warnStage 0');
  eq(rt.expiredLogged, false, 'AC-01.4b expiredLogged false');
}

console.log('\n== AC-02 \u6574\u70b9\u578b\u5f53\u5929\u622a\u6b62\u4e0e\u6587\u6848 ==');
{
  const env = setup(100, 20.5);
  env.q.accept('d-wgf-med-night', true);
  env.tick();
  const rt = env.q.runtime('d-wgf-med-night');
  eq(rt.deadlineAbsHour, 2421, 'AC-02.1a deadlineAbsHour 2421');
  eq(rt.deadlineDay, 100, 'AC-02.1b deadlineDay 100');
  eq(rt.deadlineHour, 21, 'AC-02.1c deadlineHour 21');
  ok(env.q.deadlineText(rt).startsWith('\u4eca\u5929 21:00 \u524d'), 'AC-02.2 deadlineText \u57fa\u5e95\u4e3a \u4eca\u5929 21:00 \u524d');
  note('AC-02.2/AC-18.2: \u00a73.9 \u89c4\u5b9a remaining\u22640.5 \u8ffd\u52a0\u300c\u00b7 \u6700\u540e\u534a\u5c0f\u65f6\u300d\uff0cAC \u9884\u671f\u4e32\u7701\u7565\u540e\u7f00\u2014\u2014\u89c4\u683c\u7f3a\u9677\uff0c\u5b9e\u73b0\u6309 \u00a73.9 \u6b63\u786e');
  approx(env.q.deadlineInfo(rt).remainingHours, 0.5, 'AC-02.3 remainingHours \u2248 0.5');
}

console.log('\n== AC-03 \u6574\u70b9\u578b\u201c\u6070\u597d\u5230\u70b9\u201d\u7b97\u8d85\u65f6 ==');
{
  const env = setup(100, 20.5);
  env.q.accept('d-wgf-med-night', true);
  env.tick();
  daynight.setGameTime(100, 20.99); env.tick();
  eq(env.q.runtime('d-wgf-med-night').status, 'active', 'AC-03.1 20.99 \u4ecd active');
  const j0 = env.q.journalLines().length;
  daynight.setGameTime(100, 21); env.tick();
  eq(env.q.runtime('d-wgf-med-night').status, 'available', 'AC-03.2a \u8d85\u65f6\u8f6c available');
  ok(!env.q.snapshot().active.includes('d-wgf-med-night'), 'AC-03.2b active \u4e0d\u542b\u8be5 id');
  ok(env.toasts.some((t) => t === '\u9519\u8fc7\u4e86\u65f6\u95f4\uff1a\u4e8c\u5341\u4e00\u70b9\u524d\u3002\u8fc7\u51e0\u5929\u8fd8\u80fd\u518d\u8bd5\u3002'), 'AC-03.3 toast \u7cbe\u786e\u4e32');
  eq(env.q.journalLines().length, j0, 'AC-03.4 \u65e5\u5e38\u8d85\u65f6\u4e0d\u5199\u65e5\u5fd7');
}

console.log('\n== AC-04 \u65e5\u578b\u6070\u597d\u5230\u70b9\uff08\u8de8\u5929 + 06:00 \u65e5\u754c\uff09 ==');
{
  const env = setup(100, 10);
  residentOf(env, 'cdw').affinity = 2;
  env.q.accept('s-cdw-parcel', false);
  env.tick();
  const rt = env.q.runtime('s-cdw-parcel');
  eq(rt.deadlineAbsHour, 2478, 'AC-04.1a deadlineAbsHour 2478');
  eq(rt.deadlineDay, 102, 'AC-04.1b deadlineDay 102');
  eq(env.q.deadlineText(rt), '\u8fd8\u5269 2 \u5929', 'AC-04.1c deadlineText');
  daynight.setGameTime(102, 4); env.tick();
  eq(env.q.runtime('s-cdw-parcel').status, 'active', 'AC-04.2a \u7b2c 102 \u65e5 04:00 active');
  daynight.setGameTime(102, 5.99); env.tick();
  eq(env.q.runtime('s-cdw-parcel').status, 'active', 'AC-04.2b 05:59 active');
  const j0 = env.q.journalLines().length;
  const y0 = env.q.consumeYearEvents().length;
  daynight.setGameTime(103, 6); env.tick();
  eq(env.q.runtime('s-cdw-parcel').status, 'expired', 'AC-04.3 \u7b2c 103 \u65e5 06:00 \u6574 expired');
  const jl = env.q.journalLines();
  eq(jl.length, j0 + 1, 'AC-04.4a \u65e5\u5fd7 +1');
  ok(jl.length > 0 && jl[jl.length - 1].text.endsWith('\u4e09\u53f7\u697c\u90a3\u4ef6\uff0c\u6211\u6ca1\u8d76\u4e0a\u65f6\u95f4\u3002'), 'AC-04.4b \u65e5\u5fd7\u5185\u5bb9\u4e3a failLog');
  const ev = env.q.consumeYearEvents();
  eq(ev.length, 1, 'AC-04.4c \u5e74\u5ea6\u4e8b\u4ef6 +1');
  if (ev.length === 1) { eq(ev[0].valence, -1, 'AC-04.4d valence -1'); eq(ev[0].importance, 2, 'AC-04.4e importance 2'); }
  eq(env.q.runtime('s-cdw-parcel').expiredLogged, true, 'AC-04.4f expiredLogged true');
  env.tick(3);
  eq(env.q.journalLines().length, j0 + 1, 'AC-04.5 \u4e0d\u91cd\u590d\u8bb0\u8d26');
  void y0;
}

console.log('\n== AC-05 \u4e34\u671f\u4e24\u6863\u63d0\u793a\uff08\u542b\u4e34\u754c 2 \u4e0e 0.5\uff09 ==');
{
  const env = setup(100, 10);
  residentOf(env, 'cdw').affinity = 2;
  env.q.accept('s-cdw-parcel', false);
  env.tick();
  const rt = env.q.runtime('s-cdw-parcel');
  daynight.setGameTime(102, 4); env.tick();
  eq(rt.warnStage, 1, 'AC-05.1a remaining===2 \u2192 warnStage 1');
  ok(env.toasts.some((t) => t === '\u23f3 \u4e09\u53f7\u697c\u90a3\u4ef6\uff1a\u5feb\u5230\u65f6\u95f4\u4e86\u3002'), 'AC-05.1b toast \u4e00\u6863');
  daynight.setGameTime(102, 4.5); env.tick();
  eq(rt.warnStage, 1, 'AC-05.2 remaining===1.5 \u4ecd stage 1\uff08\u4e0d\u91cd\u590d\uff09');
  daynight.setGameTime(102, 5.5); env.tick();
  eq(rt.warnStage, 2, 'AC-05.3a remaining===0.5 \u2192 warnStage 2');
  ok(env.toasts.some((t) => t === '\u26a0 \u4e09\u53f7\u697c\u90a3\u4ef6\uff1a\u53ea\u5269\u6700\u540e\u534a\u5c0f\u65f6\u3002'), 'AC-05.3b toast \u4e8c\u6863');
  daynight.setGameTime(102, 5.8); env.tick();
  eq(rt.warnStage, 2, 'AC-05.4 remaining===0.2 \u4ecd stage 2');
  daynight.setGameTime(102, 4.5); env.tick();
  ok(env.q.deadlineText(rt).endsWith('\u5feb\u5230\u671f\u4e86'), 'AC-05.5a \u4e34\u671f\u4e00\u6863\u540e\u7f00');
  daynight.setGameTime(102, 5.8); env.tick();
  ok(env.q.deadlineText(rt).endsWith('\u6700\u540e\u534a\u5c0f\u65f6'), 'AC-05.5b \u4e34\u671f\u4e8c\u6863\u540e\u7f00');
}

console.log('\n== AC-06 \u5df2\u5b8c\u6210\u672a\u4ea4\u4ed8\u540c\u6837\u53d7\u622a\u6b62\u7ea6\u675f\uff08\u4fee D-2\uff09 ==');
{
  const env = setup(100, 10);
  residentOf(env, 'cdw').affinity = 2;
  env.q.accept('s-cdw-parcel', false);
  env.q.runtime('s-cdw-parcel').progress = [1, 1, 1];
  env.tick();
  eq(env.q.runtime('s-cdw-parcel').status, 'ready', 'AC-06.1a \u7f6e progress \u540e ready');
  eq(env.q.turnInOptionsForNpc('cdw').length, 1, 'AC-06.1b ready \u6709\u4ea4\u4ed8\u5165\u53e3');
  const j0 = env.q.journalLines().length;
  daynight.setGameTime(103, 6); env.tick();
  eq(env.q.runtime('s-cdw-parcel').status, 'expired', 'AC-06.2a ready \u5230\u70b9 expired');
  eq(env.q.turnInOptionsForNpc('cdw').length, 0, 'AC-06.2b \u4ea4\u4ed8\u5165\u53e3\u6d88\u5931');
  eq(env.q.journalLines().length, j0 + 1, 'AC-06.3a \u65e5\u5fd7\u53ea +1');
  ok(!env.q.markers().some((m) => m.questId === 's-cdw-parcel'), 'AC-06.3b markers \u4e0d\u518d\u542b\u8be5\u4efb\u52a1');
}

console.log('\n== AC-07 \u4ea4\u4ed8\u4eba \u2260 \u53d1\u5e03\u4eba\uff1a\u53ea\u80fd\u5728\u4ea4\u4ed8\u4eba\u5904\u4ea4\u5dee ==');
{
  const env = setup(100, 10);
  env.q.accept('d-fj-tofu', true);
  env.q.runtime('d-fj-tofu').progress = [1, 1];
  env.tick();
  eq(env.q.runtime('d-fj-tofu').status, 'ready', 'AC-07 \u524d\u63d0: ready');
  eq(env.q.turnInOptionsForNpc('fj').length, 0, 'AC-07.1 \u53d1\u5e03\u8005 fj \u65e0\u4ea4\u4ed8\u5165\u53e3');
  eq(env.q.turnInOptionsForNpc('cds').length, 1, 'AC-07.2a cds \u6709 1 \u4e2a\u5165\u53e3');
  eq(env.q.turnInOptionsForNpc('cds')[0].label, '\u4ea4\u5dee\uff1a\u4e00\u7897\u8c46\u8150\u8111', 'AC-07.2b \u6807\u7b7e\u4e3a \u4ea4\u5dee\uff1a\u4e00\u7897\u8c46\u8150\u8111');
  // \u7ad9\u5728\u51af\u519b\u8eab\u8fb9
  const fj = residentOf(env, 'fj');
  env.ctx.player.x = fj.x - 4; env.ctx.player.y = fj.y - 4;
  const r = env.q.turnIn('d-fj-tofu');
  eq(r.ok, false, 'AC-07.3a turnIn \u5931\u8d25');
  eq(r.text, '\u79bb\u66f9\u5fb7\u987a\u592a\u8fdc\u4e86\uff0c\u8d70\u8fd1\u4e00\u70b9\u3002', 'AC-07.3b \u6587\u6848 \u79bb\u66f9\u5fb7\u987a\u592a\u8fdc\u4e86');
  eq(env.q.runtime('d-fj-tofu').status, 'ready', 'AC-07.4 \u4efb\u52a1\u4ecd ready\uff08\u672a\u53d1\u653e\u5956\u52b1\uff09');
}

console.log('\n== AC-08 \u4ea4\u4ed8\u8ddd\u79bb\u95e8\u7981\uff0856px \u4e34\u754c\uff09 ==');
{
  const env = setup(100, 10);
  env.q.accept('d-fj-tofu', true);
  env.q.runtime('d-fj-tofu').progress = [1, 1];
  env.tick();
  const cds = residentOf(env, 'cds');
  // \u8ddd\u79bb > 56\uff08\u4e2d\u5fc3\u8ddd\u7ea6 84px\uff09
  env.ctx.player.x = cds.x + 60; env.ctx.player.y = cds.y + 60;
  const far = env.q.turnIn('d-fj-tofu');
  eq(far.ok, false, 'AC-08.1a \u8ddd\u79bb>56 \u62d2\u7edd');
  eq(far.text, '\u79bb\u66f9\u5fb7\u987a\u592a\u8fdc\u4e86\uff0c\u8d70\u8fd1\u4e00\u70b9\u3002', 'AC-08.1b \u6587\u6848');
  // \u8ddd\u79bb 0
  env.ctx.player.x = cds.x; env.ctx.player.y = cds.y;
  const near = env.q.turnIn('d-fj-tofu');
  eq(near.ok, true, 'AC-08.2a \u8ddd\u79bb 0 \u4ea4\u4ed8\u6210\u529f');
  ok(near.text.startsWith('\u3010\u5b8c\u6210\u3011\u4e00\u7897\u8c46\u8150\u8111'), 'AC-08.2b \u6587\u672c\u4ee5\u3010\u5b8c\u6210\u3011\u4e00\u7897\u8c46\u8150\u8111\u5f00\u5934');
  ok(near.text.includes('\u6211\u66ff\u51af\u519b\u7ed9\u66f9\u5fb7\u987a\u9001\u4e86\u4e00\u7897\u8c46\u8150\u8111'), 'AC-08.2c \u542b\u65e5\u5fd7\u6b63\u6587');
  ok(!near.text.includes('\u300c'), 'AC-08.3 \u65e0 turnInLine \u65f6\u4e0d\u542b\u300c');
}

console.log('\n== AC-09 \u4ea4\u4ed8\u7ed3\u7b97\u987a\u5e8f\u4e0e\u4e0a\u9650 ==');
{
  const env = setup(100, 10);
  env.q.accept('d-fj-tofu', true);
  env.q.runtime('d-fj-tofu').progress = [1, 1];
  env.tick();
  const cds = residentOf(env, 'cds');
  const fj = residentOf(env, 'fj');
  const m0 = env.ctx.player.money;
  const aCds0 = cds.affinity, aFj0 = fj.affinity;
  const q0 = env.q.snapshot().questsToday;
  env.ctx.player.x = cds.x; env.ctx.player.y = cds.y;
  const r = env.q.turnIn('d-fj-tofu');
  eq(r.ok, true, 'AC-09.0 \u4ea4\u4ed8\u6210\u529f');
  eq(env.ctx.player.money, m0 + 8, 'AC-09.1 \u91d1\u94b1 +8');
  eq(cds.affinity, aCds0 + 1, 'AC-09.2a cds.affinity +1');
  eq(fj.affinity, aFj0, 'AC-09.2b fj.affinity \u4e0d\u53d8');
  eq(env.q.runtime('d-fj-tofu').status, 'completed', 'AC-09.4a status completed');
  ok(!env.q.markers().some((m) => m.questId === 'd-fj-tofu'), 'AC-09.4b markers \u4e0d\u542b');
  eq(env.q.snapshot().questsToday, q0 + 1, 'AC-09.4c questsToday +1');
  const second = env.q.turnIn('d-fj-tofu');
  eq(second.ok, false, 'AC-09.5 \u7b2c\u4e8c\u6b21 turnIn \u5931\u8d25');
  // AC-09.3 \u201c\u65e5\u5fd7 +1\u201d\u4e0e \u00a74.6 \u7b2c 8 \u6b65 / O-10 \u76f4\u63a5\u51b2\u7a81\uff08daily \u5b8c\u6210\u4e0d\u5199\u65e5\u5fd7\uff09\uff1a\u8bb0\u4e3a\u89c4\u683c\u7f3a\u9677\uff0c\u4e0d\u7b97\u5b9e\u73b0\u7f3a\u9677\u3002
  note('AC-09.3 \u201c\u65e5\u5fd7 +1\u201d\u4e0e \u00a74.6/O-10 \u51b2\u7a81\uff08daily \u4e0d\u5199\u65e5\u5fd7\uff09\u2014\u2014\u5b9e\u73b0\u6309\u00a74.6 \u6267\u884c\uff0c\u65e0\u9700\u4fee\u6539');
}

console.log('\n== AC-10 \u73a9\u5bb6\u4e0d\u5728\u4e16\u754c\u573a\u666f\u65f6\u7981\u6b62\u4ea4\u4ed8 ==');
{
  const env = setup(100, 10);
  env.q.accept('d-fj-tofu', true);
  env.q.runtime('d-fj-tofu').progress = [1, 1];
  env.tick();
  const cds = residentOf(env, 'cds');
  env.ctx.player.x = cds.x; env.ctx.player.y = cds.y;
  env.ctx.scenes.set({ update() {}, render() {} }); // \u6a21\u62df\u4e0d\u5728\u4e16\u754c
  const r = env.q.turnIn('d-fj-tofu');
  eq(r.ok, false, 'AC-10.1a \u8fd4\u56de\u5931\u8d25');
  eq(r.text, '\u8981\u5f53\u9762\u4ea4\u7ed9\u66f9\u5fb7\u987a\u3002', 'AC-10.1b \u6587\u6848');
  eq(env.q.runtime('d-fj-tofu').status, 'ready', 'AC-10.2a \u4ecd ready');
  env.ctx.scenes.set(env.ctx.overworld);
}

console.log('\n== AC-11 \u4e0b\u96e8\u4e0d\u6784\u6210\u201cNPC \u4e0d\u5728\u573a\u201d ==');
{
  const env = setup(100, 10);
  env.q.accept('d-fj-tofu', true);
  env.q.runtime('d-fj-tofu').progress = [1, 1];
  env.tick();
  const cds = residentOf(env, 'cds');
  env.ctx.player.x = cds.x; env.ctx.player.y = cds.y;
  env.ctx.weather.isRainy = () => true; // \u5f3a\u5236\u4e0b\u96e8
  const r = env.q.turnIn('d-fj-tofu');
  eq(r.ok, true, 'AC-11 \u4e0b\u96e8\u4ecd\u4ea4\u4ed8\u6210\u529f\uff08\u65e0\u4e0d\u5728\u573a\u62e6\u622a\uff09');
}

console.log('\n== AC-12 \u4e09\u5904\u6807\u8bb0\u4e00\u81f4 + \u6570\u91cf\u4e0a\u9650 ==');
{
  const env = setup(100, 10);
  residentOf(env, 'cdw').affinity = 2;
  residentOf(env, 'zxm').affinity = 1;
  residentOf(env, 'wjg').affinity = 2;
  env.q.accept('s-cdw-parcel', false);
  env.q.accept('s-zxm-bugs', false);
  env.q.accept('s-wjg-boxes', false);
  env.tick();
  const ms = env.q.markers();
  eq(ms.length, 3, 'AC-12.1a markers().length === 3');
  ok(ms.every((m) => typeof m.questId === 'string' && (m.kind === 'npc' || m.kind === 'place') && ['ready', 'urgent', 'active'].includes(m.urgency) && [1, 2, 3].includes(m.priority) && typeof m.color === 'string'), 'AC-12.1b \u5143\u7d20\u5b57\u6bb5\u5b8c\u6574');
  ok(ms.every((m) => m.color === '#ffd166'), 'AC-12.2 \u65e0\u4e34\u671f\u65f6\u4e09\u6807\u8bb0\u5747\u4e3a #ffd166');
  const r4 = env.q.accept('d-fj-tofu', false);
  eq(r4.ok, false, 'AC-12.3a \u7b2c 4 \u6b21 accept \u5931\u8d25');
  eq(r4.text, '\u4f60\u624b\u4e0a\u5df2\u7ecf\u6709 3 \u4ef6\u4e8b\u4e86\u3002\u5148\u505a\u5b8c\u4e00\u4ef6\uff0c\u518d\u63a5\u65b0\u7684\u3002', 'AC-12.3b MAX_ACTIVE \u6587\u6848');
  eq(env.q.markers().length, 3, 'AC-12.3c markers \u4ecd 3');
  note('AC-12.4 \u5c0f/\u5927\u5730\u56fe\u622a\u56fe\u6bd4\u5bf9\u4e3a\u4eba\u5de5\u89c2\u6d4b\uff1b\u672c\u811a\u672c\u4ee5 markers() \u5355\u70b9\u6570\u636e\u6e90\u8d70\u67e5\u8986\u76d6\uff08\u4e09\u5904\u7ed8\u5236\u5747 for-of this.markers()\uff09');
}

console.log('\n== AC-13 \u6807\u8bb0\u8ddf\u968f\u76ee\u6807\u63a8\u8fdb ==');
{
  const env = setup(100, 10);
  residentOf(env, 'cdw').affinity = 2;
  env.q.accept('s-cdw-parcel', false);
  env.tick();
  const rt = env.q.runtime('s-cdw-parcel');
  eq(env.q.markers()[0].kind, 'npc', 'AC-13.0 \u521d\u59cb\u6307\u5411 cdw(npc)');
  rt.progress = [1, 0, 0]; env.tick();
  let m = env.q.markers()[0];
  eq(m.kind, 'place', 'AC-13.1a kind place');
  eq(m.tx, 329, 'AC-13.1b tx 329'); eq(m.ty, 56, 'AC-13.1c ty 56');
  eq(m.label, '\u82cf\u5bb6', 'AC-13.1d label \u82cf\u5bb6');
  rt.progress = [1, 1, 0]; env.tick();
  m = env.q.markers()[0];
  eq(m.kind, 'npc', 'AC-13.2a kind npc');
  eq(m.label, '\u9648\u5927\u4f1f', 'AC-13.2b label \u9648\u5927\u4f1f');
  rt.progress = [1, 1, 1]; env.tick();
  m = env.q.markers()[0];
  eq(m.kind, 'npc', 'AC-13.3a kind npc');
  eq(m.label, '\u9648\u5927\u4f1f \u00b7 \u4ea4\u5dee', 'AC-13.3b label');
  eq(m.color, '#7fd18a', 'AC-13.3c color \u7eff');
  eq(env.q.markers().length, 1, 'AC-13.4 \u56db\u6b65\u957f\u5ea6\u6052\u4e3a 1');
}

console.log('\n== AC-14 \u540c\u70b9\u5408\u5e76\u4e0e\u6392\u5e8f ==');
{
  const env = setup(100, 10);
  residentOf(env, 'cdw').affinity = 2;
  env.q.accept('s-cdw-parcel', false);
  env.q.accept('d-xwt-flower', false);
  env.q.runtime('d-xwt-flower').progress = [1, 0];
  env.tick();
  let ms = env.q.markers();
  eq(ms.length, 1, 'AC-14.1 \u540c\u70b9\u5408\u5e76\u4e3a 1');
  eq(ms[0].questId, 'd-xwt-flower', 'AC-14.2 \u5408\u5e76\u540e questId = d-xwt-flower\uff08\u622a\u6b62\u66f4\u65e9\uff09');
  ok(env.q.activeRuntimes().length === 2, 'AC-14.3 \u9762\u677f\u4ecd 2 \u6761\uff08activeRuntimes \u4e0d\u5408\u5e76\uff09');
  env.q.runtime('d-xwt-flower').progress = [1, 1]; env.tick();
  ms = env.q.markers();
  eq(ms.length, 1, 'AC-14.4a \u4e24\u8005\u90fd\u6307 cdw \u4ecd\u5408\u5e76 1');
  env.q.abandon('d-xwt-flower'); env.tick();
  ms = env.q.markers();
  eq(ms.length, 1, 'AC-14.4b \u653e\u5f03\u540e markers \u4ecd 1');
  eq(ms[0].questId, 's-cdw-parcel', 'AC-14.4c questId = s-cdw-parcel');
}

console.log('\n== AC-15 \u8bfb\u6863\u540e\u65f6\u9650\u4ecd\u7cbe\u786e\uff08\u5feb\u7167\u5f80\u8fd4\uff09 ==');
{
  const env = setup(100, 10);
  residentOf(env, 'cdw').affinity = 2;
  env.q.accept('s-cdw-parcel', false);
  env.tick();
  const s = env.q.snapshot();
  daynight.setGameTime(101, 12); env.tick();
  env.q.restore(s);
  const rt = env.q.runtime('s-cdw-parcel');
  eq(rt.deadlineAbsHour, 2478, 'AC-15.1 \u6062\u590d\u540e deadlineAbsHour 2478\uff08\u4e0d\u91cd\u7b97\uff09');
  eq(env.q.deadlineText(rt), '\u8fd8\u5269 1 \u5929', 'AC-15.2 deadlineText \u8fd8\u5269 1 \u5929');
  const j0 = env.q.journalLines().length;
  daynight.setGameTime(103, 6); env.tick();
  eq(env.q.journalLines().length, j0 + 1, 'AC-15.3 \u5230 103 \u65e5 06:00 \u6070\u597d\u8d85\u65f6\u4e00\u6b21');
  eq(env.q.runtime('s-cdw-parcel').expiredLogged, true, 'AC-15.3b expiredLogged true');
  note('AC-15.4 localStorage \u7eed\u6863\u4e3a\u6d4f\u89c8\u5668\u96c6\u6210\uff1b\u672c\u811a\u672c\u4ee5 snapshot/restore \u5f80\u8fd4\u8986\u76d6\uff08deadlineAbsHour \u4e0d\u91cd\u7b97\u5df2\u8bc1\uff09');
}

console.log('\n== AC-16 \u65e7\u5b58\u6863\u517c\u5bb9\uff08\u7f3a\u5b57\u6bb5 + \u65e7 failed \u8bed\u4e49\uff09 ==');
{
  const env = setup(100, 10);
  residentOf(env, 'cdw').affinity = 2;
  env.q.accept('s-cdw-parcel', false);
  env.tick();
  const s = env.q.snapshot();
  const r = s.runtimes.find((x) => x.id === 's-cdw-parcel');
  r.status = 'active'; r.deadlineDay = 102; delete r.deadlineHour;
  delete r.deadlineAbsHour; delete r.warnStage; delete r.expiredLogged;
  env.q.restore(s);
  const rt = env.q.runtime('s-cdw-parcel');
  eq(rt.deadlineAbsHour, 2478, 'AC-16.1 \u65e7\u65e5\u578b\u8fc1\u79fb\u4e3a (D+1)*24+6 = 2478');
  eq(rt.warnStage, 0, 'AC-16.2a warnStage 0');
  eq(rt.expiredLogged, false, 'AC-16.2b expiredLogged false');
  const j0 = env.q.journalLines().length;
  daynight.setGameTime(103, 6); env.tick();
  eq(env.q.runtime('s-cdw-parcel').status, 'expired', 'AC-16.3a \u5230\u70b9 expired');
  eq(env.q.journalLines().length, j0 + 1, 'AC-16.3b \u65e5\u5fd7\u53ea +1');
  // \u65e7 failed \u8bed\u4e49\u5f52\u4e00
  const env2 = setup(100, 10);
  residentOf(env2, 'cdw').affinity = 2;
  env2.q.accept('s-cdw-parcel', false);
  env2.tick();
  const s2 = env2.q.snapshot();
  const r2 = s2.runtimes.find((x) => x.id === 's-cdw-parcel');
  r2.status = 'failed'; delete r2.deadlineAbsHour; delete r2.warnStage; delete r2.expiredLogged;
  env2.q.restore(s2);
  const rt2 = env2.q.runtime('s-cdw-parcel');
  eq(rt2.status, 'expired', 'AC-16.4a failed \u5f52\u4e00\u4e3a expired');
  eq(rt2.expiredLogged, true, 'AC-16.4b expiredLogged true\uff08\u4e0d\u91cd\u590d\u8bb0\u8d26\uff09');
}

console.log('\n== AC-17 \u591a\u4efb\u52a1\u5e76\u5b58\u4e92\u4e0d\u5f71\u54cd ==');
{
  // \u6ce8\uff1aAC-17 \u524d\u63d0\u201c\u540c AC-12\u201d\u4e09\u4e2a side \u4efb\u52a1\u540c\u65e5\u63a5\u53d6\u3001\u9ed8\u8ba4\u65f6\u9650\u76f8\u540c(2478)\uff0c\u65e0\u6cd5\u5355\u72ec\u8ba9 s-cdw-parcel \u8d85\u65f6\u3002
  // \u4e3a\u9a8c\u8bc1\u5176\u673a\u5236\uff0c\u7ed9 s-cdw-parcel \u6784\u9020\u66f4\u65e9\u622a\u6b62\uff08\u4e34\u65f6 timeLimitDays=0\uff09\uff0c\u53e6\u4e24\u4e2a\u4fdd\u6301\u9ed8\u8ba4\u3002
  note('AC-17 \u524d\u63d0\u81ea\u76f8\u77db\u76fe\uff08\u4e09\u4e2a side \u540c\u65e5\u63a5\u53d6\u622a\u6b62\u540c\u4e3a 2478\uff0c\u65e0\u6cd5\u5355\u72ec\u8d85\u65f6\u4e00\u4e2a\uff09\u2014\u2014\u6309\u8c03\u6574\u540e\u524d\u7f6e\u9a8c\u8bc1\u673a\u5236');
  const env = setup(100, 10);
  residentOf(env, 'cdw').affinity = 2;
  residentOf(env, 'zxm').affinity = 1;
  residentOf(env, 'wjg').affinity = 2;
  const defC = QUESTS_BY_ID['s-cdw-parcel'];
  const savedTL = defC.timeLimitDays;
  defC.timeLimitDays = 0; // \u8ba9\u5176\u622a\u6b62\u4e3a\u5f53\u5929\u7ed3\u675f 2430
  env.q.accept('s-cdw-parcel', false);
  env.q.accept('s-zxm-bugs', false);
  env.q.accept('s-wjg-boxes', false);
  env.tick();
  eq(env.q.runtime('s-cdw-parcel').deadlineAbsHour, 2430, 'AC-17 \u524d\u7f6e: s-cdw-parcel \u622a\u6b62 2430');
  eq(env.q.markers().length, 3, 'AC-17 \u524d\u7f6e: \u4e09\u4e2a\u6807\u8bb0');
  const j0 = env.q.journalLines().length;
  daynight.setGameTime(101, 6); env.tick();
  eq(env.q.runtime('s-cdw-parcel').status, 'expired', 'AC-17.1a s-cdw-parcel expired');
  eq(env.q.runtime('s-zxm-bugs').status, 'active', 'AC-17.1b 另一个仍 active');
  eq(env.q.runtime('s-wjg-boxes').status, 'active', 'AC-17.1c 另一个仍 active');
  eq(env.q.markers().length, 2, 'AC-17.2a markers 剩 2');
  ok(env.q.markers().every((m) => m.urgency === 'active'), 'AC-17.2b 剩下两个 urgency 不变');
  eq(env.q.activeRuntimes().length, 2, 'AC-17.3a 面板剩 2 条');
  eq(env.q.journalLines().length, j0 + 1, 'AC-17.4 日志只 +1（仅 s-cdw-parcel 超时）');
  // 冷却期（s-cdw-parcel 于 day101 超时，completedDay=101 → day104 可再接）
  daynight.setGameTime(102, 7); env.tick();
  ok(!env.q.availableDefs().some((d) => d.id === 's-cdw-parcel'), 'AC-17.3b day102 冷却期内 availableDefs 不含 s-cdw-parcel');
  daynight.setGameTime(104, 7); env.tick();
  ok(env.q.availableDefs().some((d) => d.id === 's-cdw-parcel'), 'AC-17.3c day104 (104-101>=3) availableDefs 含 s-cdw-parcel');
  eq(env.q.runtime('s-cdw-parcel').status, 'expired', 'AC-17.3d 状态 expired（可接以 ✕ 前缀）');
  defC.timeLimitDays = savedTL; // 还原，避免污染后续用例
}

console.log('\n== AC-18 \u9762\u677f/\u63a5\u53d6\u6587\u672c\u56db\u5f62\u6001 ==');
{
  // 1) \u5f53\u5929\u65e5\u578b d-fj-tofu
  let env = setup(100, 10);
  env.q.accept('d-fj-tofu', true);
  env.tick();
  eq(env.q.deadlineText(env.q.runtime('d-fj-tofu')), '\u660e\u65e9 06:00 \u524d\u5230\u671f', 'AC-18.1 d-fj-tofu \u660e\u65e9 06:00 \u524d\u5230\u671f');
  eq(env.q.deadlineInfo(env.q.runtime('d-fj-tofu')).text, env.q.deadlineText(env.q.runtime('d-fj-tofu')), 'AC-18.5a deadlineInfo.text \u4e00\u81f4 (1)');

  // 2) \u5f53\u5929\u6574\u70b9 d-wgf-med-night
  env = setup(100, 20.5);
  env.q.accept('d-wgf-med-night', true);
  env.tick();
  ok(env.q.deadlineText(env.q.runtime('d-wgf-med-night')).startsWith('\u4eca\u5929 21:00 \u524d'), 'AC-18.2 d-wgf-med-night \u57fa\u5e95 \u4eca\u5929 21:00 \u524d');

  // 3) \u8de8\u5929\u65e5\u578b s-cdw-parcel
  env = setup(100, 10);
  residentOf(env, 'cdw').affinity = 2;
  env.q.accept('s-cdw-parcel', false);
  env.tick();
  eq(env.q.deadlineText(env.q.runtime('s-cdw-parcel')), '\u8fd8\u5269 2 \u5929', 'AC-18.3 s-cdw-parcel \u8fd8\u5269 2 \u5929');

  // 4) \u8de8\u5929\u6574\u70b9 d-wgf-med-night \u6539 timeLimitDays=2
  const def = QUESTS_BY_ID['d-wgf-med-night'];
  const saved = def.timeLimitDays;
  def.timeLimitDays = 2;
  env = setup(100, 20.5);
  env.q.accept('d-wgf-med-night', true);
  env.tick();
  eq(env.q.deadlineText(env.q.runtime('d-wgf-med-night')), '\u8fd8\u5269 2 \u5929\uff0821:00 \u524d\uff09', 'AC-18.4 d-wgf-med-night(timeLimitDays=2) \u8fd8\u5269 2 \u5929\uff0821:00 \u524d\uff09');
  eq(env.q.deadlineInfo(env.q.runtime('d-wgf-med-night')).text, env.q.deadlineText(env.q.runtime('d-wgf-med-night')), 'AC-18.5b deadlineInfo.text \u4e00\u81f4 (4)');
  def.timeLimitDays = saved;
}

console.log('\n== \u8d70\u67e5\uff08\u975e\u53ef\u81ea\u52a8\u5316\u7684\u5b9e\u73b0\u4e8b\u5b9e\uff09 ==');
{
  ok(defaultTimeLimitDays(QUESTS_BY_ID['s-cdw-parcel']) === 2, '\u8d70\u67e5: side \u65e0 wait \u9ed8\u8ba4 2');
  eq(turnInNpc(QUESTS_BY_ID['d-fj-tofu']), 'cds', '\u8d70\u67e5: turnInNpc(d-fj-tofu) = cds');
  eq(turnInNpc(QUESTS_BY_ID['s-cdw-parcel']), 'cdw', '\u8d70\u67e5: turnInNpc(s-cdw-parcel) = cdw');
  // markerScreen \u516c\u5f0f R-5-16\uff08\u7eaf\u51fd\u6570\u65b9\u6cd5\uff0c\u65e0\u9700 ctx\uff09
  const qPure = new QuestManager();
  const sm = { tx: 10, ty: 10, color: '#fff', label: 'x', kind: 'npc', urgency: 'active', priority: 1, questId: 'q' };
  const s1 = qPure.markerScreen(sm, 0, 0);
  eq(s1.x, 10 * TILE + 16, 'R-5-16 markerScreen x');
  eq(s1.y, 10 * TILE + 12, 'R-5-16 markerScreen y');
  eq(s1.onScreen, true, 'R-5-16 markerScreen onScreen=true');
  const s2 = qPure.markerScreen(sm, 99999, 99999);
  eq(s2.onScreen, false, 'R-5-16 markerScreen offscreen=false');
}

console.log('\n============================================================');
console.log('PASS ' + PASS + '  FAIL ' + FAIL + '  SKIP/note ' + SKIP);
console.log('============================================================');
process.exitCode = FAIL > 0 ? 1 : 0;
