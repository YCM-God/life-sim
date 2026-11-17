// 60 个手写任务：8 主线 / 32 支线（17 个人 + 15 链环）/ 20 日常
// 地点全部落在现有地图的可走区域；NPC id 与 residents.ts 对齐
import type { PlaceDef, QuestDef } from './types';
import { DAILY_EXTRA, MAIN_EXTRA, SIDE_EXTRA } from './data-extra';

export const PLACES: Record<string, PlaceDef> = {
  home: { name: '家门口', tx: 248, ty: 56, r: 2 },
  homeYard: { name: '苏家院子', tx: 331, ty: 57, r: 2 },
  h1: { name: '林家', tx: 173, ty: 37, r: 2 },
  h2: { name: '苏家', tx: 329, ty: 56, r: 2 },
  h3: { name: '陈家', tx: 207, ty: 77, r: 2 },
  h4: { name: '河景公寓', tx: 493, ty: 166, r: 2 },
  schoolGate: { name: '学校门口', tx: 93, ty: 39, r: 2.5 },
  schoolFlower: { name: '学校花坛', tx: 96, ty: 40, r: 2 },
  hospital: { name: '镇医院', tx: 298, ty: 35, r: 2.5 },
  office: { name: '星辰大厦', tx: 452, ty: 35, r: 2.5 },
  mall: { name: '百货商场', tx: 214, ty: 90, r: 2.5 },
  clinic: { name: '诊所', tx: 272, ty: 91, r: 2 },
  shop: { name: '便利店', tx: 330, ty: 91, r: 2 },
  bar: { name: '酒吧', tx: 408, ty: 91, r: 2 },
  breakfast: { name: '冯记早餐', tx: 239, ty: 51, r: 2 },
  express: { name: '快递站', tx: 377, ty: 65, r: 2 },
  flower: { name: '婉婷花店', tx: 412, ty: 65, r: 2 },
  parkFountain: { name: '公园喷泉', tx: 72, ty: 84, r: 2.5 },
  parkStone: { name: '公园石头下', tx: 76, ty: 86, r: 2 },
  riverBench: { name: '滨河长椅', tx: 340, ty: 138, r: 2.5 },
  bridge: { name: '木桥', tx: 326, ty: 160, r: 2.5 },
  oldTower: { name: '老钟楼', tx: 571, ty: 55, r: 2.5 },
  antique: { name: '古董店', tx: 608, ty: 103, r: 2 },
  station: { name: '老火车站', tx: 568, ty: 123, r: 2.5 },
  forestTower: { name: '北山瞭望塔', tx: 496, ty: 13, r: 2.5 },
};

function daily(q: QuestDef): QuestDef {
  return { ...q, repeat: 'daily' };
}

const MAIN: QuestDef[] = [
  {
    id: 'main-first-day', name: '开学第一天', tier: 'main', type: 'long', source: 'story',
    desc: '六岁这年，你要第一次自己走进学校。刘晓芸在校门口等你。',
    giver: 'lxy', turnIn: 'lxy', prereq: { minAge: 6 },
    objectives: [
      { kind: 'visit', place: 'schoolGate', hint: '走到学校门口' },
      { kind: 'talk', npc: 'lxy', hint: '和刘晓芸说说话' },
      { kind: 'visit', place: 'schoolFlower', hint: '在花坛边站一会儿' },
    ],
    reward: { money: 20, affinity: 1, tag: '人生·开学', log: '我自己走进了学校。刘晓芸在门口数人头，数到我时停了一下。' },
  },
  {
    id: 'main-capsule', name: '时间胶囊', tier: 'main', type: 'long', source: 'story',
    desc: '张小米在树下埋了一个铁盒，说十年后再挖出来。他想让你帮忙。',
    giver: 'zxm', turnIn: 'zxm', prereq: { minAge: 9 },
    objectives: [
      { kind: 'talk', npc: 'zxm', hint: '问小米铁盒埋在哪' },
      { kind: 'collect', places: ['schoolFlower', 'parkStone', 'homeYard'], hint: '找齐三处埋东西的地方' },
      { kind: 'talk', npc: 'zxm', hint: '把找到的东西交给小米' },
    ],
    choices: [
      { label: '埋回去', tag: '时间胶囊·埋回去', log: '我们把铁盒重新埋回树下。小米说，十年后谁都不许先挖。' },
      { label: '带走', tag: '时间胶囊·带走', log: '我把铁盒带走了。小米没哭，只是站在原地看了很久。' },
    ],
    reward: { money: 35, affinity: 1, item: '时间胶囊', log: '我帮小米挖出了他的时间胶囊。' },
  },
  {
    id: 'main-rain-14', name: '十四岁的雨', tier: 'main', type: 'long', source: 'story',
    desc: '何雨桐在滨河长椅坐了一下午。她说今天不想一个人。',
    giver: 'hyt', turnIn: 'hyt', prereq: { minAge: 13 },
    objectives: [
      { kind: 'talk', npc: 'hyt', hint: '去滨河步道找何雨桐' },
      { kind: 'visit', place: 'riverBench', hint: '在长椅边坐下来' },
      { kind: 'talk', npc: 'hyt', hint: '问问她今天怎么了' },
    ],
    choices: [
      { label: '陪她坐着', tag: '十四岁·陪着', log: '我陪何雨桐在长椅上坐了一下午。她一句话没说，我也没有问。' },
      { label: '劝她回家', tag: '十四岁·劝回家', log: '我劝何雨桐回家。她说好，然后一个人走了。' },
    ],
    reward: { money: 40, affinity: 1, log: '十四岁那年的雨里，我陪何雨桐坐了很久。' },
  },
  {
    id: 'main-exam-night', name: '大考前夜', tier: 'main', type: 'long', source: 'story',
    desc: '教室的灯还亮着。刘晓芸说，今晚可以留下来，也可以早点回去。',
    giver: 'lxy', turnIn: 'lxy', prereq: { minAge: 16 },
    objectives: [
      { kind: 'talk', npc: 'lxy', hint: '去教室找刘晓芸' },
      { kind: 'visit', place: 'schoolGate', hint: '夜里在学校门口走一圈' },
      { kind: 'talk', npc: 'lxy', hint: '告诉刘晓芸你的决定' },
    ],
    window: { from: 18, to: 23 },
    choices: [
      { label: '再复习一遍', tag: '大考·熬夜', log: '大考前夜，我在教室多坐了两小时。刘晓芸没催我。' },
      { label: '早点睡', tag: '大考·早睡', log: '大考前夜，我早早回了家。第二天醒来，脑子是清的。' },
    ],
    reward: { money: 50, affinity: 1, log: '大考前夜，我做了一个不后悔的选择。' },
  },
  {
    id: 'main-first-job', name: '第一份工作', tier: 'main', type: 'long', source: 'story',
    desc: '陈大伟让你跟一天快递。三件包裹，三个地址，送到就算上手。',
    giver: 'cdw', turnIn: 'cdw', prereq: { minAge: 19 },
    objectives: [
      { kind: 'talk', npc: 'cdw', hint: '去快递站找陈大伟' },
      { kind: 'collect', places: ['express', 'h4', 'home'], hint: '送完三件包裹' },
      { kind: 'talk', npc: 'cdw', hint: '回快递站交差' },
    ],
    reward: { money: 80, affinity: 1, tag: '人生·第一份工', log: '我送了人生第一趟快递。陈大伟说，包裹不会查人学历。' },
  },
  {
    id: 'main-house-30', name: '三十岁的房子', tier: 'main', type: 'long', source: 'story',
    desc: '郑好递来三把钥匙。买、租、还是继续住家里，他都要一个答案。',
    giver: 'zh', turnIn: 'zh', prereq: { minAge: 26 },
    objectives: [
      { kind: 'talk', npc: 'zh', hint: '去小区门口找郑好' },
      { kind: 'collect', places: ['h1', 'h4', 'mall'], hint: '看完三处房子' },
      { kind: 'talk', npc: 'zh', hint: '告诉郑好你的决定' },
    ],
    choices: [
      { label: '买下来', tag: '三十岁·买房', log: '三十岁这年，我签了合同。郑好说，第一单是他爸妈的养老房。' },
      { label: '先租着', tag: '三十岁·租房', log: '三十岁这年，我租下了河景公寓。钥匙很轻，门很重。' },
    ],
    reward: { money: 100, affinity: 1, log: '三十岁，我认真看了一次房子。' },
  },
  {
    id: 'main-illness-mid', name: '中年的那场病', tier: 'main', type: 'long', source: 'story',
    desc: '林守义把完脉，让你去医院再查一次。他说这次别硬扛。',
    giver: 'lsy', turnIn: 'lsy', prereq: { minAge: 36 },
    objectives: [
      { kind: 'talk', npc: 'lsy', hint: '去诊所找林守义' },
      { kind: 'visit', place: 'hospital', hint: '去医院做一次检查' },
      { kind: 'talk', npc: 'lsy', hint: '把结果告诉林守义' },
    ],
    choices: [
      { label: '听大夫的', tag: '中年·听医嘱', log: '中年的这场病，我听大夫的话，按时吃药，慢慢好了。' },
      { label: '硬扛过去', tag: '中年·硬扛', log: '中年的这场病，我硬扛过去了。从此一累，骨头就疼。' },
    ],
    reward: { money: 60, affinity: 1, log: '中年那场病，让我第一次认真听自己身体说话。' },
  },
  {
    id: 'main-last-letter', name: '最后一封信', tier: 'main', type: 'long', source: 'story',
    desc: '吴桂芳把一封没拆的信交给你。她说，这一次想亲自送到。',
    giver: 'wgf', turnIn: 'wgf', prereq: { minAge: 60, done: 'c-a5-meet' },
    objectives: [
      { kind: 'talk', npc: 'wgf', hint: '去河景公寓找吴桂芳' },
      { kind: 'visit', place: 'riverBench', hint: '陪她走到滨河长椅' },
      { kind: 'talk', npc: 'lsy', hint: '把信交给林守义' },
      { kind: 'talk', npc: 'wgf', hint: '回去告诉吴桂芳' },
    ],
    choices: [
      { label: '留在原地', tag: '回望·一封信', log: '最后一封信送到了。两个老人坐在长椅上，谁也没先开口。' },
      { label: '悄悄走开', tag: '回望·留白', log: '我把信送到，就悄悄走开了。有些话，不需要第三个人听。' },
    ],
    reward: { money: 150, affinity: 1, tag: '回望·信', log: '我这辈子，替人送过很多信。最后一封，送到了。' },
  },
];

const SIDE: QuestDef[] = [
  {
    id: 's-wjg-boxes', name: '压平的纸箱', tier: 'side', type: 'collect', source: 'npc',
    desc: '王建国说，纸箱要压平、码齐、扎两道。他不放心别人收。',
    giver: 'wjg', turnIn: 'wjg', prereq: { minAge: 6, affinity: { npc: 'wjg', min: 2 } },
    objectives: [
      { kind: 'talk', npc: 'wjg', hint: '找王建国领任务' },
      { kind: 'collect', places: ['home', 'express', 'breakfast'], hint: '收三摞纸箱' },
      { kind: 'talk', npc: 'wjg', hint: '把纸箱交给王建国' },
    ],
    reward: { money: 25, affinity: 1, log: '我帮王建国收了纸箱。他蹲下来，把每一只都压得平平的。' },
  },
  {
    id: 's-lxl-market', name: '早市三毛钱', tier: 'side', type: 'errand', source: 'npc',
    desc: '李秀兰要为了三毛钱折返两次。她需要一个拎菜的人。',
    giver: 'lxl', turnIn: 'lxl', prereq: { affinity: { npc: 'lxl', min: 2 } },
    objectives: [
      { kind: 'talk', npc: 'lxl', hint: '陪李秀兰去早市' },
      { kind: 'visit', place: 'breakfast', hint: '到早餐店前的菜摊' },
      { kind: 'talk', npc: 'lxl', hint: '把菜交给她' },
    ],
    reward: { money: 20, affinity: 1, log: '我陪李秀兰逛了早市。她为了三毛钱，真折返了两次。' },
  },
  {
    id: 's-zxm-bugs', name: '三只西瓜虫', tier: 'side', type: 'collect', source: 'npc',
    desc: '小米想把三只西瓜虫养在罐子里。他说花坛底下有，雨后才出来。',
    giver: 'zxm', turnIn: 'zxm', prereq: { affinity: { npc: 'zxm', min: 1 } },
    objectives: [
      { kind: 'talk', npc: 'zxm', hint: '问小米虫子在哪' },
      { kind: 'collect', places: ['schoolFlower', 'parkStone', 'homeYard'], hint: '找齐三只西瓜虫' },
      { kind: 'talk', npc: 'zxm', hint: '把虫子交给小米' },
    ],
    reward: { money: 15, affinity: 1, item: '西瓜虫罐', log: '我帮小米抓了三只西瓜虫。他把罐子埋回树下，说这样能种出更多。' },
  },
  {
    id: 's-cdw-parcel', name: '三号楼那件', tier: 'side', type: 'errand', source: 'npc',
    desc: '陈大伟让你把三号楼那件包裹送上去。收件人不在家，放门口也行。',
    giver: 'cdw', turnIn: 'cdw', prereq: { affinity: { npc: 'cdw', min: 1 } },
    objectives: [
      { kind: 'talk', npc: 'cdw', hint: '去快递站取件' },
      { kind: 'visit', place: 'h2', hint: '送到苏家门口' },
      { kind: 'talk', npc: 'cdw', hint: '回快递站回话' },
    ],
    reward: { money: 20, affinity: 1, log: '我替陈大伟送了一件包裹。收件人不在，我把它放在门口，压了块砖。' },
  },
  {
    id: 's-lxy-duty', name: '放学后的值日', tier: 'side', type: 'timed', source: 'npc',
    desc: '刘晓芸要开会。她让你替她盯半小时值日，一个孩子都不能少。',
    giver: 'lxy', turnIn: 'lxy', prereq: { minAge: 8, affinity: { npc: 'lxy', min: 2 } },
    objectives: [
      { kind: 'talk', npc: 'lxy', hint: '接下值日' },
      { kind: 'visit', place: 'schoolGate', hint: '16:00 后到学校门口' },
      { kind: 'talk', npc: 'lxy', hint: '向刘晓芸汇报' },
    ],
    window: { from: 16, to: 20 },
    reward: { money: 25, affinity: 1, log: '我替刘晓芸盯了一次值日。她数人头，我也数。' },
  },
  {
    id: 's-ztz-model', name: '当一次模特', tier: 'side', type: 'talk', source: 'npc',
    desc: '赵铁柱在画漫画，缺一个模特。他说不白画，画完请你喝汽水。',
    giver: 'ztz', turnIn: 'ztz', prereq: { affinity: { npc: 'ztz', min: 1 } },
    objectives: [
      { kind: 'talk', npc: 'ztz', hint: '答应给赵铁柱当模特' },
      { kind: 'visit', place: 'riverBench', hint: '到滨河长椅摆个姿势' },
      { kind: 'talk', npc: 'ztz', hint: '看看他画成什么样' },
    ],
    reward: { money: 20, affinity: 1, log: '我给赵铁柱当了一次模特。他把我画成了会飞的保安。' },
  },
  {
    id: 's-zh-flyers', name: '单页与门禁', tier: 'side', type: 'choice', source: 'npc',
    desc: '郑好要在小区发单页，赵铁柱不让。两个人都看着你。',
    giver: 'zh', turnIn: 'zh', prereq: { minAge: 12, affinity: { npc: 'zh', min: 1 } },
    objectives: [
      { kind: 'talk', npc: 'zh', hint: '听郑好说完' },
      { kind: 'collect', places: ['h1', 'h2', 'h3'], hint: '跑完三栋楼' },
      { kind: 'talk', npc: 'ztz', hint: '和赵铁柱打个招呼' },
      { kind: 'talk', npc: 'zh', hint: '回郑好那里' },
    ],
    choices: [
      { label: '帮郑好发完', tag: '单页·帮郑好', affinity: { npc: 'zh', delta: 1 }, log: '我帮郑好发完了单页。赵铁柱追了我半条街，最后没追上。' },
      { label: '劝郑好别发', tag: '单页·帮赵铁柱', affinity: { npc: 'ztz', delta: 1 }, log: '我劝郑好别发了。他把单页塞回包里，说下个月再试。' },
    ],
    reward: { money: 30, affinity: 1, log: '单页的事，我选了边。' },
  },
  {
    id: 's-hyt-cloud', name: '看云一小时', tier: 'side', type: 'long', source: 'npc',
    desc: '何雨桐说，想看云。什么都不做，就看一小时。',
    giver: 'hyt', turnIn: 'hyt', prereq: { minAge: 12, affinity: { npc: 'hyt', min: 2 } },
    objectives: [
      { kind: 'talk', npc: 'hyt', hint: '答应陪她看云' },
      { kind: 'wait', days: 1, hint: '第二天再来找她' },
      { kind: 'talk', npc: 'hyt', hint: '告诉她云是什么形状' },
    ],
    reward: { money: 20, affinity: 1, log: '我陪何雨桐看了一小时云。她说，那朵像一只没寄出去的信。' },
  },
  {
    id: 's-jym-game', name: '网吧抢机位', tier: 'side', type: 'talk', source: 'npc',
    desc: '蒋一鸣说网吧今晚有位子。他缺一个帮他占座的人。',
    giver: 'jym', turnIn: 'jym', prereq: { minAge: 10, affinity: { npc: 'jym', min: 1 } },
    objectives: [
      { kind: 'talk', npc: 'jym', hint: '听蒋一鸣说完' },
      { kind: 'visit', place: 'shop', hint: '20:00 后去便利店门口' },
      { kind: 'talk', npc: 'jym', hint: '告诉他位子还在' },
    ],
    window: { from: 20, to: 24 },
    reward: { money: 15, affinity: 1, log: '我帮蒋一鸣占了网吧的位子。他打游戏，我写作业。' },
  },
  {
    id: 's-hmm-pickup', name: '接一次孩子', tier: 'side', type: 'timed', source: 'npc',
    desc: '韩梅梅在开会走不开。她让你去学校门口接一次张小米。',
    giver: 'hmm', turnIn: 'hmm', prereq: { minAge: 10, affinity: { npc: 'hmm', min: 1 } },
    objectives: [
      { kind: 'talk', npc: 'hmm', hint: '答应去接小米' },
      { kind: 'visit', place: 'schoolGate', hint: '16:00 后到学校门口' },
      { kind: 'talk', npc: 'hmm', hint: '把小米送回家' },
    ],
    window: { from: 16, to: 19 },
    reward: { money: 20, affinity: 1, log: '我替韩梅梅接了一次张小米。他一路都在找西瓜虫。' },
  },
  {
    id: 's-cds-leaves', name: '下水道的树叶', tier: 'side', type: 'collect', source: 'npc',
    desc: '曹德顺说，下雨前得把下水道口的树叶掏干净。他一个人忙不过来。',
    giver: 'cds', turnIn: 'cds', prereq: { affinity: { npc: 'cds', min: 1 } },
    objectives: [
      { kind: 'talk', npc: 'cds', hint: '找曹德顺领任务' },
      { kind: 'collect', places: ['riverBench', 'parkFountain', 'bridge'], hint: '清三处下水道' },
      { kind: 'talk', npc: 'cds', hint: '回去告诉曹德顺' },
    ],
    reward: { money: 20, affinity: 1, log: '我帮曹德顺掏了下水道。他看了看，说这活儿得赶在下雨前。' },
  },
  {
    id: 's-xwt-flower', name: '匿名的一枝花', tier: 'side', type: 'errand', source: 'npc',
    desc: '谢婉婷每周都寄一枝花，不写名字。这次她让你去送。',
    giver: 'xwt', turnIn: 'xwt', prereq: { affinity: { npc: 'xwt', min: 2 } },
    objectives: [
      { kind: 'talk', npc: 'xwt', hint: '去花店拿花' },
      { kind: 'talk', npc: 'cdw', hint: '把花送到快递站' },
      { kind: 'talk', npc: 'xwt', hint: '回花店告诉她签收人是谁' },
    ],
    choices: [
      { label: '告诉她陈大伟早知道', tag: '花·说破', affinity: { npc: 'xwt', delta: 1 }, log: '我告诉谢婉婷，陈大伟早就知道花是谁送的。她拨算盘的手停了一下。' },
      { label: '替陈大伟保密', tag: '花·保密', affinity: { npc: 'cdw', delta: 1 }, log: '我替陈大伟保密。窗台上那排花，还是没拆快递单。' },
    ],
    reward: { money: 25, affinity: 1, log: '我替谢婉婷送了一枝没有名字的花。' },
  },
  {
    id: 's-ljj-daughter', name: '去机场的路', tier: 'side', type: 'talk', source: 'npc',
    desc: '罗建军从不去机场。他说，送人去机场的路，和接人回来的路不一样。',
    giver: 'ljj', turnIn: 'ljj', prereq: { minAge: 10, affinity: { npc: 'ljj', min: 2 } },
    objectives: [
      { kind: 'talk', npc: 'ljj', hint: '坐一次罗建军的车' },
      { kind: 'visit', place: 'station', hint: '陪他去老火车站' },
      { kind: 'talk', npc: 'ljj', hint: '问问他女儿的事' },
    ],
    reward: { money: 30, affinity: 1, log: '罗建军把车停在老火车站。他说，女儿高考那年，就是从这儿走的。' },
  },
  {
    id: 's-gll-photo', name: '三张能发朋友圈的照片', tier: 'side', type: 'collect', source: 'npc',
    desc: '高露露要三张照片：花、楼、旧钟。她说滤镜不重要，光重要。',
    giver: 'gll', turnIn: 'gll', prereq: { minAge: 10, affinity: { npc: 'gll', min: 1 } },
    objectives: [
      { kind: 'talk', npc: 'gll', hint: '问高露露要拍什么' },
      { kind: 'collect', places: ['flower', 'mall', 'oldTower'], hint: '拍完三处' },
      { kind: 'talk', npc: 'gll', hint: '把照片给她看' },
    ],
    reward: { money: 25, affinity: 1, log: '我帮高露露拍了三张照片。她说，第三张的光最好。' },
  },
  {
    id: 's-wjg-repair', name: '健身器材那盘棋', tier: 'side', type: 'errand', source: 'npc',
    desc: '王建国的健身器材被蒋一鸣占了。他不想自己去，让你带句话。',
    giver: 'wjg', turnIn: 'wjg', prereq: { affinity: { npc: 'wjg', min: 3 } },
    objectives: [
      { kind: 'talk', npc: 'wjg', hint: '听王建国说完' },
      { kind: 'visit', place: 'h1', hint: '去林家楼下看看器材' },
      { kind: 'talk', npc: 'wjg', hint: '回去告诉他结果' },
    ],
    reward: { money: 20, affinity: 1, log: '我替王建国看了一眼健身器材。蒋一鸣不在，器材上落了一层灰。' },
  },
  {
    id: 's-lxl-gossip', name: '家长里短', tier: 'side', type: 'talk', source: 'npc',
    desc: '李秀兰说，小周那个对象吹了。她让你去确认，别说是她说的。',
    giver: 'lxl', turnIn: 'lxl', prereq: { affinity: { npc: 'lxl', min: 3 } },
    objectives: [
      { kind: 'talk', npc: 'lxl', hint: '听李秀兰说完' },
      { kind: 'talk', npc: 'hyt', hint: '旁敲侧击问何雨桐' },
      { kind: 'talk', npc: 'lxl', hint: '回去交差，别说漏嘴' },
    ],
    reward: { money: 15, affinity: 1, log: '我替李秀兰打听了一件事。她听完，满意地嗑了一颗瓜子。' },
  },
  {
    id: 's-cdw-address', name: '国际包裹的地址', tier: 'side', type: 'talk', source: 'npc',
    desc: '陈大伟不会英文。女儿寄来的包裹要回寄，地址栏空着。',
    giver: 'cdw', turnIn: 'cdw', prereq: { minAge: 12, affinity: { npc: 'cdw', min: 3 } },
    objectives: [
      { kind: 'talk', npc: 'cdw', hint: '去快递站看看包裹' },
      { kind: 'visit', place: 'office', hint: '去星辰大厦找人问地址' },
      { kind: 'talk', npc: 'cdw', hint: '把地址写给他' },
    ],
    reward: { money: 20, affinity: 1, log: '我帮陈大伟写了一个英文地址。他照着抄了三遍。' },
  },
];

const CHAIN: QuestDef[] = [
  {
    id: 'c-a1-letters', name: '念信', tier: 'side', type: 'talk', source: 'npc',
    desc: '吴桂芳眼花，信上的新字看不清。她总在滨河长椅上念信。',
    giver: 'wgf', turnIn: 'wgf', prereq: { minAge: 10, affinity: { npc: 'wgf', min: 2 } },
    chain: { id: 'letter', ring: 1, total: 5 },
    objectives: [
      { kind: 'talk', npc: 'wgf', hint: '去滨河步道找吴桂芳' },
      { kind: 'visit', place: 'riverBench', hint: '在长椅边坐下' },
      { kind: 'talk', npc: 'wgf', hint: '帮她念完这封信' },
    ],
    reward: { money: 20, affinity: 1, log: '我替吴桂芳念了一封信。信里都是些旧事，她听得很认真。' },
  },
  {
    id: 'c-a2-reply', name: '回信', tier: 'side', type: 'choice', source: 'npc',
    desc: '吴桂芳想回一封信，写了四十年，没寄出去。她让你替她写。',
    giver: 'wgf', turnIn: 'wgf', prereq: { minAge: 10, done: 'c-a1-letters' },
    chain: { id: 'letter', ring: 2, total: 5 },
    objectives: [
      { kind: 'talk', npc: 'wgf', hint: '听她讲要写什么' },
      { kind: 'visit', place: 'home', hint: '回家把信写好' },
      { kind: 'talk', npc: 'wgf', hint: '把回信念给她听' },
    ],
    choices: [
      { label: '照她原话写', tag: '信·原话', log: '我照吴桂芳的原话写了回信。她听完，说这样就好。' },
      { label: '补一句“我一直在等”', tag: '信·多一句', affinity: { npc: 'wgf', delta: 1 }, log: '我在回信末尾添了一句“我一直在等”。吴桂芳没说话，把信纸折得很慢。' },
    ],
    reward: { money: 25, affinity: 1, log: '我替吴桂芳写了一封回信。四十年了，信纸还是新的。' },
  },
  {
    id: 'c-a3-deliver', name: '送到诊所', tier: 'side', type: 'errand', source: 'npc',
    desc: '信写好了。吴桂芳让你送到林守义的诊所，不许说是谁写的。',
    giver: 'wgf', turnIn: 'lsy', prereq: { done: 'c-a2-reply' },
    chain: { id: 'letter', ring: 3, total: 5 },
    objectives: [
      { kind: 'talk', npc: 'wgf', hint: '去吴桂芳家取信' },
      { kind: 'talk', npc: 'lsy', hint: '把信交给林守义' },
    ],
    reward: { money: 30, affinity: 1, log: '我把信送到了林守义的诊所。他看了一眼信封，没有拆。' },
  },
  {
    id: 'c-a4-wait', name: '等回信', tier: 'side', type: 'long', source: 'npc',
    desc: '林守义说，信他要慢慢看。三天后再来。',
    giver: 'wgf', turnIn: 'wgf', prereq: { done: 'c-a3-deliver' },
    chain: { id: 'letter', ring: 4, total: 5 },
    objectives: [
      { kind: 'wait', days: 3, hint: '等三天' },
      { kind: 'talk', npc: 'wgf', hint: '去告诉吴桂芳' },
    ],
    reward: { money: 20, affinity: 1, log: '三天后，林守义让我带话：信他看完了。' },
  },
  {
    id: 'c-a5-meet', name: '长椅上的两个人', tier: 'side', type: 'choice', source: 'npc',
    desc: '吴桂芳和林守义约在滨河长椅见面。他们都说，只是随便坐坐。',
    giver: 'wgf', turnIn: 'wgf', prereq: { minAge: 12, done: 'c-a4-wait' },
    chain: { id: 'letter', ring: 5, total: 5 },
    objectives: [
      { kind: 'talk', npc: 'wgf', hint: '去接吴桂芳' },
      { kind: 'visit', place: 'riverBench', hint: '陪她到长椅' },
      { kind: 'talk', npc: 'wgf', hint: '看他们坐下' },
    ],
    choices: [
      { label: '留下来', tag: '信·留下', affinity: { npc: 'lsy', delta: 1 }, log: '两个老人在长椅上坐了一个下午。我留在旁边，听他们讲四十年前的事。' },
      { label: '悄悄走开', tag: '信·走开', affinity: { npc: 'wgf', delta: 1 }, log: '我把吴桂芳送到，就悄悄走开了。她回头看了我一眼，笑了。' },
    ],
    reward: { money: 80, affinity: 1, tag: '羁绊·吴桂芳与林守义', log: '四十年前没寄出的信，终于坐到了一张长椅上。' },
  },
  {
    id: 'c-b1-tea', name: '一杯热茶', tier: 'side', type: 'errand', source: 'npc',
    desc: '周文斌想给孙倩倩买杯热茶，又不敢自己去。他让你跑一趟。',
    giver: 'zwb', turnIn: 'zwb', prereq: { minAge: 16, affinity: { npc: 'zwb', min: 2 } },
    chain: { id: 'night', ring: 1, total: 4 },
    objectives: [
      { kind: 'talk', npc: 'zwb', hint: '听周文斌说完' },
      { kind: 'visit', place: 'shop', hint: '去便利店买热茶' },
      { kind: 'talk', npc: 'zwb', hint: '把茶带给他' },
    ],
    reward: { money: 15, affinity: 1, log: '我替周文斌买了一杯热茶。他捧在手里，一直没喝。' },
  },
  {
    id: 'c-b2-message', name: '一句话', tier: 'side', type: 'talk', source: 'npc',
    desc: '周文斌有句话想带给孙倩倩。他写了三遍，又撕了三遍。',
    giver: 'zwb', turnIn: 'zwb', prereq: { minAge: 16, done: 'c-b1-tea' },
    chain: { id: 'night', ring: 2, total: 4 },
    objectives: [
      { kind: 'talk', npc: 'zwb', hint: '听他要带什么话' },
      { kind: 'talk', npc: 'sqx', hint: '去便利店夜班找孙倩倩' },
      { kind: 'talk', npc: 'zwb', hint: '回去告诉周文斌' },
    ],
    reward: { money: 20, affinity: 1, log: '我替周文斌带了一句话。孙倩倩听完，把关东煮的盖子盖上了。' },
  },
  {
    id: 'c-b3-shift', name: '守店两小时', tier: 'side', type: 'timed', source: 'npc',
    desc: '周文斌想去看孙倩倩，求你替他守两小时店。他说，就两小时。',
    giver: 'zwb', turnIn: 'zwb', prereq: { minAge: 16, done: 'c-b2-message' },
    chain: { id: 'night', ring: 3, total: 4 },
    objectives: [
      { kind: 'talk', npc: 'zwb', hint: '答应替他守店' },
      { kind: 'visit', place: 'shop', hint: '22:00 后去便利店守店' },
      { kind: 'talk', npc: 'zwb', hint: '告诉他店里没事' },
    ],
    window: { from: 22, to: 24 },
    reward: { money: 30, affinity: 1, log: '我替周文斌守了两小时便利店。凌晨的店，只有关东煮在响。' },
  },
  {
    id: 'c-b4-confess', name: '两小时以后', tier: 'side', type: 'choice', source: 'npc',
    desc: '周文斌从便利店回来，什么也没说。孙倩倩在窗口看着这边。',
    giver: 'zwb', turnIn: 'zwb', prereq: { minAge: 16, done: 'c-b3-shift' },
    chain: { id: 'night', ring: 4, total: 4 },
    objectives: [
      { kind: 'talk', npc: 'zwb', hint: '问问周文斌怎么样' },
      { kind: 'talk', npc: 'sqx', hint: '去问孙倩倩' },
      { kind: 'talk', npc: 'zwb', hint: '回去给周文斌一个建议' },
    ],
    choices: [
      { label: '劝他亲自去说', tag: '夜班·亲自说', affinity: { npc: 'zwb', delta: 1 }, log: '我劝周文斌自己去说。第二天，他买了两杯热茶。' },
      { label: '替他送花', tag: '夜班·代送花', affinity: { npc: 'sqx', delta: 1 }, log: '我替周文斌送了一枝花。孙倩倩收下，问是谁让送的。' },
    ],
    reward: { money: 60, affinity: 1, tag: '羁绊·夜班', log: '周文斌和孙倩倩之间，终于有了一句话。' },
  },
  {
    id: 'c-c1-shop', name: '看店半小时', tier: 'side', type: 'timed', source: 'npc',
    desc: '冯军要给剧团老师送年礼。他让你替你看半小时早餐店。',
    giver: 'fj', turnIn: 'fj', prereq: { minAge: 12, affinity: { npc: 'fj', min: 1 } },
    chain: { id: 'stage', ring: 1, total: 3 },
    objectives: [
      { kind: 'talk', npc: 'fj', hint: '答应看店' },
      { kind: 'visit', place: 'breakfast', hint: '到早餐店门口' },
      { kind: 'talk', npc: 'fj', hint: '把店交还给他' },
    ],
    window: { from: 3, to: 13 },
    reward: { money: 20, affinity: 1, log: '我替冯军看了半小时早餐店。豆浆锅咕嘟咕嘟，像有人在里面说话。' },
  },
  {
    id: 'c-c2-costume', name: '旧戏服', tier: 'side', type: 'collect', source: 'npc',
    desc: '社区晚会要演老戏。冯军缺三件旧戏服，他说自己腿不行了，让你去找。',
    giver: 'fj', turnIn: 'fj', prereq: { minAge: 12, done: 'c-c1-shop' },
    chain: { id: 'stage', ring: 2, total: 3 },
    objectives: [
      { kind: 'talk', npc: 'fj', hint: '问冯军戏服在哪' },
      { kind: 'collect', places: ['h1', 'antique', 'oldTower'], hint: '找齐三件旧戏服' },
      { kind: 'talk', npc: 'fj', hint: '把戏服交给他' },
    ],
    reward: { money: 35, affinity: 1, log: '我帮冯军找齐了三件旧戏服。他抖开一件，站姿像个武生。' },
  },
  {
    id: 'c-c3-stage', name: '社区晚会', tier: 'side', type: 'choice', source: 'npc',
    desc: '晚会开始了。冯军在后台站着，腿有点抖。他问你，上不上。',
    giver: 'fj', turnIn: 'fj', prereq: { minAge: 12, done: 'c-c2-costume' },
    chain: { id: 'stage', ring: 3, total: 3 },
    objectives: [
      { kind: 'talk', npc: 'fj', hint: '去后台找冯军' },
      { kind: 'visit', place: 'oldTower', hint: '19:00 后到老钟楼前' },
      { kind: 'talk', npc: 'fj', hint: '看完演出告诉他' },
    ],
    window: { from: 19, to: 22 },
    choices: [
      { label: '上台', tag: '戏台·上台', affinity: { npc: 'fj', delta: 1 }, log: '社区晚会，我上台了。冯军在台下，用手打着拍子。' },
      { label: '在台下看', tag: '戏台·台下', affinity: { npc: 'fj', delta: 1 }, log: '社区晚会，我在台下看。冯军翻跟头时，腿还是抖了一下。' },
    ],
    reward: { money: 60, affinity: 1, tag: '羁绊·戏台', log: '老钟楼前的那场戏，冯军唱到了最后一句。' },
  },
  {
    id: 'c-d1-parents', name: '约一次饭', tier: 'side', type: 'talk', source: 'npc',
    desc: '唐晓棠想请爸爸妈妈吃顿饭。她说，钱她攒够了，只差有人去约。',
    giver: 'txt', turnIn: 'txt', prereq: { minAge: 9, affinity: { npc: 'txt', min: 1 } },
    chain: { id: 'dinner', ring: 1, total: 3 },
    objectives: [
      { kind: 'talk', npc: 'txt', hint: '听唐晓棠说完' },
      { kind: 'talk', npc: 'hmm', hint: '去和韩梅梅约时间' },
      { kind: 'talk', npc: 'txt', hint: '告诉唐晓棠' },
    ],
    reward: { money: 15, affinity: 1, log: '我替唐晓棠约了她妈妈。韩梅梅在电话那头沉默了一会儿，说好。' },
  },
  {
    id: 'c-d2-save', name: '536 块 4 毛', tier: 'side', type: 'collect', source: 'npc',
    desc: '唐晓棠的存钱罐还差一点。她列了一张单子，上面全是能卖的东西。',
    giver: 'txt', turnIn: 'txt', prereq: { done: 'c-d1-parents' },
    chain: { id: 'dinner', ring: 2, total: 3 },
    objectives: [
      { kind: 'talk', npc: 'txt', hint: '看唐晓棠的单子' },
      { kind: 'collect', places: ['home', 'shop', 'breakfast'], hint: '帮她把东西卖掉' },
      { kind: 'talk', npc: 'txt', hint: '把钱交给她' },
    ],
    reward: { money: 20, affinity: 1, log: '我帮唐晓棠凑够了 536 块 4 毛。她把硬币一枚一枚数进罐子。' },
  },
  {
    id: 'c-d3-dinner', name: '一小时的家', tier: 'side', type: 'choice', source: 'npc',
    desc: '饭订好了。唐晓棠坐在桌边，一直捏着存钱罐。爸爸还没到。',
    giver: 'txt', turnIn: 'txt', prereq: { minAge: 9, done: 'c-d2-save' },
    chain: { id: 'dinner', ring: 3, total: 3 },
    objectives: [
      { kind: 'talk', npc: 'txt', hint: '去饭店找唐晓棠' },
      { kind: 'visit', place: 'mall', hint: '到百货商场楼上的饭店' },
      { kind: 'talk', npc: 'txt', hint: '吃完饭，听她说话' },
    ],
    choices: [
      { label: '替她说出存钱罐', tag: '饭局·说破', affinity: { npc: 'txt', delta: 1 }, log: '我把存钱罐的事说了出来。韩梅梅低下头，爸爸把筷子放下了。' },
      { label: '帮她圆场', tag: '饭局·圆场', affinity: { npc: 'hmm', delta: 1 }, log: '我帮唐晓棠圆了场。那顿饭吃得很安静，但她笑了。' },
    ],
    reward: { money: 50, affinity: 1, tag: '羁绊·一顿饭', log: '唐晓棠请爸妈吃了一顿饭。一小时，536 块 4 毛。' },
  },
];

const DAILY: QuestDef[] = [
  daily({
    id: 'd-fj-tofu', name: '一碗豆腐脑', tier: 'daily', type: 'errand', source: 'board',
    desc: '冯军多舀了半勺豆腐脑，让你送到环卫站给曹德顺。',
    giver: 'fj', turnIn: 'cds', prereq: { minAge: 6 },
    objectives: [
      { kind: 'talk', npc: 'fj', hint: '去早餐店拿豆腐脑' },
      { kind: 'talk', npc: 'cds', hint: '送到环卫站' },
    ],
    reward: { money: 8, affinity: 1, log: '我替冯军给曹德顺送了一碗豆腐脑。多出来的半勺，老曹没声张。' },
  }),
  daily({
    id: 'd-wgf-med', name: '药店那盒膏药', tier: 'daily', type: 'errand', source: 'board',
    desc: '吴桂芳的膏药吃完了。她让你去诊所拿一盒。',
    giver: 'wgf', turnIn: 'wgf',
    objectives: [
      { kind: 'talk', npc: 'wgf', hint: '去吴桂芳家拿药方' },
      { kind: 'visit', place: 'clinic', hint: '到诊所取药' },
      { kind: 'talk', npc: 'wgf', hint: '把药送回去' },
    ],
    reward: { money: 10, affinity: 1, log: '我替吴桂芳去诊所拿了一盒膏药。她把药钱数了三遍。' },
  }),
  daily({
    id: 'd-xwt-flower', name: '窗台的花', tier: 'daily', type: 'errand', source: 'phone',
    desc: '谢婉婷让你把一枝花放到快递站窗台，不用说话。',
    giver: 'xwt', turnIn: 'cdw',
    objectives: [
      { kind: 'talk', npc: 'xwt', hint: '去花店拿花' },
      { kind: 'talk', npc: 'cdw', hint: '把花放到快递站' },
    ],
    reward: { money: 10, affinity: 1, log: '我把一枝花放到了快递站窗台。陈大伟看了一眼，没问是谁送的。' },
  }),
  daily({
    id: 'd-lxy-homework', name: '忘带的作业本', tier: 'daily', type: 'errand', source: 'school',
    desc: '张小米把作业本落在学校了。刘晓芸让你顺路带给他。',
    giver: 'lxy', turnIn: 'zxm', prereq: { minAge: 6 },
    objectives: [
      { kind: 'talk', npc: 'lxy', hint: '去学校拿作业本' },
      { kind: 'talk', npc: 'zxm', hint: '送到苏家' },
    ],
    reward: { money: 8, affinity: 1, log: '我把张小米的作业本送到了他家。他说，明天一定写完。' },
  }),
  daily({
    id: 'd-lxl-market', name: '拎一次菜', tier: 'daily', type: 'errand', source: 'board',
    desc: '李秀兰买了两袋菜，拎不动。她站在早餐店门口等你。',
    giver: 'lxl', turnIn: 'lxl',
    objectives: [
      { kind: 'talk', npc: 'lxl', hint: '去早餐店门口' },
      { kind: 'visit', place: 'breakfast', hint: '帮她把菜拎到路口' },
      { kind: 'talk', npc: 'lxl', hint: '把菜交给她' },
    ],
    reward: { money: 8, affinity: 1, log: '我帮李秀兰拎了两袋菜。她一路都在说昨天的菜价。' },
  }),
  daily({
    id: 'd-cdw-parcel', name: '三号楼那件（日常）', tier: 'daily', type: 'errand', source: 'board',
    desc: '陈大伟又有一件三号楼的包裹。收件人还是不在家。',
    giver: 'cdw', turnIn: 'cdw',
    objectives: [
      { kind: 'talk', npc: 'cdw', hint: '去快递站取件' },
      { kind: 'visit', place: 'h2', hint: '送到苏家门口' },
      { kind: 'talk', npc: 'cdw', hint: '回快递站' },
    ],
    reward: { money: 10, affinity: 1, log: '我又替陈大伟送了一次三号楼的包裹。门口那块砖还在。' },
  }),
  daily({
    id: 'd-sqx-oden', name: '一份关东煮', tier: 'daily', type: 'errand', source: 'phone',
    desc: '孙倩倩留了一份关东煮，让你带给周文斌。',
    giver: 'sqx', turnIn: 'zwb',
    objectives: [
      { kind: 'talk', npc: 'sqx', hint: '去便利店拿关东煮' },
      { kind: 'talk', npc: 'zwb', hint: '送到星辰大厦' },
    ],
    reward: { money: 8, affinity: 1, log: '我替孙倩倩给周文斌带了一份关东煮。他盯着看了很久才吃。' },
  }),
  daily({
    id: 'd-ztz-paper', name: '一份晚报', tier: 'daily', type: 'errand', source: 'random',
    desc: '赵铁柱在门岗走不开。他让你把晚报捎给王建国。',
    giver: 'ztz', turnIn: 'wjg',
    objectives: [
      { kind: 'talk', npc: 'ztz', hint: '去门岗拿报纸' },
      { kind: 'talk', npc: 'wjg', hint: '送到林家' },
    ],
    reward: { money: 8, affinity: 1, log: '我替赵铁柱给王建国送了一份晚报。老王先看体育版。' },
  }),
  daily({
    id: 'd-gll-prop', name: '拍照的道具', tier: 'daily', type: 'errand', source: 'random',
    desc: '高露露要拍一组花店照片，缺一束道具花。',
    giver: 'gll', turnIn: 'gll',
    objectives: [
      { kind: 'talk', npc: 'gll', hint: '听她要什么花' },
      { kind: 'visit', place: 'flower', hint: '去婉婷花店拿花' },
      { kind: 'talk', npc: 'gll', hint: '把花带回去' },
    ],
    reward: { money: 10, affinity: 1, log: '我帮高露露拿了一束道具花。她拍了二十张，只发了一张。' },
  }),
  daily({
    id: 'd-hmm-pickup', name: '放学那十分钟', tier: 'daily', type: 'timed', source: 'school',
    desc: '韩梅梅晚十分钟到。她让你在学校门口看一眼张小米。',
    giver: 'hmm', turnIn: 'hmm',
    objectives: [
      { kind: 'talk', npc: 'hmm', hint: '答应帮她看孩子' },
      { kind: 'visit', place: 'schoolGate', hint: '16:00 后到学校门口' },
      { kind: 'talk', npc: 'hmm', hint: '告诉她孩子没事' },
    ],
    window: { from: 16, to: 18 },
    reward: { money: 8, affinity: 1, log: '我在学校门口替韩梅梅看了十分钟张小米。他一直在花坛边蹲着。' },
  }),
  daily({
    id: 'd-zxm-bugs', name: '西瓜虫（日常）', tier: 'daily', type: 'collect', source: 'board',
    desc: '小米的西瓜虫又越狱了。他说，再抓三只就关紧盖子。',
    giver: 'zxm', turnIn: 'zxm',
    objectives: [
      { kind: 'talk', npc: 'zxm', hint: '问小米跑了几只' },
      { kind: 'collect', places: ['schoolFlower', 'parkStone', 'homeYard'], hint: '抓回三只西瓜虫' },
      { kind: 'talk', npc: 'zxm', hint: '把虫子还给他' },
    ],
    reward: { money: 15, affinity: 1, log: '我又帮小米抓了三只西瓜虫。他发誓这次一定盖紧盖子。' },
  }),
  daily({
    id: 'd-lsy-books', name: '三本旧医书', tier: 'daily', type: 'collect', source: 'board',
    desc: '林守义在找三本旧医书。他说，书页比人记得牢。',
    giver: 'lsy', turnIn: 'lsy',
    objectives: [
      { kind: 'talk', npc: 'lsy', hint: '问他要找哪三本' },
      { kind: 'collect', places: ['antique', 'home', 'schoolGate'], hint: '找齐三本旧书' },
      { kind: 'talk', npc: 'lsy', hint: '把书送到诊所' },
    ],
    reward: { money: 15, affinity: 1, log: '我替林守义找了三本旧医书。他翻开一本，说这页他抄过。' },
  }),
  daily({
    id: 'd-zh-price', name: '问个挂牌价', tier: 'daily', type: 'talk', source: 'phone',
    desc: '郑好说，想买房的人可以先问问价。他今天在小区门口。',
    giver: 'zh', turnIn: 'zh',
    objectives: [
      { kind: 'talk', npc: 'zh', hint: '去小区门口找郑好' },
    ],
    reward: { money: 6, affinity: 1, log: '我找郑好问了一次挂牌价。他说，这个价还能谈。' },
  }),
  daily({
    id: 'd-xwt-ask', name: '问一句花语', tier: 'daily', type: 'talk', source: 'phone',
    desc: '谢婉婷说，今天的花适合送人。她让你来店里看看。',
    giver: 'xwt', turnIn: 'xwt',
    objectives: [
      { kind: 'talk', npc: 'xwt', hint: '去婉婷花店' },
    ],
    reward: { money: 6, affinity: 1, log: '我去花店问了一句花语。谢婉婷说，桔梗是“无望的爱”。' },
  }),
  daily({
    id: 'd-wjg-chess', name: '看一盘棋', tier: 'daily', type: 'talk', source: 'random',
    desc: '王建国在楼下摆棋，缺个看棋的人。',
    giver: 'wjg', turnIn: 'wjg',
    objectives: [
      { kind: 'talk', npc: 'wjg', hint: '去楼下看他下棋' },
    ],
    reward: { money: 6, affinity: 1, log: '我看王建国下了一盘棋。他让了赵铁柱车马炮，还是赢了。' },
  }),
  daily({
    id: 'd-sqx-night', name: '凌晨的便利店', tier: 'daily', type: 'talk', source: 'phone',
    desc: '孙倩倩发来消息：今天关东煮多煮了一份。',
    giver: 'sqx', turnIn: 'sqx',
    objectives: [
      { kind: 'talk', npc: 'sqx', hint: '夜里去便利店' },
    ],
    window: { from: 22, to: 24 },
    reward: { money: 6, affinity: 1, log: '凌晨的便利店，孙倩倩给我留了一份关东煮。她说，这个点没人说话。' },
  }),
  daily({
    id: 'd-wgf-med-night', name: '二十一点前', tier: 'daily', type: 'timed', source: 'random',
    desc: '吴桂芳的药快没了。她说，二十一点前送到就行。',
    giver: 'wgf', turnIn: 'wgf',
    objectives: [
      { kind: 'talk', npc: 'wgf', hint: '去拿药方' },
      { kind: 'visit', place: 'home', hint: '把药送到她家' },
      { kind: 'talk', npc: 'wgf', hint: '看她把药收好' },
    ],
    window: { from: 20, to: 23 },
    deadlineHour: 21,
    reward: { money: 20, affinity: 1, log: '我赶在二十一点前把药送到了吴桂芳家。她把药盒放在床头，才安心。' },
  }),
  daily({
    id: 'd-ljj-umbrella', name: '雨天的伞', tier: 'daily', type: 'timed', source: 'random',
    desc: '下雨了。罗建军还在滨河步道，车上只有一把伞。',
    giver: 'ljj', turnIn: 'ljj', prereq: { weather: 'rain' },
    objectives: [
      { kind: 'talk', npc: 'ljj', hint: '找罗建军拿伞' },
      { kind: 'visit', place: 'riverBench', hint: '把伞送到长椅' },
      { kind: 'talk', npc: 'ljj', hint: '回去告诉他' },
    ],
    reward: { money: 20, affinity: 1, log: '下雨天，我给罗建军送了一把伞。他说，这雨下得像他送女儿那年。' },
  }),
  daily({
    id: 'd-zh-vs-ztz', name: '单页和门禁（日常）', tier: 'daily', type: 'choice', source: 'board',
    desc: '郑好又想发单页，赵铁柱又在门口拦着。两个人都看着你。',
    giver: 'zh', turnIn: 'ztz',
    objectives: [
      { kind: 'talk', npc: 'zh', hint: '听郑好说' },
      { kind: 'talk', npc: 'ztz', hint: '和赵铁柱说' },
    ],
    choices: [
      { label: '帮郑好发单页', tag: '门禁·帮郑好', affinity: { npc: 'zh', delta: 1 }, log: '我帮郑好发了几张单页。赵铁柱叹了口气，没追。' },
      { label: '帮赵铁柱盯岗', tag: '门禁·帮赵铁柱', affinity: { npc: 'ztz', delta: 1 }, log: '我帮赵铁柱盯了一会儿岗。郑好把单页收回了包里。' },
    ],
    reward: { money: 20, affinity: 1, log: '单页和门禁，我又选了一次边。' },
  }),
  daily({
    id: 'd-wgf-cat', name: '给猫添水', tier: 'daily', type: 'long', source: 'random',
    desc: '吴桂芳的猫叫“守义”。她让你连着两天来给猫添水。',
    giver: 'wgf', turnIn: 'wgf',
    objectives: [
      { kind: 'talk', npc: 'wgf', hint: '去她家看看猫' },
      { kind: 'wait', days: 2, hint: '连续两天来添水' },
      { kind: 'talk', npc: 'wgf', hint: '告诉她水添好了' },
    ],
    reward: { money: 10, affinity: 1, log: '我帮吴桂芳给猫添了两天水。猫叫守义，她每天对着它念信。' },
  }),
];

export const QUESTS: QuestDef[] = [...MAIN, ...SIDE, ...CHAIN, ...DAILY, ...MAIN_EXTRA, ...SIDE_EXTRA, ...DAILY_EXTRA];

export const QUESTS_BY_ID: Record<string, QuestDef> = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

export const DAILY_QUESTS = [...DAILY, ...DAILY_EXTRA];
export const MAIN_QUESTS = [...MAIN, ...MAIN_EXTRA];
export const CHAIN_QUESTS = CHAIN;
