import { VIEW_H, VIEW_W } from '../config';
import type { GameContext } from '../context';
import type { Scene } from './scene';
import { drawCharacter, MALE_LOOK, FEMALE_LOOK } from '../entities/player';
import type { Appearance } from '../entities/player';
import { BASE_HEALTH, BASE_MIND, rollTalents, talentTier } from '../data/character';
import type { Gender } from '../data/character';
import { hash2 } from '../map/tiles';
import { clearSave, hasSave, loadSave, restorePlayer, restoreQuests } from '../core/save';
import { resetPlayTime } from '../core/playtime';

// 创建角色场景：选性别 → 点「三分天注定」抽取天赋（滚动定格动画）→ 进入游戏
// 背景：左 50% 大自然（天空/云/草地/风车），右 50% 城市（暮色楼群/亮灯窗/马路车流）
type Phase = 'idle' | 'rolling' | 'done';

const TALENT_LABELS = ['智力', '颜值', '家境'] as const;
// 三项天赋依次定格的时间点（秒）
const SETTLE_AT = [0.7, 1.25, 1.8];
const ROLL_END = 2.0;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// 城市楼群（x 为绝对坐标，h 为高度，地面在 y=470）
const BUILDINGS = [
  { x: 648, w: 56, h: 200 }, { x: 712, w: 40, h: 150 }, { x: 760, w: 64, h: 240 },
  { x: 832, w: 48, h: 180 }, { x: 888, w: 60, h: 210 }, { x: 956, w: 44, h: 160 },
  { x: 1008, w: 58, h: 230 }, { x: 1074, w: 46, h: 190 }, { x: 1128, w: 62, h: 250 },
  { x: 1198, w: 44, h: 170 }, { x: 1250, w: 38, h: 210 },
];
const SKYLINE_COLORS = ['#262a36', '#2b2f3d', '#232735'];

export class CreationScene implements Scene {
  private gender: Gender = 'male';
  private phase: Phase = 'idle';
  private talents = rollTalents(); // 抽取瞬间即定，动画只是逐步揭示
  private showVals = [0, 0, 0];    // 滚动中显示的数字
  private locked = [false, false, false];
  private rollElapsed = 0;
  private rollTick = 0;
  private animT = 0;               // 背景动画时钟
  private savedAvailable = hasSave(); // 有存档时多一个「继续上次的人生」

  constructor(private readonly ctx: GameContext) {}

  private get looks(): Record<Gender, Appearance> {
    return { male: MALE_LOOK, female: FEMALE_LOOK };
  }

  private boxRect(i: number): Rect {
    const boxW = 240, boxH = 220, gap = 80;
    const x0 = (VIEW_W - (boxW * 2 + gap)) / 2;
    return { x: x0 + i * (boxW + gap), y: 140, w: boxW, h: boxH };
  }

  private buttonRect(): Rect {
    return { x: (VIEW_W - 360) / 2, y: 500, w: 360, h: 64 };
  }

  private startRect(): Rect {
    return { x: (VIEW_W - 360) / 2, y: 576, w: 360, h: 64 };
  }

  /** 右上角「继续上次的人生」按钮：只在本地有存档时出现 */
  private continueRect(): Rect {
    return { x: VIEW_W - 328, y: 24, w: 304, h: 52 };
  }

  private inRect(r: Rect, p: { x: number; y: number } | null): boolean {
    return !!p && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  private startRoll(): void {
    this.talents = rollTalents();
    this.showVals = [0, 0, 0];
    this.locked = [false, false, false];
    this.rollElapsed = 0;
    this.rollTick = 0;
    this.phase = 'rolling';
  }

  update(dt: number): void {
    const { input } = this.ctx;
    this.animT += dt; // 背景动画始终走
    const click = input.consumeClick();

    // 续档：优先级最高，点了就直接回到上次的人生
    if (this.savedAvailable && this.inRect(this.continueRect(), click)) {
      this.continueSaved();
      return;
    }

    // 性别选择：点击卡片或方向键
    if (input.wasPressed('ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD')) {
      this.gender = this.gender === 'male' ? 'female' : 'male';
    }
    if (this.phase !== 'rolling') {
      if (this.inRect(this.boxRect(0), click)) this.gender = 'male';
      if (this.inRect(this.boxRect(1), click)) this.gender = 'female';
    }

    if (this.phase === 'rolling') {
      this.rollElapsed += dt;
      this.rollTick -= dt;
      if (this.rollTick <= 0) {
        this.rollTick = 0.05; // 每 50ms 换一批数字
        for (let i = 0; i < 3; i++) {
          if (!this.locked[i]) this.showVals[i] = Math.floor(Math.random() * 11);
        }
      }
      for (let i = 0; i < 3; i++) {
        if (!this.locked[i] && this.rollElapsed >= SETTLE_AT[i]) this.locked[i] = true;
      }
      if (this.rollElapsed >= ROLL_END) this.phase = 'done';
      return;
    }

    // 抽取完成后：点击「开启新人生」进入游戏（优先于重新抽取）
    if (this.phase === 'done' && this.inRect(this.startRect(), click)) {
      this.startGame();
      return;
    }

    // 抽取按钮：点击 / Space / R
    if (this.inRect(this.buttonRect(), click) || input.wasPressed('Space', 'KeyR')) {
      this.startRoll();
      return;
    }

    // 抽取完成后才能开始人生
    if (this.phase === 'done' && input.wasPressed('Enter', 'NumpadEnter')) {
      this.startGame();
    }
  }

  private startGame(): void {
    clearSave(); // 新开一局：把上一局的存档清掉，避免 5 秒后自动存档把旧档写回来
    resetPlayTime(); // 新人生从头计时
    const t = this.talents;
    this.ctx.player.setCharacter(this.gender, {
      int: t.int,
      look: t.look,
      family: t.family,
      health: BASE_HEALTH,
      mind: BASE_MIND,
    });
    this.ctx.scenes.request(this.ctx.overworld);
  }

  /** 读档并直接回到大地图 */
  private continueSaved(): void {
    const d = loadSave();
    if (!d) {
      this.savedAvailable = false;
      return;
    }
    restorePlayer(this.ctx, d);
    restoreQuests(this.ctx, d);
    this.ctx.hud.toast(`继续上次的人生 · ${this.ctx.player.age} 岁`);
    this.ctx.scenes.request(this.ctx.overworld);
  }

  // ---- 背景：左自然 / 右城市，各占 50% ----
  private drawBackdrop(g: CanvasRenderingContext2D): void {
    const t = this.animT;
    const half = VIEW_W / 2;
    const horizon = 470;

    // ===== 左半：大自然 =====
    g.fillStyle = '#8ec9e8';
    g.fillRect(0, 0, half, horizon);
    g.fillStyle = '#a8d8f0'; // 近地平线亮带
    g.fillRect(0, 300, half, horizon - 300);
    // 太阳
    g.fillStyle = '#f5e6a8';
    g.fillRect(96, 60, 44, 44);
    g.fillStyle = '#f9efc4';
    g.fillRect(106, 70, 24, 24);
    // 云（缓慢漂移）
    const cloud = (bx: number, by: number, s: number, off: number) => {
      const x = ((bx + t * 7 + off) % (half + 220)) - 110;
      g.fillStyle = 'rgba(255,255,255,0.92)';
      g.fillRect(x, by, Math.round(54 * s), Math.round(14 * s));
      g.fillRect(x + Math.round(10 * s), by - Math.round(8 * s), Math.round(30 * s), Math.round(8 * s));
      g.fillRect(x + Math.round(26 * s), by + Math.round(8 * s), Math.round(34 * s), Math.round(8 * s));
    };
    cloud(60, 96, 1.2, 0);
    cloud(340, 156, 0.9, 180);
    cloud(180, 216, 0.7, 340);
    // 草地
    g.fillStyle = '#4d8f3a';
    g.fillRect(0, horizon, half, VIEW_H - horizon);
    g.fillStyle = '#5aa346'; // 地平线亮草带
    g.fillRect(0, horizon, half, 20);
    g.fillStyle = '#457f33'; // 近景深色草
    g.fillRect(0, 686, half, VIEW_H - 686);
    // 灌木与野花
    g.fillStyle = '#3c6e2f';
    g.fillRect(56, 656, 44, 20);
    g.fillRect(66, 646, 24, 12);
    const flowers: [number, number, string][] = [
      [40, 600, '#f0ead8'], [120, 560, '#e8c84a'], [320, 640, '#f0ead8'],
      [420, 580, '#e86a8a'], [520, 660, '#f0ead8'], [250, 690, '#e8c84a'],
    ];
    for (const [fx, fy, c] of flowers) {
      g.fillStyle = c;
      g.fillRect(fx, fy, 4, 4);
      g.fillStyle = '#4d8f3a';
      g.fillRect(fx + 1, fy + 4, 2, 4);
    }
    // 风车
    const hubX = 210, hubY = 428, groundY = 664;
    g.fillStyle = 'rgba(0,0,0,0.18)'; // 塔影
    g.fillRect(hubX - 36, groundY - 4, 72, 8);
    g.fillStyle = '#e3d6bd'; // 塔身（微锥形）
    g.beginPath();
    g.moveTo(hubX - 26, groundY);
    g.lineTo(hubX + 26, groundY);
    g.lineTo(hubX + 10, hubY);
    g.lineTo(hubX - 10, hubY);
    g.closePath();
    g.fill();
    g.fillStyle = '#c9b89a'; // 塔身砖缝
    for (let y = groundY - 30; y > hubY + 6; y -= 26) g.fillRect(hubX - 22, y, 44, 2);
    g.fillStyle = '#6b4a2b'; // 门
    g.fillRect(hubX - 10, groundY - 36, 20, 36);
    g.fillStyle = '#8a4a3c'; // 顶帽
    g.beginPath();
    g.moveTo(hubX - 22, hubY);
    g.lineTo(hubX + 22, hubY);
    g.lineTo(hubX, hubY - 28);
    g.closePath();
    g.fill();
    // 风叶（旋转）
    g.save();
    g.translate(hubX, hubY);
    g.rotate(t * 0.5);
    for (let k = 0; k < 4; k++) {
      g.fillStyle = '#f0ead8';
      g.fillRect(-7, -108, 14, 92);
      g.fillStyle = '#c9b18a';
      g.fillRect(-7, -108, 3, 92);
      g.fillRect(-7, -108, 14, 4);
      g.rotate(Math.PI / 2);
    }
    g.restore();
    g.fillStyle = '#8a6f55'; // 轮毂
    g.fillRect(hubX - 9, hubY - 9, 18, 18);
    g.fillStyle = '#c9b18a';
    g.fillRect(hubX - 4, hubY - 4, 8, 8);

    // ===== 右半：城市 =====
    g.fillStyle = '#2e3242'; // 暮色天空
    g.fillRect(half, 0, half, horizon);
    g.fillStyle = '#4b4266'; // 地平线暮光
    g.fillRect(half, 370, half, horizon - 370);
    // 星
    g.fillStyle = '#c8ccd8';
    const stars: [number, number][] = [[700, 50], [790, 90], [870, 40], [960, 110], [1050, 60], [1220, 130], [1180, 36], [760, 180], [920, 200]];
    for (const [sx, sy] of stars) g.fillRect(sx, sy, 3, 3);
    // 月亮
    g.fillStyle = '#e8e4d8';
    g.fillRect(1120, 56, 36, 36);
    g.fillStyle = '#c9c4b4';
    g.fillRect(1130, 66, 8, 8);
    g.fillRect(1144, 78, 6, 6);
    // 楼群剪影 + 亮灯窗
    BUILDINGS.forEach((b, bi) => {
      const top = horizon - b.h;
      g.fillStyle = SKYLINE_COLORS[bi % SKYLINE_COLORS.length];
      g.fillRect(b.x, top, b.w, b.h);
      const cols = Math.floor((b.w - 8) / 12);
      const rows = Math.floor((b.h - 12) / 16);
      for (let ci = 0; ci < cols; ci++) {
        for (let ri = 0; ri < rows; ri++) {
          const lit = hash2(bi * 31 + ci * 7, ri * 13 + bi);
          if (lit < 0.3) {
            g.fillStyle = lit < 0.06 ? '#7fd0e8' : '#e8c85a';
            g.fillRect(b.x + 5 + ci * 12, top + 6 + ri * 16, 5, 7);
          }
        }
      }
    });
    // 楼顶红灯（航空障碍灯，闪烁）
    if (Math.sin(t * 2.4) > 0) {
      g.fillStyle = '#e86a5a';
      g.fillRect(1128 + 24, horizon - 250 - 8, 6, 6);
      g.fillRect(760 + 28, horizon - 240 - 8, 6, 6);
    }
    // 马路
    g.fillStyle = '#3c3f47';
    g.fillRect(half, 600, half, VIEW_H - 600);
    g.fillStyle = '#565a64'; // 路缘
    g.fillRect(half, 600, half, 8);
    // 移动的车道虚线
    g.fillStyle = '#c9b458';
    const dashOff = (t * 80) % 44;
    for (let x = half - dashOff; x < VIEW_W; x += 44) g.fillRect(x, 654, 22, 4);
    // 车流
    const car = (laneY: number, dir: 1 | -1, speed: number, off: number, color: string) => {
      const span = half + 160;
      const rel = dir === 1 ? ((t * speed + off) % span) - 80 : span - 80 - ((t * speed + off) % span);
      const x = half + rel;
      g.fillStyle = color;
      g.fillRect(x, laneY, 60, 20);
      g.fillRect(x + 12, laneY - 12, 32, 12); // 车厢
      g.fillStyle = '#bfe3f0';
      g.fillRect(x + 16, laneY - 9, 24, 8); // 车窗
      g.fillStyle = '#15161c';
      g.fillRect(x + 8, laneY + 14, 12, 12); // 车轮
      g.fillRect(x + 40, laneY + 14, 12, 12);
      g.fillStyle = dir === 1 ? '#ffe9a8' : '#e86a5a'; // 前灯/尾灯
      g.fillRect(dir === 1 ? x + 56 : x, laneY + 4, 4, 6);
    };
    car(614, -1, 105, 40, '#d8a24a');
    car(660, 1, 85, 0, '#c2576b');
    car(692, 1, 65, 300, '#5a7fb8');

    // ===== 中央分界 + 防重叠压暗 =====
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(half - 1, 0, 2, VIEW_H);
    // 中央 UI 区域横向渐变压暗（只罩住 UI 所在的中间带，两侧风景完整可见）
    const scrim = g.createLinearGradient(360, 0, 920, 0);
    scrim.addColorStop(0, 'rgba(12,14,18,0)');
    scrim.addColorStop(0.15, 'rgba(12,14,18,0.86)');
    scrim.addColorStop(0.85, 'rgba(12,14,18,0.86)');
    scrim.addColorStop(1, 'rgba(12,14,18,0)');
    g.fillStyle = scrim;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  render(g: CanvasRenderingContext2D): void {
    this.drawBackdrop(g);
    g.textBaseline = 'top';

    // 标题
    g.font = '40px monospace';
    g.fillStyle = '#e8e8e8';
    const title = '人生模拟器';
    g.fillText(title, (VIEW_W - g.measureText(title).width) / 2, 40);
    g.font = '16px monospace';
    g.fillStyle = '#8a8f98';
    const sub = '— 创建你的角色 —';
    g.fillText(sub, (VIEW_W - g.measureText(sub).width) / 2, 96);

    // 有存档：右上角给一个直接续档的入口（不想重开一局就走这里）
    if (this.savedAvailable) {
      const c = this.continueRect();
      g.fillStyle = 'rgba(24,28,38,0.92)';
      g.fillRect(c.x, c.y, c.w, c.h);
      g.strokeStyle = '#7fb0d1';
      g.lineWidth = 2;
      g.strokeRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
      g.font = '18px monospace';
      g.fillStyle = '#9fd0e8';
      const label = '继续上次的人生';
      g.fillText(label, c.x + (c.w - g.measureText(label).width) / 2, c.y + 17);
    }

    // 性别卡片
    const opts: { gender: Gender; label: string }[] = [
      { gender: 'male', label: '男生' },
      { gender: 'female', label: '女生' },
    ];
    opts.forEach((o, i) => {
      const r = this.boxRect(i);
      const selected = this.gender === o.gender;
      g.fillStyle = selected ? '#232733' : '#1b1e26';
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = selected ? '#ffd166' : '#3a3f4a';
      g.lineWidth = selected ? 3 : 2;
      g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);

      // 角色预览（6 倍像素）
      g.save();
      g.translate(r.x + 48, r.y + 16);
      g.scale(6, 6);
      drawCharacter(g, 0, 0, 'down', 0, this.looks[o.gender], false);
      g.restore();

      g.font = '20px monospace';
      g.fillStyle = selected ? '#ffd166' : '#9aa0aa';
      const lw = g.measureText(o.label).width;
      g.fillText(o.label, r.x + (r.w - lw) / 2, r.y + r.h - 40);
    });

    // 五维面板
    g.font = '18px monospace';
    const ty = 416;
    const segments: { text: string; color: string }[] = [];
    for (let i = 0; i < 3; i++) {
      const key = TALENT_LABELS[i] === '智力' ? 'int' : TALENT_LABELS[i] === '颜值' ? 'look' : 'family';
      const v = this.locked[i] ? this.talents[key] : this.showVals[i];
      segments.push({ text: `${TALENT_LABELS[i]} `, color: '#c8cdd5' });
      segments.push({ text: `${v}`, color: this.locked[i] ? '#ffd166' : '#ffffff' });
      if (this.locked[i]) segments.push({ text: `（${talentTier(v)}）`, color: '#8a8f98' });
      if (i < 2) segments.push({ text: '    ', color: '#000000' });
    }
    if (this.phase === 'idle') {
      segments.length = 0;
      for (let i = 0; i < 3; i++) {
        segments.push({ text: `${TALENT_LABELS[i]} ?`, color: '#c8cdd5' });
        if (i < 2) segments.push({ text: '    ', color: '#000000' });
      }
    }
    let totalW = 0;
    for (const s of segments) totalW += g.measureText(s.text).width;
    let cx2 = (VIEW_W - totalW) / 2;
    for (const s of segments) {
      g.fillStyle = s.color;
      g.fillText(s.text, cx2, ty);
      cx2 += g.measureText(s.text).width;
    }

    g.font = '18px monospace';
    g.fillStyle = '#9fb8e8';
    const hp = `健康值 ${BASE_HEALTH}    心理状况 ${BASE_MIND}`;
    g.fillText(hp, (VIEW_W - g.measureText(hp).width) / 2, ty + 34);

    g.font = '14px monospace';
    g.fillStyle = '#6a7078';
    const rule = '天赋规则：7~10 档共 10%（10 仅 1%）· 3~6 各 20% · 0~2 共 10%';
    g.fillText(rule, (VIEW_W - g.measureText(rule).width) / 2, ty + 66);

    // 「三分天注定」按钮（抽取后变为「再抽一次」）
    const b = this.buttonRect();
    if (this.phase === 'rolling') {
      g.fillStyle = '#1b1e26';
      g.fillRect(b.x, b.y, b.w, b.h);
      g.strokeStyle = '#3a3f4a';
      g.lineWidth = 2;
      g.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      g.font = '26px monospace';
      g.fillStyle = '#6a7078';
      const t = '抽取中…';
      g.fillText(t, b.x + (b.w - g.measureText(t).width) / 2, b.y + 18);
    } else {
      const done = this.phase === 'done';
      g.fillStyle = done ? '#1e2b22' : '#2a2f3a';
      g.fillRect(b.x, b.y, b.w, b.h);
      g.strokeStyle = done ? '#7fd18a' : '#ffd166';
      g.lineWidth = 3;
      g.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      g.font = '26px monospace';
      g.fillStyle = done ? '#7fd18a' : '#ffd166';
      const label = done ? '再抽一次（R）' : '三分天注定';
      g.fillText(label, b.x + (b.w - g.measureText(label).width) / 2, b.y + 17);
    }

    // 抽取完成后出现「开启新人生」按钮：点击进入游戏
    if (this.phase === 'done') {
      const s = this.startRect();
      g.fillStyle = '#1e2b22';
      g.fillRect(s.x, s.y, s.w, s.h);
      g.strokeStyle = '#7fd18a';
      g.lineWidth = 3;
      g.strokeRect(s.x + 1, s.y + 1, s.w - 2, s.h - 2);
      g.font = '28px monospace';
      g.fillStyle = '#7fd18a';
      const label = '开启新人生';
      g.fillText(label, s.x + (s.w - g.measureText(label).width) / 2, s.y + 16);
    }

    // 底部提示随阶段变化
    g.font = '14px monospace';
    g.fillStyle = '#8a8f98';
    const hint =
      this.phase === 'idle'
        ? '点击「三分天注定」或按 Space 抽取天赋 · ←→/AD 切换性别'
        : this.phase === 'rolling'
          ? '命运的齿轮转动中…'
          : '点击「开启新人生」或按 Enter 开始 · R 重新抽取 · ←→/AD 切换性别';
    g.fillText(hint, (VIEW_W - g.measureText(hint).width) / 2, VIEW_H - 32);
  }
}
