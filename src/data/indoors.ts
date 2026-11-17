import { T } from '../map/tiles';

// 室内布局：与大地图同构的 Tile 数据（地面层 + 装饰层），数据驱动
export interface IndoorLayout {
  id: string;
  w: number;
  h: number;
  ground: Uint16Array;
  decor: Uint16Array;
  doorTx: number; // 出口门（走上去回大地图）
  doorTy: number;
  spawnTx: number; // 玩家进入后的落脚点
  spawnTy: number;
}

const NONE = 0xffff;

function baseRoom(w: number, h: number, floor: T = T.FloorWood): { g: Uint16Array; d: Uint16Array } {
  const g = new Uint16Array(w * h).fill(floor);
  const d = new Uint16Array(w * h).fill(NONE);
  for (let x = 0; x < w; x++) {
    g[x] = T.Wall;
    g[(h - 1) * w + x] = T.Wall;
  }
  for (let y = 0; y < h; y++) {
    g[y * w] = T.Wall;
    g[y * w + w - 1] = T.Wall;
  }
  return { g, d };
}

function finish(id: string, w: number, h: number, g: Uint16Array, d: Uint16Array, doorTx: number, spawnTx: number, spawnTy: number): IndoorLayout {
  g[doorTx + (h - 1) * w] = T.Door;
  return { id, w, h, ground: g, decor: d, doorTx, doorTy: h - 1, spawnTx, spawnTy };
}

const builders: Record<string, () => IndoorLayout> = {
  // 家：床 + 餐桌 + 厨房操作台
  home() {
    const w = 14, h = 10;
    const { g, d } = baseRoom(w, h);
    for (let y = 1; y <= 3; y++) for (let x = 1; x <= 2; x++) g[y * w + x] = T.Bed;
    for (let y = 4; y <= 5; y++) for (let x = 6; x <= 7; x++) g[y * w + x] = T.Table;
    for (let x = 9; x <= 12; x++) g[w + x] = T.Counter;
    return finish('home', w, h, g, d, 7, 7, 7);
  },
  // 杂货铺：一排柜台 + 两侧货箱
  shop() {
    const w = 18, h = 12;
    const { g, d } = baseRoom(w, h);
    for (let x = 2; x <= 15; x++) g[6 * w + x] = T.Counter;
    g[2 * w + 2] = T.Table;
    g[2 * w + 15] = T.Table;
    return finish('shop', w, h, g, d, 8, 8, 8);
  },
  // 市政厅：长条会议桌
  hall() {
    const w = 16, h = 12;
    const { g, d } = baseRoom(w, h);
    for (let y = 4; y <= 5; y++) for (let x = 3; x <= 12; x++) g[y * w + x] = T.Table;
    return finish('hall', w, h, g, d, 7, 7, 8);
  },
  // 矿洞：石地 + 支撑柱 + 矿箱
  mine() {
    const w = 14, h = 10;
    const { g, d } = baseRoom(w, h, T.Plaza);
    g[3 * w + 4] = T.Wall; g[3 * w + 9] = T.Wall;
    g[7 * w + 4] = T.Wall; g[7 * w + 9] = T.Wall;
    g[8 * w + 2] = T.Table; g[w + 11] = T.Table;
    return finish('mine', w, h, g, d, 7, 7, 6);
  },
  // 学校教室：40×22 全屏，6×5 座位由课堂名册绘制；这里只保留门槛桌
  school() {
    const w = 40, h = 22;
    const { g, d } = baseRoom(w, h);
    g[11 * w + 18] = T.Table; // 玩家座位前的交互桌（E 坐下上课）
    return finish('school', w, h, g, d, 20, 20, 19);
  },
  // 公司办公区：工位阵列 + 会议室长桌
  office() {
    const w = 18, h = 12;
    const { g, d } = baseRoom(w, h);
    for (let y = 2; y <= 4; y += 2) {
      for (let x = 2; x <= 8; x += 3) g[y * w + x] = T.Table;  // 工位
    }
    for (let y = 3; y <= 4; y++) for (let x = 12; x <= 16; x++) g[y * w + x] = T.Table; // 会议桌
    return finish('office', w, h, g, d, 8, 8, 8);
  },
  // 镇医院：挂号台 + 候诊椅阵 + 诊室(诊床/药柜)；柜台为就医交互点
  hospital() {
    const w = 20, h = 12;
    const { g, d } = baseRoom(w, h, T.Plaza);
    for (let x = 3; x <= 8; x++) g[4 * w + x] = T.Counter;     // 挂号台
    for (let y = 6; y <= 9; y += 1) {
      g[y * w + 12] = T.Table;                                 // 候诊椅两列
      g[y * w + 15] = T.Table;
    }
    for (let y = 2; y <= 3; y++) for (let x = 16; x <= 18; x++) g[y * w + x] = T.Counter; // 药柜
    g[8 * w + 3] = T.Bed; g[8 * w + 4] = T.Bed;                // 诊室诊床
    return finish('hospital', w, h, g, d, 10, 10, 7);
  },

  // 单间出租屋：24×14
  singleRoom() {
    const w = 24, h = 14;
    const { g, d } = baseRoom(w, h);
    for (let y = 2; y <= 4; y++) for (let x = 19; x <= 20; x++) g[y * w + x] = T.Bed;
    g[3 * w + 4] = T.Table; g[4 * w + 4] = T.Table;
    for (let x = 3; x <= 5; x++) g[9 * w + x] = T.Counter;
    g[10 * w + 17] = T.Table;
    return finish('singleRoom', w, h, g, d, 12, 12, 12);
  },
  // 一室一厅：40×22
  oneBed() {
    const w = 40, h = 22;
    const { g, d } = baseRoom(w, h);
    for (let y = 3; y <= 6; y++) for (let x = 31; x <= 33; x++) g[y * w + x] = T.Bed;
    for (let x = 5; x <= 8; x++) g[10 * w + x] = T.Table;
    for (let x = 3; x <= 6; x++) g[3 * w + x] = T.Counter;
    for (let x = 15; x <= 17; x++) g[16 * w + x] = T.Table;
    return finish('oneBed', w, h, g, d, 20, 20, 20);
  },
  // 两室一厅：40×22
  twoBed() {
    const w = 40, h = 22;
    const { g, d } = baseRoom(w, h);
    for (let y = 3; y <= 5; y++) for (let x = 3; x <= 4; x++) g[y * w + x] = T.Bed;
    for (let y = 3; y <= 5; y++) for (let x = 34; x <= 35; x++) g[y * w + x] = T.Bed;
    for (let x = 15; x <= 18; x++) g[9 * w + x] = T.Table;
    for (let x = 17; x <= 19; x++) g[3 * w + x] = T.Counter;
    for (let x = 15; x <= 17; x++) g[17 * w + x] = T.Table;
    return finish('twoBed', w, h, g, d, 20, 20, 19);
  },
  // 老年平房：40×18
  oldHouse() {
    const w = 40, h = 18;
    const { g, d } = baseRoom(w, h);
    for (let y = 2; y <= 4; y++) for (let x = 33; x <= 34; x++) g[y * w + x] = T.Bed;
    for (let x = 7; x <= 9; x++) g[8 * w + x] = T.Table;
    for (let x = 3; x <= 5; x++) g[2 * w + x] = T.Counter;
    for (let x = 3; x <= 4; x++) g[13 * w + x] = T.Table;
    return finish('oldHouse', w, h, g, d, 20, 20, 16);
  },
  // 分租自建房：40×22，5 人
  boarding() {
    const w = 40, h = 22;
    const { g, d } = baseRoom(w, h);
    for (let y = 2; y <= 4; y++) for (let x = 3; x <= 4; x++) g[y * w + x] = T.Bed;
    for (let y = 8; y <= 10; y++) for (let x = 3; x <= 4; x++) g[y * w + x] = T.Bed;
    for (let y = 2; y <= 4; y++) for (let x = 34; x <= 35; x++) g[y * w + x] = T.Bed;
    for (let x = 15; x <= 18; x++) g[10 * w + x] = T.Table;
    for (let x = 17; x <= 19; x++) g[3 * w + x] = T.Counter;
    for (let x = 15; x <= 17; x++) g[17 * w + x] = T.Table;
    return finish('boarding', w, h, g, d, 20, 20, 19);
  },
  // 公寓单元：32×18
  apartment() {
    const w = 32, h = 18;
    const { g, d } = baseRoom(w, h);
    for (let y = 2; y <= 5; y++) for (let x = 24; x <= 25; x++) g[y * w + x] = T.Bed;
    for (let x = 6; x <= 8; x++) g[9 * w + x] = T.Table;
    for (let x = 3; x <= 5; x++) g[3 * w + x] = T.Counter;
    for (let x = 14; x <= 16; x++) g[14 * w + x] = T.Table;
    return finish('apartment', w, h, g, d, 16, 16, 16);
  },
  // 通用小室内：一屋一桌
  generic() {
    const w = 10, h = 8;
    const { g, d } = baseRoom(w, h);
    g[3 * w + 4] = T.Table; g[3 * w + 5] = T.Table;
    return finish('generic', w, h, g, d, 4, 4, 5);
  },
};

const cache = new Map<string, IndoorLayout>();

export function getIndoorLayout(id: string): IndoorLayout {
  let layout = cache.get(id);
  if (!layout) {
    const b = builders[id] ?? builders.generic;
    layout = b();
    cache.set(id, layout);
  }
  return layout;
}
