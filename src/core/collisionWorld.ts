// 像素级 AABB 动态碰撞层（collision.js 的 TypeScript 移植：相同算法与阈值）
// 补足 Tile 网格覆盖不到的动态障碍（行驶中的车辆）：
// 玩家与车辆硬碰撞、贴边滑动由 player.update 的分轴检查完成，本模块负责重叠恢复。
import { TILE } from '../config';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const boxesOverlap = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** 点矩形是否命中任一障碍盒 */
export function hitsAny(boxes: Box[], x: number, y: number, w: number, h: number): boolean {
  if (boxes.length === 0) return false;
  const b: Box = { x, y, w, h };
  for (const o of boxes) if (boxesOverlap(b, o)) return true;
  return false;
}

export interface StuckState {
  frames: number;
}

/**
 * 卡死恢复（规范 §4.1）：与障碍重叠时沿穿透深度最小的轴推出，每帧最多 pushPx。
 * 返回 'pushing' 期间调用方累计 state.frames，达到阈值后应使用 nearestFreeTile 瞬移兜底。
 */
export function mtvResolve(
  pos: { x: number; y: number },
  w: number,
  h: number,
  obstacles: Box[],
  state: StuckState,
  pushPx = 2,
): 'clear' | 'pushing' {
  const b: Box = { x: pos.x, y: pos.y, w, h };
  const hit = obstacles.find((o) => boxesOverlap(b, o));
  if (!hit) {
    state.frames = 0;
    return 'clear';
  }
  const pL = b.x + b.w - hit.x;
  const pR = hit.x + hit.w - b.x;
  const pU = b.y + b.h - hit.y;
  const pD = hit.y + hit.h - b.y;
  const m = Math.min(pL, pR, pU, pD);
  const p = Math.min(pushPx, m);
  if (m === pL) pos.x -= p;
  else if (m === pR) pos.x += p;
  else if (m === pU) pos.y -= p;
  else pos.y += p;
  state.frames++;
  return 'pushing';
}

/**
 * 瞬移兜底目标（规范 §4.1 第 3 级）：以 (tx,ty) 为中心螺旋搜索 ≤maxR Tile 内
 * 第一个可站立格，返回与 Player.placeAtTile 一致的落点坐标。
 */
export function nearestFreeTile(
  tx: number,
  ty: number,
  w: number,
  h: number,
  maxR: number,
  isFree: (x: number, y: number) => boolean,
): { x: number; y: number } | null {
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = (tx + dx) * TILE + (TILE - w) / 2;
        const y = (ty + dy) * TILE + (TILE - h);
        if (isFree(x, y)) return { x, y };
      }
    }
  }
  return null;
}
