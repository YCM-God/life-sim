import { VIEW_H, VIEW_W, TILE } from '../config';
import { computeCamera } from '../core/camera';
import { rectHitsSolid } from '../core/collision';
import { hitsAny, mtvResolve, nearestFreeTile } from '../core/collisionWorld';
import type { StuckState } from '../core/collisionWorld';
import { renderWorld } from '../map/chunkRenderer';
import { renderBuildings } from '../map/buildingRender';
import { drawMinimap } from '../map/minimap';
import { drawBigMap } from '../map/bigmap';
import type { Building } from '../map/world';
import type { GameContext } from '../context';
import type { Scene } from './scene';
import { getResidenceScene, getRoomScene } from './indoorScene';
import { residencesForBuilding } from '../data/residences';
import { checkResidenceEntry } from '../systems/residenceManager';
import { isNight, drawDayNightWidget, gameDayIndex } from '../core/daynight';
import { ResidentManager } from '../entities/resident';
import { PasserbyManager } from '../entities/passersby';
import { Dialogue } from '../ui/dialogue';
import { AttrPanel, PANEL_X } from '../ui/attrPanel';
import { YearEndScene } from './yearEndScene';
import { buildYearReport } from '../core/yearReport';
import { TaxiScene, DESTINATIONS, fareFor } from './taxiScene';
import { nearestStand, drawStands } from '../entities/taxiStand';
import { QuestPanel } from '../ui/questPanel';
import { Vegetation } from '../map/vegetation';
import { SchoolPanel } from '../ui/schoolPanel';

// 大地图场景：行走、区域检测、进门切换室内、居民/路人交互、右侧属性面板
export class OverworldScene implements Scene {
  private lastRegion = '郊外';
  private doorCd = 0; // 从室内返回后的防重进冷却
  private mapOpen = false; // Tab 全屏地图（打开时暂停操作）
  private lastNight: boolean | null = null; // 昼夜相位切换检测
  private lastWeatherDay = -1; // 天气播报（每天一次）
  private camX = 0;
  private camY = 0;
  private pendingSkip = false;
  private stuck: StuckState = { frames: 0 }; // 车辆贴身卡死恢复计数（规范 §4.1）
  readonly residents = new ResidentManager();
  private readonly passersby = new PasserbyManager();
  private readonly dialogue: Dialogue;
  private readonly panel = new AttrPanel();
  private readonly questPanel: QuestPanel;
  private readonly schoolPanel: SchoolPanel;
  private readonly vegetation: Vegetation;

  constructor(private readonly ctx: GameContext) {
    // 开发调试钩子（无头/控制台验证用）
    (window as unknown as { __panel: AttrPanel }).__panel = this.panel;
    this.dialogue = new Dialogue(ctx.quests);
    this.questPanel = new QuestPanel(ctx.quests);
    this.schoolPanel = new SchoolPanel(ctx.schoolState);
    this.vegetation = new Vegetation(ctx.world);
  }

  enter(params?: any): void {
    this.lastNight = isNight(); // 进入场景时校准相位，避免误报
    // 调试：?quest 直接打开人生备忘录（无头截图/验证用）
    if (new URLSearchParams(location.search).has('quest') && !this.questPanel.isActive) this.questPanel.toggle();
    // 调试：?skip 进入后立即触发「跳过今年」（无头截图/验证结算屏用）
    if (new URLSearchParams(location.search).has('skip')) this.pendingSkip = true;
    if (params?.fromDoor) {
      const b: Building = params.fromDoor;
      // 出门落在门面外侧：南门 +1 行，北门 -1 行
      this.ctx.player.placeAtTile(b.doorTx, b.doorTy + (b.face === 'N' ? -1 : 1));
      this.doorCd = 0.8;
    }
  }

  update(dt: number): void {
    const { player, world, scenes, hud, input, health, weather, medical, menu } = this.ctx;

    // 昼夜相位切换提示
    const night = isNight();
    if (this.lastNight !== null && night !== this.lastNight) {
      hud.toast(night ? '夜幕降临……' : '天亮了');
    }
    this.lastNight = night;

    // 时间类累积（学识/零花）每帧推进，与操作无关
    player.tick(dt);
    // 疾病系统：跨天结算（发病/病程/恶化/痊愈）
    health.tick(player);
    for (const notice of health.takeNotices()) hud.toast(notice);
    // 任务系统：每日刷新、目标推进、时限与链解锁
    this.ctx.quests.update();
    // 学校档案：每日出勤结算/毕业/毕业后回响；学校面板只读取档案
    this.ctx.schoolState.update(player, hud);
    // 学校面板：状态推进、折叠与输入；打开详情时冻结世界
    const uiBusy = medical.isActive || menu.isActive || this.mapOpen || this.panel.pageOpen || this.dialogue.isActive || this.questPanel.isActive;
    const schoolWasModal = this.schoolPanel.isModal;
    this.schoolPanel.update(dt, input, player, uiBusy);
    if (schoolWasModal || this.schoolPanel.isModal) {
      const click = input.consumeClick();
      if (click && this.schoolPanel.isModal) this.schoolPanel.handleClick(click);
      this.panel.setForceFold(true);
      return;
    }
    // 病危接管：肺炎拖到健康见底，邻居连夜送医
    if (health.pendingCrisis && !medical.isActive) medical.startCrisis();

    // 每日天气播报
    const today = gameDayIndex();
    if (weather.isRainy() && this.lastWeatherDay !== today) {
      this.lastWeatherDay = today;
      const notice = weather.dayNotice(health.umbrella);
      if (notice) hud.toast(notice);
    } else if (!weather.isRainy()) {
      this.lastWeatherDay = -1;
    }

    // 风险累积：淋雨（没伞）/ 深夜在外 / 贴近生病路人 → 每日结算掷病
    const raining = weather.isRainy();
    const nearSick = this.passersby.nearestSick(player.x + player.w / 2, player.y + player.h / 2) !== null;
    health.accumulate(dt, raining, night, nearSick);

    // 就医流程浮层：冻结世界推进
    if (medical.isActive) {
      medical.update(dt, input);
      this.panel.setForceFold(true);
      return;
    }

    // 出租车目的地菜单：冻结世界推进
    if (menu.isActive) {
      menu.update(dt, input);
      this.panel.setForceFold(true);
      return;
    }

    if (this.pendingSkip) {
      this.pendingSkip = false;
      this.skipYear();
      return;
    }

    // 相机：右侧 192px 为面板区（=屏幕外），可玩视口宽 1088
    const cam = computeCamera(player.x + player.w / 2, player.y + player.h / 2, world.w, world.h, PANEL_X);
    this.camX = cam.x;
    this.camY = cam.y;
    this.panel.setPlayerScreenX(player.x + player.w / 2 - cam.x);
    this.panel.update(dt, player, hud);

    // 属性页打开：吞掉 Esc/Y/P/点击，冻结操作（世界停留在当前帧）
    if (this.panel.pageOpen) {
      if (input.wasPressed('Escape', 'KeyY', 'KeyP')) this.panel.closePage();
      const click = input.consumeClick();
      if (click) this.panel.handleClick(click);
      this.panel.setForceFold(true);
      return;
    }

    // 对话浮层优先吃掉所有输入
    if (this.dialogue.isActive) {
      this.dialogue.update(dt, input);
      this.panel.setForceFold(true);
      return;
    }

    // 人生备忘录：Q 打开（打开当帧不再交给面板处理，避免同帧被关掉）
    if (input.wasPressed('KeyQ') && !this.mapOpen && !this.questPanel.isActive) {
      this.questPanel.toggle();
      this.panel.setForceFold(true);
      return;
    }
    if (this.questPanel.isActive) {
      this.questPanel.update(dt, input);
      this.panel.setForceFold(true);
      return;
    }
    this.panel.setForceFold(false);

    // 面板按键：P 折叠、Y 详情；面板点击（折叠钮/头像）
    if (input.wasPressed('KeyP')) this.panel.toggleFold();
    if (input.wasPressed('KeyY')) this.panel.togglePage();
    const click = input.consumeClick();
    if (click && this.schoolPanel.handleClick(click)) {
      this.panel.setForceFold(true);
      return;
    }
    if (click && !this.panel.handleClick(click)) {
      if (this.mapOpen && this.inCallBtn(click.x, click.y)) this.callTaxi();
      else if (!this.mapOpen && this.inSkipBtn(click.x, click.y)) this.skipYear();
    }

    // T 跳过今年：压缩 10 个游戏日，弹出年度结算
    if (input.wasPressed('KeyT') && !this.mapOpen) this.skipYear();

    // Tab / Esc 切换全屏地图；打开时暂停移动与进门
    if (input.wasPressed('Tab', 'Escape')) {
      this.mapOpen = !this.mapOpen;
      this.panel.setForceFold(this.mapOpen);
    }
    // C 在大地图上叫车：调度费 2 元，出租车直接到原地
    if (input.wasPressed('KeyC') && this.mapOpen) this.callTaxi();

    // 玩家移动：Tile 网格 + 车辆碰撞盒双层判定（人不能穿进车里）
    const carBoxes = this.ctx.traffic.obstacles();
    if (!this.mapOpen) {
      player.update(dt, world, carBoxes);
    }

    const c = player.centerTile();

    // 居民与路人永远在场（地图打开也继续生活）
    this.residents.update(dt, world, player.x, player.y);
    this.passersby.update(dt, world, c.tx, c.ty);
    // 城镇车流：道路上持续 ≥10 辆（含出租车）；把行人位置传进去避让
    const px0 = player.x + player.w / 2;
    const py0 = player.y + player.h / 2;
    const people = [{ x: px0, y: py0 }];
    for (const r of this.residents.list) people.push({ x: r.x + 10, y: r.y + 8 });
    for (const pb of this.passersby.positions) people.push(pb);
    this.ctx.traffic.update(dt, world, c.tx, c.ty, people);

    // 车辆卡死恢复（规范 §4.1）：车辆转弯贴身切入玩家时，MTV 每帧 2px 推出；
    // 连续 0.5s 未脱困 → 螺旋搜索 3 Tile 内最近可走格瞬移兜底（数学上必然脱困）
    const freshBoxes = this.ctx.traffic.obstacles();
    mtvResolve(player, player.w, player.h, freshBoxes, this.stuck);
    if (this.stuck.frames >= 30) {
      const spot = nearestFreeTile(c.tx, c.ty, player.w, player.h, 3, (x, y) =>
        !rectHitsSolid(world, x, y, player.w, player.h) &&
        !hitsAny(freshBoxes, x, y, player.w, player.h));
      if (spot) {
        player.x = spot.x;
        player.y = spot.y;
      }
      this.stuck.frames = 0;
    }

    const region = world.regionAt(c.tx, c.ty);
    const name = region ? region.name : '郊外';
    if (name !== this.lastRegion) {
      this.lastRegion = name;
      hud.toast(name);
      this.ctx.quests.onRegionChange(name);
    }

    // E 键交互：先在门口进房间，再看出租车/站牌/居民/路人
    if (input.wasPressed('KeyE') && !this.mapOpen) {
      const px = player.x + player.w / 2;
      const py = player.y + player.h / 2;
      const doorBuilding = this.nearDoor(px, py);
      if (doorBuilding) {
        this.tryEnterBuilding(doorBuilding);
        return;
      }
      if (this.ctx.traffic.nearestTaxi(px, py)) {
        this.openTaxiMenu();
      } else if (nearestStand(px, py)) {
        hud.toast('你在站牌下招手，一辆出租车靠边停了过来。');
        this.openTaxiMenu();
      } else {
        const r = this.ctx.quests.nearestTarget(px, py) ?? this.residents.nearest(px, py);
        if (r) {
          this.dialogue.open(r);
        } else {
          const p = this.passersby.nearest(px, py);
          if (p) this.passersby.interact(p, health.symptomatic());
        }
      }
    }

    if (this.mapOpen) return;
    if (this.doorCd > 0) this.doorCd -= dt;
  }

  /** 住宅先敲门检查；非住宅直接进房间 */
  private tryEnterBuilding(b: Building): void {
    const list = residencesForBuilding(b.id);
    if (list.length === 0) {
      this.ctx.scenes.request(getRoomScene(this.ctx, b), { fromDoor: b });
      return;
    }
    if (list.length === 1) {
      this.enterResidence(b, list[0]);
      return;
    }
    const opts = list.map((res) => {
      const check = checkResidenceEntry(this.ctx, res);
      const who = res.occupants
        .map((id) => this.ctx.overworld.residents.list.find((r) => r.def.id === id)?.def.name)
        .filter(Boolean)
        .join('、');
      return {
        label: `${res.unit ?? res.name}${check.ok ? '' : '（进不去）'}`,
        hint: check.ok ? who : check.text,
        cb: () => this.enterResidence(b, res),
      };
    });
    opts.push({ label: '算了', hint: '', cb: () => {} });
    this.ctx.menu.open('河景公寓', '去哪一户？', opts);
  }

  private enterResidence(b: Building, res: { id: string }): void {
    const residence = residencesForBuilding(b.id).find((r) => r.id === res.id);
    if (!residence) return;
    const check = checkResidenceEntry(this.ctx, residence);
    if (!check.ok) {
      this.ctx.hud.toast(check.text);
      return;
    }
    this.ctx.hud.toast(check.text);
    this.ctx.scenes.request(getResidenceScene(this.ctx, residence), { fromDoor: b });
  }

  /** 建筑门口 1.25 Tile 内可 E 进入；不再踩门格自动切场景 */
  private nearDoor(px: number, py: number): Building | null {
    let best: Building | null = null;
    let bd = TILE * 1.25;
    for (const b of this.ctx.world.buildings) {
      const x = b.doorTx * TILE + TILE / 2;
      const y = b.doorTy * TILE + TILE / 2;
      const d = Math.hypot(px - x, py - y);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  private inSkipBtn(x: number, y: number): boolean {
    return x >= 920 && x <= 1080 && y >= 676 && y <= 708;
  }

  private inCallBtn(x: number, y: number): boolean {
    return x >= 24 && x <= 244 && y >= VIEW_H - 64 && y <= VIEW_H - 24;
  }

  /** 大地图叫车：调度费 2 元（没钱记司机账），出租车直接到原地接人 */
  private callTaxi(): void {
    const { player, hud } = this.ctx;
    this.mapOpen = false;
    this.panel.setForceFold(false);
    if (player.money >= 2) {
      player.money -= 2;
      hud.toast('调度费 2 元，出租车正驶向你所在的位置。');
    } else {
      player.taxiDebt += 2;
      hud.toast('调度费 2 元先记在司机账上，出租车马上到。');
    }
    this.openTaxiMenu();
  }

  /** 出租车：选目的地（过滤当前位置附近），车费按距离；不够可先赊账，欠账上车前顺手还 */
  private openTaxiMenu(): void {
    const { player, hud, menu, scenes } = this.ctx;
    const c = player.centerTile();
    if (player.taxiDebt > 0 && player.money > 0) {
      const pay = Math.min(player.money, player.taxiDebt);
      player.money -= pay;
      player.taxiDebt -= pay;
      hud.toast(`顺手还了司机 ${pay} 元旧账。`);
    }
    const opts = DESTINATIONS
      .filter((d) => Math.hypot(d.tx - c.tx, d.ty - c.ty) > 12)
      .map((d) => {
        const fare = fareFor(Math.hypot(d.tx - c.tx, d.ty - c.ty));
        const short = player.money < fare;
        return {
          label: short ? `${d.name}（钱不够，赊账）` : d.name,
          hint: `${fare} 元`,
          cb: () => scenes.request(new TaxiScene(this.ctx), { dest: d, originTx: c.tx, originTy: c.ty }),
        };
      });
    opts.push({ label: '算了', hint: '', cb: () => undefined });
    const debtTxt = player.taxiDebt > 0 ? `\n还欠司机 ${player.taxiDebt} 元，下次上车前得先还。` : '';
    menu.open('出租车', `想去哪儿？身上 ${player.money} 元。${debtTxt}`, opts);
  }

  /** 跳过今年：生成年度结算报表（应用全年漂移）并切入结算屏 */
  private skipYear(): void {
    const { player, scenes, health } = this.ctx;
    const questEvents = this.ctx.quests.consumeYearEvents();
    const report = buildYearReport(player, this.residents.list, [...health.consumeYearEvents(), ...questEvents]);
    this.panel.noteAge(player.age); // 生日仪式感由结算屏统一呈现，避免双重奏
    const scene = new YearEndScene(this.ctx, report);
    // 调试：?snap 不切场景淡入，首帧直接呈现终态（无头截图验证用）
    if (new URLSearchParams(location.search).has('snap')) scenes.set(scene);
    else scenes.request(scene);
  }

  render(g: CanvasRenderingContext2D): void {
    const { player, world, hud } = this.ctx;
    const night = isNight();
    const cam = { x: this.camX, y: this.camY }; // update 中已按 1088 视口算好
    g.fillStyle = '#000000';
    g.fillRect(0, 0, VIEW_W, VIEW_H);

    // 世界只渲染进可玩区（0..1087），面板区=屏幕外，不存在被盖住的 NPC
    g.save();
    g.beginPath();
    g.rect(0, 0, PANEL_X, VIEW_H);
    g.clip();

    renderWorld(g, world, cam.x, cam.y, night);
    this.vegetation.renderFlowers(g, cam.x, cam.y, night);
    this.vegetation.renderTrees(g, cam.x, cam.y, player, 'behind', night);
    player.render(g, -cam.x, -cam.y);
    this.vegetation.renderTrees(g, cam.x, cam.y, player, 'front', night);
    // 居民与路人在玩家之后、建筑之前（建筑可遮挡，形成街道纵深）
    this.residents.render(g, -cam.x, -cam.y, player.x, player.y);
    this.passersby.render(g, -cam.x, -cam.y);
    // 车流在路人之后、建筑之前（建筑可遮挡，街道有纵深）
    this.ctx.traffic.render(g, -cam.x, -cam.y);
    // 出租车站牌（路边立牌，夜间顶灯点亮）
    drawStands(g, -cam.x, -cam.y, night);
    const c = player.centerTile();
    renderBuildings(g, world, cam.x, cam.y, c.tx, c.ty, night);
    // 任务地点标记（世界里的小菱形）与 NPC 头顶的委托/交差提示
    this.ctx.quests.drawWorldMarkers(g, cam.x, cam.y);
    this.drawNpcBadges(g, cam.x, cam.y);
    // 雨天叠层（世界之上、UI 之下）
    if (this.ctx.weather.isRainy()) {
      this.ctx.weather.drawRain(g, PANEL_X, VIEW_H, performance.now() / 1000);
    }

    // 可交互提示（最近出租车/站牌/居民/路人头顶的 E 标记）
    if (!this.dialogue.isActive && !this.mapOpen && !this.ctx.menu.isActive) {
      const px = player.x + player.w / 2;
      const py = player.y + player.h / 2;
      const taxi = this.ctx.traffic.nearestTaxi(px, py);
      const stand = nearestStand(px, py);
      const r = this.residents.nearest(px, py);
      let tx = 0;
      let ty = 0;
      if (taxi) {
        tx = taxi.x + 12 - cam.x;
        ty = taxi.y - 18 - cam.y;
      } else if (stand) {
        tx = stand.tx * TILE + 8 - cam.x;
        ty = stand.ty * TILE - 20 - cam.y;
      } else if (r) {
        tx = r.x + 12 - cam.x;
        ty = r.y - 18 - cam.y;
      } else {
        const pb = this.passersby.nearest(px, py);
        if (pb) {
          tx = pb.x + 12 - cam.x;
          ty = pb.y - 18 - cam.y;
        } else {
          const door = this.nearDoor(px, py);
          if (door) {
            tx = door.doorTx * TILE + TILE / 2 - cam.x;
            ty = door.doorTy * TILE - 18 - cam.y;
          }
        }
      }
      if (tx > 0 || ty > 0) {
        g.font = 'bold 13px monospace';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = 'rgba(10,12,16,0.75)';
        g.fillRect(tx - 9, ty - 9, 18, 18);
        g.fillStyle = '#ffd166';
        g.fillText('E', tx, ty);
        g.textAlign = 'left';
      }
    }
    g.restore();

    const schoolVisible = this.schoolPanel.isVisible;
    hud.draw(g, this.lastRegion, !schoolVisible);
    const blockers = [{ x: player.x + 12 - cam.x, y: player.y + 14 - cam.y }];
    for (const r of this.residents.list) blockers.push({ x: r.x + 12 - cam.x, y: r.y + 14 - cam.y });
    this.schoolPanel.render(g, player, this.lastRegion, blockers);
    this.ctx.quests.drawTracker(g, schoolVisible ? 80 : 52);
    // 「跳过今年」入口（右下角，可点击，快捷键 T）
    g.font = '16px monospace';
    g.textBaseline = 'top';
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(920, 676, 160, 32);
    g.strokeStyle = 'rgba(232,232,232,0.3)';
    g.lineWidth = 1.5;
    g.strokeRect(920.5, 676.5, 159, 31);
    g.fillStyle = '#e8e8e8';
    g.textAlign = 'center';
    g.fillText('跳过今年 (T)', 1000, 684);
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    drawMinimap(g, world, c.tx, c.ty, night);
    this.ctx.quests.drawMinimapMarkers(g, world);
    drawDayNightWidget(g);
    if (this.mapOpen) {
      drawBigMap(g, world, c.tx, c.ty, night);
      this.ctx.quests.drawBigMapMarkers(g, world);
      // 大地图叫车按钮（快捷键 C）
      g.fillStyle = 'rgba(12,14,18,0.85)';
      g.fillRect(24, VIEW_H - 64, 220, 40);
      g.strokeStyle = '#e8c85a';
      g.lineWidth = 2;
      g.strokeRect(25, VIEW_H - 63, 218, 38);
      g.font = '16px monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#e8c85a';
      g.fillText('叫车 (C) · 调度费 2 元', 134, VIEW_H - 43);
      g.textAlign = 'left';
      g.textBaseline = 'top';
    }
    this.panel.render(g, player); // 属性页打开时随面板一并绘制
    this.dialogue.render(g);
    this.ctx.medical.render(g);
    this.ctx.menu.render(g);
    this.questPanel.render(g);
    this.schoolPanel.renderModal(g, player);
  }

  /** NPC 头顶的任务提示：! = 有委托，✓ = 可交差 */
  private drawNpcBadges(g: CanvasRenderingContext2D, camX: number, camY: number): void {
    for (const r of this.residents.list) {
      const badge = this.ctx.quests.npcBadge(r.def.id);
      if (!badge) continue;
      const x = r.x + 12 - camX;
      const y = r.y - 28 - camY;
      if (x < -10 || x > PANEL_X + 10 || y < -10 || y > VIEW_H + 10) continue;
      const color = badge === 'turnin' ? '#7fd18a' : '#ffd166';
      g.fillStyle = 'rgba(10,12,16,0.85)';
      g.beginPath();
      g.arc(x, y, 8, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = color;
      g.lineWidth = 1.5;
      g.stroke();
      g.font = 'bold 12px monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = color;
      g.fillText(badge === 'turnin' ? '✓' : '!', x, y + 0.5);
      g.textAlign = 'left';
      g.textBaseline = 'middle';
    }
  }
}
