// 学校状态面板：左上角 168×64，12px monospace，四种状态
// 状态来源：游戏日 % 7 作为星期；工作日 08:00-16:05 为课表时间
import type { Input, PointerClick } from '../core/input';
import { AGING_DAYS } from '../entities/player';
import type { Player } from '../entities/player';
import { gameDayIndex, gameHour } from '../core/daynight';
import type { SchoolState } from '../systems/schoolState';

type SchoolPhase = 'class' | 'break' | 'after' | 'vacation' | 'graduated';
type Choice = 'listen' | 'daydream';

interface Period {
  start: number; // 分钟
  end: number;
  subject: string;
}

interface SchoolView {
  state: SchoolPhase;
  weekday: string;
  periodIndex: number;
  subject: string;
  nextSubject: string;
  remaining: number;
  daysToSchool: number;
  label: string;
  promoLabel: string;
  promoDays: number;
}

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const PERIODS: Period[] = [
  { start: 8 * 60, end: 8 * 60 + 45, subject: '语文' },
  { start: 8 * 60 + 55, end: 9 * 60 + 40, subject: '数学' },
  { start: 10 * 60, end: 10 * 60 + 45, subject: '英语' },
  { start: 10 * 60 + 55, end: 11 * 60 + 40, subject: '科学' },
  { start: 13 * 60 + 30, end: 14 * 60 + 15, subject: '体育' },
  { start: 14 * 60 + 25, end: 15 * 60 + 10, subject: '美术' },
  { start: 15 * 60 + 20, end: 16 * 60 + 5, subject: '自习' },
];

const FIRST_START = PERIODS[0].start;
const LAST_END = PERIODS[PERIODS.length - 1].end;
const LUNCH_START = PERIODS[3].end;
const LUNCH_END = PERIODS[4].start;

const PANEL_X = 8;
const PANEL_Y = 8;
const PANEL_W = 168;
const PANEL_H = 64;
const COLLAPSED_H = 24;
const REGION_X = 184;
const REGION_Y = 8;
const REGION_W = 120;
const REGION_H = 24;

const GOLD = '#e8c85a';
const BLUE = '#7fb8e8';
const GREEN = '#7fd18a';
const RED = '#c96a5a';
const TEXT = '#c8cdd5';
const MUTED = '#8a8f98';
const BORDER = '#3a3f4a';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function inRect(x: number, y: number, rx: number, ry: number, rw: number, rh: number): boolean {
  return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
}

export class SchoolPanel {
  private collapsed = true;
  private modal = false;
  private forceCollapsed = false;
  private choice: Choice = 'listen';
  private visible = false;

  private lastScore = 72;
  private lastScoreSubject = '数学';
  private scoreFlash = 0;
  private scoreDelta = 0;
  private scoreInitialized = false;

  private lastDay = -1;
  private dayStartKnowledge = 0;
  private todayGain = 0;
  private prevPeriod = -1;
  private prevState: SchoolPhase = 'break';

  constructor(private readonly school: SchoolState) {}

  get isModal(): boolean {
    return this.modal;
  }

  get isVisible(): boolean {
    return this.visible;
  }

  update(dt: number, input: Input, player: Player, uiBusy: boolean): void {
    const wasVisible = this.visible;
    this.visible = player.age >= 6;
    if (!this.visible) {
      this.modal = false;
      return;
    }

    const day = gameDayIndex();
    if (day !== this.lastDay) {
      this.lastDay = day;
      this.dayStartKnowledge = player.knowledge;
      this.todayGain = 0;
    }
    if (!this.scoreInitialized) {
      this.scoreInitialized = true;
      this.lastScore = clamp(Math.round(50 + player.knowledge * 0.4), 0, 100);
    }
    this.lastScore = this.school.lastScore;
    this.lastScoreSubject = this.school.lastSubject;

    const view = this.viewFor(player);
    this.lastView = view;
    if (view.state === 'class' && this.prevPeriod !== view.periodIndex) {
      if (this.prevPeriod >= 0) this.finishClass(player);
      this.prevPeriod = view.periodIndex;
    } else if (view.state !== 'class' && this.prevPeriod >= 0) {
      this.finishClass(player);
      this.prevPeriod = -1;
    }

    // 进入假期自动折叠；离开假期自动展开（用户手动状态优先）
    if (view.state === 'vacation' && this.prevState !== 'vacation') this.collapsed = true;
    if (view.state === 'graduated' && this.prevState !== 'graduated') this.collapsed = true;
    if (view.state !== 'vacation' && view.state !== 'graduated' && this.prevState === 'vacation') this.collapsed = false;
    this.prevState = view.state;

    this.todayGain = Math.max(0, Math.round(player.knowledge - this.dayStartKnowledge));
    if (this.scoreFlash > 0) this.scoreFlash = Math.max(0, this.scoreFlash - dt);

    this.forceCollapsed = uiBusy;
    if (this.modal) {
      if (input.wasPressed('Escape')) this.modal = false;
      return;
    }
    if (uiBusy) return;

    if (input.wasPressed('KeyH')) {
      this.collapsed = !this.collapsed;
      return;
    }
    if (input.wasPressed('Enter', 'NumpadEnter')) {
      this.modal = true;
      return;
    }
    if (!this.collapsed && view.state === 'class') {
      if (input.wasPressed('Digit1')) this.choice = 'listen';
      if (input.wasPressed('Digit2')) this.choice = 'daydream';
    }

    // 首次进入学校年龄段时展开；之后由 H / 假期规则控制
    if (!wasVisible && view.state !== 'vacation' && view.state !== 'graduated') this.collapsed = false;
  }

  handleClick(c: PointerClick | null): boolean {
    if (!this.visible || !c) return false;
    if (this.modal) {
      if (!inRect(c.x, c.y, 400, 180, 480, 360)) this.modal = false;
      return true;
    }
    if (this.forceCollapsed) return false;
    if (this.collapsed) {
      if (inRect(c.x, c.y, PANEL_X, PANEL_Y, PANEL_W, COLLAPSED_H)) {
        this.collapsed = false;
        return true;
      }
      return false;
    }

    if (inRect(c.x, c.y, 152, 8, 16, 16)) {
      this.collapsed = true;
      return true;
    }

    const view = this.lastView;
    if (view && view.state === 'class') {
      if (inRect(c.x, c.y, 72, 32, 40, 16)) {
        this.choice = 'listen';
        return true;
      }
      if (inRect(c.x, c.y, 120, 32, 40, 16)) {
        this.choice = 'daydream';
        return true;
      }
    }

    if (inRect(c.x, c.y, PANEL_X, PANEL_Y, PANEL_W, PANEL_H)) {
      this.modal = true;
      return true;
    }
    return false;
  }

  render(g: CanvasRenderingContext2D, player: Player, region: string, blockers: { x: number; y: number }[]): void {
    if (!this.visible) return;
    this.drawRegion(g, region);

    const view = this.viewFor(player);
    this.lastView = view;
    const collapsed = this.collapsed || this.forceCollapsed || this.modal;
    const h = collapsed ? COLLAPSED_H : PANEL_H;
    const under = blockers.some((p) => inRect(p.x, p.y, PANEL_X, PANEL_Y, PANEL_W, h));
    const alpha = under ? 0.35 : 0.92;
    const xueshen = this.school.isXueshen(player.age);
    const accent = xueshen ? GOLD : this.accent(view.state);

    g.save();
    g.globalAlpha = alpha;
    this.drawFrame(g, h, view, accent);
    if (collapsed) this.drawCollapsed(g, view, accent, xueshen);
    else this.drawExpanded(g, view, accent, xueshen);
    g.restore();
  }

  renderModal(g: CanvasRenderingContext2D, player: Player): void {
    if (!this.visible || !this.modal) return;
    const view = this.viewFor(player);
    const x = 400;
    const y = 184;
    const w = 480;
    const h = 352;

    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(0, 0, 1280, 720);
    g.fillStyle = 'rgba(14,16,22,0.96)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = GOLD;
    g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, w - 2, h - 2);

    g.font = '20px monospace';
    g.textBaseline = 'top';
    g.fillStyle = GOLD;
    const xueshen = this.school.isXueshen(player.age);
    const head = (view.state === 'graduated' ? '母校 · 已毕业' : `学校 · ${view.weekday}`) + (xueshen ? ' · ★学神' : '');
    g.fillText(head, x + 24, y + 24);
    g.font = '12px monospace';
    g.fillStyle = MUTED;
    if (view.state === 'graduated') {
      g.fillText(`成绩档 ${this.school.gradeTag} · 推荐${this.school.recommendation ? '有' : '无'} · 出勤 ${Math.round(this.school.attendanceRate() * 100)}%`, x + 24, y + 56);
      this.school.reportLines().forEach((line, i) => {
        g.fillStyle = TEXT;
        g.fillText(line, x + 24, y + 96 + i * 28);
      });
      g.fillStyle = MUTED;
      g.fillText(`旧友 ${this.school.friends} 人 · ${this.school.tags.slice(0, 3).join(' / ') || '暂无回响'}`, x + 24, y + 232);
      g.fillText('Esc / 点击空白关闭', x + 24, y + 328);
      return;
    }
    g.fillText(`${view.label} · 今日 +${this.todayGain} 学识 · ${view.promoLabel} ${view.promoDays} 天`, x + 24, y + 56);

    let rowY = y + 88;
    PERIODS.forEach((p, i) => {
      const active = view.state === 'class' && view.periodIndex === i;
      g.fillStyle = active ? 'rgba(232,200,90,0.16)' : 'rgba(255,255,255,0.03)';
      g.fillRect(x + 16, rowY - 8, w - 32, 32);
      g.font = '12px monospace';
      g.fillStyle = active ? GOLD : TEXT;
      const time = `${String(Math.floor(p.start / 60)).padStart(2, '0')}:${String(p.start % 60).padStart(2, '0')}`;
      g.fillText(time, x + 24, rowY);
      g.fillText(p.subject, x + 96, rowY);
      g.fillStyle = active ? GOLD : MUTED;
      g.fillText(active ? '上课中' : '—', x + 160, rowY);
      rowY += 32;
    });

    g.font = '12px monospace';
    g.fillStyle = TEXT;
    g.fillText(`最近成绩：${this.lastScoreSubject} ${this.lastScore} 分`, x + 24, y + 304);
    g.fillStyle = MUTED;
    g.fillText('Esc / 点击空白关闭', x + 24, y + 328);
  }

  private drawRegion(g: CanvasRenderingContext2D, region: string): void {
    g.font = '12px monospace';
    g.textBaseline = 'top';
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(REGION_X, REGION_Y, REGION_W, REGION_H);
    g.fillStyle = '#e8e8e8';
    g.fillText(`区域 ${region}`, REGION_X + 8, REGION_Y + 8);
  }

  private drawFrame(g: CanvasRenderingContext2D, h: number, view: SchoolView, accent: string): void {
    g.fillStyle = 'rgba(14,16,22,0.92)';
    g.fillRect(PANEL_X, PANEL_Y, PANEL_W, h);
    g.strokeStyle = accent;
    g.lineWidth = 1;
    g.strokeRect(PANEL_X + 0.5, PANEL_Y + 0.5, PANEL_W - 1, h - 1);
  }

  private drawExpanded(g: CanvasRenderingContext2D, view: SchoolView, accent: string, xueshen: boolean): void {
    this.drawBadge(g, accent);
    g.textBaseline = 'top';
    g.font = '12px monospace';
    g.fillStyle = accent;
    g.fillText((xueshen ? '★ ' : '') + this.headerText(view), 40, 16);

    if (view.state === 'class') {
      g.fillStyle = TEXT;
      g.fillText(`剩${view.remaining}分`, 16, 32);
      this.drawChip(g, 72, 32, '听讲', this.choice === 'listen', accent);
      this.drawChip(g, 120, 32, '走神', this.choice === 'daydream', accent);
      this.drawClassDot(g, view.remaining);
    } else if (view.state === 'break') {
      g.fillStyle = TEXT;
      g.fillText(`下节${view.nextSubject} · 剩${view.remaining}分`, 16, 32);
      this.drawSecondLine(g, view, accent);
    } else if (view.state === 'after') {
      g.fillStyle = TEXT;
      g.fillText(`今天 +${this.todayGain} 学识`, 16, 32);
      this.drawSecondLine(g, view, accent);
    } else if (view.state === 'graduated') {
      g.fillStyle = TEXT;
      g.fillText(`成绩 ${this.school.gradeTag} · 推荐${this.school.recommendation ? '有' : '无'}`, 16, 32);
      g.fillStyle = MUTED;
      g.fillText(`旧友 ${this.school.friends} 人 · 出勤 ${Math.round(this.school.attendanceRate() * 100)}%`, 16, 48);
    } else {
      g.fillStyle = TEXT;
      g.fillText(`距开学 ${view.daysToSchool} 天`, 16, 32);
      g.fillStyle = MUTED;
      g.fillText(`上学期 ${this.lastScoreSubject}${this.lastScore}`, 16, 48);
    }

    g.fillStyle = accent;
    g.fillText('⌄', 160, 16);
  }

  private drawSecondLine(g: CanvasRenderingContext2D, view: SchoolView, accent: string): void {
    const bounce = this.scoreFlash > 0 ? -Math.round(Math.abs(Math.sin(this.scoreFlash * 18)) * 1) : 0;
    g.fillStyle = this.scoreFlash > 0 ? (this.scoreDelta >= 0 ? GREEN : RED) : TEXT;
    g.fillText(`${this.lastScoreSubject}${this.lastScore}`, 16, 48 + bounce);
    const w = g.measureText(`${this.lastScoreSubject}${this.lastScore}`).width;
    g.fillStyle = MUTED;
    g.fillText(` · ${view.promoLabel}${view.promoDays}天`, 16 + w, 48);
    if (this.scoreFlash > 0) {
      g.fillStyle = this.scoreDelta >= 0 ? GREEN : RED;
      g.fillText(`${this.scoreDelta >= 0 ? '+' : ''}${this.scoreDelta}`, 136, 48);
    }
    void accent;
  }

  private drawCollapsed(g: CanvasRenderingContext2D, view: SchoolView, accent: string, xueshen: boolean): void {
    g.font = '12px monospace';
    g.textBaseline = 'top';
    this.drawBadge(g, accent, 16, 16, 16);
    const urgent = view.state === 'class' && view.remaining <= 5;
    const pulse = urgent ? 0.55 + Math.abs(Math.sin(performance.now() / 700)) * 0.45 : 1;
    g.globalAlpha *= pulse;
    g.fillStyle = urgent ? (view.remaining <= 1 ? RED : GOLD) : accent;
    g.fillText((xueshen ? '★ ' : '') + this.collapsedText(view), 40, 16);
    g.globalAlpha /= pulse;
    g.fillStyle = accent;
    g.fillText('⌃', 160, 16);
  }

  private drawBadge(g: CanvasRenderingContext2D, color: string, x = 16, y = 16, size = 16): void {
    g.fillStyle = color;
    g.fillRect(x + 4, y, size - 8, 3);
    g.fillRect(x, y + 4, size, 3);
    g.fillRect(x + 2, y + 8, size - 4, 7);
    g.fillStyle = 'rgba(14,16,22,0.9)';
    g.fillRect(x + 6, y + 10, size - 12, 2);
  }

  private drawChip(g: CanvasRenderingContext2D, x: number, y: number, text: string, active: boolean, accent: string): void {
    g.fillStyle = active ? accent : '#2a2e36';
    g.fillRect(x, y, 40, 16);
    g.strokeStyle = active ? accent : BORDER;
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, 39, 15);
    g.font = '12px monospace';
    g.textBaseline = 'middle';
    g.fillStyle = active ? '#14151a' : MUTED;
    g.fillText(text, x + 8, y + 9);
    g.textBaseline = 'top';
  }

  private drawClassDot(g: CanvasRenderingContext2D, remaining: number): void {
    const color = remaining <= 1 ? RED : remaining <= 5 ? GOLD : GREEN;
    const pulse = remaining <= 5 ? 0.55 + Math.abs(Math.sin(performance.now() / 700)) * 0.45 : 1;
    g.globalAlpha *= pulse;
    g.fillStyle = color;
    g.fillRect(152, 48, 8, 8);
    g.globalAlpha /= pulse;
  }

  private accent(state: SchoolPhase): string {
    if (state === 'class') return GOLD;
    if (state === 'break') return BLUE;
    if (state === 'after') return GOLD;
    if (state === 'graduated') return MUTED;
    return GREEN;
  }

  private headerText(view: SchoolView): string {
    if (view.state === 'class') return `${view.weekday}·第${view.periodIndex + 1}节·${view.subject}`;
    if (view.state === 'break') return `${view.weekday}·${view.label}`;
    if (view.state === 'after') return `${view.weekday}·放学`;
    if (view.state === 'graduated') return '母校·已毕业';
    return `周末·第${Math.max(1, WEEKDAYS.indexOf(view.weekday) - 4)}天`;
  }

  private collapsedText(view: SchoolView): string {
    if (view.state === 'class') return `第${view.periodIndex + 1}节 · 剩${view.remaining}分`;
    if (view.state === 'break') return `下节${view.nextSubject} · ${view.remaining}分`;
    if (view.state === 'after') return `放学 · +${this.todayGain}学识`;
    if (view.state === 'graduated') return `母校 · 成绩${this.school.gradeTag}`;
    return `距开学 ${view.daysToSchool} 天`;
  }

  private lastView: SchoolView | null = null;

  private viewFor(player: Player): SchoolView {
    const day = gameDayIndex();
    const wd = ((day % 7) + 7) % 7;
    const weekday = WEEKDAYS[wd];
    const m = gameHour() * 60;
    const stageAge = player.age < 12 ? 12 : 18;
    const promoDays = Math.max(0, (stageAge - player.age) * AGING_DAYS);
    const promoLabel = player.age < 12 ? '升学' : '毕业';

    if (player.age > 18) {
      return {
        state: 'graduated',
        weekday: '',
        periodIndex: -1,
        subject: '',
        nextSubject: '',
        remaining: 0,
        daysToSchool: 0,
        label: '已毕业',
        promoLabel: '',
        promoDays: 0,
      };
    }

    if (wd >= 5) {
      return {
        state: 'vacation',
        weekday,
        periodIndex: -1,
        subject: '',
        nextSubject: '',
        remaining: 0,
        daysToSchool: Math.max(1, 7 - wd),
        label: '周末',
        promoLabel,
        promoDays,
      };
    }

    const periodIndex = PERIODS.findIndex((p) => m >= p.start && m < p.end);
    if (periodIndex >= 0) {
      const p = PERIODS[periodIndex];
      return {
        state: 'class',
        weekday,
        periodIndex,
        subject: p.subject,
        nextSubject: '',
        remaining: Math.max(1, Math.ceil(p.end - m)),
        daysToSchool: 0,
        label: p.subject,
        promoLabel,
        promoDays,
      };
    }

    if (m >= LAST_END) {
      return {
        state: 'after',
        weekday,
        periodIndex: -1,
        subject: '',
        nextSubject: '',
        remaining: 0,
        daysToSchool: 0,
        label: '放学',
        promoLabel,
        promoDays,
      };
    }

    const nextIndex = PERIODS.findIndex((p) => p.start > m);
    const next = nextIndex >= 0 ? PERIODS[nextIndex] : null;
    const label = m < FIRST_START ? '上学前' : m >= LUNCH_START && m < LUNCH_END ? '午休' : '课间';
    return {
      state: 'break',
      weekday,
      periodIndex: -1,
      subject: '',
      nextSubject: next ? next.subject : '',
      remaining: next ? Math.max(1, Math.ceil(next.start - m)) : 0,
      daysToSchool: 0,
      label,
      promoLabel,
      promoDays,
    };
  }

  private finishClass(player: Player): void {
    const subject = this.prevPeriod >= 0 && PERIODS[this.prevPeriod] ? PERIODS[this.prevPeriod].subject : this.lastScoreSubject;
    const target = clamp(40 + player.knowledge * 0.5 + (this.choice === 'listen' ? 6 : -4), 0, 100);
    const next = clamp(Math.round(this.lastScore * 0.7 + target * 0.3), 0, 100);
    this.scoreDelta = next - this.lastScore;
    this.lastScore = next;
    this.lastScoreSubject = subject;
    this.scoreFlash = 1.2;
  }
}
