// 键盘/触屏输入：按住集合 + 按键边沿检测 + 指针点击（坐标已换算为 canvas 内部像素）
export interface PointerClick {
  x: number;
  y: number;
}

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private click: PointerClick | null = null;
  private suspended = false; // HTML 浮层（玫瑰存档面板）打开时挂起，游戏不吃任何按键/点击

  constructor(canvas?: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (this.suspended) {
        // 挂起时仍拦住会滚页面的键，但不再交给游戏
        if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
        return;
      }
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.pressed.clear();
    });
    if (canvas) {
      // pointerdown 同时覆盖鼠标与触屏；触摸时阻止默认行为以免触发滚动/双击缩放
      canvas.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (this.suspended) return;
        const r = canvas.getBoundingClientRect();
        this.click = {
          x: (e.clientX - r.left) * (canvas.width / r.width),
          y: (e.clientY - r.top) * (canvas.height / r.height),
        };
      });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  /** 浮层开关：打开时清空按住状态并忽略新输入，避免面板后面的人物自己走动 */
  setSuspended(on: boolean): void {
    this.suspended = on;
    if (on) {
      this.down.clear();
      this.pressed.clear();
      this.click = null;
    }
  }

  /** 触屏虚拟按键：直接注入按住/边沿状态，键盘与虚拟键走同一套读取逻辑 */
  setVirtual(code: string, down: boolean): void {
    if (down) {
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    } else {
      this.down.delete(code);
    }
  }

  isDown(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  wasPressed(...codes: string[]): boolean {
    return codes.some((c) => this.pressed.has(c));
  }

  /** 本帧是否有任意按键（结算屏「任意键跳过动画」用） */
  anyPressed(): boolean {
    return this.pressed.size > 0;
  }

  consumeClick(): PointerClick | null {
    const c = this.click;
    this.click = null;
    return c;
  }

  // 每帧末尾调用，清掉边沿标记与未消费的点击
  endFrame(): void {
    this.pressed.clear();
    this.click = null;
  }
}
