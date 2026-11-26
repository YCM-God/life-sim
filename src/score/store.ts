// 人生分的持久化边界：引擎只认 ScoreStore 接口，换服务器只需换实现。
// 默认实现把快照写进现有 SaveData.score（localStorage 续档与 IndexedDB 玫瑰存档共用同一份
// SaveData，所以两种存档自动一致），历代人生写进独立的 localStorage 键（不随 clearSave 消失）。
import type { SaveData } from '../core/save';
import type { Dim, ScoreGain, ScoreSnapshot } from './types';

export const LEGACY_KEY = 'life-sim:legacy';
export const LEGACY_MAX = 20;

/** 一生结束时归档的本世总结（不随 clearSave 删除） */
export interface LifeRecord {
  name: string;
  endedAt: number;
  age: number;
  total: number;
  dims: Record<Dim, number>;
  title: string;
  achievements: string[]; // 解锁的 id
}

/** 人生分的持久化边界。read/write 走存档载体；append 供未来服务器上报。 */
export interface ScoreStore {
  readonly kind: 'save-field' | 'memory' | 'remote';
  /** 从一份存档载体中读出计分快照；没有（旧档）返回 null */
  read(save: SaveData | null): unknown | null;
  /** 把快照写进存档载体（captureSave 调用） */
  write(save: SaveData, snap: ScoreSnapshot): void;
  /** 可选：逐条事件上报（本地实现为空；服务器实现可批量 POST 做校验） */
  append?(gain: ScoreGain): void;
  /** 一生结束时归档本世总结（不随 clearSave 删除） */
  archiveLife(rec: LifeRecord): void;
  /** 历代人生（新的在前） */
  listLegacy(): LifeRecord[];
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // 隐私模式 / 被禁用
  }
}

function isLifeRecord(v: unknown): v is LifeRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Partial<LifeRecord>;
  return typeof r.name === 'string' && typeof r.total === 'number' && typeof r.age === 'number';
}

/** 默认实现：快照住在 SaveData.score；历代人生住在 localStorage[LEGACY_KEY] */
export class SaveFieldScoreStore implements ScoreStore {
  readonly kind = 'save-field' as const;

  read(save: SaveData | null): unknown | null {
    return (save as { score?: unknown } | null)?.score ?? null;
  }

  write(save: SaveData, snap: ScoreSnapshot): void {
    (save as { score?: ScoreSnapshot }).score = snap;
  }

  archiveLife(rec: LifeRecord): void {
    const ls = storage();
    if (!ls) return;
    try {
      const list = this.listLegacy();
      list.unshift(rec);
      ls.setItem(LEGACY_KEY, JSON.stringify(list.slice(0, LEGACY_MAX)));
    } catch {
      /* 配额满 / 隐私模式：归档失败不能把游戏搞崩 */
    }
  }

  listLegacy(): LifeRecord[] {
    const ls = storage();
    if (!ls) return [];
    try {
      const raw = ls.getItem(LEGACY_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw) as unknown;
      if (!Array.isArray(arr)) return [];
      return arr.filter(isLifeRecord).slice(0, LEGACY_MAX);
    } catch {
      return [];
    }
  }
}

/** 测试 / 无痕模式用的内存实现（不写 localStorage） */
export class MemoryScoreStore implements ScoreStore {
  readonly kind = 'memory' as const;
  private snap: unknown | null = null;
  private legacy: LifeRecord[] = [];

  read(_save: SaveData | null): unknown | null {
    return this.snap;
  }

  write(_save: SaveData, snap: ScoreSnapshot): void {
    this.snap = snap;
  }

  archiveLife(rec: LifeRecord): void {
    this.legacy.unshift(rec);
    if (this.legacy.length > LEGACY_MAX) this.legacy.length = LEGACY_MAX;
  }

  listLegacy(): LifeRecord[] {
    return this.legacy.slice();
  }
}
