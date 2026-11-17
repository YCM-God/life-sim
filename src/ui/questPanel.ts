// 人生备忘录：Q 打开的轻量任务面板
// 设计约束：同时最多 3 件；可接列表只放“已经听到/看到”的事；日常不在这里堆清单
import { VIEW_H, VIEW_W } from '../config';
import type { Input } from '../core/input';
import { turnInNpc } from '../quest/questManager';
import type { MapMarker, QuestManager } from '../quest/questManager';
import type { QuestDef, QuestRuntime } from '../quest/types';
import { RESIDENTS } from '../data/residents';

const TABS = ['进行中', '可接', '人生日志'] as const;

function npcName(id: string | undefined): string {
  if (!id) return '—';
  return RESIDENTS.find((r) => r.id === id)?.name ?? id;
}

function tierLabel(def: QuestDef): string {
  if (def.chain) return `支线 · ${def.chain.id === 'letter' ? '四十年前的信' : def.chain.id === 'night' ? '夜班的两小时' : def.chain.id === 'stage' ? '戏台旧事' : '536 块 4 毛'} · ${def.chain.ring}/${def.chain.total}`;
  return def.tier === 'main' ? '主线' : def.tier === 'daily' ? '日常' : '支线';
}

function sourceLabel(def: QuestDef): string {
  switch (def.source) {
    case 'npc': return 'NPC 委托';
    case 'board': return '公告栏';
    case 'phone': return '电话/短信';
    case 'school': return '学校/工作';
    case 'random': return '街边事件';
    case 'story': return '剧情';
  }
}

function typeLabel(def: QuestDef): string {
  return { errand: '跑腿', collect: '收集', talk: '对话', timed: '限时', choice: '选择', long: '长期' }[def.type];
}

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const ch of text) {
    if (g.measureText(line + ch).width > maxW) {
      out.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) out.push(line);
  return out;
}

export class QuestPanel {
  private open = false;
  private tab = 0;
  private sel = 0;
  private scroll = 0;
  private confirmAbandon = '';

  constructor(private readonly quests: QuestManager) {}

  get isActive(): boolean {
    return this.open;
  }

  toggle(): void {
    this.open = !this.open;
    if (!this.open) this.confirmAbandon = '';
  }

  close(): void {
    this.open = false;
    this.confirmAbandon = '';
  }

  private activeList(): QuestRuntime[] {
    return this.quests.activeRuntimes();
  }

  private availableList(): QuestDef[] {
    return this.quests.availableDefs();
  }

  /** §6.1：行首符号/颜色由 markerFor 推导（禁止另算一套） */
  private markerStyle(rt: QuestRuntime): { mark: string; color: string } {
    const m: MapMarker | null = this.quests.markerFor(rt);
    if (!m) return { mark: '○', color: '#6a7078' };
    if (m.urgency === 'ready') return { mark: '◆', color: '#7fd18a' };
    if (m.urgency === 'urgent') return { mark: '▲', color: '#c96a5a' };
    return { mark: '◇', color: '#ffd166' };
  }

  /** §6.2 R-6-07：可接页条目前缀优先级 ✕(expired) → ⛓(chain) → ◆(main) → ○ */
  private prefixOf(def: QuestDef): string {
    if (this.quests.runtime(def.id)?.status === 'expired') return '✕';
    if (def.chain) return '⛓';
    if (def.tier === 'main') return '◆';
    return '○';
  }

  private ensureVisible(): void {
    if (this.tab !== 1) {
      this.scroll = 0;
      return;
    }
    const visible = 10;
    if (this.sel < this.scroll) this.scroll = this.sel;
    if (this.sel >= this.scroll + visible) this.scroll = this.sel - visible + 1;
  }

  private currentCount(): number {
    if (this.tab === 0) return this.activeList().length;
    if (this.tab === 1) return this.availableList().length;
    return this.quests.journalLines().length;
  }

  update(_dt: number, input: Input): void {
    if (!this.open) return;
    if (input.wasPressed('KeyQ', 'Escape')) {
      this.close();
      return;
    }
    if (input.wasPressed('ArrowLeft', 'KeyA')) {
      this.tab = (this.tab + TABS.length - 1) % TABS.length;
      this.sel = 0;
      this.scroll = 0;
      this.confirmAbandon = '';
    }
    if (input.wasPressed('ArrowRight', 'KeyD')) {
      this.tab = (this.tab + 1) % TABS.length;
      this.sel = 0;
      this.scroll = 0;
      this.confirmAbandon = '';
    }
    const n = this.currentCount();
    this.sel = Math.max(0, Math.min(this.sel, Math.max(0, n - 1)));
    if (n > 0) {
      if (input.wasPressed('ArrowUp', 'KeyW')) this.sel = (this.sel + n - 1) % n;
      if (input.wasPressed('ArrowDown', 'KeyS')) this.sel = (this.sel + 1) % n;
    }
    this.ensureVisible();

    if (this.tab === 0) {
      const rt = this.activeList()[this.sel];
      if (rt && input.wasPressed('KeyX')) {
        if (this.confirmAbandon === rt.def.id) {
          this.quests.abandon(rt.def.id);
          this.confirmAbandon = '';
          this.sel = Math.max(0, Math.min(this.sel, this.currentCount() - 1));
        } else {
          this.confirmAbandon = rt.def.id;
        }
      }
    } else if (this.tab === 1) {
      const def = this.availableList()[this.sel];
      if (def && input.wasPressed('KeyE', 'Enter', 'Space')) {
        const res = this.quests.accept(def.id, false);
        if (!res.ok) this.quests.toast(res.text);
        this.sel = Math.max(0, Math.min(this.sel, this.currentCount() - 1));
      }
    }
  }

  render(g: CanvasRenderingContext2D): void {
    if (!this.open) return;
    const W = VIEW_W;
    const H = VIEW_H;

    g.fillStyle = 'rgba(8,10,14,0.86)';
    g.fillRect(0, 0, W, H);

    // 标题
    g.font = '28px monospace';
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillStyle = '#e8e8e8';
    g.fillText('人生备忘录', 40, 30);
    g.font = '13px monospace';
    g.fillStyle = '#8a8f98';
    g.fillText('Q / Esc 关闭 · ←→ 切换 · ↑↓ 选择 · E 接取 · X 放下（连按两次确认）', 40, 70);

    // 左侧列表
    const lx = 40;
    const ly = 106;
    const lw = 430;
    const lh = 570;
    g.fillStyle = 'rgba(16,20,26,0.92)';
    g.fillRect(lx, ly, lw, lh);
    g.strokeStyle = 'rgba(232,232,232,0.3)';
    g.lineWidth = 2;
    g.strokeRect(lx + 1, ly + 1, lw - 2, lh - 2);

    // Tabs
    g.font = '14px monospace';
    TABS.forEach((t, i) => {
      const x = lx + 20 + i * 130;
      g.fillStyle = i === this.tab ? '#ffd166' : '#6a7078';
      g.fillText(`${i === this.tab ? '▸' : ' '} ${t}`, x, ly + 14);
      if (i === this.tab) {
        g.fillRect(x - 4, ly + 34, 116, 2);
      }
    });

    g.font = '15px monospace';
    let y = ly + 50;
    if (this.tab === 0) {
      const list = this.activeList();
      if (list.length === 0) {
        g.fillStyle = '#6a7078';
        g.fillText('现在没有挂在手上的事。', lx + 20, y + 6);
      }
      list.forEach((rt, i) => {
        const selected = i === this.sel;
        if (selected) {
          g.fillStyle = 'rgba(255,209,102,0.12)';
          g.fillRect(lx + 8, y - 4, lw - 16, 46);
        }
        const style = this.markerStyle(rt);
        g.fillStyle = selected ? '#ffd166' : '#e8e8e8';
        g.fillText(`${style.mark} ${rt.def.name}`, lx + 20, y);
        g.font = '12px monospace';
        g.fillStyle = style.color === '#6a7078' ? '#8a8f98' : style.color;
        g.fillText(this.quests.currentHint(rt), lx + 40, y + 22);
        if (rt.def.chain) {
          g.fillStyle = '#9fb8e8';
          g.fillText(`${rt.def.chain.ring}/${rt.def.chain.total}`, lx + lw - 60, y);
        }
        g.font = '15px monospace';
        y += 50;
      });
    } else if (this.tab === 1) {
      const list = this.availableList();
      if (list.length === 0) {
        g.fillStyle = '#6a7078';
        g.fillText('还没有听到新的事。去街上走走，或者和人聊聊。', lx + 20, y + 6);
      }
      const start = this.scroll;
      list.slice(start, start + 10).forEach((def, offset) => {
        const i = start + offset;
        const selected = i === this.sel;
        if (selected) {
          g.fillStyle = 'rgba(255,209,102,0.12)';
          g.fillRect(lx + 8, y - 4, lw - 16, 46);
        }
        g.fillStyle = selected ? '#ffd166' : '#e8e8e8';
        g.fillText(`${this.prefixOf(def)} ${def.name}`, lx + 20, y);
        g.font = '12px monospace';
        g.fillStyle = '#8a8f98';
        g.fillText(`${sourceLabel(def)} · ${typeLabel(def)} · ${npcName(def.giver)}`, lx + 40, y + 22);
        g.font = '15px monospace';
        y += 50;
      });
      if (list.length > 10) {
        g.font = '12px monospace';
        g.fillStyle = '#6a7078';
        const end = Math.min(list.length, start + 10);
        g.fillText(`显示 ${start + 1}–${end} / ${list.length} 条`, lx + 20, ly + lh - 22);
      }
    } else {
      const lines = this.quests.journalLines().slice(-14);
      g.font = '13px monospace';
      if (lines.length === 0) {
        g.fillStyle = '#6a7078';
        g.fillText('人生日志还是空的。', lx + 20, y + 6);
      }
      for (const line of lines) {
        if (y > ly + lh - 30) break;
        g.fillStyle = '#c8cdd5';
        const wrapped = wrap(g, line.text, lw - 40);
        for (const row of wrapped.slice(0, 2)) {
          g.fillText(row, lx + 20, y);
          y += 28;
        }
      }
    }

    // 右侧详情
    const rx = 500;
    const ry = 106;
    const rw = 740;
    const rh = 570;
    g.fillStyle = 'rgba(16,20,26,0.92)';
    g.fillRect(rx, ry, rw, rh);
    g.strokeStyle = 'rgba(232,232,232,0.3)';
    g.lineWidth = 2;
    g.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);

    if (this.tab === 0) {
      const rt = this.activeList()[this.sel];
      if (rt) this.renderActive(g, rt, rx, ry, rw, rh);
      else this.renderEmpty(g, rx, ry, '手上没有事。去吃点东西，或者和人说说话。');
    } else if (this.tab === 1) {
      const def = this.availableList()[this.sel];
      if (def) this.renderAvailable(g, def, rx, ry, rw, rh);
      else this.renderEmpty(g, rx, ry, '暂时没有可接的事。');
    } else {
      g.font = '18px monospace';
      g.fillStyle = '#ffd166';
      g.fillText('人生日志', rx + 28, ry + 24);
      g.font = '14px monospace';
      g.fillStyle = '#8a8f98';
      const lines = this.quests.journalLines();
      g.fillText(`一共 ${lines.length} 条。任务会留在这里，不会占待办。`, rx + 28, ry + 58);
      let yy = ry + 100;
      for (const line of lines.slice(-12)) {
        g.fillStyle = '#c8cdd5';
        for (const row of wrap(g, line.text, rw - 60).slice(0, 3)) {
          g.fillText(row, rx + 28, yy);
          yy += 24;
        }
        yy += 16;
        if (yy > ry + rh - 40) break;
      }
    }
  }

  private renderEmpty(g: CanvasRenderingContext2D, x: number, y: number, text: string): void {
    g.font = '15px monospace';
    g.fillStyle = '#6a7078';
    g.fillText(text, x + 28, y + 32);
  }

  private renderActive(g: CanvasRenderingContext2D, rt: QuestRuntime, x: number, y: number, w: number, h: number): void {
    const def = rt.def;
    g.textAlign = 'left';
    g.font = '24px monospace';
    g.fillStyle = '#ffd166';
    g.fillText(def.name, x + 28, y + 24);

    g.font = '13px monospace';
    g.fillStyle = '#9fb8e8';
    g.fillText(`${tierLabel(def)} · ${typeLabel(def)} · ${sourceLabel(def)}`, x + 28, y + 60);

    g.fillStyle = '#c8cdd5';
    let yy = y + 92;
    for (const row of wrap(g, def.desc, w - 60)) {
      g.fillText(row, x + 28, yy);
      yy += 22;
    }

    yy += 10;
    const style = this.markerStyle(rt);
    g.fillStyle = style.color === '#c96a5a' ? '#c96a5a' : '#ffd166';
    g.fillText(`目标 · ${this.quests.deadlineText(rt)}`, x + 28, yy);
    yy += 26;
    const objs = this.quests.objectiveLines(rt);
    objs.forEach((o, i) => {
      const current = i === this.quests.currentIndex(rt);
      g.fillStyle = o.done ? '#7fd18a' : current ? '#e8e8e8' : '#8a8f98';
      g.fillText(`${o.done ? '✓' : current ? '▶' : '○'} ${o.text}`, x + 40, yy);
      yy += 24;
    });

    yy += 12;
    g.fillStyle = '#9fb8e8';
    const tn = turnInNpc(def);
    const deliveryName = tn ? npcName(tn) : '—（自动完成）';
    let deliveryLine = `交付：${deliveryName}`;
    const win = this.quests.windowText(tn);
    if (win) deliveryLine += ` · ${win}`;
    if (tn && !this.quests.inOverworld()) deliveryLine += '（先出门）';
    g.fillText(deliveryLine, x + 28, yy);
    yy += 24;
    g.fillStyle = '#9fb8e8';
    g.fillText(`奖励：${this.quests.rewardText(def)}`, x + 28, yy);
    yy += 24;
    if (def.chain) {
      g.fillStyle = '#c992e8';
      g.fillText(`任务链 ${def.chain.ring}/${def.chain.total}`, x + 28, yy);
      yy += 24;
    }

    yy = y + h - 46;
    g.fillStyle = '#6a7078';
    g.font = '12px monospace';
    if (this.confirmAbandon === def.id) {
      g.fillStyle = '#c96a5a';
      g.fillText('再按一次 X 放下这件事。放下不扣好感。', x + 28, yy);
    } else {
      g.fillText(rt.status === 'ready' ? '去和对方说一声，就算交付。' : 'X 放下 · 事情不会消失，只是先不做了。', x + 28, yy);
    }
  }

  private renderAvailable(g: CanvasRenderingContext2D, def: QuestDef, x: number, y: number, w: number, h: number): void {
    g.textAlign = 'left';
    g.font = '24px monospace';
    g.fillStyle = '#ffd166';
    g.fillText(def.name, x + 28, y + 24);

    g.font = '13px monospace';
    g.fillStyle = '#9fb8e8';
    g.fillText(`${tierLabel(def)} · ${typeLabel(def)} · ${sourceLabel(def)} · 发布：${npcName(def.giver)}`, x + 28, y + 60);

    g.fillStyle = '#c8cdd5';
    let yy = y + 92;
    for (const row of wrap(g, def.desc, w - 60)) {
      g.fillText(row, x + 28, yy);
      yy += 22;
    }

    yy += 10;
    g.fillStyle = '#ffd166';
    g.fillText('要做的事', x + 28, yy);
    yy += 26;
    def.objectives.forEach((o, i) => {
      g.fillStyle = '#c8cdd5';
      g.fillText(`${i + 1}. ${o.hint}`, x + 40, yy);
      yy += 24;
    });

    yy += 12;
    const rt = this.quests.runtime(def.id);
    if (rt?.status === 'expired') {
      g.fillStyle = '#c96a5a';
      g.fillText('上次错过了 · 冷却结束后可再试', x + 28, yy);
      yy += 24;
    }
    g.fillStyle = '#9fb8e8';
    g.fillText(`时限：${this.quests.limitText(def)}`, x + 28, yy);
    yy += 24;
    g.fillStyle = '#9fb8e8';
    g.fillText(`奖励：${this.quests.rewardText(def)}`, x + 28, yy);
    yy += 24;
    const tn = turnInNpc(def);
    if (tn) {
      g.fillStyle = '#9fb8e8';
      g.fillText(`交付：${npcName(tn)} · ${this.quests.windowText(tn)}`, x + 28, yy);
      yy += 24;
    } else {
      g.fillStyle = '#9fb8e8';
      g.fillText('交付：—（自动完成）', x + 28, yy);
      yy += 24;
    }
    if (def.window) {
      g.fillStyle = '#8a8f98';
      g.fillText(`可接时段：${String(def.window.from).padStart(2, '0')}:00–${String(def.window.to).padStart(2, '0')}:00`, x + 28, yy);
      yy += 24;
    }

    yy = y + h - 46;
    g.font = '13px monospace';
    g.fillStyle = '#7fd18a';
    g.fillText('E 接下这件事', x + 28, yy);
    if (def.prereq?.minAge) {
      g.fillStyle = '#6a7078';
      g.fillText(`（${def.prereq.minAge} 岁后可接）`, x + 170, yy);
    }
  }
}
