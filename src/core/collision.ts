import { TILE } from '../config';

// 碰撞查询接口：世界大地图和室内小地图都按 Tile 提供
export interface SolidGrid {
  w: number;
  h: number;
  isSolidTile(tx: number, ty: number): boolean;
}

// AABB 与 Tile 网格的重叠检测（越界视为实体，防止走出世界）
export function rectHitsSolid(grid: SolidGrid, x: number, y: number, w: number, h: number): boolean {
  const x0 = Math.floor(x / TILE);
  const x1 = Math.floor((x + w - 1) / TILE);
  const y0 = Math.floor(y / TILE);
  const y1 = Math.floor((y + h - 1) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (tx < 0 || ty < 0 || tx >= grid.w || ty >= grid.h) return true;
      if (grid.isSolidTile(tx, ty)) return true;
    }
  }
  return false;
}
