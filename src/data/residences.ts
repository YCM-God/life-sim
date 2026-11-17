// 居民住宅归属与入口规则
import type { RoomId } from '../rooms/types';

export type ResidenceType =
  | '老平房'
  | '单位宿舍'
  | '公寓'
  | '自建房'
  | '出租屋';

export interface ResidenceDef {
  id: RoomId;
  name: string;
  buildingId: string;
  unit?: string;
  type: ResidenceType;
  layout: string;
  area: string;
  occupants: string[];
  minAffinity: number;
  locked?: boolean;
  lockReason?: string;
  signature: string[];
  palette: string;
}

export const PLAYER_HOME_ID = 'player-home';

export const RESIDENCES: ResidenceDef[] = [
  {
    id: PLAYER_HOME_ID,
    name: '玩家家',
    buildingId: 'home',
    type: '单位宿舍',
    layout: 'twoBed',
    area: '40×22',
    occupants: [],
    minAffinity: 0,
    signature: ['身高刻痕', '墙上的奖状', '旧玩具车'],
    palette: '暖黄木色',
  },
  {
    id: 'h1',
    name: '林家老院',
    buildingId: 'h1',
    type: '老平房',
    layout: 'oldHouse',
    area: '40×18',
    occupants: ['lsy', 'wjg', 'ztz'],
    minAffinity: 2,
    signature: ['未拆的信', '脉枕', '穴位图'],
    palette: '旧木米白',
  },
  {
    id: 'h2',
    name: '苏家',
    buildingId: 'h2',
    type: '自建房',
    layout: 'twoBed',
    area: '40×22',
    occupants: ['lxl', 'hmm', 'zxm', 'txt'],
    minAffinity: 2,
    signature: ['536 块存钱罐', '班级日志', '麻将桌布'],
    palette: '暖黄木色',
  },
  {
    id: 'h3',
    name: '陈家分租院',
    buildingId: 'h3',
    type: '自建房',
    layout: 'boarding',
    area: '40×22',
    occupants: ['cdw', 'cds', 'ljj', 'fj', 'jym'],
    minAffinity: 2,
    signature: ['快递扫码枪', '瓶子阵列', '机场发票'],
    palette: '水泥灰蓝',
  },
  {
    id: 'h4-201',
    name: '河景公寓 201',
    buildingId: 'h4',
    unit: '201',
    type: '公寓',
    layout: 'apartment',
    area: '32×18',
    occupants: ['lxy', 'hyt'],
    minAffinity: 2,
    signature: ['学生照片墙', '吉他', '琴包里的药'],
    palette: '白浅木薄荷',
  },
  {
    id: 'h4-202',
    name: '河景公寓 202',
    buildingId: 'h4',
    unit: '202',
    type: '公寓',
    layout: 'apartment',
    area: '32×18',
    occupants: ['zwb', 'sqx'],
    minAffinity: 2,
    signature: ['馒头袋', '理财表', '欠条'],
    palette: '白浅木薄荷',
  },
  {
    id: 'h4-301',
    name: '河景公寓 301',
    buildingId: 'h4',
    unit: '301',
    type: '公寓',
    layout: 'oneBed',
    area: '40×22',
    occupants: ['wgf'],
    minAffinity: 4,
    signature: ['猫碗“守义”', '未拆的信', '窗台旧照片'],
    palette: '旧木米白',
  },
  {
    id: 'h4-302',
    name: '河景公寓 302',
    buildingId: 'h4',
    unit: '302',
    type: '公寓',
    layout: 'twoBed',
    area: '40×22',
    occupants: ['zh', 'xwt', 'gll'],
    minAffinity: 2,
    signature: ['名片盒', '窗台一排花', '补光灯'],
    palette: '墨绿深木酒红',
  },
  {
    id: 'h4-303',
    name: '河景公寓 303',
    buildingId: 'h4',
    unit: '303',
    type: '出租屋',
    layout: 'singleRoom',
    area: '24×14',
    occupants: [],
    minAffinity: 99,
    locked: true,
    lockReason: '门上贴着封条。',
    signature: ['门上封条', '空衣架', '旧日历'],
    palette: '旧木米白',
  },
];

export function residencesForBuilding(buildingId: string): ResidenceDef[] {
  return RESIDENCES.filter((r) => r.buildingId === buildingId);
}

export function residenceById(id: string): ResidenceDef | undefined {
  return RESIDENCES.find((r) => r.id === id);
}
