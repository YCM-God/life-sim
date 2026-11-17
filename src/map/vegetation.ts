// 植被层：静态花草仍在 chunk 烘焙里；树/风动花独立精灵，Y 排序 + 视口剔除 + 树冠淡出
import { TILE, VIEW_H, VIEW_W } from '../config';
import { hash2, T } from './tiles';
import type { World } from './world';
import type { Player } from '../entities/player';
import { nightCanvas } from '../core/daynight';

interface Tree {
  id: number;
  x: number;
  baseY: number;
  variant: number;
  phase: number;
  alpha: number;
}

const TREE_CANOPY_W = 48;
const TREE_CANOPY_H = 40;
const TREE_TRUNK_W = 12;
const TREE_TRUNK_H = 24;

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function makeCanopy(variant: number): HTMLCanvasElement {
  const c = canvas(TREE_CANOPY_W, TREE_CANOPY_H);
  const g = c.getContext('2d')!;
  const dark = ['#27591f', '#254f20', '#2d5a24'][variant % 3];
  const mid = ['#2e6b2a', '#31702b', '#36752f'][variant % 3];
  const light = ['#3c8434', '#428c38', '#488f3d'][variant % 3];
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(4, 34, 40, 5);
  g.fillStyle = dark;
  g.fillRect(8, 10, 32, 24);
  g.fillRect(2, 16, 44, 14);
  g.fillStyle = mid;
  g.fillRect(6, 6, 36, 24);
  g.fillRect(0, 14, 48, 12);
  g.fillStyle = light;
  for (let i = 0; i < 10; i++) {
    const x = 3 + ((hash2(variant * 31 + i, i * 7) * 40) | 0);
    const y = 5 + ((hash2(i * 13 + 2, variant * 17 + 3) * 24) | 0);
    g.fillRect(x, y, 3, 2);
  }
  return c;
}

function makeTrunk(): HTMLCanvasElement {
  const c = canvas(TREE_TRUNK_W, TREE_TRUNK_H);
  const g = c.getContext('2d')!;
  g.fillStyle = '#6b4a2b';
  g.fillRect(3, 0, 6, 22);
  g.fillRect(0, 20, 12, 4);
  g.fillStyle = '#4a3020';
  g.fillRect(4, 0, 2, 22);
  g.fillStyle = '#8a6f55';
  g.fillRect(3, 20, 3, 3);
  return c;
}

function makeFlower(color: string): HTMLCanvasElement {
  const c = canvas(8, 8);
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a7a32';
  g.fillRect(3, 4, 1, 4);
  g.fillStyle = color;
  g.fillRect(2, 1, 2, 2);
  g.fillRect(4, 1, 2, 2);
  g.fillRect(3, 0, 2, 2);
  g.fillRect(3, 2, 2, 2);
  g.fillStyle = '#f0e0a0';
  g.fillRect(3, 2, 1, 1);
  return c;
}

export class Vegetation {
  private readonly trees: Tree[] = [];
  private readonly canopies: HTMLCanvasElement[] = [];
  private readonly trunks: HTMLCanvasElement[] = [];
  private readonly canopyNight: (HTMLCanvasElement | undefined)[] = [];
  private trunkNight?: HTMLCanvasElement;
  private readonly flowers: HTMLCanvasElement[] = [];
  private readonly flowersNight: HTMLCanvasElement[] = [];

  constructor(private readonly world: World) {
    const variants = 4;
    for (let v = 0; v < variants; v++) {
      this.canopies.push(makeCanopy(v));
      this.trunks.push(makeTrunk());
      this.canopyNight.push(undefined);
    }
    this.trunkNight = undefined;
    this.flowers.push(makeFlower('#f0ead8'), makeFlower('#e8c84a'), makeFlower('#e87fb0'));
    for (const f of this.flowers) this.flowersNight.push(nightCanvas(f));

    let id = 0;
    for (let ty = 0; ty < world.h; ty++) {
      for (let tx = 0; tx < world.w; tx++) {
        if (world.getDecor(tx, ty) !== T.Tree) continue;
        this.trees.push({
          id: id++,
          x: tx * TILE + TILE / 2,
          baseY: ty * TILE + TILE,
          variant: (hash2(tx * 3 + 1, ty * 5 + 2) * variants) | 0,
          phase: hash2(tx * 7 + 3, ty * 11 + 5) * Math.PI * 2,
          alpha: 1,
        });
      }
    }
    this.trees.sort((a, b) => a.baseY - b.baseY || a.x - b.x || a.id - b.id);
  }

  get treeCount(): number {
    return this.trees.length;
  }

  /** 风动花：只画视野内的少量花簇，静态花仍在 chunk 里 */
  renderFlowers(g: CanvasRenderingContext2D, camX: number, camY: number, night: boolean): void {
    const t = performance.now() / 1000;
    const tx0 = Math.max(0, Math.floor(camX / TILE) - 1);
    const ty0 = Math.max(0, Math.floor(camY / TILE) - 1);
    const tx1 = Math.min(this.world.w - 1, Math.ceil((camX + VIEW_W) / TILE) + 1);
    const ty1 = Math.min(this.world.h - 1, Math.ceil((camY + VIEW_H) / TILE) + 1);
    const sprites = night ? this.flowersNight : this.flowers;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const ground = this.world.getGround(tx, ty);
        if (ground !== T.Grass && ground !== T.GrassDark) continue;
        if (this.world.getDecor(tx, ty) === T.Tree) continue;
        if (hash2(tx * 17 + 5, ty * 19 + 9) > 0.055) continue;
        const sway = Math.round(Math.sin(t * 2 + hash2(tx, ty) * 6));
        const sprite = sprites[(hash2(tx * 31 + 1, ty * 37 + 4) * sprites.length) | 0];
        g.drawImage(sprite, tx * TILE + 12 + sway - camX, ty * TILE + 20 - camY);
      }
    }
  }

  /**
   * 树分前后两批绘制：baseY < playerBase 的在玩家前（先画），其余在玩家后（后画，树冠可淡出）
   * split='behind' 先画，split='front' 后画。
   */
  renderTrees(
    g: CanvasRenderingContext2D,
    camX: number,
    camY: number,
    player: Player,
    split: 'behind' | 'front',
    night: boolean,
  ): void {
    const t = performance.now() / 1000;
    const playerBase = player.y + player.h;
    const pcx = player.x + player.w / 2;
    const pcy = player.y + player.h / 2;
    for (const tree of this.trees) {
      if (tree.x < camX - 64 || tree.x > camX + VIEW_W + 64) continue;
      if (tree.baseY < camY - 96 || tree.baseY > camY + VIEW_H + 64) continue;
      const front = tree.baseY >= playerBase;
      if ((split === 'front') !== front) {
        if (!front) tree.alpha = 1;
        continue;
      }
      const sx = tree.x - camX;
      const sy = tree.baseY - camY;
      const sway = Math.round(Math.sin(t * 1.4 + tree.phase) * 1.5);
      const canopy = night
        ? (this.canopyNight[tree.variant] ??= nightCanvas(this.canopies[tree.variant]))
        : this.canopies[tree.variant];
      const trunk = night
        ? (this.trunkNight ?? nightCanvas(this.trunks[0]))
        : this.trunks[0];

      // 树冠是否盖住玩家：只对玩家后方的树做透明
      let target = 1;
      if (front) {
        const cx0 = tree.x - 24 + sway;
        const cy0 = tree.baseY - 60;
        if (pcx >= cx0 && pcx <= cx0 + TREE_CANOPY_W && pcy >= cy0 && pcy <= cy0 + TREE_CANOPY_H) {
          target = 0.5;
        }
      }
      tree.alpha += (target - tree.alpha) * 0.18;

      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(sx - 14, sy - 4, 28, 5);
      g.drawImage(trunk, sx - TREE_TRUNK_W / 2, sy - TREE_TRUNK_H);
      g.globalAlpha = tree.alpha;
      g.drawImage(canopy, sx - TREE_CANOPY_W / 2 + sway, sy - 60);
      g.globalAlpha = 1;
    }
  }
}
