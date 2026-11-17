// 路边停车位判定：纯函数，不修改世界、不修改 parkedSlots
// 约束：Road/Bridge 才可停；必须贴道路外侧；不能在路口/斑马线/门口/站牌 1 格内
import { TILE } from '../config';
import { T } from '../map/tiles';
import { TAXI_STANDS } from './taxiStand';

export type Dir = 0 | 1 | 2 | 3;

const DIRS: readonly [number, number][] = [
  [1, 0],  // 0 右
  [0, 1],  // 1 下
  [-1, 0], // 2 左
  [0, -1], // 3 上
];

export const PARK_OFFSET = 6; // 车身中心相对道路中心线向外偏移，5–7px 取中值
export const PARK_VIEW_X = 18; // 生成时“不在玩家视野内”的水平半宽（Tile）
export const PARK_VIEW_Y = 12; // 生成时“不在玩家视野内”的垂直半高（Tile）

// 项目目前没有公交站数据；预留给后续公交系统
export const BUS_STOPS: ReadonlyArray<{ tx: number; ty: number }> = [];

export interface ParkingWorld {
  getGround(tx: number, ty: number): number;
  buildings: ReadonlyArray<{ doorTx: number; doorTy: number }>;
}

export interface ParkingSlot {
  tx: number;
  ty: number;
  side: -1 | 1;      // 相对道路正向：+1 右侧，-1 左侧
  roadDir: Dir;       // 道路正向（同一条路固定）
  heading: Dir;       // 车头朝向：右侧同向，左侧反向
  offsetX: number;    // 车身中心相对 Tile 中心
  offsetY: number;
  centerX: number;    // 世界像素坐标
  centerY: number;
  slotKey: string;
}

function opposite(dir: Dir): Dir {
  return ((dir + 2) % 4) as Dir;
}

function isRoadSurface(g: number): boolean {
  return g === T.Road || g === T.Bridge;
}

function roadAt(world: ParkingWorld, tx: number, ty: number): boolean {
  return isRoadSurface(world.getGround(tx, ty));
}

/**
 * 路口判定：以该格为中心 2 格半径内，水平与垂直两个轴是否都连着道路。
 * 2 格宽道路的另一条车道只在 1 格内，不会被误判成垂直道路；
 * 真正交叉的支路会延伸到 2 格以外。
 */
export function isIntersectionAt(world: ParkingWorld, tx: number, ty: number): boolean {
  const horizontal = roadAt(world, tx - 2, ty) || roadAt(world, tx + 2, ty);
  const vertical = roadAt(world, tx, ty - 2) || roadAt(world, tx, ty + 2);
  return horizontal && vertical;
}

/**
 * 项目没有斑马线 Tile；用“路口外扩 1 格”作为保守的斑马线近似，
 * 保证不会把车停在路口人行横道可能覆盖的格子上。
 */
export function isCrosswalkAt(world: ParkingWorld, tx: number, ty: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (isIntersectionAt(world, tx + dx, ty + dy)) return true;
    }
  }
  return false;
}

/** 道路正方向：水平路取东/西中实际相连的一条；垂直路取南/北中实际相连的一条 */
function canonicalRoadDir(world: ParkingWorld, tx: number, ty: number, dir: Dir): Dir | null {
  const axis = (dir % 2) as 0 | 1; // 0 水平，1 垂直
  const fwd: Dir = axis === 0 ? 0 : 1;
  const back = opposite(fwd);
  const fwdRoad = roadAt(world, tx + DIRS[fwd][0], ty + DIRS[fwd][1]);
  const backRoad = roadAt(world, tx + DIRS[back][0], ty + DIRS[back][1]);
  if (!fwdRoad && !backRoad) return null;
  return fwdRoad ? fwd : back;
}

/**
 * 计算停车位。返回 null 表示该格/该方向不可停。
 * 纯函数：只读 world，不写 parkedSlots。
 */
export function parkingSlotAt(world: ParkingWorld, tx: number, ty: number, dir: Dir): ParkingSlot | null {
  // 1. 必须是道路/桥
  if (!roadAt(world, tx, ty)) return null;

  // 2. 车头方向必须与道路方向平行（前后至少一边是路）
  const roadDir = canonicalRoadDir(world, tx, ty, dir);
  if (roadDir === null) return null;

  // 3. 外侧相邻格必须是非道路；内侧相邻格必须是道路（排除 1 格窄路/路中心）
  const perp = DIRS[(roadDir + 1) % 4] as [number, number];
  const right = DIRS[(roadDir + 1) % 4] as [number, number];
  const left = DIRS[(roadDir + 3) % 4] as [number, number];
  const rightRoad = roadAt(world, tx + right[0], ty + right[1]);
  const leftRoad = roadAt(world, tx + left[0], ty + left[1]);
  if (rightRoad === leftRoad) return null; // 两侧都路=路中心；两侧都非路=1格窄路
  const side: -1 | 1 = rightRoad ? -1 : 1; // 右侧是路，则外侧在左；反之在右

  // 4. 不在路口：2 格半径内不能水平、垂直两个轴都通
  if (isIntersectionAt(world, tx, ty)) return null;

  // 5. 不在斑马线近似区
  if (isCrosswalkAt(world, tx, ty)) return null;

  // 6. 不在建筑门口 1 格内（切比雪夫距离）
  for (const b of world.buildings) {
    if (Math.abs(tx - b.doorTx) <= 1 && Math.abs(ty - b.doorTy) <= 1) return null;
  }

  // 7. 不在公交站 / 出租车停靠点 1 格内
  for (const s of TAXI_STANDS) {
    if (Math.abs(tx - s.tx) <= 1 && Math.abs(ty - s.ty) <= 1) return null;
  }
  for (const s of BUS_STOPS) {
    if (Math.abs(tx - s.tx) <= 1 && Math.abs(ty - s.ty) <= 1) return null;
  }

  const heading: Dir = side === 1 ? roadDir : opposite(roadDir);
  const offsetX = perp[0] * side * PARK_OFFSET;
  const offsetY = perp[1] * side * PARK_OFFSET;
  const centerX = tx * TILE + TILE / 2 + offsetX;
  const centerY = ty * TILE + TILE / 2 + offsetY;

  return {
    tx,
    ty,
    side,
    roadDir,
    heading,
    offsetX,
    offsetY,
    centerX,
    centerY,
    slotKey: parkingSlotKey(tx, ty, heading),
  };
}

export function parkingSlotKey(tx: number, ty: number, heading: Dir): string {
  return `${tx},${ty},${heading}`;
}

/**
 * 车位是否可用。dir 传道路水平/垂直方向的任一朝向即可（内部会归一化）。
 * parkedSlots 只读，不在这里占用；占用由 CarManager 在生成时原子 add。
 */
export function canParkAt(
  world: ParkingWorld,
  tx: number,
  ty: number,
  dir: Dir,
  parkedSlots: ReadonlySet<string>,
): boolean {
  const slot = parkingSlotAt(world, tx, ty, dir);
  return slot !== null && !parkedSlots.has(slot.slotKey);
}
