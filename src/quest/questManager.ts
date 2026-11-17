// 任务系统运行时：发现、接取、推进、交付、失效、任务链、日程窗口与地图标记
// 设计约束：同时最多 3 个进行中；日常不进日志/不上地图；主线不硬失败
import { absGameHour, dayOfAbsHour, gameDayIndex, gameHour } from '../core/daynight';
import type { GameContext } from '../context';
import type { Resident } from '../entities/resident';
import { RESIDENTS } from '../data/residents';
import { CHAIN_QUESTS, DAILY_QUESTS, PLACES, QUESTS, QUESTS_BY_ID } from './data';
import type { Objective, QuestDef, QuestRuntime, QuestStatus } from './types';
import type { YearEvent } from '../core/yearReport';
import { minimapPos } from '../map/minimap';
import { bigMapScreenPos } from '../map/bigmap';
import type { World } from '../map/world';
import { TILE, VIEW_H } from '../config';
import { PANEL_X } from '../ui/attrPanel';
import { DISEASES } from '../core/health';

const MAX_ACTIVE = 3;
const MAX_MARKERS = 3;
const MONEY_CAP = 30;
const HEART_CAP = 3;
const NPC_HEART_CAP = 4; // 任务最多把好感推到 4 心；4→5 必须靠交心/秘密/链终
const DAILY_COOLDOWN = 5;
const RETRY_COOLDOWN = 3;

function hourInWindow(h: number, from: number, to: number): boolean {
  if (from <= to) return h >= from && h < to;
  return h >= from || h < to;
}

function fmtHour(h: number): string {
  const n = Math.floor(h) % 24;
  return `${String(n).padStart(2, '0')}:00`;
}

function npcName(id: string | undefined): string {
  if (!id) return '某人';
  return RESIDENTS.find((r) => r.id === id)?.name ?? id;
}

/** §3.1：timeLimitDays 收敛到整数 0..7，越界/非整数时警告但不阻断 */
function clampDays(v: number): number {
  const n = Math.round(v);
  if (n !== v || n < 0 || n > 7) console.warn(`[quest] timeLimitDays 越界/非整数: ${v} → ${Math.min(7, Math.max(0, n))}`);
  return Math.min(7, Math.max(0, n));
}

/** §3.1：deadlineHour 收敛到整数 6..23（避开 gameHour 的午夜段 24..30） */
function clampHour(v: number): number {
  const n = Math.round(v);
  if (n !== v || n < 6 || n > 23) console.warn(`[quest] deadlineHour 越界/非整数: ${v} → ${Math.min(23, Math.max(6, n))}`);
  return Math.min(23, Math.max(6, n));
}

/** §3.1：warnHours 收敛到 (0,12]，无警告（每帧调用） */
function clampWarn(v: number): number {
  return Math.min(12, Math.max(0.1, v));
}

/** §3.2：wait 目标的最大等待天数 */
function waitMaxDays(def: QuestDef): number {
  let m = 0;
  for (const o of def.objectives) if (o.kind === 'wait' && o.days > m) m = o.days;
  return m;
}

/** §3.2：tier 默认时限天数（main 5 / side 2 / daily 0），含 wait 目标抬升（R-3-05） */
export function defaultTimeLimitDays(def: QuestDef): number {
  const tierDefault = def.tier === 'main' ? 5 : def.tier === 'side' ? 2 : 0;
  const wm = waitMaxDays(def);
  return wm > 0 ? Math.max(tierDefault, wm + 1) : tierDefault;
}

/** §4.1：交付人唯一解析函数：turnIn ?? giver */
export function turnInNpc(def: QuestDef): string | undefined {
  return def.turnIn ?? def.giver;
}

// R-4-03 开发期自检：所有任务的交付人必须可解析（现有 120 条应全为 0 缺失）
const missingTurnIn = QUESTS.filter((d) => turnInNpc(d) === undefined);
if (missingTurnIn.length > 0) {
  console.warn('[quest] 交付人缺失的任务:', missingTurnIn.map((d) => d.id).join(', '));
}

export interface TurnInOption {
  def: QuestDef;
  choiceIndex?: number;
  label: string;
}

export interface MapMarker {
  questId: string;
  tx: number;
  ty: number;
  color: string;
  label: string;
  kind: 'npc' | 'place';
  urgency: 'ready' | 'urgent' | 'active';
  priority: number;
}

export class QuestManager {
  private ctx: GameContext | null = null;
  private readonly runtimes = new Map<string, QuestRuntime>();
  private readonly discovered = new Set<string>();
  private readonly discoveredAt = new Map<string, number>();
  private readonly active: string[] = [];
  private readonly completed = new Set<string>();
  private readonly cooldown = new Map<string, number>();
  private readonly journal: { age: number; day: number; text: string }[] = [];
  private readonly yearEvents: YearEvent[] = [];
  private readonly tags = new Set<string>();
  private readonly inventory = new Map<string, number>();
  private readonly storyNotified = new Set<string>();

  private lastDay = -1;
  private moneyToday = 0;
  private heartsToday = 0;
  private readonly npcHearts = new Map<string, number>();
  private questsToday = 0;
  private lastRandomDay = -1;

  bind(ctx: GameContext): void {
    this.ctx = ctx;
    this.lastDay = -1;
    // 创建角色前 player.stats 为空，不能按“年龄”发现任务；等角色就位后首帧再初始化
    if (ctx.player.stats) {
      this.lastDay = gameDayIndex();
      this.onNewDay(this.lastDay, true);
    }
  }

  // ---------- 查询与发现 ----------

  def(id: string): QuestDef | undefined {
    return QUESTS_BY_ID[id];
  }

  runtime(id: string): QuestRuntime | undefined {
    return this.runtimes.get(id);
  }

  private ensure(def: QuestDef): QuestRuntime {
    let rt = this.runtimes.get(def.id);
    if (!rt) {
      rt = {
        def,
        status: 'available',
        progress: def.objectives.map(() => 0),
        visited: new Set<string>(),
        acceptedDay: -1,
        deadlineDay: 999999,
        deadlineAbsHour: undefined,
        warnStage: 0,
        expiredLogged: false,
        repeatCount: 0,
        readyAnnounced: false,
        completedDay: -1,
      };
      this.runtimes.set(def.id, rt);
    }
    return rt;
  }

  private isEligible(def: QuestDef): boolean {
    const ctx = this.ctx;
    if (!ctx || !ctx.player.stats) return false;
    const day = gameDayIndex();
    const hour = gameHour();
    const rt = this.runtimes.get(def.id);
    if (rt) {
      if (rt.status === 'active' || rt.status === 'ready') return false;
      if (rt.status === 'completed') {
        if (!def.repeat) return false;
        if (day - rt.completedDay < (def.repeat === 'daily' ? DAILY_COOLDOWN : 7)) return false;
      }
      if (rt.status === 'failed' || rt.status === 'expired') {
        if (day - rt.completedDay < RETRY_COOLDOWN) return false;
      }
    }
    if ((this.cooldown.get(def.id) ?? -1) > day) return false;

    const p = def.prereq;
    if (p) {
      if (p.minAge !== undefined && ctx.player.age < p.minAge) return false;
      if (p.maxAge !== undefined && ctx.player.age > p.maxAge) return false;
      if (p.affinity) {
        const r = this.listResidents().find((x) => x.def.id === p.affinity!.npc);
        if (!r || r.affinity < p.affinity.min) return false;
      }
      if (p.done && !this.completed.has(p.done)) return false;
      if (p.weather === 'rain' && !ctx.weather.isRainy()) return false;
      if (p.weather === 'clear' && ctx.weather.isRainy()) return false;
      if (p.hourFrom !== undefined && p.hourTo !== undefined && !hourInWindow(hour, p.hourFrom, p.hourTo)) return false;
    }
    if (def.window && !hourInWindow(hour, def.window.from, def.window.to)) return false;
    // 学校时段不派发会与上课冲突的限时任务；放学/周末再出现
    if (def.type === 'timed' && ctx.schoolState.isSchoolTime() && def.window) {
      if (def.window.from < 16.05 && def.window.to > 8) return false;
    }
    if (def.chain) {
      const prev = CHAIN_QUESTS.find((q) => q.chain?.id === def.chain!.id && q.chain.ring === def.chain!.ring - 1);
      if (prev && !this.completed.has(prev.id)) return false;
    }
    return true;
  }

  /** NPC 当前可给的委托（不看是否已在公告栏发现；聊到就能接） */
  offersForNpc(npcId: string): QuestDef[] {
    if (this.questsToday >= 3) return []; // 一天做满三件，街坊不再给你派活
    return QUESTS
      .filter((d) => d.giver === npcId)
      .filter((d) => d.source === 'npc' || d.source === 'story' || !!d.chain)
      .filter((d) => this.isEligible(d))
      .sort((a, b) => {
        const rank = (q: QuestDef) => (q.chain ? 0 : q.tier === 'main' ? 1 : 2);
        return rank(a) - rank(b);
      })
      .slice(0, 2);
  }

  /** NPC 处可以交差的任务；选择类拆成多个选项 */
  turnInOptionsForNpc(npcId: string): TurnInOption[] {
    const out: TurnInOption[] = [];
    for (const id of this.active) {
      const rt = this.runtimes.get(id);
      if (!rt || rt.status !== 'ready' || turnInNpc(rt.def) !== npcId) continue;
      if (this.deadlinePassed(rt)) continue;
      if (rt.def.choices && rt.def.choices.length > 0) {
        rt.def.choices.forEach((c, i) => out.push({ def: rt.def, choiceIndex: i, label: `交差：${rt.def.name}（${c.label}）` }));
      } else {
        out.push({ def: rt.def, label: `交差：${rt.def.name}` });
      }
    }
    return out;
  }

  npcBadge(npcId: string): 'offer' | 'turnin' | null {
    if (this.turnInOptionsForNpc(npcId).length > 0) return 'turnin';
    if (this.offersForNpc(npcId).length > 0) return 'offer';
    return null;
  }

  /** 任务目标 NPC 优先：多人同处时，E 先选中能交差/有委托的人 */
  nearestTarget(px: number, py: number, maxDist = 56): Resident | null {
    let best: Resident | null = null;
    let bestScore = Infinity;
    for (const r of this.listResidents()) {
      const badge = this.npcBadge(r.def.id);
      const isTarget = this.active.some((id) => {
        const rt = this.runtimes.get(id);
        if (!rt || rt.status !== 'active') return false;
        const i = this.currentIndex(rt);
        if (i < 0) return false;
        const o = rt.def.objectives[i];
        return o.kind === 'talk' && o.npc === r.def.id;
      });
      if (!badge && !isTarget) continue;
      const d = r.distTo(px, py);
      if (d >= maxDist) continue;
      const score = d + (badge === 'turnin' ? -30 : isTarget ? -20 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = r;
      }
    }
    return best;
  }

  activeRuntimes(): QuestRuntime[] {
    return this.active
      .map((id) => this.runtimes.get(id))
      .filter((rt): rt is QuestRuntime => !!rt)
      .sort((a, b) => (a.status === 'ready' ? 0 : 1) - (b.status === 'ready' ? 0 : 1));
  }

  availableDefs(): QuestDef[] {
    const list = [...this.discovered]
      .map((id) => QUESTS_BY_ID[id])
      .filter((d): d is QuestDef => !!d && this.isEligible(d));
    const rank = (q: QuestDef) => (q.tier === 'main' ? 0 : q.chain ? 1 : q.tier === 'side' ? 2 : 3);
    return list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }

  journalLines(): { age: number; day: number; text: string }[] {
    return [...this.journal];
  }

  inventoryCount(item: string): number {
    return this.inventory.get(item) ?? 0;
  }

  hasTag(tag: string): boolean {
    return this.tags.has(tag);
  }

  consumeYearEvents(): YearEvent[] {
    return this.yearEvents.splice(0, this.yearEvents.length);
  }

  // ---------- 每日刷新与发现 ----------

  private onNewDay(day: number, first = false): void {
    this.moneyToday = 0;
    this.heartsToday = 0;
    this.npcHearts.clear();
    this.questsToday = 0;

    // 过期的日常纸条约：只保留一天，避免“可接”列表越滚越长
    for (const [id, at] of [...this.discoveredAt]) {
      const def = QUESTS_BY_ID[id];
      const rt = this.runtimes.get(id);
      if (!def || !rt) continue;
      if (def.tier === 'daily' && rt.status === 'available' && day - at > 1) {
        this.discovered.delete(id);
        this.discoveredAt.delete(id);
      }
    }

    this.discoverStory(day);
    this.discoverChain(day);

    // 公告栏 / 手机 / 学校 / 街边：每天最多新增 4 条
    const pool = DAILY_QUESTS.filter((d) => !this.discovered.has(d.id) && this.isEligible(d));
    let added = 0;
    for (const d of pool) {
      if (added >= 4) break;
      if (Math.random() < 0.72) {
        this.discover(d.id, false);
        added++;
      }
    }
    if (added > 0 && this.ctx) {
      this.ctx.hud.toast(first ? '公告栏和手机上有几件可以顺手做的事。' : '新的一天，公告栏和手机里又有了新的事。');
    }
  }

  private discoverStory(day: number): void {
    void day;
    // 主线同一时间只放出一条：完成后再出现下一章
    const hasOpenMain = [...this.discovered].some((id) => {
      const d = QUESTS_BY_ID[id];
      const rt = this.runtimes.get(id);
      return d?.tier === 'main' && rt?.status !== 'completed';
    });
    if (hasOpenMain) return;
    const pool = QUESTS
      .filter((d) => d.tier === 'main' && !this.completed.has(d.id) && !this.discovered.has(d.id) && this.isEligible(d))
      .sort((a, b) => (a.prereq?.minAge ?? 0) - (b.prereq?.minAge ?? 0));
    const next = pool[0];
    if (!next) return;
    this.discover(next.id, false);
    if (!this.storyNotified.has(next.id)) {
      this.storyNotified.add(next.id);
      this.ctx?.hud.toast(`你收到一封信：${next.name}`);
    }
  }

  private discoverChain(day: number): void {
    void day;
    for (const def of CHAIN_QUESTS) {
      if (this.discovered.has(def.id) || this.completed.has(def.id)) continue;
      if (!this.isEligible(def)) continue;
      this.discover(def.id, false);
      this.ctx?.hud.toast(`新的线索：${def.name}`);
    }
  }

  private discover(id: string, toast = true): void {
    if (this.discovered.has(id)) return;
    this.discovered.add(id);
    this.discoveredAt.set(id, gameDayIndex());
    if (toast) {
      const def = QUESTS_BY_ID[id];
      if (def) this.ctx?.hud.toast(`接到线索：${def.name}`);
    }
  }

  discoverAll(): void {
    for (const def of QUESTS) {
      this.discovered.add(def.id);
      this.discoveredAt.set(def.id, gameDayIndex());
    }
    this.ctx?.hud.toast('调试：已显示全部任务。');
  }

  onRegionChange(region: string): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const day = gameDayIndex();
    if (this.lastRandomDay === day) return;
    if (Math.random() > 0.06) return;
    const pool = QUESTS.filter((d) => d.source === 'random' && !this.discovered.has(d.id) && this.isEligible(d));
    if (pool.length === 0) return;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    this.lastRandomDay = day;
    this.discover(picked.id, false);
    ctx.hud.toast(`在${region}，你碰上了一件小事：${picked.name}`);
  }

  // ---------- 接取与推进 ----------

  accept(id: string, fromNpc: boolean): { ok: boolean; text: string } {
    const ctx = this.ctx;
    if (!ctx) return { ok: false, text: '任务系统还没准备好。' };
    const def = QUESTS_BY_ID[id];
    if (!def) return { ok: false, text: '没有这个任务。' };
    if (this.active.length >= MAX_ACTIVE) {
      return { ok: false, text: `你手上已经有 ${MAX_ACTIVE} 件事了。先做完一件，再接新的。` };
    }
    if (this.questsToday >= 3) {
      return { ok: false, text: '今天已经跑了三件事了，歇歇吧。明天再说。' };
    }
    if (this.active.includes(id)) return { ok: false, text: '这件事已经在你的备忘里了。' };
    if (!this.isEligible(def)) return { ok: false, text: '现在还不是接这件事的时候。' };
    if (this.isPhysical(def) && this.badlyIll()) {
      return { ok: false, text: '你现在病得厉害，先把身子养好。跑腿的事改天再说。' };
    }

    const rt = this.ensure(def);
    rt.status = 'active';
    rt.progress = def.objectives.map(() => 0);
    rt.visited.clear();
    rt.acceptedDay = gameDayIndex();
    rt.readyAnnounced = false;

    // §3.3：接取时的截止计算（唯一时间标尺 absGameHour）
    const nowAbs = absGameHour();
    const day = gameDayIndex();
    let deadlineAbs: number | undefined;
    if (def.noDeadline) {
      deadlineAbs = undefined;
    } else if (def.deadlineHour !== undefined && def.timeLimitDays === undefined) {
      const H = clampHour(def.deadlineHour);
      deadlineAbs = day * 24 + H;
      if (deadlineAbs <= nowAbs) deadlineAbs += 24;
    } else {
      const N = def.timeLimitDays !== undefined
        ? clampDays(def.timeLimitDays)
        : defaultTimeLimitDays(def);
      if (def.deadlineHour === undefined) {
        deadlineAbs = (day + N + 1) * 24 + 6;
      } else {
        const H = clampHour(def.deadlineHour);
        deadlineAbs = (day + N) * 24 + H;
        if (deadlineAbs <= nowAbs) deadlineAbs += 24;
      }
    }

    rt.deadlineAbsHour = deadlineAbs;
    rt.deadlineDay = deadlineAbs === undefined
      ? 999999
      : (def.deadlineHour === undefined ? dayOfAbsHour(deadlineAbs) - 1 : dayOfAbsHour(deadlineAbs));
    rt.deadlineHour = deadlineAbs === undefined ? undefined : (def.deadlineHour !== undefined ? clampHour(def.deadlineHour) : undefined);
    rt.warnStage = 0;
    rt.expiredLogged = false;

    this.active.push(id);
    this.discovered.add(id);
    this.discoveredAt.set(id, gameDayIndex());

    // 从 NPC 处接下、且第一步就是和他说话：这句话已经说过了
    const first = def.objectives[0];
    if (fromNpc && first.kind === 'talk' && first.npc === def.giver) rt.progress[0] = 1;

    ctx.hud.toast(`接下：${def.name}`);
    return { ok: true, text: this.acceptText(rt) };
  }

  private acceptText(rt: QuestRuntime): string {
    const def = rt.def;
    const lines = [`【委托】${def.name}`, def.desc, ''];
    for (const o of def.objectives) lines.push(`· ${o.hint}`);
    lines.push(`截止：${this.deadlineText(rt)}`);
    const tn = turnInNpc(def);
    const win = this.windowText(tn);
    lines.push(`交付：${tn ? npcName(tn) : '—（自动完成）'}${win ? ` · ${win}` : ''}`);
    const reward = this.rewardText(def);
    if (reward) lines.push(`奖励：${reward}`);
    lines.push('（Q 打开人生备忘录）');
    return lines.join('\n');
  }

  rewardText(def: QuestDef): string {
    const parts: string[] = [];
    if (def.reward.money) parts.push(`${def.reward.money} 元`);
    if (def.reward.affinity) parts.push(`好感 +${def.reward.affinity}`);
    if (def.reward.item) parts.push(`物品「${def.reward.item}」`);
    if (def.reward.tag) parts.push('一段回忆');
    if (def.choices) parts.push('一个选择');
    return parts.join(' · ');
  }

  /** 对话打开时推进“和某人说话”目标 */
  onTalk(npcId: string): string[] {
    const lines: string[] = [];
    for (const id of this.active) {
      const rt = this.runtimes.get(id);
      if (!rt || rt.status !== 'active') continue;
      const idx = this.currentIndex(rt);
      if (idx < 0) continue;
      const obj = rt.def.objectives[idx];
      if (obj.kind === 'talk' && obj.npc === npcId) {
        rt.progress[idx] = 1;
        lines.push(`（任务推进：${rt.def.name}）`);
      }
    }
    return lines;
  }

  turnIn(id: string, choiceIndex?: number): { ok: boolean; text: string } {
    const rt = this.runtimes.get(id);
    if (!rt) return { ok: false, text: '没有这个任务。' };
    if (this.deadlinePassed(rt)) {
      this.expire(rt);
      return { ok: false, text: '已经过了约定时间。' };
    }
    if (rt.status !== 'ready') return { ok: false, text: '这件事还没做完。' };
    if (rt.def.choices && rt.def.choices.length > 0 && choiceIndex === undefined) {
      return { ok: false, text: '这件事需要一个选择。' };
    }
    // §4.2：交付人门禁（场景 → NPC 存在 → 距离 ≤56）
    const tn = turnInNpc(rt.def);
    if (tn) {
      const tnName = npcName(tn);
      const ctx = this.ctx;
      if (!ctx || ctx.scenes.current !== ctx.overworld) {
        return { ok: false, text: `要当面交给${tnName}。` };
      }
      const r = this.resident(tn);
      if (!r) {
        return { ok: false, text: `找不到${tnName}。` };
      }
      const px = ctx.player.x + ctx.player.w / 2;
      const py = ctx.player.y + ctx.player.h / 2;
      if (r.distTo(px, py) > 56) {
        return { ok: false, text: `离${tnName}太远了，走近一点。` };
      }
    }
    return { ok: true, text: this.complete(rt, choiceIndex) };
  }

  /** 住院快进：任务期限随住院天数顺延，避免“住院期间任务过期” */
  shiftActiveDeadlines(days: number): void {
    for (const id of this.active) {
      const rt = this.runtimes.get(id);
      if (!rt) continue;
      rt.acceptedDay += days;
      if (rt.deadlineDay !== 999999) rt.deadlineDay += days;
      if (rt.deadlineAbsHour !== undefined) rt.deadlineAbsHour += days * 24;
    }
  }

  abandon(id: string): boolean {
    const idx = this.active.indexOf(id);
    if (idx < 0) return false;
    const rt = this.runtimes.get(id);
    if (!rt) return false;
    this.active.splice(idx, 1);
    rt.status = 'available';
    rt.readyAnnounced = false;
    rt.completedDay = gameDayIndex();
    this.cooldown.set(id, gameDayIndex() + 1);
    this.ctx?.hud.toast(`先放下了：${rt.def.name}`);
    return true;
  }

  update(): void {
    const ctx = this.ctx;
    if (!ctx || !ctx.player.stats) return;
    const day = gameDayIndex();
    if (this.lastDay < 0) {
      this.lastDay = day;
      this.onNewDay(day, true);
      return;
    }
    if (day !== this.lastDay) {
      this.lastDay = day;
      this.onNewDay(day);
    }
    const nowAbs = absGameHour();

    for (const id of [...this.active]) {
      const rt = this.runtimes.get(id);
      if (!rt || (rt.status !== 'active' && rt.status !== 'ready')) continue;

      if (rt.status === 'active') this.progressPassive(rt, day);
      if (this.deadlinePassed(rt, nowAbs)) {
        this.expire(rt);
        continue;
      }
      this.warnDeadline(rt, nowAbs);
      if (rt.status === 'active' && this.allDone(rt)) {
        rt.status = 'ready';
        const tn = turnInNpc(rt.def);
        if (!tn) {
          this.complete(rt);
        } else if (!rt.readyAnnounced) {
          rt.readyAnnounced = true;
          ctx.hud.toast(`可以去找${npcName(tn)}交差了：${rt.def.name}`);
        }
      }
    }
  }

  private progressPassive(rt: QuestRuntime, day: number): void {
    const idx = this.currentIndex(rt);
    if (idx < 0) return;
    const obj = rt.def.objectives[idx];
    if (obj.kind === 'wait') {
      rt.progress[idx] = Math.min(obj.days, Math.max(0, day - rt.acceptedDay));
      return;
    }
    if (obj.kind === 'visit') {
      if (rt.progress[idx] >= 1) return;
      if (this.nearPlace(obj.place)) {
        rt.progress[idx] = 1;
        const place = PLACES[obj.place];
        this.ctx?.hud.toast(`到了：${place?.name ?? obj.place}`);
      }
      return;
    }
    if (obj.kind === 'collect') {
      for (const key of obj.places) {
        const visitKey = `${idx}:${key}`;
        if (rt.visited.has(visitKey)) continue;
        if (!this.nearPlace(key)) continue;
        rt.visited.add(visitKey);
        rt.progress[idx] = obj.places.filter((p) => rt.visited.has(`${idx}:${p}`)).length;
        const place = PLACES[key];
        this.ctx?.hud.toast(`找到了：${place?.name ?? key}（${rt.progress[idx]}/${obj.places.length}）`);
      }
    }
  }

  private nearPlace(key: string): boolean {
    const ctx = this.ctx;
    if (!ctx) return false;
    const p = PLACES[key];
    if (!p) return false;
    const c = ctx.player.centerTile();
    return Math.hypot(c.tx - p.tx, c.ty - p.ty) <= (p.r ?? 2);
  }

  /** §3.4：到期判定唯一函数；恰好到点算超时（>=），对 active 与 ready 都生效 */
  private deadlinePassed(rt: QuestRuntime, nowAbs = absGameHour()): boolean {
    return rt.deadlineAbsHour !== undefined && nowAbs >= rt.deadlineAbsHour;
  }

  /** §3.6：临期两档提示，按档位单调递增、每档只发一次 */
  private warnDeadline(rt: QuestRuntime, nowAbs: number): void {
    if (rt.deadlineAbsHour === undefined) return;
    const rem = rt.deadlineAbsHour - nowAbs;
    if (rem <= 0) return;
    const warnAt = clampWarn(rt.def.warnHours ?? 2);
    if (rt.warnStage < 2 && rem <= 0.5) {
      rt.warnStage = 2;
      this.ctx?.hud.toast(`⚠ ${rt.def.name}：只剩最后半小时。`);
    } else if (rt.warnStage < 1 && rem <= warnAt) {
      rt.warnStage = 1;
      this.ctx?.hud.toast(`⏳ ${rt.def.name}：快到时间了。`);
    }
  }

  /** §3.7：超时状态机（main → available / soft·repeat·daily → available / 其它 → expired） */
  private expire(rt: QuestRuntime): void {
    const ctx = this.ctx;
    const idx = this.active.indexOf(rt.def.id);
    if (idx >= 0) this.active.splice(idx, 1);
    rt.completedDay = gameDayIndex();
    rt.readyAnnounced = false;
    rt.warnStage = 0;

    if (rt.def.tier === 'main') {
      rt.status = 'available';
      this.discovered.add(rt.def.id);
      this.logExpiry(rt);
      ctx?.hud.toast('这件事先放一放。以后还有机会。');
      return;
    }
    if (rt.def.softDeadline || rt.def.repeat || rt.def.tier === 'daily') {
      rt.status = 'available';
      this.cooldown.set(rt.def.id, gameDayIndex() + RETRY_COOLDOWN);
      this.logExpiry(rt);
      ctx?.hud.toast(`错过了时间：${rt.def.name}。过几天还能再试。`);
      return;
    }
    rt.status = 'expired';
    this.logExpiry(rt);
    ctx?.hud.toast(`这件事没做成：${rt.def.name}`);
  }

  /** §3.7 R-3-17：超时记账幂等；日常不写日志/年度事件 */
  private logExpiry(rt: QuestRuntime): void {
    if (rt.expiredLogged) return;
    rt.expiredLogged = true;
    if (rt.def.tier !== 'daily') {
      const text = rt.def.failLog ?? `${rt.def.name}，我没赶上时间。`;
      this.pushJournal(text);
      this.yearEvents.push({ text, valence: -1, importance: 2 });
    }
  }

  private complete(rt: QuestRuntime, choiceIndex?: number): string {
    const ctx = this.ctx;
    const def = rt.def;
    const day = gameDayIndex();
    const idx = this.active.indexOf(def.id);
    if (idx >= 0) this.active.splice(idx, 1);
    rt.status = 'completed';
    rt.completedDay = day;
    this.completed.add(def.id);

    const choice = def.choices && def.choices.length > 0
      ? def.choices[Math.max(0, Math.min(def.choices.length - 1, choiceIndex ?? 0))]
      : undefined;

    // 金钱：重复任务衰减；每天最多 30 元任务收入
    let paid = 0;
    const base = def.reward.money ?? 0;
    if (base > 0) {
      const decay = rt.repeatCount === 0 ? 1 : rt.repeatCount === 1 ? 0.5 : 0.25;
      const want = Math.round(base * decay);
      paid = Math.max(0, Math.min(want, MONEY_CAP - this.moneyToday));
      this.moneyToday += paid;
      if (ctx) ctx.player.money += paid;
    }

    // 好感：任务最多推到 4 心；每天全城 3 心；同一 NPC 每天 1 心
    const baseTarget = turnInNpc(def);
    if (def.reward.affinity && baseTarget) this.applyAffinity(baseTarget, def.reward.affinity);
    if (choice?.affinity) this.applyAffinity(choice.affinity.npc, choice.affinity.delta, true);

    if (def.reward.item) {
      this.inventory.set(def.reward.item, (this.inventory.get(def.reward.item) ?? 0) + 1);
    }
    if (def.reward.tag) this.tags.add(def.reward.tag);
    if (choice?.tag) this.tags.add(choice.tag);

    const log = choice?.log ?? def.reward.log;
    // 日常是“顺手的事”：不写人生日志、不进年度事件，只留一句当场的话
    if (def.tier !== 'daily') {
      this.pushJournal(log);
      this.yearEvents.push({ text: log, valence: 1, importance: 2 });
    }
    rt.repeatCount += 1;
    rt.readyAnnounced = false;
    this.questsToday += 1;

    // 主线：立即放出下一章；任务链：解锁下一环
    if (def.tier === 'main') this.discoverStory(day);
    if (def.chain) {
      const next = CHAIN_QUESTS.find(
        (q) => q.chain?.id === def.chain!.id && q.chain.ring === def.chain!.ring + 1,
      );
      if (next) {
        this.discover(next.id, false);
        ctx?.hud.toast(`任务链推进：${next.name}`);
      }
    }

    ctx?.hud.toast(def.tier === 'daily'
      ? `顺手做完了：${def.name}`
      : `完成：${def.name}${paid > 0 ? `（+${paid} 元）` : ''}`);
    const parts: string[] = [];
    if (paid > 0) parts.push(`+${paid} 元`);
    if (def.reward.affinity) parts.push(`好感 +${def.reward.affinity}`);
    if (def.reward.item) parts.push(`获得「${def.reward.item}」`);
    if (choice) parts.push(`选择：${choice.label}`);
    const speaker = npcName(turnInNpc(def));
    const quote = def.turnInLine ? `\n${speaker}：「${def.turnInLine}」` : '';
    return `【完成】${def.name}${quote}\n${log}${parts.length ? `\n（${parts.join(' · ')}）` : ''}`;
  }

  private applyAffinity(npc: string, delta: number, bypassDaily = false): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const r = this.listResidents().find((x) => x.def.id === npc);
    if (!r) return;
    if (delta > 0) {
      if (!bypassDaily) {
        if (this.heartsToday >= HEART_CAP) return;
        if ((this.npcHearts.get(npc) ?? 0) >= 1) return;
        if (r.affinity >= NPC_HEART_CAP) return;
      }
      r.affinity = Math.min(5, r.affinity + Math.min(1, delta));
      this.heartsToday += 1;
      this.npcHearts.set(npc, (this.npcHearts.get(npc) ?? 0) + 1);
    } else if (delta < 0) {
      r.affinity = Math.max(1, r.affinity + delta);
    }
  }

  private pushJournal(text: string): void {
    const age = this.ctx?.player.age ?? 6;
    this.journal.push({ age, day: gameDayIndex(), text: `${age}岁那年，${text}` });
  }

  // ---------- 目标工具 ----------

  private required(obj: Objective): number {
    if (obj.kind === 'collect') return obj.places.length;
    if (obj.kind === 'wait') return obj.days;
    return 1;
  }

  currentIndex(rt: QuestRuntime): number {
    for (let i = 0; i < rt.def.objectives.length; i++) {
      if ((rt.progress[i] ?? 0) < this.required(rt.def.objectives[i])) return i;
    }
    return -1;
  }

  private allDone(rt: QuestRuntime): boolean {
    return this.currentIndex(rt) < 0;
  }

  objectiveLines(rt: QuestRuntime): { text: string; done: boolean }[] {
    return rt.def.objectives.map((o, i) => {
      const req = this.required(o);
      const done = (rt.progress[i] ?? 0) >= req;
      let text = o.hint;
      if (rt.def.tier !== 'daily') {
        if (o.kind === 'collect') text += `（${rt.progress[i] ?? 0}/${req}）`;
        if (o.kind === 'wait') text += `（${rt.progress[i] ?? 0}/${req} 天）`;
      }
      return { text, done };
    });
  }

  currentHint(rt: QuestRuntime): string {
    const tn = turnInNpc(rt.def);
    if (rt.status === 'ready') return tn ? `去找${npcName(tn)}交差` : '可以收尾了';
    const i = this.currentIndex(rt);
    if (i < 0) return '可以收尾了';
    const o = rt.def.objectives[i];
    if (o.kind === 'talk') {
      const r = this.resident(o.npc);
      const c = this.ctx?.player.centerTile();
      if (r && c) {
        const far = Math.hypot(c.tx - (r.x + 12) / TILE, c.ty - (r.y + 14) / TILE) > 6;
        if (far) return `${o.hint}（${npcName(o.npc)}${this.windowText(o.npc)}）`;
      }
    }
    return o.hint;
  }

  /** §3.9：面板「目标 · 截止」文案（精确串） */
  deadlineText(rt: QuestRuntime): string {
    const rem = rt.deadlineAbsHour === undefined ? null : rt.deadlineAbsHour - absGameHour();
    if (rem !== null && rem <= 0) return '已超时';
    const today = gameDayIndex();
    let base: string;
    if (rt.deadlineAbsHour === undefined) {
      base = '无时限';
    } else if (rt.deadlineHour !== undefined) {
      base = rt.deadlineDay === today
        ? `今天 ${fmtHour(rt.deadlineHour)} 前`
        : `还剩 ${rt.deadlineDay - today} 天（${fmtHour(rt.deadlineHour)} 前）`;
    } else {
      base = rt.deadlineDay === today
        ? (gameHour() < 24 ? '明早 06:00 前到期' : '今天 06:00 前')
        : `还剩 ${rt.deadlineDay - today} 天`;
    }
    if (rem !== null && rem > 0) {
      const warnAt = clampWarn(rt.def.warnHours ?? 2);
      if (rem <= 0.5) base += ' · 最后半小时';
      else if (rem <= warnAt) base += ' · 快到期了';
    }
    return base;
  }

  /** §7.3：供自动化验证断言剩余小时/档位 */
  deadlineInfo(rt: QuestRuntime): {
    hasDeadline: boolean;
    remainingHours: number | null;
    deadlineDay: number;
    deadlineHour?: number;
    warnStage: 0 | 1 | 2;
    text: string;
  } {
    const hasDeadline = rt.deadlineAbsHour !== undefined;
    return {
      hasDeadline,
      remainingHours: hasDeadline ? rt.deadlineAbsHour! - absGameHour() : null,
      deadlineDay: rt.deadlineDay,
      deadlineHour: rt.deadlineHour,
      warnStage: rt.warnStage,
      text: this.deadlineText(rt),
    };
  }

  /** §6.2：「可接」页的时限行文案（未接取，按 def 推算） */
  limitText(def: QuestDef): string {
    if (def.noDeadline) return '无时限';
    if (def.deadlineHour !== undefined) {
      const N = def.timeLimitDays !== undefined ? clampDays(def.timeLimitDays) : 0;
      return N <= 0 ? `当天 ${fmtHour(clampHour(def.deadlineHour))} 前` : `${N} 天内（${fmtHour(clampHour(def.deadlineHour))} 前）`;
    }
    const N = def.timeLimitDays !== undefined ? clampDays(def.timeLimitDays) : defaultTimeLimitDays(def);
    return N <= 0 ? '当天（明早 06:00 前）' : `${N} 天`;
  }

  /** 给玩家看的 NPC 日程窗口 */
  windowText(npcId: string | undefined): string {
    const ctx = this.ctx;
    if (!ctx || !npcId) return '';
    const r = this.listResidents().find((x) => x.def.id === npcId);
    const def = r?.def ?? RESIDENTS.find((x) => x.id === npcId);
    if (!def) return '';
    const hour = gameHour();
    const segs = def.schedule;
    const cur = segs.find((s) => hourInWindow(hour, s.from, s.to));
    const regionOf = (x: number, y: number) => ctx.world.regionAt(x, y)?.name ?? '城里';
    if (cur) return `现在在${regionOf(cur.x, cur.y)}`;
    let best = segs[0];
    let bestGap = 99;
    for (const s of segs) {
      const gap = (s.from - hour + 24) % 24;
      if (gap < bestGap) {
        bestGap = gap;
        best = s;
      }
    }
    return `约 ${fmtHour(best.from)}–${fmtHour(best.to)} 在${regionOf(best.x, best.y)}`;
  }

  // ---------- 地图与 HUD ----------

  /** §5.4：单任务标记解析（R-5-04 顺序固定），面板/追踪条也消费它 */
  markerFor(rt: QuestRuntime): MapMarker | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    let tx = 0;
    let ty = 0;
    let label = rt.def.name;
    let kind: 'npc' | 'place' = 'place';
    let urgency: 'ready' | 'urgent' | 'active';
    let color: string;

    if (rt.status === 'ready') {
      const tn = turnInNpc(rt.def);
      if (!tn) return null;
      const r = this.resident(tn);
      if (!r) return null;
      tx = (r.x + 12) / TILE;
      ty = (r.y + 14) / TILE;
      label = `${npcName(tn)} · 交差`;
      kind = 'npc';
      urgency = 'ready';
      color = '#7fd18a';
    } else {
      const i = this.currentIndex(rt);
      if (i < 0) return null;
      const o = rt.def.objectives[i];
      if (o.kind === 'talk') {
        const r = this.resident(o.npc);
        if (!r) return null;
        tx = (r.x + 12) / TILE;
        ty = (r.y + 14) / TILE;
        label = npcName(o.npc);
        kind = 'npc';
      } else if (o.kind === 'visit') {
        const p = PLACES[o.place];
        if (!p) return null;
        tx = p.tx;
        ty = p.ty;
        label = p.name;
        kind = 'place';
      } else if (o.kind === 'collect') {
        const key = o.places.find((k) => !rt.visited.has(`${i}:${k}`));
        const p = key ? PLACES[key] : undefined;
        if (!p) return null;
        tx = p.tx;
        ty = p.ty;
        label = p.name;
        kind = 'place';
      } else if (o.kind === 'wait') {
        const tn = turnInNpc(rt.def);
        if (!tn) return null;
        const r = this.resident(tn);
        if (!r) return null;
        tx = (r.x + 12) / TILE;
        ty = (r.y + 14) / TILE;
        const remainingDays = o.days - (rt.progress[i] ?? 0);
        label = `${npcName(tn)} · 等${remainingDays}天`;
        kind = 'npc';
      } else {
        return null;
      }
      const warnAt = clampWarn(rt.def.warnHours ?? 2);
      const rem = rt.deadlineAbsHour === undefined ? Infinity : rt.deadlineAbsHour - absGameHour();
      if (rem <= warnAt) {
        urgency = 'urgent';
        color = '#c96a5a';
      } else {
        urgency = 'active';
        color = '#ffd166';
      }
    }

    const priority = urgency === 'ready' ? 3 : urgency === 'urgent' ? 2 : 1;
    return { questId: rt.def.id, tx, ty, color, label, kind, urgency, priority };
  }

  private listResidents(): Resident[] {
    return this.ctx?.overworld.residents.list ?? [];
  }

  private resident(npcId: string): Resident | undefined {
    return this.listResidents().find((r) => r.def.id === npcId);
  }

  /** §5.1：标记唯一数据源（已排序、已去重、已截断，长度 ≤ 3） */
  markers(): MapMarker[] {
    const list: MapMarker[] = [];
    for (const rt of this.activeRuntimes()) {
      const m = this.markerFor(rt);
      if (m) list.push(m);
    }
    const byKey = new Map<string, MapMarker>();
    for (const m of list) {
      const key = `${Math.round(m.tx)}:${Math.round(m.ty)}`;
      const cur = byKey.get(key);
      if (!cur || this.betterMarker(m, cur)) byKey.set(key, m);
    }
    const merged = [...byKey.values()];
    merged.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const da = this.deadlineAbsOf(a);
      const db = this.deadlineAbsOf(b);
      if (da !== db) return da - db;
      return a.questId.localeCompare(b.questId);
    });
    return merged.slice(0, MAX_MARKERS);
  }

  /** §5.6：世界内标记屏幕坐标（公开，供测试断言） */
  markerScreen(m: MapMarker, camX: number, camY: number): { x: number; y: number; onScreen: boolean } {
    const x = m.tx * TILE + 16 - camX;
    const y = m.ty * TILE + 12 - camY;
    const onScreen = x >= 0 && x < PANEL_X && y >= 0 && y < VIEW_H;
    return { x, y, onScreen };
  }

  private deadlineAbsOf(m: MapMarker): number {
    return this.runtimes.get(m.questId)?.deadlineAbsHour ?? Infinity;
  }

  /** §5.5 R-5-14：同点去重保留优先级最高者 */
  private betterMarker(m: MapMarker, cur: MapMarker): boolean {
    if (m.priority !== cur.priority) return m.priority > cur.priority;
    const dm = this.deadlineAbsOf(m);
    const dc = this.deadlineAbsOf(cur);
    if (dm !== dc) return dm < dc;
    return m.questId < cur.questId;
  }

  /** §5.3：三处一致的形状（NPC 菱形 / 地点正方形） */
  private drawMarkerShape(g: CanvasRenderingContext2D, m: MapMarker, x: number, y: number, size: number, strokeW: number): void {
    g.save();
    g.translate(x, y);
    if (m.kind === 'npc') g.rotate(Math.PI / 4);
    const half = size / 2;
    g.fillStyle = m.color;
    g.fillRect(-half, -half, size, size);
    g.strokeStyle = 'rgba(10,12,16,0.9)';
    g.lineWidth = strokeW;
    g.strokeRect(-half, -half, size, size);
    g.restore();
  }

  /** §5.6 R-5-18：视口外改画边缘箭头 */
  private drawEdgeArrow(g: CanvasRenderingContext2D, m: MapMarker, x: number, y: number): void {
    const left = 16, right = PANEL_X - 16, top = 16, bottom = VIEW_H - 16;
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const dx = x - cx;
    const dy = y - cy;
    if (dx === 0 && dy === 0) return;
    const ts: number[] = [];
    if (dx !== 0) ts.push((left - cx) / dx, (right - cx) / dx);
    if (dy !== 0) ts.push((top - cy) / dy, (bottom - cy) / dy);
    const valid = ts.filter((v) => v > 0);
    if (valid.length === 0) return;
    const t = Math.min(...valid);
    const ex = cx + dx * t;
    const ey = cy + dy * t;
    const ang = Math.atan2(dy, dx);
    g.save();
    g.translate(ex, ey);
    g.rotate(ang);
    g.globalAlpha = 0.85;
    g.fillStyle = m.color;
    g.beginPath();
    g.moveTo(5, 0);
    g.lineTo(-5, -4.5);
    g.lineTo(-5, 4.5);
    g.closePath();
    g.fill();
    g.restore();
    g.globalAlpha = 1;
  }

  /** §3.9：追踪条每行 shortText */
  private shortDeadlineText(rt: QuestRuntime): string {
    const today = gameDayIndex();
    let s: string;
    if (rt.deadlineAbsHour === undefined) {
      s = '无时限';
    } else if (rt.deadlineHour !== undefined) {
      s = `${fmtHour(rt.deadlineHour)}前`;
    } else {
      s = `剩${rt.deadlineDay - today}天`;
    }
    const rem = rt.deadlineAbsHour === undefined ? null : rt.deadlineAbsHour - absGameHour();
    if (rem !== null && rem > 0) {
      const warnAt = clampWarn(rt.def.warnHours ?? 2);
      if (rem <= 0.5) s += ' · 最后半小时';
      else if (rem <= warnAt) s += ' · 快到期了';
    }
    return s;
  }

  drawTracker(g: CanvasRenderingContext2D, startY = 52): void {
    const list = this.activeRuntimes().slice(0, MAX_ACTIVE);
    if (list.length === 0) return;
    g.font = '13px monospace';
    g.textBaseline = 'top';
    let y = startY;
    for (const rt of list) {
      let mark: string;
      let color: string;
      if (rt.status === 'ready') {
        mark = '✓';
        color = '#7fd18a';
      } else {
        const warnAt = clampWarn(rt.def.warnHours ?? 2);
        const rem = rt.deadlineAbsHour === undefined ? Infinity : rt.deadlineAbsHour - absGameHour();
        mark = rem <= warnAt ? '⚠' : '●';
        color = rem <= warnAt ? '#c96a5a' : '#ffd166';
      }
      const text = `${mark} ${rt.def.name} · ${this.currentHint(rt)} · ${this.shortDeadlineText(rt)}`;
      const w = g.measureText(text).width;
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(16, y - 3, w + 14, 20);
      g.fillStyle = color;
      g.fillText(text, 22, y);
      y += 24;
    }
    g.textBaseline = 'middle';
  }

  drawWorldMarkers(g: CanvasRenderingContext2D, camX: number, camY: number): void {
    const px = this.ctx?.player.centerTile();
    for (const m of this.markers()) {
      const s = this.markerScreen(m, camX, camY);
      if (s.onScreen) {
        this.drawMarkerShape(g, m, s.x, s.y, 10, 2);
        if (px) {
          const dist = Math.hypot(px.tx - m.tx, px.ty - m.ty);
          if (dist <= 6) {
            g.font = '12px monospace';
            g.textAlign = 'center';
            g.textBaseline = 'bottom';
            g.strokeStyle = 'rgba(10,12,16,0.9)';
            g.lineWidth = 2;
            g.strokeText(m.label, s.x, s.y - 14);
            g.fillStyle = m.color;
            g.fillText(m.label, s.x, s.y - 14);
            g.textAlign = 'left';
            g.textBaseline = 'middle';
          }
        }
      } else {
        this.drawEdgeArrow(g, m, s.x, s.y);
      }
    }
  }

  drawMinimapMarkers(g: CanvasRenderingContext2D, world: World): void {
    for (const m of this.markers()) {
      const p = minimapPos(world, m.tx, m.ty);
      this.drawMarkerShape(g, m, p.x, p.y, 7, 1.5);
    }
  }

  drawBigMapMarkers(g: CanvasRenderingContext2D, world: World): void {
    for (const m of this.markers()) {
      const p = bigMapScreenPos(world, m.tx, m.ty);
      this.drawMarkerShape(g, m, p.x, p.y, 12, 2);
      g.font = '12px monospace';
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      g.fillStyle = m.color;
      g.fillText(m.label, p.x, p.y - 14);
      g.textAlign = 'left';
      g.textBaseline = 'middle';
    }
  }

  private isPhysical(def: QuestDef): boolean {
    return def.type === 'errand' || def.type === 'collect' || def.type === 'timed';
  }

  toast(text: string): void {
    this.ctx?.hud.toast(text);
  }

  private badlyIll(): boolean {
    const a = this.ctx?.health.active;
    if (!a) return false;
    return a.hospitalized || DISEASES[a.id].tier === 'T3';
  }

  /** 调试/测试用：当前状态摘要 */
  debugSummary(): string {
    return this.active.map((id) => {
      const rt = this.runtimes.get(id)!;
      return `${rt.def.name}:${rt.status}`;
    }).join(' | ');
  }

  /** §4.3 P-1：玩家当前是否在世界场景（面板「先出门」提示用） */
  inOverworld(): boolean {
    return !!this.ctx && this.ctx.scenes.current === this.ctx.overworld;
  }

  // ---- 存档 ----

  snapshot(): QuestSnapshot {
    const runtimes: QuestRuntimeSnapshot[] = [];
    for (const rt of this.runtimes.values()) {
      runtimes.push({
        id: rt.def.id,
        status: rt.status,
        progress: [...rt.progress],
        visited: [...rt.visited],
        acceptedDay: rt.acceptedDay,
        deadlineDay: rt.deadlineDay,
        deadlineHour: rt.deadlineHour,
        deadlineAbsHour: rt.deadlineAbsHour,
        warnStage: rt.warnStage,
        expiredLogged: rt.expiredLogged,
        repeatCount: rt.repeatCount,
        readyAnnounced: rt.readyAnnounced,
        completedDay: rt.completedDay,
      });
    }
    return {
      runtimes,
      discovered: [...this.discovered],
      discoveredAt: [...this.discoveredAt],
      active: [...this.active],
      completed: [...this.completed],
      cooldown: [...this.cooldown],
      journal: this.journal.map((j) => ({ ...j })),
      yearEvents: this.yearEvents.map((e) => ({ ...e })),
      tags: [...this.tags],
      inventory: [...this.inventory],
      storyNotified: [...this.storyNotified],
      lastDay: this.lastDay,
      moneyToday: this.moneyToday,
      heartsToday: this.heartsToday,
      npcHearts: [...this.npcHearts],
      questsToday: this.questsToday,
      lastRandomDay: this.lastRandomDay,
    };
  }

  restore(s: QuestSnapshot): void {
    this.runtimes.clear();
    for (const r of s.runtimes ?? []) {
      const def = QUESTS_BY_ID[r.id];
      if (!def) continue; // 旧存档里有已删掉的任务：直接丢弃，别炸
      // §7.5/7.6：历史 failed 归一为 expired；旧档缺字段按迁移矩阵推导
      const status: QuestStatus = r.status === 'failed' ? 'expired' : r.status;
      this.runtimes.set(r.id, {
        def,
        status,
        progress: [...(r.progress ?? [])],
        visited: new Set(r.visited ?? []),
        acceptedDay: r.acceptedDay ?? -1,
        deadlineDay: r.deadlineDay ?? 999999,
        deadlineHour: r.deadlineHour,
        deadlineAbsHour: this.migrateDeadlineAbsHour(r),
        warnStage: r.warnStage ?? 0,
        expiredLogged: r.expiredLogged ?? status === 'expired',
        repeatCount: r.repeatCount ?? 0,
        readyAnnounced: !!r.readyAnnounced,
        completedDay: r.completedDay ?? -1,
      });
    }
    const fill = <T>(set: Set<T>, values: T[] | undefined): void => {
      set.clear();
      for (const v of values ?? []) set.add(v);
    };
    const fillMap = <K, V>(map: Map<K, V>, entries: [K, V][] | undefined): void => {
      map.clear();
      for (const [k, v] of entries ?? []) map.set(k, v);
    };
    fill(this.discovered, s.discovered);
    fillMap(this.discoveredAt, s.discoveredAt);
    fill(this.completed, s.completed);
    fillMap(this.cooldown, s.cooldown);
    fill(this.tags, s.tags);
    fillMap(this.inventory, s.inventory);
    fill(this.storyNotified, s.storyNotified);
    fillMap(this.npcHearts, s.npcHearts);
    this.journal.length = 0;
    for (const j of s.journal ?? []) this.journal.push({ ...j });
    this.yearEvents.length = 0;
    for (const e of s.yearEvents ?? []) this.yearEvents.push({ ...e });
    this.lastDay = s.lastDay ?? -1;
    this.moneyToday = s.moneyToday ?? 0;
    this.heartsToday = s.heartsToday ?? 0;
    this.questsToday = s.questsToday ?? 0;
    this.lastRandomDay = s.lastRandomDay ?? -1;
    // active 只保留仍然存在且状态确实是 active/ready 的
    this.active.length = 0;
    for (const id of s.active ?? []) {
      const rt = this.runtimes.get(id);
      if (rt && (rt.status === 'active' || rt.status === 'ready')) this.active.push(id);
    }
  }

  /** §7.5：旧档缺 deadlineAbsHour 时按字段推导（R-7-04） */
  private migrateDeadlineAbsHour(r: QuestRuntimeSnapshot): number | undefined {
    if (r.deadlineAbsHour !== undefined) return r.deadlineAbsHour;
    if (r.deadlineDay === undefined || r.deadlineDay === 999999) return undefined;
    if (r.deadlineHour !== undefined) return r.deadlineDay * 24 + r.deadlineHour;
    return (r.deadlineDay + 1) * 24 + 6;
  }
}

/** 存档快照：单条任务的运行时 */
export interface QuestRuntimeSnapshot {
  id: string;
  status: QuestStatus;
  progress: number[];
  visited: string[];
  acceptedDay: number;
  deadlineDay: number;
  deadlineHour?: number;
  deadlineAbsHour?: number;
  warnStage?: 0 | 1 | 2;
  expiredLogged?: boolean;
  repeatCount: number;
  readyAnnounced: boolean;
  completedDay: number;
}

/** 存档快照：任务系统的全部可变状态 */
export interface QuestSnapshot {
  runtimes: QuestRuntimeSnapshot[];
  discovered: string[];
  discoveredAt: [string, number][];
  active: string[];
  completed: string[];
  cooldown: [string, number][];
  journal: { age: number; day: number; text: string }[];
  yearEvents: YearEvent[];
  tags: string[];
  inventory: [string, number][];
  storyNotified: string[];
  lastDay: number;
  moneyToday: number;
  heartsToday: number;
  npcHearts: [string, number][];
  questsToday: number;
  lastRandomDay: number;
}
