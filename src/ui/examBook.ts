// 期末考试预约按钮：HTML「正在翻开的书本」
// · 学龄内（6~18 岁）显示；点击预约，第二天自动开考（一年一次）
// · 状态：备考（可预约）→ 备考中（已预约，翻页动画）→ 开考中（已到考试日）→ 已考（本年度已完成）
import type { GameContext } from '../context';
import { gameDayIndex } from '../core/daynight';
import { ExamScene } from '../scenes/examScene';

export class ExamBook {
  private el: HTMLElement | null = null;
  private labelEl: HTMLElement | null = null;
  private lastLabel = '';

  constructor(
    private readonly ctx: GameContext,
    stage: HTMLElement | null,
  ) {
    if (!stage) return;
    const el = stage.querySelector<HTMLElement>('#exam-book');
    if (!el) return;
    this.el = el;
    this.labelEl = el.querySelector<HTMLElement>('.exam-book-label');
    el.addEventListener('click', () => this.onClick());
  }

  private onClick(): void {
    const { schoolState, player, hud } = this.ctx;
    if (!player.stats) return;
    if (schoolState.canScheduleExam(player)) {
      schoolState.scheduleExam();
      hud.toast('已预约期末考试，明天开考。');
      this.refresh();
    } else if (schoolState.isExamDue(gameDayIndex())) {
      this.triggerExam();
    }
  }

  /** 每帧调用：自动检测考试日是否已到并开考；更新按钮状态 */
  update(): void {
    const { schoolState, player, scenes } = this.ctx;
    if (!this.el || !player.stats) return;
    const inSchool = player.age >= 6 && player.age <= 18;
    this.el.classList.toggle('on', inSchool);
    if (!inSchool) return;

    // 考试日已到且人在大地图 → 自动开考
    if (
      schoolState.isExamDue(gameDayIndex()) &&
      scenes.current === this.ctx.overworld &&
      !scenes.isTransitioning
    ) {
      this.triggerExam();
      return;
    }
    this.refresh();
  }

  private triggerExam(): void {
    const { scenes, hud } = this.ctx;
    hud.toast('期末考试开始了！');
    scenes.request(new ExamScene(this.ctx, () => scenes.request(this.ctx.overworld)));
  }

  private refresh(): void {
    const { schoolState, player } = this.ctx;
    const el = this.el;
    if (!el || !player.stats) return;
    const due = schoolState.isExamDue(gameDayIndex());
    const done = schoolState.lastExamAge >= player.age;
    const scheduled = schoolState.examDueDay >= 0 && !due;
    el.classList.toggle('scheduled', scheduled);
    el.classList.toggle('done', done);
    const label = due ? '开考中' : done ? '已考' : scheduled ? '备考中' : '备考';
    if (label !== this.lastLabel && this.labelEl) {
      this.lastLabel = label;
      this.labelEl.textContent = label;
    }
  }
}
