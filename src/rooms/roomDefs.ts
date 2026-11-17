// 从现有 IndoorLayout / Building 生成 RoomDef 与 RoomState
import { NONE, isSolidTileId, T } from '../map/tiles';
import type { Building } from '../map/world';
import type { IndoorLayout } from '../data/indoors';
import type { FurnitureDef, RoomDef, RoomState } from './types';

export function createRoomDef(building: Building, layout: IndoorLayout, opts?: { id?: string; name?: string }): RoomDef {
  const collision = new Uint8Array(layout.w * layout.h);
  for (let y = 0; y < layout.h; y++) {
    for (let x = 0; x < layout.w; x++) {
      const i = y * layout.w + x;
      const d = layout.decor[i];
      const solid = (d !== NONE && isSolidTileId(d)) || isSolidTileId(layout.ground[i]);
      collision[i] = solid ? 1 : 0;
    }
  }

  const furniture: FurnitureDef[] = [];
  for (let y = 0; y < layout.h; y++) {
    for (let x = 0; x < layout.w; x++) {
      if (layout.ground[y * layout.w + x] !== T.Table) continue;
      furniture.push({
        id: `${building.id}-table-${x}-${y}`,
        kind: 'table',
        tx: x,
        ty: y,
        w: 1,
        h: 1,
        solid: true,
        z: 1,
      });
    }
  }

  const persistent = building.id === 'home' || building.id === 'school' || building.id === 'hospital';

  return {
    id: opts?.id ?? building.id,
    name: opts?.name ?? building.name,
    width: layout.w,
    height: layout.h,
    background: building.indoor,
    tiles: layout.ground,
    collision,
    furniture,
    entrances: {
      main: { id: 'main', tx: layout.spawnTx, ty: layout.spawnTy, facing: 1 },
    },
    exits: [
      {
        id: 'main',
        tx: layout.doorTx,
        ty: layout.doorTy,
        w: 1,
        h: 1,
        target: { kind: 'overworld', buildingId: building.id },
        prompt: 'E 离开',
        auto: false,
      },
    ],
    cache: persistent ? 'persistent' : 'lru',
    buildingId: building.id,
    version: 1,
  };
}

export function createRoomState(roomId: string): RoomState {
  return {
    roomId,
    visited: false,
    furniture: {},
    npcs: {},
    pickedItems: [],
    flags: {},
    lastUsed: 0,
  };
}
