import { VIEW_H, VIEW_W } from '../config';

// HUD：区域名、操作提示、区域切换 Toast（1280x720 版）
// 角色五维数值已由右侧属性面板接管，这里不再重复
export class Hud {
  private toastMsg = '';
  private toastT = 0;
  // 触屏模式：屏幕底部被虚拟按键占着，键盘快捷键提示既没用又会被按钮挡住，直接不画
  private touchMode = false;

  setTouchMode(on: boolean): void {
    this.touchMode = on;
  }

  toast(msg: string): void {
    this.toastMsg = msg;
    this.toastT = 2.2;
  }

  update(dt: number): void {
    if (this.toastT > 0) this.toastT -= dt;
  }

  private bar(g: CanvasRenderingContext2D, text: string, x: number, y: number): void {
    const m = g.measureText(text).width;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(x - 8, y - 5, m + 18, 28);
    g.fillStyle = '#e8e8e8';
    g.fillText(text, x + 1, y);
  }

  draw(g: CanvasRenderingContext2D, regionName: string, drawRegion = true): void {
    g.font = '16px monospace';
    g.textBaseline = 'top';
    if (drawRegion) this.bar(g, `区域 ${regionName}`, 16, 16);
    if (!this.touchMode) {
      this.bar(g, 'WASD 移动 · E 对话 · Q 任务 · H 学校 · Tab 地图 · P 折叠 · Y 属性 · G 存档', 16, VIEW_H - 40);
    }

    if (this.toastT > 0) {
      const m = g.measureText(this.toastMsg).width;
      const x = (VIEW_W - m) / 2;
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(x - 12, 44, m + 24, 28);
      g.fillStyle = '#ffffdd';
      g.fillText(this.toastMsg, x, 50);
    }
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
  }
}
