// 玫瑰花园 · 存档面板（HTML 浮层，覆盖在画布之上）
// · 入口是一朵 CSS 画出来的玫瑰（主页面左下 / 游戏内底部居中收起成小花）
// · 打开面板时挂起游戏输入，10 个槽位像 10 朵玫瑰：有种下/读取/删除
// · 存档本体在 IndexedDB（saveSlots.ts），每份带游玩时长
import { MAX_SLOTS, listSlots, readSlot, writeSlot, deleteSlot } from '../core/saveSlots';
import type { SaveSlot } from '../core/saveSlots';
import { restorePlayer, restoreQuests, SAVE_VERSION } from '../core/save';
import { formatPlayMs } from '../core/playtime';
import type { GameContext } from '../context';
import type { Input } from '../core/input';

/** 纯 CSS 玫瑰：外层 8 瓣 + 内层 5 瓣 + 花芯；bud=true 是未绽放的花蕾（灰绿色） */
function roseHTML(bud: boolean, delayMs = 0): string {
  const outer = [0, 45, 90, 135, 180, 225, 270, 315]
    .map((a) => `<i class="petal" style="--a:${a}deg"></i>`)
    .join('');
  const inner = [36, 108, 180, 252, 324]
    .map((a) => `<i class="petal inner" style="--a:${a}deg"></i>`)
    .join('');
  return `<span class="${bud ? 'rose bud' : 'rose'}" style="--d:${delayMs}ms"><i class="stem"></i><i class="leaf l"></i><i class="leaf r"></i><i class="ring">${outer}${inner}<i class="core"></i></i></span>`;
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export class SavePanel {
  private root: HTMLElement | null = null;
  private entry: HTMLElement | null = null;
  private openState = false;
  private busy = false;
  private statusTimer = 0;
  private renderSeq = 0;
  private lastSlot = 0; // 本次会话最近一次存入的槽位（快速保存的目标）

  constructor(
    private readonly ctx: GameContext,
    private readonly input: Input,
    stage: HTMLElement | null,
  ) {
    if (!stage) return;
    this.entry = stage.querySelector<HTMLElement>('#rose-entry');
    if (!this.entry) {
      const b = document.createElement('button');
      b.setAttribute('type', 'button');
      stage.appendChild(b);
      this.entry = b;
    }
    this.entry.innerHTML = `<span class="re-rose">${roseHTML(false)}</span><span class="re-label">存档花园</span>`;
    // 点完立刻移除焦点：焦点留在按钮上时，Space/Enter 会被浏览器当作"按下按钮"，面板会莫名其妙地反复开合
    this.entry.addEventListener('click', () => {
      this.entry?.blur();
      this.toggle();
    });

    const root = document.createElement('div');
    root.id = 'save-ui';
    root.innerHTML = `
      <div class="sv-backdrop"></div>
      <div class="sv-card" role="dialog" aria-label="存档花园" tabindex="-1">
        <header class="sv-head">
          <span class="sv-head-rose">${roseHTML(false)}</span>
          <div class="sv-head-txt">
            <h2>玫瑰花园 · 存档</h2>
            <p>十朵玫瑰，十段人生 · 每朵都记着你的游玩时长</p>
          </div>
          <button class="sbtn primary sv-save" data-act="quicksave" type="button">保存存档</button>
          <button class="sv-close" type="button" aria-label="关闭">×</button>
        </header>
        <div class="sv-status"></div>
        <div class="sv-grid"></div>
        <footer class="sv-foot">Esc / G 关闭 · 存档保存在本机浏览器（IndexedDB）· 游玩时长只累计前台时间</footer>
      </div>`;
    stage.appendChild(root);
    this.root = root;

    root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('.sv-close')) {
        this.close();
        return;
      }
      if (t.classList.contains('sv-backdrop')) {
        this.close();
        return;
      }
      const btn = t.closest<HTMLButtonElement>('button[data-act]');
      if (btn) void this.onAction(btn);
    });

    // 面板自己的按键：Esc/G 关闭，G 也能打开（游戏输入被挂起不影响这里）
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (this.openState && (e.code === 'Escape' || e.code === 'KeyG')) {
        e.preventDefault();
        this.close();
      } else if (!this.openState && e.code === 'KeyG') {
        this.openUp();
      }
    });
  }

  isOpen(): boolean {
    return this.openState;
  }

  toggle(): void {
    if (this.openState) this.close();
    else this.openUp();
  }

  private openUp(): void {
    if (!this.root || this.openState) return;
    this.openState = true;
    this.input.setSuspended(true);
    this.root.classList.add('on');
    // 焦点交给面板卡片（tabindex=-1，非可点元素）：Space/Enter 落在它身上不会触发任何按钮
    const card = this.root.querySelector<HTMLElement>('.sv-card');
    card?.focus({ preventScroll: true });
    this.flash('');
    this.render();
    // 花开动画：等一帧让过渡生效，再统一绽放
    requestAnimationFrame(() => {
      this.root
        ?.querySelector('.sv-head-rose .rose')
        ?.classList.add('bloom');
    });
  }

  private close(): void {
    if (!this.root) return;
    this.openState = false;
    this.input.setSuspended(false);
    this.root.classList.remove('on');
  }

  private flash(msg: string): void {
    const el = this.root?.querySelector<HTMLElement>('.sv-status');
    if (!el) return;
    window.clearTimeout(this.statusTimer);
    el.textContent = msg;
    el.classList.toggle('show', msg !== '');
    if (msg) {
      this.statusTimer = window.setTimeout(() => {
        el.textContent = '';
        el.classList.remove('show');
      }, 3200);
    }
  }

  private async render(): Promise<void> {
    const grid = this.root?.querySelector<HTMLElement>('.sv-grid');
    if (!grid) return;
    const seq = ++this.renderSeq;
    grid.innerHTML = `<div class="sv-loading">花园打理中…</div>`;
    const rows = await listSlots().catch(() => null);
    if (!rows || seq !== this.renderSeq) return; // 面板已关/重开，丢弃过期结果

    const started = !!this.ctx.player.stats;
    grid.innerHTML = rows
      .map((rec, i) => this.slotHTML(i + 1, rec, started))
      .join('');
    requestAnimationFrame(() => {
      grid.querySelectorAll<HTMLElement>('.rose:not(.bud)').forEach((r, i) => {
        r.style.setProperty('--d', `${i * 60}ms`);
        r.classList.add('bloom');
      });
    });
  }

  private slotHTML(slot: number, rec: SaveSlot | null, started: boolean): string {
    const rose = roseHTML(!rec, slot * 60);
    if (!rec) {
      const saveBtn = started
        ? `<button class="sbtn" data-act="save" data-slot="${slot}">种下</button>`
        : '';
      return `
        <div class="slot empty">
          <span class="sl-rose">${rose}</span>
          <div class="sl-info"><b>槽位 ${slot} · 空花蕾</b><span>还没有人为这段人生驻足</span></div>
          <div class="sl-acts">${saveBtn}</div>
        </div>`;
    }
    const corrupt = rec.data.v !== SAVE_VERSION;
    const name = corrupt ? '旧版本存档' : `${esc(rec.name)} ${rec.age} 岁`;
    const meta = corrupt
      ? '格式已过期，无法读取'
      : `游玩 ${formatPlayMs(rec.playMs)} · ${rec.money} 金 · ${fmtDate(rec.savedAt)}`;
    const acts = [
      started && !corrupt ? `<button class="sbtn" data-act="save" data-slot="${slot}">种下</button>` : '',
      !corrupt ? `<button class="sbtn primary" data-act="load" data-slot="${slot}">读取</button>` : '',
      `<button class="sbtn danger" data-act="del" data-slot="${slot}">删除</button>`,
    ].join('');
    return `
      <div class="slot occupied${corrupt ? ' corrupt' : ''}">
        <span class="sl-rose">${rose}</span>
        <div class="sl-info"><b>槽位 ${slot} · ${name}</b><span>${meta}</span></div>
        <div class="sl-acts">${acts}</div>
      </div>`;
  }

  private async onAction(btn: HTMLButtonElement): Promise<void> {
    const act = btn.dataset.act;
    const slot = Number(btn.dataset.slot);
    if (!act || this.busy) return;
    // 快速保存不带槽位号（目标在分支里自己决定），其余操作必须有合法槽位
    if (act !== 'quicksave' && !Number.isInteger(slot)) return;
    this.busy = true;
    try {
      if (act === 'save') {
        const rec = await writeSlot(slot, this.ctx);
        this.lastSlot = slot;
        this.flash(`玫瑰已种下 · 槽位 ${slot}（${rec.name} ${rec.age} 岁 · 游玩 ${formatPlayMs(rec.playMs)}）`);
        this.ctx.hud.toast(`已存档 · 槽位 ${slot}`);
        await this.render();
      } else if (act === 'quicksave') {
        // 头部「保存存档」：优先写进最近用过的槽位，否则找第一个空槽；全满则提示手动选择
        let target = this.lastSlot;
        if (!target) {
          const rows = await listSlots();
          const firstEmpty = rows.findIndex((r) => !r);
          if (firstEmpty < 0) {
            this.flash('花园已满：十朵玫瑰都已绽放，请在列表里选一朵替换（种下）');
            return;
          }
          target = firstEmpty + 1;
        }
        const rec = await writeSlot(target, this.ctx);
        this.lastSlot = target;
        this.flash(`已保存到槽位 ${target}（${rec.name} ${rec.age} 岁 · 游玩 ${formatPlayMs(rec.playMs)}）`);
        this.ctx.hud.toast(`已存档 · 槽位 ${target}`);
        await this.render();
      } else if (act === 'load') {
        const rec = await readSlot(slot);
        if (!rec || rec.data.v !== SAVE_VERSION) {
          this.flash('这朵玫瑰已经枯萎：存档不存在或版本不符');
          return;
        }
        restorePlayer(this.ctx, rec.data);
        restoreQuests(this.ctx, rec.data);
        this.close();
        this.ctx.scenes.request(this.ctx.overworld);
        this.ctx.hud.toast(
          `走进槽位 ${slot} 的人生 · ${this.ctx.player.name} ${this.ctx.player.age} 岁（游玩 ${formatPlayMs(rec.playMs)}）`,
        );
      } else if (act === 'del') {
        if (btn.dataset.armed !== '1') {
          btn.dataset.armed = '1';
          btn.textContent = '确认枯萎？';
          btn.classList.add('armed');
          return;
        }
        await deleteSlot(slot);
        this.flash(`槽位 ${slot} 的玫瑰已归于尘土`);
        await this.render();
      }
    } catch (err) {
      this.flash(err instanceof Error ? err.message : '操作失败');
    } finally {
      this.busy = false;
    }
  }
}
