// 人生得分规则：常量与纯函数
// 设计约束：数值按 AGING_DAYS=3 的真实时间轴校准（一生约 282 个游戏日、约 56 节课、
// 13 次期末考），实现时不要随手改大阈值，否则第 6 阶学业 / 第 7 阶友情永远拿不到。
import type { Dim } from './types';

/** 好感档 → 累计友情分（每档增量 5/5/10/10/20，单人满档累计 50） */
export const PEAK_POINTS: readonly number[] = [0, 5, 10, 20, 30, 50];

/** 任务基础分（再乘重复衰减） */
export const QUEST_BASE: Record<'main' | 'side' | 'daily', number> = {
  main: 30,
  side: 15,
  daily: 5,
};

/** 重复衰减：首次 ×1、第 2 次 ×0.5、之后 ×0.25（与金钱奖励同规则） */
export function repeatDecay(n: number): number {
  return n === 0 ? 1 : n === 1 ? 0.5 : 0.25;
}

/** 每日计分上限（防刷；计数与计分分开，见 ScoreEngine） */
export const DAILY_CAPS = {
  chat: 3,
  gift: 2,
  chores: 3,
  classes: 2,
  cured: 1,
  crisis: 1,
  rest: 1,
  meal: 1,
  work: 1,
} as const;

/** 维度分阶阈值 */
export const TIERS: Record<Dim, number[]> = {
  friend: [20, 60, 120, 200, 320, 480, 700],
  study: [20, 80, 180, 320, 500, 750],
  diligence: [100, 400, 1000],
  health: [30, 120, 300],
  exp: [50, 150, 300],
};

/** 维度阶名（与 TIERS 一一对应） */
export const TIER_NAMES: Record<Dim, string[]> = {
  friend: ['点头之交', '熟面孔', '街坊朋友', '知心人', '知交满巷', '一呼百应', '人间值得'],
  study: ['开蒙', '用功', '优等生', '学霸', '学神之路', '状元之才'],
  diligence: ['热心肠', '闲不住', '劳模'],
  health: ['会照顾自己', '身体是本钱', '养生达人'],
  exp: ['见过世面', '走南闯北', '阅尽人间'],
};

/** 里程碑年龄 → 阅历加分 */
export const MILESTONE_AGES: Record<number, number> = {
  18: 20,
  30: 20,
  60: 30,
  80: 30,
  100: 50,
};

/** 人生称号（按总分从高到低匹配） */
export const LIFE_TITLES: [number, string][] = [
  [3500, '传奇的一生'],
  [2200, '精彩的一生'],
  [1200, '充实的一生'],
  [500, '踏踏实实的一生'],
  [0, '平平淡淡的一生'],
];

export const DIM_NAMES: Record<Dim, string> = {
  friend: '友情',
  study: '学业',
  diligence: '勤勉',
  health: '健康',
  exp: '阅历',
};

/** 成就图标先不用美术，用维度色块（设计文档 §11） */
export const DIM_COLORS: Record<Dim, string> = {
  friend: '#e88aa8',
  study: '#8ab4e8',
  diligence: '#e8c85a',
  health: '#7fd18a',
  exp: '#b89ae8',
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** S1：一节课的学业分 = 1 + 表现分加成（迟到只给基础 1 分） */
export function classPoints(score: number, late: boolean): number {
  if (late) return 1;
  const bonus = clamp(Math.floor((score - 50) / 10), 0, 5);
  return 1 + bonus;
}

/** S2：期末考试 = 答对题数 × 3，正确率 ≥80% 再 +20，满分再 +20 */
export function examPoints(correct: number, total: number): number {
  if (!Number.isFinite(correct) || !Number.isFinite(total) || total <= 0 || correct <= 0) return 0;
  let pts = correct * 3;
  const ratio = correct / total;
  if (ratio >= 0.8) pts += 20;
  if (correct === total) pts += 20;
  return pts;
}

/** S3：毕业成绩档 A/B/C + 教师推荐 */
export function gradPoints(tag: 'A' | 'B' | 'C', rec: boolean): number {
  const base = tag === 'A' ? 80 : tag === 'B' ? 40 : 15;
  return base + (rec ? 30 : 0);
}

/**
 * D1~D5：一次任务完成的勤勉分（不含每日上限，上限在引擎里扣）。
 * chainEnd：任务链最后一环 +20；paid ≥ 10（实际拿到钱）视作打工 +5。
 */
export function questPoints(
  tier: 'main' | 'side' | 'daily',
  repeatCount: number,
  chainEnd: boolean,
  paid: number,
): number {
  const n = Math.max(0, Math.floor(repeatCount));
  let pts = Math.round(QUEST_BASE[tier] * repeatDecay(n));
  if (chainEnd) pts += 20;
  if (paid >= 10) pts += 5;
  return pts;
}

/** 维度分落在第几阶（0 = 未入阶） */
export function tierOf(dim: Dim, pts: number): number {
  const t = TIERS[dim];
  let n = 0;
  while (n < t.length && pts >= t[n]) n += 1;
  return n;
}

/** 下一阶阈值与阶名；已满阶返回 null */
export function nextTier(dim: Dim, pts: number): { at: number; name: string } | null {
  const t = TIERS[dim];
  const idx = tierOf(dim, pts);
  if (idx >= t.length) return null;
  return { at: t[idx], name: TIER_NAMES[dim][idx] };
}

/** 人生称号 */
export function lifeTitle(total: number): string {
  for (const [min, name] of LIFE_TITLES) {
    if (total >= min) return name;
  }
  return LIFE_TITLES[LIFE_TITLES.length - 1][1];
}
