// 右侧角色属性面板 —— 《右侧角色属性面板规格》v1.0 的实现
// 基准规格 640x360（96x360 面板 @ x544），本工程 1280x720：所有坐标 ×2
// 面板 192x720 @ x1088；折叠 64px 竖条；8px 栅格（基准 4px）
import { VIEW_H, VIEW_W } from '../config';
import { drawCharacter } from '../entities/player';
import type { Player } from '../entities/player';
import { talentTier } from '../data/character';
import type { Hud } from './hud';
import type { PointerClick } from '../core/input';

export const PANEL_X = 1088; // 可玩区右缘：世界只渲染到 0..1087
export const PANEL_W = 192;
const FOLD_W = 64;
const EXPAND_MS = 280;   // 规格 §3：展开 280ms
const COLLAPSE_MS = 240; // 规格 §3：收起 240ms
const DANGER = 20;       // 危险阈值（≤20 红闪）

// ---- 六属性（规格命名，2 字；顺序按玩法频率）----
type PatternKind = 'diag' | 'grid' | 'dots' | 'hline' | 'cross' | 'wave';

export interface AttrDef {
  name: string;
  color: string;
  pattern: PatternKind;
  /** 可消耗属性才有「危险」概念（低学识/低智力只是低，不闪红） */
  danger: boolean;
  v: (p: Player) => number;
}

export const ATTRS: AttrDef[] = [
  { name: '体力', color: '#e8a23c', pattern: 'diag',  danger: true,  v: (p) => p.stamina },
  { name: '智力', color: '#7fb8e8', pattern: 'grid',  danger: false, v: (p) => (p.stats?.int ?? 0) * 10 },
  { name: '魅力', color: '#e87fb0', pattern: 'dots',  danger: false, v: (p) => (p.stats?.look ?? 0) * 10 },
  { name: '学识', color: '#8fd18a', pattern: 'hline', danger: false, v: (p) => p.knowledge },
  { name: '健康', color: '#e86a6a', pattern: 'cross', danger: true,  v: (p) => Math.min(p.stats?.health ?? 0, p.health?.healthCap ?? 10) * 10 },
  { name: '心情', color: '#f0d060', pattern: 'wave',  danger: true,  v: (p) => (p.stats?.mind ?? 0) * 10 },
];

// ---- 状态图标（规格 §7：形状区分 + 文字标签，色盲友好）----
type StatusKind = '疲劳' | '生病' | '开心' | '低落';

function statuses(p: Player): { kind: StatusKind; on: boolean }[] {
  return [
    { kind: '疲劳', on: p.stamina <= DANGER },
    { kind: '生病', on: (p.health?.symptomatic() ?? false) || (p.stats?.health ?? 9) <= 2 },
    { kind: '开心', on: (p.stats?.mind ?? 9) >= 8 },
    { kind: '低落', on: (p.stats?.mind ?? 9) <= 2 },
  ];
}

const STATUS_COLOR: Record<StatusKind, string> = {
  疲劳: '#d8c85a',
  生病: '#e86a6a',
  开心: '#f0d060',
  低落: '#7fb8e8',
};

function drawStatusShape(g: CanvasRenderingContext2D, kind: StatusKind, x: number, y: number, s: number): void {
  g.fillStyle = STATUS_COLOR[kind];
  g.strokeStyle = STATUS_COLOR[kind];
  if (kind === '生病') {
    // 十字
    g.fillRect(x + (s * 3) / 8, y + s / 8, s / 4, (s * 3) / 4);
    g.fillRect(x + s / 8, y + (s * 3) / 8, (s * 3) / 4, s / 4);
  } else if (kind === '疲劳') {
    // 弯月（外弧 + 内弧）
    g.beginPath();
    g.arc(x + s / 2, y + s / 2, s * 0.38, Math.PI * 0.3, Math.PI * 1.7, false);
    g.arc(x + s / 2 + s * 0.14, y + s / 2 - s * 0.06, s * 0.3, Math.PI * 1.75, Math.PI * 0.25, true);
    g.closePath();
    g.fill();
  } else if (kind === '开心') {
    // 圆脸 + 笑
    g.beginPath();
    g.arc(x + s / 2, y + s / 2, s * 0.36, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#22252c';
    const e = Math.max(2, s / 8);
    g.fillRect(x + s * 0.34, y + s * 0.38, e, e);
    g.fillRect(x + s * 0.6, y + s * 0.38, e, e);
    g.lineWidth = Math.max(1.5, s / 10);
    g.beginPath();
    g.arc(x + s / 2, y + s * 0.48, s * 0.18, Math.PI * 0.15, Math.PI * 0.85, false);
    g.stroke();
  } else {
    // 低落：倒三角 + 眼
    g.beginPath();
    g.moveTo(x + s / 2, y + s * 0.82);
    g.lineTo(x + s * 0.14, y + s * 0.2);
    g.lineTo(x + s * 0.86, y + s * 0.2);
    g.closePath();
    g.fill();
    g.fillStyle = '#22252c';
    const e = Math.max(2, s / 8);
    g.fillRect(x + s * 0.36, y + s * 0.34, e, e);
    g.fillRect(x + s * 0.56, y + s * 0.34, e, e);
  }
}

// ---- 属性图标（32×32 像素画）----
export function drawAttrIcon(g: CanvasRenderingContext2D, name: string, x: number, y: number): void {
  const s = 32;
  if (name === '体力') {
    // 闪电
    g.fillStyle = '#e8a23c';
    g.beginPath();
    g.moveTo(x + s * 0.58, y);
    g.lineTo(x + s * 0.22, y + s * 0.56);
    g.lineTo(x + s * 0.46, y + s * 0.56);
    g.lineTo(x + s * 0.4, y + s);
    g.lineTo(x + s * 0.78, y + s * 0.4);
    g.lineTo(x + s * 0.54, y + s * 0.4);
    g.closePath();
    g.fill();
  } else if (name === '智力') {
    // 灯泡
    g.fillStyle = '#7fb8e8';
    g.beginPath();
    g.arc(x + s / 2, y + s * 0.4, s * 0.28, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#d8ecf8';
    g.fillRect(x + s * 0.4, y + s * 0.62, s * 0.2, s * 0.1);
    g.fillStyle = '#7fb8e8';
    g.fillRect(x + s * 0.42, y + s * 0.74, s * 0.16, s * 0.08);
    g.fillRect(x + s * 0.44, y + s * 0.86, s * 0.12, s * 0.08);
  } else if (name === '魅力') {
    // 四角星
    g.fillStyle = '#e87fb0';
    g.beginPath();
    g.moveTo(x + s / 2, y);
    g.lineTo(x + s * 0.6, y + s * 0.4);
    g.lineTo(x + s, y + s / 2);
    g.lineTo(x + s * 0.6, y + s * 0.6);
    g.lineTo(x + s / 2, y + s);
    g.lineTo(x + s * 0.4, y + s * 0.6);
    g.lineTo(x, y + s / 2);
    g.lineTo(x + s * 0.4, y + s * 0.4);
    g.closePath();
    g.fill();
  } else if (name === '学识') {
    // 书
    g.fillStyle = '#8fd18a';
    g.fillRect(x + s * 0.1, y + s * 0.14, s * 0.36, s * 0.72);
    g.fillRect(x + s * 0.54, y + s * 0.14, s * 0.36, s * 0.72);
    g.fillStyle = '#e8f4e4';
    g.fillRect(x + s * 0.16, y + s * 0.22, s * 0.24, s * 0.56);
    g.fillRect(x + s * 0.6, y + s * 0.22, s * 0.24, s * 0.56);
    g.fillStyle = '#5a8f56';
    g.fillRect(x + s * 0.47, y + s * 0.14, s * 0.06, s * 0.72);
  } else if (name === '健康') {
    // 心
    g.fillStyle = '#e86a6a';
    g.beginPath();
    g.arc(x + s * 0.36, y + s * 0.4, s * 0.2, 0, Math.PI * 2);
    g.arc(x + s * 0.64, y + s * 0.4, s * 0.2, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(x + s * 0.15, y + s * 0.48);
    g.lineTo(x + s * 0.85, y + s * 0.48);
    g.lineTo(x + s / 2, y + s * 0.9);
    g.closePath();
    g.fill();
  } else {
    // 心情：笑脸
    drawStatusShape(g, '开心', x, y, s);
  }
}

// ---- 色盲模式：图案填充（规格 §7，六条用图案而非颜色区分）----
const patternCache = new Map<string, CanvasPattern | null>();

function patternFor(g: CanvasRenderingContext2D, color: string, kind: PatternKind): CanvasPattern | null {
  const id = `${color}|${kind}`;
  if (patternCache.has(id)) return patternCache.get(id)!;
  const cv = document.createElement('canvas');
  cv.width = 16;
  cv.height = 16;
  const p = cv.getContext('2d')!;
  p.strokeStyle = 'rgba(255,255,255,0.9)';
  p.fillStyle = 'rgba(255,255,255,0.9)';
  p.lineWidth = 2;
  if (kind === 'diag') {
    for (const o of [-16, 0, 16]) {
      p.beginPath();
      p.moveTo(o, 16);
      p.lineTo(o + 16, 0);
      p.stroke();
    }
  } else if (kind === 'grid') {
    p.strokeRect(1, 1, 14, 14);
    p.beginPath();
    p.moveTo(8, 0);
    p.lineTo(8, 16);
    p.moveTo(0, 8);
    p.lineTo(16, 8);
    p.stroke();
  } else if (kind === 'dots') {
    for (const dx of [4, 12]) for (const dy of [4, 12]) p.fillRect(dx - 1.5, dy - 1.5, 3, 3);
  } else if (kind === 'hline') {
    for (const dy of [3, 8, 13]) {
      p.beginPath();
      p.moveTo(0, dy);
      p.lineTo(16, dy);
      p.stroke();
    }
  } else if (kind === 'cross') {
    p.beginPath();
    p.moveTo(8, 0);
    p.lineTo(8, 16);
    p.moveTo(0, 8);
    p.lineTo(16, 8);
    p.stroke();
  } else {
    // wave
    p.beginPath();
    for (let x = 0; x <= 16; x += 2) {
      const y = 8 + Math.sin((x / 16) * Math.PI * 2) * 4;
      if (x === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    p.stroke();
  }
  const pat = g.createPattern(cv, 'repeat');
  patternCache.set(id, pat);
  return pat;
}

// ---- 生日琶音（WebAudio 8-bit）----
let audio: AudioContext | null = null;

function chime(): void {
  try {
    audio ??= new AudioContext();
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = audio!.createOscillator();
      const gn = audio!.createGain();
      o.type = 'square';
      o.frequency.value = f;
      const t0 = audio!.currentTime + i * 0.14;
      gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.exponentialRampToValueAtTime(0.08, t0 + 0.02);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      o.connect(gn).connect(audio!.destination);
      o.start(t0);
      o.stop(t0 + 0.32);
    });
  } catch {
    // 无音频环境，静默
  }
}

// ---- 属性行（面板 160 宽 / 属性页 560 宽共用）----
function drawBar(
  g: CanvasRenderingContext2D,
  def: AttrDef,
  x: number,
  y: number,
  w: number,
  v: number,
  colorblind: boolean,
  t: number,
): void {
  g.fillStyle = '#2a2e36';
  g.fillRect(x, y, w, 16);
  const n = Math.max(0, Math.min(10, Math.round(v / 10)));
  const cell = w / 10;
  const danger = def.danger && v <= DANGER && v > 0;
  const flash = danger ? 0.55 + 0.45 * Math.sin(t * 10) : 1;
  for (let i = 0; i < n; i++) {
    g.globalAlpha = flash;
    g.fillStyle = danger ? '#e83a3a' : def.color;
    g.fillRect(x + i * cell + 1, y + 1, cell - 2, 14);
    if (colorblind && !danger) {
      const pat = patternFor(g, def.color, def.pattern);
      if (pat) {
        g.fillStyle = pat;
        g.fillRect(x + i * cell + 1, y + 1, cell - 2, 14);
      }
    }
  }
  g.globalAlpha = 1;
  if (v >= 100) {
    // 上限：金描边 + MAX 角标（位于数值与进度条之间，避免叠字）
    g.strokeStyle = '#ffd166';
    g.lineWidth = 2;
    g.strokeRect(x - 1, y - 1, w + 2, 18);
    g.font = '12px monospace';
    g.textAlign = 'right';
    g.fillStyle = '#ffd166';
    g.fillText('MAX', x + w - 2, y + 25);
    g.textAlign = 'left';
  }
}

function drawRow(
  g: CanvasRenderingContext2D,
  def: AttrDef,
  x: number,
  y: number,
  w: number,
  p: Player,
  colorblind: boolean,
  t: number,
  wide: boolean,
): void {
  const v = Math.floor(def.v(p));
  drawAttrIcon(g, def.name, x, y);
  g.font = wide ? '24px monospace' : '24px monospace';
  g.textBaseline = 'top';
  g.fillStyle = '#c8cdd5';
  g.fillText(def.name, x + 40, y + 4);
  const barX = wide ? x + 124 : x;
  const barW = wide ? w - 236 : w;
  const barY = wide ? y + 8 : y + 40;
  drawBar(g, def, barX, barY, barW, v, colorblind, t);
  g.font = wide ? '20px monospace' : '16px monospace';
  g.textAlign = 'right';
  g.fillStyle = v >= 100 ? '#ffd166' : def.danger && v <= DANGER && v > 0 ? '#e83a3a' : '#e8e8e8';
  g.fillText(`${v}`, x + w, wide ? y + 4 : y + 8);
  g.textAlign = 'left';
}

interface Bubble {
  attr: string;
  delta: number;
  t: number;
}

// ---- 完整属性页（Y / 点头像 打开）----
const PAGE = { x: 320, y: 48, w: 640, h: 624 };
const PAGE_CLOSE = { x: 896, y: 64, w: 32, h: 32 };

function drawStatsPage(g: CanvasRenderingContext2D, p: Player, panel: AttrPanel): void {
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillRect(0, 0, VIEW_W, VIEW_H);
  g.fillStyle = 'rgba(14,16,22,0.95)';
  g.fillRect(PAGE.x, PAGE.y, PAGE.w, PAGE.h);
  g.strokeStyle = '#3a3f4a';
  g.lineWidth = 2;
  g.strokeRect(PAGE.x + 1, PAGE.y + 1, PAGE.w - 2, PAGE.h - 2);

  g.textBaseline = 'top';
  // 关闭钮
  g.fillStyle = '#2a2e36';
  g.fillRect(PAGE_CLOSE.x, PAGE_CLOSE.y, PAGE_CLOSE.w, PAGE_CLOSE.h);
  g.strokeStyle = '#3a3f4a';
  g.strokeRect(PAGE_CLOSE.x + 1, PAGE_CLOSE.y + 1, PAGE_CLOSE.w - 2, PAGE_CLOSE.h - 2);
  g.font = '18px monospace';
  g.textAlign = 'center';
  g.fillStyle = '#c8cdd5';
  g.fillText('✕', PAGE_CLOSE.x + 16, PAGE_CLOSE.y + 6);
  g.textAlign = 'left';

  // 左：大头像
  g.save();
  g.beginPath();
  g.rect(368, 124, 120, 140);
  g.clip();
  g.translate(368, 124 + 140 - 28 * 5);
  g.scale(5, 5);
  drawCharacter(g, 0, 0, 'down', 0, p.appearance, false);
  g.restore();
  g.strokeStyle = '#3a3f4a';
  g.strokeRect(368, 124, 120, 140);

  // 右：姓名 / 年龄 / 年级 / 金钱
  g.font = '32px monospace';
  g.fillStyle = '#e8e8e8';
  g.fillText(p.name, 520, 116);
  g.font = '22px monospace';
  g.fillStyle = '#c8cdd5';
  g.fillText(p.inSchool ? `${p.age} 岁 · ${p.stage} · ${p.grade}` : `${p.age} 岁 · ${p.stage}`, 520, 162);
  g.fillStyle = '#e8c85a';
  g.fillText(`金钱  ${p.money}`, 520, 198);
  g.font = '16px monospace';
  g.fillStyle = '#8a8f98';
  g.fillText('体力随移动消耗、学识随时间增长；每 1 个游戏日长 1 岁（约 18 分钟）。', 520, 240);
  // 疾病与就医系统：当前病程一目了然（属性页 6 条之前）
  const d = p.health?.disease;
  g.font = '17px monospace';
  if (d) {
    const a = p.health!.active;
    g.fillStyle = '#e86a6a';
    const state = a!.treated
      ? (a!.wrongMeds ? '已开药但不见好——疑似误诊，快去复诊' : '遵医嘱服药中，按时吃药就会好')
      : '还没去看医生——硬扛有恶化风险';
    g.fillText(`⚕ ${d.name}：${d.desc}（${state}）`, 368, 292);
  } else if (p.health && p.health.recoverLeft > 0) {
    g.fillStyle = '#e8a23c';
    g.fillText(`⚕ 大病初愈，静养中（还剩 ${p.health.recoverLeft} 天，别干重活）`, 368, 292);
  } else if (p.health) {
    g.fillStyle = '#7fd18a';
    g.fillText('⚕ 身体健康。淋雨、熬夜、乱吃东西都会让人生病。', 368, 292);
  }

  // 天赋
  if (p.stats) {
    const rows: [string, number][] = [
      ['智力', p.stats.int],
      ['颜值', p.stats.look],
      ['家境', p.stats.family],
    ];
    g.font = '20px monospace';
    rows.forEach(([label, val], i) => {
      g.fillStyle = '#c8cdd5';
      g.fillText(`${label}  ${val}`, 368, 316 + i * 30);
      g.fillStyle = '#8a8f98';
      g.fillText(`（${talentTier(val)}）`, 368 + 130, 316 + i * 30);
    });
  }

  // 六属性条
  ATTRS.forEach((def, i) => {
    drawRow(g, def, 368, 424 + i * 34, 560, p, panel.isColorblind(), panel.time, true);
  });

  g.font = '16px monospace';
  g.fillStyle = '#6a7078';
  g.textAlign = 'center';
  g.fillText('Y / Esc / ✕ 关闭', PAGE.x + PAGE.w / 2, PAGE.y + PAGE.h - 32);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
}

// ---- 面板本体 ----
export class AttrPanel {
  private folded = false;
  private widthNow = PANEL_W;
  private animT = -1; // ≥0 表示动画中
  private animFrom = PANEL_W;
  private animTo = PANEL_W;
  private forceFold = false;
  pageOpen = false;
  private prev: Record<string, number> = {};
  private bubbles: Bubble[] = [];
  private prevAge = -1;
  private ritualT = 0; // 生日仪式感剩余秒
  private edgePulseT = 0; // 属性归零：面板左缘红脉冲
  time = 0; // 动画时钟（危险闪烁用）
  private readonly colorblind = new URLSearchParams(location.search).has('cb');

  constructor() {
    // 调试：?fold 初始折叠、?page 直接打开属性页（无头截图/验证用）
    const q = new URLSearchParams(location.search);
    if (q.has('fold')) {
      this.folded = true;
      this.widthNow = FOLD_W;
    }
    if (q.has('page')) {
      this.pageOpen = true;
      this.folded = true;
      this.widthNow = FOLD_W;
    }
  }

  isColorblind(): boolean {
    return this.colorblind;
  }

  setFold(f: boolean): void {
    const target = f ? FOLD_W : PANEL_W;
    if (target === this.widthNow && this.animT < 0) return;
    if (target === this.animTo && this.animT >= 0) return;
    this.folded = f;
    this.animFrom = this.widthNow;
    this.animTo = target;
    this.animT = 0;
  }

  toggleFold(): void {
    if (this.pageOpen) {
      this.closePage();
      return;
    }
    this.setFold(!this.folded);
  }

  /** 自动折叠（对话 / 大地图 / 属性页打开时）；解除后保持折叠，等玩家手动展开 */
  setForceFold(f: boolean): void {
    if (f && (!this.folded || this.widthNow > FOLD_W)) this.setFold(true);
    this.forceFold = f;
  }

  togglePage(): void {
    this.pageOpen = !this.pageOpen;
    if (this.pageOpen) this.setFold(true);
  }

  /** 外部（如年度结算）已代为庆祝过生日时，同步年龄基准，避免重复仪式 */
  noteAge(age: number): void {
    this.prevAge = age;
  }

  closePage(): void {
    this.pageOpen = false;
  }

  handleClick(c: PointerClick): boolean {
    if (this.pageOpen) {
      if (c.x >= PAGE_CLOSE.x && c.x <= PAGE_CLOSE.x + PAGE_CLOSE.w && c.y >= PAGE_CLOSE.y && c.y <= PAGE_CLOSE.y + PAGE_CLOSE.h) {
        this.closePage();
      }
      return true; // 属性页打开时吞掉整屏点击
    }
    const x0 = VIEW_W - this.widthNow;
    if (c.x < x0) return false;
    const full = this.widthNow >= PANEL_W - 8;
    if (full) {
      // 折叠钮（1240,16,32,32）；点头像开属性页
      if (c.x >= 1240 && c.x <= 1272 && c.y >= 16 && c.y <= 48) this.setFold(true);
      else if (c.x >= 1134 && c.x <= 1234 && c.y >= 14 && c.y <= 114) this.togglePage();
    } else if (this.widthNow <= FOLD_W + 8) {
      if (c.y >= 180 && c.y <= 210) this.setFold(false); // » 展开钮
      else if (c.y >= 8 && c.y <= 72) this.togglePage(); // mini 头像
    }
    return true;
  }

  update(dt: number, p: Player, hud: Hud): void {
    this.time += dt;

    // 折叠动画：逐帧硬切 8px（规格 4px ×2），展开末段回弹
    if (this.animT >= 0) {
      const dur = this.animTo > this.animFrom ? EXPAND_MS : COLLAPSE_MS;
      this.animT += (dt * 1000) / dur;
      if (this.animT >= 1) {
        this.widthNow = this.animTo;
        this.animT = -1;
      } else {
        const lin = this.animFrom + (this.animTo - this.animFrom) * this.animT;
        let wq = Math.round(lin / 8) * 8;
        if (this.animTo === PANEL_W && this.animT > 0.85) {
          wq -= Math.floor(this.animT * 40) % 2 === 0 ? 8 : 0;
        }
        this.widthNow = Math.max(FOLD_W, Math.min(PANEL_W, wq));
      }
    }

    // 属性差值 → 浮动气泡（体力连续变化不刷；学识每满 10 才报）
    for (const def of ATTRS) {
      const cur = Math.floor(def.v(p));
      const prev = this.prev[def.name];
      if (prev !== undefined && prev !== cur) {
        if (def.name !== '体力' && (def.name !== '学识' || Math.floor(cur / 10) !== Math.floor(prev / 10))) {
          this.bubbles.push({ attr: def.name, delta: cur - prev, t: 0.9 });
        }
        if (def.name === '体力' && prev > 0 && cur === 0) this.edgePulseT = 1.4;
      }
      this.prev[def.name] = cur;
    }
    // 金钱气泡
    const money = p.money;
    if (this.prev['金钱'] !== undefined && this.prev['金钱'] !== money) {
      this.bubbles.push({ attr: '金钱', delta: money - this.prev['金钱'], t: 0.9 });
    }
    this.prev['金钱'] = money;
    this.bubbles = this.bubbles.filter((b) => (b.t -= dt) > 0);
    if (this.edgePulseT > 0) this.edgePulseT -= dt;
    if (this.ritualT > 0) this.ritualT -= dt;

    // 年龄增长：四层仪式感（弹开 + 金光 + 数字放大 + 琶音）
    const age = p.age;
    if (this.prevAge === -1) this.prevAge = age;
    else if (age > this.prevAge) {
      this.prevAge = age;
      this.ritualT = 1.6;
      this.setFold(false);
      hud.toast(`🎂 你长大了一岁！现在 ${age} 岁 · ${p.stage}${p.inSchool ? `（${p.grade}）` : ''}`);
      chime();
    }
  }

  render(g: CanvasRenderingContext2D, p: Player): void {
    const w = this.widthNow;
    const x0 = VIEW_W - w;
    // 背景：75% 不透明；玩家贴近右缘时降至 40%（规格 §5）
    const nearEdge = this.lastPlayerScreenX > PANEL_X - 64;
    const alpha = nearEdge ? 0.4 : 0.75;
    g.fillStyle = `rgba(12,14,18,${alpha})`;
    g.fillRect(x0, 0, w, VIEW_H);

    // 归零红脉冲：面板左缘 3 次
    if (this.edgePulseT > 0) {
      const k = Math.sin(this.edgePulseT * 14);
      if (k > 0) {
        g.fillStyle = `rgba(232,58,58,${0.5 * k})`;
        g.fillRect(x0, 0, 4, VIEW_H);
      }
    }

    if (w >= PANEL_W - 8) this.drawExpanded(g, p);
    else if (w <= FOLD_W + 8) this.drawFolded(g, p);
    // 中间宽度（动画中 1~2 帧）：只画背景

    if (this.pageOpen) drawStatsPage(g, p, this);
  }

  private lastPlayerScreenX = 0;

  setPlayerScreenX(x: number): void {
    this.lastPlayerScreenX = x;
  }

  // ---- 展开态（布局坐标 = 规格 ×2）----
  private drawExpanded(g: CanvasRenderingContext2D, p: Player): void {
    const cx = PANEL_X + 96; // 面板中轴
    g.textBaseline = 'top';

    // 头像 96×96（框 100×100 @ (1134,14)）+ 生日金光
    const ritual = this.ritualT > 0;
    const pulse = ritual ? 0.5 + 0.5 * Math.sin(this.ritualT * 18) : 0;
    g.fillStyle = '#1b1e26';
    g.fillRect(1134, 14, 100, 100);
    g.save();
    g.beginPath();
    g.rect(1136, 16, 96, 96);
    g.clip();
    g.translate(1136, 16 + 96 - 28 * 4);
    g.scale(4, 4);
    drawCharacter(g, 0, 0, 'down', 0, p.appearance, false);
    g.restore();
    g.strokeStyle = ritual ? `rgba(255,209,102,${0.4 + 0.6 * pulse})` : '#3a3f4a';
    g.lineWidth = ritual ? 3 : 2;
    g.strokeRect(1135, 15, 98, 98);

    // 折叠钮 «
    g.fillStyle = '#2a2e36';
    g.fillRect(1240, 16, 32, 32);
    g.strokeStyle = '#3a3f4a';
    g.lineWidth = 2;
    g.strokeRect(1241, 17, 30, 30);
    g.font = '20px monospace';
    g.textAlign = 'center';
    g.fillStyle = '#8a8f98';
    g.fillText('«', 1256, 21);
    g.textAlign = 'left';

    // 姓名（最多 4 字，超出省略）
    const nm = p.name.length > 4 ? `${p.name.slice(0, 4)}…` : p.name;
    g.font = '24px monospace';
    g.textAlign = 'center';
    g.fillStyle = '#e8e8e8';
    g.fillText(nm, cx, 118);

    // 年龄（生日瞬间放大回落）：数字 + 「岁」作为整体居中
    const ageScale = ritual ? 1 + 0.5 * Math.sin(Math.min(1, (1.6 - this.ritualT) / 1.6) * Math.PI) : 1;
    const ageFont = Math.round(32 * ageScale);
    const ageStr = `${p.age}`;
    g.font = `${ageFont}px monospace`;
    const aw = g.measureText(ageStr).width;
    g.font = '20px monospace';
    const yw = g.measureText('岁').width;
    const pairCx = cx - 4; // 整体中心略左，给「岁」留位
    g.font = `${ageFont}px monospace`;
    g.fillStyle = ritual ? '#ffd166' : '#e8e8e8';
    g.fillText(ageStr, pairCx - (aw + yw) / 2, 152 - (ageFont - 32) / 2);
    g.font = '20px monospace';
    g.fillStyle = '#c8cdd5';
    g.fillText('岁', pairCx - (aw + yw) / 2 + aw + 2, 158);
    g.textAlign = 'left';

    // 人生阶段标签 chip
    g.fillStyle = '#232733';
    g.fillRect(1112, 184, 144, 28);
    g.strokeStyle = '#4a505c';
    g.lineWidth = 1.5;
    g.strokeRect(1112.5, 184.5, 143, 27);
    g.font = '16px monospace';
    g.textAlign = 'center';
    g.fillStyle = '#c8cdd5';
    g.fillText(p.stage, cx, 190);
    g.textAlign = 'left';

    // 六条属性行：y = 208 + 64k（行高 64）
    ATTRS.forEach((def, i) => {
      drawRow(g, def, PANEL_X + 16, 208 + i * 64, 160, p, this.colorblind, this.time, false);
    });

    // 金钱 y=592：金币图标 + 右对齐金额
    g.fillStyle = '#e8c85a';
    g.beginPath();
    g.arc(PANEL_X + 16 + 14, 592 + 14, 13, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#c9a63e';
    g.beginPath();
    g.arc(PANEL_X + 16 + 14, 592 + 14, 8, 0, Math.PI * 2);
    g.fill();
    g.font = '22px monospace';
    g.textAlign = 'right';
    g.fillStyle = '#e8c85a';
    g.fillText(`${p.money}`, PANEL_X + 176, 596);
    g.textAlign = 'left';

    // 状态图标区 y=624..688：4 图标 32×32 + 16px 文字标签（规格 §7）
    statuses(p).forEach((st, i) => {
      const sx = PANEL_X + 16 + i * 40;
      g.globalAlpha = st.on ? 1 : 0.18;
      drawStatusShape(g, st.kind, sx, 624, 32);
      g.globalAlpha = 1;
      g.font = '15px monospace';
      g.textAlign = 'center';
      g.fillStyle = st.on ? STATUS_COLOR[st.kind] : '#4a505c';
      g.fillText(st.kind, sx + 16, 662);
    });
    g.textAlign = 'left';

    // 浮动气泡（±N）
    for (const b of this.bubbles) {
      const row = ATTRS.findIndex((a) => a.name === b.attr);
      const bx = PANEL_X + 168;
      const by = row >= 0 ? 208 + row * 64 + 6 : 596; // 金钱气泡落到金钱行
      const k = b.t / 0.9;
      g.globalAlpha = Math.min(1, k * 2);
      g.font = '16px monospace';
      g.textAlign = 'right';
      g.fillStyle = b.delta > 0 ? '#7fd18a' : '#e86a6a';
      g.fillText(`${b.delta > 0 ? '+' : ''}${b.delta}`, bx, by - (1 - k) * 26);
      g.textAlign = 'left';
      g.globalAlpha = 1;
    }

    // 生日金光：右缘自上而下扫一遍
    if (ritual) {
      const k = 1 - this.ritualT / 1.6;
      const sy = k * (VIEW_H + 80) - 40;
      const grad = g.createLinearGradient(0, sy - 40, 0, sy + 40);
      grad.addColorStop(0, 'rgba(255,209,102,0)');
      grad.addColorStop(0.5, 'rgba(255,209,102,0.5)');
      grad.addColorStop(1, 'rgba(255,209,102,0)');
      g.fillStyle = grad;
      g.fillRect(PANEL_X, sy - 40, 8, 80);
    }

    // 底部按键提示
    g.font = '13px monospace';
    g.textAlign = 'center';
    g.fillStyle = '#6a7078';
    g.fillText('P 折叠 · Y 详情', cx, 700);
    g.textAlign = 'left';
    g.textBaseline = 'middle';
  }

  // ---- 折叠态：64px 竖条，mini 头像 + 4 状态点（规格 §3）----
  private drawFolded(g: CanvasRenderingContext2D, p: Player): void {
    const x0 = VIEW_W - FOLD_W;
    // mini 头像 48×48（角色 2 倍，底部对齐裁切）
    g.fillStyle = '#1b1e26';
    g.fillRect(x0 + 8, 8, 48, 48);
    g.save();
    g.beginPath();
    g.rect(x0 + 8, 8, 48, 48);
    g.clip();
    g.translate(x0 + 8, 8 + 48 - 28 * 2);
    g.scale(2, 2);
    drawCharacter(g, 0, 0, 'down', 0, p.appearance, false);
    g.restore();
    g.strokeStyle = '#3a3f4a';
    g.lineWidth = 2;
    g.strokeRect(x0 + 9, 9, 46, 46);

    // 危险状态红点：闪烁 + 左缘红脉冲
    const anyDanger = p.stamina <= DANGER;
    if (anyDanger && Math.floor(this.time * 2) % 2 === 0) {
      g.fillStyle = 'rgba(232,58,58,0.6)';
      g.fillRect(x0, 0, 3, VIEW_H);
    }

    // 4 个 8×8（×2=16×16）mini 状态点，y=76 起间距 24
    statuses(p).forEach((st, i) => {
      g.globalAlpha = st.on ? 1 : 0.16;
      drawStatusShape(g, st.kind, x0 + 24, 76 + i * 24, 16);
      g.globalAlpha = 1;
    });

    // » 展开钮
    g.fillStyle = '#2a2e36';
    g.fillRect(x0 + 8, 180, 48, 30);
    g.strokeStyle = '#3a3f4a';
    g.lineWidth = 2;
    g.strokeRect(x0 + 9, 181, 46, 28);
    g.font = '18px monospace';
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.fillStyle = '#8a8f98';
    g.fillText('»', x0 + 32, 185);
    g.textAlign = 'left';
    g.textBaseline = 'middle';
  }
}
