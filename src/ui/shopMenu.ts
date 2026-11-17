// 通用选择菜单浮层：便利店购物 / 在家休息等「选 1/2/3」式交互
// 与 Dialogue 视觉同族（底部面板），但选项回调由业务方注入
import { VIEW_H, VIEW_W } from '../config';
import type { Input } from '../core/input';

export interface MenuOption {
  label: string;
  hint?: string;   // 选项右侧灰字（价格/说明）
  disabled?: boolean;
  cb: () => void;
}

export class ChoiceMenu {
  private title = '';
  private text = '';
  private options: MenuOption[] = [];
  private sel = 0;
  private busy = false;

  get isActive(): boolean {
    return this.busy;
  }

  open(title: string, text: string, options: MenuOption[]): void {
    this.title = title;
    this.text = text;
    this.options = options;
    this.sel = 0;
    this.busy = true;
  }

  close(): void {
    this.busy = false;
    this.options = [];
  }

  update(dt: number, input: Input): void {
    if (!this.busy) return;
    void dt;
    const n = this.options.length;
    if (input.wasPressed('ArrowUp', 'KeyW')) this.sel = (this.sel + n - 1) % n;
    if (input.wasPressed('ArrowDown', 'KeyS')) this.sel = (this.sel + 1) % n;
    for (let i = 0; i < n; i++) {
      if (input.wasPressed(`Digit${i + 1}`)) return this.choose(i);
    }
    if (input.wasPressed('KeyE', 'Enter', 'Space')) this.choose(this.sel);
    if (input.wasPressed('Escape')) this.close();
  }

  private choose(i: number): void {
    const opt = this.options[i];
    if (!opt || opt.disabled) return;
    this.close();
    opt.cb();
  }

  render(g: CanvasRenderingContext2D): void {
    if (!this.busy) return;
    const bh = 150 + this.options.length * 26;
    const by = VIEW_H - bh - 12;
    g.fillStyle = 'rgba(12,14,18,0.88)';
    g.fillRect(24, by, VIEW_W - 48, bh);
    g.strokeStyle = 'rgba(232,232,232,0.4)';
    g.lineWidth = 2;
    g.strokeRect(25, by + 1, VIEW_W - 50, bh - 2);

    g.font = '15px monospace';
    g.textBaseline = 'top';
    g.fillStyle = '#9fb8e8';
    g.fillText(`— ${this.title} —`, 44, by + 12);
    g.fillStyle = '#e8e8e8';
    let y = by + 38;
    for (const row of this.text.split('\n')) {
      g.fillText(row, 44, y);
      y += 22;
    }

    y = by + bh - 34 - (this.options.length - 1) * 26;
    this.options.forEach((opt, i) => {
      const label = `${i === this.sel ? '▶' : ' '} ${i + 1}. ${opt.label}`;
      g.font = '16px monospace';
      g.fillStyle = opt.disabled ? '#5a6068' : i === this.sel ? '#ffd166' : '#9aa0aa';
      g.fillText(label, 44, y + i * 26);
      if (opt.hint) {
        g.font = '14px monospace';
        g.fillStyle = '#8a8f98';
        g.fillText(opt.hint, 44 + 260, y + i * 26 + 1);
      }
    });
  }
}
