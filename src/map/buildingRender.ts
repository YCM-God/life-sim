import { TILE } from '../config';
import { nightCanvas } from '../core/daynight';
import { hash2 } from './tiles';
import type { Building, World } from './world';

// 模块化建筑渲染（见《建筑与环境美术规范》）：
// - 每栋建筑离屏缓存为一张画布：伪坡面挤出(12px) + 三色阶屋顶 + 立面(墙/门/窗/招牌/雨棚/烟囱/台阶)
// - 玩家进入立面带时整栋淡出到 0.35（方案 A：整体淡出）
// - 全部模块锚定 Tile 网格，门洞与 doorTx 对齐

interface Palette {
  roof: string; roofDark: string; roofLight: string;  // 屋顶三色阶
  wall: string; wallDark: string;                     // 墙身 + 檐影/地脚
  trim: string;                                       // 门窗框
  door: string;                                       // 门面板
  glass: string;                                      // 玻璃
  step: string;                                       // 台阶
  sign?: string;                                      // 招牌底色（店铺）
  awning?: string;                                    // 雨棚条纹色（店铺）
}

// 主色板内的建筑配色：单栋 ≤3 主色（屋面/墙身/点缀）
const PALETTES: Record<string, Palette> = {
  houseA: { roof: '#a5533c', roofDark: '#8f4632', roofLight: '#b96147', wall: '#e3d6bd', wallDark: '#c9b89a', trim: '#8a6f55', door: '#6b4a2b', glass: '#5a7fb8', step: '#9aa0a4' },
  houseB: { roof: '#4a6a7a', roofDark: '#3d5866', roofLight: '#5a7c8c', wall: '#f0ead8', wallDark: '#d5cdb8', trim: '#7a6a55', door: '#5a4632', glass: '#5a7fb8', step: '#9aa0a4' },
  houseC: { roof: '#8d8578', roofDark: '#767065', roofLight: '#9d968a', wall: '#e8c85a', wallDark: '#c9ab4c', trim: '#8a6f55', door: '#6b4a2b', glass: '#5a7fb8', step: '#9aa0a4' },
  houseD: { roof: '#6a7a5a', roofDark: '#57654a', roofLight: '#7a8a6a', wall: '#e8dcd0', wallDark: '#cabcae', trim: '#7a6a55', door: '#5a4632', glass: '#5a7fb8', step: '#9aa0a4' },
  apartment: { roof: '#7a6a75', roofDark: '#645662', roofLight: '#8a7a85', wall: '#d8d0c0', wallDark: '#b8b0a0', trim: '#6a6257', door: '#4a4038', glass: '#5a7fb8', step: '#9aa0a4' },
  shop: { roof: '#4a6a7a', roofDark: '#3d5866', roofLight: '#5a7c8c', wall: '#f0ead8', wallDark: '#d5cdb8', trim: '#7a6a55', door: '#5a4632', glass: '#5a7fb8', step: '#9aa0a4', sign: '#c2576b', awning: '#c2576b' },
  mall: { roof: '#8d8578', roofDark: '#767065', roofLight: '#9d968a', wall: '#e8dcd0', wallDark: '#cabcae', trim: '#7a6a55', door: '#4a5568', glass: '#6f92c8', step: '#9aa0a4', sign: '#3a6ea5', awning: '#3a6ea5' },
  office: { roof: '#5a6470', roofDark: '#4a525c', roofLight: '#6a7480', wall: '#b8c0c8', wallDark: '#9aa2aa', trim: '#5a6470', door: '#3a4450', glass: '#7fd0e8', step: '#9aa0a4', sign: '#2e8b72', awning: '#2e8b72' },
  school: { roof: '#8d8578', roofDark: '#767065', roofLight: '#9d968a', wall: '#b96147', wallDark: '#9d4f39', trim: '#f0ead8', door: '#5a4632', glass: '#5a7fb8', step: '#9aa0a4' },
  tower: { roof: '#6a6257', roofDark: '#575047', roofLight: '#7a7268', wall: '#9aa0a4', wallDark: '#868c90', trim: '#575047', door: '#4a4038', glass: '#e8c85a', step: '#868c90' },
  station: { roof: '#57654a', roofDark: '#47543c', roofLight: '#677552', wall: '#c9b89a', wallDark: '#ab9c80', trim: '#6a6257', door: '#4a4038', glass: '#5a7fb8', step: '#868c90', sign: '#8a4a3c' },
  hospital: { roof: '#d8d0c0', roofDark: '#b8b0a0', roofLight: '#e8e2d4', wall: '#f0ead8', wallDark: '#d5cdb8', trim: '#8a6a55', door: '#5a6a75', glass: '#9fd0e8', step: '#9aa0a4', sign: '#c23a3a', awning: '#c23a3a' },
};

// 民居按 id 哈希在 4 套配色间轮转（相邻防撞色：轮转表近似满足色相间隔）
function paletteFor(b: Building): Palette {
  switch (b.kind) {
    case 'house': {
      const v = (b.id.charCodeAt(0) + (b.id.charCodeAt(1) || 0)) % 4;
      return [PALETTES.houseA, PALETTES.houseB, PALETTES.houseC, PALETTES.houseD][v];
    }
    case 'apartment': return PALETTES.apartment;
    case 'mall': return PALETTES.mall;
    case 'office': return PALETTES.office;
    case 'school': return PALETTES.school;
    case 'hospital': return PALETTES.hospital;
    case 'tower': return PALETTES.tower;
    case 'station': return PALETTES.station;
    default: return PALETTES.shop;
  }
}

// 立面高度：民居/店铺 2 Tile（64px），公共建筑 3 Tile（96px）
const FACADE_TALL = new Set(['school', 'office', 'mall', 'station', 'tower', 'hospital']);
const SLOPE_H = 12; // 北向伪坡面挤出（全局唯一非网格常量）

interface Built {
  cv: HTMLCanvasElement;
  night?: HTMLCanvasElement; // 夜晚变体（首次进入黑夜时烘焙）
  lcv: HTMLCanvasElement;    // 夜景灯光层：亮灯窗户 + 门廊灯（透明底，仅夜晚叠加）
  ax: number; // 画布锚点：世界像素 x（建筑左缘）
  ay: number; // 画布锚点：世界像素 y
}

const cache = new Map<string, Built>();

function build(b: Building): Built {
  const p = paletteFor(b);
  const fw = b.w * TILE;
  const fh = FACADE_TALL.has(b.kind) ? 3 * TILE : 2 * TILE;
  const slope = b.face === 'S';
  const cw = fw;
  const ch = (slope ? SLOPE_H : fh) + b.h * TILE + (slope ? fh : 0);
  const cv = document.createElement('canvas');
  cv.width = cw;
  cv.height = ch;
  const g = cv.getContext('2d')!;
  // 灯光层与主体同尺寸，按需往上面画亮灯
  const lcv = document.createElement('canvas');
  lcv.width = cw;
  lcv.height = ch;
  const lg = lcv.getContext('2d')!;

  const doorCx = (b.doorTx - b.x) * TILE; // 门洞左缘（画布内 x）
  const roofY = slope ? SLOPE_H : fh;
  const facadeY = slope ? SLOPE_H + b.h * TILE : 0;

  // ---- 伪坡面（仅南立面建筑）：北向挤出 12px 亮带 + 斜边暗示 ----
  if (slope) {
    g.fillStyle = p.roofLight;
    g.fillRect(0, 0, fw, 4);
    g.fillStyle = p.roof;
    g.fillRect(0, 4, fw, SLOPE_H - 4);
    g.fillStyle = p.roofDark;
    for (let x = 0; x < fw; x += 16) g.fillRect(x, 0, 2, SLOPE_H); // 檩条暗线
    g.fillRect(0, SLOPE_H - 2, fw, 2);
  }

  // ---- 屋顶：错位瓦片 + 脊线高光 + 檐口压边 ----
  g.fillStyle = p.roof;
  g.fillRect(0, roofY, fw, b.h * TILE);
  for (let row = 0, y = roofY + 8; y < roofY + b.h * TILE; row++, y += 8) {
    g.fillStyle = p.roofDark;
    g.fillRect(0, y - 1, fw, 1); // 瓦行暗缝
    const off = (row & 1) * 8; // 每行错开，避免通天直线
    for (let x = off; x < fw; x += 16) g.fillRect(x, y - 5, 1, 4); // 竖向瓦缝
    if (row % 2 === 0) {
      g.fillStyle = p.roofLight;
      for (let x = off; x < fw; x += 16) g.fillRect(x + 1, y - 7, 14, 1); // 瓦面反光
    }
  }
  g.fillStyle = p.roofLight;
  g.fillRect(0, roofY, fw, 3); // 脊线
  g.fillStyle = p.roofDark;
  g.fillRect(0, roofY + 3, fw, 1);
  g.fillRect(0, roofY + b.h * TILE - 4, fw, 4); // 檐口压边
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(0, roofY + b.h * TILE - 1, fw, 1);

  // 烟囱（仅民居，屋顶北 1/3）
  if (b.kind === 'house') {
    const cx = fw - 28;
    g.fillStyle = '#8f4632';
    g.fillRect(cx, roofY + 6, 16, 20);
    g.fillStyle = '#a5533c';
    g.fillRect(cx, roofY + 6, 16, 3);
    g.fillStyle = '#575047';
    g.fillRect(cx - 2, roofY + 2, 20, 5); // 顶帽
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(cx + 14, roofY + 6, 2, 20); // 侧影
  }
  // 钟楼尖顶
  if (b.kind === 'tower') {
    g.fillStyle = p.wallDark;
    g.beginPath();
    g.moveTo(fw / 2 - 16, roofY);
    g.lineTo(fw / 2 + 16, roofY);
    g.lineTo(fw / 2, roofY - 20);
    g.closePath();
    g.fill();
  }
  // 医院：屋顶红十字（ Town 医院标识，无资产程序绘制）
  if (b.kind === 'hospital') {
    const cx = fw / 2;
    const cy = roofY + (b.h * TILE) / 2;
    const s = 10;
    g.fillStyle = '#c23a3a';
    g.fillRect(cx - s / 2, cy - s * 1.5, s, s * 3);
    g.fillRect(cx - s * 1.5, cy - s / 2, s * 3, s);
  }

  // ---- 立面：檐影渐层 + 墙身 + 石砌基座 ----
  g.fillStyle = p.wall;
  g.fillRect(0, facadeY, fw, fh);
  g.fillStyle = p.wallDark;
  g.fillRect(0, facadeY, fw, 6); // 檐影
  g.fillStyle = 'rgba(0,0,0,0.10)';
  g.fillRect(0, facadeY + 6, fw, 2); // 檐影淡出
  if (fh > 64) {
    g.fillStyle = p.wallDark;
    g.fillRect(0, facadeY + 32, fw, 2); // 楼层线
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(0, facadeY + 34, fw, 1);
  }
  // 基座：石砌 + 错缝
  g.fillStyle = p.wallDark;
  g.fillRect(0, facadeY + fh - 6, fw, 6);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, facadeY + fh - 1, fw, 1);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let x = ((b.x * 7) % 12); x < fw; x += 12) g.fillRect(x, facadeY + fh - 6, 1, 5);

  // ---- 窗：窗框 + 窗台 + 玻璃反光；高楼双层 ----
  const doorCol = b.doorTx - b.x;
  const winCols: number[] = [];
  for (const c of [doorCol - 2, doorCol + 2]) {
    if (c >= 0 && c < b.w && c !== doorCol - 1 && c !== doorCol + 1) winCols.push(c);
  }
  if (b.w >= 14) { // 宽建筑补一列，保持间距 ≥1 Tile
    for (const c of [doorCol - 4, doorCol + 4]) if (c >= 0 && c < b.w) winCols.push(c);
  }
  const winRows = fh > 64 ? [facadeY + 18, facadeY + 52] : [facadeY + 18];
  for (const c of winCols) {
    for (const wy of winRows) {
      if (wy + 30 > facadeY + fh - 6) continue;
      const wx = c * TILE + 4;
      // 窗框
      g.fillStyle = p.trim;
      g.fillRect(wx, wy, 24, 28);
      // 玻璃
      g.fillStyle = p.glass;
      g.fillRect(wx + 2, wy + 2, 20, 24);
      // 玻璃反光（左上斜角）
      g.fillStyle = 'rgba(255,255,255,0.30)';
      g.fillRect(wx + 4, wy + 4, 6, 2);
      g.fillRect(wx + 4, wy + 6, 2, 6);
      // 窗棂
      g.fillStyle = p.trim;
      g.fillRect(wx + 11, wy + 2, 2, 24);
      g.fillRect(wx + 2, wy + 13, 20, 2);
      // 窗台
      g.fillStyle = p.wallDark;
      g.fillRect(wx - 1, wy + 28, 26, 2);
      // 夜景：约半数窗户亮灯（暖黄为主，少量冷白），带方形光晕
      const seed = b.id.charCodeAt(0) * 7 + (b.id.charCodeAt(1) || 0) * 13 + c * 31 + (wy | 0);
      if (hash2(seed, b.id.length * 17 + 5) < 0.5) {
        const warm = hash2(seed + 3, 11) < 0.8;
        const halo = warm ? 'rgba(255,205,130,0.20)' : 'rgba(180,210,255,0.18)';
        const core = warm ? '#ffd98a' : '#cfe4ff';
        const bar = warm ? 'rgba(96,70,42,0.8)' : 'rgba(60,72,96,0.8)';
        lg.fillStyle = halo;
        lg.fillRect(wx, wy - 2, 28, 32);
        lg.fillStyle = core;
        lg.fillRect(wx + 2, wy + 2, 20, 24);
        lg.fillStyle = bar;
        lg.fillRect(wx + 11, wy + 2, 2, 24);
        lg.fillRect(wx + 2, wy + 13, 20, 2);
      }
    }
  }
  g.fillStyle = p.wall; // 复位

  // ---- 门：门套 + 门板四分格 + 门头压边 + 两级台阶 ----
  const doorTop = facadeY + fh - 42;
  g.fillStyle = p.wallDark;
  g.fillRect(doorCx - 3, doorTop - 6, TILE + 6, 48); // 门套
  g.fillStyle = p.door;
  g.fillRect(doorCx, doorTop, TILE, 42);
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(doorCx, doorTop, TILE, 3); // 门楣暗边
  g.fillRect(doorCx + 8, doorTop + 8, 1, 12); // 门板分格
  g.fillRect(doorCx + 22, doorTop + 8, 1, 12);
  g.fillRect(doorCx + 8, doorTop + 24, 1, 12);
  g.fillRect(doorCx + 22, doorTop + 24, 1, 12);
  g.fillStyle = '#e0c060';
  g.fillRect(doorCx + 24, doorTop + 20, 3, 3); // 把手
  g.fillStyle = p.trim;
  g.fillRect(doorCx - 3, doorTop - 6, TILE + 6, 4); // 门头压边
  g.fillStyle = p.step;
  g.fillRect(doorCx - 2, facadeY + fh - 8, TILE + 4, 8); // 台阶
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.fillRect(doorCx - 2, facadeY + fh - 8, TILE + 4, 1); // 台阶受光
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(doorCx - 2, facadeY + fh - 4, TILE + 4, 1); // 台阶阴影

  // ---- 学校：门楣横匾 ----
  if (b.kind === 'school') {
    g.fillStyle = p.trim;
    g.fillRect(doorCx - 18, doorTop - 16, TILE + 36, 10);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(doorCx - 18, doorTop - 8, TILE + 36, 2);
    g.fillStyle = p.wallDark;
    g.fillRect(doorCx - 12, doorTop - 6, TILE + 24, 2);
  }

  // ---- 店铺模块：招牌（门上方）+ 雨棚（条扇 + 扇形下摆）----
  if (p.sign && p.awning) {
    const signW = 64;
    const sx = Math.max(0, Math.min(fw - signW, doorCx + 16 - signW / 2));
    g.fillStyle = p.sign;
    g.fillRect(sx, facadeY + 8, signW, 14);
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(sx, facadeY + 8, signW, 2); // 招牌顶光
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.font = '10px monospace';
    g.textBaseline = 'middle';
    const label = b.name.slice(0, 4);
    g.fillText(label, sx + (signW - g.measureText(label).width) / 2, facadeY + 16);
    // 雨棚条纹
    const awX = Math.max(0, Math.min(fw - 48, doorCx + 16 - 24));
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 ? '#f0ead8' : p.awning;
      g.fillRect(awX + i * 8, doorTop - 16, 8, 12);
    }
    // 扇形下摆
    g.fillStyle = p.awning;
    for (let i = 0; i < 6; i++) {
      g.fillRect(awX + i * 8 + 1, doorTop - 4, 6, 2);
      g.fillRect(awX + i * 8 + 2, doorTop - 2, 4, 1);
    }
    // 雨棚投影
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(awX, doorTop - 1, 48, 2);
  }

  // ---- 底部投影（落在立面带外缘地面）----
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, ch - 4, fw, 4);

  // ---- 夜景门廊灯（门头上方小暖光）----
  lg.fillStyle = 'rgba(255,215,150,0.22)';
  lg.fillRect(doorCx + 4, doorTop - 14, 24, 14);
  lg.fillStyle = '#ffe9b0';
  lg.fillRect(doorCx + 13, doorTop - 10, 6, 5);

  return { cv, lcv, ax: b.x * TILE, ay: b.y * TILE - (slope ? SLOPE_H : fh) };
}

function builtFor(b: Building): Built {
  let hit = cache.get(b.id);
  if (!hit) {
    hit = build(b);
    cache.set(b.id, hit);
  }
  return hit;
}

// 玩家是否在某栋建筑的立面带内（触发淡出）
function inFacadeBand(b: Building, tx: number, ty: number): boolean {
  if (tx < b.x || tx >= b.x + b.w) return false;
  return b.face === 'S' ? ty >= b.y + b.h && ty <= b.y + b.h + 1 : ty >= b.y - 2 && ty <= b.y - 1;
}

export function invalidateBuildings(): void {
  cache.clear();
}

// 玩家之后绘制（常规遮挡）；玩家在立面带内时整栋淡出至 0.35
export function renderBuildings(
  g: CanvasRenderingContext2D,
  world: World,
  camX: number,
  camY: number,
  playerTx: number,
  playerTy: number,
  night = false,
): void {
  for (const b of world.buildings) {
    const built = builtFor(b);
    const px = built.ax - camX;
    const py = built.ay - camY;
    if (px + built.cv.width < 0 || py + built.cv.height < 0 || px > 1280 || py > 720) continue;
    g.globalAlpha = inFacadeBand(b, playerTx, playerTy) ? 0.35 : 1;
    const img = night ? built.night ?? (built.night = nightCanvas(built.cv)) : built.cv;
    g.drawImage(img, Math.round(px), Math.round(py));
    if (night) g.drawImage(built.lcv, Math.round(px), Math.round(py)); // 亮灯窗户 / 门廊灯
  }
  g.globalAlpha = 1;
}
