// 期末考试场景：白色试卷，姓名 + 学号在卷首，每页 3 题，下方「下一页」翻页
// 10 题答完「交卷」→ 打分 → 与考试系统接轨（recordExam / 学神称号）
import { VIEW_H, VIEW_W } from '../config';
import type { GameContext } from '../context';
import type { Scene } from './scene';
import { sampleExam, levelName, levelForAge } from '../data/examQuestions';
import type { ExamQuestion } from '../data/examQuestions';
import { tick, arpeggio } from '../core/sfx';
import { refreshScore } from '../score/facts';

const INK = '#1f1f1f';
const MUTED = '#8a8f98';
const GOOD = '#2e8b57';
const BAD = '#c0392b';
const ACCENT = '#c0392b';
const BTN_DARK = '#2c3e50';

// 试卷布局
const PAPER = { x: 130, y: 55, w: 1020, h: 610 };
const Q_PER_PAGE = 3;
const Q_Y0 = PAPER.y + 125;
const Q_BLOCK_H = 150;
const OPT_W = 226;
const OPT_GAP = 12;
const OPT_H = 40;
const LABELS = ['A', 'B', 'C', 'D'];

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function inRect(p: { x: number; y: number }, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export class ExamScene implements Scene {
  private questions: ExamQuestion[];
  private level: string;
  private age: number;
  private name: string;
  private studentNo: string;
  private answers: number[] = [];
  private page = 0;
  private phase: 'answer' | 'result' = 'answer';
  private correctCount = 0;
  private earned = false;
  private finished = false;
  private flipT = 0;

  constructor(
    private readonly ctx: GameContext,
    private readonly onDone: () => void,
  ) {
    this.age = ctx.player.age;
    this.questions = sampleExam(this.age);
    const lv = levelForAge(this.age) ?? 'elementary';
    this.level = levelName(lv);
    if (this.questions.length === 0) this.questions = sampleExam(8); // 学龄外兜底
    this.name = ctx.player.name;
    this.studentNo = ctx.schoolState.studentNoOrGenerate();
    this.answers = new Array(this.questions.length).fill(-1);

    // 调试钩子：自动化验证用
    (window as unknown as { __exam: unknown }).__exam = {
      level: () => this.level,
      page: () => this.page,
      total: () => this.questions.length,
      questions: () => this.questions.map((q) => ({ q: q.q, options: q.options, answer: q.answer })),
      answers: () => [...this.answers],
      phase: () => this.phase,
      setAnswer: (i: number, o: number) => {
        if (i >= 0 && i < this.answers.length && o >= 0 && o < 4) this.answers[i] = o;
      },
      result: () => ({ correct: this.correctCount, total: this.questions.length, earned: this.earned }),
    };
  }

  private get totalPages(): number {
    return Math.max(1, Math.ceil(this.questions.length / Q_PER_PAGE));
  }

  private optionRect(k: number, o: number): Rect {
    const blockY = Q_Y0 + k * Q_BLOCK_H;
    return { x: PAPER.x + 40 + o * (OPT_W + OPT_GAP), y: blockY + 44, w: OPT_W, h: OPT_H };
  }

  private nextBtnRect(): Rect {
    return { x: PAPER.x + PAPER.w / 2 - 100, y: PAPER.y + PAPER.h - 66, w: 200, h: 48 };
  }

  update(dt: number): void {
    if (this.flipT > 0) this.flipT = Math.max(0, this.flipT - dt);
    const { input } = this.ctx;

    if (this.phase === 'answer') {
      const click = input.consumeClick();
      if (click) {
        // 点击选项作答
        const start = this.page * Q_PER_PAGE;
        for (let k = 0; k < Q_PER_PAGE && start + k < this.questions.length; k++) {
          for (let o = 0; o < 4; o++) {
            if (inRect(click, this.optionRect(k, o))) {
              this.answers[start + k] = o;
              tick(true);
              return;
            }
          }
        }
        // 点击翻页按钮
        if (inRect(click, this.nextBtnRect())) {
          this.nextPage();
        }
        return;
      }
      if (input.wasPressed('Enter', 'NumpadEnter', 'Space', 'ArrowRight')) {
        this.nextPage();
      }
      return;
    }

    // 结果页
    if (input.wasPressed('Enter', 'NumpadEnter', 'Space', 'KeyE') || input.consumeClick()) {
      if (!this.finished) {
        this.finished = true;
        this.onDone();
      }
    }
  }

  private nextPage(): void {
    if (this.page < this.totalPages - 1) {
      this.page++;
      this.flipT = 0.22;
      tick(true);
    } else {
      this.submit();
    }
  }

  private submit(): void {
    let correct = 0;
    for (let i = 0; i < this.questions.length; i++) {
      if (this.answers[i] === this.questions[i].answer) correct++;
    }
    this.correctCount = correct;
    this.earned = correct / this.questions.length >= 0.8;
    this.ctx.schoolState.recordExam(this.age, correct, this.questions.length);
    // 交卷立即结算学业分与「学神 / 满分卷」成就，结果页背后就能看到横幅
    refreshScore(this.ctx);
    if (this.earned) arpeggio([523.25, 659.25, 783.99, 1046.5]);
    this.phase = 'result';
  }

  render(g: CanvasRenderingContext2D): void {
    this.drawDesk(g);
    if (this.phase === 'answer') this.drawPaper(g);
    else this.drawResult(g);
    // 交卷时可能解锁「学神 / 满分卷」：全屏模态也把成就横幅画出来
    this.ctx.hud.drawAchievements(g);
  }

  // ---------- 桌面背景 ----------
  private drawDesk(g: CanvasRenderingContext2D): void {
    g.fillStyle = '#2a2320';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    // 木纹横线
    g.fillStyle = 'rgba(255,255,255,0.03)';
    for (let y = 20; y < VIEW_H; y += 60) g.fillRect(0, y, VIEW_W, 1);
    // 四周暗角
    const v = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 300, VIEW_W / 2, VIEW_H / 2, 800);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = v;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // ---------- 白色试卷 ----------
  private drawPaper(g: CanvasRenderingContext2D): void {
    // 翻页动画：从书脊（左缘）展开
    const progress = this.flipT > 0 ? 1 - this.flipT / 0.22 : 1;
    const scaleX = Math.sin(progress * (Math.PI / 2));
    g.save();
    g.translate(PAPER.x, 0);
    g.scale(scaleX, 1);
    g.translate(-PAPER.x, 0);

    // 纸影
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(PAPER.x + 10, PAPER.y + 12, PAPER.w, PAPER.h);
    // 纸面
    g.fillStyle = '#fbf7ec';
    g.fillRect(PAPER.x, PAPER.y, PAPER.w, PAPER.h);
    g.strokeStyle = '#d8cfb8';
    g.lineWidth = 2;
    g.strokeRect(PAPER.x + 1, PAPER.y + 1, PAPER.w - 2, PAPER.h - 2);

    this.drawHeader(g);
    this.drawQuestions(g);
    this.drawNextBtn(g);
    g.restore();
  }

  private drawHeader(g: CanvasRenderingContext2D): void {
    g.textBaseline = 'top';
    const cx = PAPER.x + PAPER.w / 2;
    // 标题
    g.font = '28px monospace';
    g.fillStyle = INK;
    g.textAlign = 'center';
    g.fillText(`期末考试 · ${this.level}`, cx, PAPER.y + 24);
    g.textAlign = 'left';
    // 姓名 / 学号
    g.font = '18px monospace';
    g.fillStyle = INK;
    g.fillText(`姓名：${this.name}`, PAPER.x + 40, PAPER.y + 72);
    g.textAlign = 'right';
    g.fillText(`学号：${this.studentNo}`, PAPER.x + PAPER.w - 40, PAPER.y + 72);
    g.textAlign = 'left';
    // 分隔线
    g.strokeStyle = '#d8cfb8';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(PAPER.x + 40, PAPER.y + 104);
    g.lineTo(PAPER.x + PAPER.w - 40, PAPER.y + 104);
    g.stroke();
  }

  private drawQuestions(g: CanvasRenderingContext2D): void {
    const start = this.page * Q_PER_PAGE;
    g.textBaseline = 'top';
    for (let k = 0; k < Q_PER_PAGE && start + k < this.questions.length; k++) {
      const qi = start + k;
      const q = this.questions[qi];
      const blockY = Q_Y0 + k * Q_BLOCK_H;
      // 题干
      g.font = '20px monospace';
      g.fillStyle = INK;
      g.fillText(`${qi + 1}. ${q.q}`, PAPER.x + 40, blockY + 4);
      // 选项
      for (let o = 0; o < 4; o++) {
        const r = this.optionRect(k, o);
        const selected = this.answers[qi] === o;
        g.fillStyle = selected ? '#eaf2fd' : '#ffffff';
        g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = selected ? '#4a90d9' : '#c9c1ae';
        g.lineWidth = selected ? 2 : 1;
        g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        // 选项字母
        g.fillStyle = selected ? '#4a90d9' : '#8a8f98';
        g.font = '16px monospace';
        g.fillText(LABELS[o], r.x + 10, r.y + 11);
        // 选项文字
        g.fillStyle = INK;
        g.font = '17px monospace';
        g.fillText(q.options[o], r.x + 32, r.y + 11);
      }
    }
  }

  private drawNextBtn(g: CanvasRenderingContext2D): void {
    const r = this.nextBtnRect();
    const isLast = this.page >= this.totalPages - 1;
    g.fillStyle = isLast ? ACCENT : BTN_DARK;
    g.fillRect(r.x, r.y, r.w, r.h);
    g.strokeStyle = 'rgba(0,0,0,0.2)';
    g.lineWidth = 1;
    g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    g.font = '22px monospace';
    g.textAlign = 'center';
    g.fillStyle = '#ffffff';
    g.fillText(isLast ? '交卷' : '下一页 ▶', r.x + r.w / 2, r.y + 13);
    g.textAlign = 'left';

    // 页码
    g.font = '15px monospace';
    g.fillStyle = MUTED;
    g.fillText(`第 ${this.page + 1} / ${this.totalPages} 页`, PAPER.x + 40, PAPER.y + PAPER.h - 48);
    // 已答
    const answered = this.answers.filter((a) => a >= 0).length;
    g.textAlign = 'right';
    g.fillText(`已答 ${answered} / ${this.questions.length} 题`, PAPER.x + PAPER.w - 40, PAPER.y + PAPER.h - 48);
    g.textAlign = 'left';
    g.textBaseline = 'middle';
  }

  // ---------- 结果（打分） ----------
  private drawResult(g: CanvasRenderingContext2D): void {
    const total = this.questions.length;
    const pct = Math.round((this.correctCount / total) * 100);
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    const x = 340;
    const y = 170;
    const w = 600;
    const h = 380;
    g.fillStyle = 'rgba(251,247,236,0.98)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = this.earned ? '#e8c85a' : '#c9c1ae';
    g.lineWidth = 3;
    g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);

    g.textBaseline = 'top';
    g.font = '26px monospace';
    g.fillStyle = INK;
    g.textAlign = 'center';
    g.fillText(`${this.name} · 期末考试`, x + w / 2, y + 28);
    g.textAlign = 'left';

    // 红色分数章
    g.font = '56px monospace';
    g.fillStyle = ACCENT;
    g.textAlign = 'center';
    g.fillText(`${this.correctCount} / ${total}`, x + w / 2, y + 80);
    g.textAlign = 'left';

    g.font = '20px monospace';
    g.fillStyle = INK;
    g.textAlign = 'center';
    g.fillText(`正确率 ${pct}%`, x + w / 2, y + 152);
    g.textAlign = 'left';

    if (this.earned) {
      this.drawStar(g, x + w / 2 - 24, y + 196, 48, '#e8b90a');
      g.font = '24px monospace';
      g.fillStyle = '#b8860b';
      g.textAlign = 'center';
      g.fillText('获得「学神」称号 ★', x + w / 2, y + 252);
      g.font = '16px monospace';
      g.fillStyle = MUTED;
      g.fillText('称号维持 2 年', x + w / 2, y + 286);
      g.textAlign = 'left';
    } else {
      g.font = '18px monospace';
      g.fillStyle = MUTED;
      g.textAlign = 'center';
      g.fillText('答对 8 题及以上可获得「学神」称号', x + w / 2, y + 210);
      g.textAlign = 'left';
    }

    g.font = '15px monospace';
    g.fillStyle = MUTED;
    g.textAlign = 'center';
    g.fillText('Enter / 点击 关闭', x + w / 2, y + h - 40);
    g.textAlign = 'left';
    g.textBaseline = 'middle';
  }

  /** 五角星（学神称号用） */
  private drawStar(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
    g.fillStyle = color;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? r : r * 0.45;
      const px = cx + Math.cos(ang) * rad;
      const py = cy + Math.sin(ang) * rad;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
  }
}
