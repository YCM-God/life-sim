import { T, hash2 } from './tiles';
import { nightCanvas } from '../core/daynight';
import type { World } from './world';
import { getRegionGroups } from './regionInfo';

// 圆形小地图（右上角）：全图一次性缩样渲染进离屏画布，每帧裁圆显示 + 红点标玩家
// 区域名标签按与玩家红点的距离淡入（近亮远隐），保持小图整洁
export const MAP_R = 78;                   // 圆半径
// 右侧 192px 被属性面板常驻占据（面板区=屏幕外），小地图整体左移让位（规格 §8 A/B 之「左移」分支）
export const MAP_CX = 920;                 // 圆心 x
export const MAP_CY = MAP_R + 14;          // 圆心 y（贴上缘）
const SAMPLE = 2;                   // 每 2x2 Tile 采样 1 像素

let cached: { world: World; cv: HTMLCanvasElement; scaleX: number; scaleY: number } | null = null;

function colorOf(world: World, tx: number, ty: number): string {
  const g0 = world.getGround(tx, ty);
  switch (g0) {
    case T.Water: return '#3d6fb4';
    case T.Sand: return '#d8c58a';
    case T.Road: return '#b3935f';
    case T.Plaza: return '#98a0a4';
    case T.Bridge: return '#9c7850';
    case T.Roof: return '#8a5a4a';
    case T.Door: return '#5a4632';
    case T.GardenPath: return '#d6c6a3';
    case T.TulipRed: return '#b8473f';
    case T.TulipOrange: return '#d9764a';
    case T.TulipPink: return '#e2a08e';
    case T.TulipCream: return '#f0e3cd';
    case T.Hyacinth: return '#9b8fc0';
    case T.WildMeadow: return '#7e9160';
    default: break;
  }
  const d = world.getDecor(tx, ty);
  // 小地图不画植被；只保留地面/道路/建筑/喷泉
  if (d === T.Fountain) return '#3d6fb4';
  // 草地：按区域与哈希给三档绿（森林带更暗）
  if (ty < 22) return hash2(tx, ty) < 0.5 ? '#3f7530' : '#376628';
  return hash2(tx, ty) < 0.14 ? '#457f33' : '#4d8f3a';
}

// 采样画布 + 椭圆映射系数：大小地图共用
export function worldMapImage(world: World): { cv: HTMLCanvasElement; scaleX: number; scaleY: number } {
  if (cached && cached.world === world) return cached;
  const mw = Math.ceil(world.w / SAMPLE);
  const mh = Math.ceil(world.h / SAMPLE);
  const cv = document.createElement('canvas');
  cv.width = mw;
  cv.height = mh;
  const g = cv.getContext('2d')!;
  for (let by = 0; by < mh; by++) {
    for (let bx = 0; bx < mw; bx++) {
      g.fillStyle = colorOf(world, bx * SAMPLE, by * SAMPLE);
      g.fillRect(bx, by, 1, 1);
    }
  }
  // 世界长宽比 3.6:1，圆装不下矩形：x/y 独立缩放把地图撑进圆
  // 系数 1/√2 让世界四角恰好落在圆周内，内容零丢失（轻微椭圆变形）
  const scaleX = (MAP_R * 2) / (Math.SQRT2 * mw);
  const scaleY = (MAP_R * 2) / (Math.SQRT2 * mh);
  cached = { world, cv, scaleX, scaleY };
  return cached;
}

// 世界 Tile 坐标 → 小地图屏幕坐标
// 采样画布 1px = SAMPLE x SAMPLE Tile，缩放后每 Tile 占 scale / SAMPLE 屏幕像素
export function minimapPos(world: World, tx: number, ty: number): { x: number; y: number } {
  const { scaleX, scaleY } = worldMapImage(world);
  return {
    x: MAP_CX + ((tx - world.w / 2) / SAMPLE) * scaleX,
    y: MAP_CY + ((ty - world.h / 2) / SAMPLE) * scaleY,
  };
}

// 每帧调用：世界场景渲染最后
export function drawMinimap(g: CanvasRenderingContext2D, world: World, playerTx: number, playerTy: number, night = false): void {
  const { cv, scaleX, scaleY } = worldMapImage(world);
  const img = night ? nightCanvas(cv) : cv;
  const mw = cv.width, mh = cv.height;
  const dot = minimapPos(world, playerTx, playerTy);

  // 底与外圈
  g.fillStyle = 'rgba(10,12,16,0.55)';
  g.beginPath();
  g.arc(MAP_CX, MAP_CY, MAP_R + 5, 0, Math.PI * 2);
  g.fill();

  g.save();
  g.beginPath();
  g.arc(MAP_CX, MAP_CY, MAP_R, 0, Math.PI * 2);
  g.clip();
  g.translate(MAP_CX, MAP_CY);
  g.scale(scaleX, scaleY);
  g.drawImage(img, -mw / 2, -mh / 2);
  g.restore();

  // 区域名标签：按与红点距离淡入
  g.font = '10px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'bottom';
  for (const rg of getRegionGroups(world)) {
    const p = minimapPos(world, rg.tx, rg.ty);
    const d = Math.hypot(p.x - dot.x, p.y - dot.y);
    const a = Math.max(0, Math.min(1, 1.25 - d / 70));
    if (a <= 0.05) continue;
    g.globalAlpha = a;
    g.strokeStyle = 'rgba(0,0,0,0.8)';
    g.lineWidth = 2.5;
    g.strokeText(rg.name, p.x, p.y - 3);
    g.fillStyle = '#f0ead8';
    g.fillText(rg.name, p.x, p.y - 3);
  }
  g.globalAlpha = 1;

  // 外圈描边 + 方位标记（北）
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.strokeStyle = 'rgba(232,232,232,0.8)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(MAP_CX, MAP_CY, MAP_R, 0, Math.PI * 2);
  g.stroke();
  g.font = '12px monospace';
  g.fillStyle = '#e8e8e8';
  g.fillText('北', MAP_CX - 6, MAP_CY - MAP_R - 12);

  // 玩家红点（呼吸闪烁）
  const pulse = 3.5 + Math.sin(Date.now() / 240) * 0.8;
  g.fillStyle = '#e83a3a';
  g.beginPath();
  g.arc(dot.x, dot.y, pulse + 1.6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(dot.x, dot.y, pulse, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#e83a3a';
  g.beginPath();
  g.arc(dot.x, dot.y, Math.max(pulse - 1.2, 1.4), 0, Math.PI * 2);
  g.fill();
}
