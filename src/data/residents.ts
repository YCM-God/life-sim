// 居民区 20 名核心居民的人物卡数据（模板见《居民设定规范》）
// 差异化五维：年龄段 / 职业 / 性格（行为化标签）/ 外观轮廓+配饰 / 说话方式
// 日程锚点全部落在动线热点（学校门口 / 门岗 / 居民纵街 / 主街 / 滨河步道 / 滨河路）
import type { Appearance } from '../entities/player';

export type SpeechStyle = 'command' | 'nag' | 'precise' | 'internet' | 'literary' | 'loud';
export type Accessory = 'hat' | 'apron' | 'radio' | 'headphones' | 'bag' | 'timer' | 'none';

export interface ResidentLook extends Appearance {
  scale?: number;       // 体型：0.85 孩童 / 0.9 佝偻 / 1.05+ 壮硕
  accessory?: Accessory;
}

// 日程段：from→to 为游戏小时（支持跨天 22→6），锚点 x,y（Tile 坐标）
// patrol 给出则该时段沿 waypoint 巡逻，否则在锚点半径 r 内游荡
export interface ScheduleSeg {
  from: number;
  to: number;
  x: number;
  y: number;
  r?: number;
  patrol?: [number, number][];
}

export interface ResidentDef {
  id: string;
  name: string;
  age: number;
  job: string;
  home: string;               // 建筑 id（归家锚点）
  look: ResidentLook;
  tags: string[];             // 性格三标签（可观察行为）
  speech: SpeechStyle;
  catchphrase: string;
  secret: { threshold: number; hook: string; reveal: string };
  relationLine: string;       // 与玩家的关系线：他需要什么 / 能给什么
  schedule: ScheduleSeg[];
  gifts: { like: string[]; neutral: string[]; dislike: string };
  lines: {
    greet: string;
    greetWarm: string;
    greetCold: string;
    streak: string;           // 连续 5 天到访彩蛋
    chat: string[];           // 3 条日常
    giftLike: string;
    giftNeutral: string;
    giftDislike: string;
  };
}

export const GIFT_ITEMS = ['热茶', '鲜花', '零食', '旧书'] as const;

export const RESIDENTS: ResidentDef[] = [
  {
    id: 'wjg', name: '王建国', age: 62, job: '退休钳工', home: 'h1',
    look: { shirt: '#5a6470', pants: '#424a55', hair: '#8a8f98', longHair: false, scale: 0.95, accessory: 'hat' },
    tags: ['每天 5:50 准时敲树干打卡晨练', '捡纸箱必须压平码齐才肯扔', '谁占了他的健身器材位置能记一礼拜'],
    speech: 'command', catchphrase: '这位置我占了。',
    secret: {
      threshold: 5, hook: '每天清晨六点半，天台上总有个老头对着手机念" Karen 的眼眸"——',
      reveal: '你撞破了：王建国在用手机写言情小说，笔名"月下老钳"，已经更到第 44 章。"……你敢告诉别人，这位置你这辈子别想用。"',
    },
    relationLine: '他需要有人帮他赶走霸占健身器材的蒋一鸣；他能教你辨认全小区谁家的纸箱最压手。',
    schedule: [
      { from: 5, to: 8, x: 236, y: 53, r: 2 },        // 晨练角（早餐店西侧空地）
      { from: 8, to: 17, x: 173, y: 38, r: 2 },        // 林家门口（晒太阳）
      { from: 17, to: 22, x: 300, y: 91, r: 3 },       // 主街人行道（遛弯）
      { from: 22, to: 5, x: 173, y: 37, r: 1 },        // 归家
    ],
    gifts: { like: ['热茶', '旧书'], neutral: ['零食'], dislike: '鲜花' },
    lines: {
      greet: '让让。这位置我占了。',
      greetWarm: '来了？帮我把那个纸箱压一下。……手脚比上回利索了。',
      greetCold: '哼。还知道露面。',
      streak: '你怎么天天来？……坐吧，位置给你留的。',
      chat: [
        '晨练器材的事，我跟那小胖子没完。你帮我去说说。',
        '纸箱要压平，码齐，扎两道。这是规矩。',
        '赵铁柱那盘棋，我让他车马炮。他敢赢我？',
      ],
      giftLike: '嗯，懂规矩。放那儿吧。',
      giftNeutral: '……行，我收下了。',
      giftDislike: '拿走。占地方。',
    },
  },
  {
    id: 'lxl', name: '李秀兰', age: 58, job: '退休纺织工', home: 'h2',
    look: { shirt: '#b8663c', skirt: '#8a5a3c', pants: '#e8b88a', hair: '#6e5a4a', longHair: true, scale: 0.95, accessory: 'bag' },
    tags: ['买菜能为三毛钱折返两次', '把临期食品撕了标签重新贴', '每天给儿媳朋友圈点赞但从不去她家串门'],
    speech: 'nag', catchphrase: '我说得对不对？',
    secret: {
      threshold: 3, hook: '她为三毛钱能走二里地，买上千块的"保健床垫"却眼睛不眨——',
      reveal: '她压低声音：自己的"棺材本"其实每月都在悄悄打给儿子还房贷。"可不敢让秀兰知道"——她自己就是秀兰。嘴一捂："你就当没听见，啊？"',
    },
    relationLine: '她需要有人陪她逛早市拎菜；她能给你讲全小区的家长里短（情报站）。',
    schedule: [
      { from: 6, to: 10, x: 239, y: 52, r: 2 },        // 早餐店前"菜市场"
      { from: 10, to: 14, x: 329, y: 56, r: 2 },       // 苏家门口
      { from: 14, to: 19, x: 76, y: 86, r: 2 },        // 公园广场（麻将）
      { from: 19, to: 6, x: 329, y: 55, r: 1 },        // 归家
    ],
    gifts: { like: ['零食', '鲜花'], neutral: ['热茶'], dislike: '旧书' },
    lines: {
      greet: '哟，是你啊。吃了没？我说得对不对？',
      greetWarm: '来来来，刚炒的瓜子。你这孩子，越来越招人疼了。',
      greetCold: '……有些人啊，说话跟放屁似的。',
      streak: '天天来，比我儿子都勤。他要是有你一半……',
      chat: [
        '昨天豆腐脑涨了两毛，两毛！这日子没法过了。',
        '我儿媳妇发朋友圈，带孩子去海边。海有什么好看的，啊？',
        '小周那个对象，吹了。你别说是我说的。',
      ],
      giftLike: '哎哟！这得不少钱吧？……我收下了啊。',
      giftNeutral: '还行还行，你有心了。',
      giftDislike: '这……字太多，我看不来这个。',
    },
  },
  {
    id: 'zxm', name: '张小米', age: 8, job: '小学二年级', home: 'h2',
    look: { shirt: '#e8c84a', pants: '#4a6a9a', hair: '#1a1814', longHair: false, scale: 0.85, accessory: 'none' },
    tags: ['下课趴花坛翻石头找西瓜虫', '把硬币埋进树下想"种"出钱', '答应的事三分钟就忘'],
    speech: 'command', catchphrase: '明天我请你吃辣条！',
    secret: {
      threshold: 3, hook: '他每周五下午都蹲在学校花坛边挖土，像只囤粮的仓鼠——',
      reveal: '他给你看了树下的铁盒：一张画、一颗玻璃珠、一封写给十年后自己的信。"你要保密！拉钩上吊，一百年！"',
    },
    relationLine: '他需要大朋友帮他挖时间胶囊（需要小铲子）；他能带你找到全小区最甜的桑葚树。',
    schedule: [
      { from: 7, to: 16, x: 93, y: 40, r: 3 },         // 学校门口花坛
      { from: 16, to: 20, x: 329, y: 57, r: 3 },       // 家院子
      { from: 20, to: 7, x: 329, y: 55, r: 1 },        // 归家睡觉
    ],
    gifts: { like: ['零食', '鲜花'], neutral: ['热茶'], dislike: '旧书' },
    lines: {
      greet: '你有没有看到我的虫子？它越狱了！',
      greetWarm: '你来啦！我留了半包辣条给你，就半包！',
      greetCold: '我妈说不能理说话不算话的大人。',
      streak: '你天天来，是不是想当我大哥？……行吧！',
      chat: [
        '我埋的硬币都三天了，怎么还不发芽？',
        '唐晓棠是告状精，你别跟她玩。',
        '我长大要当奥特曼，真的，我练习过了。',
      ],
      giftLike: '哇！！你是我最好的朋友！明天我请你吃辣条！',
      giftNeutral: '哦……还行吧。',
      giftDislike: '这是啥啊，我们老师才看这个。',
    },
  },
  {
    id: 'cdw', name: '陈大伟', age: 35, job: '快递站站长', home: 'h3',
    look: { shirt: '#d8a24a', pants: '#3a3f4a', hair: '#1a1814', longHair: false, scale: 1.05, accessory: 'none' },
    tags: ['记得全小区人的网购昵称', '雨雪天把包裹扛上六楼也不放驿站', '从不参加聚餐，说"要盯店"'],
    speech: 'precise', catchphrase: '三点前到。',
    secret: {
      threshold: 4, hook: '所有需要学历认证的招聘传单，他都退回去，说"用不上"——',
      reveal: '他点了根烟，半天：大专，大三退的学，简历上写的是本科。"包裹不会查我学历。人嘛……迟早要还。"',
    },
    relationLine: '他需要有人夜班替他守两小时店（他想去看一个人）；他能给你留最新鲜的到货情报。',
    schedule: [
      { from: 7, to: 20, x: 377, y: 66, r: 2 },        // 快递站
      { from: 20, to: 7, x: 207, y: 78, r: 1 },        // 陈家
    ],
    gifts: { like: ['零食', '热茶'], neutral: ['旧书'], dislike: '鲜花' },
    lines: {
      greet: '取件？报名字。……三点前到。',
      greetWarm: '来了。你的件我放最外层了，省得你等。',
      greetCold: '……件在那边，自己找。',
      streak: '你最近天天来。要不……帮我盯两小时店？',
      chat: [
        '6 栋那个"悬崖上的金鱼姬"，又买了三箱猫砂。',
        '谢婉婷那个花店，寄件率比收件率高。怪。',
        '驿站是死的，人是活的。所以我不开驿站。',
      ],
      giftLike: '讲究。放这儿，我值班的时候用。',
      giftNeutral: '谢了。放架子上吧。',
      giftDislike: '花？……帮我转给窗台那排吧，它们需要。',
    },
  },
  {
    id: 'lxy', name: '刘晓芸', age: 28, job: '小学班主任', home: 'h4',
    look: { shirt: '#7a9a5a', skirt: '#5a7a4a', pants: '#e8b88a', hair: '#3a2a1c', longHair: true, scale: 1, accessory: 'bag' },
    tags: ['放学站门口数人头，一个不能少', '家长群秒回，周末装死', '抽屉里常备润喉糖和金嗓子'],
    speech: 'precise', catchphrase: '首先，作业。',
    secret: {
      threshold: 5, hook: '她周末总"加班"，可学校周末根本不开灯——',
      reveal: '办公室台灯下摊着行测卷子，她苦笑：编制考了三年，没上岸。"别告诉孩子。老师要是考不上，他们以后拿什么信我？"',
    },
    relationLine: '她需要有人帮她盯放学后的值日；她能告诉你每个孩子的家庭底细（情报）。',
    schedule: [
      { from: 7, to: 18, x: 93, y: 38, r: 2 },         // 学校门口（接送+看班）
      { from: 18, to: 22, x: 96, y: 39, r: 1 },        // 办公室（"加班"）
      { from: 22, to: 7, x: 493, y: 167, r: 1 },       // 河景公寓
    ],
    gifts: { like: ['热茶', '旧书'], neutral: ['鲜花'], dislike: '零食' },
    lines: {
      greet: '你好。首先，作业写完了吗？……开玩笑的。',
      greetWarm: '你来啦。坐，批完这摞卷子就聊。',
      greetCold: '……我最近很忙，长话短说。',
      streak: '你天天来，比我男朋友都准时。哦，我没有男朋友。',
      chat: [
        '张小米上周把青蛙带进了教室。首先，青蛙很乖。其次，不行。',
        '韩梅梅家那位奶奶，比家长会上所有问题都难答。',
        '我和婉婷约好，谁先辞职就合伙开花店。估计是我先。',
      ],
      giftLike: '太贴心了。……学生们都没你懂事。',
      giftNeutral: '谢谢，放桌上吧。',
      giftDislike: '糖分太高，老师的嗓子经不起第二回了。',
    },
  },
  {
    id: 'ztz', name: '赵铁柱', age: 45, job: '小区保安', home: 'h1',
    look: { shirt: '#2e3a4a', pants: '#232a35', hair: '#1a1814', longHair: false, scale: 1.05, accessory: 'radio' },
    tags: ['记得每辆车对应哪个车主', '夜里巡逻会绕开花坛边的猫', '收到业主土特产必回赠自家种的葱'],
    speech: 'loud', catchphrase: '这好比说——',
    secret: {
      threshold: 5, hook: '他巡逻时总对着业主背影发呆，嘴里念念有词——',
      reveal: '值班室抽屉深处是画满格子的本子：《门岗日记》，全小区都是漫画人物，连载三年了。"这好比说，我是这里的史官。"',
    },
    relationLine: '他需要有人给他当"模特"（画进漫画）；他能放你进任何一栋楼的门禁。',
    schedule: [
      { from: 7, to: 19, x: 248, y: 55, r: 0, patrol: [[240, 55], [262, 55], [262, 46], [240, 46]] },
      { from: 19, to: 7, x: 255, y: 54, r: 1 },        // 夜班门岗
    ],
    gifts: { like: ['热茶', '零食'], neutral: ['旧书'], dislike: '鲜花' },
    lines: {
      greet: '站住——哦，是你啊。这好比说，下次先打招呼。',
      greetWarm: '来了？今天小区太平，就郑好又贴了三张广告。',
      greetCold: '……登记。姓名，来访事由。',
      streak: '你天天来，比我巡逻还准点。要不要考虑加入我们？',
      chat: [
        '郑好的广告，我见一张撕一张。这好比说，道高一尺。',
        '3 栋那只橘猫，我巡逻绕开它，它也绕开我。默契。',
        '王建国下棋耍赖，我画下来了，第 214 页。',
      ],
      giftLike: '哎！这怎么好意思……下回给你带我家葱！',
      giftNeutral: '成，放岗亭里。',
      giftDislike: '阿嚏！……快拿开，我对这个过敏。',
    },
  },
  {
    id: 'sqx', name: '孙倩倩', age: 23, job: '便利店夜班店员', home: 'h4',
    look: { shirt: '#8a7ab8', pants: '#3a3a4a', hair: '#4a2a3c', longHair: true, scale: 0.95, accessory: 'none' },
    tags: ['给临期饭团贴"快吃掉我"的便签', '凌晨两点给流浪猫留饭团', '被顾客吼完，转身能对下一个微笑'],
    speech: 'nag', catchphrase: '欢迎光临～',
    secret: {
      threshold: 4, hook: '她的参考书永远只有同一本，翻到卷边，却从没换过——',
      reveal: '她趴在收银台上小声说：考研，第三次了，没考上。跟家里说在备考公务员。"关东煮……要吗？这个秘密就当抵账了。"',
    },
    relationLine: '她凌晨的便利店是黑夜唯一能说话的地方；她能给你留临期饭团（+体力道具）。',
    schedule: [
      { from: 6, to: 14, x: 493, y: 167, r: 1 },       // 河景公寓（睡觉）
      { from: 14, to: 22, x: 340, y: 138, r: 3 },      // 滨河步道（散心）
      { from: 22, to: 6, x: 330, y: 91, r: 1 },        // 便利店夜班
    ],
    gifts: { like: ['零食', '热茶'], neutral: ['鲜花'], dislike: '旧书' },
    lines: {
      greet: '欢迎光临～……哦，是你呀。',
      greetWarm: '你来啦！饭团我给你留了，芥末味的那个。',
      greetCold: '……欢迎光临。',
      streak: '你天天来，我都给你留习惯了。要不办张卡？我亲手画的那种。',
      chat: [
        '凌晨两点到四点最难熬。猫比人会聊天。',
        '有个程序员，每天十一点来买关东煮，就拿一串。怪可怜的。',
        '我妈问我公务员考得怎么样。我说，挺好的，货架摆得很整齐。',
      ],
      giftLike: '哇……你怎么知道我喜欢这个！谢谢你哦！',
      giftNeutral: '谢谢啦～放这边就好。',
      giftDislike: '这个……我大概只能摆在货架上了。',
    },
  },
  {
    id: 'zwb', name: '周文斌', age: 31, job: '程序员', home: 'h4',
    look: { shirt: '#6e7a8a', check: '#4a5568', pants: '#2b2f3a', hair: '#1a1814', longHair: false, scale: 1, accessory: 'headphones' },
    tags: ['加班到十点回小区放轻脚步', '在电梯里排练跟邻居打招呼但从未开口', '理财表做到了 2029 年'],
    speech: 'precise', catchphrase: '我是说……',
    secret: {
      threshold: 5, hook: '他午饭永远是馒头，理财表却精确到 2029 年——',
      reveal: '他盯着关东煮看了很久：二十八万，借给前女友创业了，欠条锁在公司抽屉。"我是说……人总要信点什么。你别学我。"',
    },
    relationLine: '他需要有人帮他把一句话转交给孙倩倩（他不敢）；他能教你做 Excel 表（小游戏加成）。',
    schedule: [
      { from: 6, to: 9, x: 493, y: 167, r: 1 },        // 公寓（挣扎起床）
      { from: 9, to: 22, x: 452, y: 36, r: 1 },        // 星辰大厦（加班）
      { from: 22, to: 6, x: 330, y: 91, r: 1 },        // 便利店（23 点关东煮）
    ],
    gifts: { like: ['热茶', '旧书'], neutral: ['零食'], dislike: '鲜花' },
    lines: {
      greet: '啊……你好。我是说，你好。',
      greetWarm: '来了？我、我给你占了……不是，我是说，巧啊。',
      greetCold: '……（他假装在看货架标签）',
      streak: '你天天这个点来。我是说……我也天天这个点来。',
      chat: [
        '关东煮我只拿一串。拿两串，她会多看我一眼。……这是数学。',
        '电梯里我排练过十七种开场白。第十八种还没想好。',
        '钱的事你放心，我的钱都很安全。……非常安全。',
      ],
      giftLike: '这、这太贵重了……我是说，谢谢！',
      giftNeutral: '啊，谢谢。我、我会用的。',
      giftDislike: '花……她是卖花的反义词，你是知道的吧。',
    },
  },
  {
    id: 'wgf', name: '吴桂芳', age: 70, job: '独居老人', home: 'h4',
    look: { shirt: '#8a8f7a', pants: '#6a6255', hair: '#c9c4b8', longHair: true, scale: 0.9, accessory: 'bag' },
    tags: ['每天给亡夫的照片擦灰', '管她的猫叫"老头子"', '收纸板只收整点的、能扎成捆的'],
    speech: 'nag', catchphrase: '我家老头子以前……',
    secret: {
      threshold: 5, hook: '她总对着猫念信，而猫的名字，是个陌生的男人名——',
      reveal: '她摸着猫背，半天：猫叫"守义"，四十年前的一封信，她没敢寄，他也没敢回。"现在天天念给他听。他就在这儿听着呢。"（林守义恰好路过，没停步。）',
    },
    relationLine: '她需要有人帮她念信上的新字（她眼花了）；她能给你讲四十年前这座城的样子（世界观情报）。',
    schedule: [
      { from: 5, to: 11, x: 340, y: 137, r: 2 },       // 滨河步道长椅
      { from: 11, to: 15, x: 493, y: 167, r: 1 },      // 河景公寓（喂猫）
      { from: 15, to: 20, x: 340, y: 138, r: 2 },      // 长椅（念信）
      { from: 20, to: 5, x: 493, y: 167, r: 1 },       // 归家
    ],
    gifts: { like: ['热茶', '旧书'], neutral: ['鲜花'], dislike: '零食' },
    lines: {
      greet: '小伙子来啦？我家老头子以前也这个点散步。',
      greetWarm: '哎，你来了。老头子，客人到了，让让。',
      greetCold: '……现在的年轻人啊。',
      streak: '你天天来陪我这个孤老婆子，图什么呢。',
      chat: [
        '这河以前能游泳。我家老头子扎猛子，撞上过水蛇。',
        '手机是雨桐丫头教我的。她说我能学会，我就学会了。',
        '信要慢慢念。念快了，他听不清。',
      ],
      giftLike: '好孩子……老头子你看，现在的小辈多懂事。',
      giftNeutral: '放着吧，我慢慢用。',
      giftDislike: '甜的吃不动了。你们年轻人吃吧。',
    },
  },
  {
    id: 'zh', name: '郑好', age: 26, job: '房产中介', home: 'h4',
    look: { shirt: '#2e8b72', pants: '#3a3f4a', hair: '#1a1814', longHair: false, scale: 0.95, accessory: 'none' },
    tags: ['见谁都递名片，包括送外卖的', '朋友圈一天五条楼市分析', '给老人让路，但顺走别人门口的广告牌'],
    speech: 'internet', catchphrase: '我这边有个资源。',
    secret: {
      threshold: 4, hook: '他给老人让路时，表情总会塌掉半秒——',
      reveal: '他转着打火机：入行第一单，把爸妈的养老房卖了，提成请全店吃了顿好的。"他们现在跟我住。……那单是我这行的毕业考，我满分。"',
    },
    relationLine: '他需要有人帮他在小区里发单页（赵铁柱追你）；他能帮你打听任何一栋房的挂牌价（买房玩法钩子）。',
    schedule: [
      { from: 8, to: 12, x: 253, y: 56, r: 2 },        // 小区门口驻守
      { from: 12, to: 19, x: 300, y: 90, r: 3 },       // 主街扫客
      { from: 19, to: 8, x: 408, y: 94, r: 2 },        // 酒吧（陪客户）
    ],
    gifts: { like: ['零食', '热茶'], neutral: ['旧书'], dislike: '鲜花' },
    lines: {
      greet: '哥！买房吗？不买房也没关系，我这边有个资源——',
      greetWarm: '来了哥！你是我在这个小区唯一的人脉，真的。',
      greetCold: '……哟，贵人终于现身了？',
      streak: '你天天来，是不是考虑置业了？我这边有个资源！',
      chat: [
        '赵铁柱撕我单页？撕吧，我印了 5000 张。',
        '孙倩倩那种姑娘，看不上我们这行。……看得上才怪。',
        '全小区我最羡慕陈大伟。他守的店，进来的都是高兴的。',
      ],
      giftLike: '讲究！回头我帮你留意内部房源！',
      giftNeutral: '有心了有心了。回头帮你留意房源。',
      giftDislike: '花？……行吧，我转送客户，算你一份人情。',
    },
  },
  {
    id: 'fj', name: '冯军', age: 40, job: '早餐店老板', home: 'h1',
    look: { shirt: '#e8e0d0', pants: '#4a4038', hair: '#2a2018', longHair: false, scale: 1.08, accessory: 'apron' },
    tags: ['凌晨三点和面，雷打不动', '给环卫工多舀半勺豆腐脑', '谁剩了超过半杯豆浆，他能念叨一天'],
    speech: 'loud', catchphrase: '一碗豆腐脑——打包！',
    secret: {
      threshold: 5, hook: '老板端碗的站姿，怎么有点像戏台上的亮相——',
      reveal: '凌晨四点半，后厨收音机咿咿呀呀。他年轻时是剧团的武生，翻跟头摔坏了腿。"面要摔够一百下。跟头也是。……听就听了，别鼓掌。"',
    },
    relationLine: '他需要有人帮他看半小时店（他要给剧团老师送年礼）；他的早餐是全天最便宜的心（体力道具）。',
    schedule: [
      { from: 3, to: 13, x: 239, y: 51, r: 2 },        // 冯记早餐
      { from: 13, to: 17, x: 173, y: 38, r: 2 },       // 午休（林家门口下棋观战）
      { from: 17, to: 3, x: 173, y: 37, r: 1 },        // 归家（养嗓）
    ],
    gifts: { like: ['热茶', '零食'], neutral: ['旧书'], dislike: '鲜花' },
    lines: {
      greet: '来了！一碗豆腐脑——打包！',
      greetWarm: '今天豆腐脑多给你半勺！别声张，老曹都没这待遇！',
      greetCold: '……吃啥？店里忙。',
      streak: '你天天来，比我闹钟都准。办张月票吧，给你算便宜。',
      chat: [
        '豆浆剩半杯就是糟蹋。你可不是那种人，对吧？',
        '老曹那份我给他留的，加量。环卫工吃不好，谁扫这条街？',
        '凌晨三点，全城就我和面对话。它比较安静。',
      ],
      giftLike: '好！这个我爱！下顿豆浆免费！',
      giftNeutral: '放后厨吧，谢了。',
      giftDislike: '花不能下锅。……能吃也不行。',
    },
  },
  {
    id: 'hyt', name: '何雨桐', age: 19, job: '大学生（休学中）', home: 'h4',
    look: { shirt: '#5a8a8a', pants: '#3a4a4a', hair: '#2a1a1c', longHair: true, scale: 1, accessory: 'headphones' },
    tags: ['白天在滨河步道背书', '帮全楼老人调手机', '拒绝谈学校，只说"Gap year"'],
    speech: 'internet', catchphrase: '随便啦，whatever。',
    secret: {
      threshold: 5, hook: '所有"回学校看看"的话题，她都会在三秒内岔开——',
      reveal: '她晃着汽水罐，很久：休学，抑郁，药在吉他包夹层。"没瞒住你，行吧。……替我保密，再陪我坐会儿。就坐会儿。"',
    },
    relationLine: '她需要有人陪她干一件"无意义的小事"（如看云一小时）；她能教你用滤镜拍出好看的天（拍照玩法钩子）。',
    schedule: [
      { from: 8, to: 18, x: 300, y: 137, r: 3 },       // 滨河步道（背书）
      { from: 18, to: 8, x: 493, y: 167, r: 1 },       // 河景公寓
    ],
    gifts: { like: ['鲜花', '旧书'], neutral: ['热茶'], dislike: '零食' },
    lines: {
      greet: '哟。随便坐，whatever。',
      greetWarm: '来啦？今天云不错，适合浪费时间。',
      greetCold: '……（她戴上了一只耳机）',
      streak: '你天天来，我都开始期待了。危险信号。',
      chat: [
        'gap year 是gap，不是gap掉的人生。懂不懂？',
        '吴奶奶的手机又乱成一锅粥了。老年人的相册，是个黑洞。',
        '张小米是我弟，亲的。所以我比他爸妈还操心。',
      ],
      giftLike: '哦豁，懂我。谢啦。',
      giftNeutral: '谢了，放着吧。',
      giftDislike: '糖分炸弹，退退退。',
    },
  },
  {
    id: 'jym', name: '蒋一鸣', age: 16, job: '高中生', home: 'h2',
    look: { shirt: '#4a5a9a', pants: '#2b2f3a', hair: '#1a1814', longHair: false, scale: 0.9, accessory: 'headphones' },
    tags: ['钻网吧但必须先写完作业才开机', '帮奶奶把手机字体调到最大', '怕王建国跟怕教导主任一样'],
    speech: 'command', catchphrase: '你懂不懂啊。',
    secret: {
      threshold: 4, hook: '他在网吧从不开游戏，只盯着一个聊天窗口——',
      reveal: '他把屏幕一扣：代练。一个月两千，给奶奶买了血压计，说是奖学金。"你懂不懂啊，这事儿让王建国知道，我能死两次。"',
    },
    relationLine: '他需要有人帮他把数学卷子签字（家长栏）；他能教你三条网吧抢机位的玄学。',
    schedule: [
      { from: 7, to: 17, x: 96, y: 40, r: 2 },         // 学校
      { from: 17, to: 23, x: 360, y: 91, r: 3 },       // 主街（"网吧"线）
      { from: 23, to: 7, x: 329, y: 55, r: 1 },        // 苏家（蹑手蹑脚）
    ],
    gifts: { like: ['零食', '旧书'], neutral: ['热茶'], dislike: '鲜花' },
    lines: {
      greet: '嘘——小点声。你懂不懂啊。',
      greetWarm: '来了？作业借你抄……不是，借你对答案。',
      greetCold: '……我奶说不能跟坏大人说话。',
      streak: '你天天来，比我上线都勤。……开黑吗？不，你先写作业。',
      chat: [
        '王建国那老头，健身器材比我命都重要。',
        '雨桐姐是我偶像。……你见了她别乱说话。',
        '网吧机位 37 号是机皇，一般人我不告诉。',
      ],
      giftLike: '懂我！以后抢机位报我 ID！',
      giftNeutral: '哦，谢了。',
      giftDislike: '花？……我们这种杀手不拿花。',
    },
  },
  {
    id: 'hmm', name: '韩梅梅', age: 34, job: '全职妈妈', home: 'h2',
    look: { shirt: '#c96a4a', pants: '#4a5568', hair: '#3a2a1c', longHair: true, scale: 1, accessory: 'timer' },
    tags: ['接送孩子精确到分钟', '家长群里的消息组长', '跟儿子说话像项目经理'],
    speech: 'precise', catchphrase: '这个事的颗粒度……',
    secret: {
      threshold: 4, hook: '她看别人家女儿的眼神，总会多停半秒——',
      reveal: '她盯着操场，忽然说：丁克了七年，小米是意外。怕过，没后悔过，也从来不跟任何人说。"颗粒度不对的人生，也得过。……别写进家长群。"',
    },
    relationLine: '她需要有人帮她接一次张小米（她在开会走不开）；她能给你一份全小区培训班测评（避雷情报）。',
    schedule: [
      { from: 7, to: 9, x: 90, y: 38, r: 2 },          // 送学
      { from: 9, to: 15, x: 300, y: 90, r: 3 },        // 主街采买
      { from: 15, to: 17, x: 93, y: 38, r: 2 },        // 接学
      { from: 17, to: 7, x: 329, y: 55, r: 1 },        // 苏家
    ],
    gifts: { like: ['热茶', '旧书'], neutral: ['鲜花'], dislike: '零食' },
    lines: {
      greet: '你好。这个事的颗粒度，我们得先对齐一下。',
      greetWarm: '来啦！正好，帮我把这一页口算题批了。',
      greetCold: '……我这个人，记性好得自己都怕。',
      streak: '你最近的出现频率，值得进我的日程表了。',
      chat: [
        '刘老师的家长群，我回复永远第二。第一是唐晓棠她妈。',
        '婆婆点赞我朋友圈，人从不来。也好，颗粒度不同，不必强融。',
        '给小米报的三个班，全是智商税。测评表我做好了，你拿去避雷。',
      ],
      giftLike: '太到位了。你这个资源的颗粒度很细。',
      giftNeutral: '收到。列入今日待办。',
      giftDislike: '高热量。我们家执行控糖。',
    },
  },
  {
    id: 'cds', name: '曹德顺', age: 52, job: '环卫工', home: 'h3',
    look: { shirt: '#c9803a', pants: '#4a4038', hair: '#3a3028', longHair: false, scale: 0.95, accessory: 'none' },
    tags: ['扫地从北到南一条直线，不回头', '下雨先把下水道口的树叶掏干净', '塑料瓶要洗干、压扁才肯卖'],
    speech: 'command', catchphrase: '嗯。',
    secret: {
      threshold: 5, hook: '他把每个捡来的瓶子都洗干、压扁，像在打包什么行李——',
      reveal: '他女儿在德国。他捡瓶子换的钱，换成欧元一张一张夹着。"视频里我说啥都不缺。……她要是回来，这条街得干净点。你说是不是？"',
    },
    relationLine: '他需要有人帮他给女儿的国际包裹写地址（他不会英文）；他的扫帚能借你（清洁小道具）。',
    schedule: [
      { from: 5, to: 11, x: 240, y: 145, r: 0, patrol: [[240, 145], [420, 145]] },
      { from: 11, to: 13, x: 239, y: 52, r: 1 },        // 冯记早餐（留饭）
      { from: 13, to: 19, x: 300, y: 145, r: 0, patrol: [[300, 145], [160, 145]] },
      { from: 19, to: 5, x: 207, y: 78, r: 1 },        // 陈家（借住）
    ],
    gifts: { like: ['热茶', '零食'], neutral: ['旧书'], dislike: '鲜花' },
    lines: {
      greet: '嗯。',
      greetWarm: '来了。那边干净，站那边。',
      greetCold: '……嗯。',
      streak: '嗯。你天天来，我这条街都扫出你的脚印了。',
      chat: [
        '瓶子要压扁。路要扫直。做人一样。',
        '冯军多给的半勺，我还他一把小葱。人情是流水，不能断。',
        '晓棠丫头天天给我送水。……比我家那丫头话少，心一样。',
      ],
      giftLike: '……（他点点头，把东西小心放进了工具车最上层）',
      giftNeutral: '嗯。放这儿。',
      giftDislike: '……（他看了一眼，继续扫地）',
    },
  },
  {
    id: 'xwt', name: '谢婉婷', age: 29, job: '花店店主', home: 'h4',
    look: { shirt: '#d88aa0', skirt: '#a85a74', pants: '#e8b88a', hair: '#5a3a2c', longHair: true, scale: 0.95, accessory: 'none' },
    tags: ['给每束花手写卡片，从不署名', '下雨天把花搬到门口让人躲雨', '算账用算盘，不用计算器'],
    speech: 'literary', catchphrase: '你就像……蒲公英。',
    secret: {
      threshold: 4, hook: '快递站窗台上养着一排花，养得极好，却没有一盆有名字——',
      reveal: '她拨着算盘，轻声：每周一枝花，寄给他，匿名。"他早知道了。花没退回，就成了。"——窗台那排花，快递单都没拆。',
    },
    relationLine: '她需要有人帮她送一次花（撞破签收人）；她能教你包一束花（送礼包装加成，好感翻倍道具）。',
    schedule: [
      { from: 8, to: 21, x: 412, y: 66, r: 2 },        // 婉婷花店
      { from: 21, to: 8, x: 493, y: 167, r: 1 },       // 河景公寓
    ],
    gifts: { like: ['热茶', '旧书'], neutral: ['鲜花'], dislike: '零食' },
    lines: {
      greet: '你来了。今天的你，像沾了露的桔梗。',
      greetWarm: '坐。给你留了枝洋甘菊——安神的，你最近睡太晚。',
      greetCold: '……店里地方小，转身都费劲。',
      streak: '你天天来，比我的花生物钟还稳。',
      chat: [
        '花不会拒绝人。所以我喜欢花，不喜欢计算器。',
        '晓芸说我们一起开花店。她的编制一上岸，我们的店就黄了。',
        '下雨天，花要搬出来。人要进来躲。这是一样的。',
      ],
      giftLike: '……你送的，我会好好养。',
      giftNeutral: '谢谢。我找个瓶子插上。',
      giftDislike: '这个……我照顾不来。你拿回去？',
    },
  },
  {
    id: 'ljj', name: '罗建军', age: 38, job: '出租车司机', home: 'h3',
    look: { shirt: '#c9b18a', pants: '#3a3f4a', hair: '#2a2018', longHair: false, scale: 1.05, accessory: 'none' },
    tags: ['认识全城的小路', '雨天绕路把乘客送到屋檐下', '计价器永远抹零'],
    speech: 'nag', catchphrase: '小伙子，处对象没？',
    secret: {
      threshold: 4, hook: '他雨天绕路送人到屋檐下，却从不去机场——',
      reveal: '后视镜上挂着全家福和一只洗白的平安符。"丫头高考那年绣的。三年没坐过我的车了，她有了自己的车。"他抹了把后视镜，像擦玻璃。"……去哪？上车说。"',
    },
    relationLine: '他需要有人听他讲十分钟女儿（不许多嘴）；他能载你去城里任何地方（快速旅行！重要功能）。',
    schedule: [
      { from: 6, to: 9, x: 252, y: 57, r: 1 },         // 小区门口等客
      { from: 9, to: 22, x: 360, y: 90, r: 3 },        // 主街趴活
      { from: 22, to: 6, x: 300, y: 145, r: 2 },       // 滨河路（夜班）
    ],
    gifts: { like: ['热茶', '零食'], neutral: ['旧书'], dislike: '鲜花' },
    lines: {
      greet: '小伙子，处对象没？上车聊聊？',
      greetWarm: '来了！今天坐后座还是副驾？副驾有水。',
      greetCold: '……上车。打表。',
      streak: '你天天来，要不我给你包个月？比公交划算。',
      chat: [
        '全城的小路都在我脑子里。导航？导航是我儿子。',
        '雨天别把伞收那么早，檐下再走两步。乘客是客，客要送到檐下。',
        '丫头在德国……不是，在德国的是我老曹。我家丫头在城南。',
      ],
      giftLike: '这敢情好！放副驾，客人看了都说司机有品位。',
      giftNeutral: '谢了啊，回头顺路捎你一段。',
      giftDislike: '花放车里三天，味儿能留仨月。……别问我怎么知道的。',
    },
  },
  {
    id: 'gll', name: '高露露', age: 24, job: '美甲师 / 探店博主', home: 'h4',
    look: { shirt: '#e86a8a', pants: '#5a4a5a', hair: '#8a3a5c', longHair: true, scale: 0.95, accessory: 'none' },
    tags: ['店里永远架着手机拍"创业 vlog"', '外卖必用券，凑单精算到分', '给客人做的指甲永远比给自己的认真'],
    speech: 'internet', catchphrase: '宝子听我说。',
    secret: {
      threshold: 4, hook: '她的 vlog 里同一扇窗换了三次窗帘，可她说那是"工作室"——',
      reveal: '她关掉补光灯，声音低下来：工作室是合租隔断间，账本最后一页是花呗分期。"宝子……镜头前那叫人设。人设不欠钱，我欠。"',
    },
    relationLine: '她需要有人帮她拍一条"有路人入镜"的素材；她能给玩家做一次免费美甲（外观变色道具！）。',
    schedule: [
      { from: 10, to: 22, x: 360, y: 91, r: 2 },        // 主街人行道（美甲摊+三脚架）
      { from: 22, to: 10, x: 408, y: 95, r: 2 },        // 酒吧前（拍夜景素材）
    ],
    gifts: { like: ['鲜花', '零食'], neutral: ['热茶'], dislike: '旧书' },
    lines: {
      greet: '宝子听我说！今天这条素材必须爆！',
      greetWarm: '宝子来了！坐，给你整一个全网最闪的款，免费！',
      greetCold: '……镜头不拍说话不算话的人。',
      streak: '宝子你天天来，我都想给你开个专栏了。',
      chat: [
        '郑好那个单我推了。分成二八，他二。呵。',
        '外卖券要叠会员叠红包，这叫组合拳，宝子学着点。',
        '别看我现在这样，客人的手到我手里，就没有翻车过。',
      ],
      giftLike: '宝子！！你也太会了！这条素材送你上镜！',
      giftNeutral: '谢啦宝子，爱你。',
      giftDislike: '这玩意儿……拍出来没流量。',
    },
  },
  {
    id: 'lsy', name: '林守义', age: 66, job: '退休中医', home: 'h1',
    look: { shirt: '#3a3a3c', pants: '#2f2f31', hair: '#c9c4b8', longHair: false, scale: 0.95, accessory: 'none' },
    tags: ['打太极必占喷泉边那个位置', '免费把脉但只开"多睡觉"一个方子', '把脉时闭眼摇头，越摇大家越慌'],
    speech: 'literary', catchphrase: '脉象弦滑，恕我直言。',
    secret: {
      threshold: 5, hook: '他给全楼人把脉，唯独见了吴桂芳就绕路走——',
      reveal: '药柜最底层压着一封没拆的信，四十年了。"下乡时她的信我弄丢了，回信写好，没脸寄。"他摩挲着信封，"现在天天见。……比寄到强。"',
    },
    relationLine: '他需要有人帮他把那封信转交（终极事件）；他能免费给你把脉（每天一次，随机 Buff：今天睡得香→体力+1）。',
    schedule: [
      { from: 5, to: 9, x: 72, y: 84, r: 2 },          // 公园喷泉（太极）
      { from: 9, to: 12, x: 272, y: 91, r: 1 },        // 诊所门前义诊
      { from: 12, to: 19, x: 76, y: 86, r: 2 },        // 公园广场
      { from: 19, to: 5, x: 173, y: 37, r: 1 },        // 林家
    ],
    gifts: { like: ['热茶', '旧书'], neutral: ['鲜花'], dislike: '零食' },
    lines: {
      greet: '坐。伸手。……脉象弦滑，恕我直言，少熬夜。',
      greetWarm: '来了。坐，今日这盏茶刚好。',
      greetCold: '……心浮气躁，脉都乱了。改日吧。',
      streak: '你日日来，比我的病人都守时。甚好。',
      chat: [
        '喷泉边那个位置，地气好。王建国不懂，他只会敲树。',
        '免费把脉，方子只有一个：多睡觉。他们不乐意听。',
        '药柜要常擦。底下的灰……也要擦，但有些东西不能动。',
      ],
      giftLike: '善。此物合我的性。',
      giftNeutral: '放着吧。心领了。',
      giftDislike: '膏粱厚味，脉象之大敌。',
    },
  },
  {
    id: 'txt', name: '唐晓棠', age: 11, job: '小学五年级 · 班长', home: 'h2',
    look: { shirt: '#e8b83a', skirt: '#a8743a', pants: '#e8b88a', hair: '#2a1a1c', longHair: true, scale: 0.85, accessory: 'none' },
    tags: ['记班级日志，也记小区"异常人员"', '见到曹德顺必递水', '把秘密全写进带锁日记本'],
    speech: 'precise', catchphrase: '据我观察……',
    secret: {
      threshold: 3, hook: '她连辣条都舍不得买，记账本却厚得反常——',
      reveal: '她翻开带锁日记本最后一页：存钱罐，536 块 4 毛，用途——"让爸爸妈妈不吵架"。"我打听过了，请他们陪我吃顿饭，一小时，是这个价。"',
    },
    relationLine: '她需要有人帮她"约谈"她爸妈（终极事件）；她的班级日志能告诉你所有孩子的行踪（情报）。',
    schedule: [
      { from: 7, to: 16, x: 89, y: 40, r: 2 },         // 学校（值日）
      { from: 16, to: 19, x: 329, y: 57, r: 2 },       // 家院子（写日志）
      { from: 19, to: 7, x: 329, y: 55, r: 1 },        // 苏家
    ],
    gifts: { like: ['零食', '鲜花'], neutral: ['热茶'], dislike: '旧书' },
    lines: {
      greet: '站住。据我观察，你今天的步速比昨天快 12%。',
      greetWarm: '你来啦！正好，帮我核对一下本周异常人员记录。',
      greetCold: '……（她在日志本上写下：某月某日，失信一次。）',
      streak: '据我观察，你已经连续来了五天。记录在案，加一分。',
      chat: [
        '张小米今天又在花坛刨土，已记录在案。',
        '曹爷爷的水我每天都送。这是值日表之外的项目。',
        '我妈妈说大人都是骗子。你……先观察观察。',
      ],
      giftLike: '记录在案：一次重大示好。我批准你喜欢我。',
      giftNeutral: '收到。登记。',
      giftDislike: '……（她推了推不存在的眼镜）知识比这个有用。',
    },
  },
];

// 关系网速查（对话里引用第三人时查表）
export const RELATIONS: { a: string; b: string; kind: 'family' | 'crush' | 'friend' | 'rival' }[] = [
  { a: 'lxl', b: 'hmm', kind: 'family' },   // 婆媳
  { a: 'zxm', b: 'hmm', kind: 'family' },   // 母子
  { a: 'zxm', b: 'lxl', kind: 'family' },   // 祖孙
  { a: 'zwb', b: 'sqx', kind: 'crush' },    // 程序员→夜班店员
  { a: 'jym', b: 'hyt', kind: 'crush' },    // 学弟→学姐
  { a: 'cdw', b: 'xwt', kind: 'crush' },    // 快递站长⇄花店主（双向暗恋）
  { a: 'lxy', b: 'xwt', kind: 'friend' },   // 闺蜜之约
  { a: 'wgf', b: 'hyt', kind: 'friend' },   // 忘年交
  { a: 'wjg', b: 'ztz', kind: 'friend' },   // 棋友
  { a: 'fj', b: 'cds', kind: 'friend' },    // 留饭之交
  { a: 'zh', b: 'gll', kind: 'rival' },     // 探店分成撕破脸
  { a: 'wjg', b: 'jym', kind: 'rival' },    // 噪音之战
  { a: 'ztz', b: 'zh', kind: 'rival' },    // 广告斗法
  { a: 'hmm', b: 'lxy', kind: 'rival' },    // 家长群较劲
  { a: 'lsy', b: 'wgf', kind: 'friend' },   // 四十年信件（双方不知）
];
