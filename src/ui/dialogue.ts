import { VIEW_H, VIEW_W } from '../config';
import type { Input } from '../core/input';
import type { Resident } from '../entities/resident';
import { GIFT_ITEMS } from '../data/residents';
import type { QuestManager } from '../quest/questManager';

// 对话浮层：底部面板，菜单式交互
// 聊天（每天首次 +1 好感）/ 送礼（按偏好 +3/-2/+0）/ 秘密解锁（好感达阈值后聊天触发）
// 任务：NPC 有委托时出现「委托」；可交差时出现「交差」，选择类拆成多个选项
type Mode = 'menu' | 'gift' | 'msg';

const CHARS_PER_SEC = 36;

interface MenuItem {
  label: string;
  run: () => void;
}

export class Dialogue {
  private resident: Resident | null = null;
  private mode: Mode = 'menu';
  private sel = 0;
  private full = '';
  private shown = 0;
  private done = false; // 当前文本是否已显示完
  private items: MenuItem[] = [];

  constructor(private readonly quests?: QuestManager) {}

  get isActive(): boolean {
    return this.resident !== null;
  }

  open(r: Resident): void {
    this.resident = r;
    this.mode = 'msg';
    this.sel = 0;
    r.recordVisit();

    // 开场白三态 + 连续到访彩蛋
    let greet: string;
    if (r.isCold()) greet = r.def.lines.greetCold;
    else if (r.streak >= 5) greet = r.def.lines.streak;
    else if (r.isWarm()) greet = r.def.lines.greetWarm;
    else greet = r.def.lines.greet;

    const progress = this.quests?.onTalk(r.def.id) ?? [];
    const header = `【${r.def.name} · ${r.def.age}岁 · ${r.def.job}】`;
    const tail = progress.length ? `\n${progress.join('\n')}` : '';
    this.setText(`${header}\n${greet}\n（${r.def.catchphrase}）${tail}`);
    this.buildMenu(r);
  }

  private buildMenu(r: Resident): void {
    const items: MenuItem[] = [
      { label: '聊天', run: () => { this.chat(r); } },
      { label: '送礼', run: () => { this.mode = 'gift'; } },
    ];

    const turnIns = this.quests?.turnInOptionsForNpc(r.def.id) ?? [];
    for (const t of turnIns) {
      items.push({
        label: t.label,
        run: () => {
          const res = this.quests!.turnIn(t.def.id, t.choiceIndex);
          this.setText(res.text);
          this.mode = 'msg';
          this.sel = 0;
        },
      });
    }

    const offers = this.quests?.offersForNpc(r.def.id) ?? [];
    for (const def of offers) {
      items.push({
        label: `委托：${def.name}`,
        run: () => {
          const res = this.quests!.accept(def.id, true);
          this.setText(res.text);
          this.mode = 'msg';
          this.sel = 0;
        },
      });
    }

    items.push({ label: '离开', run: () => { this.close(); } });
    this.items = items;
    this.sel = Math.min(this.sel, items.length - 1);
  }

  private setText(t: string): void {
    this.full = t;
    this.shown = 0;
    this.done = false;
  }

  update(dt: number, input: Input): void {
    const r = this.resident;
    if (!r) return;

    // 打字机
    if (!this.done) {
      this.shown += CHARS_PER_SEC * dt;
      if (this.shown >= this.full.length) {
        this.shown = this.full.length;
        this.done = true;
      }
    }

    const confirm = input.wasPressed('KeyE', 'Enter', 'NumpadEnter', 'Space');
    const cancel = input.wasPressed('Escape');

    if (cancel) {
      this.close();
      return;
    }

    if (!this.done) {
      if (confirm) {
        this.shown = this.full.length; // 按 E 快进全文
        this.done = true;
      }
      return;
    }

    if (this.mode === 'msg') {
      if (confirm) {
        this.mode = 'menu';
        this.buildMenu(r);
      }
      return;
    }

    if (this.mode === 'menu') {
      const n = this.items.length;
      if (input.wasPressed('ArrowUp', 'KeyW')) this.sel = (this.sel + n - 1) % n;
      if (input.wasPressed('ArrowDown', 'KeyS')) this.sel = (this.sel + 1) % n;
      for (let i = 0; i < Math.min(9, n); i++) {
        if (input.wasPressed(`Digit${i + 1}`)) return this.choose(i);
      }
      if (confirm) this.choose(this.sel);
      return;
    }

    if (this.mode === 'gift') {
      if (input.wasPressed('Digit1', 'Digit2', 'Digit3', 'Digit4')) {
        const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].findIndex((k) => input.wasPressed(k));
        this.give(GIFT_ITEMS[idx]);
      } else if (confirm) {
        this.mode = 'menu'; // 空着手上礼物菜单 = 返回
        this.buildMenu(r);
      }
    }
  }

  private choose(i: number): void {
    const item = this.items[i];
    if (!item) return;
    item.run();
  }

  private chat(r: Resident): void {
    const lines: string[] = [];
    lines.push(`【${r.def.name}】`);
    lines.push(r.nextChat());
    if (r.canChatBonus()) {
      r.markChatted();
      lines.push(`（好感 +1 → ${r.affinity}）`);
    }
    // 秘密解锁：好感达到阈值，聊天时自动揭示（先给钩子后给正主）
    if (!r.secretRevealed && r.affinity >= r.def.secret.threshold) {
      r.secretRevealed = true;
      lines.push('');
      lines.push(`★ 秘密：${r.def.secret.reveal}`);
    } else if (!r.secretRevealed && r.affinity >= r.def.secret.threshold - 1) {
      lines.push(`（${r.def.secret.hook}）`);
    }
    this.setText(lines.join('\n'));
    this.mode = 'msg';
  }

  private give(item: string): void {
    const r = this.resident;
    if (!r) return;
    const g = r.def.gifts;
    let line: string;
    if (!r.canGiftToday()) {
      line = '今天已经收过你的了。心意领了，拿回去吧。';
    } else if (g.like.includes(item)) {
      r.markGifted(3);
      line = `${r.def.lines.giftLike}\n（好感 +3 → ${r.affinity}）`;
    } else if (g.dislike === item) {
      r.markGifted(-2);
      line = `${r.def.lines.giftDislike}\n（好感 -2 → ${r.affinity}）`;
    } else {
      r.markGifted(0);
      line = r.def.lines.giftNeutral;
    }
    this.setText(`【${r.def.name}】\n（送出：${item}）\n${line}`);
    this.mode = 'msg';
  }

  close(): void {
    this.resident = null;
    this.items = [];
  }

  render(g: CanvasRenderingContext2D): void {
    const r = this.resident;
    if (!r) return;
    const optionRows = this.mode === 'gift' ? 4 : this.items.length;
    const bh = Math.min(300, Math.max(190, 150 + Math.max(0, optionRows - 3) * 22));
    const by = VIEW_H - bh - 12;

    g.fillStyle = 'rgba(12,14,18,0.9)';
    g.fillRect(24, by, VIEW_W - 48, bh);
    g.strokeStyle = r.isWarm() ? '#7fd18a' : r.isCold() ? '#c96a5a' : 'rgba(232,232,232,0.4)';
    g.lineWidth = 2;
    g.strokeRect(25, by + 1, VIEW_W - 50, bh - 2);

    // 正文（打字机截断）
    g.font = '15px monospace';
    g.textBaseline = 'top';
    const text = this.full.slice(0, Math.floor(this.shown));
    const rows = text.split('\n');
    let y = by + 12;
    for (const row of rows) {
      if (y > by + bh - optionRows * 22 - 36) break;
      g.fillStyle = row.startsWith('★') ? '#ffd166' : row.startsWith('【') ? '#9fb8e8' : row.startsWith('（') ? '#8a8f98' : '#e8e8e8';
      g.fillText(row, 44, y);
      y += 20;
    }

    // 选项
    if (this.done) {
      const startY = by + bh - 16 - optionRows * 22;
      if (this.mode === 'menu') {
        g.font = '15px monospace';
        this.items.forEach((item, i) => {
          const label = `${i === this.sel ? '▶' : ' '} ${i + 1}. ${item.label}`;
          g.fillStyle = i === this.sel ? '#ffd166' : '#9aa0aa';
          g.fillText(label, 44, startY + i * 22);
        });
      } else if (this.mode === 'gift') {
        g.font = '15px monospace';
        g.fillStyle = '#9fb8e8';
        g.fillText('送什么？', 44, startY);
        GIFT_ITEMS.forEach((it, i) => {
          const label = `  ${i + 1}. ${it}`;
          g.fillStyle = r.def.gifts.like.includes(it) ? '#7fd18a' : r.def.gifts.dislike === it ? '#c96a5a' : '#9aa0aa';
          g.fillText(label, 44, startY + 20 + i * 20);
        });
        // 注：颜色即偏好提示（绿=喜欢 红=讨厌）—— v1 明示，熟悉后可改盲选
      } else {
        g.font = '13px monospace';
        g.fillStyle = '#6a7078';
        g.fillText('E 继续', VIEW_W - 108, by + bh - 28);
      }
    }

    // 好感度条（右下角）
    g.font = '12px monospace';
    g.fillStyle = '#8a8f98';
    g.fillText(`好感 ${'♥'.repeat(r.affinity)}${'♡'.repeat(5 - r.affinity)}  连续到访 ${r.streak} 天${r.secretRevealed ? '  ★已交心' : ''}`, VIEW_W - 300, by + 12);
  }
}
