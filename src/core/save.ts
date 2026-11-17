// 存档系统：把「一局人生」的全部状态存进 localStorage，刷新/关页后接着玩
// 设计取舍：
//   · 只存状态，不存世界（地图/居民/NPC 台词都由代码生成，重放即得）
//   · 时间轴用 daynight 的 OFFSET 存，重开页面后游戏时间继续往前走（离开期间也过日子）
//   · 自动存档 5 秒一次 + 切后台/关页时立刻存，玩家不需要「手动存」这个动作
//   · 版本号写进存档，格式变了就丢弃旧档而不是崩掉
import type { GameContext } from '../context';
import type { Gender, Stats } from '../data/character';
import type { HealthSnapshot } from './health';
import type { SchoolSnapshot } from '../systems/schoolState';
import type { WeatherSnapshot } from './weather';
import type { QuestSnapshot } from '../quest/questManager';
import type { ResidentSnapshot } from '../entities/resident';
import type { IndoorScene } from '../scenes/indoorScene';
import { TILE } from '../config';
import { setTimeOffset, timeOffset } from './daynight';
import { currentPlayMs, setPlayMs } from './playtime';

export const SAVE_KEY = 'life-sim:save';
export const SAVE_VERSION = 2;

export interface PlayerSnapshot {
  gender: Gender;
  stats: Stats;
  name: string;
  stamina: number;
  knowledge: number;
  money: number;
  taxiRides: number;
  taxiDebt: number;
  facing: 'up' | 'down' | 'left' | 'right';
  x: number;
  y: number;
  birthDay: number;
  allowanceDay: number;
}

export interface SaveData {
  v: number;
  savedAt: number;
  playMs?: number; // 本局累计游玩时长（旧版存档没有此字段，读档按 0 处理）
  offset: number;
  player: PlayerSnapshot;
  residents: Record<string, ResidentSnapshot>;
  health: HealthSnapshot;
  school: SchoolSnapshot;
  weather: WeatherSnapshot;
  quests: QuestSnapshot;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** 把当前一局打包成可序列化的存档；还没选角色（player.stats 为空）时返回 null */
export function captureSave(ctx: GameContext): SaveData | null {
  const p = ctx.player;
  if (!p.stats) return null;
  const aging = p.agingState();
  const residents: Record<string, ResidentSnapshot> = {};
  for (const r of ctx.overworld.residents.list) residents[r.def.id] = r.snapshot();
  // 室内存档：玩家坐标是房间内的小坐标系，直接存下来读档会把人扔到世界左上角，
  // 所以改成存"这栋楼门口"的位置，读档后站在门外，最接近真实处境。
  const indoor = ctx.scenes.current as IndoorScene | null;
  const outside = indoor?.outsideTile;
  const pos = outside
    ? { x: outside.tx * TILE + (TILE - p.w) / 2, y: outside.ty * TILE + (TILE - p.h) }
    : { x: p.x, y: p.y };
  return {
    v: SAVE_VERSION,
    savedAt: Date.now(),
    playMs: currentPlayMs(),
    offset: timeOffset(),
    player: {
      gender: p.gender,
      stats: clone(p.stats),
      name: p.name,
      stamina: p.stamina,
      knowledge: p.knowledge,
      money: p.money,
      taxiRides: p.taxiRides,
      taxiDebt: p.taxiDebt,
      facing: p.facing,
      x: pos.x,
      y: pos.y,
      birthDay: aging.birthDay,
      allowanceDay: aging.allowanceDay,
    },
    residents,
    health: ctx.health.snapshot(),
    school: ctx.schoolState.snapshot(),
    weather: ctx.weather.snapshot(),
    quests: ctx.quests.snapshot(),
  };
}

/**
 * 读档。分两步：restorePlayer 在场景/系统就位后调用，
 * restoreQuests 必须在 quests.bind(ctx) 之后调用（bind 会重置每日状态）。
 */
export function restorePlayer(ctx: GameContext, d: SaveData): void {
  const p = ctx.player;
  const s = d.player;
  p.gender = s.gender;
  p.stats = clone(s.stats);
  p.name = s.name ?? (s.gender === 'male' ? '小明' : '小红');
  p.stamina = s.stamina;
  p.knowledge = s.knowledge;
  p.money = s.money;
  p.taxiRides = s.taxiRides ?? 0;
  p.taxiDebt = s.taxiDebt ?? 0;
  p.facing = s.facing ?? 'down';
  p.x = s.x;
  p.y = s.y;
  p.restoreAging({ birthDay: s.birthDay, allowanceDay: s.allowanceDay });

  for (const r of ctx.overworld.residents.list) {
    const rs = d.residents?.[r.def.id];
    if (rs) r.restore(rs);
  }
  ctx.health.restore(d.health);
  ctx.schoolState.restore(d.school);
  ctx.weather.restore(d.weather);
  // 游玩时长随进度一起恢复（旧档没有该字段则归零）
  setPlayMs(d.playMs ?? 0);
  // 时间轴按存档恢复到"当时这一刻"，之后照常流动
  setTimeOffset(d.offset);
}

export function restoreQuests(ctx: GameContext, d: SaveData): void {
  ctx.quests.restore(d.quests);
}

// ---------- 本地存储 ----------

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // 隐私模式 / 被禁用
  }
}

/** 读档；不存在、解析失败或版本不匹配都返回 null */
export function loadSave(): SaveData | null {
  const ls = storage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    if (!d || d.v !== SAVE_VERSION || !d.player || !d.quests || !d.health) return null;
    if (typeof d.offset !== 'number' || !Number.isFinite(d.offset)) return null;
    return d;
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  return loadSave() !== null;
}

export function writeSave(ctx: GameContext): boolean {
  const ls = storage();
  if (!ls) return false;
  const data = captureSave(ctx);
  if (!data) return false;
  try {
    ls.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    // 配额满了（极少见）：至少别把游戏搞崩
    return false;
  }
}

export function clearSave(): void {
  try {
    storage()?.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

/** 自动存档节拍器：每 intervalMs 存一次，另外在切后台/关页时强制存一次 */
export class SaveKeeper {
  private acc = 0;
  private readonly intervalMs: number;

  constructor(
    private readonly ctx: GameContext,
    intervalMs = 5000,
  ) {
    this.intervalMs = intervalMs;
    const flush = (): void => {
      if (this.ctx.player.stats) writeSave(this.ctx);
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) flush();
    });
  }

  tick(dt: number): void {
    this.acc += dt * 1000;
    if (this.acc < this.intervalMs) return;
    this.acc = 0;
    if (this.ctx.player.stats) writeSave(this.ctx);
  }
}
