// 学校档案：出勤、学科掌握、成绩档、推荐、旧友、毕业后回响
// 与 SchoolPanel / ClassroomSession / OverworldScene 共享
import { gameDayIndex, gameHour } from '../core/daynight';
import type { Player } from '../entities/player';
import type { Hud } from '../ui/hud';

export type GradeTag = 'A' | 'B' | 'C';

const SUBJECTS = ['语文', '数学', '英语', '科学'] as const;
export type Subject = (typeof SUBJECTS)[number];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function weekdayOf(day: number): number {
  return ((day % 7) + 7) % 7;
}

export class SchoolState {
  attended = 0;
  missed = 0;
  keyClassesToday = 0;
  lastDay = -1;

  subjects: Record<string, number> = { 语文: 60, 数学: 60, 英语: 60, 科学: 60 };
  notes = 0;
  lastScore = 72;
  lastSubject = '数学';
  lateCount = 0;

  gradeTag: GradeTag = 'B';
  recommendation = false;
  graduated = false;
  friends = 0;

  // 期末考试（玩家预约，第二天开考；每年一次）
  lastExamAge = -1;    // 最近一次考试时的年龄（-1 未考过）
  lastExamCorrect = 0; // 最近一次答对题数
  lastExamTotal = 0;   // 最近一次总题数
  xueshenUntil = -1;   // 学神称号有效期截止年龄（当年 + 次年；-1 无称号）
  examDueDay = -1;     // 预约的考试日（游戏日序号）；-1 未预约
  studentNo = '';      // 学号：首次考试时随机生成，之后固定

  private echoesSeen = new Set<number>();
  readonly tags: string[] = [];

  attendanceRate(): number {
    const total = this.attended + this.missed;
    return total <= 0 ? 1 : this.attended / total;
  }

  averageScore(): number {
    const vals = SUBJECTS.map((s) => this.subjects[s] ?? 60);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  isSchoolAge(player: Player): boolean {
    return player.age >= 6 && player.age <= 18;
  }

  isSchoolTime(): boolean {
    const hour = gameHour();
    const wd = weekdayOf(gameDayIndex());
    return wd < 5 && hour >= 8 && hour < 16.05;
  }

  canAttend(player: Player): { ok: boolean; reason: string } {
    if (player.age < 6) return { ok: false, reason: '还没到上学的年纪。' };
    if (player.age > 18) return { ok: false, reason: '你已经毕业了。' };
    const hour = gameHour();
    const wd = weekdayOf(gameDayIndex());
    if (wd >= 5) return { ok: false, reason: '今天是周末，学校不开门。' };
    if (hour < 8 || hour >= 16.05) return { ok: false, reason: '现在不是上课时间。' };
    if (this.keyClassesToday >= 2) return { ok: false, reason: '今天的重点课已经上完了。' };
    return { ok: true, reason: '' };
  }

  recordClass(subject: string, score: number, notes: number, late: boolean): void {
    const s = (SUBJECTS as readonly string[]).includes(subject) ? subject : '自习';
    const old = this.subjects[s] ?? 60;
    this.subjects[s] = clamp(Math.round(old * 0.7 + score * 0.3), 0, 100);
    this.lastScore = clamp(Math.round(score), 0, 100);
    this.lastSubject = s;
    this.notes += notes;
    this.attended += 1;
    this.keyClassesToday += 1;
    if (late) this.lateCount += 1;
  }

  setFriends(count: number): void {
    this.friends = Math.max(this.friends, count);
  }

  /** 记录一次考试；正确率 ≥80% 授予学神称号，维持 2 年（当年 + 次年） */
  recordExam(age: number, correct: number, total: number): void {
    this.lastExamAge = age;
    this.lastExamCorrect = correct;
    this.lastExamTotal = total;
    this.examDueDay = -1; // 考完清除预约
    if (total > 0 && correct / total >= 0.8) {
      this.xueshenUntil = Math.max(this.xueshenUntil, age + 2);
    }
  }

  /** 当前是否持有学神称号（星星标） */
  isXueshen(age: number): boolean {
    return age < this.xueshenUntil;
  }

  /** 是否还能预约本年度考试（学龄内、今年还没考过、当前没有待考预约） */
  canScheduleExam(player: Player): boolean {
    return player.age >= 6 && player.age <= 18 && this.lastExamAge < player.age && this.examDueDay < 0;
  }

  /** 预约期末考试：第二天可考，返回考试日（游戏日序号） */
  scheduleExam(): number {
    this.examDueDay = gameDayIndex() + 1;
    return this.examDueDay;
  }

  /** 预约的考试是否已到（到了可开考的那一天） */
  isExamDue(day: number): boolean {
    return this.examDueDay >= 0 && day >= this.examDueDay;
  }

  /** 学号：首次调用随机生成（2026 + 4 位随机数），之后固定不变 */
  studentNoOrGenerate(): string {
    if (!this.studentNo) {
      const seq = Math.floor(Math.random() * 10000);
      this.studentNo = `2026${String(seq).padStart(4, '0')}`;
    }
    return this.studentNo;
  }

  /** 每日推进：结算昨天缺的重点课，触发毕业与毕业后回响 */
  update(player: Player, hud: Hud): void {
    const day = gameDayIndex();
    if (this.lastDay < 0) this.lastDay = day;
    if (day !== this.lastDay) {
      const prevWd = weekdayOf(this.lastDay);
      if (this.isSchoolAge(player) && prevWd < 5) {
        this.missed += Math.max(0, 2 - this.keyClassesToday);
      }
      this.keyClassesToday = 0;
      this.lastDay = day;
    }

    if (player.age >= 19 && !this.graduated) this.graduate(hud);
    this.echo(player, hud);
  }

  private graduate(hud: Hud): void {
    this.graduated = true;
    this.gradeTag = this.averageScore() >= 85 ? 'A' : this.averageScore() >= 70 ? 'B' : 'C';
    this.recommendation = this.attendanceRate() >= 0.6 && this.averageScore() >= 70;
    if (!this.tags.includes(`母校·${this.gradeTag}`)) this.tags.push(`母校·${this.gradeTag}`);
    if (this.recommendation && !this.tags.includes('教师推荐')) this.tags.push('教师推荐');
    hud.toast(`毕业了。成绩档 ${this.gradeTag}${this.recommendation ? ' · 教师推荐' : ''}`);
  }

  private echo(player: Player, hud: Hud): void {
    if (player.age >= 19 && !this.echoesSeen.has(19)) {
      this.echoesSeen.add(19);
      hud.toast('刘晓芸来信了：有空回学校看看。');
      if (!this.tags.includes('老师的信')) this.tags.push('老师的信');
    }
    if (player.age >= 30 && !this.echoesSeen.has(30)) {
      this.echoesSeen.add(30);
      hud.toast('老同学约你参加同学会。');
      if (!this.tags.includes('同学会')) this.tags.push('同学会');
    }
    if (player.age >= 60 && !this.echoesSeen.has(60)) {
      this.echoesSeen.add(60);
      hud.toast('学校校庆，邀请你回去看看。');
      if (!this.tags.includes('校庆')) this.tags.push('校庆');
    }
  }

  reportLines(): string[] {
    return SUBJECTS.map((s) => `${s} ${Math.round(this.subjects[s] ?? 60)}`);
  }

  // ---- 存档 ----

  snapshot(): SchoolSnapshot {
    return {
      attended: this.attended,
      missed: this.missed,
      keyClassesToday: this.keyClassesToday,
      lastDay: this.lastDay,
      subjects: { ...this.subjects },
      notes: this.notes,
      lastScore: this.lastScore,
      lastSubject: this.lastSubject,
      lateCount: this.lateCount,
      gradeTag: this.gradeTag,
      recommendation: this.recommendation,
      graduated: this.graduated,
      friends: this.friends,
      lastExamAge: this.lastExamAge,
      lastExamCorrect: this.lastExamCorrect,
      lastExamTotal: this.lastExamTotal,
      xueshenUntil: this.xueshenUntil,
      examDueDay: this.examDueDay,
      studentNo: this.studentNo,
      echoesSeen: [...this.echoesSeen],
      tags: [...this.tags],
    };
  }

  restore(s: SchoolSnapshot): void {
    this.attended = s.attended ?? 0;
    this.missed = s.missed ?? 0;
    this.keyClassesToday = s.keyClassesToday ?? 0;
    this.lastDay = s.lastDay ?? -1;
    this.subjects = { ...this.subjects, ...(s.subjects ?? {}) };
    this.notes = s.notes ?? 0;
    this.lastScore = s.lastScore ?? 72;
    this.lastSubject = s.lastSubject ?? '数学';
    this.lateCount = s.lateCount ?? 0;
    this.gradeTag = s.gradeTag ?? 'B';
    this.recommendation = !!s.recommendation;
    this.graduated = !!s.graduated;
    this.friends = s.friends ?? 0;
    this.lastExamAge = s.lastExamAge ?? -1;
    this.lastExamCorrect = s.lastExamCorrect ?? 0;
    this.lastExamTotal = s.lastExamTotal ?? 0;
    this.xueshenUntil = s.xueshenUntil ?? -1;
    this.examDueDay = s.examDueDay ?? -1;
    this.studentNo = s.studentNo ?? '';
    this.echoesSeen = new Set(s.echoesSeen ?? []);
    this.tags.length = 0;
    this.tags.push(...(s.tags ?? []));
  }
}

/** 存档快照：学校档案 */
export interface SchoolSnapshot {
  attended: number;
  missed: number;
  keyClassesToday: number;
  lastDay: number;
  subjects: Record<string, number>;
  notes: number;
  lastScore: number;
  lastSubject: string;
  lateCount: number;
  gradeTag: GradeTag;
  recommendation: boolean;
  graduated: boolean;
  friends: number;
  lastExamAge: number;
  lastExamCorrect: number;
  lastExamTotal: number;
  xueshenUntil: number;
  examDueDay: number;
  studentNo: string;
  echoesSeen: number[];
  tags: string[];
}
