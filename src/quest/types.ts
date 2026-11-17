// 任务系统数据结构：任务卡、目标、状态、任务链、选择分支
// 设计原则：任务只做三件事——给关系一个开口、给时间一个形状、给回忆一个落点

export type QuestTier = 'main' | 'side' | 'daily';
export type QuestType = 'errand' | 'collect' | 'talk' | 'timed' | 'choice' | 'long';
export type QuestSource = 'npc' | 'board' | 'phone' | 'school' | 'random' | 'story';

export interface PlaceDef {
  name: string;
  tx: number;
  ty: number;
  r?: number;
}

export type Objective =
  | { kind: 'talk'; npc: string; hint: string }
  | { kind: 'visit'; place: string; hint: string }
  | { kind: 'collect'; places: string[]; hint: string }
  | { kind: 'wait'; days: number; hint: string };

export interface QuestPrereq {
  minAge?: number;
  maxAge?: number;
  affinity?: { npc: string; min: number };
  done?: string;              // 前置任务 id
  weather?: 'rain' | 'clear';
  hourFrom?: number;
  hourTo?: number;
}

export interface QuestReward {
  money?: number;
  affinity?: number;
  item?: string;
  tag?: string;
  log: string;                // 完成后的日志正文（不含年龄前缀）
}

export interface QuestChoice {
  label: string;
  tag?: string;
  affinity?: { npc: string; delta: number };
  log: string;
}

export interface QuestChainRef {
  id: string;
  ring: number;
  total: number;
}

export interface QuestDef {
  id: string;
  name: string;
  tier: QuestTier;
  type: QuestType;
  source: QuestSource;
  desc: string;
  giver?: string;             // 发布者 NPC id
  turnIn?: string;            // 交付对象 NPC id；缺省为自动完成
  prereq?: QuestPrereq;
  objectives: Objective[];
  timeLimitDays?: number;     // 0..7；接取日算第 0 天，还能再用 N 个整天
  deadlineHour?: number;      // 6..23；当日截止整点（日界 06:00）
  softDeadline?: boolean;
  noDeadline?: boolean;       // true = 确实无时限（逃生舱）
  warnHours?: number;         // 默认 2；(0,12]
  window?: { from: number; to: number };
  reward: QuestReward;
  turnInLine?: string;         // 交付时 NPC 的一句口语化台词（≤20 字）
  failLog?: string;
  choices?: QuestChoice[];
  chain?: QuestChainRef;
  repeat?: 'none' | 'daily' | 'weekly';
}

export type QuestStatus = 'available' | 'active' | 'ready' | 'completed' | 'failed' | 'expired';

export interface QuestRuntime {
  def: QuestDef;
  status: QuestStatus;
  progress: number[];         // 每个目标的进度
  visited: Set<string>;       // collect 目标已到过的地点
  acceptedDay: number;
  deadlineDay: number;
  deadlineHour?: number;
  deadlineAbsHour?: number;   // 权威：绝对游戏小时
  warnStage: 0 | 1 | 2;       // 已发出的临期档位
  expiredLogged: boolean;     // 超时记账幂等标志
  repeatCount: number;
  readyAnnounced: boolean;
  completedDay: number;       // 完成/失败/过期日，用于重复冷却
}
