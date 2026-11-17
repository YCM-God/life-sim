import { VIEW_H, VIEW_W } from '../config';
import type { World } from './world';
import { worldMapImage, minimapPos, MAP_R, MAP_CX, MAP_CY } from './minimap';
import { nightCanvas } from '../core/daynight';
import { getRegionGroups } from './regionInfo';

// 全屏地图（Tab 切换）：左侧大圆全图 + 区域标签，右侧地点详情面板
// 打开时游戏暂停（移动与进门判定由场景层跳过）
export const BIG_R = 252;
export const BIG_CX = 400;
export const BIG_CY = VIEW_H / 2;

// Tile 坐标 → 全屏地图屏幕坐标（任务标记用）
export function bigMapScreenPos(world: World, tx: number, ty: number): { x: number; y: number } {
  const p = minimapPos(world, tx, ty);
  const k = BIG_R / MAP_R;
  return { x: BIG_CX + (p.x - MAP_CX) * k, y: BIG_CY + (p.y - MAP_CY) * k };
}

export function drawBigMap(g: CanvasRenderingContext2D, world: World, playerTx: number, playerTy: number, night = false): void {
  const { cv, scaleX, scaleY } = worldMapImage(world);
  const img = night ? nightCanvas(cv) : cv;
  const mw = cv.width, mh = cv.height;

  // 压暗背景
  g.fillStyle = 'rgba(8,10,14,0.78)';
  g.fillRect(0, 0, VIEW_W, VIEW_H);

  g.font = '28px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'top';
  g.fillStyle = '#e8e8e8';
  g.fillText('全城地图', BIG_CX, 36);
  g.font = '14px monospace';
  g.fillStyle = '#8a8f98';
  g.fillText('Tab / Esc 关闭', BIG_CX, 74);

  // 大圆底与裁切
  g.fillStyle = 'rgba(16,20,26,0.9)';
  g.beginPath();
  g.arc(BIG_CX, BIG_CY, BIG_R + 8, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.beginPath();
  g.arc(BIG_CX, BIG_CY, BIG_R, 0, Math.PI * 2);
  g.clip();
  const k = BIG_R / MAP_R; // 相对小地图的放大系数
  g.translate(BIG_CX, BIG_CY);
  g.scale(scaleX * k, scaleY * k);
  g.drawImage(img, -mw / 2, -mh / 2);
  g.restore();

  // 区域标签（全部常显）+ 质心小圆点
  g.textAlign = 'center';
  g.textBaseline = 'bottom';
  g.font = '15px monospace';
  for (const rg of getRegionGroups(world)) {
    const p = minimapPos(world, rg.tx, rg.ty);
    const x = BIG_CX + (p.x - MAP_CX) * k;
    const y = BIG_CY + (p.y - MAP_CY) * k;
    g.fillStyle = 'rgba(240,234,216,0.85)';
    g.beginPath();
    g.arc(x, y, 3, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.lineWidth = 3;
    g.strokeText(rg.name, x, y - 5);
    g.fillStyle = '#f0ead8';
    g.fillText(rg.name, x, y - 5);
  }

  // 玩家红点
  const dot = minimapPos(world, playerTx, playerTy);
  const dx = BIG_CX + (dot.x - MAP_CX) * k;
  const dy = BIG_CY + (dot.y - MAP_CY) * k;
  g.fillStyle = '#e83a3a';
  g.beginPath();
  g.arc(dx, dy, 7, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(dx, dy, 5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#e83a3a';
  g.beginPath();
  g.arc(dx, dy, 3, 0, Math.PI * 2);
  g.fill();

  // 外圈
  g.strokeStyle = 'rgba(232,232,232,0.85)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(BIG_CX, BIG_CY, BIG_R, 0, Math.PI * 2);
  g.stroke();
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.font = '16px monospace';
  g.fillStyle = '#e8e8e8';
  g.fillText('北', BIG_CX - 8, BIG_CY - BIG_R - 24);

  // 右侧地点详情面板
  const px = 700, pw = 520;
  g.fillStyle = 'rgba(16,20,26,0.85)';
  g.fillRect(px, 110, pw, 500);
  g.strokeStyle = 'rgba(232,232,232,0.35)';
  g.lineWidth = 2;
  g.strokeRect(px + 1, 111, pw - 2, 498);
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.font = '20px monospace';
  g.fillStyle = '#ffd166';
  g.fillText('地点一览', px + 20, 126);

  let y = 164;
  for (const rg of getRegionGroups(world)) {
    g.font = '16px monospace';
    g.fillStyle = '#e8e8e8';
    g.fillText(`● ${rg.name}`, px + 20, y);
    const freqW = g.measureText(rg.freq).width;
    g.fillStyle = rg.freq.startsWith('每天') ? '#7fd18a' : rg.freq.startsWith('每周') ? '#e8c85a' : '#c992e8';
    g.fillText(rg.freq, px + pw - 20 - freqW, y);
    g.font = '13px monospace';
    g.fillStyle = '#8a8f98';
    const list = rg.buildings.slice(0, 5).join('、') + (rg.buildings.length > 5 ? ' 等' : '');
    g.fillText(list || '（自然区域）', px + 36, y + 22);
    y += 54;
  }
}
