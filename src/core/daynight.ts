// 昼夜交替系统：现实时间驱动，白天 15 分钟 → 黑夜 3 分钟，循环不息
// 夜晚不改画面明度，而是把世界像素整体重映射到夜蓝色域
// （在离屏画布烘焙时逐像素做 RGB→HSL→夜调色→RGB，明度 L 原样保留）
// 调试：URL 加 ?dn=900 表示从周期第 900 秒开始；?dn=night 直接进入黑夜
import { MAP_CX, MAP_CY, MAP_R } from '../map/minimap';

export const DAY_MS = 15 * 60 * 1000;
export const NIGHT_MS = 3 * 60 * 1000;
export const CYCLE_MS = DAY_MS + NIGHT_MS;

const dnParam = new URLSearchParams(location.search).get('dn');
let OFFSET = 0;
let FORCE_NIGHT = false;
if (dnParam === 'night') {
  FORCE_NIGHT = true;
} else if (dnParam !== null && !Number.isNaN(+dnParam)) {
  OFFSET = +dnParam * 1000;
}

function cycleT(): number {
  if (FORCE_NIGHT) return DAY_MS + NIGHT_MS / 2; // 固定在午夜中点，便于调试
  return (Date.now() + OFFSET) % CYCLE_MS;
}

export function isNight(): boolean {
  return FORCE_NIGHT || cycleT() >= DAY_MS;
}

// 当前阶段已进行比例 0..1（沙漏漏沙进度）
export function phaseProgress(): number {
  const t = cycleT();
  return t < DAY_MS ? t / DAY_MS : (t - DAY_MS) / NIGHT_MS;
}

// 当前阶段剩余毫秒
export function phaseRemainMs(): number {
  const t = cycleT();
  return t < DAY_MS ? DAY_MS - t : CYCLE_MS - t;
}

// 游戏内 24 小时钟：白天 15 分钟映射 06:00→22:00，夜晚 3 分钟映射 22:00→次日 06:00
// 居民作息、日程表、路人台词都按这个钟走
export function gameHour(): number {
  if (FORCE_NIGHT) return 23;
  const t = cycleT();
  return t < DAY_MS ? 6 + (t / DAY_MS) * 16 : 22 + ((t - DAY_MS) / NIGHT_MS) * 8;
}

// 游戏内第几天（一个昼夜循环 = 1 天），用于到访账与"每天一次"判定
export function gameDayIndex(): number {
  return Math.floor((Date.now() + OFFSET) / CYCLE_MS);
}

/** 绝对游戏小时：严格单调递增，1 个游戏日 = 24 小时；第 D 日 = [D*24+6, D*24+30) */
export function absGameHour(): number {
  return gameDayIndex() * 24 + gameHour();
}

/** 绝对小时 → 它所属的游戏日（日界 06:00） */
export function dayOfAbsHour(abs: number): number {
  return Math.floor((abs - 6) / 24);
}

/** 测试用：把时间钉到「第 day 日的 hour 点」，hour ∈ [0,24)（仅调试钩子调用） */
export function setGameTime(day: number, hour: number): void {
  const h = Math.min(23.999, Math.max(0, hour));
  const t = h >= 6 ? ((h - 6) / 16) * DAY_MS : DAY_MS + ((h + 2) / 8) * NIGHT_MS;
  OFFSET = day * CYCLE_MS + t - Date.now();
}

// 跳过 n 个游戏日：整体平移时间轴（整天数，不改变当天时刻）
// 「跳过今年」= 跳过 AGING_DAYS 天，年龄随 gameDayIndex 自然 +1
export function skipGameDays(n: number): void {
  OFFSET += n * CYCLE_MS;
}

// 跳到明天清晨 06:00（t=0，新一天的开始）：在家休息/住院快进用
export function skipToNextMorning(): void {
  OFFSET += CYCLE_MS - cycleT();
}

// 前进 m 个游戏分钟（的车程用）：整体平移时间轴，不改变流速
export function advanceGameMinutes(m: number): void {
  OFFSET += (m / 1440) * CYCLE_MS;
}

// 存档用：读写时间轴偏移（"现在是人生里的第几天、几点"全靠它）
export function timeOffset(): number {
  return OFFSET;
}
export function setTimeOffset(ms: number): void {
  OFFSET = ms;
}

// ---- 夜晚色彩重映射 ----
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

// 夜调色：所有色相归入蓝紫域，饱和度压低，明度不动
// 近黑（门洞）保持原样；低饱和灰阶（石墙/广场）不着色相，
// 而是染一层月光蓝（提升饱和度转向蓝色），夜晚不再"发白"
function nightHue(h: number, s: number, l: number): [number, number, number] {
  if (l < 0.04) return [h, s, l];
  if (s < 0.08) return l < 0.1 ? [h, s, l] : [222, 0.1 + s * 0.5, l];
  let nh: number;
  if (h < 45) nh = 235 + h * 0.4;               // 红/橙屋顶 → 靛蓝
  else if (h < 75) nh = 215 + (h - 45);         // 黄沙/土路 → 青蓝
  else if (h < 170) nh = 205 + (h - 75) * 0.35; // 草地绿树 → 夜蓝
  else if (h < 260) nh = h - 15;                // 水面青蓝 → 深夜蓝
  else nh = 250 + (h - 260) * 0.2;              // 紫/品红 → 蓝紫
  return [nh, Math.min(s * 0.55, 0.6), l];
}

const nightCache = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

// 白天画布的"夜晚版"：按源画布缓存（WeakMap），只烘焙一次
export function nightCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const hit = nightCache.get(src);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = src.width;
  cv.height = src.height;
  const g = cv.getContext('2d')!;
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
    const [nh, ns, nl] = nightHue(h, s, l);
    if (nh === h && ns === s && nl === l) continue;
    const [r, gg, b] = hslToRgb(nh, ns, nl);
    d[i] = r; d[i + 1] = gg; d[i + 2] = b;
  }
  g.putImageData(img, 0, 0);
  nightCache.set(src, cv);
  return cv;
}

// ---- 沙漏计时器（小地图正下方）：玻璃双腔 + 随时间流动的沙 + 日/月标记 + 剩余时间 ----
const HG_W = 26;
const HG_H = 36;

export function drawDayNightWidget(g: CanvasRenderingContext2D): void {
  const night = isNight();
  const p = phaseProgress();
  const x = MAP_CX;
  const y = MAP_CY + MAP_R + 16;
  const hw = HG_W / 2;
  const neckY = y + HG_H / 2 - 1;

  // 底板
  g.fillStyle = 'rgba(10,12,16,0.55)';
  g.fillRect(x - 40, y - 9, 80, HG_H + 42);
  g.strokeStyle = 'rgba(232,232,232,0.35)';
  g.lineWidth = 1.5;
  g.strokeRect(x - 40, y - 9, 80, HG_H + 42);

  // 顶/底横木
  g.fillStyle = '#8a6f55';
  g.fillRect(x - hw - 3, y - 3, HG_W + 6, 3);
  g.fillRect(x - hw - 3, y + HG_H, HG_W + 6, 3);

  // 玻璃双腔轮廓
  g.beginPath();
  g.moveTo(x - hw, y);
  g.lineTo(x + hw, y);
  g.lineTo(x + 1.5, neckY);
  g.lineTo(x + 1.5, neckY + 2);
  g.lineTo(x + hw, y + HG_H);
  g.lineTo(x - hw, y + HG_H);
  g.lineTo(x - 1.5, neckY + 2);
  g.lineTo(x - 1.5, neckY);
  g.closePath();
  g.fillStyle = 'rgba(180,205,240,0.13)';
  g.fill();
  g.strokeStyle = 'rgba(232,232,232,0.8)';
  g.lineWidth = 2;
  g.stroke();

  const sand = night ? '#a9c2e8' : '#e8c85a';
  const sandDark = night ? '#87a3cf' : '#c9a63e';

  // 上仓余沙：p 越大沙面越低，从颈部向上消退
  const topLevel = y + 3 + p * (neckY - y - 6);
  g.save();
  g.beginPath();
  g.moveTo(x - hw + 2, y + 2);
  g.lineTo(x + hw - 2, y + 2);
  g.lineTo(x + 1, neckY);
  g.lineTo(x - 1, neckY);
  g.closePath();
  g.clip();
  g.fillStyle = sand;
  g.fillRect(x - hw, topLevel, HG_W, neckY - topLevel + 2);
  g.fillStyle = sandDark;
  g.fillRect(x - hw, topLevel, HG_W, 2); // 沙面暗线
  g.restore();

  // 下仓沙堆：随 p 从底部升起
  const pileTop = y + HG_H - 3 - p * (y + HG_H - 6 - (neckY + 3));
  g.save();
  g.beginPath();
  g.moveTo(x - 1, neckY + 2);
  g.lineTo(x + 1, neckY + 2);
  g.lineTo(x + hw - 2, y + HG_H - 2);
  g.lineTo(x - hw + 2, y + HG_H - 2);
  g.closePath();
  g.clip();
  g.fillStyle = sand;
  g.fillRect(x - hw, pileTop, HG_W, y + HG_H - pileTop);
  g.fillStyle = sandDark;
  g.fillRect(x - hw, pileTop, HG_W, 2);
  g.restore();

  // 颈部落沙流
  if (p > 0.02 && p < 0.98) {
    g.fillStyle = sand;
    g.fillRect(x - 1, neckY + 2, 2, Math.max(2, pileTop - neckY - 2));
  }

  // 日/月标记（沙漏右侧）
  const ix = x + hw + 13;
  const iy = y + HG_H / 2;
  if (!night) {
    g.strokeStyle = '#e8c85a';
    g.lineWidth = 1.5;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      g.beginPath();
      g.moveTo(ix + Math.cos(a) * 6, iy + Math.sin(a) * 6);
      g.lineTo(ix + Math.cos(a) * 8.5, iy + Math.sin(a) * 8.5);
      g.stroke();
    }
    g.fillStyle = '#e8c85a';
    g.beginPath();
    g.arc(ix, iy, 4.5, 0, Math.PI * 2);
    g.fill();
  } else {
    // 月牙（外弧 + 内弧）
    g.beginPath();
    g.arc(ix, iy, 6, Math.PI * 0.3, Math.PI * 1.7, false);
    g.arc(ix + 2.5, iy - 1, 5, Math.PI * 1.75, Math.PI * 0.25, true);
    g.closePath();
    g.fillStyle = '#dfe8f8';
    g.fill();
    // 小星
    g.fillStyle = '#8fb0dd';
    g.fillRect(ix + 8, iy - 9, 2, 2);
  }

  // 剩余时间
  const remain = phaseRemainMs();
  const mm = Math.floor(remain / 60000);
  const ss = Math.floor((remain % 60000) / 1000);
  g.font = '11px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'top';
  g.fillStyle = night ? '#a9c2e8' : '#e8c85a';
  g.fillText(`${night ? '黑夜' : '白昼'} ${mm}:${String(ss).padStart(2, '0')}`, x, y + HG_H + 10);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
}
