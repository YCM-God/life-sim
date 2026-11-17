import { NONE, T, isSolidTileId } from './tiles';
import type { SolidGrid } from '../core/collision';

export interface Region {
  id: string;
  name: string;
  x: number; y: number; w: number; h: number; // Tile 为单位
}

export interface Building {
  id: string;
  name: string;
  x: number; y: number; w: number; h: number; // 屋顶占地区域（footprint）
  doorTx: number; doorTy: number;             // 门触发格（在 footprint 外 2 Tile 立面带内）
  indoor: string;                             // 室内布局 id
  kind: string;                               // 建筑类型：house/shop/school/office/mall/tower/station/apartment
  face: 'N' | 'S';                            // 立面朝向：门开在北侧（朝街）或南侧
}

export interface DoorLink {
  sceneId: string;
  buildingId: string;
}

// 世界数据：地面层 + 装饰层 + 区域 + 建筑 + 门索引
// 采用数据驱动：改地图只动 worldgen，不用改引擎代码
export class World implements SolidGrid {
  readonly ground: Uint16Array;
  readonly decor: Uint16Array;
  regions: Region[] = [];
  buildings: Building[] = [];
  private doors = new Map<number, DoorLink>();

  constructor(public readonly w: number, public readonly h: number) {
    this.ground = new Uint16Array(w * h);
    this.decor = new Uint16Array(w * h).fill(NONE);
  }

  idx(tx: number, ty: number): number {
    return ty * this.w + tx;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }

  getGround(tx: number, ty: number): number {
    return this.inBounds(tx, ty) ? this.ground[this.idx(tx, ty)] : T.Wall;
  }

  setGround(tx: number, ty: number, t: T): void {
    if (this.inBounds(tx, ty)) this.ground[this.idx(tx, ty)] = t;
  }

  getDecor(tx: number, ty: number): number {
    return this.inBounds(tx, ty) ? this.decor[this.idx(tx, ty)] : NONE;
  }

  setDecor(tx: number, ty: number, t: T): void {
    if (this.inBounds(tx, ty)) this.decor[this.idx(tx, ty)] = t;
  }

  isSolidTile(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return true;
    const i = this.idx(tx, ty);
    const d = this.decor[i];
    if (d !== NONE && isSolidTileId(d)) return true;
    return isSolidTileId(this.ground[i]);
  }

  addDoor(tx: number, ty: number, link: DoorLink): void {
    this.doors.set(this.idx(tx, ty), link);
  }

  doorAt(tx: number, ty: number): DoorLink | undefined {
    return this.inBounds(tx, ty) ? this.doors.get(this.idx(tx, ty)) : undefined;
  }

  regionAt(tx: number, ty: number): Region | undefined {
    for (const r of this.regions) {
      if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) return r;
    }
    return undefined;
  }
}
