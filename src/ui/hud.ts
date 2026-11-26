import { VIEW_H, VIEW_W } from '../config';
import type { AchievementDef } from '../score/types';
import { arpeggio } from '../core/sfx';

// HUD：区域名、操作提示、区域切换 Toast（1280x720 版）
// 角色五维数值已由右侧属性面板接管，这里不再重复
// 成就横幅用独立队列，不抢 toast 的唯一槽位（任务完成时两边都能看到）
export class Hud {
  private toastMsg = '';
  private toastT = 0;
  // 触屏模式：屏幕底部被虚拟按键占着，键盘快捷键提示既没用又会被按钮挡住，直接不画
  private touchMode = false;

  // 成就横幅：同一时刻只播一条，其余排队；排队超过 4 条时合并成一条提示
  private banner: AchievementDef | null = null;
  private bannerT = 0;
  private bannerMerged = '';
  private readonly bannerQueue: AchievementDef[] = [];

  setTouchMode(on: boolean): void {
    this.touchMode = on;
  }

  toast(msg: string): void {
    this.toastMsg = msg;
    this.toastT = 2.2;
  }

  /** 成就解锁横幅：入队播放，不影响 toast() */
  achievement(def: AchievementDef): void {
    this.bannerQueue.push(def);
    arpeggio([523.25, 659.25, 783.99]);
  }

  update(dt: number): void {
    if (this.toastT > 0) this.toastT -= dt;

    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) {
        this.bannerT = 0;
        this.banner = null;
        this.bannerMerged = '';
      }
      return;
    }
    if (this.bannerQueue.length === 0) return;
    if (this.bannerQueue.length > 4) {
      this.bannerMerged = `又解锁了 ${this.bannerQueue.length} 个成就（L 查看）`;
      this.bannerQueue.length = 0;
      this.bannerT = 2.6;
      return;
    }
    this.banner = this.bannerQueue.shift() ?? null;
    this.bannerT = 3.3;
  }

  private bar(g: CanvasRenderingContext2D, text: string, x: number, y: number): void {
    const m = g.measureText(text).width;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(x - 8, y - 5, m + 18, 28);
    g.fillStyle = '#e8e8e8';
    g.fillText(text, x + 1, y);
  }

  /** 全屏模态（课堂/考试）里补画成就横幅：场景自己调用，保证解锁提示可见 */
  drawAchievements(g: CanvasRenderingContext2D): void {
    this.drawBanner(g);
  }

  draw(g: CanvasRenderingContext2D, regionName: string, drawRegion = true): void {
    g.font = '16px monospace';
    g.textBaseline = 'top';
    if (drawRegion) this.bar(g, `区域 ${regionName}`, 16, 16);
    if (!this.touchMode) {
      this.bar(g, 'WASD 移动 · E 对话 · Q 任务 · H 学校 · L 成就 · Tab 地图 · P 折叠 · Y 属性 · G 存档', 16, VIEW_H - 40);
    }

    if (this.toastT > 0) {
      const m = g.measureText(this.toastMsg).width;
      const x = (VIEW_W - m) / 2;
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(x - 12, 44, m + 24, 28);
      g.fillStyle = '#ffffdd';
      g.fillText(this.toastMsg, x, 50);
    }

    this.drawBanner(g);
  }

  drawIndoor(g: CanvasRenderingContext2D, name: string): void {
    g.font = '16px monospace';
    g.textBaseline = 'top';
    const title = `— ${name} —`;
    const m = g.measureText(title).width;
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect((VIEW_W - m) / 2 - 12, 14, m + 24, 28);
    g.fillStyle = '#ffffdd';
    g.fillText(title, (VIEW_W - m) / 2, 20);

    const hint = 'WASD/方向键移动 · 走出门回到大地图';
    if (!this.touchMode) {
      const hm = g.measureText(hint).width;
      const hx = (VIEW_W - hm) / 2;
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(hx - 12, VIEW_H - 36, hm + 24, 28);
      g.fillStyle = '#e8e8e8';
      g.fillText(hint, hx, VIEW_H - 30);
    }

    this.drawBanner(g);
  }

  /** 成就横幅：顶部居中、区域 toast 下方（y≈84），金色描边，2 行 */
  private drawBanner(g: CanvasRenderingContext2D): void {
    const def = this.banner;
    const merged = this.bannerMerged;
    if (!def && !merged) return;
    const alpha = Math.min(1, this.bannerT / 0.3);

    const title = def ? `🏆 成就解锁 · ${def.name}` : `🏆 ${merged}`;
    const sub = def ? def.desc : '按 L 打开人生簿查看';
    g.font = '17px monospace';
    const titleW = g.measureText(title).width;
    g.font = '13px monospace';
    const subW = g.measureText(sub).width;
    const w = Math.min(520, Math.max(titleW, subW) + 56);
    const x = (VIEW_W - w) / 2;
    const y = 84;

    g.globalAlpha = alpha;
    g.fillStyle = 'rgba(24,20,10,0.9)';
    g.fillRect(x, y, w, 56);
    g.strokeStyle = '#e8c85a';
    g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, w - 2, 54);

    g.textBaseline = 'top';
    g.textAlign = 'center';
    g.font = '17px monospace';
    g.fillStyle = '#ffd166';
    g.fillText(title, VIEW_W / 2, y + 8);
    g.font = '13px monospace';
    g.fillStyle = '#b9b09a';
    g.fillText(sub, VIEW_W / 2, y + 32);
    if (def) {
      g.fillStyle = '#e8c85a';
      g.font = '13px monospace';
      g.textAlign = 'right';
      g.fillText(`+${def.bonus}`, x + w - 12, y + 8);
    }
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.globalAlpha = 1;
  }
}
