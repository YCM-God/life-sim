import { CHUNK, TILE, VIEW_H, VIEW_W } from '../config';
import { NONE, T, drawTile, hash2 } from './tiles';
import { nightCanvas } from '../core/daynight';
import type { World } from './world';

// 分块渲染：静态层（地面+装饰）按 16x16 Tile 缓存到离屏 canvas
// 镜头只画到可见分块；LRU 控制内存。世界改动后需调用 invalidateAll。
// 夜晚变体按需烘焙（首次进入黑夜时逐像素重映射，见 daynight.nightCanvas）
// 灯光层 lights：透明画布，仅夜晚绘制——路灯（沿路按最小间距布点）+ 水面月光碎光
interface ChunkEntry { day: HTMLCanvasElement; night?: HTMLCanvasElement; lights?: HTMLCanvasElement }
const cache = new Map<string, ChunkEntry>();
const lru: string[] = [];
const MAX_CHUNKS = 12; // 每块 512x512 RGBA 约 1MB；12 块约 12MB，夜版另计

function buildChunk(world: World, cx: number, cy: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = CHUNK * TILE;
  cv.height = CHUNK * TILE;
  const g = cv.getContext('2d')!;
  for (let ty = 0; ty < CHUNK; ty++) {
    for (let tx = 0; tx < CHUNK; tx++) {
      const wx = cx * CHUNK + tx;
      const wy = cy * CHUNK + ty;
      drawTile(g, world.getGround(wx, wy), tx * TILE, ty * TILE, wx, wy);
    }
  }
  for (let ty = 0; ty < CHUNK; ty++) {
    for (let tx = 0; tx < CHUNK; tx++) {
      const wx = cx * CHUNK + tx;
      const wy = cy * CHUNK + ty;
      const d = world.getDecor(wx, wy);
      // 树改为独立精灵（Y 排序/树冠遮挡/风动），不再烘焙进静态块
      if (d !== NONE && d !== T.Tree) drawTile(g, d, tx * TILE, ty * TILE, wx, wy);
    }
  }
  return cv;
}

// ---- 路灯布点：全世界一次性扫描，哈希候选 + 空间网格保证最小间距 ----
const lampSets = new Map<World, Set<string>>();

function lampSet(world: World): Set<string> {
  let set = lampSets.get(world);
  if (set) return set;
  set = new Set();
  const grid = new Map<string, [number, number][]>(); // 8x8 Tile 桶
  for (let ty = 0; ty < world.h; ty++) {
    for (let tx = 0; tx < world.w; tx++) {
      const gr = world.getGround(tx, ty);
      if (gr !== T.Road && gr !== T.Plaza) continue;
      if (hash2(tx * 13 + 7, ty * 17 + 3) >= 0.09) continue; // ~9% 候选
      // 与已布路灯切比雪夫距离 ≥ 6
      let ok = true;
      for (let by = (ty >> 3) - 1; by <= (ty >> 3) + 1 && ok; by++) {
        for (let bx = (tx >> 3) - 1; bx <= (tx >> 3) + 1 && ok; bx++) {
          const pts = grid.get(bx + ',' + by);
          if (!pts) continue;
          for (const [lx, ly] of pts) {
            if (Math.max(Math.abs(lx - tx), Math.abs(ly - ty)) < 6) { ok = false; break; }
          }
        }
      }
      if (!ok) continue;
      set.add(tx + ',' + ty);
      const bk = (tx >> 3) + ',' + (ty >> 3);
      const arr = grid.get(bk);
      if (arr) arr.push([tx, ty]);
      else grid.set(bk, [[tx, ty]]);
    }
  }
  lampSets.set(world, set);
  return set;
}

// 像素风路灯：地面光池 + 灯杆 + 双层方形光晕 + 灯头
function drawLamp(g: CanvasRenderingContext2D, px: number, py: number): void {
  // 地面光池（向外渐弱的两圈）
  g.fillStyle = 'rgba(255,214,140,0.07)';
  g.fillRect(px - 4, py + 14, 40, 20);
  g.fillStyle = 'rgba(255,214,140,0.12)';
  g.fillRect(px, py + 16, 32, 14);
  // 光晕（灯头后方，先画）
  g.fillStyle = 'rgba(255,220,150,0.14)';
  g.fillRect(px + 7, py - 3, 18, 16);
  g.fillStyle = 'rgba(255,226,160,0.28)';
  g.fillRect(px + 10, py, 12, 10);
  // 灯杆
  g.fillStyle = '#22262e';
  g.fillRect(px + 14, py + 6, 3, 22);
  g.fillRect(px + 11, py + 4, 9, 3);
  // 灯头
  g.fillStyle = '#ffe9b0';
  g.fillRect(px + 13, py + 6, 5, 4);
}

// 月光碎光：水面上横向的白色亮痕（稀疏、含蓄）
function drawGlint(g: CanvasRenderingContext2D, px: number, py: number, tx: number, ty: number): void {
  const ox = 4 + ((hash2(tx * 29 + 3, ty * 31 + 9) * 20) | 0);
  const oy = 6 + ((hash2(tx * 37 + 5, ty * 41 + 1) * 20) | 0);
  g.fillStyle = 'rgba(215,232,255,0.20)';
  g.fillRect(px + ox - 2, py + oy, 11, 2);
  g.fillStyle = 'rgba(240,248,255,0.5)';
  g.fillRect(px + ox, py + oy, 6, 1);
}

function buildChunkLights(world: World, cx: number, cy: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = CHUNK * TILE;
  cv.height = CHUNK * TILE;
  const g = cv.getContext('2d')!;
  const lamps = lampSet(world);
  for (let ty = 0; ty < CHUNK; ty++) {
    for (let tx = 0; tx < CHUNK; tx++) {
      const wx = cx * CHUNK + tx;
      const wy = cy * CHUNK + ty;
      if (lamps.has(wx + ',' + wy)) drawLamp(g, tx * TILE, ty * TILE);
      else if (world.getDecor(wx, wy) === T.GardenLamp) drawLamp(g, tx * TILE, ty * TILE);
      else if (world.getGround(wx, wy) === T.Water && hash2(wx * 3 + 1, wy * 5 + 2) < 0.05) {
        drawGlint(g, tx * TILE, ty * TILE, wx, wy);
      }
    }
  }
  return cv;
}

function getChunk(world: World, cx: number, cy: number, night: boolean): HTMLCanvasElement {
  const key = cx + ',' + cy;
  const entry = cache.get(key);
  if (entry) {
    const i = lru.indexOf(key);
    if (i >= 0) lru.splice(i, 1);
    lru.push(key);
    if (!night) return entry.day;
    return entry.night ?? (entry.night = nightCanvas(entry.day));
  }
  const day = buildChunk(world, cx, cy);
  cache.set(key, { day });
  lru.push(key);
  while (lru.length > MAX_CHUNKS) {
    const old = lru.shift()!;
    if (old !== key) cache.delete(old);
  }
  return day;
}

export function invalidateChunks(): void {
  cache.clear();
  lru.length = 0;
}

export function renderWorld(g: CanvasRenderingContext2D, world: World, camX: number, camY: number, night = false): void {
  const cx0 = Math.max(0, Math.floor(camX / TILE / CHUNK));
  const cx1 = Math.min(Math.ceil(world.w / CHUNK) - 1, Math.floor((camX + VIEW_W) / TILE / CHUNK));
  const cy0 = Math.max(0, Math.floor(camY / TILE / CHUNK));
  const cy1 = Math.min(Math.ceil(world.h / CHUNK) - 1, Math.floor((camY + VIEW_H) / TILE / CHUNK));
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      g.drawImage(getChunk(world, cx, cy, night), cx * CHUNK * TILE - camX, cy * CHUNK * TILE - camY);
    }
  }
  // 夜晚灯光层叠在最上
  if (!night) return;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const key = cx + ',' + cy;
      const entry = cache.get(key);
      if (!entry) continue;
      const lights = entry.lights ?? (entry.lights = buildChunkLights(world, cx, cy));
      g.drawImage(lights, cx * CHUNK * TILE - camX, cy * CHUNK * TILE - camY);
    }
  }
}
