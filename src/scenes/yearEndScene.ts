// 年度结算界面 —— 《年度结算界面规格》v1.0 的实现
// 基准 640x360，本工程 1280x720：坐标 ×2、字号 ×2、时长不变
// 核心原则：动画只做「揭示」，任意键跳过直达终态，终态即完整静态版
import { VIEW_H, VIEW_W } from '../config';
import type { GameContext } from '../context';
import type { Scene } from './scene';
import type { YearReport, YearEvent } from '../core/yearReport';
import { ATTRS, drawAttrIcon } from '../ui/attrPanel';
import { tick, arpeggio } from '../core/sfx';

// 三档色调（规格 §3：糟年判词用冷色，红只留给数据）
const TONE_BG: Record<string, string> = { good: '#1c2216', bad: '#141a24', flat: '#16181d' };
const TONE_COMMENT: Record<string, string> = { good: '#e8c85a', bad: '#9fb4d8', flat: '#9aa0aa' };
const C_UP = '#7fd18a';
const C_DOWN = '#e86a6a';
const C_DIM = '#6a7078';
const C_TEXT = '#e8e8e8';

// 动效时间轴（秒）
const AGE_OUT = [0.1, 0.4]; // 旧年龄卷出
const AGE_IN = [0.3, 0.6]; // 新年龄卷入
const ATTR_START = 0.3; // 属性行起始，行间延迟 0.04，每行 0.4
const EVT_START = 0.5; // 事件滑入，间隔 0.08，每条 0.12
const CMT_START = 1.2; // 评语打字机 20ms/字
const COMPLETE_T = 2.0;

const BTN_DETAIL = { x: 816, y: 624, w: 208, h: 64 };
const BTN_OK = { x: 1056, y: 624, w: 192, h: 64 };

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export class YearEndScene implements Scene {
  private t = 0;
  private skipped = false;
  private page: 0 | 1 = 0;
  private fired: boolean[] = []; // 属性行涨跌音已播标记

  constructor(
    private readonly ctx: GameContext,
    private readonly report: YearReport,
  ) {
    // 调试：?snap 首帧即终态（无头截图验证用）；&detail 直接看详情页
    const q = new URLSearchParams(location.search);
    if (q.has('snap')) {
      this.t = COMPLETE_T;
      this.skipped = true;
    }
    if (q.has('detail')) this.page = 1;
  }

  enter(): void {
    if (this.report.toneTier === 'good') arpeggio([523.25, 659.25, 783.99]);
  }

  update(dt: number): void {
    const { input, scenes } = this.ctx;

    if (this.page === 1) {
      // 详情页：D/Esc 返回，Space/E 直接关闭
      if (input.wasPressed('KeyD', 'Escape')) this.page = 0;
      else if (input.wasPressed('Space', 'Enter', 'KeyE')) scenes.request(this.ctx.overworld);
      else if (input.consumeClick()) this.page = 0;
      return;
    }

    // 动画阶段：任意键直达终态
    if (!this.skipped && this.t < COMPLETE_T && input.anyPressed()) {
      this.skipped = true;
      this.t = COMPLETE_T;
      return;
    }
    if (this.t < COMPLETE_T) {
      const prev = this.t;
      this.t = Math.min(COMPLETE_T, this.t + dt);
      this.fireTicks(prev, this.t);
    } else {
      if (input.wasPressed('Space', 'Enter', 'KeyE')) {
        scenes.request(this.ctx.overworld);
        return;
      }
      if (input.wasPressed('KeyD')) {
        this.page = 1;
        return;
      }
      const click = input.consumeClick();
      if (click) {
        if (this.inRect(BTN_DETAIL, click.x, click.y)) this.page = 1;
        else if (this.inRect(BTN_OK, click.x, click.y)) scenes.request(this.ctx.overworld);
      }
    }
  }

  private inRect(r: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  // 属性行 reveal 瞬间播涨跌音（跳过时静音）
  private fireTicks(prev: number, now: number): void {
    this.report.attrFrom.forEach((from, i) => {
      if (this.fired[i]) return;
      const start = ATTR_START + i * 0.04;
      if (prev < start && now >= start) {
        this.fired[i] = true;
        const d = this.report.attrTo[i] - from;
        if (d !== 0) tick(d > 0, Math.abs(d) >= 20);
      }
    });
  }

  render(g: CanvasRenderingContext2D): void {
    g.fillStyle = TONE_BG[this.report.toneTier];
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    if (this.page === 1) this.renderDetail(g);
    else this.renderSummary(g);
  }

  // ---- P1 摘要页 ----
  private renderSummary(g: CanvasRenderingContext2D): void {
    const r = this.report;
    const t = this.t;
    g.textBaseline = 'top';

    // 年数 kicker
    g.font = '16px monospace';
    g.fillStyle = '#8a8f98';
    g.fillText(`人生 第 ${r.year} 年`, 32, 16);

    // 年龄：动画期旧值卷出/新值卷入；终态回到「6岁 → 7岁」双值同屏（旧值灰、新值金）
    const ageOutK = clamp01((t - AGE_OUT[0]) / (AGE_OUT[1] - AGE_OUT[0]));
    const ageInK = clamp01((t - AGE_IN[0]) / (AGE_IN[1] - AGE_IN[0]));
    const ageSettled = t >= AGE_IN[1] + 0.1;
    g.font = '24px monospace';
    g.fillStyle = C_DIM;
    if (ageSettled) {
      g.font = '32px monospace';
      g.fillText(`${r.ageFrom}岁`, 32, 56);
      g.fillText('→', 140, 60);
      g.font = '48px monospace';
      g.fillStyle = '#e8c85a';
      g.fillText(`${r.ageTo}岁`, 200, 44);
    } else {
      if (ageOutK < 1) {
        g.font = '32px monospace';
        g.fillStyle = C_DIM;
        g.globalAlpha = 1 - ageOutK;
        g.fillText(`${r.ageFrom}岁`, 32, 56 - ageOutK * 48);
        g.globalAlpha = 1;
      }
      if (ageInK > 0) {
        const fs = Math.round(48 * (0.8 + 0.2 * ageInK));
        g.font = `${fs}px monospace`;
        g.fillStyle = '#e8c85a';
        g.fillText(`${r.ageTo}岁`, 200, 44 + (1 - ageInK) * 56);
      }
      g.font = '24px monospace';
      g.fillStyle = C_DIM;
      g.fillText('→', 140, 60);
    }

    // 年度评语（打字机，最后出现）
    const cmtChars = t < CMT_START ? 0 : this.skipped ? r.comment.length : Math.min(r.comment.length, Math.floor((t - CMT_START) / 0.02));
    g.font = '24px monospace';
    g.fillStyle = TONE_COMMENT[r.toneTier];
    g.fillText(r.comment.slice(0, cmtChars), 480, 36);

    // 分隔线
    g.fillStyle = 'rgba(232,232,232,0.15)';
    g.fillRect(32, 128, 1216, 2);

    // 列头
    g.font = '16px monospace';
    g.fillStyle = '#8a8f98';
    g.fillText('属性 · 本年变化（▲涨 ▼跌）', 32, 144);
    g.fillText('这一年发生了什么', 640, 144);

    // 属性行 6 条：y = 176 + 64k
    r.attrNames.forEach((name, i) => {
      const y = 176 + i * 64;
      const start = ATTR_START + i * 0.04;
      const k = clamp01((t - start) / 0.4);
      drawAttrIcon(g, name, 32, y);
      g.font = '24px monospace';
      g.fillStyle = '#c8cdd5';
      g.fillText(name, 80, y + 4);
      const from = r.attrFrom[i];
      const to = r.attrTo[i];
      const shown = k >= 1 ? to : Math.round(from + (to - from) * k);
      g.font = '16px monospace';
      g.fillStyle = C_DIM;
      g.fillText(`${from}`, 144, y + 8);
      g.fillText('→', 208, y + 8);
      const d = to - from;
      g.font = '32px monospace';
      g.fillStyle = d > 0 ? C_UP : d < 0 ? C_DOWN : C_TEXT;
      g.fillText(`${shown}`, 248, y);
      g.font = '16px monospace';
      if (d !== 0) {
        g.fillStyle = d > 0 ? C_UP : C_DOWN;
        g.fillText(`${d > 0 ? '▲' : '▼'}${Math.abs(d)}`, 330, y + 8);
      }
      // 变化条：暗刻度 = 旧值，彩色 = 新值
      const bx = 432;
      const bw = 176;
      g.fillStyle = '#2a2e36';
      g.fillRect(bx, y + 10, bw, 12);
      const frac = (v: number) => (v / 100) * bw;
      g.fillStyle = '#4a505c';
      g.fillRect(bx + frac(from) - 1, y + 6, 2, 20);
      g.fillStyle = d < 0 ? C_DOWN : d > 0 ? C_UP : '#8a8f98';
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      g.fillRect(bx + frac(lo), y + 11, Math.max(2, frac(hi) - frac(lo)), 10);
    });

    // 金钱行
    const md = r.moneyTo - r.moneyFrom;
    g.fillStyle = '#e8c85a';
    g.beginPath();
    g.arc(46, 592, 13, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#c9a63e';
    g.beginPath();
    g.arc(46, 592, 8, 0, Math.PI * 2);
    g.fill();
    g.font = '24px monospace';
    g.fillStyle = '#e8c85a';
    g.fillText(`金钱  ${r.moneyFrom} → ${r.moneyTo}`, 72, 580);
    if (md !== 0) {
      g.fillStyle = md > 0 ? C_UP : C_DOWN;
      g.fillText(`(${md > 0 ? '+' : ''}${md})`, 340, 580);
    }

    // 事件 5 条：y = 176 + 48k
    r.events.slice(0, 5).forEach((e, j) => {
      const y = 176 + j * 48;
      const k = clamp01((t - (EVT_START + j * 0.08)) / 0.12);
      g.globalAlpha = k;
      const ey = y + (1 - k) * 16;
      this.drawEventDot(g, e, 640, ey + 14);
      g.font = '24px monospace';
      g.fillStyle = C_TEXT;
      const label = e.text.length > 22 ? `${e.text.slice(0, 22)}…` : e.text;
      g.fillText(label, 672, ey + 8);
      g.globalAlpha = 1;
    });

    // 关系行 3 条：y = 464 + 32k
    g.font = '16px monospace';
    g.fillStyle = '#8a8f98';
    g.fillText('关系', 640, 432);
    r.relations.slice(0, 3).forEach((rel, k2) => {
      const y = 464 + k2 * 32;
      g.font = '24px monospace';
      g.fillStyle = C_TEXT;
      g.fillText(rel.name, 640, y);
      const d = rel.to - rel.from;
      g.font = '20px monospace';
      g.fillStyle = d > 0 ? C_UP : C_DOWN;
      g.fillText(d > 0 ? `+${d} 档` : `${d} 档`, 768, y + 2);
      // 5 格好感条：新值填充，暗刻度 = 旧值
      const bx = 896;
      for (let c = 0; c < 5; c++) {
        g.fillStyle = c < rel.to ? (d > 0 ? C_UP : C_DOWN) : '#2a2e36';
        g.fillRect(bx + c * 72, y + 6, 64, 12);
      }
      g.fillStyle = '#4a505c';
      g.fillRect(bx + rel.from * 72 - 2, y + 2, 3, 20);
    });
    // 关系无变化：兜底一行，不留空白（规格 §6：最差的一年也有判词）
    if (r.relations.length === 0) {
      g.font = '20px monospace';
      g.fillStyle = C_DIM;
      g.fillText('这一年，邻里依旧点头之交，没有更深。', 640, 464);
    }

    // 按键提示 + 按钮
    g.font = '16px monospace';
    g.fillStyle = C_DIM;
    g.fillText('Space/E 继续 · D 详情 · 任意键跳过动画', 32, 640);
    this.drawButton(g, BTN_DETAIL, '查看详情 (D)', false, t >= COMPLETE_T);
    this.drawButton(g, BTN_OK, '继续', true, t >= COMPLETE_T);
    g.textBaseline = 'middle';
  }

  private drawEventDot(g: CanvasRenderingContext2D, e: YearEvent, x: number, y: number): void {
    g.fillStyle = e.importance === 3 ? '#e8c85a' : e.importance === 2 ? '#c8cdd5' : '#4a505c';
    g.fillRect(x, y, 16, 16);
    if (e.valence < 0) {
      g.strokeStyle = C_DOWN;
      g.lineWidth = 2;
      g.strokeRect(x - 2, y - 2, 20, 20);
    }
  }

  private drawButton(g: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, label: string, primary: boolean, enabled: boolean): void {
    g.fillStyle = primary ? '#232733' : '#1b1e26';
    g.fillRect(r.x, r.y, r.w, r.h);
    g.strokeStyle = primary && enabled ? '#e8c85a' : '#3a3f4a';
    g.lineWidth = 3;
    g.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3);
    g.font = primary ? '24px monospace' : '20px monospace';
    g.textAlign = 'center';
    g.fillStyle = enabled ? (primary ? '#e8c85a' : '#c8cdd5') : '#4a505c';
    g.fillText(label, r.x + r.w / 2, r.y + (primary ? 18 : 21));
    g.textAlign = 'left';
  }

  // ---- P2 详情页：全部事件 + 全部关系变化 + 年度记忆 ----
  private renderDetail(g: CanvasRenderingContext2D): void {
    const r = this.report;
    g.textBaseline = 'top';
    g.font = '32px monospace';
    g.fillStyle = C_TEXT;
    g.fillText(`第 ${r.year} 年 · 详情`, 32, 24);
    g.font = '16px monospace';
    g.fillStyle = C_DIM;
    g.fillText(`评价分 ${r.tone > 0 ? '+' : ''}${Math.round(r.tone)}（${r.toneTier === 'good' ? '好年' : r.toneTier === 'bad' ? '糟年' : '平年'}）`, 32, 68);

    // 左列：全部事件
    g.font = '20px monospace';
    g.fillStyle = '#8a8f98';
    g.fillText(`全部事件（${r.events.length}）`, 32, 112);
    r.events.slice(0, 14).forEach((e, i) => {
      const y = 152 + i * 40;
      this.drawEventDot(g, e, 32, y + 4);
      g.font = '22px monospace';
      g.fillStyle = C_TEXT;
      g.fillText(e.text, 64, y);
    });
    if (r.events.length > 14) {
      g.font = '16px monospace';
      g.fillStyle = C_DIM;
      g.fillText(`……另有 ${r.events.length - 14} 条`, 64, 152 + 14 * 40);
    }

    // 右列：关系变化（全部）
    const rx = 672;
    g.font = '20px monospace';
    g.fillStyle = '#8a8f98';
    g.fillText(`关系变化（${r.relations.length}）`, rx, 112);
    r.relations.slice(0, 8).forEach((rel, i) => {
      const y = 152 + i * 36;
      const d = rel.to - rel.from;
      g.font = '22px monospace';
      g.fillStyle = C_TEXT;
      g.fillText(rel.name, rx, y);
      g.fillStyle = d > 0 ? C_UP : C_DOWN;
      g.fillText(d > 0 ? `+${d}` : `${d}`, rx + 130, y);
      const bx = rx + 190;
      for (let c = 0; c < 5; c++) {
        g.fillStyle = c < rel.to ? (d > 0 ? C_UP : C_DOWN) : '#2a2e36';
        g.fillRect(bx + c * 50, y + 5, 42, 12);
      }
    });
    if (r.relations.length > 8) {
      g.font = '16px monospace';
      g.fillStyle = C_DIM;
      g.fillText(`……另有 ${r.relations.length - 8} 人`, rx, 152 + 8 * 36);
    }

    // 右列下方：这一年谁记得你
    const my = 152 + Math.max(8, Math.min(r.relations.length, 8)) * 36 + 24;
    g.font = '20px monospace';
    g.fillStyle = '#8a8f98';
    g.fillText('这一年谁记得你', rx, my);
    r.memoryLines.forEach((line, i) => {
      g.font = '22px monospace';
      g.fillStyle = '#c8cdd5';
      g.fillText(line, rx, my + 36 + i * 36);
    });

    g.font = '16px monospace';
    g.fillStyle = C_DIM;
    g.fillText('D / Esc / 点击 返回 · Space 继续', 32, 680);
    g.textBaseline = 'middle';
  }
}
