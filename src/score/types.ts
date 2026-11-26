// 人生得分 + 成就系统：公共类型定义
// 本文件的类型被 src/score/* 与 UI/存档共用；运行时常量只有 DIMS / SCORE_SCHEMA。
// 设计约束（见 docs/achievement-design.md §5.1）：计分核心不读 daynight / window，
// 天数与年龄一律由调用方通过 ScoreClock 传入，保证可以在 Node 里直接测试。

export type Dim = 'friend' | 'study' | 'diligence' | 'health' | 'exp';

export const DIMS: readonly Dim[] = ['friend', 'study', 'diligence', 'health', 'exp'];

/** 计分快照的独立版本号（外层 SaveData.v 保持 2 不变） */
export const SCORE_SCHEMA = 1;

/** 调用方传入的“当前时刻”，核心不自己读时间（便于 node 测试） */
export interface ScoreClock {
  day: number; // gameDayIndex()
  age: number; // player.age
}

/** 事件型加分来源（推导型来源不走事件，由 sync(view) 结算） */
export type ScoreEvent =
  | {
      type: 'quest';
      id: string;
      tier: 'main' | 'side' | 'daily';
      repeatCount: number;
      chainEnd: boolean;
      paid: number;
    }
  | { type: 'class'; subject: string; score: number; late: boolean }
  | { type: 'chat'; npc: string }
  | { type: 'gift'; npc: string; liked: -1 | 0 | 1 }
  | { type: 'cured'; disease: string; how: string }
  | { type: 'crisis_survived' }
  | { type: 'rest' }
  | { type: 'meal'; healthy: boolean }
  | { type: 'region'; name: string }
  | { type: 'work_shift'; job: string }; // 预留：将来的打工系统直接接入

/** 一次加分的流水（供年终结算、调试、未来服务器上报） */
export interface ScoreGain {
  dim: Dim;
  pts: number;
  reason: string; // 例：'quest:main-first-job'、'peak:jym:3'、'exam:12'
  day: number;
  age: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  dim: Dim;
  bonus: number;
  hidden?: boolean;
  hint?: string; // hidden 未解锁时显示的提示
  test: (f: ScoreFacts) => boolean;
}

export interface UnlockRecord {
  day: number;
  age: number;
}

/** 每日计数（按游戏日统计，跨日由 rollDaily 清零） */
export interface DailyCounters {
  day: number;
  chat: number;
  gift: number;
  chores: number;
  classes: number;
  cured: number;
  crisis: number;
  rest: number;
  meal: number;
  work: number;
}

/** 累计计数（成就判定用，只增不减） */
export interface ScoreCounters {
  classes: number;
  questsDone: number;
  dailyDone: number;
  mainDistinct: number;
  cured: number;
  crisis: number;
  rests: number;
  chats: number;
  gifts: number;
}

/** 引擎内存状态（与快照同构；数组替代 Set/Map，便于 JSON 序列化） */
export interface ScoreState {
  dims: Record<Dim, number>;
  bonus: number; // 成就奖励分合计
  peaks: Record<string, number>; // 居民 id → 历史最高好感档 0..5
  secrets: string[]; // 已计分的秘密（居民 id）
  examAges: number[]; // 已计分的考试年龄
  bestExam: { correct: number; total: number; ratio: number };
  regions: string[]; // 已计分的区域
  lastAge: number; // 已结算到的年龄（E1/E2）
  flags: { graduated: boolean };
  counters: ScoreCounters;
  mainDone: string[]; // 已完成过的主线任务（去重）
  daily: DailyCounters;
  achievements: Record<string, UnlockRecord>; // 含未知 id（来自更新版本），原样保留
  ledger: { gained: Record<Dim, number>; bonus: number; unlocked: string[] }; // 自上次年终结算以来
  backfilled: boolean; // 是否已对旧档补记
}

export interface ScoreSnapshot extends ScoreState {
  v: number;
}

/** 判定成就用的只读事实（由 facts.ts 从 ctx + state 组装，测试里手写） */
export interface ScoreFacts {
  age: number;
  dims: Record<Dim, number>;
  peaks: Record<string, number>;
  secretCount: number;
  bestExam: { correct: number; total: number; ratio: number };
  school: {
    subjects: Record<string, number>;
    graduated: boolean;
    gradeTag: 'A' | 'B' | 'C';
    recommendation: boolean;
  };
  counters: ScoreCounters;
  questsCompleted: readonly string[];
  regionCount: number;
}

/** sync() 需要的世界状态（facts.ts 从 ctx 读出，测试里手写） */
export interface WorldView {
  clock: ScoreClock;
  residents: { id: string; affinity: number; secretRevealed: boolean }[];
  school: {
    lastExamAge: number;
    lastExamCorrect: number;
    lastExamTotal: number;
    subjects: Record<string, number>;
    graduated: boolean;
    gradeTag: 'A' | 'B' | 'C';
    recommendation: boolean;
  };
  questsCompleted: readonly string[];
}
