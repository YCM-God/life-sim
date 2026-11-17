import type { Input } from '../core/input';

// 触屏虚拟按键：左下方向键 + 右下 8 个功能键
// 通过 Input.setVirtual 注入与键盘一致的按键状态，各场景无需感知触屏。
// 键位对齐桌面端全部快捷键：E 互动 / Q 任务 / Tab 地图 / Y 属性 / H 学校 / T 快进 / C 打车 / Esc 返回
// （旧版漏了 Y 和 H，手机上根本打不开属性面板、学校面板）
let touchCache: boolean | null = null;

/** 是否触屏模式：粗指针设备，或 URL 带 ?touch=1 强制开启（便于桌面调试） */
export function isTouchMode(): boolean {
  if (touchCache !== null) return touchCache;
  const q = new URLSearchParams(location.search);
  if (q.has('touch')) {
    touchCache = q.get('touch') !== '0';
    return touchCache;
  }
  touchCache =
    (window.matchMedia?.('(pointer: coarse)').matches ?? false) || 'ontouchstart' in window;
  return touchCache;
}

// 功能键：2 行 × 4 列，E 放第一格并高亮（按得最多）
const ACTION_KEYS: Array<{ code: string; label: string; accent?: boolean }> = [
  { code: 'KeyE', label: '互动', accent: true },
  { code: 'KeyQ', label: '任务' },
  { code: 'Tab', label: '地图' },
  { code: 'KeyY', label: '属性' },
  { code: 'KeyH', label: '学校' },
  { code: 'KeyT', label: '快进' },
  { code: 'KeyC', label: '打车' },
  { code: 'Escape', label: '返回' },
];

const PAD_KEYS: Array<{ code: string; label: string; cls: string }> = [
  { code: 'ArrowUp', label: '▲', cls: 'up' },
  { code: 'ArrowLeft', label: '◀', cls: 'left' },
  { code: 'ArrowRight', label: '▶', cls: 'right' },
  { code: 'ArrowDown', label: '▼', cls: 'down' },
];

export class TouchControls {
  private held = new Map<number, string>(); // pointerId → 按住的键
  private ui: HTMLElement | null = null;

  constructor(
    private readonly input: Input,
    private readonly stage: HTMLElement,
  ) {
    if (!isTouchMode()) return;
    const ui = stage.querySelector<HTMLElement>('#touch-ui');
    if (!ui) return;
    this.ui = ui;

    const pad = PAD_KEYS.map(
      (k) => `<button class="tbtn pad ${k.cls}" data-key="${k.code}">${k.label}</button>`,
    ).join('');
    const acts = ACTION_KEYS.map(
      (k) => `<button class="tbtn act${k.accent ? ' accent' : ''}" data-key="${k.code}">${k.label}</button>`,
    ).join('');
    ui.innerHTML = `
      <div class="dpad">${pad}</div>
      <div class="actions">${acts}</div>
      <div id="rotate-hint">
        <span id="rh-text">建议横屏，画面更大</span>
        <button class="rh-btn" type="button" data-act="landscape">横屏</button>
        <button class="rh-close" type="button" data-act="close" aria-label="关闭提示">×</button>
      </div>
    `;
    ui.classList.add('on');
    this.bind(ui);
    this.bindRotateHint(ui);
  }

  /**
   * 竖屏提示：可关闭、不挡游戏。
   * 「横屏」= 全屏 + 方向锁（安卓可绕过系统的竖屏锁定）；锁不住就提示玩家手动横过来。
   * 竖屏本身照样能玩，只是画面小——绝不再用全屏遮罩拦人。
   */
  private bindRotateHint(ui: HTMLElement): void {
    const hint = ui.querySelector<HTMLElement>('#rotate-hint');
    if (!hint) return;
    hint.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      if (btn.dataset.act === 'close') {
        hint.classList.add('closed');
        return;
      }
      void this.goLandscape(hint);
    });
  }

  private async goLandscape(hint: HTMLElement): Promise<void> {
    const root = document.documentElement;
    let locked = false;
    try {
      if (!document.fullscreenElement) await root.requestFullscreen?.();
    } catch {
      // iOS 不允许对普通容器全屏：忽略，继续尝试方向锁
    }
    try {
      const so = screen.orientation as unknown as { lock?: (o: string) => Promise<void> };
      await so.lock?.('landscape');
      locked = true;
    } catch {
      // 锁不住（iOS / 内置浏览器）：只能提示玩家自己转
    }
    if (!locked) {
      const text = hint.querySelector<HTMLElement>('#rh-text');
      if (text) text.textContent = '请把手机横过来玩';
      window.setTimeout(() => {
        if (text) text.textContent = '建议横屏，画面更大';
      }, 4000);
    }
  }

  private bind(ui: HTMLElement): void {
    ui.addEventListener('pointerdown', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-key]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        btn.setPointerCapture?.(e.pointerId);
      } catch {
        // 个别浏览器不支持对触点做指针捕获，松手判断由 window 监听兜底
      }
      const code = btn.dataset.key;
      if (!code) return;
      btn.classList.add('down');
      this.held.set(e.pointerId, code);
      this.input.setVirtual(code, true);
    });

    const release = (e: PointerEvent): void => {
      const code = this.held.get(e.pointerId);
      if (!code) return;
      this.held.delete(e.pointerId);
      this.input.setVirtual(code, false);
      this.clearDown(code);
    };
    ui.addEventListener('pointerup', release);
    ui.addEventListener('pointercancel', release);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
    // 长按不弹系统菜单
    ui.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /**
   * 只在真正的游戏场景里显示虚拟键：创建角色界面要用整个画面点按钮，
   * 按键盖在上面会挡住「开启新人生」。竖屏提示不受影响。
   */
  setVisible(on: boolean): void {
    this.ui?.classList.toggle('playing', on);
    if (!on) this.releaseAll();
  }

  private clearDown(code: string): void {
    for (const b of this.stage.querySelectorAll<HTMLElement>('.tbtn.down')) {
      if (b.dataset.key === code) b.classList.remove('down');
    }
  }

  // 失焦/切后台时松开所有虚拟键，避免角色一直朝一个方向走
  private releaseAll(): void {
    for (const code of this.held.values()) this.input.setVirtual(code, false);
    this.held.clear();
    for (const b of this.stage.querySelectorAll<HTMLElement>('.tbtn.down')) b.classList.remove('down');
  }
}
