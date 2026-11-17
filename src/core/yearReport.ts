// 年度结算报表生成器：「跳过今年」时汇总这一年发生了什么
// 数据来源：玩家六属性/金钱（应用新年漂移后返回前后值）、20 位居民好感账本
// 事件池保底：即使玩家什么都不做，也必产出零花/学识等系统事件——最差的一年也有判词
import { skipGameDays } from './daynight';
import { ATTRS } from '../ui/attrPanel';
import type { Player } from '../entities/player';
import { AGING_DAYS } from '../entities/player';
import type { Resident } from '../entities/resident';

export interface YearEvent {
  text: string;
  valence: -1 | 0 | 1;
  importance: 1 | 2 | 3; // 高 3 / 中 2 / 低 1
}

export interface RelationDelta {
  name: string;
  from: number; // 年初好感档（0-5）
  to: number;
}

export type ToneTier = 'good' | 'bad' | 'flat';

export interface YearReport {
  year: number; // 第几年（6 岁 = 第 1 年）
  ageFrom: number;
  ageTo: number;
  attrNames: string[];
  attrFrom: number[]; // 六属性显示值 0-100（旧）
  attrTo: number[]; // 六属性显示值 0-100（新）
  moneyFrom: number;
  moneyTo: number;
  events: YearEvent[]; // 按重要度降序（同档负向在前）
  relations: RelationDelta[]; // 好感有变化的居民，按 |delta| 降序
  memoryLines: string[]; // 详情页「这一年谁记得你」
  tone: number;
  toneTier: ToneTier;
  comment: string; // 年度评语
}

// 好感基准账：首次跳年时建立，之后每年对比（内存态，与好感/记忆一致）
let favorBaseline: Map<string, number> | null = null;

// 随机年度事件池（童年，具体不空谈；valence/importance 标注）
const LIFE_POOL: { text: string; valence: -1 | 0 | 1; importance: 1 | 2 | 3 }[] = [
  { text: '你收养了一只流浪猫，取名「团团」。', valence: 1, importance: 2 },
  { text: '你的好朋友转学了，走之前送了你半块橡皮。', valence: -1, importance: 2 },
  { text: '全家去了趟海边，你晒脱了一层皮。', valence: 1, importance: 2 },
  { text: '你在运动会上摔了一跤，全班都看见了。', valence: -1, importance: 1 },
  { text: '你迷上了集卡片，攒了整整一鞋盒。', valence: 0, importance: 1 },
  { text: '你和同桌吵架，三天没说话。', valence: -1, importance: 1 },
  { text: '你学会了骑自行车，摔掉了两颗门牙。', valence: 1, importance: 1 },
  { text: '家里来了新邻居，搬来一只大沙发。', valence: 0, importance: 1 },
  { text: '你丢了最心爱的玩具车，找了整整一个星期。', valence: -1, importance: 1 },
  { text: '你在课堂上举手答对了最难的题。', valence: 1, importance: 2 },
  { text: '你得了张奖状，被贴在了客厅墙上。', valence: 1, importance: 2 },
  { text: '你熬夜看漫画，第二天上课睡着了。', valence: -1, importance: 1 },
];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function buildYearReport(player: Player, residents: Resident[], healthEvents: YearEvent[] = []): YearReport {
  const ageFrom = player.age;
  const stats = player.stats!;
  const events: YearEvent[] = [];
  const relations: RelationDelta[] = [];
  const memoryLines: string[] = [];

  // ---- 年初快照（显示值 0-100）----
  const attrFrom = ATTRS.map((d) => Math.floor(d.v(player)));
  const moneyFrom = player.money;

  // ---- 推进时间：一整个"年"（AGING_DAYS 个游戏日），时刻不变 ----
  skipGameDays(AGING_DAYS);
  const ageTo = player.age;

  // ---- 属性年度漂移 ----
  // 体力：过年休息，回满
  player.stamina = 100;
  // 学识：全年在校，+48（封顶 100）
  const knowBefore = player.knowledge;
  player.knowledge = Math.min(100, player.knowledge + 48);
  if (player.knowledge > knowBefore) {
    events.push({ text: '课本厚了一册，学识见长。', valence: 0, importance: 1 });
  }
  // 金钱：全年零花（tick 按日也会补，这里一次性结算并记录）
  const allowance = stats.family * 5 * AGING_DAYS;
  if (allowance > 0) {
    player.money += allowance;
    events.push({ text: `零花攒下了 +${allowance}。`, valence: 0, importance: 1 });
  }
  // 健康：疾病系统的真实事件优先；无事发生才走年度体质漂移
  if (healthEvents.length > 0) {
    events.push(...healthEvents);
  } else {
    const healthRoll = Math.random();
    if (healthRoll < 0.2 && stats.health > 0) {
      stats.health -= 1;
      events.push({ text: '你大病了一场，请了三天假。', valence: -1, importance: 2 });
    } else if (healthRoll > 0.85 && stats.health < 10) {
      stats.health += 1;
      events.push({ text: '你坚持晨跑，整个冬天没感冒。', valence: 1, importance: 1 });
    }
  }
  // 智力 / 魅力：少量开窍
  if (Math.random() < 0.12 && stats.int < 10) {
    stats.int += 1;
    events.push({ text: '你突然开了窍，老师讲一遍你就懂。', valence: 1, importance: 2 });
  }
  if (Math.random() < 0.1 && stats.look < 10) {
    stats.look += 1;
    events.push({ text: '你长开了些，隔壁班有人打听你。', valence: 1, importance: 1 });
  }
  // 心情：由社交账本决定（在居民漂移后结算）
  // 生活事件：随机取 2 条
  const pool = [...LIFE_POOL].sort(() => Math.random() - 0.5).slice(0, 2);
  events.push(...pool);

  // ---- 居民好感年度漂移 ----
  if (!favorBaseline) {
    favorBaseline = new Map(residents.map((r) => [r.def.name, r.affinity]));
  }
  let bestUp: { name: string; delta: number } | null = null;
  let worstDown: { name: string; delta: number } | null = null;
  for (const r of residents) {
    const before = favorBaseline.get(r.def.name) ?? r.affinity;
    let d = 0;
    if (r.streak >= 5) d += 1; // 全年常来往
    else if (r.affinity > 0 && r.streak === 0 && Math.random() < 0.35) d -= 1; // 一年没理（0 档无可跌）
    if (r.isCold() && r.affinity > 0 && Math.random() < 0.5) d -= 1; // 还在生气
    const to = clamp(r.affinity + d, 0, 5);
    r.affinity = to;
    r.streak = 0; // 新一年，到访账清零
    favorBaseline.set(r.def.name, to);
    const delta = to - before;
    if (delta !== 0) relations.push({ name: r.def.name, from: before, to });
    if (delta > 0 && (!bestUp || delta > bestUp.delta)) bestUp = { name: r.def.name, delta };
    if (delta < 0 && (!worstDown || delta < worstDown.delta)) worstDown = { name: r.def.name, delta };
    // 阈值跨越事件
    if (before < 3 && to >= 3) {
      events.push({ text: `你和${r.def.name}成了朋友。`, valence: 1, importance: 2 });
    }
    if (before >= 2 && to === 0) {
      events.push({ text: `${r.def.name}不再等你来了。`, valence: -1, importance: 2 });
    }
  }
  relations.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));

  // 心情年度结算
  if (bestUp && bestUp.delta >= 2) {
    if (stats.mind < 10) stats.mind += 1;
    events.push({ text: '你和街坊混得熟，心里踏实。', valence: 1, importance: 1 });
  } else if (worstDown && worstDown.delta <= -2) {
    if (stats.mind > 0) stats.mind -= 1;
    events.push({ text: '有些话没人说，你闷了很久。', valence: -1, importance: 2 });
  } else if (Math.random() < 0.15 && stats.mind > 0) {
    stats.mind -= 1;
    events.push({ text: '期末考试砸了，你不敢把卷子拿出来签字。', valence: -1, importance: 2 });
  }

  // ---- 详情页「谁记得你」----
  const warm = residents.filter((r) => r.affinity >= 3);
  for (const r of warm.slice(0, 2)) {
    memoryLines.push(`${r.def.name}记得你常去看他。`);
  }
  const cold = residents.filter((r) => r.isCold());
  for (const r of cold.slice(0, 1)) {
    memoryLines.push(`${r.def.name}还在生你的气。`);
  }
  const secrets = residents.filter((r) => r.secretRevealed);
  for (const r of secrets.slice(0, 1)) {
    memoryLines.push(`你发现了${r.def.name}的秘密。`);
  }
  if (memoryLines.length === 0) memoryLines.push('这一年，没人特别记得你。');

  // ---- 年末值 ----
  const attrTo = ATTRS.map((d) => Math.floor(d.v(player)));
  const moneyTo = player.money;

  // ---- 事件排序：重要度降序，同档负向在前 ----
  events.sort((a, b) => b.importance - a.importance || a.valence - b.valence);

  // ---- 评价分 T 与色调档位 ----
  let tone = 0;
  ATTRS.forEach((d, i) => {
    const w = d.name === '体力' || d.name === '健康' ? 1.5 : 1;
    tone += (attrTo[i] - attrFrom[i]) * w;
  });
  for (const e of events) tone += e.valence * e.importance;
  for (const r of relations) tone += (r.to - r.from) * 10;
  const toneTier: ToneTier = tone >= 30 ? 'good' : tone <= -30 ? 'bad' : 'flat';

  // ---- 年度评语（按优先级命中；必有，且点名具体的人/属性/事）----
  let comment: string;
  const drops = ATTRS.map((d, i) => ({ name: d.name, delta: attrTo[i] - attrFrom[i] })).sort((a, b) => a.delta - b.delta);
  const maxDrop = drops[0];
  const negHigh = events.find((e) => e.valence < 0 && e.importance >= 3);
  const posCount = events.filter((e) => e.valence > 0).length;
  const topPos = events.find((e) => e.valence > 0);
  if (maxDrop.delta <= -20) {
    comment = `这一年，你的${maxDrop.name}垮了。`;
  } else if (worstDown && worstDown.delta <= -2) {
    comment = `你和${worstDown.name}之间，有什么东西断了。`;
  } else if (negHigh) {
    comment = negHigh.text;
  } else if (posCount === 0 && events.length <= 2) {
    comment = '这一年如一杯白水。';
  } else if (events.length === 0) {
    comment = '这一年你几乎什么都没做。时间不会等你。';
  } else if (topPos) {
    comment = topPos.text;
  } else {
    comment = '平平淡淡，也算一年。';
  }

  return {
    year: ageTo - 5,
    ageFrom,
    ageTo,
    attrNames: ATTRS.map((d) => d.name),
    attrFrom,
    attrTo,
    moneyFrom,
    moneyTo,
    events,
    relations,
    memoryLines,
    tone,
    toneTier,
    comment,
  };
}
