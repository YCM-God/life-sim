import type { World } from './world';

// 区域分组信息：大小地图共用（区域名 → 质心 / 到访频率 / 区内建筑）
export interface RegionGroup {
  name: string;
  freq: string;
  tx: number; // 质心（Tile）
  ty: number;
  buildings: string[];
}

const FREQ: Record<string, string> = {
  forest: '剧情才去',
  school: '每天去 · 学龄期',
  town: '每天去',
  cbd: '每天去 · 工作期',
  oldtown: '剧情才去',
  park: '每周去',
  'mall-n': '每天去',
  mall: '每天去',
  'mall-s': '每天去',
  'river-w': '每周去',
  river: '每周去',
  'river-e': '每周去',
  south: '每天去',
};

let cached: { world: World; groups: RegionGroup[] } | null = null;

export function getRegionGroups(world: World): RegionGroup[] {
  if (cached && cached.world === world) return cached.groups;

  const map = new Map<string, { area: number; sx: number; sy: number; freq: string }>();
  for (const r of world.regions) {
    const a = r.w * r.h;
    const hit = map.get(r.name) ?? { area: 0, sx: 0, sy: 0, freq: FREQ[r.id] ?? '每周去' };
    hit.area += a;
    hit.sx += (r.x + r.w / 2) * a;
    hit.sy += (r.y + r.h / 2) * a;
    map.set(r.name, hit);
  }

  const groups: RegionGroup[] = [];
  for (const [name, m] of map) {
    groups.push({ name, freq: m.freq, tx: m.sx / m.area, ty: m.sy / m.area, buildings: [] });
  }
  // 建筑按 footprint 中心落入的区域归组
  for (const b of world.buildings) {
    const r = world.regionAt(b.x + (b.w >> 1), b.y + (b.h >> 1));
    if (!r) continue;
    const g = groups.find((x) => x.name === r.name);
    if (g) g.buildings.push(b.name);
  }
  cached = { world, groups };
  return groups;
}
