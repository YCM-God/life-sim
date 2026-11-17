// 班级名册：30 座 = 玩家 1 + 8 名有名 NPC + 21 名背景同学
import type { Appearance } from '../entities/player';

export type SeatRow = 0 | 1 | 2 | 3 | 4;
export type SeatCol = 0 | 1 | 2 | 3 | 4 | 5;
export type StudentState = 'listen' | 'daydream' | 'sleep' | 'talk' | 'hand';

export interface ClassmateDef {
  id: string;
  name: string;
  row: SeatRow;
  col: SeatCol;
  personality: string;
  look: Appearance;
  state?: StudentState;
}

export const SEAT_COLS = [3, 7, 13, 17, 23, 27];
export const SEAT_ROWS = [5, 8, 11, 14, 17];

export const NAMED_CLASSMATES: ClassmateDef[] = [
  {
    id: 'txt', name: '唐晓棠', row: 0, col: 0, personality: '班长/好学生',
    look: { shirt: '#e8b83a', skirt: '#a8743a', pants: '#e8b88a', hair: '#2a1a1c', longHair: true },
    state: 'listen',
  },
  {
    id: 'lin-xiaoman', name: '林小满', row: 0, col: 1, personality: '学霸/好胜',
    look: { shirt: '#7a9a5a', pants: '#3a4a4a', hair: '#2a1a1c', longHair: false },
    state: 'listen',
  },
  {
    id: 'zxm', name: '张小米', row: 2, col: 2, personality: '爱玩/走神',
    look: { shirt: '#e8c84a', pants: '#4a6a9a', hair: '#1a1814', longHair: false },
    state: 'daydream',
  },
  {
    id: 'chen-yinuo', name: '陈一诺', row: 2, col: 4, personality: '话多/捣蛋',
    look: { shirt: '#d07a4a', pants: '#3a4a4a', hair: '#2a2018', longHair: false },
    state: 'talk',
  },
  {
    id: 'su-he', name: '苏禾', row: 2, col: 5, personality: '安静/画画',
    look: { shirt: '#8a9ab0', skirt: '#5a6a7a', pants: '#e8b88a', hair: '#3a2a1c', longHair: true },
    state: 'daydream',
  },
  {
    id: 'zhao-xiaobei', name: '赵小北', row: 4, col: 0, personality: '转学生/边缘',
    look: { shirt: '#6a7a8a', pants: '#2e3a44', hair: '#1a1814', longHair: false },
    state: 'listen',
  },
  {
    id: 'zhou-yu', name: '周雨', row: 4, col: 4, personality: '体育生/疲劳',
    look: { shirt: '#4a7a9a', pants: '#2b3a4a', hair: '#1a1814', longHair: false },
    state: 'sleep',
  },
  {
    id: 'jym', name: '蒋一鸣', row: 4, col: 5, personality: '睡觉/游戏',
    look: { shirt: '#5a6a7a', pants: '#3a3f4a', hair: '#2a1a1c', longHair: false },
    state: 'sleep',
  },
];

export const PLAYER_SEAT = { row: 2 as SeatRow, col: 3 as SeatCol };

export function seatPosition(row: SeatRow, col: SeatCol): { tx: number; ty: number } {
  return { tx: SEAT_COLS[col], ty: SEAT_ROWS[row] };
}

export function namedAt(row: SeatRow, col: SeatCol): ClassmateDef | undefined {
  return NAMED_CLASSMATES.find((c) => c.row === row && c.col === col);
}
