// 住宅入口规则：主人是否在家、好感是否足够、是否封条
import type { GameContext } from '../context';
import type { Building } from '../map/world';
import { TILE } from '../config';
import { RESIDENCES, residencesForBuilding } from '../data/residences';
import type { ResidenceDef } from '../data/residences';

export interface ResidenceEntryCheck {
  ok: boolean;
  text: string;
  affinity: number;
}

function buildingOf(ctx: GameContext, res: ResidenceDef): Building | undefined {
  return ctx.world.buildings.find((b) => b.id === res.buildingId);
}

function ownerHome(ctx: GameContext, res: ResidenceDef, building: Building | undefined): boolean {
  if (!building) return false;
  const doorX = building.doorTx;
  const doorY = building.doorTy;
  for (const id of res.occupants) {
    const r = ctx.overworld.residents.list.find((x) => x.def.id === id);
    if (!r) continue;
    const tx = (r.x + 12) / TILE;
    const ty = (r.y + 14) / TILE;
    if (Math.hypot(tx - doorX, ty - doorY) <= 6) return true;
  }
  return false;
}

export function checkResidenceEntry(ctx: GameContext, res: ResidenceDef): ResidenceEntryCheck {
  if (res.id === 'player-home') return { ok: true, text: '回家。', affinity: 0 };
  if (res.locked) return { ok: false, text: res.lockReason ?? '门锁着。', affinity: 0 };
  if (res.occupants.length === 0) return { ok: false, text: '这里没人住。', affinity: 0 };

  const occupants = res.occupants
    .map((id) => ctx.overworld.residents.list.find((x) => x.def.id === id))
    .filter((x): x is NonNullable<typeof x> => !!x);
  const affinity = occupants.reduce((m, r) => Math.max(m, r.affinity), 0);
  const building = buildingOf(ctx, res);
  if (!ownerHome(ctx, res, building)) {
    return { ok: false, text: '家里没人，改天再来。', affinity };
  }
  if (affinity < res.minAffinity) {
    return { ok: false, text: '还没熟到能进门的程度。', affinity };
  }
  return { ok: true, text: `敲门后，${occupants[0]?.def.name ?? '主人'}来开门。`, affinity };
}

export function residenceOptionsForBuilding(ctx: GameContext, buildingId: string): { res: ResidenceDef; check: ResidenceEntryCheck }[] {
  return residencesForBuilding(buildingId).map((res) => ({ res, check: checkResidenceEntry(ctx, res) }));
}

export function residenceByRoomId(roomId: string): ResidenceDef | undefined {
  return RESIDENCES.find((r) => r.id === roomId);
}
