// 出租车车程场景：第三人称跟拍——完整出租车模型沿寻路结果真实行驶（可借道草地）
// 时长按路程 45 秒左右（堵车暂停推进）；E 跳过；下车即停歌；时间按距离推进 10–40 游戏分钟
// 随机事件：堵车（+钱）/ 绕路（夜间，可被识破）/ 司机八卦；只做氛围不碰主线
import { VIEW_H, VIEW_W, TILE } from '../config';
import { advanceGameMinutes, isNight, gameHour } from '../core/daynight';
import { computeCamera } from '../core/camera';
import { findPath } from '../core/pathfind';
import { renderWorld } from '../map/chunkRenderer';
import { renderBuildings } from '../map/buildingRender';
import { drawCarSprite, TAXI_COLOR } from '../entities/traffic';
import { drawStands } from '../entities/taxiStand';
import { PLAYLIST } from '../core/radio';
import type { GameContext } from '../context';
import type { Scene } from './scene';

export interface Destination {
  id: string;
  name: string;
  tx: number; // 下车落脚点（门外可通行格）
  ty: number;
}

export const DESTINATIONS: Destination[] = [
  { id: 'home', name: '家门口', tx: 248, ty: 56 },
  { id: 'school', name: '学校', tx: 93, ty: 39 },
  { id: 'hospital', name: '镇医院', tx: 298, ty: 36 },
  { id: 'mall', name: '百货商场', tx: 214, ty: 89 },
  { id: 'station', name: '火车站', tx: 568, ty: 124 },
  { id: 'park', name: '公园喷泉', tx: 72, ty: 86 },
];

/** 车费：起步 5 + 每 Tile 0.06，限 6–20 */
export function fareFor(distTiles: number): number {
  return Math.max(6, Math.min(20, Math.round(5 + distTiles * 0.06)));
}

const RIDE_SECONDS = 45;
const CHARS_PER_SEC = 32;

// 司机台词池
const OPENING_BY_DEST: Record<string, string> = {
  home: '回家啊？这个点儿路况还行。',
  school: '上学去？坐稳了，别迟到。',
  hospital: '看病啊？这阵子感冒的人多，您保重。',
  mall: '逛街去？商场门口那段老堵车。',
  station: '赶火车？走滨河路，快。',
  park: '去公园遛弯？好地方。',
};
const OPENING_RAIN = '下雨了，路滑，我开慢点。';
const OPENING_NIGHT = '大晚上的，一个人注意安全。';
const OPENING_REGULAR = '又是你啊！老地方？还是今儿换个地儿？';
const CHAT_LINES = [
  '听说了吗，河对岸真要修桥了，以后过河不用绕喽。',
  '古董店老李最近收旧怀表，给价挺厚道。',
  '前儿个拉了个客人，说商业街要开新 bakery，洋人点心。',
  '这城里啊，就属滨河夜景好看，晚上跑活都是一种享受。',
  '镇医院新来的大夫手艺好，就是号难挂。',
];
const JAM_LINE = '哎哟，堵上了。您别急，这段就这样的。';
const DETOUR_NERVOUS = '（司机眼神有点飘，车绕进了一条小路……）';
const DETOUR_CAUGHT = '「这路……好像不对吧？」司机干笑两声，默默调回了头。';

export class TaxiScene implements Scene {
  private dest!: Destination;
  private originTx = 0;
  private originTy = 0;
  private fare = 0;
  private baseFare = 0;
  private t = 0;          // 场景计时（事件按此触发）
  private driven = 0;     // 已行驶路程（px）
  private totalLen = 1;   // 全程（px）
  private speed = 60;     // 巡航速度（px/游戏秒）
  private wp: number[] = [];   // 路径像素点（x,y 交替，含起点与终点）
  private cum: number[] = [];  // 各点累计里程
  private done = false;
  private line = '';        // 司机当前台词
  private shown = 0;
  private lineUntil = 0;
  private jamUntil = 0;
  private detour = false;
  private detourCaught = false;
  private minutes = 15;
  private jamAt = -1;
  private detourAt = -1;
  private chatAt = -1;

  constructor(private readonly ctx: GameContext) {}

  enter(params?: { dest: Destination; originTx: number; originTy: number }): void {
    const p = this.ctx.player;
    this.dest = params!.dest;
    this.originTx = params!.originTx;
    this.originTy = params!.originTy;
    const dist = Math.hypot(this.dest.tx - this.originTx, this.dest.ty - this.originTy);
    this.baseFare = fareFor(dist);
    this.fare = this.baseFare;
    this.minutes = Math.min(40, Math.max(10, Math.round(10 + dist / 8)));
    this.t = 0;
    this.driven = 0;
    this.done = false;
    this.jamUntil = 0;
    this.detour = false;
    this.detourCaught = false;

    // 寻路：公路优先，必要时借道草地；找不到就直线穿过去（出租车哪都能走）
    const { world } = this.ctx;
    const path = findPath(world, this.originTx, this.originTy, this.dest.tx, this.dest.ty);
    const pts: number[] = [this.originTx * TILE + 8, this.originTy * TILE + 8];
    if (path) {
      for (const [wx, wy] of path) pts.push(wx * TILE + 8, wy * TILE + 8);
    } else {
      pts.push(this.dest.tx * TILE + 8, this.dest.ty * TILE + 8);
    }
    this.wp = pts;
    this.cum = [0];
    for (let i = 2; i < pts.length; i += 2) {
      const dx = pts[i] - pts[i - 2];
      const dy = pts[i + 1] - pts[i - 1];
      this.cum.push(this.cum[this.cum.length - 1] + Math.hypot(dx, dy));
    }
    this.totalLen = Math.max(1, this.cum[this.cum.length - 1]);
    this.speed = this.totalLen / RIDE_SECONDS;

    // 事件判定（进站时一次性掷定，避免读档差异）
    const night = isNight();
    const regular = p.taxiRides >= 5;
    this.jamAt = Math.random() < 0.12 ? 12 : -1;
    this.detourAt = night && Math.random() < 0.06 ? 22 : -1;
    this.chatAt = Math.random() < 0.15 ? 7 : -1;
    this.detourCaught = this.detourAt > 0 && (p.knowledge >= 60 || regular);

    // 开场台词
    let open: string;
    if (regular && Math.random() < 0.5) open = OPENING_REGULAR;
    else if (this.ctx.weather.isRainy()) open = OPENING_RAIN;
    else if (night) open = OPENING_NIGHT;
    else open = OPENING_BY_DEST[this.dest.id] ?? '上车吧。';
    this.say(open, 6);

    // 电台：优先本地 mp3，否则 B 站方大同精选（官方播放器），再退合成占位；下车后停歌
    void this.ctx.radio.probe().then(() => {
      if (this.done) return;
      if (PLAYLIST.some((t) => t.hasFile)) this.ctx.radio.play();
      else this.ctx.radio.playBili();
    });
  }

  private say(text: string, secs: number): void {
    this.line = text;
    this.shown = 0;
    this.lineUntil = this.t + secs;
  }

  update(dt: number): void {
    if (this.done) return;
    const { input, hud } = this.ctx;
    this.t += dt;
    if (this.shown < this.line.length) this.shown = Math.min(this.line.length, this.shown + CHARS_PER_SEC * dt);

    // 事件触发点
    if (this.chatAt > 0 && this.t >= this.chatAt) {
      this.chatAt = -1;
      this.say(CHAT_LINES[(Math.random() * CHAT_LINES.length) | 0], 6);
    }
    if (this.jamAt > 0 && this.t >= this.jamAt) {
      this.jamAt = -1;
      this.jamUntil = this.t + 6;
      this.fare = Math.round(this.fare * 1.2);
      this.say(JAM_LINE, 5);
      hud.toast('遇上堵车了，车费 +20%');
    }
    if (this.detourAt > 0 && this.t >= this.detourAt) {
      this.detourAt = -1;
      this.detour = true;
      this.fare = Math.round(this.fare * 1.3);
      this.say(this.detourCaught ? DETOUR_CAUGHT : DETOUR_NERVOUS, 6);
      if (this.detourCaught) {
        this.fare = this.baseFare; // 被识破，司机认怂按原价
        hud.toast('你识破了绕路，车费恢复原样。');
        this.detour = false;
      }
    }

    // 行驶：堵车刹停（路程不推进，时间自然拉长），绕路时司机开快一点
    const jam = this.t < this.jamUntil;
    if (!jam) {
      const mul = this.detour ? 1.25 : 1;
      this.driven = Math.min(this.totalLen, this.driven + this.speed * mul * dt);
    }

    // R 换歌
    if (input.wasPressed('KeyR')) this.ctx.radio.next();

    // E 跳过（2.5 秒后可跳，避免误触）
    if (this.t > 2.5 && input.wasPressed('KeyE', 'Enter', 'Space')) {
      this.arrive();
      return;
    }
    if (this.driven >= this.totalLen || this.t >= 150) this.arrive();
  }

  private arrive(): void {
    if (this.done) return;
    this.done = true;
    const { player, scenes, hud, radio } = this.ctx;
    radio.stop(); // 下车停歌
    advanceGameMinutes(this.minutes);
    // 结账：不够就赊司机的账
    if (player.money >= this.fare) {
      player.money -= this.fare;
    } else {
      player.taxiDebt += this.fare - player.money;
      player.money = 0;
      hud.toast('钱不够，差的部分先欠着司机了。');
    }
    player.taxiRides += 1;
    player.placeAtTile(this.dest.tx, this.dest.ty);
    hud.toast(`到了，${this.dest.name}。车费 ${this.fare} 元。`);
    scenes.request(this.ctx.overworld);
  }

  /** 按已行驶里程取样车的位置与朝向 */
  private carState(): { x: number; y: number; dir: 0 | 1 | 2 | 3 } {
    const d = Math.min(this.driven, this.totalLen);
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < d) i++;
    const segStart = this.cum[i - 1];
    const segLen = Math.max(1e-6, this.cum[i] - segStart);
    const k = (d - segStart) / segLen;
    const x = this.wp[(i - 1) * 2] + (this.wp[i * 2] - this.wp[(i - 1) * 2]) * k;
    const y = this.wp[(i - 1) * 2 + 1] + (this.wp[i * 2 + 1] - this.wp[(i - 1) * 2 + 1]) * k;
    const dx = this.wp[i * 2] - this.wp[(i - 1) * 2];
    const dy = this.wp[i * 2 + 1] - this.wp[(i - 1) * 2 + 1];
    const dir: 0 | 1 | 2 | 3 = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 0 : 2) : (dy >= 0 ? 1 : 3);
    return { x, y, dir };
  }

  // ---- 渲染：第三人称跟拍真实行驶 ----
  render(g: CanvasRenderingContext2D): void {
    const night = isNight();
    const rainy = this.ctx.weather.isRainy();
    const jam = this.t < this.jamUntil;
    const { world } = this.ctx;
    const car = this.carState();
    const cam = computeCamera(car.x, car.y, world.w, world.h, VIEW_W);

    g.fillStyle = '#000000';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    renderWorld(g, world, cam.x, cam.y, night);
    drawStands(g, -cam.x, -cam.y, night);
    const carTx = Math.floor(car.x / TILE);
    const carTy = Math.floor(car.y / TILE);
    renderBuildings(g, world, cam.x, cam.y, carTx, carTy, night);

    // 堵车：刹车灯红光亮起
    if (jam) {
      g.fillStyle = 'rgba(230,60,50,0.55)';
      const bx = Math.round(car.x - cam.x);
      const by = Math.round(car.y - cam.y);
      g.beginPath();
      g.arc(bx, by, 16, 0, Math.PI * 2);
      g.fill();
    }
    // 完整出租车模型（与大地图车流同一绘制函数）
    drawCarSprite(g, Math.round(car.x - cam.x), Math.round(car.y - cam.y), car.dir, TAXI_COLOR, true, night || gameHour() >= 19);

    // 雨天叠层（世界之上、UI 之下）
    if (rainy) this.ctx.weather.drawRain(g, VIEW_W, VIEW_H, performance.now() / 1000);

    // 司机台词气泡（跟拍镜头固定在车顶上方）
    if (this.t < this.lineUntil && this.line) {
      const text = this.line.slice(0, Math.floor(this.shown));
      g.font = '15px monospace';
      const w = Math.min(560, g.measureText(text).width + 28);
      const bx = VIEW_W / 2 - w / 2;
      const by = 70;
      g.fillStyle = 'rgba(240,234,216,0.94)';
      g.fillRect(bx, by, w, 34);
      g.fillStyle = '#2a2a2a';
      g.textBaseline = 'top';
      g.fillText(text, bx + 14, by + 8);
    }

    // 顶部：路线光点条（按行驶进度）
    this.drawRoute(g);
    // 左下：电台
    this.ctx.radio.draw(g);
    // 右上：进度 + 跳过提示
    const p = Math.min(1, this.driven / this.totalLen);
    g.font = '14px monospace';
    g.textAlign = 'right';
    g.fillStyle = '#e8e8e8';
    g.fillText(`${Math.floor(p * 100)}% · E 跳过`, VIEW_W - 24, 20);
    g.textAlign = 'left';
    const pw = 240;
    g.fillStyle = 'rgba(10,12,16,0.6)';
    g.fillRect(VIEW_W - 24 - pw, 44, pw, 8);
    g.fillStyle = jam ? '#e86a6a' : '#e8c85a';
    g.fillRect(VIEW_W - 24 - pw, 44, pw * p, 8);
  }

  /** 顶部路线条：出发 → 目的地，光点按真实行驶进度移动 */
  private drawRoute(g: CanvasRenderingContext2D): void {
    const p = Math.min(1, this.driven / this.totalLen);
    g.fillStyle = 'rgba(10,12,16,0.55)';
    g.fillRect(16, 14, 216, 34);
    g.strokeStyle = 'rgba(232,232,232,0.3)';
    g.strokeRect(16.5, 14.5, 215, 33);
    g.font = '12px monospace';
    g.textBaseline = 'top';
    g.fillStyle = '#8a8f98';
    g.fillText('出发', 24, 24);
    g.fillStyle = '#c8cdd5';
    g.fillText(this.dest.name, 160, 24);
    g.strokeStyle = '#e8c85a';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(52, 31);
    g.lineTo(154, 31);
    g.stroke();
    g.fillStyle = '#e83a3a';
    g.beginPath();
    g.arc(52 + (154 - 52) * p, 31, 5, 0, Math.PI * 2);
    g.fill();
  }
}
