import { PLAYER_SPEED, TILE } from '../config';
import type { Input } from '../core/input';
import type { SolidGrid } from '../core/collision';
import { rectHitsSolid } from '../core/collision';
import type { Box } from '../core/collisionWorld';
import { hitsAny } from '../core/collisionWorld';
import type { Gender, Stats } from '../data/character';
import { CYCLE_MS, gameDayIndex } from '../core/daynight';
import type { HealthSystem } from '../core/health';

// 年龄：每 AGING_DAYS 个游戏日长 1 岁（1 游戏日 = 一个昼夜循环 ≈ 18 分钟）
// 节奏调节就改这一个数：1 = 一天一岁（最快，约 18 分钟/年）；3 = 约 54 分钟/年；10 = 约 3 小时/年
export const AGING_DAYS = 3;

/** 寿命上限：到 100 岁封顶，不再变老 */
export const MAX_AGE = 100;

// 角色外观：性别决定配色与发型，全部由代码绘制
export interface Appearance {
  shirt: string;      // 上衣主色
  check?: string;     // 格子纹颜色（男生的格子衬衫）
  pants: string;      // 裤子 / 腿部（裙子下露的小腿）
  skirt?: string;     // 裙子颜色（女生）
  hair: string;
  longHair: boolean;
}

export const MALE_LOOK: Appearance = {
  shirt: '#3a6ea5',   // 蓝
  check: '#2e8b72',   // 绿格
  pants: '#2b2f6e',
  hair: '#1a1814',    // 黑发
  longHair: false,
};

export const FEMALE_LOOK: Appearance = {
  shirt: '#c2576b',
  pants: '#e8b88a',   // 裙摆下露出的腿部
  skirt: '#8a4a63',
  hair: '#dfc05e',    // 金发
  longHair: true,
};

// 绘制像素小人（24x28，游戏内与创建界面预览共用）
export function drawCharacter(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  facing: 'up' | 'down' | 'left' | 'right',
  animT: number,
  app: Appearance,
  moving: boolean,
): void {
  // 阴影
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(x, y + 25, 24, 4);

  const step = moving ? Math.sin(animT * 12) : 0;

  // 腿（裙子角色只露小腿）
  if (app.skirt) {
    g.fillStyle = app.pants;
    g.fillRect(x + 6, y + 23, 4, 5 + (step > 0 ? 1 : 0));
    g.fillRect(x + 14, y + 23, 4, 5 + (step < 0 ? 1 : 0));
  } else {
    g.fillStyle = app.pants;
    g.fillRect(x + 5, y + 20, 5, 6 + (step > 0 ? 2 : 0));
    g.fillRect(x + 14, y + 20, 5, 6 + (step < 0 ? 2 : 0));
  }

  // 身体 + 长袖（袖子直达手腕）
  g.fillStyle = app.shirt;
  g.fillRect(x + 2, y + 9, 3, 10);
  g.fillRect(x + 19, y + 9, 3, 10);
  g.fillRect(x + 5, y + 8, 14, 11);
  // 格子纹（蓝绿相间）
  if (app.check) {
    g.fillStyle = app.check;
    g.fillRect(x + 9, y + 8, 2, 11);
    g.fillRect(x + 14, y + 8, 2, 11);
    g.fillRect(x + 5, y + 11, 14, 2);
    g.fillRect(x + 5, y + 15, 14, 2);
  }
  // 袖口与下摆阴影
  g.fillStyle = 'rgba(0,0,0,0.15)';
  g.fillRect(x + 2, y + 17, 3, 2);
  g.fillRect(x + 19, y + 17, 3, 2);
  g.fillRect(x + 5, y + 18, 14, 1);

  // 裙子（覆盖腰腹与大腿，带褶）
  if (app.skirt) {
    g.fillStyle = app.skirt;
    g.fillRect(x + 4, y + 16, 16, 4);
    g.fillRect(x + 2, y + 20, 20, 3);
    g.fillStyle = 'rgba(0,0,0,0.15)';
    g.fillRect(x + 7, y + 17, 1, 6);
    g.fillRect(x + 13, y + 17, 1, 6);
  }

  // 头
  g.fillStyle = '#e8b88a';
  g.fillRect(x + 7, y, 10, 9);

  // 发型：长发两侧垂落，背对时覆盖整个后脑
  g.fillStyle = app.hair;
  if (app.longHair) {
    if (facing === 'up') g.fillRect(x + 7, y, 10, 6);
    else g.fillRect(x + 7, y, 10, 3);
    g.fillRect(x + 5, y + 2, 2, 10);
    g.fillRect(x + 17, y + 2, 2, 10);
  } else {
    if (facing === 'up') g.fillRect(x + 7, y, 10, 5);
    else g.fillRect(x + 7, y, 10, 3);
  }

  // 眼睛（2x2）
  if (facing !== 'up') {
    g.fillStyle = '#222222';
    if (facing === 'down') {
      g.fillRect(x + 9, y + 5, 2, 2);
      g.fillRect(x + 14, y + 5, 2, 2);
    } else if (facing === 'left') {
      g.fillRect(x + 8, y + 5, 2, 2);
    } else {
      g.fillRect(x + 15, y + 5, 2, 2);
    }
  }
}

// 玩家角色：AABB 碰撞、四方向朝向、简易步行动画
export class Player {
  x = 0;
  y = 0;
  readonly w = 24;
  readonly h = 28;
  facing: 'up' | 'down' | 'left' | 'right' = 'down';
  appearance: Appearance = MALE_LOOK;
  stats: Stats | null = null;
  gender: Gender = 'male';
  name = '小明';        // 默认名，跟随性别
  stamina = 100;        // 体力 0-100：移动消耗、站立回复；≤20 疲劳减速（上限受疾病压制）
  knowledge = 0;        // 学识 0-100：随游戏时间缓慢增长
  money = 0;            // 金钱：开局 = 家境×100，每个游戏日 +家境×5 零花
  health: HealthSystem | null = null; // 疾病系统引用（main 注入）：体力上限/移速/健康上限
  taxiRides = 0;        // 出租车常客计数（司机记忆）
  taxiDebt = 0;         // 欠司机的车费（下次上车先还）
  private birthDay = 0; // 角色创建时的游戏日序号
  private allowanceDay = 0;
  private animT = 0;
  private moving = false;

  constructor(private readonly input: Input) {}

  /** 存档用：出生日与零花结算日（年龄由两者与当前游戏日算出） */
  agingState(): { birthDay: number; allowanceDay: number } {
    return { birthDay: this.birthDay, allowanceDay: this.allowanceDay };
  }

  restoreAging(s: { birthDay: number; allowanceDay: number }): void {
    this.birthDay = s.birthDay;
    this.allowanceDay = s.allowanceDay;
  }

  setCharacter(gender: Gender, stats: Stats): void {
    this.gender = gender;
    this.appearance = gender === 'male' ? MALE_LOOK : FEMALE_LOOK;
    this.stats = stats;
    this.name = gender === 'male' ? '小明' : '小红';
    this.stamina = 100;
    this.knowledge = stats.int * 5;
    this.money = stats.family * 100;
    this.birthDay = gameDayIndex();
    this.allowanceDay = this.birthDay;
  }

  get age(): number {
    const raw = 6 + Math.floor((gameDayIndex() - this.birthDay) / AGING_DAYS);
    return Math.min(MAX_AGE, raw);
  }

  get grade(): string {
    const a = this.age;
    if (a >= 6 && a <= 11) return `${'一二三四五六'[a - 6]}年级`;
    if (a >= 12 && a <= 14) return '初中生';
    if (a >= 15 && a <= 18) return '高中生';
    return '已毕业';
  }

  /** 人生阶段：18 岁成年，35 岁步入中年，56 岁起为老年 */
  get stage(): string {
    const a = this.age;
    if (a < 18) return '未成年人';
    if (a < 35) return '成年人';
    if (a < 56) return '中年人';
    return '老年人';
  }

  /** 学龄内（6~18 岁）才显示年级 */
  get inSchool(): boolean {
    const a = this.age;
    return a >= 6 && a <= 18;
  }

  get tired(): boolean {
    return this.stamina <= 20;
  }

  /** 体力上限：疾病按系数压制（健康时 100） */
  staminaCap(): number {
    return this.health ? this.health.staminaCap() : 100;
  }

  /** 移速系数：扭伤/骨折/后遗症 */
  speedMul(): number {
    return this.health ? this.health.speedMul() : 1;
  }

  /** 每帧调用（不依赖移动）：学识随时间增长、按日领零花 */
  tick(dt: number): void {
    // 一个昼夜循环 = 24 游戏小时；学识 +2 / 游戏小时
    const hoursPerSec = 24 / (CYCLE_MS / 1000);
    this.knowledge = Math.min(100, this.knowledge + 2 * hoursPerSec * dt);
    const d = gameDayIndex();
    if (this.stats && d > this.allowanceDay) {
      this.money += this.stats.family * 5 * (d - this.allowanceDay);
      this.allowanceDay = d;
    }
    // 体力不突破疾病压制后的上限
    const cap = this.staminaCap();
    if (this.stamina > cap) this.stamina = cap;
  }

  placeAtTile(tx: number, ty: number): void {
    this.x = tx * TILE + (TILE - this.w) / 2;
    this.y = ty * TILE + (TILE - this.h);
  }

  centerTile(): { tx: number; ty: number } {
    return {
      tx: Math.floor((this.x + this.w / 2) / TILE),
      ty: Math.floor((this.y + this.h / 2) / TILE),
    };
  }

  /**
   * 每帧移动。grid 为 Tile 级静态碰撞；obstacles 为像素级动态障碍（车辆碰撞盒，
   * 见 traffic.obstacles()），两层都做分轴检查，保持贴墙/贴车滑动手感。
   */
  update(dt: number, grid: SolidGrid, obstacles: Box[] = []): void {
    let dx = 0, dy = 0;
    if (this.input.isDown('ArrowLeft', 'KeyA')) dx -= 1;
    if (this.input.isDown('ArrowRight', 'KeyD')) dx += 1;
    if (this.input.isDown('ArrowUp', 'KeyW')) dy -= 1;
    if (this.input.isDown('ArrowDown', 'KeyS')) dy += 1;

    this.moving = dx !== 0 || dy !== 0;
    // 体力：移动消耗 1.2/s，站立回复 5/s；≤20 疲劳减速（上限受疾病压制）
    const cap = this.staminaCap();
    if (this.moving) this.stamina = Math.max(0, this.stamina - 1.2 * dt);
    else this.stamina = Math.min(cap, this.stamina + 5 * dt);
    if (!this.moving) return;

    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;
    if (dx < 0) this.facing = 'left';
    else if (dx > 0) this.facing = 'right';
    else if (dy < 0) this.facing = 'up';
    else this.facing = 'down';
    this.animT += dt;

    // 分轴移动：贴墙滑动手感；疲劳（体力≤20）速度 ×0.65；疾病按系数压制移速
    // Tile 层 + 车辆 AABB 层双重检查（人不能穿进车里，规范 §3 碰撞矩阵）
    const step = PLAYER_SPEED * (this.tired ? 0.65 : 1) * this.speedMul() * dt;
    const nx = this.x + dx * step;
    if (!rectHitsSolid(grid, nx, this.y, this.w, this.h) && !hitsAny(obstacles, nx, this.y, this.w, this.h)) this.x = nx;
    const ny = this.y + dy * step;
    if (!rectHitsSolid(grid, this.x, ny, this.w, this.h) && !hitsAny(obstacles, this.x, ny, this.w, this.h)) this.y = ny;
  }

  render(g: CanvasRenderingContext2D, ox: number, oy: number): void {
    drawCharacter(
      g,
      Math.round(this.x + ox),
      Math.round(this.y + oy),
      this.facing,
      this.animT,
      this.appearance,
      this.moving,
    );
  }
}
