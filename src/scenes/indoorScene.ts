import { TILE, VIEW_H, VIEW_W } from '../config';
import { NONE, drawTile, isSolidTileId, T } from '../map/tiles';
import type { SolidGrid } from '../core/collision';
import type { Building } from '../map/world';
import { getIndoorLayout } from '../data/indoors';
import type { IndoorLayout } from '../data/indoors';
import { skipToNextMorning } from '../core/daynight';
import type { GameContext } from '../context';
import type { Scene } from './scene';
import { ClassroomSession } from '../systems/classroom';
import { createRoomDef, createRoomState } from '../rooms/roomDefs';
import type { RoomDef, RoomEnterParams, RoomState } from '../rooms/types';
import type { ResidenceDef } from '../data/residences';

// 室内场景：独立小 Tile 地图，走上门 Tile 返回大地图对应建筑门口
// 疾病与就医系统交互：柜台 E 触发（医院挂号/诊所/便利店），家里床边 E 休息
export class IndoorScene implements Scene {
  readonly def: RoomDef;
  private readonly grid: SolidGrid;
  private readonly classroom = new ClassroomSession();
  private state: RoomState;
  private originX = 0;
  private originY = 0;

  constructor(
    private readonly ctx: GameContext,
    private readonly building: Building,
    private readonly layout: IndoorLayout,
    roomId?: string,
    roomName?: string,
  ) {
    this.def = createRoomDef(building, layout, { id: roomId, name: roomName });
    this.state = createRoomState(this.def.id);
    this.grid = {
      w: this.def.width,
      h: this.def.height,
      isSolidTile: (tx, ty) => {
        if (tx < 0 || ty < 0 || tx >= this.def.width || ty >= this.def.height) return true;
        return this.def.collision[ty * this.def.width + tx] === 1;
      },
    };
  }

  enter(params?: RoomEnterParams): void {
    this.state.visited = true;
    this.state.lastUsed = Date.now();
    const entrance = this.def.entrances[params?.entranceId ?? 'main'] ?? this.def.entrances.main;
    const spawn = params?.restore ?? entrance ?? { tx: this.layout.spawnTx, ty: this.layout.spawnTy, facing: 1 };
    this.ctx.player.placeAtTile(spawn.tx, spawn.ty);
    this.ctx.player.facing = (['right', 'down', 'left', 'up'] as const)[spawn.facing] ?? 'down';
    this.updateCamera();
    this.ctx.hud.toast(this.def.name);
  }

  exit(): void {
    this.state.lastUsed = Date.now();
  }

  /** 存档用：在室内存档时，读档要把人放回这栋楼门口（室内坐标对大地图无意义） */
  get outsideTile(): { tx: number; ty: number } {
    return {
      tx: this.building.doorTx,
      ty: this.building.doorTy + (this.building.face === 'N' ? -1 : 1),
    };
  }

  serializeState(): RoomState {
    return this.state;
  }

  applyState(state: RoomState): void {
    this.state = state;
  }

  get roomDef(): RoomDef {
    return this.def;
  }

  update(dt: number): void {
    const { player, scenes, medical, menu, hud, health } = this.ctx;

    // 室内也必须推进时间/疾病；否则回家睡觉、上课时病程永远不会走
    player.tick(dt);
    health.tick(player);
    for (const notice of health.takeNotices()) hud.toast(notice);
    if (health.pendingCrisis && !medical.isActive) medical.startCrisis();

    // 课堂进行中：冻结移动，课堂自己处理输入与点击
    if (this.classroom.isActive) {
      this.classroom.update(dt, this.ctx.input);
      const click = this.ctx.input.consumeClick();
      if (click) this.classroom.handleClick(click);
      return;
    }

    // 浮层优先：冻结移动
    if (medical.isActive) {
      medical.update(dt, this.ctx.input);
      return;
    }
    if (menu.isActive) {
      menu.update(dt, this.ctx.input);
      return;
    }

    player.update(dt, this.grid);
    // 房间边界兜底：即使碰撞层漏掉，也不能走出房间
    player.x = Math.max(0, Math.min(player.x, this.def.width * TILE - player.w));
    player.y = Math.max(0, Math.min(player.y, this.def.height * TILE - player.h));
    this.updateCamera();
    const c = player.centerTile();

    // 门口：按 E 离开，不再踩门格自动切场景
    if (this.ctx.input.wasPressed('KeyE') && this.nearExit(c.tx, c.ty)) {
      scenes.request(this.ctx.overworld, { fromDoor: this.building });
      return;
    }

    // 学校课桌：E 坐下上课（周末/放学/毕业/每天 2 节重点课后不可进入）
    if (this.building.id === 'school' && this.ctx.input.wasPressed('KeyE') && this.adjacentTo(T.Table)) {
      const check = this.ctx.schoolState.canAttend(player);
      if (!check.ok) {
        this.ctx.hud.toast(check.reason);
        return;
      }
      this.classroom.start(this.ctx);
      return;
    }

    // E 交互：柜台（就医/购物）与床（休息）
    if (this.ctx.input.wasPressed('KeyE') && this.adjacentTo(T.Counter)) {
      if (this.building.id === 'hospital') {
        medical.startHospital();
      } else if (this.building.id === 'clinic') {
        medical.startClinic();
      } else if (this.building.id === 'shop') {
        this.openShop();
      }
      return;
    }
    if (this.ctx.input.wasPressed('KeyE') && this.building.id === 'home' && this.adjacentTo(T.Bed)) {
      menu.open('床', '钻进被窝，一觉睡到天亮？\n（休息会恢复体力、养病，跳过到明早）', [
        { label: '休息到明早', cb: () => {
          skipToNextMorning();
          health.rest(player);
          hud.toast('睡了个好觉。' + (health.active ? '病去如抽丝，今天好好休息。' : ''));
        } },
        { label: '再待会儿', cb: () => {} },
      ]);
    }
  }

  /** 玩家中心 3x3 邻域是否贴着某类地块 */
  private nearExit(tx: number, ty: number): boolean {
    return this.def.exits.some((e) =>
      tx >= e.tx - 1 && tx <= e.tx + e.w && ty >= e.ty - 1 && ty <= e.ty + e.h,
    );
  }

  /** 房间相机：小房间居中固定；大房间跟随并钳制在房间内 */
  private updateCamera(): void {
    const { player } = this.ctx;
    const roomW = this.def.width * TILE;
    const roomH = this.def.height * TILE;
    if (roomW <= VIEW_W) {
      this.originX = Math.round((VIEW_W - roomW) / 2);
    } else {
      const camX = Math.max(0, Math.min(player.x + player.w / 2 - VIEW_W / 2, roomW - VIEW_W));
      this.originX = -Math.round(camX);
    }
    if (roomH <= VIEW_H) {
      this.originY = Math.round((VIEW_H - roomH) / 2) - 12;
    } else {
      const camY = Math.max(0, Math.min(player.y + player.h / 2 - VIEW_H / 2, roomH - VIEW_H));
      this.originY = -Math.round(camY);
    }
  }

  private adjacentTo(t: T): boolean {
    const c = this.ctx.player.centerTile();
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = c.tx + dx;
        const ty = c.ty + dy;
        if (tx < 0 || ty < 0 || tx >= this.layout.w || ty >= this.layout.h) continue;
        if (this.layout.ground[ty * this.layout.w + tx] === t) return true;
      }
    }
    return false;
  }

  /** 便利店：便当 / 路边摊小吃（有风险）/ 雨伞 */
  private openShop(): void {
    const { player, health, hud, menu } = this.ctx;
    const cap = player.staminaCap();
    menu.open('便利店', `身上 ${player.money} 元。吃点什么？`, [
      { label: '便当', hint: `8 元 · 体力 +35`, disabled: player.money < 8, cb: () => {
        player.money -= 8;
        player.stamina = Math.min(cap, player.stamina + 35);
        hud.toast('吃了个热乎便当，胃里踏实了。');
      } },
      { label: '路边摊小吃', hint: `3 元 · 体力 +15 · 有点不卫生`, disabled: player.money < 3, cb: () => {
        player.money -= 3;
        player.stamina = Math.min(cap, player.stamina + 15);
        if (Math.random() < 0.08 && !health.active) {
          health.onset(player, 'gastro');
          hud.toast('没过多久，肚子开始绞痛……');
        } else {
          hud.toast('味道不错，就是有点心虚。');
        }
      } },
      { label: health.umbrella ? '雨伞（已买）' : '雨伞', hint: health.umbrella ? '雨天不再淋雨' : '30 元 · 雨天不再淋雨', disabled: health.umbrella || player.money < 30, cb: () => {
        player.money -= 30;
        health.umbrella = true;
        hud.toast('买了把伞，下雨天再也不怕感冒了。');
      } },
      { label: '离开', cb: () => {} },
    ]);
  }

  render(g: CanvasRenderingContext2D): void {
    const { player, hud } = this.ctx;
    g.fillStyle = '#101014';
    g.fillRect(0, 0, VIEW_W, VIEW_H);

    const ox = this.originX;
    const oy = this.originY;

    for (let ty = 0; ty < this.layout.h; ty++) {
      for (let tx = 0; tx < this.layout.w; tx++) {
        drawTile(g, this.layout.ground[ty * this.layout.w + tx], ox + tx * TILE, oy + ty * TILE, tx, ty);
      }
    }
    for (let ty = 0; ty < this.layout.h; ty++) {
      for (let tx = 0; tx < this.layout.w; tx++) {
        const d = this.layout.decor[ty * this.layout.w + tx];
        if (d !== NONE) drawTile(g, d, ox + tx * TILE, oy + ty * TILE, tx, ty);
      }
    }

    // 柜台/床交互提示
    const c = player.centerTile();
    let hint: string | null = null;
    if (this.nearExit(c.tx, c.ty)) {
      hint = 'E 离开';
    } else if (this.adjacentTo(T.Counter)) {
      if (this.building.id === 'hospital') hint = 'E 挂号看病';
      else if (this.building.id === 'clinic') hint = 'E 看诊（轻症）';
      else if (this.building.id === 'shop') hint = 'E 买东西';
    } else if (this.building.id === 'home' && this.adjacentTo(T.Bed)) {
      hint = 'E 休息';
    } else if (this.building.id === 'school' && this.adjacentTo(T.Table)) {
      hint = 'E 坐下上课';
    }
    if (this.classroom.isActive) hint = null;
    if (hint) {
      const px = player.x + player.w / 2 + ox;
      const py = player.y - 12 + oy;
      g.font = 'bold 13px monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const w = g.measureText(hint).width;
      g.fillStyle = 'rgba(10,12,16,0.75)';
      g.fillRect(px - w / 2 - 8, py - 9, w + 16, 18);
      g.fillStyle = '#ffd166';
      g.fillText(hint, px, py);
      g.textAlign = 'left';
    }

    player.render(g, ox, oy);
    if (this.classroom.isActive) {
      this.classroom.render(g, ox, oy);
    } else {
      hud.drawIndoor(g, this.building.name);
    }
    this.ctx.medical.render(g);
    this.ctx.menu.render(g);
  }
}

const MAX_ROOM_CACHE = 10;

function cacheRoom(ctx: GameContext, key: string, create: () => IndoorScene): IndoorScene {
  let s = ctx.indoorCache.get(key);
  if (!s) {
    s = create();
    ctx.indoorCache.set(key, s);
    if (ctx.indoorCache.size > MAX_ROOM_CACHE) {
      for (const [id, old] of ctx.indoorCache) {
        if (id !== key && old.def.cache !== 'persistent') {
          ctx.indoorCache.delete(id);
          break;
        }
      }
    }
  }
  return s;
}

// 每栋建筑一个房间场景实例，按 building id 缓存；RoomState 随实例保留
export function getRoomScene(ctx: GameContext, building: Building): IndoorScene {
  return cacheRoom(ctx, building.id, () => new IndoorScene(ctx, building, getIndoorLayout(building.indoor)));
}

// 住宅按 residence id 缓存；h4 的 201/202/301/302/303 各自独立
export function getResidenceScene(ctx: GameContext, res: ResidenceDef): IndoorScene {
  const building = ctx.world.buildings.find((b) => b.id === res.buildingId);
  if (!building) throw new Error(`residence building missing: ${res.buildingId}`);
  return cacheRoom(ctx, res.id, () => new IndoorScene(ctx, building, getIndoorLayout(res.layout), res.id, res.name));
}

// 兼容旧调用点
export const getIndoorScene = getRoomScene;

