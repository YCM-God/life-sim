// 角色数据与天赋抽取规则
// 健康值、心理状况：开局固定 4（上限 10）
// 智力 / 颜值 / 家境：随机抽取（天赋）
//   7~10：P(10)=1%，每降 1 点概率 +1%（即 4%/3%/2%/1%，小计 10%）
//   3~6：各 20%（小计 80%）
//   0~2：合计 10%，三等分（各约 3.33%，分布未指定时的默认假设）

export type Gender = 'male' | 'female';

export interface Stats {
  int: number;    // 智力
  health: number; // 健康值
  look: number;   // 颜值
  mind: number;   // 心理状况
  family: number; // 家境
}

export interface Talents {
  int: number;
  look: number;
  family: number;
}

export const BASE_HEALTH = 4;
export const BASE_MIND = 4;

export function rollTalent(): number {
  const r = Math.random() * 100;
  if (r < 10) {
    // 高档 7~10：权重 4/3/2/1（合计 10%，条件概率归一）
    const w = [4, 3, 2, 1];
    let x = Math.random() * 10;
    for (let i = 0; i < w.length; i++) {
      x -= w[i];
      if (x < 0) return 7 + i;
    }
    return 10;
  }
  if (r < 90) {
    // 中档 3~6：均匀，各 20%
    return 3 + Math.floor(Math.random() * 4);
  }
  // 低档 0~2：合计 10%，三等分
  return Math.floor(Math.random() * 3);
}

export function rollTalents(): Talents {
  return { int: rollTalent(), look: rollTalent(), family: rollTalent() };
}

// 天赋分档描述，用于创建界面提示
export function talentTier(v: number): string {
  if (v >= 9) return '天赋异禀';
  if (v >= 7) return '出类拔萃';
  if (v >= 4) return '平平无奇';
  if (v >= 1) return '略有不足';
  return '命运多舛';
}
