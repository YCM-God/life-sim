// 出租车寻路：A* 四方向。公路代价 1，草地/广场等可通行地块代价 3（能借道但优先公路），固体不可走
import { T } from '../map/tiles';
import type { World } from '../map/world';

export function findPath(world: World, sx: number, sy: number, ex: number, ey: number): [number, number][] | null {
  const W = world.w;
  const start = sy * W + sx;
  const goal = ey * W + ex;
  if (start === goal) return [];
  const gScore = new Map<number, number>();
  const from = new Map<number, number>();
  const fScore = new Map<number, number>();
  const open: number[] = [start];
  gScore.set(start, 0);
  const h = (i: number): number => Math.abs((i % W) - ex) + Math.abs(((i / W) | 0) - ey);
  fScore.set(start, h(start));
  let iter = 0;
  while (open.length > 0 && iter++ < 60000) {
    // 取 f 最小节点（开放集很小，线性扫即可）
    let bi = 0;
    let bf = fScore.get(open[0]) ?? Infinity;
    for (let k = 1; k < open.length; k++) {
      const ff = fScore.get(open[k]) ?? Infinity;
      if (ff < bf) {
        bf = ff;
        bi = k;
      }
    }
    const cur = open.splice(bi, 1)[0];
    if (cur === goal) {
      const path: [number, number][] = [];
      let n = cur;
      while (n !== start) {
        path.push([n % W, (n / W) | 0]);
        n = from.get(n)!;
      }
      return path.reverse();
    }
    const cx = cur % W;
    const cy = (cur / W) | 0;
    const dirs = [1, -1, W, -W];
    for (const d of dirs) {
      const ni = cur + d;
      const nx = ni % W;
      const ny = (ni / W) | 0;
      // 四方向邻接约束：防止 +1/-1 跨行绕路
      if (Math.abs(nx - cx) + Math.abs(ny - cy) !== 1) continue;
      if (!world.inBounds(nx, ny) || world.isSolidTile(nx, ny)) continue;
      const cost = world.getGround(nx, ny) === T.Road ? 1 : 3;
      const ng = (gScore.get(cur) ?? Infinity) + cost;
      if (ng < (gScore.get(ni) ?? Infinity)) {
        gScore.set(ni, ng);
        from.set(ni, cur);
        fScore.set(ni, ng + h(ni));
        if (!open.includes(ni)) open.push(ni);
      }
    }
  }
  return null;
}
