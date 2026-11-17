import { TILE } from '../config';
import { gameHour } from '../core/daynight';
import { drawCharacter } from './player';
import type { Appearance } from './player';
import { T } from '../map/tiles';
import type { World } from '../map/world';

// 背景板路人：30 个程序组合（5 体型档 × 3 发型 × 2 主色 × 2 配饰取 30）
// 在玩家附近的道路上生成/消失，只记"见过玩家几次"，无姓名无日程
const ACTIVE_TARGET = 8;       // 同屏附近维持的路人数
const SPAWN_MIN = 10;          // 生成距离（Tile）
const SPAWN_MAX = 22;
const DESPAWN = 30;            // 超过即消失（Tile）

// 通用台词池（按时段切换），身份标签各 5 条
const GENERIC_LINES = [
  '今儿豆腐脑又涨了两毛。', '这天真好，适合晒被子。', '让让让让，赶时间。',
  '刚才那辆车差点蹭着我。', '晚上吃啥呢……', '这雨说下就下，伞带了没？',
  '听说了吗，河对岸要修桥。', '快递又给我放驿站了，唉。', '走快点，要迟到了。',
  '这天真闷。', '外卖小哥骑慢点啊！', '新来的？以前没见过你。',
  '广场舞音响今天小点声了，难得。', '药店的钙片又打折了。', '孩子开学了，路上清净了。',
  '这风一刮，全是土。', '今天菜价还行。', '晚上遛弯去滨河那边？',
  '哎，我家那口子又忘带钥匙。', '这天黑得早了。', '路灯修好了，亮堂。',
];
const MORNING_LINES = ['上班上学咯，冲！', '早啊，吃了吗？', '豆浆要排队，我先去了。', '困死我了，昨晚又熬夜。', '新的一天，新的堵车。'];
const NIGHT_LINES = ['夜里凉，多穿点。', '便利店饭团又降价了。', '这么晚还晃悠？', '路灯底下暖和。', '打完这局就回去。'];

const TAG_LINES: Record<string, string[]> = {
  dog: ['慢点慢点，别拽我！', '我家这狗，比人精。', '捡屎袋带了带了……', '再转一圈就回家。', '它今天心情不好。'],
  basket: ['今天的韭菜真嫩。', '就这点东西，十块钱。', '降价处理的，不亏。', '背不动喽。', '再逛一圈，比比价。'],
  student: ['作业没写完，完了完了。', '考完了，解放了！', '这道题谁会啊。', '食堂新窗口排队巨长。', '体育课又被占了。'],
  courier: ['尾号多少？', '放门口了啊！', '这单还有八分钟。', '电梯又坏了，爬六楼。', '五星好评啊哥。'],
  sport: ['一二三四，二二三四……', '最后一圈！', '出汗就是赚到。', '膝盖不行了，悠着点。', '明天还来吗？'],
  stroller: ['宝宝看，花花。', '别睡啊，马上到家了。', '摇啊摇，摇到外婆桥……', '遛娃三公里，减肥两公斤。', '嘘——刚睡着。'],
};
const TAGS = Object.keys(TAG_LINES);

// 生病路人（传染源）：咳嗽台词 + 口罩标识；玩家凑太近会累积传染时长
const SICK_LINES = ['咳咳……咳咳咳。', '这两天降温，一下就中招了。', '别靠太近，我怕是传染你。', '感冒药吃了也不管用……', '咳咳，医院人太多了，懒得去。'];
const SICK_REACT_LINES = ['哎，你脸色不太好啊。', '小伙子，病了就赶紧去医院，别硬扛。', '你这咳嗽声……离我远点哈。', '看你这样，昨晚没睡好吧？'];

interface Passerby {
  x: number;
  y: number;
  facing: 'up' | 'down' | 'left' | 'right';
  look: Appearance & { scale: number; hat: boolean };
  tag: string;
  sick: boolean; // 生病路人：传染源
  targetX: number;
  targetY: number;
  moving: boolean;
  animT: number;
  seen: number;
  line: string;
  lineT: number;
}

function walkable(world: World, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) return false;
  const g0 = world.getGround(tx, ty);
  return g0 === T.Road || g0 === T.Plaza || g0 === T.Bridge || g0 === T.Sand;
}

function randomWalkableNear(world: World, ctx: number, cy: number, rMin: number, rMax: number): [number, number] | null {
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = rMin + Math.random() * (rMax - rMin);
    const tx = Math.round(ctx + Math.cos(a) * r);
    const ty = Math.round(cy + Math.sin(a) * r);
    if (walkable(world, tx, ty) && walkable(world, tx, ty - 1)) return [tx, ty];
  }
  return null;
}

// 30 个程序组合：3 发型 × 2 主色档 × 5 体型档 × 2 帽子
const COMBOS: (Appearance & { scale: number; hat: boolean })[] = [];
{
  const hairs = ['#1a1814', '#5a3a2c', '#8a8f98'];
  const shirts = ['#6a7a8a', '#8a6a5a', '#5a7a6a', '#7a6a8a', '#9a8a5a'];
  const pants = ['#3a3f4a', '#4a4038', '#2f3a3a'];
  for (const hair of hairs) {
    for (let si = 0; si < shirts.length; si++) {
      for (let pi = 0; pi < 2; pi++) {
        COMBOS.push({
          hair,
          shirt: shirts[si],
          pants: pants[(si + pi + hairs.indexOf(hair)) % pants.length],
          longHair: hair !== '#1a1814' && (si + pi) % 2 === 0,
          scale: 0.88 + ((si + pi) % 5) * 0.05,
          hat: (si + pi) % 2 === 1,
        });
      }
    }
  }
}

export class PasserbyManager {
  private active: Passerby[] = [];
  private comboIdx = 0;

  /** 当前在场路人的位置（车流避让用） */
  get positions(): { x: number; y: number }[] {
    return this.active;
  }

  update(dt: number, world: World, playerTx: number, playerTy: number): void {
    const px = playerTx * TILE;
    const py = playerTy * TILE;

    // 生成
    while (this.active.length < ACTIVE_TARGET) {
      const spot = randomWalkableNear(world, playerTx, playerTy, SPAWN_MIN, SPAWN_MAX);
      if (!spot) break;
      const combo = COMBOS[this.comboIdx % COMBOS.length];
      this.comboIdx++;
      this.active.push({
        x: spot[0] * TILE + 4,
        y: spot[1] * TILE + 4,
        facing: 'down',
        look: combo,
        tag: TAGS[this.comboIdx % TAGS.length],
        sick: Math.random() < 0.12,
        targetX: spot[0] * TILE + 4,
        targetY: spot[1] * TILE + 4,
        moving: false,
        animT: Math.random() * 10,
        seen: 0,
        line: '',
        lineT: 0,
      });
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      const dTile = Math.hypot(p.x - px, p.y - py) / TILE;

      // 消失
      if (dTile > DESPAWN) {
        this.active.splice(i, 1);
        continue;
      }

      // 气泡台词倒计时
      if (p.lineT > 0) p.lineT -= dt;

      // 到点再随机下一点（路点附近 4-10 Tile）
      const d = Math.hypot(p.targetX - p.x, p.targetY - p.y);
      if (d < 8) {
        const cur: [number, number] = [Math.round(p.x / TILE), Math.round(p.y / TILE)];
        const next = randomWalkableNear(world, cur[0], cur[1], 4, 10);
        if (next) {
          p.targetX = next[0] * TILE + 4;
          p.targetY = next[1] * TILE + 4;
        }
      } else {
        p.moving = true;
        p.animT += dt;
        const dx = p.targetX - p.x;
        const dy = p.targetY - p.y;
        if (Math.abs(dx) > Math.abs(dy)) p.facing = dx > 0 ? 'right' : 'left';
        else p.facing = dy > 0 ? 'down' : 'up';
        const step = 46 * dt;
        const len = Math.hypot(dx, dy);
        p.x += (dx / len) * step;
        p.y += (dy / len) * step;
      }
    }
  }

  // 玩家搭话：按时段/标签给一句，记录"见过"
  // playerSick：玩家正生病时，路人会关心/嫌弃（NPC 反应，见设计文档 §背景）
  interact(p: Passerby, playerSick = false): string {
    p.seen++;
    const h = gameHour();
    let pool: string[];
    if (p.sick) pool = SICK_LINES;
    else if (playerSick && Math.random() < 0.6) pool = SICK_REACT_LINES;
    else if (p.seen >= 5 && Math.random() < 0.5) pool = ['又见面了啊。', '天天见，都熟了。', '今儿也来了？'];
    else if (h >= 21 || h < 6) pool = NIGHT_LINES;
    else if (h >= 6 && h < 10) pool = MORNING_LINES;
    else pool = Math.random() < 0.5 ? GENERIC_LINES : TAG_LINES[p.tag];
    p.line = pool[(Math.random() * pool.length) | 0];
    p.lineT = 2.6;
    return p.line;
  }

  /** 最近的生病路人（传染判定用） */
  nearestSick(px: number, py: number, maxDist = 80): Passerby | null {
    let best: Passerby | null = null;
    let bd = maxDist;
    for (const p of this.active) {
      if (!p.sick) continue;
      const d = Math.hypot(px - (p.x + 12), py - (p.y + 14));
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  nearest(px: number, py: number, maxDist = 40): Passerby | null {
    let best: Passerby | null = null;
    let bd = maxDist;
    for (const p of this.active) {
      const d = Math.hypot(px - (p.x + 12), py - (p.y + 14));
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  render(g: CanvasRenderingContext2D, ox: number, oy: number): void {
    for (const p of this.active) {
      const sx = Math.round(p.x + ox);
      const sy = Math.round(p.y + oy);
      if (sx < -40 || sx > 1320 || sy < -40 || sy > 760) continue;
      g.save();
      g.translate(sx + 12, sy + 28);
      g.scale(p.look.scale, p.look.scale);
      g.translate(-12, -28);
      drawCharacter(g, 0, 0, p.facing, p.animT, p.look, p.moving);
      if (p.look.hat) {
        g.fillStyle = '#4a4038';
        g.fillRect(6, -2, 12, 3);
        g.fillRect(4, 1, 16, 2);
      }
      // 生病路人：浅色口罩（无资产程序绘制）
      if (p.sick && p.facing !== 'up') {
        g.fillStyle = '#cfe4d8';
        if (p.facing === 'down') g.fillRect(8, 6, 9, 4);
        else if (p.facing === 'left') g.fillRect(7, 6, 6, 4);
        else g.fillRect(12, 6, 6, 4);
      }
      g.restore();

      if (p.lineT > 0 && p.line) {
        g.font = '11px monospace';
        g.textAlign = 'center';
        g.textBaseline = 'bottom';
        const w = g.measureText(p.line).width;
        g.fillStyle = 'rgba(240,234,216,0.92)';
        g.fillRect(sx + 12 - w / 2 - 4, sy - 16, w + 8, 15);
        g.fillStyle = '#2a2a2a';
        g.fillText(p.line, sx + 12, sy - 4);
        g.textAlign = 'left';
        g.textBaseline = 'middle';
      }
    }
  }
}
