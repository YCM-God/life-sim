// 人生簿：人生总分 / 五维分阶 / 成就墙（桌面快捷键 L，触屏「成就」键）
// 画布绘制，风格仿 questPanel.ts；打开时吞掉输入，L / Esc 关闭。
import { VIEW_H, VIEW_W } from '../config';
import type { GameContext } from '../context';
import type { Input, PointerClick } from '../core/input';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID } from '../score/achievements';
import {
  DIM_COLORS,
  DIM_NAMES,
  TIERS,
  TIER_NAMES,
  lifeTitle,
  nextTier,
  tierOf,
} from '../score/rules';
import { DIMS } from '../score/types';
import type { Dim } from '../score/types';

const PANEL = { x: 80, y: 40, w: 1120, h: 640 };
const CLOSE = { x: PANEL.x + PANEL.w - 56, y: PANEL.y + 14, w: 40, h: 40 };
const TAB_OVERVIEW = { x: PANEL.x + 320, y: PANEL.y + 16, w: 150, h: 44 };
const TAB_ACH = { x: PANEL.x + 478, y: PANEL.y + 16, w: 150, h: 44 };
const BTN_PREV = { x: PANEL.x + 340, y: PANEL.y + PANEL.h - 64, w: 120, h: 44 };
const BTN_NEXT = { x: PANEL.x + 660, y: PANEL.y + PANEL.h - 64, w: 120, h: 44 };
const GRID_TOP = PANEL.y + 118;
const CELL_W = 520;
const CELL_H = 58;
const ROWS_PER_PAGE = 7;

function inRect(r: { x: number; y: number; w: number; h: number }, c: PointerClick): boolean {
  return c.x >= r.x && c.x <= r.x + r.w && c.y >= r.y && c.y <= r.y + r.h;
}

export class AchievementPanel {
  private active = false;
  private page: 0 | 1 = 0;
  private pageIdx = 0;
  private time = 0;

  constructor(private readonly ctx: GameContext) {}

  get isActive(): boolean {
    return this.active;
  }

  toggle(): void {
    this.active = !this.active;
  }

  close(): void {
    this.active = false;
  }

  private get pageCount(): number {
    return Math.max(1, Math.ceil(ACHIEVEMENTS.length / (ROWS_PER_PAGE * 2)));
  }

  update(dt: number, input: Input): void {
    this.time += dt;
    if (input.wasPressed('KeyL', 'Escape')) {
      this.close();
      return;
    }
    if (input.wasPressed('ArrowLeft', 'KeyA')) this.page = 0;
    if (input.wasPressed('ArrowRight', 'KeyD')) this.page = 1;
    if (this.page === 1) {
      if (input.wasPressed('ArrowUp', 'KeyW')) this.pageIdx = Math.max(0, this.pageIdx - 1);
      if (input.wasPressed('ArrowDown', 'KeyS')) {
        this.pageIdx = Math.min(this.pageCount - 1, this.pageIdx + 1);
      }
    }
    const click = input.consumeClick();
    if (click) this.handleClick(click);
  }

  private handleClick(c: PointerClick): void {
    if (inRect(CLOSE, c)) {
      this.close();
      return;
    }
    if (inRect(TAB_OVERVIEW, c)) {
      this.page = 0;
      return;
    }
    if (inRect(TAB_ACH, c)) {
      this.page = 1;
      return;
    }
    if (this.page === 1) {
      if (inRect(BTN_PREV, c)) this.pageIdx = Math.max(0, this.pageIdx - 1);
      else if (inRect(BTN_NEXT, c)) this.pageIdx = Math.min(this.pageCount - 1, this.pageIdx + 1);
    }
  }

  render(g: CanvasRenderingContext2D): void {
    if (!this.active) return;
    g.fillStyle = 'rgba(4,6,10,0.78)';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    g.fillStyle = 'rgba(14,16,22,0.97)';
    g.fillRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
    g.strokeStyle = '#3a3f4a';
    g.lineWidth = 2;
    g.strokeRect(PANEL.x + 1, PANEL.y + 1, PANEL.w - 2, PANEL.h - 2);

    g.textBaseline = 'top';
    g.font = '24px monospace';
    g.fillStyle = '#e8c85a';
    g.fillText('人生簿', PANEL.x + 24, PANEL.y + 22);

    this.tab(g, TAB_OVERVIEW, '总览', this.page === 0);
    this.tab(g, TAB_ACH, '成就', this.page === 1);

    // 关闭钮（触屏 ≥44px 点击区）
    g.fillStyle = '#2a2e36';
    g.fillRect(CLOSE.x, CLOSE.y, CLOSE.w, CLOSE.h);
    g.strokeStyle = '#3a3f4a';
    g.strokeRect(CLOSE.x + 1, CLOSE.y + 1, CLOSE.w - 2, CLOSE.h - 2);
    g.font = '20px monospace';
    g.textAlign = 'center';
    g.fillStyle = '#c8cdd5';
    g.fillText('✕', CLOSE.x + CLOSE.w / 2, CLOSE.y + 8);
    g.textAlign = 'left';

    if (this.page === 0) this.renderOverview(g);
    else this.renderAchievements(g);

    g.font = '14px monospace';
    g.fillStyle = '#6a7078';
    g.textAlign = 'center';
    g.fillText(
      this.page === 0 ? 'L / Esc 关闭 · D 查看成就' : 'A / 左 总览 · D / 右 成就 · W/S 翻页 · L 关闭',
      PANEL.x + PANEL.w / 2,
      PANEL.y + PANEL.h - 22,
    );
    g.textAlign = 'left';
    g.textBaseline = 'middle';
  }

  private tab(g: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, label: string, on: boolean): void {
    g.fillStyle = on ? '#3a3018' : '#1b1e26';
    g.fillRect(r.x, r.y, r.w, r.h);
    g.strokeStyle = on ? '#e8c85a' : '#3a3f4a';
    g.lineWidth = 2;
    g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    g.font = '18px monospace';
    g.textAlign = 'center';
    g.fillStyle = on ? '#ffd166' : '#8a8f98';
    g.fillText(label, r.x + r.w / 2, r.y + 12);
    g.textAlign = 'left';
  }

  private unlockedCount(): number {
    return Object.keys(this.ctx.score.state.achievements).filter((id) => !!ACHIEVEMENT_BY_ID[id]).length;
  }

  // ---------- 总览 ----------
  private renderOverview(g: CanvasRenderingContext2D): void {
    const score = this.ctx.score;
    const total = score.total();
    const unlocked = this.unlockedCount();

    g.font = '64px monospace';
    g.fillStyle = '#f0c878';
    g.fillText(`${total}`, PANEL.x + 32, PANEL.y + 84);
    g.font = '18px monospace';
    g.fillStyle = '#8a8f98';
    g.fillText('人生总分', PANEL.x + 36, PANEL.y + 156);
    g.font = '30px monospace';
    g.fillStyle = '#c8cdd5';
    g.fillText(lifeTitle(total), PANEL.x + 220, PANEL.y + 100);
    g.font = '17px monospace';
    g.fillStyle = '#8a8f98';
    g.fillText(`成就 ${unlocked} / ${ACHIEVEMENTS.length}`, PANEL.x + 220, PANEL.y + 144);

    // 五维分阶
    DIMS.forEach((dim, i) => {
      const y = PANEL.y + 204 + i * 74;
      const pts = score.state.dims[dim];
      const tier = tierOf(dim, pts);
      const nt = nextTier(dim, pts);
      this.drawDimRow(g, dim, pts, tier, nt, y);
    });

    // 历代人生（不随 clearSave 消失）
    let legacy: { total: number }[] = [];
    try {
      legacy = score.store.listLegacy();
    } catch {
      legacy = [];
    }
    const best = legacy.reduce((m, r) => Math.max(m, r.total), 0);
    g.font = '17px monospace';
    g.fillStyle = '#6a7078';
    g.fillText(
      legacy.length > 0 ? `历代最高 ${best} 分 · 共 ${legacy.length} 世（最高保留 20 条）` : '这是你的第一世',
      PANEL.x + 32,
      PANEL.y + 590,
    );
  }

  private drawDimRow(
    g: CanvasRenderingContext2D,
    dim: Dim,
    pts: number,
    tier: number,
    nt: { at: number; name: string } | null,
    y: number,
  ): void {
    const x = PANEL.x + 32;
    g.fillStyle = DIM_COLORS[dim];
    g.fillRect(x, y + 8, 6, 24);
    g.font = '22px monospace';
    g.fillStyle = '#e8e8e8';
    g.fillText(DIM_NAMES[dim], x + 18, y);
    g.font = '24px monospace';
    g.fillStyle = DIM_COLORS[dim];
    g.textAlign = 'right';
    g.fillText(`${pts}`, x + 220, y - 1);
    g.textAlign = 'left';

    g.font = '16px monospace';
    g.fillStyle = '#8a8f98';
    const tierName = tier > 0 ? `${tier} 阶 · ${TIER_NAMES[dim][tier - 1]}` : '未入阶';
    g.fillText(tierName, x + 250, y + 6);

    // 到下一阶的进度条
    if (nt) {
      const prev = tier > 0 ? TIERS[dim][tier - 1] : 0;
      const frac = Math.max(0, Math.min(1, (pts - prev) / Math.max(1, nt.at - prev)));
      const bx = x + 520;
      const bw = 360;
      g.fillStyle = '#242833';
      g.fillRect(bx, y + 10, bw, 12);
      g.fillStyle = DIM_COLORS[dim];
      g.fillRect(bx, y + 10, Math.round(bw * frac), 12);
      g.font = '14px monospace';
      g.fillStyle = '#6a7078';
      g.fillText(`下一阶 ${nt.name} · ${nt.at}`, bx + bw + 12, y + 8);
    } else {
      g.font = '14px monospace';
      g.fillStyle = '#e8c85a';
      g.fillText('已达最高阶', x + 520, y + 8);
    }
  }

  // ---------- 成就墙 ----------
  private renderAchievements(g: CanvasRenderingContext2D): void {
    const unlocked = this.unlockedCount();
    g.font = '18px monospace';
    g.fillStyle = '#8a8f98';
    g.fillText(`已解锁 ${unlocked} / ${ACHIEVEMENTS.length}`, PANEL.x + 32, PANEL.y + 86);

    const start = this.pageIdx * ROWS_PER_PAGE * 2;
    const slice = ACHIEVEMENTS.slice(start, start + ROWS_PER_PAGE * 2);
    slice.forEach((def, i) => {
      const col = i >= ROWS_PER_PAGE ? 1 : 0;
      const row = i % ROWS_PER_PAGE;
      const x = PANEL.x + 32 + col * (CELL_W + 24);
      const y = GRID_TOP + row * CELL_H;
      this.drawAchievementCell(g, def, x, y);
    });

    // 翻页按钮（触屏也点得到）
    this.navButton(g, BTN_PREV, '◀ 上一页', this.pageIdx > 0);
    this.navButton(g, BTN_NEXT, '下一页 ▶', this.pageIdx < this.pageCount - 1);
    g.font = '16px monospace';
    g.fillStyle = '#8a8f98';
    g.textAlign = 'center';
    g.fillText(`${this.pageIdx + 1} / ${this.pageCount} 页`, PANEL.x + PANEL.w / 2, BTN_PREV.y + 12);
    g.textAlign = 'left';
  }

  private drawAchievementCell(
    g: CanvasRenderingContext2D,
    def: (typeof ACHIEVEMENTS)[number],
    x: number,
    y: number,
  ): void {
    const got = !!this.ctx.score.state.achievements[def.id];
    const hiddenLocked = !!def.hidden && !got;
    g.fillStyle = got ? 'rgba(58,48,24,0.55)' : 'rgba(26,29,36,0.7)';
    g.fillRect(x, y, CELL_W, CELL_H - 6);
    g.strokeStyle = got ? '#8a6f2a' : '#2a2e38';
    g.lineWidth = 1.5;
    g.strokeRect(x + 0.75, y + 0.75, CELL_W - 1.5, CELL_H - 7.5);

    g.fillStyle = got ? DIM_COLORS[def.dim] : '#3a3f4a';
    g.fillRect(x, y, 5, CELL_H - 6);

    g.font = '17px monospace';
    g.fillStyle = got ? '#ffd166' : '#6a7078';
    g.fillText(hiddenLocked ? '？？？' : def.name, x + 16, y + 8);
    g.font = '13px monospace';
    g.fillStyle = got ? '#b9b09a' : '#4a505c';
    const sub = hiddenLocked ? (def.hint ?? '继续生活，也许会遇到') : def.desc;
    g.fillText(sub.length > 30 ? `${sub.slice(0, 30)}…` : sub, x + 16, y + 30);

    g.font = '14px monospace';
    g.textAlign = 'right';
    g.fillStyle = got ? '#e8c85a' : '#3a3f4a';
    g.fillText(got ? `+${def.bonus}` : `+${def.bonus}`, x + CELL_W - 12, y + 8);
    g.textAlign = 'left';
  }

  private navButton(
    g: CanvasRenderingContext2D,
    r: { x: number; y: number; w: number; h: number },
    label: string,
    enabled: boolean,
  ): void {
    g.fillStyle = '#1b1e26';
    g.fillRect(r.x, r.y, r.w, r.h);
    g.strokeStyle = enabled ? '#3a3f4a' : '#242833';
    g.lineWidth = 2;
    g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    g.font = '16px monospace';
    g.textAlign = 'center';
    g.fillStyle = enabled ? '#c8cdd5' : '#3a3f4a';
    g.fillText(label, r.x + r.w / 2, r.y + 13);
    g.textAlign = 'left';
  }
}
