// achievement-check.mjs —— 人生得分 + 成就系统的逻辑验证脚本（不 spawn、不开浏览器）
// 做法与 quest-logic-check.mjs 相同：给 globalThis 打最小桩 → 用 TypeScript 编译器 API
// （transpileModule）把 src 转成 CommonJS 到临时目录 → require 产物 → 直接驱动 ScoreEngine。
// 覆盖：规则常量 / 全部成就定义 / 友情 peak 防刷 / 每日上限 / 学业推导 / 旧档补记 /
//       存档默认值与未知成就保留 / SaveData 兼容 / 历代人生归档 / 静态键位检查。
// 发现实现缺陷时以非零退出码收尾。

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..'); // life-sim-ts
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
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    measureText: () => ({ width: 0 }),
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
if (!globalThis.localStorage) {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() { return map.size; },
  };
}
if (!globalThis.AudioContext) {
  globalThis.AudioContext = function AudioContext() {
    const node = () => ({
      type: 'square',
      frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect: () => node(),
      start() {},
      stop() {},
    });
    return {
      currentTime: 0, destination: {},
      resume() {}, close() {},
      createOscillator: () => node(),
      createGain: () => node(),
    };
  };
}
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

const TMP = join(os.tmpdir(), 'achc-' + process.pid + '-' + Date.now());
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
const rules = require(join(OUT, 'score', 'rules.js'));
const { ScoreEngine, factsFromState, defaultState } = require(join(OUT, 'score', 'engine.js'));
const { ACHIEVEMENTS, ACHIEVEMENT_BY_ID } = require(join(OUT, 'score', 'achievements.js'));
const { SaveFieldScoreStore, MemoryScoreStore, LEGACY_KEY } = require(join(OUT, 'score', 'store.js'));
const save = require(join(OUT, 'core', 'save.js'));
const factsMod = require(join(OUT, 'score', 'facts.js'));
const { AchievementPanel } = require(join(OUT, 'ui', 'achievementPanel.js'));
const { Hud } = require(join(OUT, 'ui', 'hud.js'));
const { DIMS } = require(join(OUT, 'score', 'types.js'));

// ---------------------------------------------------------------------------
// 4) 断言与工具
// ---------------------------------------------------------------------------
let PASS = 0, FAIL = 0;
function ok(cond, label) {
  if (cond) { PASS++; console.log('  \u2713 ' + label); }
  else { FAIL++; console.log('  \u2717 ' + label); }
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { PASS++; console.log('  \u2713 ' + label); }
  else { FAIL++; console.log('  \u2717 ' + label + '\n      got: ' + a + '\n      want: ' + e); }
}
function noThrow(fn, label) {
  try { fn(); PASS++; console.log('  \u2713 ' + label); }
  catch (err) { FAIL++; console.log('  \u2717 ' + label + ' (threw ' + err + ')'); }
}

const SUBJECTS = { 语文: 60, 数学: 60, 英语: 60, 科学: 60 };

function school(over = {}) {
  return {
    lastExamAge: -1,
    lastExamCorrect: 0,
    lastExamTotal: 0,
    subjects: { ...SUBJECTS },
    graduated: false,
    gradeTag: 'B',
    recommendation: false,
    ...over,
  };
}

function view(opts = {}) {
  return {
    clock: { day: opts.day ?? 100, age: opts.age ?? 6 },
    residents: (opts.residents ?? []).map((r) => ({
      id: r.id,
      affinity: r.affinity ?? 0,
      secretRevealed: !!r.secretRevealed,
    })),
    school: school(opts.school),
    questsCompleted: opts.questsCompleted ?? [],
  };
}

function newEngine(backfilled = false) {
  const store = new MemoryScoreStore();
  const e = new ScoreEngine(store);
  if (!backfilled) e.restore(null); // 模拟“旧档无 score 字段”，backfilled=false
  return e;
}

function richFacts() {
  const peaks = {};
  for (const id of ['a', 'b', 'c', 'd', 'e', 'jym']) peaks[id] = 5;
  return {
    age: 100,
    dims: { friend: 999, study: 999, diligence: 1200, health: 400, exp: 400 },
    peaks,
    secretCount: 10,
    bestExam: { correct: 10, total: 10, ratio: 1 },
    school: {
      subjects: { 语文: 90, 数学: 95, 英语: 92, 科学: 93 },
      graduated: true,
      gradeTag: 'A',
      recommendation: true,
    },
    counters: {
      classes: 10, questsDone: 30, dailyDone: 50, mainDistinct: 10,
      cured: 1, crisis: 1, rests: 30, chats: 0, gifts: 0,
    },
    questsCompleted: ['main-first-job'],
    regionCount: 9,
  };
}

function emptyFacts(over = {}) {
  return {
    age: 6,
    dims: { friend: 0, study: 0, diligence: 0, health: 0, exp: 0 },
    peaks: {},
    secretCount: 0,
    bestExam: { correct: 0, total: 0, ratio: 0 },
    school: { subjects: { ...SUBJECTS }, graduated: false, gradeTag: 'B', recommendation: false },
    counters: {
      classes: 0, questsDone: 0, dailyDone: 0, mainDistinct: 0,
      cured: 0, crisis: 0, rests: 0, chats: 0, gifts: 0,
    },
    questsCompleted: [],
    regionCount: 0,
    ...over,
  };
}

const clock = (day = 100, age = 6) => ({ day, age });

// ---------------------------------------------------------------------------
// 规则
// ---------------------------------------------------------------------------
console.log('== 规则常量与纯函数 ==');
{
  eq(rules.classPoints(50, false), 1, 'classPoints(50,false)=1');
  eq(rules.classPoints(80, false), 4, 'classPoints(80,false)=4');
  eq(rules.classPoints(100, false), 6, 'classPoints(100,false)=6');
  eq(rules.classPoints(95, true), 1, 'classPoints(95,true)=1（迟到只给基础分）');
  eq(rules.classPoints(30, false), 1, 'classPoints(30,false)=1');
  eq(rules.examPoints(8, 10), 44, 'examPoints(8,10)=44');
  eq(rules.examPoints(10, 10), 70, 'examPoints(10,10)=70');
  eq(rules.examPoints(7, 10), 21, 'examPoints(7,10)=21');
  eq(rules.examPoints(0, 0), 0, 'examPoints(0,0)=0');
  eq(rules.gradPoints('A', true), 110, 'gradPoints(A,true)=110');
  eq(rules.gradPoints('C', false), 15, 'gradPoints(C,false)=15');
  eq(rules.questPoints('side', 0, false, 0), 15, 'questPoints(side,0)=15');
  eq(rules.questPoints('side', 1, false, 0), 8, 'questPoints(side,1)=8');
  eq(rules.questPoints('side', 2, false, 0), 4, 'questPoints(side,2)=4');
  eq(rules.questPoints('main', 0, true, 20), 55, 'questPoints(main,0,chainEnd,paid20)=55');
  eq(rules.tierOf('friend', 319), 4, 'tierOf(friend,319)=4');
  eq(rules.tierOf('friend', 320), 5, 'tierOf(friend,320)=5（第 5 阶）');
  eq(rules.tierOf('study', 19), 0, 'tierOf(study,19)=0');
  eq(rules.lifeTitle(3500), '传奇的一生', 'lifeTitle(3500)=传奇的一生');
  eq(rules.lifeTitle(0), '平平淡淡的一生', 'lifeTitle(0)=平平淡淡的一生');
  eq(rules.TIERS.friend.length, 7, '友情 7 阶');
  eq(rules.TIERS.study.length, 6, '学业 6 阶');
}

// ---------------------------------------------------------------------------
// 成就表
// ---------------------------------------------------------------------------
console.log('\n== 成就表定义 ==');
{
  eq(ACHIEVEMENTS.length, 38, '成就总数 38');
  eq(new Set(ACHIEVEMENTS.map((a) => a.id)).size, 38, 'id 全部唯一');
  ok(
    ACHIEVEMENTS.every((a) => DIMS.includes(a.dim) && a.bonus > 0 && typeof a.test === 'function'),
    '每条成就都有合法 dim / bonus>0 / test 函数',
  );
  for (let i = 1; i <= 7; i++) ok(!!ACHIEVEMENT_BY_ID[`friend_tier_${i}`], `存在 friend_tier_${i}`);
  for (let i = 1; i <= 6; i++) ok(!!ACHIEVEMENT_BY_ID[`study_tier_${i}`], `存在 study_tier_${i}`);
  ok(ACHIEVEMENT_BY_ID.crisis_survivor.hidden === true, '鬼门关前是 hidden 成就');
  ok(
    DIMS.every((d) => ACHIEVEMENTS.some((a) => a.dim === d)),
    '五个维度都有成就',
  );
}

// ---------------------------------------------------------------------------
// 友情 peak：防刷 + 幂等 + 秘密
// ---------------------------------------------------------------------------
console.log('\n== 引擎 · 友情 peak 防刷 ==');
{
  const e = newEngine();
  const v = view({ residents: [{ id: 'x', affinity: 0 }] });
  eq(e.sync(v).length, 0, 'affinity 0 时 sync 无加分');
  v.residents[0].affinity = 3;
  e.sync(v);
  eq(e.state.dims.friend, 20, 'affinity 0→3：friend +20');
  eq(e.state.peaks.x, 3, 'peak 记录为 3');
  v.residents[0].affinity = 1;
  eq(e.sync(v).length, 0, '掉到 1：不扣分也不给分');
  v.residents[0].affinity = 3;
  eq(e.sync(v).length, 0, '回升到旧 peak 3：不再给分（防刷）');
  v.residents[0].affinity = 5;
  e.sync(v);
  eq(e.state.dims.friend, 50, '升到 5：累计 50（5+5+10+10+20）');
  eq(e.sync(v).length, 0, '同一视图再次 sync 幂等（返回空）');
  ok(!!e.state.achievements.soulmate, '好感到 5 解锁「挚友」');
}
{
  const e = newEngine();
  const v = view({ residents: [{ id: 'x', affinity: 1, secretRevealed: false }] });
  e.sync(v);
  const before = e.state.dims.friend;
  v.residents[0].secretRevealed = true;
  e.sync(v);
  eq(e.state.dims.friend - before, 15, '揭开秘密：friend +15');
  e.sync(v);
  eq(e.state.dims.friend - before, 15, '秘密只计一次');
  eq(e.state.secrets, ['x'], 'secrets 记录居民 id');
}

// ---------------------------------------------------------------------------
// 每日上限
// ---------------------------------------------------------------------------
console.log('\n== 引擎 · 每日上限 ==');
{
  const e = newEngine();
  for (const npc of ['a', 'b', 'c', 'd']) e.emit({ type: 'chat', npc }, clock(100, 6));
  eq(e.state.dims.friend, 3, '同一天 4 次寒暄：只计 3 分');
  eq(e.state.counters.chats, 4, '聊天计数照常记 4 次');
  e.emit({ type: 'chat', npc: 'e' }, clock(101, 6));
  eq(e.state.dims.friend, 4, '换一天再寒暄：+1');
}
{
  const e = newEngine();
  for (const id of ['d1', 'd2', 'd3', 'd4']) {
    e.emit({ type: 'quest', id, tier: 'daily', repeatCount: 0, chainEnd: false, paid: 0 }, clock(100, 6));
  }
  eq(e.state.dims.diligence, 15, '同一天 4 件日常：只计 3 件（5×3）');
  eq(e.state.counters.dailyDone, 4, 'dailyDone 仍计 4（计数与计分分开）');
  eq(e.state.counters.questsDone, 4, 'questsDone 计 4');
}
{
  const e = newEngine();
  for (let i = 0; i < 3; i++) e.emit({ type: 'class', subject: '数学', score: 50, late: false }, clock(100, 6));
  eq(e.state.dims.study, 2, '同一天 3 节课：只计 2 节（各 1 分）');
  eq(e.state.counters.classes, 3, '上课次数计 3');
  e.emit({ type: 'rest' }, clock(100, 6));
  e.emit({ type: 'rest' }, clock(100, 6));
  eq(e.state.dims.health, 2, '同日休息两次只 +2');
  e.emit({ type: 'meal', healthy: true }, clock(100, 6));
  e.emit({ type: 'meal', healthy: true }, clock(100, 6));
  eq(e.state.dims.health, 3, '同日便当只能 +1');
  e.emit({ type: 'gift', npc: 'a', liked: 1 }, clock(100, 6));
  e.emit({ type: 'gift', npc: 'b', liked: 1 }, clock(100, 6));
  e.emit({ type: 'gift', npc: 'c', liked: 1 }, clock(100, 6));
  eq(e.state.dims.friend, 6, '同日喜欢礼物最多计 2 次（+3×2）');
}
{
  const e = newEngine();
  e.emit({ type: 'quest', id: 'm1', tier: 'main', repeatCount: 0, chainEnd: false, paid: 0 }, clock(100, 6));
  eq(e.state.dims.diligence, 30, '主线任务 30 分');
  e.emit({ type: 'quest', id: 's1', tier: 'side', repeatCount: 1, chainEnd: false, paid: 0 }, clock(100, 6));
  eq(e.state.dims.diligence, 38, '支线第二次：+8（15×0.5 四舍五入）');
  e.emit({ type: 'quest', id: 'c1', tier: 'side', repeatCount: 0, chainEnd: true, paid: 12 }, clock(100, 6));
  eq(e.state.dims.diligence, 78, '链终 +20、拿到 12 元再 +5（15+20+5=40，累计 78）');
  e.evaluate(
    { ...emptyFacts(), counters: { ...e.state.counters }, questsCompleted: ['main-first-job'] },
    clock(100, 6),
  );
  ok(!!e.state.achievements.quest_first, '首件任务解锁「初出茅庐」');
  ok(!!e.state.achievements.first_pay, '完成 main-first-job 类任务解锁「第一份工资」');
}

// ---------------------------------------------------------------------------
// 健康：只有真正「治好」才计入计数（畸形愈合/落下病根不算）
// ---------------------------------------------------------------------------
console.log('\n== 引擎 · 健康（治好才计） ==');
{
  const e = newEngine();
  e.emit({ type: 'cured', disease: 'fracture', how: '畸形愈合' }, clock(100, 6));
  eq(e.state.dims.health, 0, '畸形愈合不给健康分');
  eq(e.state.counters.cured, 0, '畸形愈合不计入「治好」计数');
  e.emit({ type: 'cured', disease: 'cold', how: '治疗' }, clock(100, 6));
  eq(e.state.dims.health, 15, '治疗 +15');
  eq(e.state.counters.cured, 1, '治疗计入「治好」计数');
  e.emit({ type: 'cured', disease: 'cold', how: '硬扛自愈' }, clock(101, 6));
  eq(e.state.dims.health, 20, '硬扛自愈 +5（累计 20）');
  eq(e.state.counters.cured, 2, '硬扛自愈计入「治好」计数');
  e.evaluate(
    { ...emptyFacts(), counters: { ...e.state.counters } },
    clock(101, 6),
  );
  ok(!!e.state.achievements.cured_first, '治好过病解锁「病去如抽丝」');
}

// ---------------------------------------------------------------------------
// 学业推导：考试 / 毕业
// ---------------------------------------------------------------------------
console.log('\n== 引擎 · 学业推导 ==');
{
  const e = newEngine();
  const v = view({ age: 12, school: { lastExamAge: 12, lastExamCorrect: 8, lastExamTotal: 10 } });
  e.sync(v);
  eq(e.state.dims.study, 44, '期末 8/10：study +44');
  eq(e.state.bestExam.ratio, 0.8, 'bestExam.ratio = 0.8');
  ok(!!e.state.achievements.xueshen, '正确率 80% 解锁「学神」');
  e.sync(v);
  eq(e.state.dims.study, 44, '同一场考试不重复计分');
  v.school.lastExamAge = 13;
  v.school.lastExamCorrect = 10;
  v.clock.age = 13;
  e.sync(v);
  eq(e.state.dims.study, 114, '期末 10/10：再 +70');
  ok(!!e.state.achievements.perfect_exam, '满分卷解锁「满分卷」');
}
{
  const e = newEngine();
  const v = view({
    age: 19,
    school: { graduated: true, gradeTag: 'A', recommendation: true },
  });
  e.sync(v);
  eq(e.state.dims.study, 110, 'A 档毕业 + 教师推荐 = 110');
  ok(!!e.state.achievements.grad_a, '解锁「优秀毕业生」');
  ok(!!e.state.achievements.recommended, '解锁「教师推荐」');
  e.sync(v);
  eq(e.state.dims.study, 110, '毕业只结算一次');
}

// ---------------------------------------------------------------------------
// 阅历：年龄 / 里程碑 / 区域
// ---------------------------------------------------------------------------
console.log('\n== 引擎 · 阅历 ==');
{
  const e = newEngine();
  e.sync(view({ age: 18 }));
  // 6→18：12 年 ×3 = 36，里程碑 18 岁 +20
  eq(e.state.dims.exp, 56, '活到 18 岁：exp 36 + 里程碑 20');
  ok(!!e.state.achievements.adult, '18 岁解锁「成年了」');
  e.sync(view({ age: 18 }));
  eq(e.state.dims.exp, 56, '同年龄不重复计分');
  e.emit({ type: 'region', name: '城里' }, clock(100, 18));
  e.emit({ type: 'region', name: '城里' }, clock(100, 18));
  eq(e.state.dims.exp, 61, '同一区域只计一次（+5）');
  e.emit({ type: 'region', name: '郊外' }, clock(100, 18));
  eq(e.state.dims.exp, 61, '郊外不算新区域（设计 E3 不含郊外）');
}

// ---------------------------------------------------------------------------
// 成就判定：全量 / 边界 / 永不撤销 / silent
// ---------------------------------------------------------------------------
console.log('\n== 成就判定 ==');
{
  const e = newEngine();
  const unlocked = e.evaluate(richFacts(), clock(200, 100));
  eq(unlocked.length, 38, '富事实一次解锁全部 38 个成就');
  eq(Object.keys(e.state.achievements).length, 38, 'achievements 记录 38 条');
  const sumBonus = ACHIEVEMENTS.reduce((n, a) => n + a.bonus, 0);
  eq(e.state.bonus, sumBonus, 'bonus 等于全部成就奖励之和');
  eq(e.total(), DIMS.reduce((n, d) => n + e.state.dims[d], 0) + e.state.bonus, 'total() = Σdims + bonus');
  const before = e.state.bonus;
  e.evaluate(emptyFacts(), clock(200, 100));
  eq(e.state.bonus, before, '条件不再成立时成就永不撤销、bonus 不变');
}
{
  const e = newEngine();
  e.restore(null);
  const f = emptyFacts({ dims: { ...emptyFacts().dims, friend: 319 } });
  e.evaluate(f, clock(120, 10));
  ok(!e.state.achievements.friend_tier_5, 'friend=319 未解锁第 5 阶');
  f.dims.friend = 320;
  e.evaluate(f, clock(120, 10));
  ok(!!e.state.achievements.friend_tier_5, 'friend=320 解锁第 5 阶「知交满巷」');
  ok(!e.state.achievements.friend_tier_6, 'friend=320 未误解锁第 6 阶');
}
{
  const e = newEngine();
  let calls = 0;
  e.onUnlock(() => { calls += 1; });
  const f = emptyFacts({ dims: { ...emptyFacts().dims, friend: 320 } });
  e.evaluate(f, clock(120, 10));
  eq(calls, 5, 'onUnlock 回调次数 = 新解锁数（friend=320 解锁友情 1~5 阶）');
  const e2 = newEngine();
  let calls2 = 0;
  e2.onUnlock(() => { calls2 += 1; });
  const n = e2.evaluate(richFacts(), clock(200, 100), true);
  eq(n.length, 38, 'silent 模式仍然解锁 38 个');
  eq(calls2, 0, 'silent 模式不触发 onUnlock 回调');
}
{
  const e = newEngine();
  let gainCalls = 0;
  e.onGain(() => { gainCalls += 1; });
  e.emit({ type: 'chat', npc: 'a' }, clock(100, 6));
  eq(gainCalls, 1, 'onGain 每笔加分回调一次');
}

// ---------------------------------------------------------------------------
// 存档 / 迁移
// ---------------------------------------------------------------------------
console.log('\n== 存档与迁移 ==');
{
  const e = newEngine();
  e.sync(view({ residents: [{ id: 'x', affinity: 4 }], age: 10 }));
  e.emit({ type: 'chat', npc: 'x' }, clock(100, 10));
  e.evaluate(emptyFacts({ dims: e.state.dims }), clock(100, 10));
  const snap = e.snapshot();
  eq(snap.v, 1, 'score.v = 1（独立版本号）');
  ok(e.store.kind === 'memory', 'MemoryScoreStore.kind = memory');
  const e2 = newEngine(true);
  e2.restore(JSON.parse(JSON.stringify(snap)));
  eq(e2.snapshot(), snap, 'snapshot → JSON → restore 后深相等');
}
{
  const e = newEngine(true);
  noThrow(() => e.restore(undefined), 'restore(undefined) 不抛错');
  eq(e.state.dims.friend, 0, 'restore(undefined) → friend=0');
  noThrow(() => e.restore(null), 'restore(null) 不抛错');
  noThrow(() => e.restore('垃圾'), 'restore("垃圾") 不抛错');
  noThrow(() => e.restore({ v: 1, dims: { friend: 'x' } }), 'restore(字段类型不对) 不抛错');
  eq(e.state.dims.friend, 0, '字段类型不对 → 取默认值 0');
}
{
  const e = newEngine(true);
  noThrow(
    () => e.restore({ v: 99, achievements: { future_ach: { day: 1, age: 9 } }, bonus: 50 }),
    'restore(未来版本 v=99) 不抛错',
  );
  ok(!!e.state.achievements.future_ach, '未知成就 id 原样保留');
  eq(e.state.bonus, 50, 'bonus 取存档值');
}

// ---------------------------------------------------------------------------
// 旧档补记
// ---------------------------------------------------------------------------
console.log('\n== 旧档补记 ==');
{
  const e = newEngine(); // restore(null) → backfilled=false
  const v = view({
    day: 120,
    age: 10,
    residents: [
      { id: 'a', affinity: 3, secretRevealed: false },
      { id: 'b', affinity: 5, secretRevealed: true },
    ],
    school: { lastExamAge: 10, lastExamCorrect: 9, lastExamTotal: 10 },
  });
  const r = e.backfill(v, {
    questRuntimes: [{ id: 's-x', tier: 'side', repeatCount: 2, status: 'completed' }],
  });
  eq(e.state.dims.friend, 85, '补记友情：20 + 50 + 秘密 15 = 85');
  eq(e.state.dims.study, 47, '补记学业：9×3 + 20 = 47');
  eq(e.state.dims.diligence, 23, '补记勤勉：15 + 8 = 23（逐次四舍五入）');
  eq(e.state.dims.exp, 12, '补记阅历：6→10 岁 ×3 = 12');
  eq(e.state.backfilled, true, 'backfilled 置 true');
  eq(e.state.counters.questsDone, 2, '补记任务计数 = 2');
  ok(r.pts > 0 && r.unlocked > 0, 'backfill 返回补记分与补发成就数');
  const before = JSON.stringify(e.snapshot());
  const again = e.backfill(v, { questRuntimes: [{ id: 's-x', tier: 'side', repeatCount: 2, status: 'completed' }] });
  eq(again, { pts: 0, unlocked: 0 }, '再次 backfill 无变化（backfilled 拦下）');
  eq(JSON.stringify(e.snapshot()), before, '再次 backfill 后快照完全一致');
}

// ---------------------------------------------------------------------------
// 与游戏的胶水：bind / refreshScore / restoreScore
// ---------------------------------------------------------------------------
console.log('\n== ctx 胶水与读档入口 ==');
{
  // 绑定世界后：emit 一次聊天 → 推导型 sync 立刻补上好感 peak 与成就
  const e = newEngine();
  const v = view({ residents: [{ id: 'x', affinity: 2 }] });
  e.bind(() => ({ view: v, facts: () => factsFromState(e.state, v) }));
  e.emit({ type: 'chat', npc: 'x' }, clock(100, 6));
  eq(e.state.dims.friend, 11, '绑定后聊天：寒暄 +1、好感 2 档 +10');
  ok(!!e.state.achievements.first_friend === false, '好感 2 档还没到「第一个朋友」');
  v.residents[0].affinity = 3;
  e.emit({ type: 'chat', npc: 'x' }, clock(101, 6));
  eq(e.state.dims.friend, 22, '好感升到 3 档：再 +10（peak 累计 20）');
  ok(!!e.state.achievements.first_friend, '同一 tick 内解锁「第一个朋友」');
}
{
  const e = newEngine();
  const ctx = {
    player: { age: 10 },
    overworld: { residents: { list: [{ def: { id: 'x' }, affinity: 4, secretRevealed: true }] } },
    schoolState: school({ lastExamAge: 9, lastExamCorrect: 8, lastExamTotal: 10 }),
    quests: { completedIds: () => ['main-first-job'] },
    score: e,
  };
  factsMod.refreshScore(ctx);
  eq(e.state.dims.friend, 45, 'worldView：好感 4 档 30 + 秘密 15');
  eq(e.state.dims.study, 44, 'worldView：期末 8/10 = 44');
  eq(e.state.dims.exp, 12, 'worldView：6→10 岁 = 12');
  ok(!!e.state.achievements.first_pay, 'worldView 带入已完成任务，解锁「第一份工资」');
  eq(factsMod.clockOf(ctx).age, 10, 'clockOf 取玩家年龄');
}
{
  // 旧档读档入口：restoreScore 负责 restore + backfill + toast
  const e = new ScoreEngine(); // save-field
  const toasts = [];
  const ctx = {
    player: { age: 10 },
    overworld: { residents: { list: [{ def: { id: 'a' }, affinity: 3, secretRevealed: false }] } },
    schoolState: school(),
    quests: { completedIds: () => [], def: () => ({ tier: 'side' }) },
    hud: { toast: (t) => toasts.push(t) },
    score: e,
  };
  const oldSave = { v: 2, quests: { runtimes: [{ id: 's-x', repeatCount: 2, status: 'completed' }] } };
  save.restoreScore(ctx, oldSave);
  eq(e.state.dims.friend, 20, 'restoreScore 旧档：好感 3 档补 20');
  eq(e.state.dims.diligence, 23, 'restoreScore 旧档：支线两次补 23');
  eq(e.state.backfilled, true, 'restoreScore 后 backfilled=true');
  ok(toasts.length > 0 && toasts[0].includes('补记'), '补记后 toast 告知玩家');
  const snap = JSON.stringify(e.snapshot());
  save.restoreScore(ctx, oldSave);
  eq(JSON.stringify(e.snapshot()), snap, '再次读同一旧档不会重复补记');
}
{
  // 有 score 字段的存档：restoreScore 直接恢复，不补记
  const e = newEngine(true);
  e.sync(view({ residents: [{ id: 'x', affinity: 5 }], age: 12 }));
  const snap = e.snapshot();
  const e2 = new ScoreEngine();
  const ctx2 = {
    player: { age: 12 },
    overworld: { residents: { list: [{ def: { id: 'x' }, affinity: 5, secretRevealed: false }] } },
    schoolState: school(),
    quests: { completedIds: () => [], def: () => undefined },
    hud: { toast: () => {} },
    score: e2,
  };
  save.restoreScore(ctx2, { v: 2, score: JSON.parse(JSON.stringify(snap)) });
  eq(e2.snapshot(), snap, '带 score 的存档读回后与快照完全一致（不再补记）');
}

// ---------------------------------------------------------------------------
// ScoreStore：SaveData.score 与历代人生
// ---------------------------------------------------------------------------
console.log('\n== 存储接口 ==');
{
  const st = new SaveFieldScoreStore();
  eq(st.read(null), null, 'read(null) = null');
  eq(st.read({ v: 2 }), null, 'read(旧档无 score) = null');
  const d = { v: 2 };
  const snap = { v: 1, dims: { friend: 12 }, backfilled: true };
  st.write(d, snap);
  eq(st.read(d), snap, 'write 后 read 等于快照');
  eq(st.kind, 'save-field', '默认实现 kind = save-field');
}
{
  localStorage.removeItem(LEGACY_KEY);
  const st = new SaveFieldScoreStore();
  for (let i = 0; i < 25; i++) {
    st.archiveLife({
      name: `L${i}`, endedAt: i, age: 100, total: i,
      dims: { friend: 0, study: 0, diligence: 0, health: 0, exp: 0 },
      title: '平平淡淡的一生', achievements: [],
    });
  }
  const list = st.listLegacy();
  eq(list.length, 20, '连续归档 25 次只保留 20 条');
  eq(list[0].name, 'L24', '第一条是最新');
  localStorage.setItem(LEGACY_KEY, '{not json');
  eq(st.listLegacy(), [], 'localStorage 损坏 JSON → listLegacy 返回 [] 不抛错');
  localStorage.removeItem(LEGACY_KEY);
}

// ---------------------------------------------------------------------------
// 存档兼容：SAVE_VERSION 与 SaveData.score
// ---------------------------------------------------------------------------
console.log('\n== 存档兼容（SAVE_VERSION / SaveData.score） ==');
{
  eq(save.SAVE_VERSION, 2, '外层 SAVE_VERSION 保持 2');
  const legacySave = {
    v: 2, savedAt: Date.now(), offset: 0,
    player: { gender: 'male', stats: {}, name: '小明', stamina: 1, knowledge: 1, money: 0, facing: 'down', x: 0, y: 0, birthDay: 0, allowanceDay: 0 },
    residents: {}, health: {}, school: {}, weather: {}, quests: {},
  };
  localStorage.setItem(save.SAVE_KEY, JSON.stringify(legacySave));
  const loaded = save.loadSave();
  ok(loaded !== null, '不含 score 的 v2 旧档仍能正常 loadSave（没有因新字段被丢弃）');
  ok(loaded && loaded.score === undefined, '旧档读入后 score 为 undefined（由 restoreScore 补默认值）');
}
{
  // 模拟自动存档 / 玫瑰存档共用的 captureSave：SaveData.score 随载体一起落盘
  const engine = new ScoreEngine(); // 默认 SaveFieldScoreStore（快照写进 SaveData.score）
  engine.restore(null);
  engine.sync(view({ residents: [{ id: 'x', affinity: 3 }] }));
  engine.emit({ type: 'quest', id: 'm1', tier: 'main', repeatCount: 0, chainEnd: false, paid: 0 }, clock(100, 6));
  const snapBefore = engine.snapshot();
  const fakeCtx = {
    player: {
      stats: { int: 5 }, gender: 'male', name: '小明', stamina: 10, knowledge: 10, money: 0,
      taxiRides: 0, taxiDebt: 0, facing: 'down', x: 0, y: 0, w: 24, h: 28,
      agingState: () => ({ birthDay: 0, allowanceDay: 0 }),
    },
    overworld: { residents: { list: [] } },
    scenes: { current: null },
    health: { snapshot: () => ({ active: null }) },
    schoolState: { snapshot: () => ({ subjects: SUBJECTS }) },
    weather: { snapshot: () => ({ rainy: false }) },
    quests: { snapshot: () => ({ runtimes: [], completed: [] }) },
    score: engine,
  };
  const data = save.captureSave(fakeCtx);
  ok(!!data && !!data.score, 'captureSave 把 score 写进 SaveData（自动存档与玫瑰存档共用）');
  eq(data.score.dims, snapBefore.dims, 'SaveData.score 与引擎快照一致');
  localStorage.setItem(save.SAVE_KEY, JSON.stringify(data));
  const loaded = save.loadSave();
  ok(loaded !== null && !!loaded.score, '本地自动存档读回后 score 仍在');
  // 玫瑰存档 = 整份 SaveData；读档用同一个 ScoreStore.read
  const slotRecord = { slot: 1, data: JSON.parse(JSON.stringify(data)) };
  const e2 = newEngine(true);
  e2.restore(new SaveFieldScoreStore().read(slotRecord.data));
  eq(e2.snapshot(), snapBefore, '玫瑰存档槽里的 score 可完整恢复');
}

// ---------------------------------------------------------------------------
// 静态检查：键位 / 触屏 / 核心纯净度
// ---------------------------------------------------------------------------
console.log('\n== 静态检查 ==');
{
  const files = collectTs(SRC);
  const keyLFiles = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    if (/wasPressed\([^)]*'KeyL'/.test(text)) keyLFiles.push(relative(SRC, f).replace(/\\/g, '/'));
  }
  eq(keyLFiles.sort(), ['scenes/overworldScene.ts', 'ui/achievementPanel.ts'], "wasPressed('KeyL') 只出现在大地图与人生簿");
  ok(
    readFileSync(join(SRC, 'ui', 'touchControls.ts'), 'utf8').includes("code: 'KeyL', label: '成就'"),
    '触屏 ACTION_KEYS 包含「成就」',
  );
  ok(
    readFileSync(join(ROOT, 'index.html'), 'utf8').includes('repeat(5, 1fr)'),
    'index.html 触屏按键网格改为 2×5',
  );
  // 计分核心（除 facts.ts 胶水外）不得 import daynight / 触碰 window/document
  const core = ['types.ts', 'rules.ts', 'achievements.ts', 'store.ts', 'engine.ts'];
  let clean = true;
  for (const name of core) {
    const text = readFileSync(join(SRC, 'score', name), 'utf8');
    if (/core\/daynight/.test(text) || /\bwindow\./.test(text) || /\bdocument\./.test(text)) clean = false;
  }
  ok(clean, '计分核心不依赖 daynight / window / document（可在 Node 中测试）');
  const factsText = readFileSync(join(SRC, 'score', 'facts.ts'), 'utf8');
  ok(factsText.includes('GameContext'), 'facts.ts 是唯一接触 GameContext 的计分模块');

  // 游戏内可见性：解锁提示 + 查看入口（桌面 L / 手机触屏 + 属性页）
  const mainText = readFileSync(join(SRC, 'main.ts'), 'utf8');
  ok(mainText.includes('onUnlock') && mainText.includes('hud.achievement'), 'main 把成就解锁接到 HUD 横幅');
  const hudText = readFileSync(join(SRC, 'ui', 'hud.ts'), 'utf8');
  ok(hudText.includes('achievement(') && hudText.includes('drawAchievements'), 'HUD 有独立成就横幅队列与绘制入口');
  const overworldText = readFileSync(join(SRC, 'scenes', 'overworldScene.ts'), 'utf8');
  ok(overworldText.includes('AchievementPanel') && overworldText.includes("wasPressed('KeyL')"), '大地图 L 打开人生簿');
  const attrText = readFileSync(join(SRC, 'ui', 'attrPanel.ts'), 'utf8');
  ok(attrText.includes('scoreEngine') && attrText.includes('onOpenAchievements'), '属性页有「人生分」入口（手机第二入口）');
  const lifeEndText = readFileSync(join(SRC, 'scenes', 'lifeEndScene.ts'), 'utf8');
  ok(lifeEndText.includes('archiveLife') && lifeEndText.includes('成就墙'), '寿终页归档本世总结并展示成就墙');
  const yearEndText = readFileSync(join(SRC, 'scenes', 'yearEndScene.ts'), 'utf8');
  ok(yearEndText.includes('r.score') && yearEndText.includes('新成就'), '年终结算展示人生分与新成就');
}

// ---------------------------------------------------------------------------
// UI 冒烟：人生簿两页 / HUD 成就横幅（用假 2D 上下文，不依赖浏览器）
// ---------------------------------------------------------------------------
console.log('\n== UI 冒烟（假 Canvas） ==');
{
  const e = newEngine(true);
  e.evaluate(richFacts(), clock(300, 100));
  const ctx = { score: e };
  const panel = new AchievementPanel(ctx);
  panel.toggle();
  const g = fakeCanvas().getContext('2d');
  noThrow(() => panel.render(g), '人生簿总览页渲染不抛错');
  panel.page = 1;
  noThrow(() => panel.render(g), '人生簿成就页渲染不抛错');

  const hud = new Hud();
  hud.achievement(ACHIEVEMENT_BY_ID.friend_tier_5);
  hud.update(0.1);
  noThrow(() => hud.draw(g, '城里'), 'HUD 成就横幅渲染不抛错');
  // 队列超过 4 条 → 合并成「又解锁了 N 个」；不应抛错
  for (let i = 0; i < 6; i++) hud.achievement(ACHIEVEMENTS[i % ACHIEVEMENTS.length]);
  noThrow(() => hud.update(4), '横幅队列合并/推进不抛错');
  noThrow(() => hud.draw(g, '城里'), '合并横幅渲染不抛错');
  noThrow(() => hud.drawIndoor(g, '家'), '室内也绘制成就横幅');
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log('PASS ' + PASS + '  FAIL ' + FAIL);
console.log('============================================================');
process.exitCode = FAIL > 0 ? 1 : 0;
