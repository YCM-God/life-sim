import { TILE } from '../config';
import { rectHitsSolid } from '../core/collision';
import { gameHour, gameDayIndex } from '../core/daynight';
import { drawCharacter } from './player';
import { RESIDENTS } from '../data/residents';
import type { ResidentDef, ScheduleSeg } from '../data/residents';
import type { World } from '../map/world';

// 居民运行时实体：按日程表在锚点间移动、游荡或巡逻
// 记忆三本账：到访账（连续到访 streak）、恩情账（好感度）、失信账（冷淡日）
const SPEED = 56; // px/s，比玩家慢，街道的速度感

function inSeg(h: number, s: ScheduleSeg): boolean {
  if (s.from <= s.to) return h >= s.from && h < s.to;
  return h >= s.from || h < s.to; // 跨天（夜班 22→6）
}

export class Resident {
  x = 0;
  y = 0;
  readonly def: ResidentDef;
  facing: 'up' | 'down' | 'left' | 'right' = 'down';
  affinity = 0;              // 恩情账：好感度
  coldUntilDay = -1;         // 失信账：冷淡截止日（送讨厌礼物触发）
  secretRevealed = false;
  lastChatDay = -1;
  lastGiftDay = -1;
  private lastVisitDay = -1;
  streak = 0;                // 到访账：连续到访天数
  private animT = 0;
  private moving = false;
  private targetX = 0;
  private targetY = 0;
  private pauseT = 0;
  private patrolIdx = 0;
  private chatIdx = 0;

  constructor(def: ResidentDef) {
    this.def = def;
    const seg = def.schedule[0];
    this.placeAt(seg.x, seg.y);
    this.targetX = this.x;
    this.targetY = this.y;
  }

  placeAt(tx: number, ty: number): void {
    this.x = tx * TILE + (TILE - 24) / 2;
    this.y = ty * TILE + (TILE - 28);
  }

  // 当前时段段
  private seg(h: number): ScheduleSeg {
    const s = this.def.schedule.find((s) => inSeg(h, s));
    return s ?? this.def.schedule[this.def.schedule.length - 1];
  }

  update(dt: number, world: World, playerX: number, playerY: number): void {
    const hour = gameHour();
    const seg = this.seg(hour);

    // 巡逻型沿 waypoint 循环
    if (seg.patrol && seg.patrol.length > 1) {
      const [wx, wy] = seg.patrol[this.patrolIdx];
      if (this.distTile(wx, wy) < 0.4) {
        this.patrolIdx = (this.patrolIdx + 1) % seg.patrol.length;
      }
      this.targetX = seg.patrol[this.patrolIdx][0] * TILE + 4;
      this.targetY = seg.patrol[this.patrolIdx][1] * TILE + 4;
    } else {
      // 离锚点太远（通勤中）：直接落位（玩家看不见的距离才瞬移）
      const ax = seg.x * TILE + 4;
      const ay = seg.y * TILE + 4;
      if (Math.hypot(ax - this.x, ay - this.y) > 120 * TILE) this.placeAt(seg.x, seg.y);
      // 游荡：到点后歇一会儿，再锚点半径内随机一点
      if (this.pauseT > 0) {
        this.pauseT -= dt;
      } else if (this.distPx(this.targetX, this.targetY) < 6) {
        const r = (seg.r ?? 2) * TILE;
        this.targetX = ax + (Math.random() * 2 - 1) * r;
        this.targetY = ay + (Math.random() * 2 - 1) * r * 0.6;
        this.pauseT = 1.5 + Math.random() * 4;
      }
    }

    // 朝目标走（分轴 + 碰撞，和玩家一致）
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const d = Math.hypot(dx, dy);
    this.moving = d > 4 && this.pauseT <= 0;
    if (this.moving) {
      this.animT += dt;
      if (Math.abs(dx) > Math.abs(dy)) this.facing = dx > 0 ? 'right' : 'left';
      else this.facing = dy > 0 ? 'down' : 'up';
      const step = SPEED * dt;
      const nx = this.x + (dx / d) * step;
      if (!rectHitsSolid(world, nx, this.y, 20, 24)) this.x = nx;
      const ny = this.y + (dy / d) * step;
      if (!rectHitsSolid(world, this.x, ny, 20, 24)) this.y = ny;
    }

    // 到访账：靠近即记（对话开启时由 manager 记录更准，这里兜底）
    void playerX;
    void playerY;
  }

  private distTile(tx: number, ty: number): number {
    return Math.hypot(this.x / TILE - tx, this.y / TILE - ty);
  }
  private distPx(px: number, py: number): number {
    return Math.hypot(px - this.x, py - this.y);
  }

  distTo(px: number, py: number): number {
    return Math.hypot(px - (this.x + 12), py - (this.y + 14));
  }

  // ---- 记忆接口 ----
  recordVisit(): void {
    const day = gameDayIndex();
    if (day === this.lastVisitDay) return;
    this.streak = day === this.lastVisitDay + 1 ? this.streak + 1 : 1;
    this.lastVisitDay = day;
  }
  canChatBonus(): boolean {
    return gameDayIndex() !== this.lastChatDay;
  }
  markChatted(): void {
    this.lastChatDay = gameDayIndex();
    this.affinity = Math.min(5, this.affinity + 1);
  }
  canGiftToday(): boolean {
    return gameDayIndex() !== this.lastGiftDay;
  }
  markGifted(delta: number): void {
    this.lastGiftDay = gameDayIndex();
    this.affinity = Math.max(0, Math.min(5, this.affinity + delta));
    if (delta < 0) this.coldUntilDay = gameDayIndex(); // 失信：今日冷淡
  }
  isCold(): boolean {
    return gameDayIndex() <= this.coldUntilDay;
  }
  isWarm(): boolean {
    return this.affinity >= 3 || this.streak >= 3;
  }

  nextChat(): string {
    const line = this.def.lines.chat[this.chatIdx % this.def.lines.chat.length];
    this.chatIdx++;
    return line;
  }

  render(g: CanvasRenderingContext2D, ox: number, oy: number, playerX: number, playerY: number): void {
    const sx = Math.round(this.x + ox);
    const sy = Math.round(this.y + oy);
    const look = this.def.look;
    const sc = look.scale ?? 1;

    g.save();
    g.translate(sx + 12, sy + 28);
    g.scale(sc, sc);
    g.translate(-12, -28);
    drawCharacter(g, 0, 0, this.facing, this.animT, look, this.moving);

    // 配饰（像素风小件，锚定身体）
    switch (look.accessory) {
      case 'hat': // 鸭舌帽
        g.fillStyle = '#3a4038';
        g.fillRect(6, -2, 12, 3);
        g.fillRect(4, 1, 16, 2);
        break;
      case 'apron': // 围裙
        g.fillStyle = 'rgba(240,234,216,0.85)';
        g.fillRect(7, 11, 10, 9);
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(7, 11, 10, 2);
        break;
      case 'radio': // 对讲机 + 天线
        g.fillStyle = '#22262e';
        g.fillRect(19, 8, 4, 6);
        g.fillRect(20, 4, 1, 4);
        g.fillStyle = '#7fd18a';
        g.fillRect(20, 9, 2, 2);
        break;
      case 'headphones': // 头戴耳机
        g.fillStyle = '#22262e';
        g.fillRect(7, -1, 10, 2);
        g.fillRect(5, 1, 2, 4);
        g.fillRect(17, 1, 2, 4);
        break;
      case 'bag': // 布袋
        g.fillStyle = '#8a6f55';
        g.fillRect(1, 13, 4, 7);
        break;
      case 'timer': // 手腕计时器
        g.fillStyle = '#e8c84a';
        g.fillRect(19, 16, 3, 3);
        break;
      default:
        break;
    }
    g.restore();

    // 玩家靠近时显名字牌（远观靠剪影，近观看名字）
    if (this.distTo(playerX, playerY) < 5 * TILE) {
      g.font = '11px monospace';
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      const label = this.def.name;
      const w = g.measureText(label).width;
      g.fillStyle = 'rgba(10,12,16,0.6)';
      g.fillRect(sx + 12 - w / 2 - 4, sy - 14, w + 8, 13);
      g.fillStyle = this.secretRevealed ? '#ffd166' : '#e8e8e8';
      g.fillText(label, sx + 12, sy - 3);
      g.textAlign = 'left';
      g.textBaseline = 'middle';
    }
  }

  // ---- 存档：好感账、失信账、秘密、来访/送礼/聊天日期 ----

  snapshot(): ResidentSnapshot {
    return {
      affinity: this.affinity,
      coldUntilDay: this.coldUntilDay,
      secretRevealed: this.secretRevealed,
      lastChatDay: this.lastChatDay,
      lastGiftDay: this.lastGiftDay,
      lastVisitDay: this.lastVisitDay,
      streak: this.streak,
    };
  }

  restore(s: ResidentSnapshot): void {
    this.affinity = s.affinity ?? 0;
    this.coldUntilDay = s.coldUntilDay ?? -1;
    this.secretRevealed = !!s.secretRevealed;
    this.lastChatDay = s.lastChatDay ?? -1;
    this.lastGiftDay = s.lastGiftDay ?? -1;
    this.lastVisitDay = s.lastVisitDay ?? -1;
    this.streak = s.streak ?? 0;
  }
}

/** 存档快照：单个居民的关系状态（不存位置，位置由日程重新算出） */
export interface ResidentSnapshot {
  affinity: number;
  coldUntilDay: number;
  secretRevealed: boolean;
  lastChatDay: number;
  lastGiftDay: number;
  lastVisitDay: number;
  streak: number;
}

// 管理器：持有 20 名居民，更新、渲染、查询最近可对话者
export class ResidentManager {
  readonly list: Resident[] = RESIDENTS.map((def) => new Resident(def));

  update(dt: number, world: World, playerX: number, playerY: number): void {
    for (const r of this.list) {
      // 远处的只做瞬移级调度，不走路（省性能）
      const d = Math.hypot(r.x - playerX, r.y - playerY);
      if (d < 90 * TILE) r.update(dt, world, playerX, playerY);
      else {
        const hour = gameHour();
        const seg = r.def.schedule.find((s) => inSeg(hour, s)) ?? r.def.schedule[r.def.schedule.length - 1];
        r.placeAt(seg.x, seg.y);
      }
    }
  }

  render(g: CanvasRenderingContext2D, ox: number, oy: number, playerX: number, playerY: number): void {
    for (const r of this.list) {
      if (r.x + ox < -40 || r.x + ox > 1320 || r.y + oy < -40 || r.y + oy > 760) continue;
      r.render(g, ox, oy, playerX, playerY);
    }
  }

  // 玩家附近可对话的居民（56px 内取最近，约 1.75 格）
  nearest(px: number, py: number, maxDist = 56): Resident | null {
    let best: Resident | null = null;
    let bd = maxDist;
    for (const r of this.list) {
      const d = r.distTo(px, py);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  }
}
