// 计分引擎：纯逻辑，不读 daynight / window；天数与年龄由 ScoreClock 传入。
// 两条结算路径：
//   · emit(event) —— 事件型加分（任务/上课/聊天/送礼/看病/睡觉/吃饭/区域）
//   · sync(view)  —— 推导型结算（好感历史最高档、秘密、期末考、毕业、年龄），幂等
// 每次 sync 结束都会用 state + view 重新判定全部成就，因此“聊天 → 好感 +1 → 友情升阶
// → 解锁成就”在同一个 tick 内完成，不需要调用方再手动 evaluate。
import { ACHIEVEMENTS } from './achievements';
import {
  DAILY_CAPS,
  MILESTONE_AGES,
  PEAK_POINTS,
  classPoints,
  examPoints,
  gradPoints,
  questPoints,
  tierOf,
} from './rules';
import { SaveFieldScoreStore } from './store';
import type { ScoreStore } from './store';
import { DIMS, SCORE_SCHEMA } from './types';
import type {
  AchievementDef,
  Dim,
  ScoreClock,
  ScoreEvent,
  ScoreFacts,
  ScoreGain,
  ScoreSnapshot,
  ScoreState,
  UnlockRecord,
  WorldView,
} from './types';

export interface QuestRuntimeLike {
  id: string;
  tier: string;
  repeatCount: number;
  status: string;
}

type BoundProvider = () => { view: WorldView; facts: () => ScoreFacts } | null;

function zeroDims(): Record<Dim, number> {
  return { friend: 0, study: 0, diligence: 0, health: 0, exp: 0 };
}

export function defaultState(backfilled = true): ScoreState {
  return {
    dims: zeroDims(),
    bonus: 0,
    peaks: {},
    secrets: [],
    examAges: [],
    bestExam: { correct: 0, total: 0, ratio: 0 },
    regions: [],
    lastAge: 6,
    flags: { graduated: false },
    counters: {
      classes: 0,
      questsDone: 0,
      dailyDone: 0,
      mainDistinct: 0,
      cured: 0,
      crisis: 0,
      rests: 0,
      chats: 0,
      gifts: 0,
    },
    mainDone: [],
    daily: {
      day: -1,
      chat: 0,
      gift: 0,
      chores: 0,
      classes: 0,
      cured: 0,
      crisis: 0,
      rest: 0,
      meal: 0,
      work: 0,
    },
    achievements: {},
    ledger: { gained: zeroDims(), bonus: 0, unlocked: [] },
    backfilled,
  };
}

// ---- 读档容错小工具：有就用，类型不对取默认 ----
function num(v: unknown, def = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : def;
}
function nonNeg(v: unknown, def = 0): number {
  return Math.max(0, Math.floor(num(v, def)));
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
function numArray(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)) : [];
}
function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** 只用 state + WorldView 组装成就判定事实（纯函数；facts.ts 的 ctx 胶水也复用它） */
export function factsFromState(s: ScoreState, view: WorldView): ScoreFacts {
  return {
    age: view.clock.age,
    dims: { ...s.dims },
    peaks: { ...s.peaks },
    secretCount: s.secrets.length,
    bestExam: { ...s.bestExam },
    school: {
      subjects: { ...view.school.subjects },
      graduated: view.school.graduated,
      gradeTag: view.school.gradeTag,
      recommendation: view.school.recommendation,
    },
    counters: { ...s.counters },
    questsCompleted: view.questsCompleted,
    regionCount: s.regions.length,
  };
}

export class ScoreEngine {
  /** 引擎内存状态（与快照同构）。修改只能走 emit/sync/restore/backfill/reset。 */
  state: ScoreState;
  readonly store: ScoreStore;

  private readonly unlockCbs: ((a: AchievementDef) => void)[] = [];
  private readonly gainCbs: ((g: ScoreGain) => void)[] = [];
  private provider: BoundProvider | null = null;
  private tickAcc = 0;

  constructor(store: ScoreStore = new SaveFieldScoreStore()) {
    this.store = store;
    this.state = defaultState(true);
  }

  // ---------- 查询 ----------

  total(): number {
    let n = this.state.bonus;
    for (const d of DIMS) n += this.state.dims[d];
    return n;
  }

  tier(dim: Dim): number {
    return tierOf(dim, this.state.dims[dim]);
  }

  onUnlock(cb: (a: AchievementDef) => void): void {
    this.unlockCbs.push(cb);
  }

  onGain(cb: (g: ScoreGain) => void): void {
    this.gainCbs.push(cb);
  }

  // ---------- 事件型加分 ----------

  /** 事件型加分。返回本次实际加的分（受每日上限/衰减后，可能为空数组） */
  emit(ev: ScoreEvent, clock: ScoreClock): ScoreGain[] {
    this.rollDaily(clock.day);
    const gains: ScoreGain[] = [];
    const daily = this.state.daily;
    const c = this.state.counters;

    switch (ev.type) {
      case 'quest': {
        // 计数与计分分开：每日上限只限制计分，累计计数照常，成就判定才准确
        c.questsDone += 1;
        if (ev.tier === 'daily') c.dailyDone += 1;
        if (ev.tier === 'main' && !this.state.mainDone.includes(ev.id)) {
          this.state.mainDone.push(ev.id);
          c.mainDistinct += 1;
        }
        if (ev.tier === 'daily' && daily.chores >= DAILY_CAPS.chores) break;
        if (ev.tier === 'daily') daily.chores += 1;
        const pts = questPoints(ev.tier, ev.repeatCount, ev.chainEnd, ev.paid);
        this.push(gains, this.add('diligence', pts, `quest:${ev.id}`, clock));
        break;
      }
      case 'class': {
        c.classes += 1;
        if (daily.classes >= DAILY_CAPS.classes) break;
        daily.classes += 1;
        const pts = classPoints(ev.score, ev.late);
        this.push(gains, this.add('study', pts, `class:${ev.subject}`, clock));
        break;
      }
      case 'chat': {
        c.chats += 1;
        if (daily.chat >= DAILY_CAPS.chat) break;
        daily.chat += 1;
        this.push(gains, this.add('friend', 1, `chat:${ev.npc}`, clock));
        break;
      }
      case 'gift': {
        c.gifts += 1;
        if (ev.liked !== 1) break; // 只有送对礼物才加分
        if (daily.gift >= DAILY_CAPS.gift) break;
        daily.gift += 1;
        this.push(gains, this.add('friend', 3, `gift:${ev.npc}`, clock));
        break;
      }
      case 'cured': {
        const pts = ev.how === '治疗' ? 15 : ev.how === '硬扛自愈' ? 5 : 0;
        if (pts <= 0) break; // 畸形愈合 / 落下病根：不给分，也不计入「病被治好」
        c.cured += 1; // 计数与计分分开：真正治好才计入（成就「病去如抽丝」用）
        if (daily.cured >= DAILY_CAPS.cured) break;
        daily.cured += 1;
        this.push(gains, this.add('health', pts, `cured:${ev.disease}:${ev.how}`, clock));
        break;
      }
      case 'crisis_survived': {
        c.crisis += 1;
        if (daily.crisis >= DAILY_CAPS.crisis) break;
        daily.crisis += 1;
        this.push(gains, this.add('health', 20, 'crisis', clock));
        break;
      }
      case 'rest': {
        c.rests += 1;
        if (daily.rest >= DAILY_CAPS.rest) break;
        daily.rest += 1;
        this.push(gains, this.add('health', 2, 'rest', clock));
        break;
      }
      case 'meal': {
        if (!ev.healthy) break; // 路边摊不给分
        if (daily.meal >= DAILY_CAPS.meal) break;
        daily.meal += 1;
        this.push(gains, this.add('health', 1, 'meal', clock));
        break;
      }
      case 'region': {
        // 郊外是出生地/兜底区域，不算“走过的新区域”（设计 §3.3 E3：共 9 个，不含郊外）
        if (ev.name === '郊外') break;
        if (this.state.regions.includes(ev.name)) break;
        this.state.regions.push(ev.name);
        this.push(gains, this.add('exp', 5, `region:${ev.name}`, clock));
        break;
      }
      case 'work_shift': {
        if (daily.work >= DAILY_CAPS.work) break;
        daily.work += 1;
        this.push(gains, this.add('diligence', 8, `work:${ev.job}`, clock));
        break;
      }
      default:
        break;
    }

    // 事件可能推动好感/任务链，使推导型来源与成就即时生效
    this.syncBound();
    return gains;
  }

  // ---------- 推导型结算 ----------

  /** 推导型结算：好感 peak、秘密、考试、毕业、年龄。幂等，可任意频繁调用。 */
  sync(view: WorldView): ScoreGain[] {
    const clock = view.clock;
    this.rollDaily(clock.day);
    const gains: ScoreGain[] = [];

    // F1：每位居民的历史最高好感档（按档位累计给分；掉档不扣，回升到旧 peak 内不给）
    for (const r of view.residents) {
      const aff = Math.max(0, Math.min(5, Math.floor(num(r.affinity, 0))));
      const old = this.state.peaks[r.id] ?? 0;
      if (aff > old) {
        this.state.peaks[r.id] = aff;
        const pts = (PEAK_POINTS[aff] ?? 0) - (PEAK_POINTS[old] ?? 0);
        this.push(gains, this.add('friend', pts, `peak:${r.id}:${aff}`, clock));
      }
      // F2：揭开秘密，每人一次
      if (r.secretRevealed && !this.state.secrets.includes(r.id)) {
        this.state.secrets.push(r.id);
        this.push(gains, this.add('friend', 15, `secret:${r.id}`, clock));
      }
    }

    // S2：期末考试（以 lastExamAge 为键，每个年龄只计一次）
    const sc = view.school;
    if (sc.lastExamAge >= 0 && !this.state.examAges.includes(sc.lastExamAge)) {
      this.state.examAges.push(sc.lastExamAge);
      const total = nonNeg(sc.lastExamTotal);
      const correct = Math.min(nonNeg(sc.lastExamCorrect), total);
      const ratio = total > 0 ? correct / total : 0;
      if (total > 0 && (ratio > this.state.bestExam.ratio || (ratio === this.state.bestExam.ratio && correct > this.state.bestExam.correct))) {
        this.state.bestExam = { correct, total, ratio };
      }
      const pts = examPoints(correct, total);
      this.push(gains, this.add('study', pts, `exam:${sc.lastExamAge}`, clock));
    }

    // S3：毕业（只结算一次）
    if (sc.graduated && !this.state.flags.graduated) {
      this.state.flags.graduated = true;
      const pts = gradPoints(sc.gradeTag, sc.recommendation);
      this.push(gains, this.add('study', pts, `graduate:${sc.gradeTag}`, clock));
    }

    // E1/E2：长一岁 + 里程碑年龄
    this.applyAges(clock, gains);

    // 推导型数据齐了，顺手判定成就（让“聊天 → 好感 +1 → 解锁”一气呵成）
    this.evaluate(factsFromState(this.state, view), clock);
    return gains;
  }

  /** 用 facts 判定全部成就；silent=true 时不触发监听（旧档补记用） */
  evaluate(facts: ScoreFacts, clock: ScoreClock, silent = false): AchievementDef[] {
    const unlocked: AchievementDef[] = [];
    for (const def of ACHIEVEMENTS) {
      if (this.state.achievements[def.id]) continue;
      let ok = false;
      try {
        ok = def.test(facts);
      } catch {
        ok = false;
      }
      if (!ok) continue;
      const rec: UnlockRecord = { day: clock.day, age: clock.age };
      this.state.achievements[def.id] = rec;
      this.state.bonus += def.bonus;
      this.state.ledger.bonus += def.bonus;
      this.state.ledger.unlocked.push(def.id);
      unlocked.push(def);
      if (!silent) for (const cb of this.unlockCbs) cb(def);
    }
    return unlocked;
  }

  /** 年终结算取走“自上次结算以来”的账并清零 */
  consumeLedger(): ScoreState['ledger'] {
    const out: ScoreState['ledger'] = {
      gained: { ...this.state.ledger.gained },
      bonus: this.state.ledger.bonus,
      unlocked: [...this.state.ledger.unlocked],
    };
    this.state.ledger = { gained: zeroDims(), bonus: 0, unlocked: [] };
    return out;
  }

  // ---------- 存档 ----------

  snapshot(): ScoreSnapshot {
    const snap = JSON.parse(JSON.stringify(this.state)) as ScoreState;
    return { ...snap, v: SCORE_SCHEMA };
  }

  /** 完全替换当前状态（玫瑰存档中途读档也要先 reset）；raw 缺失/损坏 → 默认值 */
  restore(raw: unknown): void {
    this.reset();
    const r = record(raw);
    if (!r) {
      // 旧档（没有 score 字段）或损坏：默认值 + 待补记
      this.state.backfilled = false;
      return;
    }
    const dims = record(r.dims);
    if (dims) {
      for (const d of DIMS) this.state.dims[d] = nonNeg(dims[d], 0);
    }
    this.state.bonus = nonNeg(r.bonus, 0);

    const peaks = record(r.peaks);
    if (peaks) {
      for (const [id, v] of Object.entries(peaks)) {
        const n = num(v, -1);
        if (n >= 0 && n <= 5) this.state.peaks[id] = Math.floor(n);
      }
    }
    this.state.secrets = strArray(r.secrets);
    this.state.examAges = numArray(r.examAges).map((n) => Math.floor(n));

    const best = record(r.bestExam);
    if (best) {
      const total = nonNeg(best.total);
      const rawCorrect = nonNeg(best.correct);
      const correct = total > 0 ? Math.min(rawCorrect, total) : rawCorrect;
      this.state.bestExam = {
        correct,
        total,
        ratio: total > 0 ? correct / total : 0,
      };
    }

    this.state.regions = strArray(r.regions);
    this.state.lastAge = nonNeg(r.lastAge, 6);
    const flags = record(r.flags);
    this.state.flags.graduated = !!(flags && flags.graduated);

    const counters = record(r.counters);
    if (counters) {
      for (const key of Object.keys(this.state.counters) as (keyof ScoreState['counters'])[]) {
        this.state.counters[key] = nonNeg(counters[key], 0);
      }
    }
    this.state.mainDone = strArray(r.mainDone);

    const daily = record(r.daily);
    if (daily) {
      this.state.daily.day = num(daily.day, -1);
      for (const key of ['chat', 'gift', 'chores', 'classes', 'cured', 'crisis', 'rest', 'meal', 'work'] as const) {
        this.state.daily[key] = nonNeg(daily[key], 0);
      }
    }

    const achs = record(r.achievements);
    if (achs) {
      for (const [id, v] of Object.entries(achs)) {
        const rec = record(v);
        if (!rec) continue;
        const day = num(rec.day, 0);
        const age = num(rec.age, 0);
        if (Number.isFinite(day) && Number.isFinite(age)) this.state.achievements[id] = { day, age };
      }
    }

    const ledger = record(r.ledger);
    if (ledger) {
      const gained = record(ledger.gained);
      if (gained) for (const d of DIMS) this.state.ledger.gained[d] = nonNeg(gained[d], 0);
      this.state.ledger.bonus = nonNeg(ledger.bonus, 0);
      this.state.ledger.unlocked = strArray(ledger.unlocked);
    }

    // 快照存在但 backfilled 缺省时视为已补记（避免每次读档重复补记）
    this.state.backfilled = r.backfilled !== false;
  }

  /**
   * 旧档补记：用存档里能还原的数据一次性结算（silent 解锁，避免横幅刷屏）。
   * 调用前应先 restore(raw)（raw 缺失时 backfilled=false）。
   */
  backfill(
    view: WorldView,
    extra: { questRuntimes: QuestRuntimeLike[] },
  ): { pts: number; unlocked: number } {
    if (this.state.backfilled) return { pts: 0, unlocked: 0 };
    const clock = view.clock;
    const before = DIMS.reduce((n, d) => n + this.state.dims[d], 0);
    const gains: ScoreGain[] = [];

    // 好感：历史最高已不可知，取当前值（偏保守）
    for (const r of view.residents) {
      const aff = Math.max(0, Math.min(5, Math.floor(num(r.affinity, 0))));
      const old = this.state.peaks[r.id] ?? 0;
      if (aff > old) {
        this.state.peaks[r.id] = aff;
        this.push(gains, this.add('friend', (PEAK_POINTS[aff] ?? 0) - (PEAK_POINTS[old] ?? 0), `peak:${r.id}:${aff}`, clock));
      }
      if (r.secretRevealed && !this.state.secrets.includes(r.id)) {
        this.state.secrets.push(r.id);
        this.push(gains, this.add('friend', 15, `secret:${r.id}`, clock));
      }
    }

    // 考试：只知最近一次，按 S2 计
    const sc = view.school;
    if (sc.lastExamAge >= 0 && !this.state.examAges.includes(sc.lastExamAge)) {
      this.state.examAges.push(sc.lastExamAge);
      const total = nonNeg(sc.lastExamTotal);
      const correct = Math.min(nonNeg(sc.lastExamCorrect), total);
      if (total > 0) {
        const ratio = correct / total;
        if (ratio > this.state.bestExam.ratio || (ratio === this.state.bestExam.ratio && correct > this.state.bestExam.correct)) {
          this.state.bestExam = { correct, total, ratio };
        }
      }
      this.push(gains, this.add('study', examPoints(correct, total), `exam:${sc.lastExamAge}`, clock));
    }

    // 毕业
    if (sc.graduated && !this.state.flags.graduated) {
      this.state.flags.graduated = true;
      this.push(gains, this.add('study', gradPoints(sc.gradeTag, sc.recommendation), `graduate:${sc.gradeTag}`, clock));
    }

    // 任务：按重复次数逐次四舍五入（与实时计分一致：side 两次 = 15 + 8 = 23）
    for (const rt of extra.questRuntimes) {
      if (rt.status !== 'completed' && !(rt.repeatCount > 0)) continue;
      const tier: 'main' | 'side' | 'daily' = rt.tier === 'main' ? 'main' : rt.tier === 'daily' ? 'daily' : 'side';
      const n = Math.max(0, Math.floor(num(rt.repeatCount, 0)));
      const times = Math.max(n, rt.status === 'completed' ? 1 : 0);
      if (times <= 0) continue;
      let pts = 0;
      for (let k = 0; k < times; k++) pts += questPoints(tier, k, false, 0);
      this.push(gains, this.add('diligence', pts, `backfill:${rt.id}`, clock));
      this.state.counters.questsDone += times;
      if (tier === 'daily') this.state.counters.dailyDone += times;
      if (tier === 'main' && !this.state.mainDone.includes(rt.id)) {
        this.state.mainDone.push(rt.id);
        this.state.counters.mainDistinct += 1;
      }
    }

    // 年龄：从 6 岁补到当前年龄（E1/E2）
    this.state.lastAge = 6;
    this.applyAges(clock, gains);

    // 课堂/聊天/睡觉/区域/看病无从还原 → 从 0 开始（文档化的已知损失）
    const unlocked = this.evaluate(factsFromState(this.state, view), clock, true);
    this.state.backfilled = true;
    const after = DIMS.reduce((n, d) => n + this.state.dims[d], 0);
    return { pts: after - before, unlocked: unlocked.length };
  }

  reset(): void {
    this.state = defaultState(true);
    this.tickAcc = 0;
  }

  // ---------- 主循环绑定 ----------

  /** 主循环：每 1 秒调用一次 viewProvider() → sync() → evaluate() */
  bind(viewProvider: BoundProvider): void {
    this.provider = viewProvider;
  }

  tick(dt: number): void {
    if (!this.provider) return;
    this.tickAcc += dt;
    if (this.tickAcc < 1) return;
    this.tickAcc = 0;
    const p = this.provider();
    if (!p) return;
    this.sync(p.view);
    this.evaluate(p.facts(), p.view.clock);
  }

  // ---------- 内部 ----------

  private add(dim: Dim, pts: number, reason: string, clock: ScoreClock): ScoreGain | null {
    const n = Math.max(0, Math.round(pts));
    if (n <= 0) return null;
    this.state.dims[dim] += n;
    this.state.ledger.gained[dim] += n;
    const gain: ScoreGain = { dim, pts: n, reason, day: clock.day, age: clock.age };
    for (const cb of this.gainCbs) cb(gain);
    this.store.append?.(gain);
    return gain;
  }

  private push(list: ScoreGain[], g: ScoreGain | null): void {
    if (g) list.push(g);
  }

  private applyAges(clock: ScoreClock, gains: ScoreGain[]): void {
    const target = Math.floor(num(clock.age, 6));
    if (target <= this.state.lastAge) return;
    for (let age = this.state.lastAge + 1; age <= target; age++) {
      this.push(gains, this.add('exp', 3, `age:${age}`, clock));
      const milestone = MILESTONE_AGES[age];
      if (milestone) this.push(gains, this.add('exp', milestone, `milestone:${age}`, clock));
    }
    this.state.lastAge = target;
  }

  private rollDaily(day: number): void {
    const d = this.state.daily;
    if (d.day === day) return;
    d.day = day;
    d.chat = 0;
    d.gift = 0;
    d.chores = 0;
    d.classes = 0;
    d.cured = 0;
    d.crisis = 0;
    d.rest = 0;
    d.meal = 0;
    d.work = 0;
  }

  /** 事件之后顺手结算一次（绑定了世界时才做，纯测试里无副作用） */
  private syncBound(): void {
    if (!this.provider) return;
    const p = this.provider();
    if (!p) return;
    this.sync(p.view);
  }
}
