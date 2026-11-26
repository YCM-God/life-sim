// 课堂玩法：坐下触发，6 个节拍 × 7.5 游戏分钟 = 45 分钟
// 事件驱动，不等待；每个节拍玩家必须选一个动作。
import { TILE, VIEW_H, VIEW_W } from '../config';
import type { Input, PointerClick } from '../core/input';
import type { Player } from '../entities/player';
import { drawCharacter } from '../entities/player';
import type { GameContext } from '../context';
import { advanceGameMinutes, gameHour } from '../core/daynight';
import { RESIDENTS } from '../data/residents';
import { ClassroomRoster } from './classroomRoster';
import { clockOf } from '../score/facts';

type Phase = 'choose' | 'noteTarget' | 'rollcall' | 'event' | 'feedback' | 'summary';
type ActionId = 'listen' | 'notes' | 'daydream' | 'sleep' | 'window' | 'note' | 'peek' | 'phone' | 'bag';

interface ClassAction {
  id: ActionId;
  key: string;
  name: string;
  desc: string;
}

interface ClassEvent {
  id: string;
  title: string;
  text: string;
  options: {
    label: string;
    result: string;
    score?: number;
    stamina?: number;
    knowledge?: number;
    favor?: number;
    suspicion?: number;
    neighbor?: number;
    neighborNpc?: string;
  }[];
}

const ACTIONS: ClassAction[] = [
  { id: 'listen', key: '1', name: '认真听讲', desc: '学识 +10 · 体力 −5' },
  { id: 'notes', key: '2', name: '记笔记', desc: '学识 +6 · 笔记 +1' },
  { id: 'daydream', key: '3', name: '走神', desc: '随机灵感 · 有风险' },
  { id: 'sleep', key: '4', name: '睡觉', desc: '体力 +12 · 高风险' },
  { id: 'window', key: '5', name: '看窗外', desc: '观察 +3 · 可能触发事件' },
  { id: 'note', key: '6', name: '传纸条', desc: '提升同学好感 · 有风险' },
  { id: 'peek', key: '7', name: '偷看同桌', desc: '学识 +4 · 同桌会察觉' },
  { id: 'phone', key: '8', name: '看手机', desc: '表现 −3 · 极易被抓' },
  { id: 'bag', key: '9', name: '翻书包', desc: '找铅笔/笔记 · 3 秒' },
];

const NOTE_TARGETS = [
  { name: '同桌 蒋一鸣', npc: 'jym', success: 0.8 },
  { name: '前排 唐晓棠', npc: 'txt', success: 0.6 },
  { name: '后排 张小米', npc: 'zxm', success: 0.5 },
];

const EVENTS: ClassEvent[] = [
  {
    id: 'eraser', title: '借橡皮', text: '同桌把橡皮推到桌角，小声问你借不借。',
    options: [
      { label: '借给他', result: '他把橡皮掰成两半，塞回你半块。', neighbor: 1, neighborNpc: 'jym' },
      { label: '装作没听见', result: '他把手缩回去，整节课没再说话。', neighbor: -1, neighborNpc: 'jym' },
    ],
  },
  {
    id: 'rain', title: '突然下雨', text: '窗外突然下雨，靠窗的同学开始躁动。',
    options: [
      { label: '起身关窗', result: '老师看了你一眼，点了点头。', favor: 1, score: 2 },
      { label: '继续看雨', result: '雨声盖住了板书，你少记了一行。', knowledge: -2 },
    ],
  },
  {
    id: 'chalk', title: '粉笔断了', text: '老师捏断了一根粉笔，问谁去办公室拿一盒。',
    options: [
      { label: '主动去拿', result: '你跑了一趟办公室，回来时错过了半道题。', favor: 1, knowledge: -2 },
      { label: '低头装忙', result: '后排的同学去了，老师夸了他一句。', suspicion: 2 },
    ],
  },
  {
    id: 'quiz', title: '随堂小测', text: '老师突然发下一张十分钟的小测。',
    options: [
      { label: '用笔记认真做', result: '笔记派上了用场。', score: 6, knowledge: 3 },
      { label: '偷看同桌', result: '答案是错的，你们一起错了。', score: -2, suspicion: 8 },
    ],
  },
  {
    id: 'sleepmate', title: '同桌睡着', text: '同桌趴在桌上睡着了，老师正在往这边看。',
    options: [
      { label: '用书挡住他', result: '老师看了一眼，转回黑板。', neighbor: 1, neighborNpc: 'jym', suspicion: 4 },
      { label: '举手报告', result: '老师让他站起来，他瞪了你一眼。', favor: 1, neighbor: -2, neighborNpc: 'jym' },
    ],
  },
  {
    id: 'hungry', title: '肚子叫', text: '你的肚子在安静的教室里叫了一声。',
    options: [
      { label: '偷偷吃零食', result: '包装袋响了，前排回头看了一眼。', stamina: 8, suspicion: 5 },
      { label: '忍着', result: '你盯着黑板，脑子里只剩食堂。', stamina: -4 },
    ],
  },
  {
    id: 'power', title: '投影坏了', text: '投影闪了两下黑屏，教室里响起一阵低低的欢呼。',
    options: [
      { label: '帮老师重启', result: '你捣鼓了两分钟，投影亮了。', favor: 1, score: 2 },
      { label: '和同桌聊天', result: '你们聊了两句，老师咳嗽了一声。', neighbor: 1, neighborNpc: 'jym', suspicion: 6 },
    ],
  },
  {
    id: 'wrong', title: '老师讲错题', text: '老师把一道题的答案写错了，教室里没人说话。',
    options: [
      { label: '举手指出', result: '老师愣了一下，重新算了一遍。', favor: 2, score: 5 },
      { label: '低头记下', result: '你把错误答案抄进了笔记。', knowledge: 1, score: -3 },
    ],
  },
  {
    id: 'phonebuzz', title: '手机震动', text: '书包里的手机震了一下，老师抬起头。',
    options: [
      { label: '按住书包', result: '震动停了，老师没发现。', suspicion: 3 },
      { label: '偷偷看一眼', result: '老师刚好走过来。', suspicion: 20, favor: -1, score: -5 },
    ],
  },
  {
    id: 'faint', title: '同学晕倒', text: '前排的唐晓棠突然趴在桌上，脸色发白。',
    options: [
      { label: '扶她去医务室', result: '你错过了半节课，但她记住了你。', neighbor: 2, neighborNpc: 'txt', knowledge: -3 },
      { label: '喊老师', result: '老师处理了，你继续上课。', favor: 1 },
    ],
  },
];

const T = 32;
const ACT_PANEL = { x: 40, y: 640, w: 1200, h: 56 };
const ACT_COLS = 3;
const ACT_BTN = { w: 124, h: 40, gapX: 6, gapY: 8 };

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function inRect(x: number, y: number, rx: number, ry: number, rw: number, rh: number): boolean {
  return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
}

export class ClassroomSession {
  private ctx: GameContext | null = null;
  private player: Player | null = null;
  private phase: Phase = 'choose';
  private beat = 0; // 0..5
  private elapsed = 0;
  private startMinute = 8 * 60;
  private score = 50;
  private suspicion = 0;
  private notes = 0;
  private listenStreak = 0;
  private listenCount = 0;
  private noteCount = 0;
  private knowledgeGain = 0;
  private staminaGain = 0;
  private neighborFavor = 0;
  private lastAction: ActionId | null = null;
  private teacherNear = false;
  private rollCallDone = false;
  private rollCallPending = false;
  private late = 0;
  private subject = '自习';
  private periodLabel = '自习';
  private eventSeen = new Set<string>();
  private feedbackTitle = '';
  private feedbackText = '';
  private feedbackLines: string[] = [];
  private pendingAction: ActionId | null = null;
  private feedbackKind: 'action' | 'rollcall' | 'event' = 'action';
  private active = false;
  private summaryText = '';
  private seatTx = 18;
  private seatTy = 12;
  private readonly roster = new ClassroomRoster();
  private thought: 'get' | 'lost' = 'lost';

  get isActive(): boolean {
    return this.active;
  }

  start(ctx: GameContext): void {
    this.ctx = ctx;
    this.player = ctx.player;
    this.active = true;
    this.phase = 'choose';
    this.beat = 0;
    this.elapsed = 0;
    this.score = 50;
    this.suspicion = 0;
    this.notes = 0;
    this.listenStreak = 0;
    this.listenCount = 0;
    this.noteCount = 0;
    this.knowledgeGain = 0;
    this.staminaGain = 0;
    this.neighborFavor = 0;
    this.rollCallDone = false;
    this.rollCallPending = false;
    this.eventSeen.clear();
    this.pendingAction = null;
    this.feedbackKind = 'action';
    this.late = 0;
    this.thought = 'lost';

    const m = gameHour() * 60;
    this.startMinute = Math.round(m);
    const periods: [number, number, string][] = [
      [8 * 60, 8 * 60 + 45, '语文'],
      [8 * 60 + 55, 9 * 60 + 40, '数学'],
      [10 * 60, 10 * 60 + 45, '英语'],
      [10 * 60 + 55, 11 * 60 + 40, '科学'],
      [13 * 60 + 30, 14 * 60 + 15, '体育'],
      [14 * 60 + 25, 15 * 60 + 10, '美术'],
      [15 * 60 + 20, 16 * 60 + 5, '自习'],
    ];
    const p = periods.find(([a, b]) => m >= a && m < b);
    this.subject = p ? p[2] : '自习';
    this.periodLabel = p ? p[2] : '自习';
    if (p && m > p[0] + 3) this.late = Math.min(8, Math.ceil(m - p[0]));

    this.seatTx = 18;
    this.seatTy = 12;
    this.roster.reset();
    this.player.placeAtTile(this.seatTx, this.seatTy);
    if (this.late > 0) {
      this.score -= 1;
      this.suspicion += 5;
      this.ctx.hud.toast(`你迟到了 ${this.late} 分钟。`);
    }
  }

  update(dt: number, input: Input): void {
    if (!this.active || !this.ctx) return;
    this.roster.update(dt, this.subject);

    if (this.phase === 'choose') {
      for (let i = 0; i < ACTIONS.length; i++) {
        if (input.wasPressed(`Digit${i + 1}`)) {
          this.chooseAction(ACTIONS[i].id);
          return;
        }
      }
      if (input.wasPressed('KeyI')) this.chooseAction('bag');
      if (input.wasPressed('KeyF')) this.fastForward();
      if (input.wasPressed('Escape')) this.leaveEarly();
      return;
    }

    if (this.phase === 'noteTarget') {
      for (let i = 0; i < NOTE_TARGETS.length; i++) {
        if (input.wasPressed(`Digit${i + 1}`)) {
          this.passNote(i);
          return;
        }
      }
      return;
    }

    if (this.phase === 'rollcall') {
      if (input.wasPressed('Digit1')) this.resolveRollCall('answer');
      else if (input.wasPressed('Digit2')) this.resolveRollCall('bluff');
      else if (input.wasPressed('Digit3')) this.resolveRollCall('silent');
      return;
    }

    if (this.phase === 'event') {
      const ev = this.currentEvent();
      if (!ev) {
        this.phase = 'feedback';
        return;
      }
      if (input.wasPressed('Digit1')) this.resolveEvent(ev, 0);
      else if (input.wasPressed('Digit2')) this.resolveEvent(ev, 1);
      return;
    }

    if (this.phase === 'feedback') {
      if (input.wasPressed('KeyE', 'Enter', 'NumpadEnter', 'Space')) this.advance();
      return;
    }

    if (this.phase === 'summary') {
      if (input.wasPressed('KeyE', 'Enter', 'NumpadEnter', 'Space', 'Escape')) this.finish();
    }
  }

  handleClick(c: PointerClick | null): boolean {
    if (!this.active || !c) return false;
    if (this.phase === 'choose') {
      for (let i = 0; i < ACTIONS.length; i++) {
        const r = this.actionRect(i);
        if (inRect(c.x, c.y, r.x, r.y, r.w, r.h)) {
          this.chooseAction(ACTIONS[i].id);
          return true;
        }
      }
      return true;
    }
    if (this.phase === 'noteTarget') {
      for (let i = 0; i < 3; i++) {
        if (inRect(c.x, c.y, 390, 250 + i * 44, 500, 36)) {
          this.passNote(i);
          return true;
        }
      }
      return true;
    }
    if (this.phase === 'rollcall') {
      for (let i = 0; i < 3; i++) {
        if (inRect(c.x, c.y, 390, 260 + i * 44, 500, 36)) {
          this.resolveRollCall(i === 0 ? 'answer' : i === 1 ? 'bluff' : 'silent');
          return true;
        }
      }
      return true;
    }
    if (this.phase === 'event') {
      const ev = this.currentEvent();
      if (ev) {
        for (let i = 0; i < ev.options.length; i++) {
          if (inRect(c.x, c.y, 390, 260 + i * 48, 500, 40)) {
            this.resolveEvent(ev, i);
            return true;
          }
        }
      }
      return true;
    }
    if (this.phase === 'feedback') {
      this.advance();
      return true;
    }
    if (this.phase === 'summary') {
      this.finish();
      return true;
    }
    return true;
  }

  render(g: CanvasRenderingContext2D, ox: number, oy: number): void {
    if (!this.active || !this.ctx || !this.player) return;
    this.drawClassroom(g, ox, oy);
    this.drawClock(g);
    this.drawInfo(g);

    if (this.phase === 'choose') this.drawActions(g);
    if (this.phase === 'noteTarget') this.drawNoteTargets(g);
    if (this.phase === 'rollcall') this.drawRollCall(g);
    if (this.phase === 'event') this.drawEvent(g);
    if (this.phase === 'feedback') this.drawFeedback(g);
    if (this.phase === 'summary') this.drawSummary(g);
    // 课堂是全屏模态：成就横幅在课堂内也画出来，否则解锁提示会被埋在看不见的 HUD 里
    this.ctx.hud.drawAchievements(g);
  }

  // ---------- actions ----------

  private chooseAction(id: ActionId): void {
    this.lastAction = id;
    if (id === 'note') {
      this.phase = 'noteTarget';
      return;
    }
    this.resolveAction(id);
  }

  private resolveAction(id: ActionId): void {
    if (!this.ctx || !this.player) return;
    const ctx = this.ctx;
    const p = this.player;
    let caught = false;
    let detection = 0;
    let title = '';
    let text = '';
    const lines: string[] = [];

    switch (id) {
      case 'listen': {
        this.listenCount++;
        this.listenStreak++;
        this.noteCount = 0;
        const gain = this.listenCount <= 2 ? 10 : this.listenCount === 3 ? 6 : 3;
        const efficiency = p.stamina < 20 ? 0.7 : 1;
        this.knowledgeGain += Math.round(gain * efficiency);
        this.score += 8;
        this.applyStamina(-5);
        this.notes += 0;
        title = '认真听讲';
        text = '你把注意力放回黑板。';
        this.thought = 'get';
        if (this.listenCount === 3) text += ' 老师讲得有点快，你开始跟不上。';
        break;
      }
      case 'notes': {
        this.noteCount++;
        this.listenStreak = 0;
        this.notes++;
        this.knowledgeGain += this.noteCount <= 2 ? 6 : 2;
        this.score += 5;
        this.applyStamina(-3);
        title = '记笔记';
        text = '你低头抄下板书。';
        this.thought = 'get';
        break;
      }
      case 'daydream': {
        this.listenStreak = 0;
        this.noteCount = 0;
        this.score -= 2;
        this.applyStamina(-1);
        detection = 15 + this.suspicion * 0.2;
        title = '走神';
        text = '你的目光飘到了窗外。';
        this.thought = 'lost';
        break;
      }
      case 'sleep': {
        this.listenStreak = 0;
        this.noteCount = 0;
        this.score -= 5;
        this.applyStamina(12);
        detection = 35 + (this.teacherNear ? 15 : 0) + (this.suspicion * 0.2);
        title = '睡觉';
        text = '你趴在桌上，眼皮沉了下去。';
        this.thought = 'lost';
        break;
      }
      case 'window': {
        this.listenStreak = 0;
        this.noteCount = 0;
        this.score += 1;
        this.knowledgeGain += 3;
        this.applyStamina(-1);
        detection = 10 + (this.teacherNear ? 10 : 0) + this.suspicion * 0.1;
        title = '看窗外';
        text = '你看见操场上有人跑过。';
        this.thought = 'get';
        break;
      }
      case 'peek': {
        this.listenStreak = 0;
        this.noteCount = 0;
        this.score += 1;
        this.knowledgeGain += 4;
        this.applyStamina(-1);
        detection = 12 + this.suspicion * 0.15;
        title = '偷看同桌';
        text = '你斜眼瞄到了同桌的答案。';
        this.thought = 'get';
        if (Math.random() < 0.4) {
          this.addNeighbor('jym', 1);
          lines.push('蒋一鸣发现了，笑了一下。');
        }
        break;
      }
      case 'phone': {
        this.listenStreak = 0;
        this.noteCount = 0;
        this.score -= 3;
        detection = 45 + (this.teacherNear ? 15 : 0);
        title = '看手机';
        text = '你把手伸进桌洞。';
        this.thought = 'lost';
        break;
      }
      case 'bag': {
        this.listenStreak = 0;
        this.noteCount = 0;
        detection = 30 + (this.teacherNear ? 10 : 0);
        title = '翻书包';
        text = '你在书包里摸铅笔。';
        this.thought = 'lost';
        break;
      }
    }

    caught = Math.random() * 100 < detection;
    if (caught) {
      this.suspicion = clamp(this.suspicion + 12, 0, 100);
      this.score -= 3;
      this.addFavor(id === 'phone' ? -2 : -1);
      this.feedbackTitle = `${title} · 被发现了`;
      this.feedbackText = this.teacherCatchLine(id);
      this.feedbackLines = lines;
      this.thought = 'lost';
    } else {
      this.feedbackTitle = title;
      this.feedbackText = text;
      this.feedbackLines = lines;
    }

    this.score = clamp(this.score, 0, 100);
    if (this.beat === 2 && !this.rollCallDone) this.rollCallPending = true;
    this.phase = 'feedback';
    this.feedbackKind = 'action';
    this.lastAction = id;
    if (id === 'sleep') this.roster.react('sleep');
    if (id === 'peek') this.roster.react('talk');
    if (id === 'listen' || id === 'notes') this.teacherNear = false;
  }

  private teacherCatchLine(id: ActionId): string {
    if (id === 'sleep') return '老师敲了敲你的桌子：“站起来，醒醒。”';
    if (id === 'phone') return '老师伸出手：“手机拿来，放学再找我。”';
    if (id === 'note') return '老师捡起纸团：“这是谁的？”';
    if (id === 'peek') return '老师：“看自己的卷子。”';
    if (id === 'bag') return '老师：“书包里有什么，这么好玩？”';
    return '老师看了你一眼：“注意力集中。”';
  }

  private passNote(index: number): void {
    const target = NOTE_TARGETS[index];
    if (!target) return;
    const success = Math.random() < target.success;
    if (success) {
      this.addNeighbor(target.npc, 1);
      this.score += 1;
      this.feedbackTitle = `传纸条 → ${target.name}`;
      this.feedbackText = '纸团落在他桌上，他展开后笑了。';
      this.feedbackLines = [`${target.name} 好感 +1`];
    } else {
      this.addNeighbor(target.npc, -1);
      this.suspicion = clamp(this.suspicion + 8, 0, 100);
      this.score -= 2;
      this.feedbackTitle = '传纸条 · 被发现';
      this.feedbackText = '老师抬头时，纸团正停在半空。';
      this.feedbackLines = [`${target.name} 好感 −1`];
    }
    this.thought = 'lost';
    this.roster.react('note');
    if (this.beat === 2 && !this.rollCallDone) this.rollCallPending = true;
    this.phase = 'feedback';
    this.feedbackKind = 'action';
    this.lastAction = 'note';
  }

  // ---------- roll call / events ----------

  private triggerRollCall(): void {
    this.phase = 'rollcall';
    this.rollCallDone = true;
  }

  private resolveRollCall(choice: 'answer' | 'bluff' | 'silent'): void {
    const base = 35 + (this.lastAction === 'listen' ? 25 : 0) + (this.lastAction === 'notes' ? 15 : this.notes * 5);
    const chance = clamp(base - (this.player && this.player.stamina < 20 ? 15 : 0), 5, 95);
    if (choice === 'silent') {
      this.score -= 5;
      this.suspicion += 10;
      this.feedbackTitle = '点名 · 沉默';
      this.feedbackText = '你站起来，一句话也没说。';
    } else if (choice === 'bluff') {
      const success = Math.random() < 0.3;
      this.feedbackTitle = '点名 · 胡编';
      if (success) {
        this.score += 4;
        this.feedbackText = '你随口编了一个答案，老师居然点了点头。';
      } else {
        this.score -= 4;
        this.suspicion += 15;
        this.feedbackText = '老师皱了皱眉：“坐下，听别人说。”';
      }
    } else {
      const success = Math.random() * 100 < chance;
      this.feedbackTitle = '点名 · 回答';
      if (success) {
        this.score += 8;
        this.feedbackText = '你答对了，老师在你的名字后面画了个勾。';
        this.thought = 'get';
        this.addFavor(1);
      } else {
        this.score -= 3;
        this.suspicion += 10;
        this.feedbackText = '你卡住了，教室里有人笑了一声。';
        this.thought = 'lost';
      }
    }
    this.score = clamp(this.score, 0, 100);
    this.phase = 'feedback';
    this.feedbackKind = 'rollcall';
  }

  private currentEvent(): ClassEvent | null {
    return this.pendingEvent;
  }

  private pendingEvent: ClassEvent | null = null;

  private maybeEvent(): boolean {
    if (this.beat === 0 || this.beat === 5) return false;
    if (Math.random() > 0.55) return false;
    const pool = EVENTS.filter((e) => !this.eventSeen.has(e.id));
    if (pool.length === 0) return false;
    const ev = pool[(Math.random() * pool.length) | 0];
    this.eventSeen.add(ev.id);
    this.pendingEvent = ev;
    this.phase = 'event';
    return true;
  }

  private resolveEvent(ev: ClassEvent, index: number): void {
    const opt = ev.options[index];
    if (!opt) return;
    if (opt.score) this.score += opt.score;
    if (opt.stamina) this.applyStamina(opt.stamina);
    if (opt.knowledge) this.knowledgeGain += opt.knowledge;
    if (opt.favor) this.addFavor(opt.favor);
    if (opt.suspicion) this.suspicion = clamp(this.suspicion + opt.suspicion, 0, 100);
    if (opt.neighbor) this.addNeighbor(opt.neighborNpc ?? 'jym', opt.neighbor);
    this.score = clamp(this.score, 0, 100);
    this.feedbackTitle = ev.title;
    this.feedbackText = opt.result;
    this.feedbackLines = [];
    this.pendingEvent = null;
    this.phase = 'feedback';
    this.feedbackKind = 'event';
  }

  // ---------- time / finish ----------

  private advance(): void {
    if (!this.active) return;
    if (this.feedbackKind === 'action') {
      if (this.rollCallPending) {
        this.rollCallPending = false;
        this.triggerRollCall();
        return;
      }
      if (this.maybeEvent()) return;
    }
    this.nextBeat();
  }

  private nextBeat(): void {
    this.beat++;
    this.elapsed += 7.5;
    advanceGameMinutes(7.5);
    this.teacherNear = this.beat === 2 || this.beat === 4;
    this.feedbackKind = 'action';

    if (this.beat >= 6) {
      this.buildSummary();
      this.phase = 'summary';
      return;
    }
    this.phase = 'choose';
  }

  private summaryLines: string[] = [];

  private buildSummary(): void {
    if (!this.player || !this.ctx) return;
    const knowledge = Math.round(this.knowledgeGain * 0.35);
    this.player.knowledge = Math.min(100, this.player.knowledge + knowledge);
    this.ctx.schoolState.recordClass(this.subject, this.score, this.notes, this.late > 0);
    this.ctx.schoolState.setFriends(this.neighborFavor);
    this.summaryLines = [
      `学识 +${knowledge} · 表现 ${this.score}`,
      `笔记 ${this.notes} · 老师好感 ${this.teacherFavor()}`,
      `同桌好感 ${this.neighborFavor} · 怀疑 ${Math.round(this.suspicion)}`,
    ];
    this.summaryText = this.summaryLines.join(' · ');
    // 人生分：上完一节课（早退走 leaveEarly()，不在这里，因此不计分）
    const ctx = this.ctx;
    if (ctx?.score) {
      ctx.score.emit(
        { type: 'class', subject: this.subject, score: this.score, late: this.late > 0 },
        clockOf(ctx),
      );
    }
  }

  private finish(): void {
    this.active = false;
    this.phase = 'choose';
    this.ctx?.hud.toast('下课了。');
  }

  private fastForward(): void {
    if (!this.active || !this.player) return;
    const remaining = Math.max(0, 6 - this.beat);
    if (remaining <= 0) return;
    this.listenCount += remaining;
    this.knowledgeGain += remaining * 8;
    this.score = clamp(this.score + remaining * 4, 0, 100);
    this.applyStamina(-3 * remaining);
    this.beat = 6;
    this.elapsed = 45;
    advanceGameMinutes(remaining * 7.5);
    this.buildSummary();
    this.phase = 'summary';
  }

  private leaveEarly(): void {
    if (!this.active) return;
    this.score = clamp(this.score - 5, 0, 100);
    this.addFavor(-1);
    this.ctx?.schoolState.recordClass(this.subject, this.score, this.notes, true);
    this.ctx?.schoolState.setFriends(this.neighborFavor);
    const remain = Math.max(0, 45 - this.elapsed);
    advanceGameMinutes(remain);
    this.elapsed = 45;
    this.active = false;
    this.phase = 'choose';
    this.ctx?.hud.toast('你提前离开了教室。');
  }

  // ---------- helpers ----------

  private applyStamina(delta: number): void {
    if (!this.player) return;
    const cap = this.player.staminaCap();
    this.player.stamina = Math.max(0, Math.min(cap, this.player.stamina + delta));
    this.staminaGain += delta;
  }

  private addFavor(delta: number): void {
    const r = this.ctx?.overworld.residents.list.find((x) => x.def.id === 'lxy');
    if (r) r.affinity = clamp(r.affinity + delta, 0, 5);
  }

  private teacherFavor(): number {
    const r = this.ctx?.overworld.residents.list.find((x) => x.def.id === 'lxy');
    return r?.affinity ?? 0;
  }

  private addNeighbor(npc: string, delta: number): void {
    const r = this.ctx?.overworld.residents.list.find((x) => x.def.id === npc);
    if (!r) return;
    r.affinity = clamp(r.affinity + delta, 0, 5);
    this.neighborFavor = clamp(this.neighborFavor + delta, 0, 5);
  }

  // ---------- drawing ----------

  private drawClassroom(g: CanvasRenderingContext2D, ox: number, oy: number): void {
    // 黑板
    g.fillStyle = 'rgba(20,38,30,0.95)';
    g.fillRect(320, 32, 640, 64);
    g.strokeStyle = '#6a5a3a';
    g.lineWidth = 4;
    g.strokeRect(320, 32, 640, 64);
    g.font = '14px monospace';
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillStyle = '#dfe8d8';
    g.fillText(`${this.subject} · 第${Math.min(6, this.beat + 1)}节`, 340, 42);
    const lines = ['一、定义与例题', '二、练习：第 3 题', '三、下课前提问'];
    for (let i = 0; i < 3; i++) {
      g.fillStyle = i < this.listenCount + this.notes ? '#dfe8d8' : 'rgba(223,232,216,0.22)';
      g.fillText(lines[i], 340, 58 + i * 12);
    }

    // 老师
    g.save();
    g.translate(640, 120);
    drawCharacter(g, 0, 0, 'down', 0, { shirt: '#5a6470', pants: '#3a3f4a', hair: '#2a2018', longHair: true }, false);
    g.restore();

    // 30 个座位与同学
    this.roster.render(g, ox, oy);

    // 玩家头顶的听懂/没听懂
    const px = ox + this.seatTx * TILE + TILE / 2;
    const py = oy + this.seatTy * TILE - 8;
    g.font = '12px monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const label = this.thought === 'get' ? '✓ 懂了' : '? 没懂';
    const w = g.measureText(label).width;
    g.fillStyle = 'rgba(10,12,16,0.8)';
    g.fillRect(px - w / 2 - 8, py - 10, w + 16, 20);
    g.fillStyle = this.thought === 'get' ? '#7fd18a' : '#e8c85a';
    g.fillText(label, px, py);
    g.textAlign = 'left';
    g.textBaseline = 'top';
  }

  private drawClock(g: CanvasRenderingContext2D): void {
    const x = 980;
    const y = 16;
    const w = 280;
    const h = 40;
    g.fillStyle = 'rgba(14,16,22,0.88)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#3a3f4a';
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    g.font = '16px monospace';
    g.textBaseline = 'top';
    g.fillStyle = '#e8e8e8';
    const total = Math.min(45, Math.round(this.elapsed));
    const current = this.startMinute + total;
    const hh = Math.floor(current / 60) % 24;
    const mm = current % 60;
    g.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, x + 16, y + 12);
    g.font = '12px monospace';
    g.fillStyle = '#8a8f98';
    g.fillText(`第 ${Math.min(6, this.beat + 1)} / 6 拍 · 剩 ${45 - total} 分`, x + 134, y + 15);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i < this.beat ? '#7fd18a' : i === this.beat ? '#e8c85a' : '#3a3f4a';
      g.fillRect(x + 16 + i * 24, y + 30, 16, 4);
    }
  }

  private drawInfo(g: CanvasRenderingContext2D): void {
    g.fillStyle = 'rgba(14,16,22,0.88)';
    g.fillRect(16, 16, 300, 64);
    g.strokeStyle = '#3a3f4a';
    g.lineWidth = 1;
    g.strokeRect(16.5, 16.5, 299, 63);
    g.font = '14px monospace';
    g.textBaseline = 'top';
    g.fillStyle = '#e8c85a';
    g.fillText(`学校 · ${this.subject}`, 28, 28);
    g.font = '12px monospace';
    g.fillStyle = '#c8cdd5';
    g.fillText(`表现 ${this.score} · 笔记 ${this.notes} · 怀疑 ${Math.round(this.suspicion)}`, 28, 50);
    g.fillStyle = this.thought === 'get' ? '#7fd18a' : '#e8c85a';
    g.fillText(this.thought === 'get' ? '听懂' : '没听懂', 248, 50);
  }

  private actionRect(i: number): { x: number; y: number; w: number; h: number } {
    return {
      x: ACT_PANEL.x + 8 + i * (ACT_BTN.w + ACT_BTN.gapX),
      y: ACT_PANEL.y + 10,
      w: ACT_BTN.w,
      h: ACT_BTN.h,
    };
  }

  private drawActions(g: CanvasRenderingContext2D): void {
    g.fillStyle = 'rgba(14,16,22,0.92)';
    g.fillRect(ACT_PANEL.x, ACT_PANEL.y, ACT_PANEL.w, ACT_PANEL.h);
    g.strokeStyle = '#3a3f4a';
    g.lineWidth = 1;
    g.strokeRect(ACT_PANEL.x + 0.5, ACT_PANEL.y + 0.5, ACT_PANEL.w - 1, ACT_PANEL.h - 1);
    g.font = '13px monospace';
    g.textBaseline = 'middle';
    ACTIONS.forEach((a, i) => {
      const r = this.actionRect(i);
      g.fillStyle = '#2a2e36';
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = '#3a3f4a';
      g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      g.fillStyle = '#e8e8e8';
      g.fillText(`${a.key} ${a.name}`, r.x + 8, r.y + 20);
    });
    g.textBaseline = 'top';
  }

  private drawNoteTargets(g: CanvasRenderingContext2D): void {
    this.drawModal(g, '传纸条给谁？');
    g.font = '14px monospace';
    g.textBaseline = 'top';
    NOTE_TARGETS.forEach((t, i) => {
      g.fillStyle = '#2a2e36';
      g.fillRect(390, 250 + i * 44, 500, 36);
      g.fillStyle = '#e8e8e8';
      g.fillText(`${i + 1}. ${t.name}  ·  成功率 ${Math.round(t.success * 100)}%`, 406, 260 + i * 44);
    });
  }

  private drawRollCall(g: CanvasRenderingContext2D): void {
    this.drawModal(g, '老师点名了');
    g.font = '13px monospace';
    g.fillStyle = '#c8cdd5';
    g.fillText('“这道题，你来说说看。”', 406, 226);
    const opts = ['1. 认真回答', '2. 胡编一个', '3. 沉默'];
    g.font = '14px monospace';
    opts.forEach((o, i) => {
      g.fillStyle = '#2a2e36';
      g.fillRect(390, 260 + i * 44, 500, 36);
      g.fillStyle = '#e8e8e8';
      g.fillText(o, 406, 270 + i * 44);
    });
  }

  private drawEvent(g: CanvasRenderingContext2D): void {
    const ev = this.currentEvent();
    if (!ev) return;
    this.drawModal(g, ev.title);
    g.font = '13px monospace';
    g.fillStyle = '#c8cdd5';
    g.fillText(ev.text, 406, 226);
    g.font = '14px monospace';
    ev.options.forEach((o, i) => {
      g.fillStyle = '#2a2e36';
      g.fillRect(390, 260 + i * 48, 500, 40);
      g.fillStyle = '#e8e8e8';
      g.fillText(`${i + 1}. ${o.label}`, 406, 272 + i * 48);
    });
  }

  private drawFeedback(g: CanvasRenderingContext2D): void {
    this.drawModal(g, this.feedbackTitle);
    g.font = '13px monospace';
    g.fillStyle = '#c8cdd5';
    g.fillText(this.feedbackText, 406, 226);
    this.feedbackLines.forEach((line, i) => {
      g.fillStyle = '#8a8f98';
      g.fillText(line, 406, 250 + i * 20);
    });
    g.fillStyle = '#e8c85a';
    g.fillText('E / 点击继续', 406, 350);
  }

  private drawSummary(g: CanvasRenderingContext2D): void {
    this.drawModal(g, '下课了');
    g.font = '14px monospace';
    g.fillStyle = '#c8cdd5';
    this.summaryLines.forEach((line, i) => g.fillText(line, 406, 240 + i * 24));
    g.fillStyle = '#8a8f98';
    g.fillText('E / 点击关闭', 406, 330);
  }

  private drawModal(g: CanvasRenderingContext2D, title: string): void {
    g.fillStyle = 'rgba(0,0,0,0.58)';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    g.fillStyle = 'rgba(14,16,22,0.96)';
    g.fillRect(360, 190, 560, 280);
    g.strokeStyle = '#e8c85a';
    g.lineWidth = 2;
    g.strokeRect(361, 191, 558, 278);
    g.font = '20px monospace';
    g.textBaseline = 'top';
    g.fillStyle = '#e8c85a';
    g.fillText(title, 406, 206);
  }
}
