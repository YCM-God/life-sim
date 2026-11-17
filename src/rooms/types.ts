// 房间场景数据：静态 RoomDef + 运行时 RoomState + 存档片
// 像素单位统一走 TILE/VIEW_W/VIEW_H，不在数据结构里写死分辨率

export type RoomId = string;
export type TileId = number;
export type Facing = 0 | 1 | 2 | 3;

export interface RoomEntrance {
  id: string;
  tx: number;
  ty: number;
  facing: Facing;
  prompt?: string;
}

export interface RoomExitTargetWorld {
  kind: 'overworld';
  buildingId: string;
}

export interface RoomExitTargetRoom {
  kind: 'room';
  roomId: RoomId;
  entranceId: string;
}

export interface RoomExit {
  id: string;
  tx: number;
  ty: number;
  w: number;
  h: number;
  target: RoomExitTargetWorld | RoomExitTargetRoom;
  prompt: string;
  auto?: boolean;
  locked?: boolean;
  lockTag?: string;
}

export interface FurnitureDef {
  id: string;
  kind: string;
  tx: number;
  ty: number;
  w: number;
  h: number;
  solid: boolean;
  z?: number;
  state?: Record<string, unknown>;
}

export interface RoomDef {
  id: RoomId;
  name: string;
  width: number;
  height: number;
  background: string;
  tiles?: Uint16Array;
  collision: Uint8Array;
  furniture: FurnitureDef[];
  entrances: Record<string, RoomEntrance>;
  exits: RoomExit[];
  cache: 'persistent' | 'lru' | 'transient';
  buildingId?: string;
  version: number;
}

export interface RoomState {
  roomId: RoomId;
  visited: boolean;
  furniture: Record<string, { tx: number; ty: number; state?: Record<string, unknown> }>;
  npcs: Record<string, { tx: number; ty: number; facing: Facing; outside?: boolean }>;
  pickedItems: string[];
  flags: Record<string, boolean>;
  lastUsed: number;
}

export interface RoomEnterParams {
  entranceId?: string;
  restore?: { tx: number; ty: number; facing: Facing };
  returnTo?: { buildingId: string; doorTx: number; doorTy: number; face: 'N' | 'S' };
}

export interface SaveDataRoomSlice {
  roomId: RoomId;
  state: RoomState;
}
