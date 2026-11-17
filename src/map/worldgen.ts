import { NONE, T, hash2 } from './tiles';
import { World } from './world';
import type { Region, Building } from './world';
import { WORLD_H, WORLD_W } from '../config';

// 出生点：家门口南侧（home 门触发格在 248,54，立面带 row0）
export const SPAWN_TILE = { tx: 248, ty: 55 };

// 屏幕格子常量：1 屏 = 40x22 Tile，全图 16x8 屏 = 640x352 Tile
const SC = 40;  // 屏宽（Tile）
const SR = 22;  // 屏深（Tile）

// ---------------- 中央花园：公园正中的花海 ----------------
// 前排郁金香/风信子色带、中景野花草甸、S 形小径、木长椅、维多利亚路灯、
// 石砌矮墙 + 铁艺栏杆，四周树影围合（对应实景照片方案）
const GX0 = 14, GY0 = 70, GX1 = 130, GY1 = 106; // 围墙内边界（含）
const GFX = 72, GFY = 84;                       // 喷泉中心

function gardenPathX(y: number): number {
  return GFX + 12 * Math.sin(((y - GFY) * Math.PI) / 18);
}

// 主径南北出口的横向位置（接驳学校路与滨河步道）
const GATE_X = Math.round(gardenPathX(GY0));

function buildCentralGarden(w: World): void {
  const gateX = GATE_X;

  // 1) 草坪底 + 外围野花草甸环
  for (let y = GY0; y <= GY1; y++) {
    for (let x = GX0; x <= GX1; x++) {
      const edge = Math.min(x - GX0, GX1 - x, y - GY0, GY1 - y);
      w.setGround(x, y, edge <= 3 && hash2(x * 3 + 1, y * 5 + 2) < 0.78 ? T.WildMeadow : T.Grass);
      w.setDecor(x, y, NONE as T);
    }
  }

  // 2) 花圃：园心整片铺满色带（红/橙/杏粉/奶油白/薰衣草紫轮转），主径随后压过
  const bands = [T.TulipRed, T.TulipOrange, T.TulipPink, T.TulipCream, T.Hyacinth];
  for (let y = GY0 + 4; y <= GY1 - 4; y++) {
    const wave = Math.round(2.2 * Math.sin(y * 0.5));
    for (let x = GX0 + 4; x <= GX1 - 4; x++) {
      w.setGround(x, y, bands[Math.floor((x + wave) / 8) % bands.length]);
    }
  }

  // 3) 喷泉广场 + 环形风信子镶边
  for (let y = GY0; y <= GY1; y++) {
    for (let x = GX0; x <= GX1; x++) {
      const d2 = (x - GFX) ** 2 + (y - GFY) ** 2;
      if (d2 <= 16) w.setGround(x, y, T.GardenPath);
      else if (d2 <= 36) w.setGround(x, y, T.Hyacinth);
    }
  }

  // 4) 十字小径（喷泉东西轴）
  for (let y = GFY - 1; y <= GFY + 1; y++) {
    for (let x = GX0; x <= GX1; x++) w.setGround(x, y, T.GardenPath);
  }

  // 5) S 形主径：南门 → 喷泉 → 北门
  for (let y = GY0; y <= GY1; y++) {
    const cx = Math.round(gardenPathX(y));
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx;
      if (x >= GX0 && x <= GX1) w.setGround(x, y, T.GardenPath);
    }
  }

  // 6) 喷泉
  w.setDecor(GFX, GFY, T.Fountain);

  // 7) 长椅：北侧背北朝南，南侧背南朝北
  for (const bx of [52, 92]) {
    w.setDecor(bx, 79, T.BenchS);
    w.setDecor(bx, 91, T.BenchN);
  }

  // 8) 路灯：主径两侧 + 十字径两端
  for (const [lx, ly] of [[56, 74], [88, 74], [56, 94], [88, 94],
                          [44, 82], [100, 82], [44, 88], [100, 88]] as const) {
    w.setDecor(lx, ly, T.GardenLamp);
  }

  // 8b) 园内乔木：四角与北侧各几株，给花海压出纵深
  for (const [tx, ty] of [[18, 72], [40, 72], [104, 72], [126, 72],
                          [18, 104], [126, 104]] as const) {
    w.setDecor(tx, ty, T.Tree);
  }

  // 9) 石砌矮墙 + 铁艺栏杆：四周合围，南北主径与东西十字径留出入口
  for (let x = GX0; x <= GX1; x++) {
    if (Math.abs(x - gateX) <= 1) continue;
    w.setDecor(x, GY0, T.FenceH);
    w.setDecor(x, GY1, T.FenceH);
  }
  for (let y = GY0 + 1; y < GY1; y++) {
    if (y >= GFY - 1 && y <= GFY + 1) continue;
    w.setDecor(GX0, y, T.FenceV);
    w.setDecor(GX1, y, T.FenceV);
  }

  // 10) 园外一圈树影：入口与路口留空，避免挡道
  const nearGate = (x: number, y: number) =>
    (Math.abs(x - gateX) <= 4 && (y === GY0 - 2 || y === GY1 + 2)) ||
    (y >= GFY - 2 && y <= GFY + 2 && (x === GX0 - 2 || x === GX1 + 2));
  for (let x = GX0 - 2; x <= GX1 + 2; x += 5) {
    if (!nearGate(x, GY0 - 2) && hash2(x * 7 + 3, 11) < 0.72) w.setDecor(x, GY0 - 2, T.Tree);
    if (!nearGate(x, GY1 + 2) && hash2(x * 11 + 5, 17) < 0.72) w.setDecor(x, GY1 + 2, T.Tree);
  }
  for (let y = GY0 - 1; y <= GY1 + 1; y += 5) {
    if (!nearGate(GX0 - 2, y) && hash2(23, y * 13 + 7) < 0.72) w.setDecor(GX0 - 2, y, T.Tree);
    if (!nearGate(GX1 + 2, y) && hash2(29, y * 17 + 3) < 0.72) w.setDecor(GX1 + 2, y, T.Tree);
  }

  // 11) 出入口接驳：北接学校路（y=56），南接滨河步道（y=132），并清掉路面装饰
  const gatePath = (y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = gateX - 1; x <= gateX + 1; x++) {
        w.setGround(x, y, T.GardenPath);
        w.setDecor(x, y, NONE as T);
      }
    }
  };
  gatePath(2 * SR + 12, GY0 - 1);
  gatePath(GY1 + 1, 6 * SR);
}

// 按《地图结构与动线设计》生成 16x8 屏世界（120 屏陆地 + 8 屏水面）：
//   y=0  北山森林 | y=1-2 学校/居民/商务 | y=3-4 公园/商业 | y=5-6 滨河 | y=7 水面+南岸
export function buildWorld(): World {
  const w = new World(WORLD_W, WORLD_H);

  // 1) 草地底图 + 深色草丛斑块
  for (let y = 0; y < w.h; y++) {
    for (let x = 0; x < w.w; x++) {
      w.setGround(x, y, hash2(x, y) < 0.14 ? T.GrassDark : T.Grass);
    }
  }

  // 2) 区域定义（区域互不相交，regionAt 按数组顺序命中）
  //    格子坐标见设计文档：S(0-3,1-2) R(4-9,1-3) C(10-13,1-2) O(14-15,1-5)
  //    P(0-3,3-4) M(y3:10-13 / y4:4-13 / y5:4-9) V(y5:0-3,10-13 / y6 整排) F(y0 整排)
  const regions: Region[] = [
    { id: 'forest', name: '北山森林公园', x: 0, y: 0, w: 640, h: SR },
    { id: 'school', name: '学校区', x: 0, y: SR, w: 4 * SC, h: 2 * SR },
    { id: 'town', name: '居民区', x: 4 * SC, y: SR, w: 6 * SC, h: 3 * SR },
    { id: 'cbd', name: '商务区', x: 10 * SC, y: SR, w: 4 * SC, h: 2 * SR },
    { id: 'oldtown', name: '老城文化区', x: 14 * SC, y: SR, w: 2 * SC, h: 5 * SR },
    { id: 'park', name: '中央花园', x: 0, y: 3 * SR, w: 4 * SC, h: 2 * SR },
    { id: 'mall-n', name: '中央商业区', x: 10 * SC, y: 3 * SR, w: 4 * SC, h: SR },
    { id: 'mall', name: '中央商业区', x: 4 * SC, y: 4 * SR, w: 10 * SC, h: SR },
    { id: 'mall-s', name: '中央商业区', x: 4 * SC, y: 5 * SR, w: 6 * SC, h: SR },
    { id: 'river-w', name: '滨河休闲带', x: 0, y: 5 * SR, w: 4 * SC, h: SR },
    { id: 'river-e', name: '滨河休闲带', x: 10 * SC, y: 5 * SR, w: 4 * SC, h: SR },
    { id: 'river', name: '滨河休闲带', x: 0, y: 6 * SR, w: 16 * SC, h: SR },
    { id: 'south', name: '居民区·南岸', x: 8 * SC, y: 7 * SR, w: 8 * SC, h: SR },
  ];
  w.regions = regions;

  // 3) 河道水面（y=7 排西半）+ 一圈沙岸 + 木桥 3 座（x=8/11/14 屏位）
  for (let y = 7 * SR; y < 8 * SR; y++) {
    for (let x = 0; x < 8 * SC; x++) w.setGround(x, y, T.Water);
  }
  for (let x = 0; x < 8 * SC; x++) {
    w.setGround(x, 7 * SR - 1, T.Sand);
    w.setGround(x, 7 * SR - 2, T.Sand);
  }

  // 4) 路网：主街（商业横轴）+ 三条纵街 + 学校/商务横路 + 滨河路 + 南岸路
  const hRoad = (y0: number, x0: number, x1: number) => {
    for (let y = y0; y <= y0 + 1; y++) for (let x = x0; x <= x1; x++) w.setGround(x, y, T.Road);
  };
  const vRoad = (x0: number, y0: number, y1: number) => {
    for (let x = x0; x <= x0 + 1; x++) for (let y = y0; y <= y1; y++) w.setGround(x, y, T.Road);
  };
  // 1-Tile 支路（巷子）：只铺一行/列，连接建筑门口与干道
  const hLane = (y0: number, x0: number, x1: number) => {
    for (let x = x0; x <= x1; x++) w.setGround(x, y0, T.Road);
  };
  const vLane = (x0: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) w.setGround(x0, y, T.Road);
  };
  hRoad(4 * SR, 3 * SC + 19, 14 * SC - 1);     // 商业主街 y=88-89，x=139-559（西延接入学校纵街，修复孤岛）
  hRoad(2 * SR + 12, 0, 4 * SC + 20);      // 学校路 y=56-57，x=0-180（东延 20 格，让林家巷子接得上）
  hRoad(2 * SR + 12, 10 * SC, 14 * SC + 18); // 商务区横路 y=56-57，x=400-578（东延接入老城纵街，修复孤岛）
  hRoad(6 * SR + 12, 0, 16 * SC - 1);        // 滨河路 y=144-145
  hRoad(7 * SR + 11, 8 * SC, 16 * SC - 1);   // 南岸路 y=165-166
  vRoad(6 * SC + 19, 2 * SR + 10, 6 * SR + 12);  // 居民纵街 x=259-260，学校路→滨河路
  vRoad(10 * SC + 19, 2 * SR + 12, 6 * SR + 12);   // 商业纵街 x=419-420，商务区横路→滨河路（北延 8 格接商务区横路）
  vRoad(14 * SC + 19, 2 * SR + 10, 7 * SR + 11); // 老城纵街 x=579-580，学校路→南岸路
  vRoad(3 * SC + 19, 2 * SR + 12, 4 * SR);       // 学校纵街 x=139-140，学校路→主街

  // 4b) 1-Tile 支路：居民区每栋建筑门口 → 最近干道（连通性审查 #4）
  // 学校为校园设计：门前是操场广场（可步行），学校路 y=56 沿校园北缘，不铺车行道穿操场
  vLane(173, 37, 2 * SR + 12);   // 林家巷子：门口(173,36) → 学校路（东延后）
  vLane(298, 35, 4 * SR);        // 镇医院巷子：门口(298,34) → 主街（就医系统主入口，优先通公路）
  vLane(329, 55, 4 * SR);        // 苏家巷子：门口(329,54) → 主街
  vLane(248, 55, 4 * SR);        // 家巷子：门口(248,54) → 主街
  vLane(239, 51, 4 * SR);        // 冯记早餐巷子：门口(239,50) → 主街
  vLane(207, 77, 4 * SR);        // 陈家巷子：门口(207,76) → 主街

  // 5) 硬化场地：滨河步道（石板）、公园广场、校园操场、商业区人行道
  for (let y = 6 * SR; y < 6 * SR + 12; y++) {
    for (let x = 0; x < 16 * SC; x++) {
      if (w.getGround(x, y) === T.Grass || w.getGround(x, y) === T.GrassDark) w.setGround(x, y, T.Plaza);
    }
  }
  buildCentralGarden(w); // 中央公园·中央花园：花圃色带 + S 形小径 + 园具
  for (let y = SR + 12; y < 2 * SR + 12; y++) {
    for (let x = SC + 14; x < 3 * SC; x++) w.setGround(x, y, T.Plaza);     // 校园操场
  }
  for (let y = 4 * SR + 2; y < 4 * SR + 4; y++) {
    for (let x = 4 * SC; x < 14 * SC; x++) {
      if (w.getGround(x, y) === T.Grass || w.getGround(x, y) === T.GrassDark) w.setGround(x, y, T.Plaza); // 主街两侧人行道
    }
  }
  for (let y = 7 * SR + 3; y < 7 * SR + 8; y++) {
    for (let x = 8 * SC; x < 16 * SC; x++) {
      if (w.getGround(x, y) === T.Grass || w.getGround(x, y) === T.GrassDark) w.setGround(x, y, T.Plaza); // 南岸滨江步道
    }
  }
  w.setDecor(2 * SC - 8, 3 * SR + 18, T.Fountain); // 公园喷泉（约 x=72, y=84，花园中心）

  // 5.5) 木桥 3 座（x=8/11/14 屏位）：最后画，压过路与步道，保证整段桥面
  for (const bx of [8, 11, 14]) {
    for (let y = 7 * SR - 2; y < 8 * SR; y++) {
      for (let x = bx * SC + 4; x <= bx * SC + 7; x++) w.setGround(x, y, T.Bridge);
    }
  }

  // 6) 建筑：footprint 整面为屋顶（碰撞），门触发格在 footprint 外 2 Tile 的立面带内
  //    face=S：门在 y+h（南立面带邻楼行）；face=N：门在 y-1（北立面带邻楼行）
  const B = (id: string, name: string, x: number, y: number, wd: number, ht: number, doorTx: number, kind: string, face: 'N' | 'S', indoor: string): Building =>
    ({ id, name, x, y, w: wd, h: ht, doorTx, doorTy: face === 'S' ? y + ht : y - 1, indoor, kind, face });
  const buildings: Building[] = [
    // 居民区（每天去）——民居门朝南朝南院
    B('home', '家', 244, 46, 10, 8, 248, 'house', 'S', 'home'),        // (6,2) 屏中央
    B('h1', '林家', 170, 30, 8, 6, 173, 'house', 'S', 'generic'),      // (4,1)
    B('h2', '苏家', 326, 48, 8, 6, 329, 'house', 'S', 'generic'),      // (8,2)
    B('h3', '陈家', 204, 70, 8, 6, 207, 'house', 'S', 'generic'),      // (5,3)
    B('h4', '河景公寓', 488, 157, 12, 8, 493, 'apartment', 'S', 'generic'), // 南岸 (12,7)
    // 学校区（学龄期每天去）
    B('school', '学校', 86, 28, 16, 9, 93, 'school', 'S', 'school'),   // (2,1)
    // 镇医院（居民区旁边，疾病与就医系统的主入口）
    B('hospital', '镇医院', 292, 26, 14, 8, 298, 'hospital', 'S', 'hospital'), // (7,1)
    // 商务区（工作期每天去）
    B('office', '星辰大厦', 446, 24, 14, 10, 452, 'office', 'S', 'office'), // (11,1)
    // 中央商业区（每天去）——立面朝北临街
    B('mall', '百货商场', 206, 92, 18, 10, 214, 'mall', 'N', 'generic'),   // (5,4)
    B('clinic', '诊所', 268, 93, 9, 6, 272, 'shop', 'N', 'generic'),       // (7,4)
    B('shop', '便利店', 326, 93, 9, 6, 330, 'shop', 'N', 'shop'),         // (8,4)
    B('bar', '酒吧', 404, 93, 9, 6, 408, 'shop', 'N', 'generic'),         // (10,4)
    // 居民区沿街小店（居民锚点：冯军/谢婉婷/陈大伟）
    B('breakfast', '冯记早餐', 236, 46, 7, 4, 239, 'shop', 'S', 'generic'), // 玩家家西侧
    B('express', '快递站', 374, 60, 7, 4, 377, 'shop', 'S', 'generic'),   // 商业纵街西侧
    B('flower', '婉婷花店', 409, 60, 7, 4, 412, 'shop', 'S', 'generic'),  // 商业纵街西侧
    // 老城文化区（剧情才去）
    B('tower', '老钟楼', 568, 44, 8, 10, 571, 'tower', 'S', 'generic'),    // (14,2)
    B('antique', '古董店', 604, 96, 9, 6, 608, 'shop', 'S', 'generic'),    // (15,4)
    B('station', '老火车站', 562, 114, 14, 8, 568, 'station', 'S', 'hall'), // (14,5)
    // 北山森林公园（剧情才去）
    B('tower2', '瞭望塔', 494, 6, 6, 6, 496, 'tower', 'S', 'generic'),     // (12,0) 山顶
  ];
  for (const b of buildings) {
    for (let y = b.y; y < b.y + b.h; y++) {
      for (let x = b.x; x < b.x + b.w; x++) w.setGround(x, y, T.Roof);
    }
  }
  w.buildings = buildings;

  // 瞭望塔周围清出林间空地
  for (let y = 13; y <= 19; y++) {
    for (let x = 488; x <= 506; x++) {
      if (w.getGround(x, y) !== T.Roof && w.getGround(x, y) !== T.Door) w.setGround(x, y, T.GrassDark);
    }
  }

  // 7) 植被：森林带最密（越往北越密），公园次之，居民区院落稀疏点缀
  for (let y = 0; y < w.h; y++) {
    for (let x = 0; x < w.w; x++) {
      const g0 = w.getGround(x, y);
      if (g0 !== T.Grass && g0 !== T.GrassDark) continue;
      const inForest = y < SR;
      const inPark = x < 4 * SC && y >= 3 * SR && y < 5 * SR;
      const inTown = x >= 4 * SC && x < 10 * SC && y >= SR && y < 4 * SR;
      const p = inForest
        ? 0.15 + 0.4 * (1 - y / SR) // 峰值 0.55，低于方格渗透阈值，林内不封死
        : inPark
          ? 0.1
          : inTown
            ? 0.03
            : 0.012;
      const inGarden = x >= GX0 - 1 && x <= GX1 + 1 && y >= GY0 - 1 && y <= GY1 + 1;
      const onGatePath = x >= GATE_X - 1 && x <= GATE_X + 1 &&
        ((y >= 2 * SR + 12 && y < GY0) || (y > GY1 && y <= 6 * SR));
      if (!inGarden && !onGatePath && hash2(x * 5 + 1, y * 9 + 3) < p) w.setDecor(x, y, T.Tree);
    }
  }
  // 立面带清场（在植被之后）：门周 3x4 圈 + 整条立面带不得有树木等装饰（规范第 3 节）
  for (const b of buildings) {
    const rows = b.face === 'S' ? [b.y + b.h, b.y + b.h + 1] : [b.y - 2, b.y - 1];
    for (const y of rows) {
      for (let x = b.x; x < b.x + b.w; x++) w.setDecor(x, y, 0xffff as T);
    }
    for (let y = b.doorTy - 1; y <= b.doorTy + 2 && y < w.h; y++) {
      for (let x = b.doorTx - 1; x <= b.doorTx + 1; x++) {
        if (w.inBounds(x, y) && !(x === b.doorTx && y === b.doorTy)) w.setDecor(x, y, 0xffff as T);
      }
    }
  }
  // 滨河柳树成行（点缀在步道上，不挡主路）
  for (let x = 6; x < 16 * SC; x += 9) {
    if (hash2(x, 999) < 0.6) w.setDecor(x, 6 * SR + 9, T.Tree);
  }

  // 8) 门触发格（最后落位）：立面带邻楼行，可通行，踩上切换室内
  for (const b of buildings) {
    w.setGround(b.doorTx, b.doorTy, T.Door);
    w.addDoor(b.doorTx, b.doorTy, { sceneId: b.indoor, buildingId: b.id });
  }

  return w;
}
