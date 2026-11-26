// 疾病与就医系统核心（见《疾病与就医系统设计》v1.0 的落地实现）
// 数值按游戏内尺度换算：健康 0-10、金钱以现有经济为准、1 游戏日 = 一个昼夜循环
// 每日 24:00（跨天检测）统一结算：新病判定 / 病程推进 / 恶化链 / 痊愈
// 恶化链：感冒 → 支气管炎 → 肺炎；肠胃炎 → 胃炎 →（慢性胃炎）
//         扭伤 →（习惯性扭伤）；骨折不处理 → 畸形愈合
import { gameDayIndex, CYCLE_MS } from './daynight';
import type { Player } from '../entities/player';
import type { YearEvent } from './yearReport';

export type DiseaseId =
  | 'cold'          // 感冒（轻）
  | 'bronchitis'    // 支气管炎（轻→中过渡）
  | 'gastro'        // 急性肠胃炎（轻）
  | 'gastritis'     // 急性胃炎（中）
  | 'sprain'        // 扭伤（中）
  | 'pneumonia'     // 肺炎（重）
  | 'fracture'      // 骨折（重）
  | 'chronicGastritis'; // 慢性胃炎（中，永久）

export type Tier = 'T1' | 'T2' | 'T3';

export interface DiseaseDef {
  id: DiseaseId;
  name: string;
  tier: Tier;
  desc: string;        // 症状描述
  trigger: string;     // 诱因描述
  staminaMul: number;  // 体力上限乘数（未治疗）
  staminaMulTreated: number; // 服药后症状减半
  speedMul: number;    // 移速乘数
  mindHit: number;     // 发病时心情扣减
  incubation: number;  // 潜伏期（天）
  selfHealDays: number; // 0 = 不可自愈；轻症按年龄微调
  selfHealSpread: number; // 自愈天数随机 ±
  treatDays: number;   // 服药痊愈天数（诊所 +1）
  recoverDays: number; // 痊愈后虚弱期（体力上限 ×0.7）
  clinicExtraDay: boolean; // 社区诊所药效弱：痊愈 +1 天
  // 恶化
  worsenTo?: DiseaseId;   // 恶化目标
  worsenChance: number;   // 每日恶化概率（基础，未休息 ×1；休息 ×0.15）
  worsenAgeBoost?: { child: number; elder: number }; // 儿童/老人替换概率
  worsenMinDay: number;   // 第几天起才判定恶化
  untreatedDamage: number; // 不可自愈病每日健康扣减（重症）
  untreatedDamageElder?: number;
  untreatedDamageChild?: number;
  chronicAtDay?: number;  // 硬扛到第 N 天转慢性/后遗症
  permanentNote?: string; // 后遗症描述
  // 费用（对照设计文档，游戏内经济等比）
  registerCost: number;   // 挂号费
  treatCost: number;      // 诊金+药费（门诊一次付清）
  hospitalDays?: number;  // 住院天数（重症）
  hospitalCostPerDay?: number;
}

export const DISEASES: Record<DiseaseId, DiseaseDef> = {
  cold: {
    id: 'cold', name: '感冒', tier: 'T1',
    desc: '打喷嚏、鼻塞、头昏昏沉沉', trigger: '淋雨着凉、换季、被传染',
    staminaMul: 0.7, staminaMulTreated: 0.85, speedMul: 1, mindHit: 1,
    incubation: 1, selfHealDays: 4, selfHealSpread: 1, treatDays: 2, recoverDays: 0,
    clinicExtraDay: true,
    worsenTo: 'bronchitis', worsenChance: 0.02, worsenAgeBoost: { child: 0.04, elder: 0.1 }, worsenMinDay: 2,
    untreatedDamage: 0, registerCost: 10, treatCost: 30,
  },
  bronchitis: {
    id: 'bronchitis', name: '支气管炎', tier: 'T2',
    desc: '咳嗽止不住，夜里咳得睡不着', trigger: '感冒硬扛、继续劳累',
    staminaMul: 0.6, staminaMulTreated: 0.75, speedMul: 0.9, mindHit: 1,
    incubation: 0, selfHealDays: 0, selfHealSpread: 0, treatDays: 4, recoverDays: 0,
    clinicExtraDay: false,
    worsenTo: 'pneumonia', worsenChance: 0.3, worsenMinDay: 3,
    untreatedDamage: 0.2, registerCost: 10, treatCost: 60,
  },
  gastro: {
    id: 'gastro', name: '急性肠胃炎', tier: 'T1',
    desc: '上吐下泻，肚子一阵一阵绞痛', trigger: '吃了不干净的东西',
    staminaMul: 0.6, staminaMulTreated: 0.8, speedMul: 0.9, mindHit: 1,
    incubation: 0, selfHealDays: 3, selfHealSpread: 0, treatDays: 1, recoverDays: 0,
    clinicExtraDay: true,
    worsenTo: 'gastritis', worsenChance: 0.1, worsenMinDay: 2,
    untreatedDamage: 0, registerCost: 10, treatCost: 40,
  },
  gastritis: {
    id: 'gastritis', name: '急性胃炎', tier: 'T2',
    desc: '一到饭点就胃疼，吃不下东西', trigger: '肠胃炎硬扛、长期饮食不规律',
    staminaMul: 0.7, staminaMulTreated: 0.85, speedMul: 1, mindHit: 1,
    incubation: 0, selfHealDays: 0, selfHealSpread: 0, treatDays: 5, recoverDays: 0,
    clinicExtraDay: false,
    worsenChance: 0, worsenMinDay: 99,
    untreatedDamage: 0.2, chronicAtDay: 7, permanentNote: '拖成了慢性胃炎，往后每个月都要犯几次胃疼',
    registerCost: 10, treatCost: 100,
  },
  sprain: {
    id: 'sprain', name: '扭伤', tier: 'T2',
    desc: '脚踝肿得老高，一着地就疼', trigger: '运动、搬重物、不小心摔倒',
    staminaMul: 0.9, staminaMulTreated: 0.95, speedMul: 0.55, mindHit: 1,
    incubation: 0, selfHealDays: 21, selfHealSpread: 0, treatDays: 14, recoverDays: 0,
    clinicExtraDay: false,
    worsenChance: 0.3, worsenMinDay: 5,
    untreatedDamage: 0, registerCost: 10, treatCost: 80,
  },
  pneumonia: {
    id: 'pneumonia', name: '肺炎', tier: 'T3',
    desc: '高烧不退，胸口闷得喘不上气', trigger: '感冒/支气管炎一路拖下来',
    staminaMul: 0.3, staminaMulTreated: 0.5, speedMul: 0.6, mindHit: 2,
    incubation: 0, selfHealDays: 0, selfHealSpread: 0, treatDays: 0, recoverDays: 5,
    clinicExtraDay: false,
    worsenChance: 0, worsenMinDay: 99,
    untreatedDamage: 0.8, untreatedDamageChild: 0.6, untreatedDamageElder: 1.2,
    registerCost: 10, treatCost: 0, hospitalDays: 5, hospitalCostPerDay: 80,
  },
  fracture: {
    id: 'fracture', name: '骨折', tier: 'T3',
    desc: '疼得动不了，整条腿使不上劲', trigger: '摔倒、意外',
    staminaMul: 0.9, staminaMulTreated: 0.95, speedMul: 0.3, mindHit: 2,
    incubation: 0, selfHealDays: 0, selfHealSpread: 0, treatDays: 12, recoverDays: 5,
    clinicExtraDay: false,
    worsenChance: 0, worsenMinDay: 99,
    untreatedDamage: 0.1, chronicAtDay: 12, permanentNote: '骨头长歪了，走起路来一瘸一拐',
    registerCost: 10, treatCost: 220,
  },
  chronicGastritis: {
    id: 'chronicGastritis', name: '慢性胃炎', tier: 'T2',
    desc: '老毛病了，一饿就胃疼', trigger: '急性胃炎硬扛拖成慢性',
    staminaMul: 0.9, staminaMulTreated: 0.9, speedMul: 1, mindHit: 0,
    incubation: 0, selfHealDays: 0, selfHealSpread: 0, treatDays: 0, recoverDays: 0,
    clinicExtraDay: false,
    worsenChance: 0, worsenMinDay: 99, untreatedDamage: 0,
    registerCost: 0, treatCost: 0,
  },
};

export interface ActiveDisease {
  id: DiseaseId;
  day: number;              // 病程第几天（从 1 起，含潜伏）
  incubationLeft: number;   // 剩余潜伏期
  treated: boolean;         // 已确诊开药（或已住院出院）
  wrongMeds: boolean;       // 误诊：药吃着，但没用
  medsDays: number;         // 连续服药天数
  clinicCare: boolean;      // 在社区诊所看的（痊愈 +1 天）
  restedToday: boolean;     // 今天在家休息过（恶化概率 ×0.15）
  selfHealTotal: number;    // 自愈总天数（轻症发病时掷定）
  hospitalized: boolean;    // 住院中（由住院快进逐日推进）
}

/** 存档快照：疾病系统的全部可变状态 */
export interface HealthSnapshot {
  active: ActiveDisease | null;
  recoverLeft: number;
  permanentSpeedMul: number;
  healthCap: number;
  umbrella: boolean;
  debt: number;
  hasInsurance: boolean;
  insuranceUntilDay: number;
  blacklisted: boolean;
  chronicCheckupDone: boolean;
  pendingCrisis: boolean;
  rainHours: number;
  nightHours: number;
  sickContactHours: number;
  poorDietDays: number;
  yearEvents: YearEvent[];
  notices: string[];
  lastDay: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function roll(p: number): boolean {
  return Math.random() < p;
}

// 年龄段工具
function ageGroup(age: number): 'child' | 'adult' | 'mid' | 'elder' | 'old' {
  if (age <= 12) return 'child';
  if (age <= 40) return 'adult';
  if (age <= 60) return 'mid';
  if (age <= 75) return 'elder';
  return 'old';
}

export class HealthSystem {
  active: ActiveDisease | null = null;
  recoverLeft = 0;             // 痊愈后虚弱期（天）
  permanentSpeedMul = 1;       // 永久后遗症移速
  healthCap = 10;              // 健康上限（病危救回后永久扣减）
  umbrella = false;            // 买了伞
  debt = 0;                    // 医院赊账（上限 200）
  hasInsurance = false;        // 年度医保（16 岁起自购）
  insuranceUntilDay = 0;       // 到期游戏日
  blacklisted = false;         // 欠费名单
  chronicCheckupDone = false;  // 60 岁体检事件
  pendingCrisis = false;       // 病危，等待剧情接管

  /**
   * 疾病痊愈回调（main.ts 接到计分引擎）：
   * how = 治疗 / 硬扛自愈 / 畸形愈合 / 落下病根。
   * 未接回调时不影响原有流程（quest-logic-check 不构造 HealthSystem）。
   */
  onCured?: (disease: string, how: string) => void;

  // 当日风险累计（每天清零）
  rainHours = 0;               // 淋雨时长（游戏小时）
  nightHours = 0;              // 熬夜时长（22:00-06:00 在外晃）
  sickContactHours = 0;        // 与病路人近距离接触时长
  poorDietDays = 0;            // 连续吃路边摊天数

  private yearEvents: YearEvent[] = [];
  private notices: string[] = [];
  private lastDay = -1;

  /** 每帧调用：跨天时结算（含大跳天的逐日推进） */
  tick(player: Player): void {
    const d = gameDayIndex();
    if (this.lastDay < 0) {
      this.lastDay = d;
      return;
    }
    if (d === this.lastDay) return;
    const elapsed = Math.min(d - this.lastDay, 10); // 跳过今年最多按 10 天逐日结算
    for (let i = 0; i < elapsed; i++) {
      this.lastDay += 1;
      this.settle(player);
    }
  }

  /** 每日结算：新病判定 → 病程推进。返回本日要点（供 toast/剧情） */
  private settle(player: Player): void {
    const age = player.age;
    const stats = player.stats;
    if (!stats) return;

    // 医保到期
    if (this.hasInsurance && gameDayIndex() > this.insuranceUntilDay) {
      this.hasInsurance = false;
      this.yearEvents.push({ text: '你的医保到期了。', valence: -1, importance: 1 });
    }

    // 60 岁体检
    if (age >= 60 && !this.chronicCheckupDone) {
      this.chronicCheckupDone = true;
      if (roll(0.35)) {
        stats.mind = clamp(stats.mind - 0.5, 0, 10);
        this.yearEvents.push({ text: '体检查出了高血压，大夫让天天吃药、少吃咸的。', valence: -1, importance: 2 });
      } else if (roll(0.46)) {
        this.yearEvents.push({ text: '体检查出了关节炎，阴雨天腿就不得劲。', valence: -1, importance: 2 });
      } else {
        this.yearEvents.push({ text: '体检结果一切正常，大夫夸你身子骨硬朗。', valence: 1, importance: 1 });
      }
    }

    if (this.active) {
      this.progress(player);
    } else {
      this.tryNewDisease(player);
      if (this.recoverLeft > 0) this.recoverLeft -= 1;
      // 不生病时缓慢恢复
      if (stats.health < this.healthCap) stats.health = clamp(stats.health + 0.2, 0, this.healthCap);
    }

    // 风险清零
    this.rainHours = 0;
    this.nightHours = 0;
    this.sickContactHours = 0;
  }

  // ---- 新病判定 ----
  private tryNewDisease(player: Player): void {
    const stats = player.stats!;
    const g = ageGroup(player.age);
    const coef: Record<Tier, number> =
      g === 'child' ? { T1: 1.5, T2: 0.8, T3: 0.5 }
      : g === 'adult' ? { T1: 1, T2: 1, T3: 1 }
      : g === 'mid' ? { T1: 1.2, T2: 1.3, T3: 1.3 }
      : g === 'elder' ? { T1: 1.3, T2: 1.8, T3: 2.5 }
      : { T1: 1.5, T2: 2, T3: 3 };

    const lateNight = this.nightHours >= 1 ? 3 : 1; // 熬夜 ×3
    const pBase = 0.01 * lateNight;

    // 感冒：淋雨 / 传染 / 基础判定（取最高一条来源）
    let pCold = 1 - Math.pow(1 - 0.04, this.rainHours);        // 每小时 4%
    const pContact = 1 - Math.pow(1 - 0.15, this.sickContactHours); // 传染
    pCold = Math.max(pCold, pContact, pBase * coef.T1);
    if (roll(pCold)) this.onset(player, 'cold');
  }

  /** 发病（含潜伏期）：立即生效或由潜伏转正 */
  onset(player: Player, id: DiseaseId, opts?: { silent?: boolean }): void {
    if (this.active) return;
    const def = DISEASES[id];
    const g = ageGroup(player.age);
    const spread = def.selfHealSpread;
    const base = def.selfHealDays + (g === 'child' && id === 'cold' ? 1 : g !== 'child' && g !== 'adult' && id === 'cold' ? 2 : 0);
    this.active = {
      id,
      day: 0,
      incubationLeft: def.incubation,
      treated: false,
      wrongMeds: false,
      medsDays: 0,
      clinicCare: false,
      restedToday: false,
      selfHealTotal: def.selfHealDays > 0 ? base + Math.floor(Math.random() * (spread * 2 + 1)) - spread : 0,
      hospitalized: false,
    };
    if (def.incubation === 0) {
      this.becomeSymptomatic(player, opts?.silent);
    } else if (!opts?.silent) {
      this.pushNotice(`你好像染上了${def.name}，今天还没什么症状。`);
      this.pushEvent(`你好像染上了${def.name}，今天还没什么症状。`, 0, 1);
    }
  }

  private becomeSymptomatic(player: Player, silent = false): void {
    const a = this.active!;
    const def = DISEASES[a.id];
    a.day = 1;
    player.stats!.mind = clamp(player.stats!.mind - def.mindHit, 0, 10);
    if (!silent) {
      this.pushNotice(`你得了${def.name}——${def.desc}。`);
      this.pushEvent(`你得了${def.name}——${def.desc}。`, -1, def.tier === 'T3' ? 3 : 2);
    }
  }

  // ---- 病程推进（每日） ----
  private progress(player: Player): void {
    const a = this.active!;
    const def = DISEASES[a.id];
    const stats = player.stats!;
    const g = ageGroup(player.age);
    const elder = g === 'elder' || g === 'old';

    // 潜伏期
    if (a.incubationLeft > 0) {
      a.incubationLeft -= 1;
      if (a.incubationLeft === 0) this.becomeSymptomatic(player);
      a.restedToday = false;
      return;
    }

    a.day += 1;
    const restedMul = a.restedToday ? 0.15 : 1;
    a.restedToday = false;

    // 误诊：药吃满 3 天没用
    if (a.treated && a.wrongMeds) {
      a.medsDays += 1;
      if (a.medsDays >= 3) {
        // 药吃错不能变成永久病程：停药后回到自然恢复，并明确告诉玩家
        a.wrongMeds = false;
        a.treated = false;
        a.medsDays = 0;
        this.pushNotice('药不对症，先停药。身体得自己慢慢扛。');
        this.pushEvent('吃了几天药一点不见好……这药怕是不对症。', -1, 1);
      }
      return;
    }

    // 已治疗：数日子痊愈
    if (a.treated) {
      const need = def.treatDays + (a.clinicCare && def.clinicExtraDay ? 1 : 0);
      if (a.day > need) this.cure(player, '治疗');
      return;
    }

    // 住院中由住院快进逐日推进，不走这里（hospitalized 时跳过重症扣血）
    if (a.hospitalized) return;

    // 未治疗 ----
    // 重症每日扣健康
    if (def.untreatedDamage > 0) {
      const dmg = elder && def.untreatedDamageElder ? def.untreatedDamageElder
        : g === 'child' && def.untreatedDamageChild ? def.untreatedDamageChild
        : def.untreatedDamage;
      stats.health = clamp(stats.health - dmg, 0, this.healthCap);
      if (a.id === 'pneumonia' && stats.health < 3) {
        this.pendingCrisis = true; // 病危：剧情强制送医
        return;
      }
    }

    // 轻症自愈
    if (def.selfHealDays > 0 && a.day >= a.selfHealTotal) {
      this.cure(player, '硬扛自愈');
      stats.health = clamp(stats.health - 0.3, 0, this.healthCap); // 硬扛一场，伤点底子
      return;
    }

    // 拖成慢性/后遗症
    if (def.chronicAtDay && a.day > def.chronicAtDay) {
      if (a.id === 'fracture') {
        this.permanentSpeedMul *= 0.85;
        this.pushEvent(`骨头自己长上了，却长歪了——${def.permanentNote}`, -1, 3);
        this.cure(player, '畸形愈合');
      } else {
        this.active = {
          id: 'chronicGastritis', day: 1, incubationLeft: 0, treated: false, wrongMeds: false,
          medsDays: 0, clinicCare: false, restedToday: false, selfHealTotal: 0, hospitalized: false,
        };
        this.pushEvent(`胃疼拖成了老毛病——${def.permanentNote}`, -1, 3);
      }
      return;
    }

    // 恶化判定（扭伤第 5 天起 30% 习惯性扭伤）
    if (a.id === 'sprain' && a.day >= def.worsenMinDay && roll(def.worsenChance * restedMul)) {
      this.permanentSpeedMul *= 0.95;
      this.pushEvent('脚踝落下了病根，以后隔三差五就要疼一阵。', -1, 3);
      this.cure(player, '落下病根');
      return;
    }

    // 恶化链：感冒 → 支气管炎 → 肺炎；肠胃炎 → 胃炎
    if (def.worsenTo && a.day >= def.worsenMinDay) {
      let p = def.worsenChance * restedMul;
      if (def.worsenAgeBoost) {
        if (g === 'child') p = def.worsenAgeBoost.child * restedMul;
        else if (elder) p = def.worsenAgeBoost.elder * restedMul;
      }
      if (roll(p)) {
        const to = def.worsenTo;
        this.active = {
          id: to, day: 0, incubationLeft: DISEASES[to].incubation, treated: false, wrongMeds: false,
          medsDays: 0, clinicCare: false, restedToday: false, selfHealTotal: 0, hospitalized: false,
        };
        this.pushNotice(`${def.name}一直没好，反而加重了——拖成了${DISEASES[to].name}！`);
        this.pushEvent(`${def.name}一直没好，反而加重了——拖成了${DISEASES[to].name}！`, -1, 3);
        if (DISEASES[to].incubation === 0) this.becomeSymptomatic(player);
        return;
      }
    }

    // 慢性胃炎：每月犯几次（概率事件，轻量）
    if (a.id === 'chronicGastritis' && roll(0.12)) {
      stats.mind = clamp(stats.mind - 0.5, 0, 10);
      this.pushEvent('老胃病又犯了，饭也吃不香。', -1, 1);
    }
  }

  private cure(player: Player, how: string): void {
    const a = this.active!;
    const def = DISEASES[a.id];
    this.active = null;
    this.recoverLeft = Math.round(def.recoverDays * (player.age >= 61 ? 1.5 : 1));
    // 人生分：病被治好（治疗 +15 / 硬扛自愈 +5 / 畸形愈合与落下病根 0，由引擎判定）
    this.onCured?.(a.id, how);
    if (how === '治疗' || how === '硬扛自愈') {
      this.pushNotice(`${def.name}好了（${how}）。总算能正常喘气了。`);
      this.pushEvent(`${def.name}好了（${how}）。总算能正常喘气了。`, 1, 2);
    }
  }

  // ---- 问诊接口（medical.ts 用） ----
  get disease(): DiseaseDef | null {
    if (!this.active || this.active.incubationLeft > 0) return null;
    return DISEASES[this.active.id];
  }

  symptomatic(): boolean {
    return this.disease !== null;
  }

  /** 确诊开药：误诊概率由医院 1% / 诊所 5% 传入 */
  prescribe(player: Player, opts: { wrong: boolean; clinic: boolean }): number {
    const a = this.active!;
    a.treated = true;
    a.wrongMeds = opts.wrong;
    a.medsDays = 0;
    a.clinicCare = opts.clinic;
    if (a.day === 0) a.day = 1; // 潜伏期直接确诊
    return DISEASES[a.id].treatDays + (opts.clinic && DISEASES[a.id].clinicExtraDay ? 1 : 0);
  }

  /** 实际费用（医保/未成年/夜间系数在外层算好后传入扣款） */
  charge(player: Player, amount: number): 'paid' | 'debt' | 'unpaid' {
    const minor = player.age < 16;
    if (minor || amount <= 0) return 'paid'; // 未成年父母付
    if (player.money >= amount) {
      player.money -= amount;
      return 'paid';
    }
    if (this.debt + amount <= 200) {
      this.debt += amount;
      return 'debt';
    }
    this.blacklisted = true;
    return 'unpaid';
  }

  // ---- 症状对玩家人身的作用 ----
  staminaCap(): number {
    const d = this.disease;
    if (!d) return this.recoverLeft > 0 ? 70 : 100;
    const a = this.active!;
    return Math.round(100 * (a.treated && !a.wrongMeds ? d.staminaMulTreated : d.staminaMul));
  }

  speedMul(): number {
    const d = this.disease;
    let m = this.permanentSpeedMul;
    if (this.recoverLeft > 0) m *= 0.85;
    if (d) m *= this.active!.treated && !this.active!.wrongMeds ? Math.max(d.speedMul, 0.9) : d.speedMul;
    return m;
  }

  // ---- 休息 ----
  rest(player: Player): void {
    player.stamina = this.staminaCap();
    if (this.active) this.active.restedToday = true;
    if (player.stats && player.stats.health < this.healthCap) {
      player.stats.health = clamp(player.stats.health + 0.3, 0, this.healthCap);
    }
    this.poorDietDays = 0;
  }

  /** 病危救回：永久扣健康上限（暗示，无血腥） */
  crisisConsequence(player: Player): void {
    const loss = player.age >= 61 ? 2 : 1;
    this.healthCap = Math.max(3, this.healthCap - loss);
    player.stats!.health = Math.min(player.stats!.health, this.healthCap);
    this.pushEvent(`你在鬼门关前转了一圈。大夫说，这身子以后得好好养了。`, -1, 3);
  }

  // ---- 年度报表 ----
  private pushNotice(text: string): void {
    this.notices.push(text);
  }

  private pushEvent(text: string, valence: -1 | 0 | 1, importance: 1 | 2 | 3): void {
    this.yearEvents.push({ text, valence, importance });
  }

  consumeYearEvents(): YearEvent[] {
    const ev = this.yearEvents;
    this.yearEvents = [];
    return ev;
  }

  /** 即时病程提示：由场景层每条取走并 toast */
  takeNotices(): string[] {
    const n = this.notices;
    this.notices = [];
    return n;
  }

  /** 每帧累计风险（在外场景调用）：dt 秒 → 游戏小时 */
  accumulate(dt: number, raining: boolean, night: boolean, nearSick: boolean): void {
    const hoursPerSec = 24 / (CYCLE_MS / 1000);
    if (raining && !this.umbrella) this.rainHours += dt * hoursPerSec;
    if (night) this.nightHours += dt * hoursPerSec;
    if (nearSick) this.sickContactHours += dt * hoursPerSec;
  }

  /** 调试：?sick= 直接发病 */
  debugOnset(player: Player, id: string): void {
    if (id in DISEASES) this.onset(player, id as DiseaseId, { silent: false });
    if (id === 'chronicGastritis') this.active!.incubationLeft = 0;
  }

  // ---- 存档 ----

  snapshot(): HealthSnapshot {
    return {
      active: this.active ? { ...this.active } : null,
      recoverLeft: this.recoverLeft,
      permanentSpeedMul: this.permanentSpeedMul,
      healthCap: this.healthCap,
      umbrella: this.umbrella,
      debt: this.debt,
      hasInsurance: this.hasInsurance,
      insuranceUntilDay: this.insuranceUntilDay,
      blacklisted: this.blacklisted,
      chronicCheckupDone: this.chronicCheckupDone,
      pendingCrisis: this.pendingCrisis,
      rainHours: this.rainHours,
      nightHours: this.nightHours,
      sickContactHours: this.sickContactHours,
      poorDietDays: this.poorDietDays,
      yearEvents: this.yearEvents.map((e) => ({ ...e })),
      notices: [...this.notices],
      lastDay: this.lastDay,
    };
  }

  restore(s: HealthSnapshot): void {
    this.active = s.active ? { ...s.active } : null;
    this.recoverLeft = s.recoverLeft ?? 0;
    this.permanentSpeedMul = s.permanentSpeedMul ?? 1;
    this.healthCap = s.healthCap ?? 10;
    this.umbrella = !!s.umbrella;
    this.debt = s.debt ?? 0;
    this.hasInsurance = !!s.hasInsurance;
    this.insuranceUntilDay = s.insuranceUntilDay ?? 0;
    this.blacklisted = !!s.blacklisted;
    this.chronicCheckupDone = !!s.chronicCheckupDone;
    this.pendingCrisis = !!s.pendingCrisis;
    this.rainHours = s.rainHours ?? 0;
    this.nightHours = s.nightHours ?? 0;
    this.sickContactHours = s.sickContactHours ?? 0;
    this.poorDietDays = s.poorDietDays ?? 0;
    this.yearEvents = (s.yearEvents ?? []).map((e) => ({ ...e }));
    this.notices = [...(s.notices ?? [])];
    // 关键：把"上次结算日"也恢复，否则读档当天会被当成跨天而重算一遍病程
    this.lastDay = s.lastDay ?? -1;
  }
}
