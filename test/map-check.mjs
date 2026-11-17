// src/map/tiles.ts
var NONE = 65535;
var SOLID = [
  false,
  false,
  false,
  false,
  true,
  false,
  true,
  true,
  false,
  false,
  true,
  true,
  true,
  true,
  true,
  false
  // Bridge 可通行
];
function isSolidTileId(id) {
  return id >= 0 && id < SOLID.length ? SOLID[id] : false;
}
function hash2(x, y) {
  let n = x * 374761393 + y * 668265263 | 0;
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
}

// src/map/world.ts
var World = class {
  constructor(w2, h) {
    this.w = w2;
    this.h = h;
    this.ground = new Uint16Array(w2 * h);
    this.decor = new Uint16Array(w2 * h).fill(NONE);
  }
  ground;
  decor;
  regions = [];
  buildings = [];
  doors = /* @__PURE__ */ new Map();
  idx(tx, ty) {
    return ty * this.w + tx;
  }
  inBounds(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }
  getGround(tx, ty) {
    return this.inBounds(tx, ty) ? this.ground[this.idx(tx, ty)] : 7 /* Wall */;
  }
  setGround(tx, ty, t) {
    if (this.inBounds(tx, ty)) this.ground[this.idx(tx, ty)] = t;
  }
  getDecor(tx, ty) {
    return this.inBounds(tx, ty) ? this.decor[this.idx(tx, ty)] : NONE;
  }
  setDecor(tx, ty, t) {
    if (this.inBounds(tx, ty)) this.decor[this.idx(tx, ty)] = t;
  }
  isSolidTile(tx, ty) {
    if (!this.inBounds(tx, ty)) return true;
    const i = this.idx(tx, ty);
    const d = this.decor[i];
    if (d !== NONE && isSolidTileId(d)) return true;
    return isSolidTileId(this.ground[i]);
  }
  addDoor(tx, ty, link) {
    this.doors.set(this.idx(tx, ty), link);
  }
  doorAt(tx, ty) {
    return this.inBounds(tx, ty) ? this.doors.get(this.idx(tx, ty)) : void 0;
  }
  regionAt(tx, ty) {
    for (const r of this.regions) {
      if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) return r;
    }
    return void 0;
  }
};

// src/config.ts
var WORLD_W = 640;
var WORLD_H = 176;

// src/map/worldgen.ts
var SPAWN_TILE = { tx: 248, ty: 55 };
var SC = 40;
var SR = 22;
function buildWorld() {
  const w2 = new World(WORLD_W, WORLD_H);
  for (let y = 0; y < w2.h; y++) {
    for (let x = 0; x < w2.w; x++) {
      w2.setGround(x, y, hash2(x, y) < 0.14 ? 1 /* GrassDark */ : 0 /* Grass */);
    }
  }
  const regions = [
    { id: "forest", name: "\u5317\u5C71\u68EE\u6797\u516C\u56ED", x: 0, y: 0, w: 640, h: SR },
    { id: "school", name: "\u5B66\u6821\u533A", x: 0, y: SR, w: 4 * SC, h: 2 * SR },
    { id: "town", name: "\u5C45\u6C11\u533A", x: 4 * SC, y: SR, w: 6 * SC, h: 3 * SR },
    { id: "cbd", name: "\u5546\u52A1\u533A", x: 10 * SC, y: SR, w: 4 * SC, h: 2 * SR },
    { id: "oldtown", name: "\u8001\u57CE\u6587\u5316\u533A", x: 14 * SC, y: SR, w: 2 * SC, h: 5 * SR },
    { id: "park", name: "\u4E2D\u592E\u516C\u56ED", x: 0, y: 3 * SR, w: 4 * SC, h: 2 * SR },
    { id: "mall-n", name: "\u4E2D\u592E\u5546\u4E1A\u533A", x: 10 * SC, y: 3 * SR, w: 4 * SC, h: SR },
    { id: "mall", name: "\u4E2D\u592E\u5546\u4E1A\u533A", x: 4 * SC, y: 4 * SR, w: 10 * SC, h: SR },
    { id: "mall-s", name: "\u4E2D\u592E\u5546\u4E1A\u533A", x: 4 * SC, y: 5 * SR, w: 6 * SC, h: SR },
    { id: "river-w", name: "\u6EE8\u6CB3\u4F11\u95F2\u5E26", x: 0, y: 5 * SR, w: 4 * SC, h: SR },
    { id: "river-e", name: "\u6EE8\u6CB3\u4F11\u95F2\u5E26", x: 10 * SC, y: 5 * SR, w: 4 * SC, h: SR },
    { id: "river", name: "\u6EE8\u6CB3\u4F11\u95F2\u5E26", x: 0, y: 6 * SR, w: 16 * SC, h: SR },
    { id: "south", name: "\u5C45\u6C11\u533A\xB7\u5357\u5CB8", x: 8 * SC, y: 7 * SR, w: 8 * SC, h: SR }
  ];
  w2.regions = regions;
  for (let y = 7 * SR; y < 8 * SR; y++) {
    for (let x = 0; x < 8 * SC; x++) w2.setGround(x, y, 4 /* Water */);
  }
  for (let x = 0; x < 8 * SC; x++) {
    w2.setGround(x, 7 * SR - 1, 5 /* Sand */);
    w2.setGround(x, 7 * SR - 2, 5 /* Sand */);
  }
  const hRoad = (y0, x0, x1) => {
    for (let y = y0; y <= y0 + 1; y++) for (let x = x0; x <= x1; x++) w2.setGround(x, y, 2 /* Road */);
  };
  const vRoad = (x0, y0, y1) => {
    for (let x = x0; x <= x0 + 1; x++) for (let y = y0; y <= y1; y++) w2.setGround(x, y, 2 /* Road */);
  };
  hRoad(4 * SR, 4 * SC, 14 * SC - 1);
  hRoad(2 * SR + 12, 0, 4 * SC - 1);
  hRoad(2 * SR + 12, 10 * SC, 14 * SC - 1);
  hRoad(6 * SR + 12, 0, 16 * SC - 1);
  hRoad(7 * SR + 11, 8 * SC, 16 * SC - 1);
  vRoad(6 * SC + 19, 2 * SR + 10, 6 * SR + 12);
  vRoad(10 * SC + 19, 3 * SR, 6 * SR + 12);
  vRoad(14 * SC + 19, 2 * SR + 10, 7 * SR + 11);
  vRoad(3 * SC + 19, 2 * SR + 12, 4 * SR);
  for (let y = 6 * SR; y < 6 * SR + 12; y++) {
    for (let x = 0; x < 16 * SC; x++) {
      if (w2.getGround(x, y) === 0 /* Grass */ || w2.getGround(x, y) === 1 /* GrassDark */) w2.setGround(x, y, 3 /* Plaza */);
    }
  }
  for (let y = 3 * SR + 10; y < 4 * SR + 14; y++) {
    for (let x = SC + 10; x < 3 * SC - 6; x++) w2.setGround(x, y, 3 /* Plaza */);
  }
  for (let y = SR + 12; y < 2 * SR + 12; y++) {
    for (let x = SC + 14; x < 3 * SC; x++) w2.setGround(x, y, 3 /* Plaza */);
  }
  for (let y = 4 * SR + 2; y < 4 * SR + 4; y++) {
    for (let x = 4 * SC; x < 14 * SC; x++) {
      if (w2.getGround(x, y) === 0 /* Grass */ || w2.getGround(x, y) === 1 /* GrassDark */) w2.setGround(x, y, 3 /* Plaza */);
    }
  }
  for (let y = 7 * SR + 3; y < 7 * SR + 8; y++) {
    for (let x = 8 * SC; x < 16 * SC; x++) {
      if (w2.getGround(x, y) === 0 /* Grass */ || w2.getGround(x, y) === 1 /* GrassDark */) w2.setGround(x, y, 3 /* Plaza */);
    }
  }
  w2.setDecor(2 * SC - 8, 3 * SR + 18, 14 /* Fountain */);
  for (const bx of [8, 11, 14]) {
    for (let y = 7 * SR - 2; y < 8 * SR; y++) {
      for (let x = bx * SC + 4; x <= bx * SC + 7; x++) w2.setGround(x, y, 15 /* Bridge */);
    }
  }
  const B = (id, name, x, y, wd, ht, doorTx, kind, face, indoor) => ({ id, name, x, y, w: wd, h: ht, doorTx, doorTy: face === "S" ? y + ht : y - 1, indoor, kind, face });
  const buildings = [
    // 居民区（每天去）——民居门朝南朝南院
    B("home", "\u5BB6", 244, 46, 10, 8, 248, "house", "S", "home"),
    // (6,2) 屏中央
    B("h1", "\u6797\u5BB6", 170, 30, 8, 6, 173, "house", "S", "generic"),
    // (4,1)
    B("h2", "\u82CF\u5BB6", 326, 48, 8, 6, 329, "house", "S", "generic"),
    // (8,2)
    B("h3", "\u9648\u5BB6", 204, 70, 8, 6, 207, "house", "S", "generic"),
    // (5,3)
    B("h4", "\u6CB3\u666F\u516C\u5BD3", 488, 157, 12, 8, 493, "apartment", "S", "generic"),
    // 南岸 (12,7)
    // 学校区（学龄期每天去）
    B("school", "\u5B66\u6821", 86, 28, 16, 9, 93, "school", "S", "school"),
    // (2,1)
    // 商务区（工作期每天去）
    B("office", "\u661F\u8FB0\u5927\u53A6", 446, 24, 14, 10, 452, "office", "S", "office"),
    // (11,1)
    // 中央商业区（每天去）——立面朝北临街
    B("mall", "\u767E\u8D27\u5546\u573A", 206, 92, 18, 10, 214, "mall", "N", "generic"),
    // (5,4)
    B("clinic", "\u8BCA\u6240", 268, 93, 9, 6, 272, "shop", "N", "generic"),
    // (7,4)
    B("shop", "\u4FBF\u5229\u5E97", 326, 93, 9, 6, 330, "shop", "N", "shop"),
    // (8,4)
    B("bar", "\u9152\u5427", 404, 93, 9, 6, 408, "shop", "N", "generic"),
    // (10,4)
    // 老城文化区（剧情才去）
    B("tower", "\u8001\u949F\u697C", 568, 44, 8, 10, 571, "tower", "S", "generic"),
    // (14,2)
    B("antique", "\u53E4\u8463\u5E97", 604, 96, 9, 6, 608, "shop", "S", "generic"),
    // (15,4)
    B("station", "\u8001\u706B\u8F66\u7AD9", 562, 114, 14, 8, 568, "station", "S", "hall"),
    // (14,5)
    // 北山森林公园（剧情才去）
    B("tower2", "\u77AD\u671B\u5854", 494, 6, 6, 6, 496, "tower", "S", "generic")
    // (12,0) 山顶
  ];
  for (const b of buildings) {
    for (let y = b.y; y < b.y + b.h; y++) {
      for (let x = b.x; x < b.x + b.w; x++) w2.setGround(x, y, 6 /* Roof */);
    }
  }
  w2.buildings = buildings;
  for (let y = 13; y <= 19; y++) {
    for (let x = 488; x <= 506; x++) {
      if (w2.getGround(x, y) !== 6 /* Roof */ && w2.getGround(x, y) !== 9 /* Door */) w2.setGround(x, y, 1 /* GrassDark */);
    }
  }
  for (let y = 0; y < w2.h; y++) {
    for (let x = 0; x < w2.w; x++) {
      const g0 = w2.getGround(x, y);
      if (g0 !== 0 /* Grass */ && g0 !== 1 /* GrassDark */) continue;
      const inForest = y < SR;
      const inPark = x < 4 * SC && y >= 3 * SR && y < 5 * SR;
      const inTown = x >= 4 * SC && x < 10 * SC && y >= SR && y < 4 * SR;
      const p = inForest ? 0.15 + 0.4 * (1 - y / SR) : inPark ? 0.1 : inTown ? 0.03 : 0.012;
      if (hash2(x * 5 + 1, y * 9 + 3) < p) w2.setDecor(x, y, 10 /* Tree */);
    }
  }
  for (const b of buildings) {
    const rows = b.face === "S" ? [b.y + b.h, b.y + b.h + 1] : [b.y - 2, b.y - 1];
    for (const y of rows) {
      for (let x = b.x; x < b.x + b.w; x++) w2.setDecor(x, y, 65535);
    }
    for (let y = b.doorTy - 1; y <= b.doorTy + 2 && y < w2.h; y++) {
      for (let x = b.doorTx - 1; x <= b.doorTx + 1; x++) {
        if (w2.inBounds(x, y) && !(x === b.doorTx && y === b.doorTy)) w2.setDecor(x, y, 65535);
      }
    }
  }
  for (let x = 6; x < 16 * SC; x += 9) {
    if (hash2(x, 999) < 0.6) w2.setDecor(x, 6 * SR + 9, 10 /* Tree */);
  }
  for (const b of buildings) {
    w2.setGround(b.doorTx, b.doorTy, 9 /* Door */);
    w2.addDoor(b.doorTx, b.doorTy, { sceneId: b.indoor, buildingId: b.id });
  }
  return w2;
}

// test/map-check.mts
var w = buildWorld();
var fail = 0;
var ok = (cond, msg) => {
  console.log((cond ? "PASS" : "FAIL") + "  " + msg);
  if (!cond) fail++;
};
ok(w.w === 640 && w.h === 176, `\u4E16\u754C\u5C3A\u5BF8 ${w.w}x${w.h} = 16x8 \u5C4F`);
var water = 0;
var land = 0;
for (let i = 0; i < w.w * w.h; i++) {
  if (w.ground[i] === 4 /* Water */) water++;
  else land++;
}
ok(water === 8 * 40 * 22, `\u6C34\u9762 ${water} Tile = 8 \u5C4F\uFF08\u9884\u671F 7040\uFF09`);
ok(land === 120 * 40 * 22, `\u9646\u5730 ${land} Tile = 120 \u5C4F\uFF08\u9884\u671F ${120 * 40 * 22}\uFF09`);
var seen = new Uint8Array(w.w * w.h);
var q = [SPAWN_TILE.tx + SPAWN_TILE.ty * w.w];
seen[q[0]] = 1;
while (q.length) {
  const i = q.pop();
  const x = i % w.w, y = i / w.w | 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w.w || ny >= w.h) continue;
    const ni = nx + ny * w.w;
    if (seen[ni] || w.isSolidTile(nx, ny)) continue;
    seen[ni] = 1;
    q.push(ni);
  }
}
var reach = seen.reduce((a, b) => a + b, 0);
console.log(`INFO  \u53EF\u8FBE Tile ${reach} / \u9646\u5730 ${land}`);
ok(reach / land > 0.9, `\u53EF\u8FBE\u7387 ${(reach / land * 100).toFixed(1)}% > 90%`);
for (const b of w.buildings) {
  const off = b.face === "N" ? -1 : 1;
  ok(seen[b.doorTx + (b.doorTy + off) * w.w] === 1, `\u53EF\u8FBE\uFF1A${b.name} \u95E8\u5916 (${b.doorTx},${b.doorTy + off})`);
}
ok(seen[72 + 85 * w.w] === 1, "\u53EF\u8FBE\uFF1A\u516C\u56ED\u55B7\u6CC9\u65C1 (72,85)");
for (const bx of [8, 11, 14]) {
  let bridgeTiles = 0;
  for (let y = 7 * 22 - 2; y < 8 * 22; y++)
    for (let x = bx * 40 + 4; x <= bx * 40 + 7; x++)
      if (w.ground[x + y * w.w] === 15 /* Bridge */) bridgeTiles++;
  ok(bridgeTiles === 4 * 24, `\u6865 x=${bx} \u5C4F\u4F4D\uFF1A${bridgeTiles}/96 Tile \u4E3A\u6865\u9762`);
}
ok(seen[330 + 170 * w.w] === 1, "\u7ECF\u6865\u53EF\u8FBE\u5357\u5CB8\uFF08x=330, y=170\uFF09");
for (const b of w.buildings) {
  const i = b.doorTx + b.doorTy * w.w;
  ok(w.ground[i] === 9 /* Door */ && w.doorAt(b.doorTx, b.doorTy)?.buildingId === b.id, `\u95E8\u6CE8\u518C\uFF1A${b.name}`);
}
for (const b of w.buildings) {
  const expectTy = b.face === "S" ? b.y + b.h : b.y - 1;
  ok(b.doorTy === expectTy, `\u95E8\u5BF9\u9F50\uFF1A${b.name} doorTy=${b.doorTy}`);
  let bandSolid = 0;
  const rows = b.face === "S" ? [b.y + b.h, b.y + b.h + 1] : [b.y - 2, b.y - 1];
  for (const y of rows) for (let x = b.x; x < b.x + b.w; x++) if (w.isSolidTile(x, y)) bandSolid++;
  ok(bandSolid === 0, `\u7ACB\u9762\u5E26\u65E0\u78B0\u649E\uFF1A${b.name}`);
}
console.log(fail === 0 ? "\nALL CHECKS PASSED" : `
${fail} CHECKS FAILED`);
process.exit(fail === 0 ? 0 : 1);
