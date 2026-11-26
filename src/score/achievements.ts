// 成就表（38 个）：id 一经发布不得改名（存档里存的是 id）
// 解锁条件全部写成 ScoreFacts 的纯函数，因此读档后能重新判定，也能给旧档补发。
// 一旦解锁永不撤销（即使条件后来不成立，例如好感掉了）。
import type { AchievementDef, ScoreFacts } from './types';

const SUBJECT_KEYS = ['语文', '数学', '英语', '科学'] as const;

function subjectValues(f: ScoreFacts): number[] {
  return SUBJECT_KEYS.map((s) => f.school.subjects[s] ?? 0);
}

function peakAtLeast(f: ScoreFacts, n: number): boolean {
  return Object.values(f.peaks).some((v) => v >= n);
}

function peakCountAtLeast(f: ScoreFacts, n: number): number {
  return Object.values(f.peaks).filter((v) => v >= n).length;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ---------- 友情（12） ----------
  {
    id: 'friend_tier_1',
    name: '点头之交',
    desc: '友情分第 1 阶',
    dim: 'friend',
    bonus: 10,
    test: (f) => f.dims.friend >= 20,
  },
  {
    id: 'friend_tier_2',
    name: '熟面孔',
    desc: '友情分第 2 阶',
    dim: 'friend',
    bonus: 20,
    test: (f) => f.dims.friend >= 60,
  },
  {
    id: 'friend_tier_3',
    name: '街坊朋友',
    desc: '友情分第 3 阶',
    dim: 'friend',
    bonus: 30,
    test: (f) => f.dims.friend >= 120,
  },
  {
    id: 'friend_tier_4',
    name: '知心人',
    desc: '友情分第 4 阶',
    dim: 'friend',
    bonus: 40,
    test: (f) => f.dims.friend >= 200,
  },
  {
    id: 'friend_tier_5',
    name: '知交满巷',
    desc: '友情分第 5 阶：这条街上，到处是记得你的人',
    dim: 'friend',
    bonus: 80,
    test: (f) => f.dims.friend >= 320,
  },
  {
    id: 'friend_tier_6',
    name: '一呼百应',
    desc: '友情分第 6 阶',
    dim: 'friend',
    bonus: 100,
    test: (f) => f.dims.friend >= 480,
  },
  {
    id: 'friend_tier_7',
    name: '人间值得',
    desc: '友情分第 7 阶',
    dim: 'friend',
    bonus: 150,
    test: (f) => f.dims.friend >= 700,
  },
  {
    id: 'first_friend',
    name: '第一个朋友',
    desc: '和某位居民的好感第一次到 3 心',
    dim: 'friend',
    bonus: 20,
    test: (f) => peakAtLeast(f, 3),
  },
  {
    id: 'soulmate',
    name: '挚友',
    desc: '和某位居民的好感到 5 心',
    dim: 'friend',
    bonus: 40,
    test: (f) => peakAtLeast(f, 5),
  },
  {
    id: 'good_neighbors',
    name: '好街坊',
    desc: '5 位居民好感曾到 3 心',
    dim: 'friend',
    bonus: 50,
    test: (f) => peakCountAtLeast(f, 3) >= 5,
  },
  {
    id: 'secret_keeper',
    name: '秘密守护人',
    desc: '揭开 5 位居民的秘密',
    dim: 'friend',
    bonus: 50,
    test: (f) => f.secretCount >= 5,
  },
  {
    id: 'deskmate',
    name: '同桌的你',
    desc: '和同桌蒋一鸣的好感到 4 心',
    dim: 'friend',
    bonus: 30,
    test: (f) => (f.peaks['jym'] ?? 0) >= 4,
  },

  // ---------- 学业（13） ----------
  {
    id: 'study_tier_1',
    name: '开蒙',
    desc: '学业分第 1 阶',
    dim: 'study',
    bonus: 10,
    test: (f) => f.dims.study >= 20,
  },
  {
    id: 'study_tier_2',
    name: '用功',
    desc: '学业分第 2 阶',
    dim: 'study',
    bonus: 20,
    test: (f) => f.dims.study >= 80,
  },
  {
    id: 'study_tier_3',
    name: '优等生',
    desc: '学业分第 3 阶',
    dim: 'study',
    bonus: 30,
    test: (f) => f.dims.study >= 180,
  },
  {
    id: 'study_tier_4',
    name: '学霸',
    desc: '学业分第 4 阶',
    dim: 'study',
    bonus: 50,
    test: (f) => f.dims.study >= 320,
  },
  {
    id: 'study_tier_5',
    name: '学神之路',
    desc: '学业分第 5 阶',
    dim: 'study',
    bonus: 80,
    test: (f) => f.dims.study >= 500,
  },
  {
    id: 'study_tier_6',
    name: '状元之才',
    desc: '学业分第 6 阶',
    dim: 'study',
    bonus: 120,
    test: (f) => f.dims.study >= 750,
  },
  {
    id: 'first_class',
    name: '第一堂课',
    desc: '上完人生第一节课',
    dim: 'study',
    bonus: 10,
    test: (f) => f.counters.classes >= 1,
  },
  {
    id: 'xueshen',
    name: '学神',
    desc: '一次期末考试正确率 ≥80%',
    dim: 'study',
    bonus: 40,
    test: (f) => f.bestExam.total > 0 && f.bestExam.ratio >= 0.8,
  },
  {
    id: 'perfect_exam',
    name: '满分卷',
    desc: '期末考试全对',
    dim: 'study',
    bonus: 60,
    test: (f) => f.bestExam.correct > 0 && f.bestExam.correct === f.bestExam.total,
  },
  {
    id: 'top_subject',
    name: '偏科天才',
    desc: '任一科目掌握度 ≥90',
    dim: 'study',
    bonus: 40,
    test: (f) => Math.max(...subjectValues(f)) >= 90,
  },
  {
    id: 'all_round',
    name: '全面发展',
    desc: '语数英科四科都 ≥80',
    dim: 'study',
    bonus: 60,
    test: (f) => Math.min(...subjectValues(f)) >= 80,
  },
  {
    id: 'grad_a',
    name: '优秀毕业生',
    desc: '以 A 档毕业',
    dim: 'study',
    bonus: 60,
    test: (f) => f.school.graduated && f.school.gradeTag === 'A',
  },
  {
    id: 'recommended',
    name: '教师推荐',
    desc: '毕业时拿到教师推荐',
    dim: 'study',
    bonus: 30,
    test: (f) => f.school.recommendation,
  },

  // ---------- 勤勉（6） ----------
  {
    id: 'quest_first',
    name: '初出茅庐',
    desc: '完成第一件任务',
    dim: 'diligence',
    bonus: 10,
    test: (f) => f.counters.questsDone >= 1,
  },
  {
    id: 'quest_30',
    name: '热心肠',
    desc: '累计完成 30 件任务（含重复）',
    dim: 'diligence',
    bonus: 50,
    test: (f) => f.counters.questsDone >= 30,
  },
  {
    id: 'chores_50',
    name: '生活家',
    desc: '累计完成 50 件日常琐事',
    dim: 'diligence',
    bonus: 50,
    test: (f) => f.counters.dailyDone >= 50,
  },
  {
    id: 'main_story',
    name: '人生主线',
    desc: '完成 10 个不同的主线任务',
    dim: 'diligence',
    bonus: 80,
    test: (f) => f.counters.mainDistinct >= 10,
  },
  {
    id: 'first_pay',
    name: '第一份工资',
    desc: '完成「第一份工作」或「月底的班」',
    dim: 'diligence',
    bonus: 30,
    test: (f) =>
      f.questsCompleted.includes('main-first-job') || f.questsCompleted.includes('adult-main-paycheck'),
  },
  {
    id: 'diligence_tier_3',
    name: '劳模',
    desc: '勤勉分第 3 阶（≥1000）',
    dim: 'diligence',
    bonus: 80,
    test: (f) => f.dims.diligence >= 1000,
  },

  // ---------- 健康（3） ----------
  {
    id: 'cured_first',
    name: '病去如抽丝',
    desc: '第一次把病治好',
    dim: 'health',
    bonus: 10,
    test: (f) => f.counters.cured >= 1,
  },
  {
    id: 'crisis_survivor',
    name: '鬼门关前',
    desc: '挺过一次病危',
    dim: 'health',
    bonus: 30,
    hidden: true,
    hint: '有些夜晚，你差点没挺过去……',
    test: (f) => f.counters.crisis >= 1,
  },
  {
    id: 'early_to_bed',
    name: '规律作息',
    desc: '累计在家睡 30 晚',
    dim: 'health',
    bonus: 30,
    test: (f) => f.counters.rests >= 30,
  },

  // ---------- 阅历（4） ----------
  {
    id: 'explorer',
    name: '走遍小城',
    desc: '到过全部 9 个区域',
    dim: 'exp',
    bonus: 40,
    test: (f) => f.regionCount >= 9,
  },
  {
    id: 'adult',
    name: '成年了',
    desc: '活到 18 岁',
    dim: 'exp',
    bonus: 10,
    test: (f) => f.age >= 18,
  },
  {
    id: 'sixty',
    name: '花甲',
    desc: '活到 60 岁',
    dim: 'exp',
    bonus: 30,
    test: (f) => f.age >= 60,
  },
  {
    id: 'centenarian',
    name: '百岁人生',
    desc: '活到 100 岁',
    dim: 'exp',
    bonus: 100,
    test: (f) => f.age >= 100,
  },
];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);
