// Tile 注册表：编号 / 碰撞属性 / 程序化像素绘制（32x32 高清版）
// 无美术资产阶段的占位画法，后续可整体替换为 drawImage 贴图

export const NONE = 0xffff; // 装饰层"无"标记

export enum T {
  Grass,      // 草地
  GrassDark,  // 深色草丛（森林地面）
  Road,       // 土路
  Plaza,      // 石板广场
  Water,      // 水面（不可通行）
  Sand,       // 沙滩
  Roof,       // 屋顶
  Wall,       // 墙 / 岩石
  FloorWood,  // 木地板
  Door,       // 门（可通行，触发场景切换）
  Tree,       // 树（装饰层，不可通行）
  Counter,    // 柜台
  Bed,        // 床
  Table,      // 桌子 / 箱子
  Fountain,   // 喷泉锚点（装饰层）
  Bridge,     // 木桥面（可通行，跨河道）
  GardenPath, // 花园砾石小径
  TulipRed,   // 郁金香·红
  TulipOrange,// 郁金香·橙
  TulipPink,  // 郁金香·杏粉
  TulipCream, // 郁金香·奶油白
  Hyacinth,   // 风信子·薰衣草紫
  WildMeadow, // 野花草甸
  FenceH,     // 铁艺栏杆（横向，装饰层，阻挡）
  FenceV,     // 铁艺栏杆（纵向，装饰层，阻挡）
  BenchS,     // 花园长椅，背北朝南（装饰层，阻挡）
  BenchN,     // 花园长椅，背南朝北（装饰层，阻挡）
  GardenLamp, // 花园路灯（装饰层，阻挡）
}

// 与 T 的编号一一对应：是否阻挡通行
export const SOLID: readonly boolean[] = [
  false, false, false, false, true, false,
  true, true, false, false,
  true, true, true, true, true,
  false, // Bridge 可通行
  false, false, false, false, false, false, false, // 花园地面：小径/花圃/草甸可通行
  true, true, true, true, true,                    // 栏杆/长椅/路灯阻挡
];

export function isSolidTileId(id: number): boolean {
  return id >= 0 && id < SOLID.length ? SOLID[id] : false;
}

// 确定性伪随机，用于 Tile 级纹理变化
export function hash2(x: number, y: number): number {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

// ---------------- 中央花园：花圃 / 小径 / 园具 ----------------
// 三种色阶：[主色, 高光, 暗部]，成带状铺开时同色 Tile 连成色带
const FLOWER_TINT: Record<number, [string, string, string]> = {
  [T.TulipRed]: ['#c8433a', '#ec6f5b', '#8a2a26'],
  [T.TulipOrange]: ['#dc743f', '#f5a06a', '#a04a28'],
  [T.TulipPink]: ['#e89086', '#f8c2b5', '#ac6058'],
  [T.TulipCream]: ['#f3e6c9', '#fffaea', '#c2ae8a'],
  [T.Hyacinth]: ['#9a8cc8', '#cbc2e6', '#675a95'],
};

// 郁金香花圃：草地底 + 叶丛 + 3x3 花头（位置按 Tile 哈希微抖，连片时有自然感）
function drawTulipBed(g: CanvasRenderingContext2D, px: number, py: number, tx: number, ty: number, tint: [string, string, string]): void {
  g.fillStyle = '#3a642b';
  g.fillRect(px, py, 32, 32);
  // 极淡的花色底调：让整条色带在俯视图里连成一片
  g.globalAlpha = 0.17;
  g.fillStyle = tint[0];
  g.fillRect(px, py, 32, 32);
  g.globalAlpha = 1;
  g.fillStyle = '#37602a';
  for (let i = 0; i < 4; i++) {
    g.fillRect(px + ((hash2(tx * 7 + i, ty * 11 + i) * 28) | 0), py + ((hash2(tx * 13 + i, ty * 5 + i) * 28) | 0), 4, 3);
  }
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const hx = px + 2 + i * 10 + ((hash2(tx * 17 + i, ty * 19 + j) * 3) | 0);
      const hy = py + 4 + j * 10 + ((hash2(tx * 23 + i, ty * 29 + j) * 3) | 0);
      // 叶与茎
      g.fillStyle = '#356324';
      g.fillRect(hx + 2, hy + 4, 2, 7);
      g.fillRect(hx - 2, hy + 5, 3, 3);
      g.fillRect(hx + 6, hy + 5, 3, 3);
      // 杯状花头
      g.fillStyle = tint[0];
      g.fillRect(hx, hy, 7, 5);
      g.fillRect(hx + 1, hy - 2, 5, 3);
      g.fillStyle = tint[1];
      g.fillRect(hx + 1, hy, 3, 2);
      g.fillStyle = tint[2];
      g.fillRect(hx, hy + 4, 7, 1);
    }
  }
}

// 风信子花带：竖立花穗，密集小铃
function drawHyacinthBed(g: CanvasRenderingContext2D, px: number, py: number, tx: number, ty: number, tint: [string, string, string]): void {
  g.fillStyle = '#3a642b';
  g.fillRect(px, py, 32, 32);
  g.globalAlpha = 0.17;
  g.fillStyle = tint[0];
  g.fillRect(px, py, 32, 32);
  g.globalAlpha = 1;
  g.fillStyle = '#37602a';
  for (let i = 0; i < 3; i++) {
    g.fillRect(px + ((hash2(tx * 3 + i, ty * 7 + i) * 26) | 0), py + ((hash2(tx * 11 + i, ty * 3 + i) * 26) | 0), 4, 3);
  }
  for (let i = 0; i < 6; i++) {
    const sx = px + 2 + i * 5 + ((hash2(tx * 5 + i, ty * 13) * 2) | 0);
    const sy = py + 5 + ((hash2(tx * 9 + i, ty * 17) * 3) | 0);
    g.fillStyle = '#356324';
    g.fillRect(sx + 1, sy + 13, 1, 9);
    for (let k = 0; k < 7; k++) {
      g.fillStyle = k % 2 === 0 ? tint[0] : tint[1];
      g.fillRect(sx - (k % 2), sy + k * 2, 3, 2);
    }
    g.fillStyle = tint[2];
    g.fillRect(sx, sy + 13, 3, 1);
  }
}

// 野花草甸：密度更低的混色小点，承接花圃与草坪
function drawWildMeadow(g: CanvasRenderingContext2D, px: number, py: number, tx: number, ty: number): void {
  g.fillStyle = '#4d8239';
  g.fillRect(px, py, 32, 32);
  g.fillStyle = '#477937';
  for (let i = 0; i < 6; i++) {
    g.fillRect(px + ((hash2(tx * 7 + i, ty * 23 + i) * 29) | 0), py + ((hash2(tx * 19 + i, ty * 5 + i) * 29) | 0), 3, 2);
  }
  const cols = ['#e6b6c0', '#f0e3cd', '#a99cc6', '#e8c96a', '#cf6a4f', '#8fa273'];
  for (let i = 0; i < 9; i++) {
    const fx = px + 2 + ((hash2(tx * 31 + i, ty * 37 + i) * 26) | 0);
    const fy = py + 2 + ((hash2(tx * 41 + i, ty * 43 + i) * 26) | 0);
    g.fillStyle = cols[(hash2(tx * 3 + i, ty * 2 + i) * cols.length) | 0];
    g.fillRect(fx, fy, 2, 2);
  }
  // 高草
  g.fillStyle = '#5d9143';
  for (let i = 0; i < 4; i++) {
    g.fillRect(px + ((hash2(tx * 47 + i, ty * 53) * 30) | 0), py + ((hash2(tx * 59, ty * 61 + i) * 26) | 0), 1, 4);
  }
}

// 砾石小径：暖白碎石 + 零星落瓣
function drawGardenPath(g: CanvasRenderingContext2D, px: number, py: number, tx: number, ty: number): void {
  g.fillStyle = '#d6c6a3';
  g.fillRect(px, py, 32, 32);
  g.fillStyle = '#cbb997';
  for (let i = 0; i < 7; i++) {
    g.fillRect(px + ((hash2(tx * 11 + i, ty * 13 + i) * 29) | 0), py + ((hash2(tx * 17 + i, ty * 19 + i) * 29) | 0), 2, 1);
  }
  g.fillStyle = '#e3d5b4';
  g.fillRect(px + ((hash2(tx * 23, ty * 29) * 26) | 0), py + ((hash2(tx * 31, ty * 37) * 26) | 0), 4, 2);
  if (hash2(tx * 41 + 3, ty * 43 + 5) < 0.16) {
    g.fillStyle = ['#c96a5e', '#e2a08e', '#f0e3cd'][(hash2(tx * 7, ty * 9) * 3) | 0];
    g.fillRect(px + ((hash2(tx * 5, ty * 3) * 27) | 0), py + ((hash2(tx * 13, ty * 11) * 27) | 0), 3, 2);
  }
}

// 横向铁艺栏杆：石砌矮墙 + 铸铁栏
function drawFenceH(g: CanvasRenderingContext2D, px: number, py: number, tx: number, ty: number): void {
  g.fillStyle = '#b6ae9c';
  g.fillRect(px, py + 22, 32, 9);
  g.fillStyle = '#c9c1ae';
  g.fillRect(px, py + 22, 32, 2);
  g.fillStyle = '#948d7c';
  for (let i = 0; i < 3; i++) {
    g.fillRect(px + ((hash2(tx * 7 + i, ty * 5) * 26) | 0), py + 26 + i * 2, 5, 1);
  }
  g.fillStyle = '#3b403a';
  for (let x = 2; x < 32; x += 5) g.fillRect(px + x, py + 6, 2, 17);
  g.fillRect(px, py + 3, 32, 3);
  g.fillStyle = '#2c302b';
  g.fillRect(px, py + 2, 3, 21);
  g.fillRect(px + 29, py + 2, 3, 21);
}

// 纵向铁艺栏杆
function drawFenceV(g: CanvasRenderingContext2D, px: number, py: number, tx: number, ty: number): void {
  g.fillStyle = '#b6ae9c';
  g.fillRect(px + 22, py, 9, 32);
  g.fillStyle = '#c9c1ae';
  g.fillRect(px + 22, py, 2, 32);
  g.fillStyle = '#948d7c';
  for (let i = 0; i < 3; i++) {
    g.fillRect(px + 25, py + ((hash2(tx * 3, ty * 7 + i) * 26) | 0), 4, 1);
  }
  g.fillStyle = '#3b403a';
  for (let y = 2; y < 32; y += 5) g.fillRect(px + 6, py + y, 17, 2);
  g.fillRect(px + 3, py, 3, 32);
  g.fillStyle = '#2c302b';
  g.fillRect(px + 2, py, 21, 3);
  g.fillRect(px + 2, py + 29, 21, 3);
}

// 长椅：背北朝南
function drawBenchS(g: CanvasRenderingContext2D, px: number, py: number): void {
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(px + 2, py + 27, 28, 5);
  g.fillStyle = '#2f4229';
  g.fillRect(px + 5, py + 22, 4, 8);
  g.fillRect(px + 23, py + 22, 4, 8);
  g.fillStyle = '#3d5436';
  g.fillRect(px + 4, py + 2, 3, 16);
  g.fillRect(px + 25, py + 2, 3, 16);
  g.fillStyle = '#5f8057';
  g.fillRect(px + 3, py + 3, 26, 4);
  g.fillRect(px + 3, py + 9, 26, 4);
  g.fillRect(px + 3, py + 15, 26, 4);
  g.fillStyle = '#9ab98a';
  g.fillRect(px + 3, py + 3, 26, 1);
  g.fillStyle = '#6b8c60';
  g.fillRect(px + 2, py + 18, 28, 8);
  g.fillStyle = '#8fb082';
  g.fillRect(px + 2, py + 18, 28, 2);
  g.fillStyle = '#47603f';
  g.fillRect(px + 2, py + 25, 28, 1);
}

// 长椅：背南朝北
function drawBenchN(g: CanvasRenderingContext2D, px: number, py: number): void {
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(px + 2, py + 27, 28, 5);
  g.fillStyle = '#2f4229';
  g.fillRect(px + 5, py + 22, 4, 8);
  g.fillRect(px + 23, py + 22, 4, 8);
  g.fillStyle = '#3d5436';
  g.fillRect(px + 4, py + 14, 3, 16);
  g.fillRect(px + 25, py + 14, 3, 16);
  g.fillStyle = '#5f8057';
  g.fillRect(px + 3, py + 15, 26, 4);
  g.fillRect(px + 3, py + 21, 26, 4);
  g.fillRect(px + 3, py + 27, 26, 4);
  g.fillStyle = '#9ab98a';
  g.fillRect(px + 3, py + 15, 26, 1);
  g.fillStyle = '#6b8c60';
  g.fillRect(px + 2, py + 6, 28, 8);
  g.fillStyle = '#8fb082';
  g.fillRect(px + 2, py + 6, 28, 2);
  g.fillStyle = '#47603f';
  g.fillRect(px + 2, py + 13, 28, 1);
}

// 维多利亚式路灯（俯视：基座 + 灯杆 + 暖光灯头 + 光池）
function drawGardenLamp(g: CanvasRenderingContext2D, px: number, py: number): void {
  g.fillStyle = 'rgba(255,214,140,0.10)';
  g.fillRect(px + 2, py + 6, 28, 24);
  g.fillStyle = 'rgba(0,0,0,0.20)';
  g.fillRect(px + 10, py + 24, 12, 5);
  g.fillStyle = '#2c302b';
  g.fillRect(px + 14, py + 8, 4, 18);
  g.fillRect(px + 9, py + 24, 14, 3);
  g.fillStyle = '#3a3f3a';
  g.fillRect(px + 10, py + 2, 12, 9);
  g.fillStyle = '#ffe9b0';
  g.fillRect(px + 12, py + 4, 8, 5);
  g.fillStyle = '#fff3cf';
  g.fillRect(px + 13, py + 5, 3, 2);
}

// 32x32 高清像素绘制：所有元素较上一版加密一倍细节
export function drawTile(g: CanvasRenderingContext2D, id: number, px: number, py: number, tx: number, ty: number): void {
  const r = hash2(tx, ty);
  switch (id) {
    case T.Grass: {
      g.fillStyle = '#4d8f3a';
      g.fillRect(px, py, 32, 32);
      // 草簇：成团而不是散点，远看有起伏
      g.fillStyle = '#457f33';
      for (let i = 0; i < 2; i++) {
        const cx = (hash2(tx * 13 + i, ty * 7 + i) * 26) | 0;
        const cy = (hash2(tx * 5 + i, ty * 11 + i) * 26) | 0;
        g.fillRect(px + cx, py + cy, 4, 2);
        g.fillRect(px + cx + 1, py + cy + 2, 3, 2);
        g.fillRect(px + cx + 4, py + cy + 1, 2, 2);
      }
      // 暗部
      g.fillStyle = '#3f7530';
      for (let i = 0; i < 2; i++) {
        const cx = (hash2(tx * 23 + i, ty * 17 + i) * 28) | 0;
        const cy = (hash2(tx * 29 + i, ty * 31 + i) * 28) | 0;
        g.fillRect(px + cx, py + cy, 3, 2);
      }
      // 亮部草尖：1px 竖线更像叶片
      g.fillStyle = '#5aa346';
      for (let i = 0; i < 5; i++) {
        const cx = (hash2(tx * 37 + i, ty * 41 + i) * 29) | 0;
        const cy = (hash2(tx * 43 + i, ty * 47 + i) * 27) | 0;
        g.fillRect(px + cx, py + cy, 1, 3);
        g.fillRect(px + cx + 1, py + cy + 1, 1, 2);
      }
      // 零星小花（密度 3.5%，点缀而不是撒糖）
      if (r < 0.035) {
        const fx = 5 + ((hash2(tx * 29, ty * 31) * 20) | 0);
        const fy = 5 + ((hash2(tx * 37, ty * 41) * 20) | 0);
        g.fillStyle = '#f0ead8';
        g.fillRect(px + fx, py + fy, 3, 1);
        g.fillRect(px + fx, py + fy + 2, 3, 1);
        g.fillRect(px + fx + 1, py + fy + 1, 1, 1);
        g.fillStyle = '#e8c84a';
        g.fillRect(px + fx + 1, py + fy + 1, 1, 1);
      }
      break;
    }
    case T.GrassDark: {
      g.fillStyle = '#3f7530';
      g.fillRect(px, py, 32, 32);
      g.fillStyle = '#376628';
      for (let i = 0; i < 5; i++) {
        const rx = (hash2(tx * 5 + i, ty * 9 + i) * 28) | 0;
        const ry = (hash2(tx * 13 + i, ty * 7 + i) * 29) | 0;
        g.fillRect(px + rx, py + ry, 3, 2);
      }
      break;
    }
    case T.Road: {
      g.fillStyle = '#b3935f';
      g.fillRect(px, py, 32, 32);
      // 车辙暗带
      if (r < 0.25) {
        g.fillStyle = '#a8885a';
        g.fillRect(px, py + ((r * 80) | 0) % 24, 32, 4);
      }
      // 碎石
      g.fillStyle = '#a2814f';
      for (let i = 0; i < 4; i++) {
        g.fillRect(px + ((hash2(tx * 17 + i, ty * 3 + i) * 28) | 0), py + ((hash2(tx * 23 + i, ty * 11 + i) * 28) | 0), 2, 2);
      }
      g.fillStyle = '#c0a06c';
      g.fillRect(px + ((hash2(tx * 31, ty * 37) * 28) | 0), py + ((hash2(tx * 41, ty * 43) * 28) | 0), 2, 2);
      break;
    }
    case T.Plaza: {
      // 2x2 石板 + 灰缝：每块单独加颗粒与偶发裂纹
      for (let qy = 0; qy < 2; qy++) {
        for (let qx = 0; qx < 2; qx++) {
          const odd = (tx + qx + ty + qy) & 1;
          g.fillStyle = odd ? '#98a0a4' : '#8d9599';
          g.fillRect(px + qx * 16, py + qy * 16, 16, 16);
          // 石面颗粒
          const n = 2 + ((hash2(tx * 7 + qx, ty * 11 + qy) * 2) | 0);
          g.fillStyle = odd ? '#a3abaf' : '#98a0a4';
          for (let i = 0; i < n; i++) {
            const gx = qx * 16 + 3 + ((hash2(tx * 13 + i + qx, ty * 17 + i + qy) * 10) | 0);
            const gy = qy * 16 + 3 + ((hash2(tx * 19 + i + qx, ty * 23 + i + qy) * 10) | 0);
            g.fillRect(px + gx, py + gy, 2, 1);
          }
          // 偶发裂纹
          if (hash2(tx * 29 + qx, ty * 31 + qy) < 0.25) {
            const cx = qx * 16 + 4 + ((hash2(tx * 37 + qx, ty * 41 + qy) * 8) | 0);
            const cy = qy * 16 + 5 + ((hash2(tx * 43 + qx, ty * 47 + qy) * 8) | 0);
            g.fillStyle = '#767e82';
            g.fillRect(px + cx, py + cy, 4, 1);
          }
        }
      }
      g.fillStyle = '#7f878b';
      g.fillRect(px + 15, py, 2, 32);
      g.fillRect(px, py + 15, 32, 2);
      if (r < 0.2) { // 裂缝
        g.fillStyle = '#767e82';
        g.fillRect(px + ((r * 90) | 0), py + ((r * 50) | 0), 4, 1);
      }
      break;
    }
    case T.Water: {
      g.fillStyle = '#3d6fb4';
      g.fillRect(px, py, 32, 32);
      // 双层波纹
      g.fillStyle = '#5282c4';
      const w1 = 5 + ((tx * 7 + ty * 3) % 5);
      g.fillRect(px + 3, py + w1, 13, 2);
      g.fillRect(px + 19, py + w1 + 4, 10, 2);
      const w2 = 18 + ((tx * 3 + ty * 11) % 5);
      g.fillRect(px + 6, py + w2, 11, 2);
      g.fillRect(px + 21, py + w2 + 3, 8, 2);
      // 闪光
      if (r < 0.12) {
        g.fillStyle = '#9cc4ee';
        g.fillRect(px + ((r * 200) | 0) % 26 + 3, py + ((r * 340) | 0) % 26 + 3, 2, 2);
      }
      break;
    }
    case T.Sand: {
      g.fillStyle = '#d8c58a';
      g.fillRect(px, py, 32, 32);
      g.fillStyle = '#c9b478';
      for (let i = 0; i < 5; i++) {
        g.fillRect(px + ((hash2(tx * 19 + i, ty * 29 + i) * 28) | 0), py + ((hash2(tx * 7 + i, ty * 17 + i) * 28) | 0), 2, 1);
      }
      if (r < 0.05) { // 贝壳
        g.fillStyle = '#f0ead8';
        g.fillRect(px + ((r * 400) | 0) % 24 + 4, py + ((r * 500) | 0) % 24 + 4, 3, 2);
      }
      break;
    }
    case T.Roof: {
      g.fillStyle = '#a5533c';
      g.fillRect(px, py, 32, 32);
      g.fillStyle = '#b96147';
      g.fillRect(px, py, 32, 2);
      for (let ry = 0; ry < 4; ry++) {
        g.fillStyle = '#8f4632';
        g.fillRect(px, py + ry * 8 + 7, 32, 2);
        // 错缝竖向瓦缝
        const bx = ((ry + ty) & 1) * 8;
        for (let k = 0; k < 2; k++) g.fillRect(px + bx + k * 16 + 6, py + ry * 8 + 1, 2, 6);
      }
      break;
    }
    case T.Wall: {
      g.fillStyle = '#7d7468';
      g.fillRect(px, py, 32, 32);
      g.fillStyle = '#8d8578';
      g.fillRect(px, py, 32, 2);
      g.fillStyle = '#6a6257';
      for (let ry = 0; ry < 4; ry++) {
        g.fillRect(px, py + ry * 8 + 7, 32, 2);
        const bx = ((ry + ty) & 1) * 8;
        for (let k = 0; k < 2; k++) g.fillRect(px + bx + k * 16 + 6, py + ry * 8 + 1, 2, 6);
      }
      break;
    }
    case T.FloorWood: {
      g.fillStyle = '#a9805a';
      g.fillRect(px, py, 32, 32);
      g.fillStyle = '#b78d63';
      g.fillRect(px, py, 32, 2);
      g.fillStyle = '#96714d';
      for (let ry = 0; ry < 4; ry++) {
        g.fillRect(px, py + ry * 8 + 7, 32, 2);
        const bx = ((ry + tx) & 1) * 8;
        for (let k = 0; k < 2; k++) g.fillRect(px + bx + k * 16 + 6, py + ry * 8 + 1, 2, 6);
      }
      break;
    }
    case T.Door: {
      g.fillStyle = '#c9b18a';
      g.fillRect(px, py, 32, 4);
      g.fillRect(px, py, 4, 32);
      g.fillRect(px + 28, py, 4, 32);
      g.fillStyle = '#3a2a18';
      g.fillRect(px + 4, py + 2, 24, 30);
      g.fillStyle = '#2a1e10';
      g.fillRect(px + 8, py + 6, 16, 26);
      g.fillStyle = '#e0c060';
      g.fillRect(px + 22, py + 16, 4, 4);
      g.fillStyle = '#8a6f55';
      g.fillRect(px, py + 29, 32, 3);
      break;
    }
    case T.Tree: {
      g.fillStyle = 'rgba(0,0,0,0.2)';
      g.fillRect(px + 4, py + 24, 24, 6);
      g.fillStyle = '#6b4a2b';
      g.fillRect(px + 13, py + 16, 6, 12);
      g.fillRect(px + 10, py + 26, 12, 3);
      g.fillStyle = '#2e6b2a';
      g.fillRect(px + 4, py + 4, 24, 18);
      g.fillRect(px + 2, py + 8, 4, 10);
      g.fillRect(px + 26, py + 8, 4, 10);
      g.fillStyle = '#3c8434';
      g.fillRect(px + 8, py + 2, 16, 6);
      g.fillStyle = '#27591f';
      g.fillRect(px + 4, py + 18, 24, 4);
      g.fillStyle = '#4a9a40';
      for (let i = 0; i < 3; i++) {
        g.fillRect(px + 6 + ((hash2(tx * 3 + i, ty * 7 + i) * 16) | 0), py + 6 + ((hash2(tx * 9 + i, ty * 5 + i) * 10) | 0), 2, 2);
      }
      break;
    }
    case T.Counter: {
      g.fillStyle = '#8a6a42';
      g.fillRect(px, py, 32, 32);
      g.fillStyle = '#a3825a';
      g.fillRect(px, py, 32, 8);
      g.fillStyle = '#6f5433';
      g.fillRect(px, py + 8, 32, 2);
      g.fillRect(px + 10, py + 14, 2, 15);
      g.fillRect(px + 20, py + 14, 2, 15);
      break;
    }
    case T.Bed: {
      g.fillStyle = '#7a5a3a';
      g.fillRect(px + 1, py + 1, 30, 30);
      g.fillStyle = '#f0ead8';
      g.fillRect(px + 3, py + 3, 26, 26);
      g.fillStyle = '#f5f0e0';
      g.fillRect(px + 5, py + 5, 22, 8);
      g.fillStyle = '#5a7fb8';
      g.fillRect(px + 4, py + 15, 24, 14);
      g.fillStyle = '#4d6ea3';
      g.fillRect(px + 4, py + 15, 24, 2);
      g.fillStyle = '#6f92c8';
      g.fillRect(px + 4, py + 20, 24, 2);
      break;
    }
    case T.Table: {
      g.fillStyle = '#6f4f30';
      g.fillRect(px + 3, py + 24, 5, 6);
      g.fillRect(px + 24, py + 24, 5, 6);
      g.fillStyle = '#8a6540';
      g.fillRect(px + 2, py + 20, 28, 4);
      g.fillStyle = '#9c7850';
      g.fillRect(px + 2, py + 6, 28, 16);
      g.fillStyle = '#a9885f';
      g.fillRect(px + 2, py + 6, 28, 3);
      break;
    }
    case T.Fountain: {
      // 俯视喷泉：外圈石台 + 水面 + 中央水柱（略溢出本格，成为广场焦点）
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(px + 1, py + 26, 30, 6);
      g.fillStyle = '#a9afb3';
      g.fillRect(px + 1, py + 6, 30, 22);
      g.fillStyle = '#c2c8cb';
      g.fillRect(px + 1, py + 6, 30, 3);
      g.fillStyle = '#8b9195';
      g.fillRect(px + 1, py + 27, 30, 2);
      g.fillStyle = '#3d6fb4';
      g.fillRect(px + 4, py + 10, 24, 16);
      g.fillStyle = '#5282c4';
      g.fillRect(px + 6, py + 13, 9, 2);
      g.fillRect(px + 17, py + 18, 9, 2);
      g.fillRect(px + 9, py + 21, 7, 2);
      g.fillStyle = '#9cc4ee';
      g.fillRect(px + 11, py + 15, 3, 2);
      g.fillRect(px + 20, py + 14, 2, 2);
      // 中央基座与水柱
      g.fillStyle = '#8b9195';
      g.fillRect(px + 14, py + 4, 4, 14);
      g.fillStyle = '#b7bdc0';
      g.fillRect(px + 11, py + 2, 10, 4);
      g.fillStyle = '#e2f0ff';
      g.fillRect(px + 15, py - 2, 2, 6);
      g.fillStyle = '#cfe6ff';
      g.fillRect(px + 13, py + 1, 1, 3);
      g.fillRect(px + 18, py + 1, 1, 3);
      break;
    }
    case T.Bridge: {
      // 木桥面：纵向木板 + 横梁 + 两侧矮沿
      g.fillStyle = '#9c7850';
      g.fillRect(px, py, 32, 32);
      g.fillStyle = '#8a6540';
      for (let bx = 0; bx < 4; bx++) g.fillRect(px + bx * 8 + 7, py, 2, 32);
      g.fillStyle = '#a9885f';
      g.fillRect(px + 2, py + 3, 3, 26);
      g.fillStyle = '#7a5a3a';
      g.fillRect(px, py, 3, 32);
      g.fillRect(px + 29, py, 3, 32);
      break;
    }
    case T.GardenPath: {
      drawGardenPath(g, px, py, tx, ty);
      break;
    }
    case T.TulipRed:
    case T.TulipOrange:
    case T.TulipPink:
    case T.TulipCream: {
      drawTulipBed(g, px, py, tx, ty, FLOWER_TINT[id]);
      break;
    }
    case T.Hyacinth: {
      drawHyacinthBed(g, px, py, tx, ty, FLOWER_TINT[id]);
      break;
    }
    case T.WildMeadow: {
      drawWildMeadow(g, px, py, tx, ty);
      break;
    }
    case T.FenceH: {
      drawFenceH(g, px, py, tx, ty);
      break;
    }
    case T.FenceV: {
      drawFenceV(g, px, py, tx, ty);
      break;
    }
    case T.BenchS: {
      drawBenchS(g, px, py);
      break;
    }
    case T.BenchN: {
      drawBenchN(g, px, py);
      break;
    }
    case T.GardenLamp: {
      drawGardenLamp(g, px, py);
      break;
    }
    default:
      g.fillStyle = '#ff00ff';
      g.fillRect(px, py, 32, 32); // 未定义 Tile 醒目报错
  }
}
