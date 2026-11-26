// 人生终章：活到 100 岁寿终，展示一生回顾、人生总分/五维/成就墙，然后重新开始。
// 设计原则与年度结算一致：不做复杂动画，淡入后即为完整静态版，按 E / 点击推进。
// 注意：构造时立即把本世总结写进 localStorage 的「历代人生」（life-sim:legacy），
// 因为离开这一页会 clearSave + reload，不先归档就永远丢了。

import { VIEW_H, VIEW_W } from '../config';
import type { GameContext } from '../context';
import type { Scene } from './scene';
import { MAX_AGE } from '../entities/player';
import { clearSave } from '../core/save';
import { arpeggio } from '../core/sfx';
import { refreshScore } from '../score/facts';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID } from '../score/achievements';
import { DIM_COLORS, DIM_NAMES, lifeTitle } from '../score/rules';
import { DIMS } from '../score/types';
import type { Dim } from '../score/types';
import type { LifeRecord } from '../score/store';

const C_GOLD = '#f0c878';
const C_TEXT = '#e8e8e8';
const C_DIM = '#6a7078';

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
  private page: 0 | 1 = 0;

  private readonly total: number;
  private readonly dims: Record<Dim, number>;
  private readonly unlockedIds: Set<string>;
  private readonly legacyBest: number;
  private readonly legacyCount: number;

  constructor(private readonly ctx: GameContext) {
    // 先把推导型来源结算干净（寿终这一岁的 E1/E2、百岁成就等）
    refreshScore(ctx);
    const score = ctx.score;
    const p = ctx.player;
    this.total = score.total();
    this.dims = { ...score.state.dims };
    this.unlockedIds = new Set(
      Object.keys(score.state.achievements).filter((id) => !!ACHIEVEMENT_BY_ID[id]),
    );

    // 立即归档本世总结（不随 clearSave 删除，最多保留 20 条）
    const rec: LifeRecord = {
      name: p.name,
      endedAt: Date.now(),
      age: p.age,
      total: this.total,
      dims: { ...this.dims },
      title: lifeTitle(this.total),
      achievements: [...this.unlockedIds],
    };
    try {
      score.store.archiveLife(rec);
    } catch {
      /* 归档失败不能挡住结局页 */
    }
    let legacy: LifeRecord[] = [];
    try {
      legacy = score.store.listLegacy();
    } catch {
      legacy = [];
    }
    this.legacyBest = legacy.reduce((m, r) => Math.max(m, r.total), 0);
    this.legacyCount = legacy.length;

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
      if (this.page === 0) {
        this.page = 1;
        return;
      }
      this.done = true;
      clearSave(); // 这一生结束了，自动存档一并清掉，下次进来是新的开始
      location.reload();
    }
  }

  render(g: CanvasRenderingContext2D): void {
    g.fillStyle = '#0b0d12';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    const k = Math.min(1, this.t / 1.2); // 淡入
    // 中心微光，把注意力收到文字上
    const glow = g.createRadialGradient(VIEW_W / 2, 300, 40, VIEW_W / 2, 300, 620);
    glow.addColorStop(0, `rgba(240,200,120,${0.10 * k})`);
    glow.addColorStop(1, 'rgba(240,200,120,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, VIEW_W, VIEW_H);

    if (this.page === 0) this.renderSummary(g, k);
    else this.renderWall(g, k);
  }

  private renderSummary(g: CanvasRenderingContext2D, k: number): void {
    const p = this.ctx.player;
    g.textAlign = 'center';

    g.font = '18px monospace';
    g.fillStyle = `rgba(106,112,120,${k})`;
    g.fillText('人 生 终 章', VIEW_W / 2, 120);

    g.font = '52px monospace';
    g.fillStyle = `rgba(232,232,232,${k})`;
    g.fillText('你的一生结束了', VIEW_W / 2, 180);

    g.font = '26px monospace';
    g.fillStyle = `rgba(240,200,120,${k})`;
    g.fillText(`${p.name} · 享年 ${MAX_AGE} 岁`, VIEW_W / 2, 236);

    g.strokeStyle = `rgba(42,46,56,${k})`;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(VIEW_W / 2 - 240, 272);
    g.lineTo(VIEW_W / 2 + 240, 272);
    g.stroke();

    // 墓志铭
    const lines = epitaph(
      p.money,
      p.knowledge,
      Math.round((p.stats?.health ?? 0) * 10),
      Math.round((p.stats?.mind ?? 0) * 10),
    );
    g.font = '21px monospace';
    g.fillStyle = `rgba(200,205,213,${k})`;
    lines.forEach((line, i) => g.fillText(line, VIEW_W / 2, 304 + i * 36));

    // 人生总分 + 称号（金色大字）
    g.font = '40px monospace';
    g.fillStyle = `rgba(240,200,120,${k})`;
    g.fillText(`人生总分 ${this.total} · ${lifeTitle(this.total)}`, VIEW_W / 2, 432);

    // 五维一行
    g.font = '19px monospace';
    g.fillStyle = `rgba(200,205,213,${k})`;
    g.fillText(
      DIMS.map((d) => `${DIM_NAMES[d]} ${this.dims[d]}`).join('　·　'),
      VIEW_W / 2,
      484,
    );

    // 成就进度 + 历代最高
    g.font = '18px monospace';
    g.fillStyle = `rgba(138,143,152,${k})`;
    g.fillText(
      `成就 ${this.unlockedIds.size} / ${ACHIEVEMENTS.length}　·　历代最高 ${Math.max(this.legacyBest, this.total)}（共 ${this.legacyCount} 世）`,
      VIEW_W / 2,
      520,
    );

    // 一生数据
    g.font = '18px monospace';
    g.fillStyle = `rgba(138,143,152,${k})`;
    g.fillText(
      `学识 ${Math.round(p.knowledge)}　·　金钱 ${p.money}　·　心情 ${Math.round((p.stats?.mind ?? 0) * 10)}`,
      VIEW_W / 2,
      560,
    );

    if (this.t > 1.4) {
      const blink = 0.55 + 0.45 * Math.sin(this.t * 4);
      g.font = '20px monospace';
      g.fillStyle = `rgba(240,200,120,${blink})`;
      g.fillText('按 E / 点击任意处　查看成就墙', VIEW_W / 2, 640);
    }
    g.textAlign = 'left';

    if (k < 1) {
      g.fillStyle = `rgba(0,0,0,${1 - k})`;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  /** 成就墙：38 格网格，已解锁亮、未解锁暗；hidden 未解锁显示 ？ */
  private renderWall(g: CanvasRenderingContext2D, k: number): void {
    g.textAlign = 'center';
    g.font = '34px monospace';
    g.fillStyle = `rgba(240,200,120,${k})`;
    g.fillText('成 就 墙', VIEW_W / 2, 56);
    g.font = '16px monospace';
    g.fillStyle = `rgba(138,143,152,${k})`;
    g.fillText(`已解锁 ${this.unlockedIds.size} / ${ACHIEVEMENTS.length}`, VIEW_W / 2, 104);

    const cols = 8;
    const cellW = 136;
    const cellH = 66;
    const x0 = (VIEW_W - cols * cellW) / 2;
    const y0 = 156;
    ACHIEVEMENTS.forEach((def, i) => {
      const cx = x0 + (i % cols) * cellW;
      const cy = y0 + Math.floor(i / cols) * cellH;
      const got = this.unlockedIds.has(def.id);
      const hidden = !!def.hidden && !got;
      g.globalAlpha = k;
      g.fillStyle = got ? 'rgba(64,52,24,0.9)' : 'rgba(20,23,30,0.9)';
      g.fillRect(cx, cy, cellW - 8, cellH - 8);
      g.strokeStyle = got ? DIM_COLORS[def.dim] : '#2a2e38';
      g.lineWidth = got ? 2 : 1;
      g.strokeRect(cx + 1, cy + 1, cellW - 10, cellH - 10);
      g.font = '13px monospace';
      g.fillStyle = got ? '#ffd166' : hidden ? '#4a505c' : '#6a7078';
      g.fillText(hidden ? '？？？' : def.name, cx + (cellW - 8) / 2, cy + 18);
      g.font = '11px monospace';
      g.fillStyle = got ? '#8a8f98' : '#3a3f4a';
      g.fillText(DIM_NAMES[def.dim], cx + (cellW - 8) / 2, cy + 40);
      g.globalAlpha = 1;
    });

    if (this.t > 1.4) {
      const blink = 0.55 + 0.45 * Math.sin(this.t * 4);
      g.font = '20px monospace';
      g.fillStyle = `rgba(240,200,120,${blink})`;
      g.fillText('按 E / 点击任意处　开始新的一生', VIEW_W / 2, 640);
    }
    g.textAlign = 'left';
  }
}
