// 地图数据自检：bundle worldgen 后在 Node 里跑（无 DOM 依赖）
import { buildWorld, SPAWN_TILE } from '../src/map/worldgen';
import { T } from '../src/map/tiles';

const w = buildWorld();
let fail = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + '  ' + msg); if (!cond) fail++; };

// 1) 尺寸
ok(w.w === 640 && w.h === 176, `世界尺寸 ${w.w}x${w.h} = 16x8 屏`);

// 2) 水面恰好 8 屏（8*40*22 = 7040 Tile）
let water = 0, land = 0;
for (let i = 0; i < w.w * w.h; i++) {
  if (w.ground[i] === T.Water) water++; else land++;
}
ok(water === 8 * 40 * 22, `水面 ${water} Tile = 8 屏（预期 7040）`);
ok(land === 120 * 40 * 22, `陆地 ${land} Tile = 120 屏（预期 ${120 * 40 * 22}）`);

// 3) 洪泛填充：从出生点出发的可达性
const seen = new Uint8Array(w.w * w.h);
const q = [SPAWN_TILE.tx + SPAWN_TILE.ty * w.w];
seen[q[0]] = 1;
while (q.length) {
  const i = q.pop();
  const x = i % w.w, y = (i / w.w) | 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w.w || ny >= w.h) continue;
    const ni = nx + ny * w.w;
    if (seen[ni] || w.isSolidTile(nx, ny)) continue;
    seen[ni] = 1;
    q.push(ni);
  }
}
const reach = seen.reduce((a, b) => a + b, 0);
console.log(`INFO  可达 Tile ${reach} / 陆地 ${land}`);
ok(reach / land > 0.9, `可达率 ${(reach / land * 100).toFixed(1)}% > 90%`);

// 4) 关键 POI 可达：每栋建筑的门外一格（按 face 方向）必须可达
for (const b of w.buildings) {
  const off = b.face === 'N' ? -1 : 1;
  ok(seen[b.doorTx + (b.doorTy + off) * w.w] === 1, `可达：${b.name} 门外 (${b.doorTx},${b.doorTy + off})`);
}
ok(seen[72 + 85 * w.w] === 1, '可达：公园喷泉旁 (72,85)');

// 5) 桥：3 座、每座 4 宽，连通南岸
for (const bx of [8, 11, 14]) {
  let bridgeTiles = 0;
  for (let y = 7 * 22 - 2; y < 8 * 22; y++)
    for (let x = bx * 40 + 4; x <= bx * 40 + 7; x++)
      if (w.ground[x + y * w.w] === T.Bridge) bridgeTiles++;
  ok(bridgeTiles === 4 * 24, `桥 x=${bx} 屏位：${bridgeTiles}/96 Tile 为桥面`);
}
ok(seen[330 + 170 * w.w] === 1, '经桥可达南岸（x=330, y=170）');

// 6) 每栋建筑的门已注册且门 Tile 正确
for (const b of w.buildings) {
  const i = b.doorTx + b.doorTy * w.w;
  ok(w.ground[i] === T.Door && w.doorAt(b.doorTx, b.doorTy)?.buildingId === b.id, `门注册：${b.name}`);
}

// 7) 建筑规范（《建筑与环境美术规范》）：门对齐 + 立面带无碰撞
for (const b of w.buildings) {
  const expectTy = b.face === 'S' ? b.y + b.h : b.y - 1;
  ok(b.doorTy === expectTy, `门对齐：${b.name} doorTy=${b.doorTy}`);
  let bandSolid = 0;
  const rows = b.face === 'S' ? [b.y + b.h, b.y + b.h + 1] : [b.y - 2, b.y - 1];
  for (const y of rows) for (let x = b.x; x < b.x + b.w; x++) if (w.isSolidTile(x, y)) bandSolid++;
  ok(bandSolid === 0, `立面带无碰撞：${b.name}`);
}

console.log(fail === 0 ? '\nALL CHECKS PASSED' : `\n${fail} CHECKS FAILED`);
process.exit(fail === 0 ? 0 : 1);
