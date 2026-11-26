# 人生得分 + 成就系统 设计文档（v1）

> 作者：designer（life-sim-achievements 团队） · 状态：待实现 · 实现者照本文施工，评审按 §10 的断言验收。
> 依据：`docs/handoff-achievement-team.md`（需求原话与已确认口径）+ 现有源码（已逐一阅读，见各节的“触发点”）。

---

## 0. 一页纸摘要

- **人生分 = 五个维度分之和 + 成就奖励分**。五个维度：友情、学业、勤勉（任务/琐事/打工）、健康、阅历。
- 分数**只增不减**（单调）：坏行为体现为“没赚到”，而不是“被扣掉”。
- **友情分来自好感度的“历史最高档”**（每位居民记一个 peak），好感掉了再涨回来不重复给分 → 天然防刷，并且能从存档数据直接推出。
- **学业分来自课堂表现分（每节课）、期末考试（每年一次）、毕业成绩档**。
- 友情 7 阶、学业 6 阶，**友情第 5 阶「知交满巷」、学业第 4 阶「学霸」等都是成就**；另有 20+ 个独立成就，共 37 个。
- 纯前端计分核心 `src/score/`（不碰 DOM、可在 node 里测）+ 可替换的 `ScoreStore` 接口；默认实现把快照写进现有 `SaveData.score` 字段，自动随 localStorage 续档与 IndexedDB 玫瑰存档一起保存。
- **`SAVE_VERSION` 保持 2 不变**（改成 3 会让 `loadSave()` 直接丢掉所有旧档），新字段可选 + 内部 `score.v` 版本号 + 旧档“补记”迁移。
- UI：新快捷键 **L**（人生簿）、触屏新增「成就」键；解锁用独立的成就横幅队列（不抢 `hud.toast` 的唯一槽位）；年终结算显示“这一年 +N 人生分 / 新成就”；寿终结局显示总分、五维、称号、成就墙，并写入不随 `clearSave()` 消失的「历代人生」记录。

---

## 1. 需求理解

| 用户原话 | 理解 / 落地 |
|---|---|
| “后端得分系统：完成各种任务和生活琐事后给人生加分” | 计分引擎在浏览器本地运行（已确认不做服务器），但把“存在哪”抽成 `ScoreStore` 接口，未来接服务器只换实现。加分来源 = 任务完成 + 生活琐事（上课、考试、聊天、送礼、打工、看病、睡觉、吃饭、探索、过年）。 |
| “交朋友、提升别人好感度会增加友情分；友情分到某一阶（如第五阶）解锁成就” | 友情分 = 好感度提升的累计（按每位居民的历史最高档）+ 揭开秘密 + 每日寒暄。友情分划 7 阶，每阶一个成就，第 5 阶是重点成就。 |
| “学习系统：成绩达到一定高度时解锁成就” | 学业分 = 课堂表现 + 期末考试 + 毕业档。学业分 6 阶成就链 + “学神 / 满分 / 偏科天才 / 全面发展 / 优秀毕业生 / 教师推荐”等直接看成绩的成就。 |
| “由团队设计这套人生成就和加分系统” | 本文给出完整规则、分值、成就表、数据结构、UI 和实现切分。 |
| 已确认口径：兼容旧存档 | 旧档没有 `score` 字段 → 默认值 + 按现有存档数据“补记”（好感、秘密、已完成任务、考试、毕业），不崩溃。 |

---

## 2. 设计意见、风险与取舍（实现者必读）

1. **不要提升 `SAVE_VERSION`。** `src/core/save.ts` 的 `loadSave()` 写的是 `d.v !== SAVE_VERSION → return null`，版本号一改，所有玩家的续档会被当作“无存档”。做法：`SaveData` 加可选字段 `score?: ScoreSnapshot`，计分自己的结构版本放在 `score.v`（当前 1）。玫瑰存档 `SaveSlot.data` 就是 `SaveData`，自动兼容。
2. **友情分用“历史最高好感档（peak）”计，而不是累加每次 +1。** 好感会因多处下降：`yearReport.ts` 年度漂移（随机 −1）、送讨厌的礼物（`markGifted(-2)`）、任务选择、课堂被抓（`addFavor(-1)`）。若按“每次 +1 就给分”，玩家可以“掉了再刷回来”无限得分；按 peak 计，每位居民每档只给一次分，且**只需要读 `resident.affinity` 就能结算**——无论好感是从聊天、送礼、任务、课堂纸条还是年度漂移来的，都不用在每个改好感的地方插钩子（这些地方有 6 处以上，逐个插钩子极易漏）。
3. **分数单调不减。** 好感年度漂移是随机的，若扣分，玩家会因为“跳过今年”莫名掉分；人生分是“回忆的勋章”，不该倒退。负面行为的代价已经由现有系统（好感、健康、金钱）承担。
4. **数值必须按真实时间轴校准：一岁只有 3 个游戏日（`AGING_DAYS = 3`）。** 6~18 岁上学 13 年 ≈ 39 天、约 28 个工作日，每天最多 2 节重点课 → 一生最多约 56 节课、13 次期末考（每年 1 次）。整个一生约 282 个游戏日。所有阶梯阈值都按这个量级定，否则“学业第 6 阶”会永远拿不到。
5. **“打工”目前没有独立系统**，工作来自带金钱奖励的任务（如 `main-first-job`、`adult-main-paycheck`、`adult-daily-overtime`）。本设计把“带钱的任务”视作打工，额外记勤勉分；预留 `work_shift` 事件，将来做打工玩法时直接接入。
6. **`hud.toast` 只有一个槽位，后来的会覆盖先前的。** 任务完成时 `questManager.complete()` 已经在 toast，若成就解锁也用 toast，玩家就看不到“完成：XX”了。解锁提示必须走独立的横幅队列（§8.1）。
7. **寿终会 `clearSave()` 然后 `location.reload()`**，一生的分数和成就会随之消失。需要在清档前把“本世总结”写入一个独立的 localStorage 键 `life-sim:legacy`（历代人生，最多 20 条）。这是对用户需求的补充建议：成就感需要“留下来”。
8. **本地计分无法防作弊**（玩家可改 localStorage、可反复读玫瑰存档）。这是“纯前端”口径下的已知取舍；防刷只针对“正常游玩中的重复刷分”。将来接服务器时可由 `RemoteScoreStore` 上报事件流做校验，接口已预留 `append()`。
9. **用户说的“第五阶”有两种可能的理解**：友情分的第 5 阶，或单个居民好感到 5（好感上限正好是 5）。两者都做：友情第 5 阶成就「知交满巷」+ 单人好感到 5 的成就「挚友」。
10. **计分核心不能依赖浏览器**（不读 `gameDayIndex()`、不碰 `window`）。天数、年龄由调用方通过 `clock` 参数传进来，这样才能写 node 测试；`test/quest-logic-check.mjs` 里的假 ctx 没有 `score`，所有新加的调用必须写成 `ctx.score?.emit(...)`，不能让原有 157 条断言回归。

---

## 3. 计分模型

### 3.1 维度

| 维度 id | 名称 | 来源（概括） |
|---|---|---|
| `friend` | 友情 | 好感历史最高档、揭开秘密、每日寒暄、喜欢的礼物 |
| `study` | 学业 | 课堂表现、期末考试、毕业档 |
| `diligence` | 勤勉 | 主线/支线/日常任务、任务链完结、打工（带钱任务） |
| `health` | 健康 | 治好病、挺过病危、在家睡觉、按时吃饭 |
| `exp` | 阅历 | 过年（长一岁）、人生里程碑年龄、走过新区域 |

### 3.2 与人生总分的关系

```
lifeScore = friend + study + diligence + health + exp + Σ(已解锁成就.bonus)
```

- 每个维度的分直接就是“人生分”单位，**不加权**（加权会让玩家算不清，规则透明比平衡精确更重要）。
- 成就奖励分 `bonus` 单独累计（显示为“成就 +N”），不归入任何维度，避免“维度分 → 解锁阶梯成就 → 成就分又回到维度分 → 再解锁”的循环。
- 每个维度另有“阶”（§3.4），阶只用于展示与成就，不改变分值。
- 人生称号（寿终显示）按 `lifeScore`：

| 区间 | 称号 |
|---|---|
| 0–499 | 平平淡淡的一生 |
| 500–1199 | 踏踏实实的一生 |
| 1200–2199 | 充实的一生 |
| 2200–3499 | 精彩的一生 |
| ≥3500 | 传奇的一生 |

> 粗估上限（全情投入）：友情 ~1500、学业 ~1350、勤勉 ~2000、健康 ~500、阅历 ~400，加成就 ~1500，合计 ~7000；一个“正常玩”的玩家约 1500–3000。阈值集中放在 `rules.ts` 常量表，方便调。

### 3.3 加分来源总表

“触发点”一栏写明实现时插钩子（事件型）或在 `sync()` 里从状态推导（推导型）的位置。所有“每日上限”按游戏日 `gameDayIndex()` 统计，计数器在引擎状态 `daily` 里，跨日自动清零。

| # | 来源 | 维度 | 分值 / 公式 | 触发点（文件 · 函数） | 类型 | 防刷限制 |
|---|---|---|---|---|---|---|
| F1 | 好感创新高 | friend | 每位居民 peak 每升 1 档：1档 +5、2档 +5、3档 +10、4档 +10、5档 +20（单人累计最多 50） | `ScoreEngine.sync()` 遍历 `ctx.overworld.residents.list` 的 `affinity`，与 `state.peaks[id]` 比较 | 推导 | 每人每档只给一次；好感下降不扣，回升到旧 peak 以内不给 |
| F2 | 揭开秘密 | friend | +15 / 人 | `sync()` 读 `resident.secretRevealed`（揭示点在 `src/ui/dialogue.ts` `chat()`） | 推导 | 每人一次（`state.secrets` 集合） |
| F3 | 每日寒暄 | friend | +1 / 次 | `src/ui/dialogue.ts` `chat()` 中 `r.canChatBonus()` 为真、`markChatted()` 之后 emit `chat` | 事件 | 同一居民每日 1 次（沿用 `canChatBonus`）；全城每日最多 3 分 |
| F4 | 送出喜欢的礼物 | friend | +3 / 次 | `dialogue.ts` `give()` 中 `g.like.includes(item)` 分支 emit `gift{liked:1}` | 事件 | 沿用 `canGiftToday()`（每人每日一次）；全城每日最多 2 次计分 |
| S1 | 上完一节课 | study | `1 + clamp(floor((表现分 − 50) / 10), 0, 5)` → 每节 1~6 分；迟到只给基础 1 分 | `src/systems/classroom.ts` `buildSummary()`（正常下课与 F 快进都走这里）emit `class{subject, score, late}` | 事件 | 早退 `leaveEarly()` 不 emit；每日最多 2 节计分（与 `canAttend` 的 2 节重点课一致，引擎再兜一次） |
| S2 | 期末考试 | study | `答对题数 × 3`（10 题满 30）；正确率 ≥80% 再 +20；满分再 +20 | `sync()` 读 `schoolState.lastExamAge / lastExamCorrect / lastExamTotal`（写入点 `src/scenes/examScene.ts` `submit()` → `recordExam()`）；可选在 `submit()` 后立即调用 `ctx.score?.sync()` 让提示即时出现 | 推导 | 以 `lastExamAge` 为键，每个年龄只计一次（`state.examAges`）；最好成绩另记 `bestExam` |
| S3 | 毕业 | study | 成绩档 A +80 / B +40 / C +15；教师推荐 +30 | `sync()` 读 `schoolState.graduated / gradeTag / recommendation`（写入点 `schoolState.graduate()`） | 推导 | `state.flags.graduated` 只结算一次 |
| D1 | 完成主线任务 | diligence | 30 × 重复衰减 | `src/quest/questManager.ts` `complete()` 末尾 emit `quest{id, tier, repeatCount(完成前), chainEnd, paid}` | 事件 | 衰减同金钱：首次 ×1、第 2 次 ×0.5、之后 ×0.25（四舍五入） |
| D2 | 完成支线任务 | diligence | 15 × 重复衰减 | 同上 | 事件 | 同上 |
| D3 | 日常琐事（`tier:'daily'` 的任务，如“一碗豆腐脑”“给猫添水”） | diligence | 5 × 重复衰减 | 同上 | 事件 | 同上；**每日最多 3 件计分** |
| D4 | 任务链完结（最后一环） | diligence | +20 | 同上，`def.chain && def.chain.ring === def.chain.total` | 事件 | 每条链一次（链任务本身不可重复） |
| D5 | 打工（实际拿到钱的任务，`paid ≥ 10`） | diligence | +5 | 同上，用 `complete()` 内已算好的 `paid` | 事件 | 受现有 `MONEY_CAP`（每日 30 元）约束，天然每日 ≤3 次 |
| D6 | （预留）打工班次 | diligence | +8 / 班 | 将来的打工系统 emit `work_shift` | 事件 | 每日 1 班 |
| H1 | 病被治好 | health | `治疗` +15；`硬扛自愈` +5；`畸形愈合`/`落下病根` 0 | `src/core/health.ts` `cure(player, how)` 内调用新回调 `this.onCured?.(id, how)`，main.ts 里接到 `ctx.score.emit({type:'cured', ...})` | 事件 | 疾病为随机发生，不可主动刷；每日最多 1 次计分 |
| H2 | 挺过病危 | health | +20 | `src/ui/medical.ts` `discharge()` 中 `mode === 'crisis'` 分支 emit `crisis_survived` | 事件 | 每日 1 次 |
| H3 | 在家睡觉 | health | +2 | `src/scenes/indoorScene.ts` 床菜单“休息到明早”回调 emit `rest` | 事件 | 每日 1 次 |
| H4 | 按时吃饭（便当） | health | +1 | `indoorScene.ts` `openShop()` 的“便当”回调 emit `meal{healthy:true}`；路边摊不给分 | 事件 | 每日 1 次 |
| E1 | 长了一岁 | exp | +3 / 岁 | `sync()` 比较 `player.age` 与 `state.lastAge` | 推导 | 每个年龄一次 |
| E2 | 里程碑年龄 | exp | 18 岁 +20、30 +20、60 +30、80 +30、100 +50 | 同上 | 推导 | 每个里程碑一次 |
| E3 | 走到新区域 | exp | +5 / 区域（共 9 个，不含“郊外”） | `src/scenes/overworldScene.ts` 区域切换处（与 `ctx.quests.onRegionChange(name)` 同一位置）emit `region{name}` | 事件 | `state.regions` 集合去重 |

**`sync()` 的调用时机**（推导型来源都在这里结算）：
- `ScoreEngine.tick(dt)`：主循环每帧调用，内部每 1 秒（真实时间）做一次 `sync()`；
- 事件型 `emit()` 处理完后顺手 `sync()` 一次（让“聊天 → 好感 +1 → 友情新高 → 解锁”一气呵成）；
- `examScene.submit()`、`overworldScene.skipYear()` 生成报表**之后**、`LifeEndScene` 构造时各显式调用一次。

### 3.4 维度分阶

阶 = 维度分达到阈值的最高档。阈值表（写在 `src/score/rules.ts`）：

**友情（7 阶）**

| 阶 | 阈值 | 阶名 | 大约需要 |
|---|---|---|---|
| 1 | 20 | 点头之交 | 1 人到 3 心 |
| 2 | 60 | 熟面孔 | 3 人到 3 心 |
| 3 | 120 | 街坊朋友 | 5 人到 3 心 + 几次寒暄 |
| 4 | 200 | 知心人 | 若干人 4~5 心 + 1~2 个秘密 |
| **5** | **320** | **知交满巷** | 约 5 位挚友 + 3 个秘密 + 日常寒暄 |
| 6 | 480 | 一呼百应 | 大半条街都是朋友 |
| 7 | 700 | 人间值得 | 接近全城挚友 |

**学业（6 阶）**

| 阶 | 阈值 | 阶名 |
|---|---|---|
| 1 | 20 | 开蒙 |
| 2 | 80 | 用功 |
| 3 | 180 | 优等生 |
| 4 | 320 | 学霸 |
| 5 | 500 | 学神之路 |
| 6 | 750 | 状元之才 |

（学业上限 ≈ 56 节 × 6 + 13 次考 × 70 + 110 ≈ 1350，第 6 阶需要大半学年认真上课 + 多次 80% 以上考试。）

**勤勉 / 健康 / 阅历（各 3 阶，仅用于展示与成就）**

| 维度 | 1 阶 | 2 阶 | 3 阶 |
|---|---|---|---|
| 勤勉 | 100 热心肠 | 400 闲不住 | 1000 劳模 |
| 健康 | 30 会照顾自己 | 120 身体是本钱 | 300 养生达人 |
| 阅历 | 50 见过世面 | 150 走南闯北 | 300 阅尽人间 |

---

## 4. 成就表

约定：
- `id` 全局唯一、蛇形命名，**一经发布不得改名**（存档里存的是 id）。
- 解锁条件全部用 `ScoreFacts`（§5.3）可判定的数据写成纯函数 `test(f)`；`f` 由存档可还原的状态构造，因此读档后能重新判定、也能给旧档补发。
- `bonus` 计入人生总分；`hidden: true` 表示未解锁时在列表里显示为「？？？」+ 提示语。
- 成就一旦解锁永不撤销（即使条件后来不再成立，例如好感掉了）。

### 4.1 友情（dim = friend）

| id | 名称 | 描述 | 解锁条件（`f` 字段） | bonus |
|---|---|---|---|---|
| `friend_tier_1` | 点头之交 | 友情分第 1 阶 | `f.dims.friend >= 20` | 10 |
| `friend_tier_2` | 熟面孔 | 友情分第 2 阶 | `f.dims.friend >= 60` | 20 |
| `friend_tier_3` | 街坊朋友 | 友情分第 3 阶 | `f.dims.friend >= 120` | 30 |
| `friend_tier_4` | 知心人 | 友情分第 4 阶 | `f.dims.friend >= 200` | 40 |
| `friend_tier_5` | 知交满巷 | 友情分第 5 阶：这条街上，到处是记得你的人 | `f.dims.friend >= 320` | 80 |
| `friend_tier_6` | 一呼百应 | 友情分第 6 阶 | `f.dims.friend >= 480` | 100 |
| `friend_tier_7` | 人间值得 | 友情分第 7 阶 | `f.dims.friend >= 700` | 150 |
| `first_friend` | 第一个朋友 | 和某位居民的好感第一次到 3 心 | `f.peaks` 中存在值 ≥3 | 20 |
| `soulmate` | 挚友 | 和某位居民的好感到 5 心 | `f.peaks` 中存在值 ≥5 | 40 |
| `good_neighbors` | 好街坊 | 5 位居民好感曾到 3 心 | `count(f.peaks ≥3) >= 5` | 50 |
| `secret_keeper` | 秘密守护人 | 揭开 5 位居民的秘密 | `f.secretCount >= 5` | 50 |
| `deskmate` | 同桌的你 | 和同桌蒋一鸣的好感到 4 心 | `f.peaks.jym >= 4` | 30 |

### 4.2 学业（dim = study）

| id | 名称 | 描述 | 解锁条件 | bonus |
|---|---|---|---|---|
| `study_tier_1` | 开蒙 | 学业分第 1 阶 | `f.dims.study >= 20` | 10 |
| `study_tier_2` | 用功 | 学业分第 2 阶 | `f.dims.study >= 80` | 20 |
| `study_tier_3` | 优等生 | 学业分第 3 阶 | `f.dims.study >= 180` | 30 |
| `study_tier_4` | 学霸 | 学业分第 4 阶 | `f.dims.study >= 320` | 50 |
| `study_tier_5` | 学神之路 | 学业分第 5 阶 | `f.dims.study >= 500` | 80 |
| `study_tier_6` | 状元之才 | 学业分第 6 阶 | `f.dims.study >= 750` | 120 |
| `first_class` | 第一堂课 | 上完人生第一节课 | `f.counters.classes >= 1` | 10 |
| `xueshen` | 学神 | 一次期末考试正确率 ≥80% | `f.bestExam.ratio >= 0.8` | 40 |
| `perfect_exam` | 满分卷 | 期末考试全对 | `f.bestExam.correct > 0 && f.bestExam.correct === f.bestExam.total` | 60 |
| `top_subject` | 偏科天才 | 任一科目掌握度 ≥90 | `max(f.school.subjects[语数英科]) >= 90` | 40 |
| `all_round` | 全面发展 | 语数英科四科都 ≥80 | `min(f.school.subjects[语数英科]) >= 80` | 60 |
| `grad_a` | 优秀毕业生 | 以 A 档毕业 | `f.school.graduated && f.school.gradeTag === 'A'` | 60 |
| `recommended` | 教师推荐 | 毕业时拿到教师推荐 | `f.school.recommendation` | 30 |

### 4.3 勤勉（dim = diligence）

| id | 名称 | 描述 | 解锁条件 | bonus |
|---|---|---|---|---|
| `quest_first` | 初出茅庐 | 完成第一件任务 | `f.counters.questsDone >= 1` | 10 |
| `quest_30` | 热心肠 | 累计完成 30 件任务（含重复） | `f.counters.questsDone >= 30` | 50 |
| `chores_50` | 生活家 | 累计完成 50 件日常琐事 | `f.counters.dailyDone >= 50` | 50 |
| `main_story` | 人生主线 | 完成 10 个不同的主线任务 | `f.counters.mainDistinct >= 10` | 80 |
| `first_pay` | 第一份工资 | 完成「第一份工作」或「月底的班」 | `f.questsCompleted` 含 `main-first-job` 或 `adult-main-paycheck` | 30 |
| `diligence_tier_3` | 劳模 | 勤勉分第 3 阶（≥1000） | `f.dims.diligence >= 1000` | 80 |

### 4.4 健康（dim = health）

| id | 名称 | 描述 | 解锁条件 | bonus |
|---|---|---|---|---|
| `cured_first` | 病去如抽丝 | 第一次把病治好 | `f.counters.cured >= 1` | 10 |
| `crisis_survivor` | 鬼门关前 | 挺过一次病危 | `f.counters.crisis >= 1` | 30（hidden） |
| `early_to_bed` | 规律作息 | 累计在家睡 30 晚 | `f.counters.rests >= 30` | 30 |

### 4.5 阅历（dim = exp）

| id | 名称 | 描述 | 解锁条件 | bonus |
|---|---|---|---|---|
| `explorer` | 走遍小城 | 到过全部 9 个区域 | `f.regionCount >= 9` | 40 |
| `adult` | 成年了 | 活到 18 岁 | `f.age >= 18` | 10 |
| `sixty` | 花甲 | 活到 60 岁 | `f.age >= 60` | 30 |
| `centenarian` | 百岁人生 | 活到 100 岁 | `f.age >= 100` | 100 |

合计 **38 个成就**（友情 12、学业 13、勤勉 6、健康 3、阅历 4）。友情链 7 阶（含第 5 阶「知交满巷」）、学业链 6 阶。

---

## 5. 数据结构与存储接口（TypeScript 草案）

目录：`src/score/`。除 `facts.ts` 外均为**纯模块**：不 import `daynight`、不碰 `window/document`，只依赖彼此。

### 5.1 `src/score/types.ts`

```ts
export type Dim = 'friend' | 'study' | 'diligence' | 'health' | 'exp';
export const DIMS: readonly Dim[] = ['friend', 'study', 'diligence', 'health', 'exp'];

/** 调用方传入的“当前时刻”，核心不自己读时间（便于 node 测试） */
export interface ScoreClock {
  day: number; // gameDayIndex()
  age: number; // player.age
}

/** 事件型加分来源（推导型来源不走事件，由 sync(facts) 结算） */
export type ScoreEvent =
  | { type: 'quest'; id: string; tier: 'main' | 'side' | 'daily'; repeatCount: number; chainEnd: boolean; paid: number }
  | { type: 'class'; subject: string; score: number; late: boolean }
  | { type: 'chat'; npc: string }
  | { type: 'gift'; npc: string; liked: -1 | 0 | 1 }
  | { type: 'cured'; disease: string; how: string }
  | { type: 'crisis_survived' }
  | { type: 'rest' }
  | { type: 'meal'; healthy: boolean }
  | { type: 'region'; name: string }
  | { type: 'work_shift'; job: string }; // 预留

/** 一次加分的流水（供年终结算、调试、未来服务器上报） */
export interface ScoreGain {
  dim: Dim;
  pts: number;
  reason: string;   // 例：'quest:main-first-job'、'peak:jym:3'、'exam:12'
  day: number;
  age: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  dim: Dim;
  bonus: number;
  hidden?: boolean;
  hint?: string;               // hidden 时显示的提示
  test: (f: ScoreFacts) => boolean;
}

export interface UnlockRecord { day: number; age: number }

/** 引擎内存状态（与快照同构，Set/Map 在快照里转数组） */
export interface ScoreState {
  dims: Record<Dim, number>;
  bonus: number;                          // 成就奖励分合计
  peaks: Record<string, number>;          // 居民 id → 历史最高好感档 0..5
  secrets: string[];                      // 已计分的秘密（居民 id）
  examAges: number[];                     // 已计分的考试年龄
  bestExam: { correct: number; total: number; ratio: number };
  regions: string[];
  lastAge: number;                        // 已结算到的年龄（E1/E2）
  flags: { graduated: boolean };
  counters: {
    classes: number; questsDone: number; dailyDone: number; mainDistinct: number;
    cured: number; crisis: number; rests: number; chats: number; gifts: number;
  };
  mainDone: string[];                     // 去重用
  daily: { day: number; chat: number; gift: number; chores: number; classes: number;
           cured: number; crisis: number; rest: number; meal: number; work: number };
  achievements: Record<string, UnlockRecord>; // 含未知 id（来自更新版本），原样保留
  ledger: { gained: Record<Dim, number>; bonus: number; unlocked: string[] }; // 自上次年终结算以来
  backfilled: boolean;                    // 是否已对旧档补记
}

export const SCORE_SCHEMA = 1;
export interface ScoreSnapshot extends ScoreState { v: number }

/** 判定成就用的只读事实（由 facts.ts 从 ctx + state 组装） */
export interface ScoreFacts {
  age: number;
  dims: Record<Dim, number>;
  peaks: Record<string, number>;
  secretCount: number;
  bestExam: { correct: number; total: number; ratio: number };
  school: { subjects: Record<string, number>; graduated: boolean; gradeTag: 'A' | 'B' | 'C'; recommendation: boolean };
  counters: ScoreState['counters'];
  questsCompleted: readonly string[];
  regionCount: number;
}

/** sync() 需要的世界状态（facts.ts 从 ctx 读出，测试里手写） */
export interface WorldView {
  clock: ScoreClock;
  residents: { id: string; affinity: number; secretRevealed: boolean }[];
  school: {
    lastExamAge: number; lastExamCorrect: number; lastExamTotal: number;
    subjects: Record<string, number>; graduated: boolean; gradeTag: 'A' | 'B' | 'C'; recommendation: boolean;
  };
  questsCompleted: readonly string[];
}
```

### 5.2 `src/score/rules.ts`（纯函数 + 常量）

```ts
export const PEAK_POINTS = [0, 5, 10, 20, 30, 50];          // 累计：好感档 → 友情分
export const QUEST_BASE = { main: 30, side: 15, daily: 5 };
export const REPEAT_DECAY = (n: number) => (n === 0 ? 1 : n === 1 ? 0.5 : 0.25);
export const DAILY_CAPS = { chat: 3, gift: 2, chores: 3, classes: 2, cured: 1, crisis: 1, rest: 1, meal: 1, work: 1 };
export const TIERS: Record<Dim, number[]> = {
  friend: [20, 60, 120, 200, 320, 480, 700],
  study: [20, 80, 180, 320, 500, 750],
  diligence: [100, 400, 1000],
  health: [30, 120, 300],
  exp: [50, 150, 300],
};
export const TIER_NAMES: Record<Dim, string[]> = { /* §3.4 */ };
export const MILESTONE_AGES: Record<number, number> = { 18: 20, 30: 20, 60: 30, 80: 30, 100: 50 };
export const LIFE_TITLES: [number, string][] = [[3500, '传奇的一生'], [2200, '精彩的一生'], [1200, '充实的一生'], [500, '踏踏实实的一生'], [0, '平平淡淡的一生']];

export function classPoints(score: number, late: boolean): number;   // S1
export function examPoints(correct: number, total: number): number;  // S2
export function gradPoints(tag: 'A'|'B'|'C', rec: boolean): number;  // S3
export function questPoints(tier, repeatCount, chainEnd, paid): number; // D1~D5（不含每日上限，上限在引擎里扣）
export function tierOf(dim: Dim, pts: number): number;               // 0 = 未入阶
export function lifeTitle(total: number): string;
```

### 5.3 `src/score/engine.ts`

```ts
export class ScoreEngine {
  constructor(store: ScoreStore = new SaveFieldScoreStore());

  readonly state: ScoreState;                // 只读访问；修改只能走下面的方法

  /** 事件型加分。返回本次实际加的分（受每日上限/衰减后，可能为 0） */
  emit(ev: ScoreEvent, clock: ScoreClock): ScoreGain[];

  /** 推导型结算：好感 peak、秘密、考试、毕业、年龄。幂等，可任意频繁调用 */
  sync(view: WorldView): ScoreGain[];

  /** 用 facts 判定全部成就，返回新解锁的定义；silent=true 时不触发监听（旧档补记用） */
  evaluate(facts: ScoreFacts, clock: ScoreClock, silent?: boolean): AchievementDef[];

  total(): number;                           // Σdims + bonus
  tier(dim: Dim): number;

  onUnlock(cb: (a: AchievementDef) => void): void;
  onGain(cb: (g: ScoreGain) => void): void;  // 可选：属性面板“+N”闪字

  /** 年终结算取走“自上次结算以来”的账并清零 */
  consumeLedger(): ScoreState['ledger'];

  // —— 存档 ——
  snapshot(): ScoreSnapshot;
  /** 完全替换当前状态（玫瑰存档中途读档也要先 reset）；raw 缺失/损坏 → 默认值 */
  restore(raw: unknown): void;
  /** 旧档补记：state.backfilled 为 false 时由 save.ts 调用一次，见 §6 */
  backfill(view: WorldView, extra: { questRuntimes: { id: string; tier: string; repeatCount: number; status: string }[] }): { pts: number; unlocked: number };
  reset(): void;

  /** 主循环：每 1 秒调用一次 viewProvider() → sync() → evaluate() */
  bind(viewProvider: () => { view: WorldView; facts: () => ScoreFacts } | null): void;
  tick(dt: number): void;
}
```

要点：
- `emit()` 进入时先 `rollDaily(clock.day)`：`state.daily.day !== clock.day` 时把每日计数清零。
- 每一笔加分都写入 `ledger.gained[dim]` 并通知 `onGain`；成就解锁写 `ledger.unlocked`。
- `evaluate()` 只检查尚未解锁的 id；解锁时 `state.bonus += def.bonus`。
- 引擎不持有 ctx；与游戏的胶水全部在 `facts.ts`。

### 5.4 `src/score/facts.ts`（唯一接触 ctx 的模块）

```ts
export function worldView(ctx: GameContext): WorldView;     // 读 residents / schoolState / quests / gameDayIndex / player.age
export function buildFacts(ctx: GameContext, s: ScoreState): ScoreFacts;
export function clockOf(ctx: GameContext): ScoreClock;
```
`QuestManager` 需新增只读访问器 `completedIds(): string[]`（返回 `[...this.completed]`），其余字段都已是 public。

### 5.5 `src/score/store.ts`：ScoreStore 接口与默认实现

```ts
/** 人生分的持久化边界。引擎只认这个接口；换服务器只需换实现。 */
export interface ScoreStore {
  readonly kind: 'save-field' | 'memory' | 'remote';
  /** 从一份存档载体中读出计分快照；没有（旧档）返回 null */
  read(save: SaveData | null): unknown | null;
  /** 把快照写进存档载体（captureSave 调用；localStorage 续档与玫瑰存档共用同一份 SaveData） */
  write(save: SaveData, snap: ScoreSnapshot): void;
  /** 可选：逐条事件上报（本地实现为空；服务器实现可批量 POST 做校验） */
  append?(gain: ScoreGain): void;
  /** 一生结束时归档本世总结（不随 clearSave 删除） */
  archiveLife(rec: LifeRecord): void;
  /** 历代人生（新的在前） */
  listLegacy(): LifeRecord[];
}

export interface LifeRecord {
  name: string; endedAt: number; age: number;
  total: number; dims: Record<Dim, number>; title: string;
  achievements: string[];          // 解锁的 id
}

export const LEGACY_KEY = 'life-sim:legacy';
export const LEGACY_MAX = 20;

/** 默认实现：计分快照住在 SaveData.score；历代人生住在 localStorage[LEGACY_KEY] */
export class SaveFieldScoreStore implements ScoreStore {
  readonly kind = 'save-field';
  read(save: SaveData | null) { return save?.score ?? null; }
  write(save: SaveData, snap: ScoreSnapshot) { save.score = snap; }
  archiveLife(rec: LifeRecord) { /* try{ 读数组 → unshift → slice(0, LEGACY_MAX) → setItem }catch{} */ }
  listLegacy() { /* try{ JSON.parse ?? [] }catch{ return [] } 且过滤非对象 */ }
}

/** 测试 / 无痕模式用 */
export class MemoryScoreStore implements ScoreStore { kind = 'memory' as const; /* 内存数组 */ }
```

> 为什么快照写进 `SaveData` 而不是另开一个 localStorage 键：玫瑰存档（IndexedDB 10 槽）存的是整份 `SaveData`；如果分数另存，读第 3 号槽时人生分仍是“当前这一世”的，会和存档里的时间点对不上。写进 `SaveData` 后两种存档自动一致，`saveSlots.ts` 不需要改。
> 未来 `RemoteScoreStore`：`read/write` 仍走 SaveData 作为本地缓存，`append()` 上报流水，`archiveLife()` 提交排行榜。

### 5.6 save.ts 改动

```ts
export interface SaveData {
  ...
  score?: ScoreSnapshot; // v2 新增可选字段；旧档无此字段
}
// captureSave(): 构造完 data 后  ctx.score?.store.write(data, ctx.score.snapshot());
// restoreQuests(): ctx.quests.restore(...) 之后追加  restoreScore(ctx, d);
export function restoreScore(ctx: GameContext, d: SaveData): void; // 见 §6
```
放在 `restoreQuests()` 末尾的原因：三个读档入口（`main.ts`、`creationScene.continueSaved()`、`savePanel` 读槽）都已调用 `restorePlayer + restoreQuests`，这样一处改动全覆盖；且补记需要任务状态已恢复。

---

## 6. 旧存档迁移 / 默认值 / 版本处理

### 6.1 版本策略

| 层 | 字段 | 规则 |
|---|---|---|
| 外层存档 | `SaveData.v` | **保持 2**。`loadSave()` 不改。 |
| 计分快照 | `SaveData.score.v` | 当前 `SCORE_SCHEMA = 1`。`restore(raw)` 按 `v` 走迁移链 `migrations[v]`（v1 起步时为空）。 |
| 未来版本 | `score.v > SCORE_SCHEMA` | 不崩：逐字段按“缺失取默认、类型不对取默认”读入；`achievements` 中未知 id **原样保留**（不显示、不计 bonus 变化，`bonus` 取存档值）。 |

### 6.2 `restore(raw)` 的默认值规则

`restore` 先 `reset()` 到 `defaultState()`，再逐字段“有就用、类型不对就忽略”：
- 数字字段：`Number.isFinite(x) ? x : 默认`，维度分下限 0；
- 数组字段：`Array.isArray(x) ? x.filter(合法) : []`；
- `peaks`：只接收 0..5 的数字；
- `achievements`：只接收 `{day:number, age:number}` 形状的值；
- `daily.day` 不匹配当天时由 `rollDaily` 清零（不需要迁移）。

### 6.3 旧档补记（`restoreScore` 的流程）

```
raw = ctx.score.store.read(d)
ctx.score.restore(raw)                 // raw 为 null → 默认状态，backfilled=false
if (!ctx.score.state.backfilled) {
  const r = ctx.score.backfill(worldView(ctx), { questRuntimes })
  if (r.pts > 0) ctx.hud.toast(`已根据旧存档补记人生分 ${r.pts}，补发成就 ${r.unlocked} 个`)
}
```
`backfill()` 用存档里能还原的数据一次性结算（`silent` 解锁，避免 10 个横幅刷屏）：
- **好感**：每位居民 `peak = 当前 affinity`，按 `PEAK_POINTS` 给分（历史最高已不可知，取当前值，偏保守）；
- **秘密**：`secretRevealed` 的居民各 +15；
- **考试**：只有最近一次（`lastExamAge ≥ 0` 时按 `lastExamCorrect/Total` 计 S2，并记入 `examAges`、`bestExam`）；
- **毕业**：`graduated` 则按 S3 计；
- **任务**：遍历任务运行时 `status==='completed'` 或 `repeatCount>0` 的条目，按 `Σ_{k<repeatCount} round(QUEST_BASE[tier] × REPEAT_DECAY(k))` 计 D1~D3（逐次四舍五入，与实时计分一致：side 两次 = 15 + 8 = 23）（不套每日上限，不计 D4/D5——旧档无从得知金额）；`counters.questsDone/dailyDone/mainDistinct` 同步补齐；
- **年龄**：`lastAge = 6`，然后按 E1/E2 补到当前年龄；
- **无法补的**：课堂次数、聊天、睡觉、区域、看病 → 从 0 开始（文档化的已知损失）；
- 最后 `evaluate(facts, clock, silent=true)`，`backfilled = true`。

全新开局（`CreationScene` 新建角色）同样会走默认状态；为避免新局被当成“旧档补记”，**新局在 `setCharacter` 之后把 `backfilled` 置 true**（或者：`restoreScore` 只在读档路径调用，`ScoreEngine` 构造默认就是 `backfilled: true`，`restore(null)` 时才置 false —— 推荐后者，更不易出错）。

---

## 7. 引擎接入点清单（钩子一览）

| 文件 | 位置 | 改动 |
|---|---|---|
| `src/context.ts` | `GameContext` | 新增 `score: ScoreEngine;` |
| `src/main.ts` | 构造 ctx | `score: new ScoreEngine()`；`ctx.score.bind(() => ctx.player.stats ? {...} : null)`；`ctx.score.onUnlock(a => hud.achievement(a))`；`health.onCured = (id, how) => ctx.score.emit({type:'cured', disease:id, how}, clockOf(ctx))`；帧循环里 `if (!lifeEnded) ctx.score.tick(dt)`；暴露 `window.__score` 调试钩子 |
| `src/quest/questManager.ts` | `complete()` 末尾（`rt.repeatCount += 1` **之前**取 `repeatCount`） | `ctx?.score?.emit({type:'quest', ...}, ...)`；新增 `completedIds()` |
| `src/ui/dialogue.ts` | `chat()`：`markChatted()` 后；`give()`：like 分支 | emit `chat` / `gift` |
| `src/systems/classroom.ts` | `buildSummary()` | emit `class{subject, score, late: this.late > 0}` |
| `src/scenes/examScene.ts` | `submit()` 中 `recordExam` 之后 | `ctx.score.sync(...)`（即时结算 S2 与学神/满分成就） |
| `src/core/health.ts` | `cure()` | 新增可选回调字段 `onCured?: (id: string, how: string) => void` 并调用 |
| `src/ui/medical.ts` | `discharge()` crisis 分支 | emit `crisis_survived` |
| `src/scenes/indoorScene.ts` | 床“休息到明早”、便利店“便当” | emit `rest` / `meal{healthy:true}` |
| `src/scenes/overworldScene.ts` | 区域切换处；`skipYear()`；按键 | emit `region`；结算报表后 `sync` 并把 `consumeLedger()` 放进 `report.score`；`KeyL` 打开成就面板 |

所有调用写成 `ctx.score?.…`（类型上是必选，但运行时对测试桩宽容）。

---

## 8. UI 落点

### 8.1 解锁提示（成就横幅）

- `src/ui/hud.ts` 新增 `achievement(def)`：推入队列，**不影响** `toast()`。
- 绘制：画面顶部居中、位于区域 toast（y=44~72）下方，y≈84，宽 ≤ 520，金色描边：
  `🏆 成就解锁 · 知交满巷  +80` / 第二行灰字描述。每条显示 3 秒、淡出 0.3 秒，队列依次播放；队列超过 4 条时合并为「又解锁了 N 个成就（L 查看）」。
- 播放 `arpeggio([523.25, 659.25, 783.99])`（`src/core/sfx.ts` 已有）。
- 在 `Hud.draw()` 与 `Hud.drawIndoor()` 中都绘制（室内也会解锁，比如上课、睡觉）。课堂/考试是全屏模态，横幅排队到回到场景后再显示也可以接受。
- 维度“升阶”与成就同时发生（阶梯成就就是升阶），不另做提示。

### 8.2 查看入口：人生簿面板

- 新文件 `src/ui/achievementPanel.ts`（画布绘制，风格仿 `questPanel.ts`）。
- **桌面快捷键：`L`（Life）**。已核对现有占用：WASD/方向键、E、Q、Tab、Esc、P、Y、H、G、T、C、R（出租车电台/创角）、F、I、X（面板内）、数字键、Space/Enter —— `L` 未被占用。
- 打开条件：大地图场景、未开地图/属性页/对话/任务面板时（与 `Q` 的判定方式相同，写在 `overworldScene.update()` 的 `Q` 分支旁）。打开后吞掉输入：`L`/`Esc` 关闭，`A/D`/`←/→` 切页，`W/S`/`↑/↓` 滚动成就列表，点击页签/关闭钮可用。
- 两页：
  1. **总览**：人生总分（大字）+ 当前称号；五个维度各一行：维度名、分数、阶名、到下一阶的进度条；底部“历代最高 X（共 N 世）”。
  2. **成就**：按维度分组的网格（每格 名称/描述/bonus），已解锁金色、未解锁灰色并显示条件；`hidden` 未解锁显示「？？？」+ hint；顶部“已解锁 n / 38”。
- `src/ui/hud.ts` 底部按键提示追加 `L 成就`。
- `src/ui/attrPanel.ts` 展开态在金钱行下加一行 `人生分 1234 · 成就 12/38`，点击该行等同按 `L`（手机上的第二入口）；折叠态不显示。

### 8.3 手机端

- `src/ui/touchControls.ts` 的 `ACTION_KEYS` 追加 `{ code: 'KeyL', label: '成就' }`（9 个键）。现在是 2 行 × 4 列，需要同步改 `index.html` 中 `.actions` 的网格为 **3 行 × 3 列**或 2 行 × 5 列（推荐 2×5 并缩小按钮宽度，保持右手单手可达）。`Input.setVirtual` 机制不需要改。
- 面板在触屏上：页签与关闭钮做成 ≥ 44px 的点击区；列表支持点击上下箭头翻页（不依赖滑动手势）。

### 8.4 年终结算（`yearEndScene.ts`）

- `YearReport` 新增可选字段 `score?: { gained: Record<Dim, number>; bonus: number; unlocked: { id: string; name: string }[]; total: number }`，由 `overworldScene.skipYear()` 在 `buildYearReport()` 之后调用 `ctx.score.sync()` + `consumeLedger()` 填入（年龄 +1 的 E1/E2 也被算进这一年）。
- 摘要页（P1）：在评语上方加一行 `这一年 人生分 +86（友情 +30 · 学业 +44 · 勤勉 +12）· 总分 1234`；若 `unlocked` 非空，再加一行 `🏆 新成就：知交满巷、学神`（最多 2 个 + “等 N 个”）。
- 详情页（P2）：右栏加“人生分明细”小节：五维各自 +N、成就逐条列出。
- 字段可选 → 现有 `?snap` / `?detail` 调试路径不受影响。
- 注：只有按 T “跳过今年”才会弹年终结算；自然过年时 `ledger` 继续累积，下次结算时一起显示（文案写“自上次结算以来”更准确，推荐用此文案）。

### 8.5 寿终结局（`lifeEndScene.ts`）

- 构造时：`ctx.score.sync()` + `evaluate()`（触发 `centenarian`），然后 `store.archiveLife(record)` **立即归档**（不要等按键，防止玩家直接关页丢失）。
- 第 1 页（现有页面重排）：标题、姓名·享年保持；墓志铭上移；新增 `人生总分 3260 · 精彩的一生`（金色大字）和五维一行：`友情 520 · 学业 610 · 勤勉 1200 · 健康 210 · 阅历 330`；底部“成就 24 / 38 · 历代最高 3260”。提示改为 `E 查看成就墙`。
- 第 2 页「成就墙」：38 格网格，已解锁亮、未解锁暗（hidden 显示 ？）；提示 `按 E / 点击任意处　开始新的一生` → 才执行原来的 `clearSave(); location.reload()`。
- `?snap` 调试时直接显示第 1 页终态（保持现有行为）。

---

## 9. 实现切分（文件清单）

### 9.1 新增

| 文件 | 内容 |
|---|---|
| `src/score/types.ts` | §5.1 全部类型 |
| `src/score/rules.ts` | §5.2 常量与纯函数 |
| `src/score/achievements.ts` | `ACHIEVEMENTS: AchievementDef[]`（§4 全表）+ `ACHIEVEMENT_BY_ID` |
| `src/score/engine.ts` | `ScoreEngine`、`defaultState()`、`restore/backfill/migrate` |
| `src/score/store.ts` | `ScoreStore`、`SaveFieldScoreStore`、`MemoryScoreStore`、`LifeRecord` |
| `src/score/facts.ts` | `worldView / buildFacts / clockOf`（ctx 胶水） |
| `src/ui/achievementPanel.ts` | 人生簿面板（§8.2） |
| `test/score-logic-check.mjs` | 计分/成就/存档的 node 测试（§10），沿用 `quest-logic-check.mjs` 的桩 + `transpileModule` 方案 |

### 9.2 修改

`src/context.ts`、`src/main.ts`、`src/core/save.ts`、`src/core/health.ts`、`src/quest/questManager.ts`、`src/ui/dialogue.ts`、`src/systems/classroom.ts`、`src/scenes/examScene.ts`、`src/ui/medical.ts`、`src/scenes/indoorScene.ts`、`src/scenes/overworldScene.ts`、`src/core/yearReport.ts`（仅 `YearReport` 加可选字段）、`src/scenes/yearEndScene.ts`、`src/scenes/lifeEndScene.ts`、`src/ui/hud.ts`、`src/ui/attrPanel.ts`、`src/ui/touchControls.ts`、`index.html`（触屏按键网格 CSS）。

**不需要改**：`src/core/saveSlots.ts`（存的是整份 SaveData）、`src/systems/schoolState.ts`、`src/entities/resident.ts`、`src/data/*`。

### 9.3 建议实现顺序

1. `types → rules → achievements → store → engine`，同时写 `test/score-logic-check.mjs` 的纯逻辑部分（无 ctx）；
2. `save.ts` + `context.ts` + `main.ts` 接入，跑旧档兼容测试；
3. 各钩子（§7）；
4. UI：hud 横幅 → 面板 + L 键 + 触屏 → 属性面板一行 → 年终 → 寿终；
5. 验证：`tsc --noEmit` 0 错误；`quest-logic-check.mjs` 仍 PASS 157 / FAIL 0；`score-logic-check.mjs` 全 PASS；构建通过。

---

## 10. 建议测试断言（`test/score-logic-check.mjs`，不依赖浏览器）

做法：复制 `quest-logic-check.mjs` 的第 1、2 节（全局桩 + `transpileModule` 到临时目录），`require` 出 `score/engine.js`、`score/rules.js`、`score/achievements.js`、`score/store.js`、`core/save.js`；纯逻辑用手写 `WorldView` / `ScoreFacts` 驱动，不构造完整 ctx。

**规则**
1. `classPoints(50,false)=1`，`classPoints(80,false)=4`，`classPoints(100,false)=6`，`classPoints(95,true)=1`，`classPoints(30,false)=1`。
2. `examPoints(8,10)=44`，`examPoints(10,10)=70`，`examPoints(7,10)=21`，`examPoints(0,0)=0`。
3. `gradPoints('A',true)=110`，`gradPoints('C',false)=15`。
4. `questPoints('side',0,false,0)=15`、`('side',1,…)=8`、`('side',2,…)=4`；`('main',0,true,20)=30+20+5=55`。
5. `tierOf('friend',319)=4`、`tierOf('friend',320)=5`；`tierOf('study',19)=0`。

**引擎 · 友情 peak 防刷**
6. 某居民 affinity 0→3 后 `sync()`：friend +20，`peaks.x=3`；降到 1 再升回 3：再次 `sync()` 加 0；升到 5：+30（累计 50）。
7. 再次 `sync()` 同一视图：返回空数组（幂等）。
8. `secretRevealed` 由 false→true：+15，只一次。

**引擎 · 每日上限**
9. 同一天 emit 4 次不同 npc 的 `chat`：friend 只 +3；换到下一天再 emit：+1。
10. 同一天 4 件 `daily` 任务：只计 3 件；`counters.dailyDone` 仍计 4（计数与计分分开）。
11. 同一天 3 次 `class`：只计 2 次。`rest` 同日两次只 +2。

**引擎 · 学业推导**
12. 视图 `lastExamAge=12, 8/10` → study +44，`bestExam.ratio=0.8` → 解锁 `xueshen`；同视图再 sync 不重复；`lastExamAge=13, 10/10` → +70 并解锁 `perfect_exam`。
13. `graduated=true, gradeTag='A', recommendation=true` → +110，解锁 `grad_a`、`recommended`，再 sync 不重复。

**成就**
14. `ACHIEVEMENTS.length >= 15`（实际 38）；id 全部唯一；每条都有 `dim ∈ DIMS`、`bonus > 0`、`test` 为函数。
15. 存在 `friend_tier_1..friend_tier_7` 与 `study_tier_1..study_tier_6`；`friend_tier_5` 在 friend=319 时未解锁、320 时解锁。
16. 解锁后条件不再成立（构造 facts 把 friend 改小）→ 成就仍在，`bonus` 不变。
17. `total() === Σ dims + bonus`。
18. `onUnlock` 回调次数 = 新解锁数；`evaluate(..., silent=true)` 时回调 0 次。

**存档 / 迁移**
19. `JSON.parse(JSON.stringify(engine.snapshot()))` 喂给新引擎 `restore()` 后，`snapshot()` 深相等。
20. `restore(undefined)`、`restore(null)`、`restore('垃圾')`、`restore({v:1, dims:{friend:'x'}})` 均不抛错，得到默认值（friend=0）。
21. `restore({v:99, achievements:{future_ach:{day:1,age:9}}, bonus:50})` 不抛错，`achievements.future_ach` 保留、`bonus=50`。
22. 旧档补记：构造 `WorldView`（两位居民 affinity 3 和 5、一位 secretRevealed、`lastExamAge=10, 9/10`、`graduated=false`）+ 任务运行时（一条 side `repeatCount=2`）→ `backfill()` 后 friend=20+50+15=85、study=27+20=47、diligence=15+8=23、`backfilled=true`；再调用一次 `backfill()` 无变化（或被 `backfilled` 拦下）。
23. `SaveFieldScoreStore`：`read({…无 score})===null`；`write(d, snap)` 后 `read(d)` 等于 snap。
24. `save.ts`：模拟一份不含 `score` 的 v2 存档 JSON 放进假 `localStorage`，`loadSave()` 返回非 null（证明没有因新字段被丢弃）；`SAVE_VERSION === 2`。
25. `archiveLife()` 连续写 25 次，`listLegacy().length === 20` 且第一条是最新；`localStorage.getItem` 返回损坏 JSON 时 `listLegacy()` 返回 `[]` 不抛错。

**回归**
26. `node .\test\quest-logic-check.mjs` 仍为 PASS 157 / FAIL 0（其假 ctx 无 `score` 字段，验证 `ctx.score?.` 的宽容性）。
27. （可选静态检查）扫描 `src/**/*.ts` 中 `wasPressed('KeyL'` 只出现在 overworldScene / achievementPanel，确认没有与其他功能撞键。

---

## 11. 不在本期范围

- 真服务器 / 排行榜 / 账号；
- 好感下降或负面行为的扣分；
- 独立打工玩法（只预留 `work_shift` 事件）；
- 成就图标美术（先用文字 + 维度色块：友情 `#e88aa8`、学业 `#8ab4e8`、勤勉 `#e8c85a`、健康 `#7fd18a`、阅历 `#b89ae8`）。
