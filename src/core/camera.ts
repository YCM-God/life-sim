import { TILE, VIEW_H, VIEW_W } from '../config';

export interface Cam {
  x: number;
  y: number;
}

// 镜头跟随并钳制在世界边界内
// viewW：可视宽度。默认全屏；右侧属性面板常驻时传 PANEL_X（面板区=屏幕外）
export function computeCamera(centerPx: number, centerPy: number, worldW: number, worldH: number, viewW = VIEW_W): Cam {
  const maxX = worldW * TILE - viewW;
  const maxY = worldH * TILE - VIEW_H;
  return {
    x: Math.min(Math.max(Math.round(centerPx - viewW / 2), 0), Math.max(0, maxX)),
    y: Math.min(Math.max(Math.round(centerPy - VIEW_H / 2), 0), Math.max(0, maxY)),
  };
}
