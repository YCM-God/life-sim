// 城镇车流：道路上持续刷新 ≥10 辆汽车（其中 40% 是可招揽的出租车）
// 规则：私家车只走公路；出租车可借道草地/广场（代价更高），但遇到行人必须停车避让，绝不撞人
import { TILE } from '../config';
import { gameHour } from '../core/daynight';
import type { Box } from '../core/collisionWorld';
import { T, hash2 } from '../map/tiles';
import type { World } from '../map/world';
import { parkingSlotAt } from './parking';
import type { ParkingSlot } from './parking';
import { VIEW_H, VIEW_W } from '../config';

const MAX_PER_ZONE = 10;     // 每个区域最多 10 辆
const MAX_PER_SCREEN = 3;    // 同一屏最多 3 辆
const MAX_TOTAL = 40;        // 全场上限
const ZONE_REFRESH_COOLDOWN = 600_000; // 同区域 10 分钟内不重刷
const MAX_ZONE_HISTORY = 3;  // 只保留当前 + 2 个最近区域的车；第 4 个区域远回收
const SCREEN_TILES_W = Math.floor(VIEW_W / TILE);
const SCREEN_TILES_H = Math.floor(VIEW_H / TILE);
const CAR_SPEED = 92;        // px/s
const PERSON_STOP = 13;      // 前方有行人进入此距离（px）就刹停
const FOLLOW_GAP = 26;       // 同向跟车距离（px，车身长 24，留 2px 余量）
const LANE_SLIDE = 10;       // 借道避让的最大侧偏（px）：单向车道会车时各靠一侧
const SLIDE_SPEED = 46;      // 侧偏速度 px/s

const CAR_COLORS = ['#7a8a9a', '#8a6a5a', '#5a7a6a', '#6a6a7a', '#9a8a6a'];
export const TAXI_COLOR = '#e8c85a';

interface Car {
  x: number;
  y: number;
  dir: 0 | 1 | 2 | 3;   // 0右 1下 2左 3上
  taxi: boolean;
  color: string;
  seed: number;
  off: number;          // 侧偏（px）：单向车道会车时借道避让，正负表示靠哪侧
  parked?: boolean;     // 路边停车：不参与行驶，但仍参与碰撞/渲染/打车
  slotKey?: string;     // 占用中的停车位 key，销毁时释放
  zoneId: string;       // 生成区域；用于区域回收
  slotId: string;       // 确定性车位 id；存档恢复用
}

interface CarSpot {
  zoneId: string;
  slotId: string;
  kind: 'moving' | 'parked';
  tx: number;
  ty: number;
  dir: 0 | 1 | 2 | 3;
  x: number;
  y: number;
  slotKey?: string;
}

interface ParkingSpot extends CarSpot {
  kind: 'parked';
  roadId: string;
  rowId: string;
  order: number;
  side: -1 | 1;
}

interface ParkingRow {
  id: string;
  roadId: string;
  dir: 0 | 1;
  side: -1 | 1;
  spots: ParkingSpot[];
  filled: number;
}

export interface CarSave {
  zoneId: string;
  slotId: string;
  x: number;
  y: number;
  dir: 0 | 1 | 2 | 3;
  taxi: boolean;
  color: string;
  parked: boolean;
  slotKey?: string;
}

const DIRS: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // 0右 1下 2左 3上

// 车辆可走的地块：公路 + 桥梁（桥承载公路，私家车也要能过河）
function driveable(g: number): boolean {
  return g === T.Road || g === T.Bridge;
}

// 该方向上公路可走的选择（私家车限定）
function roadDirsAt(world: World, tx: number, ty: number, dir: 0 | 1 | 2 | 3): (0 | 1 | 2 | 3)[] {
  const fwd = DIRS[dir];
  const opts: (0 | 1 | 2 | 3)[] = [];
  if (driveable(world.getGround(tx + fwd[0], ty + fwd[1]))) opts.push(dir);
  const left = ((dir + 3) % 4) as 0 | 1 | 2 | 3;
  const right = ((dir + 1) % 4) as 0 | 1 | 2 | 3;
  const lft = DIRS[left];
  const rgt = DIRS[right];
  if (driveable(world.getGround(tx + lft[0], ty + lft[1]))) opts.push(left);
  if (driveable(world.getGround(tx + rgt[0], ty + rgt[1]))) opts.push(right);
  return opts;
}

// 出租车：任何非固体地块（草地/广场/沙滩）都可走
function anyDirsAt(world: World, tx: number, ty: number, dir: 0 | 1 | 2 | 3): (0 | 1 | 2 | 3)[] {
  const opts: (0 | 1 | 2 | 3)[] = [];
  for (const nd of [dir, ((dir + 3) % 4) as 0 | 1 | 2 | 3, ((dir + 1) % 4) as 0 | 1 | 2 | 3] as (0 | 1 | 2 | 3)[]) {
    const v = DIRS[nd];
    if (!world.isSolidTile(tx + v[0], ty + v[1])) opts.push(nd);
  }
  return opts;
}


function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(arr: T[], rand: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export class CarManager {
  private cars: Car[] = [];
  private readonly parkedSlots = new Set<string>();
  private currentZone = '';
  private readonly zoneHistory: string[] = [];
  private readonly zoneCars = new Map<string, string[]>();
  private readonly lastRefresh = new Map<string, number>();

  update(dt: number, world: World, playerTx: number, playerTy: number, people: { x: number; y: number }[] = []): void {
    const zone = world.regionAt(playerTx, playerTy);
    this.enterZone(world, zone?.id ?? 'outside');

    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      // 只更新当前区域的来车；离开区域后车辆冻结在原位，重新进入位置一致
      if (c.zoneId !== this.currentZone) continue;
      // 路边停车不参与行驶，但仍保留在 cars 里参与碰撞/渲染/打车
      if (c.parked) continue;
      // 到 Tile 中心附近时决定下一步方向
      const ctx = Math.floor((c.x - 8) / TILE);
      const cty = Math.floor((c.y - 8) / TILE);
      const cx = ctx * TILE + 8;
      const cy = cty * TILE + 8;
      const nearCenter = Math.hypot(c.x - cx, c.y - cy) < 5;
      if (nearCenter) {
        const roadOpts = roadDirsAt(world, ctx, cty, c.dir);
        if (c.taxi) {
          // 出租车：75% 优先公路，25% 借道草地/广场；没公路时才穿草地
          const offOpts = anyDirsAt(world, ctx, cty, c.dir);
          if (roadOpts.length > 0) {
            c.dir = Math.random() < 0.75
              ? (roadOpts.includes(c.dir) && Math.random() < 0.7 ? c.dir : roadOpts[(Math.random() * roadOpts.length) | 0])
              : offOpts[(Math.random() * offOpts.length) | 0];
          } else if (offOpts.length > 0 && Math.random() < 0.85) {
            c.dir = offOpts[(Math.random() * offOpts.length) | 0];
          } else {
            c.dir = ((c.dir + 2) % 4) as 0 | 1 | 2 | 3; // 断头路：掉头
          }
        } else {
          if (roadOpts.length === 0) {
            c.dir = ((c.dir + 2) % 4) as 0 | 1 | 2 | 3;
          } else {
            // 直行优先（70%），否则随机转弯
            c.dir = roadOpts.includes(c.dir) && Math.random() < 0.7 ? c.dir : roadOpts[(Math.random() * roadOpts.length) | 0];
          }
        }
      }
      const v = DIRS[c.dir];
      // 侧偏衰减：前方通畅时回到车道中央
      if (c.off !== 0) {
        const d = SLIDE_SPEED * dt;
        c.off = Math.abs(c.off) <= d ? 0 : c.off - Math.sign(c.off) * d;
      }
      // 前探位置 = 本车中心 + 前进 + 当前侧偏
      const perp = DIRS[((c.dir + 1) % 4) as 0 | 1 | 2 | 3];
      const probe = (off: number): [number, number] => [
        c.x + v[0] * CAR_SPEED * dt + perp[0] * off,
        c.y + v[1] * CAR_SPEED * dt + perp[1] * off,
      ];
      // 行人避让：前方有行人（含玩家）就刹停，绝不撞人
      let [nx, ny] = probe(c.off);
      let personBlocked = false;
      for (const p of people) {
        if (Math.hypot(p.x - nx, p.y - ny) < PERSON_STOP) {
          personBlocked = true;
          break;
        }
      }
      // 车距保持：只挡"正前方半区"内的车（同向跟车距离）；并排/对向会车不挡，靠侧偏滑过去
      let carBlocked = false;
      if (!personBlocked) {
        for (let j = 0; j < this.cars.length; j++) {
          if (j === i) continue;
          const o = this.cars[j];
          const dx = o.x - nx;
          const dy = o.y - ny;
          if (dx * v[0] + dy * v[1] > 0 && Math.hypot(dx, dy) < FOLLOW_GAP) {
            carBlocked = true;
            break;
          }
        }
      }
      // 被前车挡住：向固定一侧借道（对向车各靠一侧，避免互堵），借道后仍挡才停车
      if (carBlocked) {
        const side = c.dir === 0 || c.dir === 3 ? 1 : -1;
        const newOff = Math.max(-LANE_SLIDE, Math.min(LANE_SLIDE, c.off + side * SLIDE_SPEED * dt));
        if (newOff !== c.off) {
          const [sx2, sy2] = probe(newOff);
          let clear = true;
          for (const p of people) {
            if (Math.hypot(p.x - sx2, p.y - sy2) < PERSON_STOP) { clear = false; break; }
          }
          if (clear) {
            for (let j = 0; j < this.cars.length; j++) {
              if (j === i) continue;
              const o = this.cars[j];
              const dx = o.x - sx2;
              const dy = o.y - sy2;
              if (dx * v[0] + dy * v[1] > 0 && Math.hypot(dx, dy) < FOLLOW_GAP) { clear = false; break; }
            }
          }
          if (clear) {
            c.off = newOff;
            nx = sx2;
            ny = sy2;
            carBlocked = false;
          }
        }
      }
      if (!personBlocked && !carBlocked) {
        c.x = nx;
        c.y = ny;
      }
    }
  }

  /**
   * 车辆碰撞盒（俯视 AABB，对应《碰撞体设计规范》§2）：
   * 车身视觉 24×16，碰撞盒横停 22×12 / 竖停 12×22（每边内缩横 1 / 纵 2），
   * 阴影、后视镜、车灯等突出物不参与碰撞；供玩家硬碰撞与卡死恢复用。
   */
  obstacles(): Box[] {
    const out: Box[] = [];
    for (const c of this.cars) {
      const perp = DIRS[((c.dir + 1) % 4) as 0 | 1 | 2 | 3];
      const cx = c.x + 12 + perp[0] * c.off;
      const cy = c.y + 10 + perp[1] * c.off;
      const horiz = c.dir === 0 || c.dir === 2;
      const w = horiz ? 22 : 12;
      const h = horiz ? 12 : 22;
      out.push({ x: cx - w / 2, y: cy - h / 2, w, h });
    }
    return out;
  }

  /** 区域进入：首次进入生成；第 4 个区域远时回收旧区域 */
  private enterZone(world: World, zoneId: string): void {
    if (zoneId === this.currentZone) return;
    this.currentZone = zoneId;
    this.zoneHistory.push(zoneId);
    while (this.zoneHistory.length > MAX_ZONE_HISTORY) {
      const old = this.zoneHistory.shift()!;
      this.evictZone(old);
    }
    if (zoneId !== 'outside') this.generateZone(world, zoneId);
  }

  private evictZone(zoneId: string): void {
    for (const c of this.cars) {
      if (c.zoneId === zoneId && c.slotKey) this.parkedSlots.delete(c.slotKey);
    }
    this.cars = this.cars.filter((c) => c.zoneId !== zoneId);
    this.zoneCars.delete(zoneId);
    this.lastRefresh.delete(zoneId);
  }

  private generateZone(world: World, zoneId: string): void {
    if (this.zoneCars.has(zoneId)) return;
    const last = this.lastRefresh.get(zoneId);
    if (last !== undefined && Date.now() - last < ZONE_REFRESH_COOLDOWN) return;
    this.lastRefresh.set(zoneId, Date.now());

    const seed = hashSeed(`${zoneId}:${world.w}x${world.h}`);
    const rand = mulberry32(seed);
    const parked = this.filledParkingSpots(world, zoneId, rand);
    const moving = shuffled(this.zoneSpots(world, zoneId), rand);
    const spots: CarSpot[] = [...parked, ...moving];
    if (spots.length === 0) {
      this.zoneCars.set(zoneId, []);
      return;
    }
    const chosen: string[] = [];
    const perScreen = new Map<string, number>();
    for (const spot of spots) {
      if (chosen.length >= MAX_PER_ZONE) break;
      if (this.cars.length >= MAX_TOTAL) break;
      const screen = `${Math.floor(spot.tx / SCREEN_TILES_W)},${Math.floor(spot.ty / SCREEN_TILES_H)}`;
      if ((perScreen.get(screen) ?? 0) >= MAX_PER_SCREEN) continue;
      perScreen.set(screen, (perScreen.get(screen) ?? 0) + 1);
      chosen.push(spot.slotId);
      if (spot.kind === 'parked' && spot.slotKey) this.parkedSlots.add(spot.slotKey);
      const taxi = rand() < 0.4;
      this.cars.push({
        x: spot.x,
        y: spot.y,
        dir: spot.dir,
        taxi,
        color: taxi ? TAXI_COLOR : CAR_COLORS[(rand() * CAR_COLORS.length) | 0],
        seed: rand() * 1000,
        off: 0,
        parked: spot.kind === 'parked',
        slotKey: spot.slotKey,
        zoneId,
        slotId: spot.slotId,
      });
    }
    this.zoneCars.set(zoneId, chosen);
  }

  /** 车位抽象：按道路侧、方向、序号组织；先按道路取点，再每 2 格取一个 */
  private parkingRows(world: World, zoneId: string): ParkingRow[] {
    const region = world.regions.find((r) => r.id === zoneId);
    if (!region) return [];
    const groups = new Map<string, ParkingSpot[]>();
    for (let ty = region.y; ty < region.y + region.h; ty++) {
      for (let tx = region.x; tx < region.x + region.w; tx++) {
        if (!driveable(world.getGround(tx, ty))) continue;
        const slot = parkingSlotAt(world, tx, ty, 0) ?? parkingSlotAt(world, tx, ty, 1);
        if (!slot) continue;
        const axis = slot.roadDir % 2; // 0=水平 1=垂直
        const lane = axis === 0 ? ty : tx;
        const along = axis === 0 ? tx : ty;
        // 用物理偏移判定道路外侧，而不是局部 canonical roadDir 的 side；
        // 统一同一侧的 heading，避免路端方向反转造成同侧车位分排。
        const tileCenterY = ty * TILE + TILE / 2;
        const tileCenterX = tx * TILE + TILE / 2;
        const side: -1 | 1 = axis === 0
          ? (slot.centerY > tileCenterY ? 1 : -1)
          : (slot.centerX > tileCenterX ? 1 : -1);
        const heading: 0 | 1 | 2 | 3 = axis === 0
          ? (side === 1 ? 0 : 2)
          : (side === 1 ? 1 : 3);
        const roadId = `${zoneId}:${axis === 0 ? 'H' : 'V'}:${lane}:${side}`;
        const list = groups.get(roadId) ?? [];
        list.push({
          zoneId,
          slotId: `${zoneId}:p:${roadId}:${along}`,
          kind: 'parked',
          tx,
          ty,
          dir: heading,
          x: slot.centerX - 12,
          y: slot.centerY - 10,
          slotKey: slot.slotKey,
          roadId,
          rowId: '',
          order: 0,
          side,
        });
        groups.set(roadId, list);
      }
    }

    const rows: ParkingRow[] = [];
    for (const [roadId, list] of groups) {
      const axis = roadId.includes(':H:') ? 0 : 1;
      list.sort((a, b) => (axis === 0 ? a.tx - b.tx : a.ty - b.ty));
      let chunk: ParkingSpot[] = [];
      let lastAlong = -999;
      let startAlong = 0;
      const flush = () => {
        if (chunk.length === 0) return;
        const first = chunk[0];
        rows.push({
          id: `${roadId}:${startAlong}`,
          roadId,
          dir: (first.dir % 2 === 0 ? 0 : 1) as 0 | 1,
          side: first.side,
          spots: chunk,
          filled: 0,
        });
        chunk = [];
      };
      for (const spot of list) {
        const along = axis === 0 ? spot.tx : spot.ty;
        if (chunk.length > 0 && along < lastAlong + 2) continue;
        if (chunk.length > 0 && (along > lastAlong + 2 || chunk.length === 4)) flush();
        if (chunk.length === 0) startAlong = along;
        chunk.push({ ...spot, rowId: `${roadId}:${startAlong}`, order: chunk.length });
        lastAlong = along;
      }
      flush();
    }
    return rows;
  }

  /** 只填 50% 车位；整排优先，排内从排头按序填；行序由确定性 PRNG 打乱 */
  private filledParkingSpots(world: World, zoneId: string, rand: () => number): CarSpot[] {
    const rows = this.parkingRows(world, zoneId);
    const total = rows.reduce((n, r) => n + r.spots.length, 0);
    let remaining = Math.floor(total * 0.5);
    const ordered = shuffled(rows, rand);
    const out: CarSpot[] = [];
    for (const row of ordered) {
      if (remaining <= 0) break;
      const take = Math.min(row.spots.length, remaining);
      for (let i = 0; i < take; i++) out.push(row.spots[i]);
      row.filled = take;
      remaining -= take;
    }
    return out;
  }

  /** 行驶车位：不与停车位混在同一次洗牌里，确保停车成排 */
  private zoneSpots(world: World, zoneId: string): CarSpot[] {
    const region = world.regions.find((r) => r.id === zoneId);
    if (!region) return [];
    const out: CarSpot[] = [];
    for (let ty = region.y; ty < region.y + region.h; ty++) {
      for (let tx = region.x; tx < region.x + region.w; tx++) {
        if (!driveable(world.getGround(tx, ty))) continue;
        const dirs: (0 | 1 | 2 | 3)[] = [0, 1, 2, 3].filter((d) => roadDirsAt(world, tx, ty, d as 0 | 1 | 2 | 3).length > 0) as (0 | 1 | 2 | 3)[];
        if (dirs.length === 0) continue;
        const dir = dirs[(hash2(tx * 13 + 5, ty * 17 + 7) * dirs.length) | 0];
        out.push({
          zoneId,
          slotId: `${zoneId}:${tx},${ty},m,${dir}`,
          kind: 'moving',
          tx,
          ty,
          dir,
          x: tx * TILE + 8,
          y: ty * TILE + 8,
        });
      }
    }
    return out;
  }

  /** 存档：保存区域、车位 id 与当前车辆状态；恢复时不需要重新随机 */
  serializeCars(): CarSave[] {
    return this.cars.map((c) => ({
      zoneId: c.zoneId,
      slotId: c.slotId,
      x: c.x,
      y: c.y,
      dir: c.dir,
      taxi: c.taxi,
      color: c.color,
      parked: !!c.parked,
      slotKey: c.slotKey,
    }));
  }

  restoreCars(saves: CarSave[]): void {
    this.cars = [];
    this.parkedSlots.clear();
    this.zoneCars.clear();
    this.lastRefresh.clear();
    this.zoneHistory.length = 0;
    this.currentZone = '';
    for (const s of saves.slice(0, MAX_TOTAL)) {
      this.cars.push({
        x: s.x,
        y: s.y,
        dir: s.dir,
        taxi: s.taxi,
        color: s.color,
        seed: 0,
        off: 0,
        parked: s.parked,
        slotKey: s.slotKey,
        zoneId: s.zoneId,
        slotId: s.slotId,
      });
      if (s.parked && s.slotKey) this.parkedSlots.add(s.slotKey);
      const ids = this.zoneCars.get(s.zoneId) ?? [];
      ids.push(s.slotId);
      this.zoneCars.set(s.zoneId, ids);
    }
  }

  /** 最近的出租车（招揽上车用） */
  nearestTaxi(px: number, py: number, maxDist = 64): Car | null {
    let best: Car | null = null;
    let bd = maxDist;
    for (const c of this.cars) {
      if (!c.taxi) continue;
      const d = Math.hypot(px - (c.x + 12), py - (c.y + 10));
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  render(g: CanvasRenderingContext2D, ox: number, oy: number): void {
    const lightsOn = gameHour() >= 19 || gameHour() < 6;
    for (const c of this.cars) {
      const sx = Math.round(c.x + ox);
      const sy = Math.round(c.y + oy);
      if (sx < -40 || sx > 1320 || sy < -40 || sy > 760) continue;
      // 侧偏 render：借道避让时车身视觉偏移
      const perp = DIRS[((c.dir + 1) % 4) as 0 | 1 | 2 | 3];
      drawCarSprite(g, sx + 12 + perp[0] * c.off, sy + 10 + perp[1] * c.off, c.dir, c.color, c.taxi, lightsOn);
    }
  }
}

/** 完整车模绘制（大地图车流与车程场景共用）：以车中心点定位，含阴影/车窗/车轮/车灯/出租顶灯 */
export function drawCarSprite(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  dir: 0 | 1 | 2 | 3,
  color: string,
  taxi: boolean,
  lightsOn: boolean,
): void {
  const horiz = dir === 0 || dir === 2;
  const flip = dir === 2 || dir === 3; // 左/上：车头反向
  g.save();
  g.translate(cx, cy);
  if (!horiz) g.rotate(Math.PI / 2);
  if (flip) g.scale(-1, 1);
  // 阴影 + 车身（24x16）+ 车顶 + 车窗 + 车轮
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(-11, 5, 24, 5);
  g.fillStyle = color;
  g.fillRect(-12, -5, 24, 11);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(-12, -5, 24, 2);
  g.fillStyle = '#3a4450';
  g.fillRect(-4, -4, 8, 4); // 车窗
  g.fillStyle = '#1a1a1a';
  g.fillRect(-8, 5, 4, 3);
  g.fillRect(5, 5, 4, 3);
  // 车灯
  g.fillStyle = lightsOn ? '#ffe9b0' : '#d8d0c0';
  g.fillRect(11, -3, 2, 3);
  if (taxi) {
    g.fillStyle = '#f0ead8';
    g.fillRect(-3, -8, 7, 3); // 顶灯
    g.fillStyle = '#8a4a3c';
    g.fillRect(-1, -7, 3, 1);
  }
  g.restore();
}
