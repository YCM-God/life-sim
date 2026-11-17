// 玫瑰存档：IndexedDB 本地数据库，固定 10 个槽位（上限即 10 份存档）
// 与 localStorage 自动存档（继续上次的人生）互不影响：
//   · localStorage = 自动续档，每 5 秒覆盖写一份
//   · IndexedDB    = 手动存档槽，玩家主动保存/读取/删除，每份记录游玩时长
import type { GameContext } from '../context';
import { captureSave, type SaveData } from './save';

export const MAX_SLOTS = 10;
const DB_NAME = 'life-sim-saves';
const DB_VERSION = 1;
const STORE = 'slots';

export interface SaveSlotMeta {
  slot: number;    // 1..10
  name: string;    // 角色名
  age: number;     // 年龄
  money: number;
  playMs: number;  // 本局累计游玩时长
  savedAt: number; // 保存时刻（Date.now()）
}

export interface SaveSlot extends SaveSlotMeta {
  data: SaveData; // 完整存档，读取时直接喂给 restorePlayer/restoreQuests
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('此浏览器不支持 IndexedDB'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'slot' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('打开数据库失败'));
      req.onblocked = () => reject(new Error('数据库被其他页签占用'));
    });
  }
  return dbPromise;
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('数据库读写失败'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB();
  const tx = db.transaction(STORE, mode);
  return reqAsPromise(run(tx.objectStore(STORE)));
}

/** 读单个槽位；空槽返回 null */
export async function readSlot(slot: number): Promise<SaveSlot | null> {
  if (slot < 1 || slot > MAX_SLOTS) return null;
  const rec = await withStore<SaveSlot | undefined>('readonly', (s) => s.get(slot));
  return rec ?? null;
}

/** 全部 10 个槽位，按槽位号排列；空槽为 null */
export async function listSlots(): Promise<Array<SaveSlot | null>> {
  const db = await openDB();
  const all = await new Promise<SaveSlot[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as SaveSlot[]);
    req.onerror = () => reject(req.error ?? new Error('数据库读取失败'));
  });
  const out: Array<SaveSlot | null> = new Array(MAX_SLOTS).fill(null);
  for (const r of all) if (r.slot >= 1 && r.slot <= MAX_SLOTS) out[r.slot - 1] = r;
  return out;
}

/** 把当前一局写进指定槽位（覆盖该槽旧档）；尚未开始游戏（没选角色）时抛错 */
export async function writeSlot(slot: number, ctx: GameContext): Promise<SaveSlot> {
  const data = captureSave(ctx);
  if (!data) throw new Error('还没有开始人生，无法存档');
  const rec: SaveSlot = {
    slot,
    name: ctx.player.name,
    age: ctx.player.age,
    money: ctx.player.money,
    playMs: data.playMs ?? 0,
    savedAt: data.savedAt,
    data,
  };
  await withStore('readwrite', (s) => s.put(rec));
  return rec;
}

export async function deleteSlot(slot: number): Promise<void> {
  await withStore('readwrite', (s) => s.delete(slot));
}
