// 就医流程浮层：挂号 → 候诊 → 诊断 → 缴费 → 取药 / 住院快进
// 医院是「有成本的行为」：时间（分阶段不可跳过的真实等待）+ 金钱 + 选择
// 入口：镇医院挂号台（hospital）/ 社区诊所（clinic）/ 病危强制送医（crisis）
// 夜间只有急诊：轻症被分诊台劝返；未成年由父母付钱；家境贫寒先去诊所
import { VIEW_H, VIEW_W } from '../config';
import type { Input } from '../core/input';
import type { GameContext } from '../context';
import { gameHour, isNight, skipGameDays, gameDayIndex } from '../core/daynight';
import { DISEASES } from '../core/health';
import type { DiseaseDef } from '../core/health';
import { clockOf } from '../score/facts';

type StepKind = 'auto' | 'choice' | 'cards';

interface Step {
  title: string;
  text: string;
  dur: number;       // auto 阶段时长（秒）；cards 阶段每张卡片时长
  kind: StepKind;
  options?: string[]; // choice 阶段选项
}

const CHARS_PER_SEC = 40;

export class MedicalFlow {
  private steps: Step[] = [];
  private idx = 0;
  private stageT = 0;
  private shown = 0;
  private sel = 0;
  private done = false; // 当前文本显示完毕
  private busy = false;
  private mode: 'hospital' | 'clinic' | 'crisis' | null = null;
  private wrong = false;      // 本次误诊
  private revisit = false;    // 误诊后免费复诊
  private fee = 0;            // 待缴费用
  private daily = 0;          // 住院每日费用
  private cardDay = 0;        // 住院第几天
  private cardLines: string[] = [];
  private onChoice: ((i: number) => void) | null = null;
  private onAidChoice: ((i: number) => void) | null = null;

  constructor(private readonly ctx: GameContext) {}

  get isActive(): boolean {
    return this.busy;
  }

  // ---- 入口 ----

  startHospital(): void {
    const { player, health } = this.ctx;
    const night = isNight();
    const def = health.disease;

    // 潜伏期：已有病程但还没症状，别误判成“没病”
    if (!def && health.active) {
      this.run([{ title: '诊室', text: `大夫听完你的描述，又量了体温：「症状还没起来，先回去观察两天。
真烧起来再来。」`, dur: 3.5, kind: 'auto' }], 'hospital');
      return;
    }

    // 病危优先
    if (health.pendingCrisis) {
      health.pendingCrisis = false;
      this.startCrisis();
      return;
    }
    // 夜间急诊：轻症劝返
    if (night && def && def.tier === 'T1') {
      this.run([
        { title: '分诊台', text: '「夜里只接急诊。」护士指了指墙上挂钟，「这种小毛病，明早八点后再来吧。」\n白跑一趟，心情有点糟。', dur: 3, kind: 'auto' },
      ], 'hospital', () => {
        if (player.stats) player.stats.mind = Math.max(0, player.stats.mind - 0.5);
      });
      return;
    }
    // 家境贫寒的未成年人：先去社区诊所
    if (player.age < 16 && (player.stats?.family ?? 5) <= 2) {
      this.run([
        { title: '挂号处', text: '收费员看了看登记表：「社区诊所便宜，先带孩子去那儿看看。真看不好，再来。」', dur: 3.5, kind: 'auto' },
      ], 'hospital');
      return;
    }
    // 没病
    if (!def) {
      const steps: Step[] = [{ title: '诊室', text: '大夫让你张开嘴看了看，又听了听心肺。\n「没什么毛病。少熬夜、雨里别乱跑。回去吧。」', dur: 3.5, kind: 'auto' }];
      if (player.age >= 16 && !health.hasInsurance) {
        steps.push({
          title: '收费处', dur: 0.1, kind: 'choice',
          text: `「顺便问一句，办年度医保吗？500 元，保到年底，全年门诊六折、住院四折。」\n（现有 ${player.money} 元）`,
          options: player.money >= 500 ? ['办（500 元）', '不办'] : ['不办（钱不够）'],
        });
      }
      this.run(steps, 'hospital', undefined, (i) => {
        if (player.age >= 16 && !health.hasInsurance && player.money >= 500 && i === 0) {
          player.money -= 500;
          health.hasInsurance = true;
          health.insuranceUntilDay = gameDayIndex() + 10;
          this.ctx.hud.toast('办好了年度医保，看病能报销了。');
        }
        this.finish();
      });
      return;
    }
    this.clinicTriage('hospital', def, night);
  }

  startClinic(): void {
    const { health } = this.ctx;
    const def = health.disease;
    if (!def && health.active) {
      this.run([{ title: '社区诊所', text: '社区大夫把了把脉：「还没发作，先观察。多喝热水，别乱吃药。」', dur: 3, kind: 'auto' }], 'clinic');
      return;
    }
    if (health.pendingCrisis) {
      health.pendingCrisis = false;
      this.startCrisis();
      return;
    }
    if (!def) {
      this.run([{ title: '社区诊所', text: '社区大夫给你把了把脉：「好着呢，回家吧。」', dur: 3, kind: 'auto' }], 'clinic');
      return;
    }
    if (def.tier !== 'T1') {
      this.run([
        { title: '社区诊所', text: `社区大夫皱起眉：「${def.name}？我这儿看不了这个，快去镇医院，别耽搁！」`, dur: 3.5, kind: 'auto' },
      ], 'clinic');
      return;
    }
    this.clinicTriage('clinic', def, isNight());
  }

  /** 病危强制送医：剧情 → 住院快进 → 永久健康上限损失 */
  startCrisis(): void {
    const { health, player } = this.ctx;
    const def = health.disease ?? DISEASES.pneumonia;
    const steps: Step[] = [
      { title: '——', text: '后半夜，你烧得说起了胡话。\n隔壁的动静惊动了邻居，他们把你抬上车，连夜送到了医院急诊。', dur: 4, kind: 'auto' },
      { title: '急诊', text: `「${def.name}，拖太久了。」大夫脸色很沉，「马上住院。」`, dur: 3, kind: 'auto' },
    ];
    this.wrong = false;
    this.revisit = false;
    this.mode = 'crisis';
    this.busy = true;
    if (health.active) health.active.hospitalized = true;
    this.steps = steps.concat(this.hospitalSteps(def, true));
    this.idx = 0;
    this.stageT = 0;
    this.shown = 0;
    this.done = false;
    player.stats!.mind = Math.max(0, player.stats!.mind - 1);
  }

  // ---- 流程装配 ----

  /** 医院/诊所共用的门诊装配（确诊有病的玩家） */
  private clinicTriage(mode: 'hospital' | 'clinic', def: DiseaseDef, night: boolean): void {
    const { health, player } = this.ctx;
    const revisit = !!health.active?.wrongMeds;
    this.revisit = revisit;
    this.wrong = !revisit && Math.random() < (mode === 'clinic' ? 0.05 : 0.01);

    const h = gameHour();
    const peak = (h >= 8 && h < 10) || (h >= 14 && h < 16);
    const nightMul = night ? 1.5 : 1;
    const minor = player.age < 16;

    // 费用
    let fee = def.registerCost + def.treatCost;
    if (mode === 'clinic') fee = 8; // 社区基本药
    fee = Math.round(fee * nightMul);
    let discountNote = '';
    if (minor) {
      fee = 0;
      discountNote = '\n（妈妈替你付了钱）';
    } else if (revisit) {
      fee = 0;
      discountNote = '\n（上次的药不对症，这次免费换药）';
    } else if (health.hasInsurance) {
      fee = Math.round(fee * 0.6);
      discountNote = `\n（医保报销后 ${fee} 元）`;
    }
    this.fee = fee;

    const queueText = mode === 'clinic'
      ? '诊所里排着长队，前面还有七八个人。电风扇吱呀吱呀地转。'
      : peak
        ? '正是就诊高峰，候诊区坐得满满当当，叫号声、咳嗽声混成一片。'
        : '候诊区人不多，你找了个空位坐下。';

    // 缴费 upfront（文本稍后呈现）；钱不够 → 记欠费账
    let payNote = '';
    if (fee > 0) {
      const r = health.charge(player, fee);
      payNote = r === 'paid' ? `（付清 ${fee} 元）`
        : r === 'debt' ? `（钱不够，${fee} 元记在了欠费账上）`
        : `（实在拿不出，医院先垫了——你的名字记进了欠费名单）`;
      if (r === 'unpaid') {
        health.debt += fee;
        health.blacklisted = true;
      }
    }

    const steps: Step[] = [
      { title: '挂号处', text: `「挂什么科？」你说了症状，收费员递来一张挂号单。`, dur: 2, kind: 'auto' },
      { title: '候诊', text: queueText + (mode === 'clinic' ? '' : peak ? '\n这一等，就是大半个小时。' : '\n等了约莫一刻钟。'), dur: mode === 'clinic' ? 6 : peak ? 8 : 5, kind: 'auto' },
      { title: '诊室', text: revisit
          ? `大夫听完你的描述，翻了翻上次的病历：「药开错了。换这个，吃两天就好。」`
          : `大夫问了问情况，看了看喉咙，在本子上写着什么。\n「${def.name}。${def.desc}。」\n「按时吃药，多喝水，别逞强。」`,
        dur: 3.5, kind: 'auto' },
      { title: '缴费', text: (fee > 0 ? `收费单：${fee} 元。` : '这次不用交钱。') + discountNote + `\n${payNote}`, dur: 2.5, kind: 'auto' },
    ];

    if (def.tier === 'T3' && mode === 'hospital') {
      // 重症住院：住院费走每日卡片；太穷可申请大病救助（减半）
      const hosp = this.hospitalSteps(def, false);
      const totalNeed = this.daily * (def.hospitalDays ?? 5);
      if (this.daily > 0 && player.money < totalNeed && player.age >= 16) {
        steps.push({
          title: '住院部', dur: 0.1, kind: 'choice',
          text: `护士看了看押金单：「住院费加起来要 ${totalNeed} 元，你这……」\n（可以申请大病救助，住院费减半）`,
          options: ['申请大病救助（费用减半）', '先住下，钱慢慢想办法'],
        });
        this.onAidChoice = (i: number) => {
          if (i === 0) {
            this.daily = Math.round(this.daily * 0.5);
            this.ctx.hud.toast('申请到了大病救助，住院费减半。');
          }
        };
      }
      steps.push(...hosp);
      if (health.active) health.active.hospitalized = true; // 住院期间每日结算跳过病程扣血
      this.run(steps, mode);
      return;
    }

    this.run(steps, mode, () => {
      const days = this.ctx.health.prescribe(player, { wrong: this.wrong, clinic: mode === 'clinic' });
      this.ctx.hud.toast(this.wrong
        ? `开好了药。（这药……总感觉哪里不对）`
        : `确诊${def.name}，按时服药 ${days} 天就好。`);
    });
  }

  /** 住院阶段：每日一张卡片（费用 / 属性 / 事件），衔接「跳过」体系 */
  private hospitalSteps(def: DiseaseDef, crisis: boolean): Step[] {
    const { health, player } = this.ctx;
    const days = def.hospitalDays ?? 5;
    let daily = def.hospitalCostPerDay ?? 80;
    if (!crisis && player.age >= 16 && health.hasInsurance) daily = Math.round(daily * 0.4);
    if (crisis && player.age >= 16 && health.hasInsurance) daily = Math.round(daily * 0.4);
    if (player.age < 16) daily = 0; // 父母付
    this.daily = daily;
    this.cardDay = 0;

    const intro: Step = crisis
      ? { title: '住院部', text: daily > 0 ? `押金交上了。每天住院费 ${daily} 元。` : '父母守在病床前，医药费他们来想办法。', dur: 2.5, kind: 'auto' }
      : { title: '住院部', text: daily > 0 ? `护士领你去了病房：「先住 ${days} 天，每天 ${daily} 元。」` : '护士领你去了病房：「先住几天，孩子家里不用担心钱。」', dur: 2.5, kind: 'auto' };

    const cards: Step = { title: '住院', text: '', dur: 1.8, kind: 'cards' };
    const outro: Step = {
      title: '出院', dur: 3, kind: 'auto',
      text: `住了 ${days} 天，各项指标稳住了。\n大夫叮嘱：「回去再静养些日子，别急着折腾。」`,
    };
    return [intro, cards, outro];
  }

  private nextHospitalDay(): void {
    const { health, player } = this.ctx;
    const def = health.disease ?? DISEASES.pneumonia;
    this.cardDay += 1;
    skipGameDays(1); // 住院一天：时间快进（零花/病程自然结算）
    this.ctx.quests.shiftActiveDeadlines(1); // 住院期间任务期限冻结/顺延
    if (this.daily > 0) health.charge(player, this.daily);
    const stats = player.stats!;
    stats.health = Math.min(health.healthCap, stats.health + 0.5);
    stats.mind = Math.max(0, stats.mind - 0.1);
    player.stamina = 100;
    const flavor = [
      '隔壁床的大爷给你讲了年轻时的故事。',
      '护士来量了体温，说你气色好多了。',
      '爸妈来探视，带了你最爱吃的。',
      '病友家属分了你半个苹果。',
      '窗外下雨，病房里安安静静的。',
      '你望着天花板，数着日子。',
    ];
    this.cardLines = [
      `住院第 ${this.cardDay} 天`,
      flavor[(Math.random() * flavor.length) | 0],
      this.daily > 0 ? `住院费 −${this.daily} 元` : '医药费父母扛着',
    ];
  }

  // ---- 推进 ----

  private run(steps: Step[], mode: 'hospital' | 'clinic', after?: () => void, onChoice?: (i: number) => void): void {
    this.mode = mode;
    this.busy = true;
    this.steps = steps;
    this.idx = 0;
    this.stageT = 0;
    this.shown = 0;
    this.done = false;
    this.onChoice = onChoice ?? null;
    this.afterAll = after ?? null;
  }

  private afterAll: (() => void) | null = null;

  update(dt: number, input: Input): void {
    if (!this.busy) return;
    const step = this.steps[this.idx];
    if (!step) {
      this.finish();
      return;
    }

    // 打字机
    if (!this.done) {
      this.shown += CHARS_PER_SEC * dt;
      if (this.shown >= step.text.length) this.done = true;
    }

    if (step.kind === 'cards') {
      this.stageT += dt;
      const target = this.ctx.health.disease?.hospitalDays ?? 5;
      if (this.cardDay === 0 || this.stageT >= step.dur) {
        this.stageT = 0;
        if (this.cardDay >= target) {
          this.discharge();
          this.advance();
          return;
        }
        this.nextHospitalDay();
      }
      return;
    }

    if (step.kind === 'choice' && this.done) {
      const n = step.options!.length;
      if (input.wasPressed('ArrowUp', 'KeyW')) this.sel = (this.sel + n - 1) % n;
      if (input.wasPressed('ArrowDown', 'KeyS')) this.sel = (this.sel + 1) % n;
      for (let i = 0; i < n; i++) {
        if (input.wasPressed(`Digit${i + 1}`)) return this.choose(i);
      }
      if (input.wasPressed('KeyE', 'Enter', 'Space')) this.choose(this.sel);
      return;
    }

    // auto：E 快进当前阶段
    if (this.done && (input.wasPressed('KeyE', 'Enter', 'Space') || (this.stageT += dt) >= step.dur)) {
      this.advance();
    } else if (!this.done && input.wasPressed('KeyE', 'Enter', 'Space')) {
      this.shown = step.text.length;
      this.done = true;
    } else {
      this.stageT += dt;
    }
  }

  private choose(i: number): void {
    const cb = this.onChoice;
    const aid = this.onAidChoice;
    this.onChoice = null;
    this.onAidChoice = null;
    this.advance();
    cb?.(i);
    aid?.(i);
  }

  private advance(): void {
    this.idx += 1;
    this.stageT = 0;
    this.shown = 0;
    this.done = false;
    this.sel = 0;
    const next = this.steps[this.idx];
    if (!next) this.finish();
    else if (next.kind === 'cards') {
      this.cardDay = 0;
      this.cardLines = ['办理了住院手续……'];
    }
  }

  private discharge(): void {
    const { health } = this.ctx;
    const def = health.disease ?? DISEASES.pneumonia;
    if (health.active) {
      health.active.hospitalized = false;
      health.active.treated = true;
      health.active.wrongMeds = false;
      health.recoverLeft = Math.round(def.recoverDays * (this.ctx.player.age >= 61 ? 1.5 : 1));
    }
    if (this.mode === 'crisis') {
      health.crisisConsequence(this.ctx.player);
      this.ctx.hud.toast('出院了。身体大不如前，往后要好好养着。');
      // 人生分：挺过病危（每日 1 次，引擎兜底）
      if (this.ctx.score) this.ctx.score.emit({ type: 'crisis_survived' }, clockOf(this.ctx));
    } else {
      this.ctx.hud.toast('出院了。回家再静养些日子。');
    }
  }

  private finish(): void {
    const after = this.afterAll;
    this.afterAll = null;
    this.busy = false;
    this.mode = null;
    this.ctx.hud.toast('离开医院。');
    after?.();
  }

  // ---- 渲染 ----

  render(g: CanvasRenderingContext2D): void {
    if (!this.busy) return;
    const step = this.steps[this.idx];
    if (!step) return;
    const bh = 190;
    const by = VIEW_H - bh - 12;

    g.fillStyle = 'rgba(12,14,18,0.9)';
    g.fillRect(24, by, VIEW_W - 48, bh);
    const accent = this.mode === 'clinic' ? '#7fd18a' : this.mode === 'crisis' ? '#e83a3a' : '#9fb8e8';
    g.strokeStyle = accent;
    g.lineWidth = 2;
    g.strokeRect(25, by + 1, VIEW_W - 50, bh - 2);

    // 标题条
    g.font = '14px monospace';
    g.textBaseline = 'top';
    g.fillStyle = accent;
    g.fillText(`— ${step.title} —`, 44, by + 10);

    // 正文
    g.font = '16px monospace';
    const text = step.kind === 'cards'
      ? this.cardLines.join('\n')
      : step.text.slice(0, Math.floor(this.shown));
    let y = by + 34;
    for (const row of text.split('\n')) {
      g.fillStyle = row.startsWith('（') ? '#8a8f98' : '#e8e8e8';
      g.fillText(row, 44, y);
      y += 24;
    }

    if (step.kind === 'cards') {
      // 进度：住院第 N / 总天数
      const target = this.ctx.health.disease?.hospitalDays ?? 5;
      const bw = 320;
      g.fillStyle = '#2a2e36';
      g.fillRect(44, by + bh - 34, bw, 10);
      g.fillStyle = '#9fb8e8';
      g.fillRect(44, by + bh - 34, (bw * this.cardDay) / target, 10);
      g.font = '13px monospace';
      g.fillStyle = '#8a8f98';
      g.fillText(`住院快进中…… ${this.cardDay}/${target} 天`, 44 + bw + 12, by + bh - 36);
      return;
    }

    if (step.kind === 'choice' && this.done) {
      step.options!.forEach((opt, i) => {
        const label = `${i === this.sel ? '▶' : ' '} ${i + 1}. ${opt}`;
        g.font = '16px monospace';
        g.fillStyle = i === this.sel ? '#ffd166' : '#9aa0aa';
        g.fillText(label, 44, by + bh - 34 - (step.options!.length - 1 - i) * 24);
      });
      return;
    }

    if (!this.done) {
      g.font = '13px monospace';
      g.fillStyle = '#6a7078';
      g.fillText('E 快进', VIEW_W - 110, by + bh - 28);
    }
  }
}
