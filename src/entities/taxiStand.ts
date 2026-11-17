// 出租车站牌：固定在六个地标旁，玩家走近按 E 即可叫车（不必追出租车）
// 纯程序绘制：立柱 + 站牌 + 黄色出租车图标，夜间自动点亮
import { TILE } from '../config';

export interface TaxiStand {
  id: string;
  name: string;   // 所在地标（菜单提示用）
  tx: number;
  ty: number;
}

export const TAXI_STANDS: TaxiStand[] = [
  { id: 'home', name: '家门口', tx: 246, ty: 55 },
  { id: 'school', name: '学校', tx: 91, ty: 38 },
  { id: 'hospital', name: '镇医院', tx: 296, ty: 35 },
  { id: 'mall', name: '百货商场', tx: 213, ty: 88 },
  { id: 'station', name: '火车站', tx: 566, ty: 123 },
  { id: 'park', name: '公园喷泉', tx: 70, ty: 85 },
];

export function nearestStand(px: number, py: number, maxDist = 30): TaxiStand | null {
  let best: TaxiStand | null = null;
  let bd = maxDist;
  for (const s of TAXI_STANDS) {
    const d = Math.hypot(px - (s.tx * TILE + TILE / 2), py - (s.ty * TILE + TILE / 2));
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

/** 站牌绘制：路边立牌 + 顶灯，画在实体层（建筑可遮挡形成纵深） */
export function drawStands(g: CanvasRenderingContext2D, ox: number, oy: number, night: boolean): void {
  for (const s of TAXI_STANDS) {
    const sx = Math.round(s.tx * TILE + ox);
    const sy = Math.round(s.ty * TILE + oy);
    if (sx < -40 || sx > 1320 || sy < -60 || sy > 760) continue;
    const cx = sx + TILE / 2;
    // 立柱
    g.fillStyle = '#5a6068';
    g.fillRect(cx - 1, sy - 6, 3, TILE - 2);
    // 牌面（出租车黄）
    g.fillStyle = '#e8c85a';
    g.fillRect(cx - 8, sy - 16, 17, 11);
    g.strokeStyle = '#6a5a20';
    g.lineWidth = 1;
    g.strokeRect(cx - 7.5, sy - 15.5, 16, 10);
    // 小车图标
    g.fillStyle = '#2a2a2a';
    g.fillRect(cx - 5, sy - 11, 10, 4);
    g.fillRect(cx - 3, sy - 13, 5, 2);
    g.fillStyle = '#e8c85a';
    g.fillRect(cx - 2, sy - 12, 2, 1);
    // 顶灯：夜间点亮
    g.fillStyle = night ? '#ffe9a0' : '#8a8f98';
    g.beginPath();
    g.arc(cx, sy - 19, 2.5, 0, Math.PI * 2);
    g.fill();
    if (night) {
      g.fillStyle = 'rgba(255,233,160,0.15)';
      g.beginPath();
      g.arc(cx, sy - 19, 8, 0, Math.PI * 2);
      g.fill();
    }
  }
}
