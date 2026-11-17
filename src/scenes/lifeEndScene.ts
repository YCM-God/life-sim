// 人生终章：活到 100 岁寿终，展示一生回顾并重新开始。
// 设计原则与年度结算一致：不做复杂动画，淡入后即为完整静态版，按 E / 点击即重开。

import { VIEW_H, VIEW_W } from '../config';
import type { GameContext } from '../context';
import type { Scene } from './scene';
import { MAX_AGE } from '../entities/player';
import { clearSave } from '../core/save';
import { arpeggio } from '../core/sfx';

const C_GOLD = '#f0c878';
const C_TEXT = '#e8e8e8';
const C_DIM = '#6a7078';
const C_LINE = '#2a2e38';

/** 根据一生收尾的状态挑一句墓志铭 */
function epitaph(money: number, knowledge: number, health: number, mind: number): string[] {
  const lines: string[] = [];
  if (knowledge >= 80) lines.push('街坊都说，你是个有学问的人。');
  else if (knowledge >= 50) lines.push('你认认真真读过几年书。');
  else lines.push('书读得不多，日子过得实在。');

  if (money >= 5000) lines.push('你留下了一笔让人念叨许久的家产。');
  else if (money >= 1000) lines.push('你没攒下大钱，但也没欠过谁。');
  else lines.push('你两手空空地来，也两手空空地走。');

  if (health >= 60) lines.push('这副身子骨，一直没给你添太多麻烦。');
  else lines.push('后半辈子，身体没少跟你较劲。');

  if (mind >= 60) lines.push('走的时候，你是笑着的。');
  return lines.slice(0, 3);
}

export class LifeEndScene implements Scene {
  private t = 0;
  private done = false;

  constructor(private readonly ctx: GameContext) {
    // 调试：?snap 首帧即终态（无头截图验证用，和年度结算界面一致）
    if (new URLSearchParams(location.search).has('snap')) this.t = 2;
  }

  enter(): void {
    arpeggio([392.0, 329.63, 261.63]); // 下行三音，收束感
  }

  update(dt: number): void {
    this.t += dt;
    if (this.done || this.t < 1.2) return;
    const { input } = this.ctx;
    if (input.wasPressed('KeyE', 'Space', 'Enter') || input.consumeClick()) {
      this.done = true;
      clearSave(); // 这一生结束了，自动存档一并清掉，下次进来是新的开始
      location.reload();
    }
  }

  render(g: CanvasRenderingContext2D): void {
    const p = this.ctx.player;
    const k = Math.min(1, this.t / 1.2); // 淡入

    g.fillStyle = '#0b0d12';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    // 中心微光，把注意力收到文字上
    const glow = g.createRadialGradient(VIEW_W / 2, 300, 40, VIEW_W / 2, 300, 620);
    glow.addColorStop(0, `rgba(240,200,120,${0.10 * k})`);
    glow.addColorStop(1, 'rgba(240,200,120,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, VIEW_W, VIEW_H);

    g.textAlign = 'center';

    // 小标签
    g.font = '18px monospace';
    g.fillStyle = `rgba(106,112,120,${k})`;
    g.fillText('人 生 终 章', VIEW_W / 2, 168);

    // 标题
    g.font = '56px monospace';
    g.fillStyle = `rgba(232,232,232,${k})`;
    g.fillText('你的一生结束了', VIEW_W / 2, 246);

    // 姓名 · 享年
    g.font = '28px monospace';
    g.fillStyle = `rgba(240,200,120,${k})`;
    g.fillText(`${p.name} · 享年 ${MAX_AGE} 岁`, VIEW_W / 2, 300);

    // 分隔线
    g.strokeStyle = `rgba(42,46,56,${k})`;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(VIEW_W / 2 - 220, 332);
    g.lineTo(VIEW_W / 2 + 220, 332);
    g.stroke();

    // 墓志铭
    const lines = epitaph(
      p.money,
      p.knowledge,
      Math.round((p.stats?.health ?? 0) * 10),
      Math.round((p.stats?.mind ?? 0) * 10),
    );
    g.font = '22px monospace';
    g.fillStyle = `rgba(200,205,213,${k})`;
    lines.forEach((line, i) => g.fillText(line, VIEW_W / 2, 384 + i * 40));

    // 一生数据
    g.font = '20px monospace';
    g.fillStyle = `rgba(138,143,152,${k})`;
    g.fillText(`学识 ${Math.round(p.knowledge)}　·　金钱 ${p.money}　·　心情 ${Math.round((p.stats?.mind ?? 0) * 10)}`, VIEW_W / 2, 540);

    // 重开提示（闪烁）
    if (this.t > 1.4) {
      const blink = 0.55 + 0.45 * Math.sin(this.t * 4);
      g.font = '20px monospace';
      g.fillStyle = `rgba(240,200,120,${blink})`;
      g.fillText('按 E / 点击任意处　开始新的一生', VIEW_W / 2, 640);
    }

    g.textAlign = 'left';
    // 淡入遮罩
    if (k < 1) {
      g.fillStyle = `rgba(0,0,0,${1 - k})`;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }
}
