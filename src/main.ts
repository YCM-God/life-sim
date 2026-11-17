import { VIEW_H, VIEW_W } from './config';
import { Input } from './core/input';
import { Player } from './entities/player';
import { buildWorld, SPAWN_TILE } from './map/worldgen';
import { SceneManager } from './scenes/scene';
import { OverworldScene } from './scenes/overworldScene';
import { CreationScene } from './scenes/creationScene';
import { Hud } from './ui/hud';
import { TouchControls, isTouchMode } from './ui/touchControls';
import { HealthSystem } from './core/health';
import { WeatherSystem } from './core/weather';
import { MedicalFlow } from './ui/medical';
import { ChoiceMenu } from './ui/shopMenu';
import { CarManager } from './entities/traffic';
import { Radio } from './core/radio';
import { rollTalents, BASE_HEALTH, BASE_MIND } from './data/character';
import { QuestManager } from './quest/questManager';
import { SchoolState } from './systems/schoolState';
import { absGameHour, advanceGameMinutes, gameDayIndex, gameHour, setGameTime, skipGameDays, skipToNextMorning } from './core/daynight';
import { AGING_DAYS } from './entities/player';
import { SaveKeeper, loadSave, restorePlayer, restoreQuests } from './core/save';
import { addPlayMs } from './core/playtime';
import { SavePanel } from './ui/savePanel';
import { ExamBook } from './ui/examBook';
import type { GameContext } from './context';

const canvas = document.getElementById('game') as HTMLCanvasElement;
canvas.width = VIEW_W;
canvas.height = VIEW_H;
const g = canvas.getContext('2d')!;
g.imageSmoothingEnabled = false; // 像素风：禁止平滑

const input = new Input(canvas);
// 触屏设备叠加虚拟按键；桌面端不创建任何覆盖层
const stage = document.getElementById('stage');
const touchUI = stage ? new TouchControls(input, stage) : null;
const world = buildWorld();
const player = new Player(input);
player.placeAtTile(SPAWN_TILE.tx, SPAWN_TILE.ty);
// 调试：?at=tx,ty 传送出生点（取景用）
const atParam = new URLSearchParams(location.search).get('at');
if (atParam) {
  const [tx, ty] = atParam.split(',').map(Number);
  if (Number.isFinite(tx) && Number.isFinite(ty)) player.placeAtTile(tx, ty);
}
// 开发调试钩子（无头/控制台验证用）
(window as unknown as { __input: Input }).__input = input;
const hud = new Hud();
hud.setTouchMode(isTouchMode());
const scenes = new SceneManager();
const health = new HealthSystem();
const weather = new WeatherSystem();
player.health = health;

const ctx: GameContext = {
  input,
  scenes,
  world,
  player,
  hud,
  overworld: null as unknown as OverworldScene, // 在下方创建后回填
  indoorCache: new Map(),
  health,
  weather,
  medical: null as unknown as MedicalFlow, // 下方创建后回填
  menu: new ChoiceMenu(),
  traffic: new CarManager(),
  radio: new Radio(),
  quests: new QuestManager(),
  schoolState: new SchoolState(),
};
const overworld = new OverworldScene(ctx);
ctx.overworld = overworld;
const medical = new MedicalFlow(ctx);
ctx.medical = medical;
// 任务系统在场景、居民、疾病都就位后绑定；此时 player.stats 还是空的，
// bind 只记住 ctx，不会触发"新的一天"结算——读档时正好不会把存档覆盖掉
ctx.quests.bind(ctx);

// 存档：默认接着上次玩；?new=1 忽略存档从创建角色开始（调试用 ?auto 优先）
const params = new URLSearchParams(location.search);
const savedGame = params.has('new') ? null : loadSave();
if (savedGame) {
  restorePlayer(ctx, savedGame);
  restoreQuests(ctx, savedGame);
}
if (params.has('quests')) ctx.quests.discoverAll();
(window as unknown as { __medical: MedicalFlow }).__medical = medical;
(window as unknown as { __player: Player }).__player = player;
(window as unknown as { __ctx: GameContext }).__ctx = ctx;
// 调试：时间轴钩子（自动化验证断言用；?dn=night 与 setGameTime 不可混用）
(window as unknown as { __time: unknown }).__time = {
  gameDayIndex,
  gameHour,
  absGameHour,
  setGameTime,
  skipGameDays,
  skipToNextMorning,
  advanceGameMinutes,
};
// 调试：?auto 跳过创建角色直接进入大地图（配合 ?dn= 调试昼夜）
if (params.has('auto')) {
  const t = rollTalents();
  player.setCharacter('male', { int: t.int, look: t.look, family: t.family, health: BASE_HEALTH, mind: BASE_MIND });
  scenes.set(overworld);
  // 调试：?sick=cold|gastro|sprain|pneumonia 直接发病；?money=N 给钱
  const sick = params.get('sick');
  if (sick) health.debugOnset(player, sick);
  const money = params.get('money');
  if (money) player.money += Number(money) || 0;
  // 调试：?age=30 直接推进到指定年龄，便于验证中后期主线/支线
  const age = params.get('age');
  if (age) {
    const target = Math.max(6, Math.min(90, Number(age) || 6));
    skipGameDays((target - 6) * AGING_DAYS);
  }
  (window as unknown as { __health: HealthSystem }).__health = health;
} else if (savedGame) {
  // 直接续档：跳过创建界面，回到存档那一刻所在的位置
  scenes.set(overworld);
  hud.toast(`继续上次的人生 · ${player.age} 岁`);
} else {
  scenes.set(new CreationScene(ctx)); // 首次进入：创建角色
}

// 自动存档：每 5 秒一次，切后台/关页时立即存
const saver = new SaveKeeper(ctx);
// 玫瑰花园：手动存档面板（IndexedDB 10 槽位，带游玩时长），入口是一朵 HTML 玫瑰
const savePanel = new SavePanel(ctx, input, stage);
// 期末考试预约按钮：翻开的书本，点击预约、第二天开考
const examBook = new ExamBook(ctx, stage);

let last = performance.now();
// 虚拟键默认收起（CSS 里 .dpad/.actions 默认 display:none），进入游戏场景才显示
let touchShown = false;
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05); // 钳制大帧，切后台回来不跳变
  last = now;
  scenes.update(dt);
  hud.update(dt);
  saver.tick(dt);
  examBook.update();
  // 创建角色界面要用整块画面点按钮，虚拟键先收起来，进游戏后再出现
  const playing = !(scenes.current instanceof CreationScene);
  // 游玩时长只累计真正在玩的 foreground 时间：创建界面与存档面板打开时不算
  if (playing && !savePanel.isOpen()) addPlayMs(dt * 1000);
  // 玫瑰入口随场景换位置：主页面在左下，游戏内收成底部小花（见 index.html 的 .playing）
  stage?.classList.toggle('playing', playing);
  if (playing !== touchShown) {
    touchShown = playing;
    touchUI?.setVisible(playing);
  }
  scenes.render(g);
  input.endFrame(); // 清按键边沿，必须在场景更新之后
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
