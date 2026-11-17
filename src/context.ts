import type { Input } from './core/input';
import type { SceneManager } from './scenes/scene';
import type { World } from './map/world';
import type { Player } from './entities/player';
import type { Hud } from './ui/hud';
import type { OverworldScene } from './scenes/overworldScene';
import type { IndoorScene } from './scenes/indoorScene';
import type { HealthSystem } from './core/health';
import type { WeatherSystem } from './core/weather';
import type { MedicalFlow } from './ui/medical';
import type { ChoiceMenu } from './ui/shopMenu';
import type { CarManager } from './entities/traffic';
import type { Radio } from './core/radio';
import type { QuestManager } from './quest/questManager';
import type { SchoolState } from './systems/schoolState';

// 全局游戏上下文：场景间共享的单一实例集合
export interface GameContext {
  input: Input;
  scenes: SceneManager;
  world: World;
  player: Player;
  hud: Hud;
  overworld: OverworldScene;
  indoorCache: Map<string, IndoorScene>; // 按建筑 id 缓存室内场景实例
  health: HealthSystem;   // 疾病与就医系统
  weather: WeatherSystem; // 每日天气（淋雨 → 感冒）
  medical: MedicalFlow;   // 就医流程浮层（挂号→候诊→诊断→缴费→取药/住院）
  menu: ChoiceMenu;       // 通用选择菜单（便利店购物/在家休息）
  traffic: CarManager;   // 城镇车流（≥10 辆，可招揽出租车）
  radio: Radio;          // 出租车电台（方大同歌单 + 合成占位 + 本地 mp3）
  quests: QuestManager;    // 任务系统（发现/接取/推进/交付/任务链/地图标记）
  schoolState: SchoolState; // 学校档案（出勤/学科/成绩档/推荐/旧友/毕业后回响）
}
