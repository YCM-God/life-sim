// 场景协议与场景管理器：切换带黑场淡入淡出，避免瞬切
export interface Scene {
  enter?(params?: any): void;
  exit?(): void;
  update(dt: number): void;
  render(g: CanvasRenderingContext2D): void;
}

import { VIEW_H, VIEW_W } from '../config';

export class SceneManager {
  current: Scene | null = null;

  get isTransitioning(): boolean {
    return this.fading !== 0 || this.next !== null;
  }
  private alpha = 1;
  private fading = 0; // -1 淡出中 / 1 淡入中 / 0 空闲
  private next: { scene: Scene; params?: any } | null = null;

  set(scene: Scene, params?: any): void {
    this.current = scene;
    scene.enter?.(params);
  }

  request(scene: Scene, params?: any): void {
    if (this.fading !== 0) return;
    this.next = { scene, params };
    this.fading = -1;
  }

  update(dt: number): void {
    if (this.fading === -1) {
      this.alpha -= dt * 4;
      if (this.alpha <= 0) {
        this.alpha = 0;
        this.current?.exit?.();
        this.current = this.next!.scene;
        this.current.enter?.(this.next!.params);
        this.next = null;
        this.fading = 1;
      }
    } else if (this.fading === 1) {
      this.alpha += dt * 4;
      if (this.alpha >= 1) {
        this.alpha = 1;
        this.fading = 0;
      }
    }
    this.current?.update(dt);
  }

  render(g: CanvasRenderingContext2D): void {
    this.current?.render(g);
    if (this.alpha < 1) {
      g.fillStyle = `rgba(0,0,0,${this.alpha})`;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }
}
