// 30 人课堂名册与学生行为渲染
import { TILE } from '../config';
import { drawCharacter } from '../entities/player';
import type { Appearance } from '../entities/player';
import { NAMED_CLASSMATES, PLAYER_SEAT, SEAT_COLS, SEAT_ROWS } from '../data/classmates';
import type { ClassmateDef, SeatCol, SeatRow, StudentState } from '../data/classmates';

interface Student {
  seatRow: SeatRow;
  seatCol: SeatCol;
  named?: ClassmateDef;
  look: Appearance;
  state: StudentState;
  timer: number;
  isPlayer: boolean;
}

const BG_SHIRTS = ['#8a9ab0', '#7a9a5a', '#d07a4a', '#b8663c', '#6a7a8a', '#9a8a6a', '#5a7a6a', '#8a6a5a'];
const BG_HAIR = ['#1a1814', '#2a2018', '#3a2a1c', '#4a3020', '#6e5a4a', '#2a1a1c'];
const BG_SCALES = [0.92, 1, 1.06];

function pick<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length];
}

export class ClassroomRoster {
  readonly students: Student[] = [];
  private frame = 0;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.students.length = 0;
    let bg = 0;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 6; col++) {
        const isPlayer = row === PLAYER_SEAT.row && col === PLAYER_SEAT.col;
        const named = NAMED_CLASSMATES.find((c) => c.row === row && c.col === col);
        if (isPlayer) {
          this.students.push({
            seatRow: row as SeatRow,
            seatCol: col as SeatCol,
            isPlayer: true,
            look: { shirt: '#3a6ea5', pants: '#2b2f6e', hair: '#1a1814', longHair: false },
            state: 'listen',
            timer: 20,
          });
          continue;
        }
        if (named) {
          this.students.push({
            seatRow: row as SeatRow,
            seatCol: col as SeatCol,
            named,
            isPlayer: false,
            look: named.look,
            state: named.state ?? 'listen',
            timer: 15 + Math.random() * 25 + bg * 0.4,
          });
          bg++;
          continue;
        }
        const scale = pick(BG_SCALES, bg);
        this.students.push({
          seatRow: row as SeatRow,
          seatCol: col as SeatCol,
          isPlayer: false,
          look: {
            shirt: pick(BG_SHIRTS, bg),
            pants: bg % 2 ? '#3a3f4a' : '#4a4f5a',
            hair: pick(BG_HAIR, bg),
            longHair: bg % 3 === 0,
          },
          state: bg % 5 === 0 ? 'daydream' : bg % 7 === 0 ? 'sleep' : 'listen',
          timer: 15 + Math.random() * 25 + bg * 0.7,
        });
        bg++;
        void scale;
      }
    }
  }

  update(dt: number, subject: string): void {
    // 30 个计时器很便宜；切换判定按 5 人/帧分摊
    this.frame = (this.frame + 1) % 6;
    for (let i = 0; i < this.students.length; i++) {
      const s = this.students[i];
      if (s.isPlayer) continue;
      s.timer -= dt;
      if (s.timer > 0) continue;
      if (i % 6 !== this.frame) continue;
      s.timer = 15 + Math.random() * 25;
      s.state = this.nextState(s.state, subject);
    }
  }

  private nextState(cur: StudentState, subject: string): StudentState {
    const sleepBoost = subject === '语文' ? 0.1 : 0;
    const listenBoost = subject === '数学' ? 0.1 : 0;
    const r = Math.random();
    if (cur === 'sleep') return r < 0.8 ? 'sleep' : r < 0.95 ? 'listen' : 'daydream';
    if (cur === 'talk') return r < 0.7 ? 'listen' : r < 0.85 ? 'talk' : 'hand';
    if (cur === 'hand') return r < 0.9 ? 'listen' : 'daydream';
    if (cur === 'daydream') return r < 0.55 + listenBoost ? 'listen' : r < 0.8 ? 'daydream' : r < 0.9 ? 'talk' : 'sleep';
    return r < 0.5 + listenBoost ? 'listen' : r < 0.7 ? 'daydream' : r < 0.85 ? 'talk' : r < 0.9 + sleepBoost ? 'sleep' : 'hand';
  }

  /** 玩家动作影响周围学生 */
  react(kind: 'sleep' | 'note' | 'hand' | 'talk'): void {
    if (kind === 'sleep') {
      const d = this.students.find((s) => s.seatRow === PLAYER_SEAT.row && s.seatCol === PLAYER_SEAT.col - 1);
      if (d && Math.random() < 0.3) d.state = 'talk';
    }
    if (kind === 'note') {
      const t = this.students.find((s) => s.named && s.seatRow === 2 && s.seatCol === 4);
      if (t) t.state = 'talk';
    }
    if (kind === 'hand') {
      const t = this.students.find((s) => s.named && s.seatRow === 0);
      if (t) t.state = 'hand';
    }
    if (kind === 'talk') {
      const t = this.students.find((s) => s.named && s.seatRow === 2 && s.seatCol === 4);
      if (t) t.state = 'talk';
    }
  }

  render(g: CanvasRenderingContext2D, ox: number, oy: number): void {
    for (const s of this.students) {
      const x = SEAT_COLS[s.seatCol] * TILE + ox;
      const y = SEAT_ROWS[s.seatRow] * TILE + oy;
      this.drawDeskBack(g, x, y);
      if (!s.isPlayer) {
        g.save();
        g.translate(x + 46, y + 30);
        g.scale(1.35, 1.35);
        const facing = s.state === 'daydream' ? 'left' : s.state === 'talk' ? 'right' : 'down';
        drawCharacter(g, 0, 0, facing, 0, s.look, false);
        g.restore();
        this.drawState(g, s, x, y);
      } else {
        this.drawPlayerSeatHint(g, x, y);
      }
      this.drawDeskFront(g, x, y);
    }
  }

  private drawDeskBack(g: CanvasRenderingContext2D, x: number, y: number): void {
    g.fillStyle = '#6a5a3a';
    g.fillRect(x + 28, y + 56, 72, 12);
  }

  private drawDeskFront(g: CanvasRenderingContext2D, x: number, y: number): void {
    g.fillStyle = '#8a6f55';
    g.fillRect(x + 16, y + 64, 96, 26);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(x + 16, y + 64, 96, 3);
    g.fillStyle = '#5a4632';
    g.fillRect(x + 22, y + 84, 4, 10);
    g.fillRect(x + 102, y + 84, 4, 10);
  }

  private drawPlayerSeatHint(g: CanvasRenderingContext2D, x: number, y: number): void {
    g.strokeStyle = 'rgba(232,200,90,0.55)';
    g.lineWidth = 1.5;
    g.strokeRect(x + 18, y + 62, 92, 30);
  }

  private drawState(g: CanvasRenderingContext2D, s: Student, x: number, y: number): void {
    const cx = x + 64;
    if (s.state === 'sleep') {
      g.font = '12px monospace';
      g.fillStyle = '#9fb8e8';
      g.fillText('Z', cx + 18, y + 26);
      g.fillText('Z', cx + 26, y + 16);
    } else if (s.state === 'daydream') {
      this.bubble(g, cx + 20, y + 18, '?');
    } else if (s.state === 'talk') {
      this.bubble(g, cx + 18, y + 18, '…');
    } else if (s.state === 'hand') {
      g.fillStyle = s.look.shirt;
      g.fillRect(cx + 4, y + 8, 5, 20);
      g.fillStyle = '#e8b88a';
      g.fillRect(cx + 3, y + 4, 7, 6);
    } else {
      // 听讲：轻微点头
      const nod = Math.sin(performance.now() / 900 + s.seatCol) > 0.8 ? 1 : 0;
      g.fillStyle = 'rgba(0,0,0,0.15)';
      g.fillRect(cx - 10, y + 34 + nod, 20, 2);
    }
  }

  private bubble(g: CanvasRenderingContext2D, x: number, y: number, text: string): void {
    g.fillStyle = 'rgba(14,16,22,0.8)';
    g.fillRect(x - 6, y - 10, 18, 16);
    g.strokeStyle = 'rgba(232,232,232,0.3)';
    g.lineWidth = 1;
    g.strokeRect(x - 5.5, y - 9.5, 17, 15);
    g.font = '11px monospace';
    g.fillStyle = '#e8c85a';
    g.fillText(text, x, y - 8);
  }
}
