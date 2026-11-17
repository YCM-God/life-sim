// 期末考试题库：按年龄段分三档，每年考一次，每次随机抽 10 道选择题（4 选 1）
// 分档（与「年级」一致）：
//   小学 6~12 岁 · 初中 13~15 岁 · 高中 16~18 岁
// 正确率 ≥80%（10 题对 8 题及以上）→ 学神称号（星星标，维持 2 年）
export type ExamLevel = 'elementary' | 'middle' | 'high';

export interface ExamQuestion {
  q: string;
  options: string[]; // 固定 4 项
  answer: number;    // 正确答案下标 0..3（抽题时会打乱选项并重算下标）
}

const ELEMENTARY: ExamQuestion[] = [
  { q: '1 + 1 = ?', options: ['1', '2', '3', '4'], answer: 1 },
  { q: '5 × 6 = ?', options: ['11', '25', '30', '35'], answer: 2 },
  { q: '汉字「山」一共有几画？', options: ['2', '3', '4', '5'], answer: 1 },
  { q: '「苹果」用英文怎么说？', options: ['apple', 'banana', 'orange', 'grape'], answer: 0 },
  { q: '一年有多少个月？', options: ['10', '11', '12', '13'], answer: 2 },
  { q: '太阳从哪个方向升起？', options: ['西边', '东边', '南边', '北边'], answer: 1 },
  { q: '3 × 8 = ?', options: ['18', '21', '24', '27'], answer: 2 },
  { q: '最大的个位数是？', options: ['7', '8', '9', '10'], answer: 2 },
  { q: '一周有几天？', options: ['5', '6', '7', '8'], answer: 2 },
  { q: '水在多少摄氏度会结冰？', options: ['100°C', '50°C', '0°C', '−10°C'], answer: 2 },
  { q: '中国的首都是？', options: ['上海', '广州', '北京', '深圳'], answer: 2 },
  { q: '「小狗」用英文怎么说？', options: ['cat', 'dog', 'bird', 'fish'], answer: 1 },
];

const MIDDLE: ExamQuestion[] = [
  { q: '勾股定理的表达式是？', options: ['a²+b²=c²', 'a+b=c', 'a²−b²=c²', 'ab=c²'], answer: 0 },
  { q: '水的化学式是？', options: ['CO₂', 'H₂O', 'O₂', 'NaCl'], answer: 1 },
  { q: '绿色植物光合作用主要产生？', options: ['二氧化碳', '氮气', '氧气', '氢气'], answer: 2 },
  { q: '牛顿第一定律又称？', options: ['万有引力定律', '惯性定律', '作用反作用定律', '能量守恒定律'], answer: 1 },
  { q: '−5 的绝对值是？', options: ['−5', '0', '5', '1'], answer: 2 },
  { q: '元素周期表中第一个元素是？', options: ['氧', '氢', '碳', '氮'], answer: 1 },
  { q: '人体面积最大的器官是？', options: ['心脏', '肝脏', '皮肤', '肺'], answer: 2 },
  { q: '一次函数 y=kx+b 的图像是？', options: ['抛物线', '直线', '双曲线', '圆'], answer: 1 },
  { q: '「important」的中文意思是？', options: ['困难的', '重要的', '有趣的', '容易的'], answer: 1 },
  { q: '等腰三角形的两个底角？', options: ['相等', '互余', '互补', '不确定'], answer: 0 },
  { q: '长江最终流入哪个海？', options: ['渤海', '黄海', '东海', '南海'], answer: 2 },
  { q: '我国古代四大发明不包括？', options: ['造纸术', '指南针', '火药', '地动仪'], answer: 3 },
];

const HIGH: ExamQuestion[] = [
  { q: 'sin²θ + cos²θ = ?', options: ['0', '1', '2', 'θ'], answer: 1 },
  { q: '重力加速度 g 约为？', options: ['9.8 m/s²', '1 m/s²', '98 m/s²', '0.98 m/s²'], answer: 0 },
  { q: 'DNA 的中文全称是？', options: ['核糖核酸', '脱氧核糖核酸', '氨基酸', '蛋白质'], answer: 1 },
  { q: 'd(x²)/dx = ?', options: ['x', '2x', 'x²', '2'], answer: 1 },
  { q: '细胞有氧呼吸的主要场所是？', options: ['细胞核', '线粒体', '核糖体', '高尔基体'], answer: 1 },
  { q: '万有引力定律的提出者是？', options: ['爱因斯坦', '伽利略', '牛顿', '开普勒'], answer: 2 },
  { q: '中国近代史的开端是？', options: ['辛亥革命', '鸦片战争', '五四运动', '洋务运动'], answer: 1 },
  { q: '元素周期律的发现者是？', options: ['拉瓦锡', '门捷列夫', '道尔顿', '玻尔'], answer: 1 },
  { q: '「photosynthesis」的意思是？', options: ['光合作用', '呼吸作用', '渗透作用', '蒸腾作用'], answer: 0 },
  { q: '相对论的提出者是？', options: ['普朗克', '玻尔', '爱因斯坦', '海森堡'], answer: 2 },
  { q: '化学平衡的特征是？', options: ['反应停止', '动态平衡', '只有正反应', '只有逆反应'], answer: 1 },
  { q: '函数 y = eˣ 的导数是？', options: ['eˣ', 'x·eˣ', '1/eˣ', 'ln x'], answer: 0 },
];

const BANKS: Record<ExamLevel, ExamQuestion[]> = {
  elementary: ELEMENTARY,
  middle: MIDDLE,
  high: HIGH,
};

/** 学龄分档；不在学龄（<6 或 >18）返回 null */
export function levelForAge(age: number): ExamLevel | null {
  if (age >= 6 && age <= 12) return 'elementary';
  if (age >= 13 && age <= 15) return 'middle';
  if (age >= 16 && age <= 18) return 'high';
  return null;
}

export function levelName(level: ExamLevel): string {
  if (level === 'elementary') return '小学';
  if (level === 'middle') return '初中';
  return '高中';
}

/** 从对应年龄段题库随机抽 10 题，并打乱每题选项（重算正确答案下标） */
export function sampleExam(age: number): ExamQuestion[] {
  const level = levelForAge(age);
  if (!level) return [];
  const picked = [...BANKS[level]].sort(() => Math.random() - 0.5).slice(0, 10);
  return picked.map((q) => {
    const correctText = q.options[q.answer];
    const order = q.options.map((_, i) => i).sort(() => Math.random() - 0.5);
    const options = order.map((i) => q.options[i]);
    return { q: q.q, options, answer: options.indexOf(correctText) };
  });
}
