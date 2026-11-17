# 任务时限 · 指定交付人 · 地图标记 —— 实现规格书

| 项 | 内容 |
| --- | --- |
| 文档版本 | v1.1（勘误版：与已实现语义一致，见 §13 勘误记录） |
| 勘误日期 | 2026-11-14 |
| 适用范围 | `life-sim-ts/`（TypeScript + Vite + 原生 Canvas） |
| 代码基线 | 当前工作区 `life-sim-ts/src`（本文所有行号均指基线文件） |
| 作者 | spec-architect（需求架构师） |
| 下游 | 实现 → 自动化验证 → 评审 → 收口 |
| 验收方式 | 本文 §9 的 AC-01…AC-18 逐条执行；任一条失败即整体不通过 |

**读者约定**

- `必须` = 阻断项，缺失即验收失败；`应当` = 非阻断但需在实现说明中解释；`禁止` = 出现即失败。
- 规则编号 `R-x-yy`，缺陷编号 `D-x`，验收用例编号 `AC-xx`，均可被评审逐条引用。
- 本文只写规格，不改任何 `.ts` 源码；实现阶段按 §11 清单逐条落地。

---

## 1. 现状审计（先看清已有什么、缺什么）

### 1.1 已有能力（可直接复用，不要重写）

| 能力 | 位置 | 现状 |
| --- | --- | --- |
| 任务数据结构 | `src/quest/types.ts:52-73`（`QuestDef`）、`:77-88`（`QuestRuntime`） | 已有 `timeLimitDays`、`deadlineHour`、`softDeadline`、`turnIn`、`turnInLine` 字段 |
| 任务状态枚举 | `src/quest/types.ts:75` | 已有 `available/active/ready/completed/failed/expired` 六态 |
| 截止字段运行时 | `src/quest/questManager.ts:370-377` | `accept()` 里算 `deadlineDay`（无时限写哨兵 `999999`）与 `deadlineHour` |
| 到期判定 | `src/quest/questManager.ts:534-540`（`checkDeadline`） | 按「日」+「整点」判定，日/时两个分支 |
| 超时结算 | `src/quest/questManager.ts:542-567`（`expire`） | 分主线 / 软性 / 其它三支，移出 `active`，写日志（仅当 `failLog` 存在） |
| 住院顺延 | `src/quest/questManager.ts:436-444`（`shiftActiveDeadlines`） | 由 `src/ui/medical.ts:272-273` 逐日调用 |
| 剩余时间文案 | `src/quest/questManager.ts:712-721`（`deadlineText`） | 面板已显示「目标 · 剩余」 |
| 交付入口 | `src/quest/questManager.ts:170-182`（`turnInOptionsForNpc`）、`src/ui/dialogue.ts:60-71` | 对话菜单里出现「交差：任务名」 |
| 交付结算 | `src/quest/questManager.ts:426-434`（`turnIn`）、`:569-638`（`complete`） | 金钱/好感/物品/标签/日志/链解锁/toast 一条链 |
| 交付人 UI | `src/ui/questPanel.ts:335`、`:388-392`；`src/quest/questManager.ts:697`、`:724-745` | 面板显示「交付：X · 现在在Y」 |
| 标记几何 | `src/map/minimap.ts:68-74`（`minimapPos`）、`src/map/bigmap.ts:14-18`（`bigMapScreenPos`） | 世界 Tile → 两张地图的屏幕坐标已就绪 |
| 标记数据 | `src/quest/questManager.ts:44-50`（`MapMarker`）、`:749-795`（`markerFor`） | 按当前目标返回 `{tx,ty,color,label,kind}` |
| 三处绘制 | `src/quest/questManager.ts:825-843`（世界内）、`:845-859`（小地图）、`:861-880`（大地图） | 各画各的，已经在跑 |
| NPC 头顶徽标 | `src/quest/questManager.ts:184-188`（`npcBadge`）、`src/scenes/overworldScene.ts:511-535` | `!`=有委托、`✓`=可交差 |
| 存档快照 | `src/quest/questManager.ts:906-941`（`snapshot`）、`:943-992`（`restore`）、`:996-1028`（快照类型） | 已存 `deadlineDay/deadlineHour` |
| 存档版本闸门 | `src/core/save.ts:18-19`（`SAVE_KEY`/`SAVE_VERSION=2`）、`:140-153`（`loadSave`） | `v !== 2` 直接丢档，故新字段必须可选 |
| 游戏时钟 | `src/core/daynight.ts:7-9`、`:43-52` | `gameHour() ∈ [6,30)`、`gameDayIndex()` 按循环自增 |
| 调试入口 | `src/main.ts:38-42`、`:77-104`（`?at/?auto/?quests/?age/?sick/?money`） | `window.__ctx/__player/__input` 已挂 |

### 1.2 半成品与缺陷（本次必须修掉）

| 编号 | 缺陷 | 证据 | 影响 |
| --- | --- | --- | --- |
| D-1 | 时限字段「有定义、无内容」：`timeLimitDays` 在 120 条任务里 0 条使用；`deadlineHour` 只有 1 条（`d-wgf-med-night`，`src/quest/data.ts:727-739`）| §1.3 实测 | 玩家接到的任务实际上几乎都不会到期，「必须在规定时间内完成」不成立 |
| D-2 | 已完成但未交付（`status === 'ready'`）的任务**永不过期**：`update()` 循环在 `src/quest/questManager.ts:475-477` 直接跳过非 `active`，`checkDeadline` 被绕过 | 代码路径 | 玩家把目标做完后拖着不交，时限形同虚设 |
| D-3 | `deadlineHour` 与 `gameHour()` 的取值域不匹配：`gameHour()` 返回 `[6,30)`（`src/core/daynight.ts:43-47`），午夜段是 `24..30`；`checkDeadline`（`:534-540`）直接用 `hour >= deadlineHour` | 代码路径 | 截止整点若配在凌晨（0–6 点）会判定错乱，且现行数据没有约束 |
| D-4 | 完全没有临期提示：`hud.toast` 只在接取（`:386`）、可交差（`:489`）、超时（`:552/:558/:566`）出现 | `src/quest/questManager.ts` | 玩家不知道还剩多久，超时像"突然被判负" |
| D-5 | `deadlineText`（`:712-721`）跨天 hour 型写成 `还剩 ${left + 1} 天`，与真实剩余差一天；「当天到期」也没有说清是次日 06:00 | 代码路径 | 面板数字与真实截止不一致 |
| D-6 | 超时状态没用 `expired`：`types.ts:75` 定义了它，`expire()`（`:542-567`）只写 `available`/`failed`；且 120 条任务的 `failLog` 为 0 条，`:562-565` 的日志分支永不触发 | §1.3 实测 | 超时既不可检索也不进人生日志/年度报表 |
| D-7 | 交付没人把门：`turnIn()`（`:426-434`）只查 `status === 'ready'`，不查场景/距离；`turnInOptionsForNpc`（`:173`）与 `complete`（`:595`）直接读 `def.turnIn`，没有 `?? giver` 回退 | 代码路径 | 任何调用方都能远程交付；缺字段的任务会退化成"自动完成" |
| D-8 | 地图标记不一致：`markerFor`（`:753`）对 `daily` 直接返回 `null`；`wait` 目标返回 `null`（`:788-790`）；三处绘制各自 `.slice(0,3)`（`:846`、`:862`）且无序、无去重；世界内标记出视口直接跳过（`:832`），没有边缘指示；只有「绿/黄」两色，没有临期态 | 代码路径 | 玩家明确要求的「目标任务必须在地图上标出来」在多种情况下不成立 |
| D-9 | 存档字段不足：`QuestRuntimeSnapshot`（`:996-1007`）没有绝对截止时刻、提示档位、记账标志；`restore`（`:943-960`）只搬 `deadlineDay/deadlineHour` | 代码路径 | 无法做到"读档后剩余时间精确一致""超时只记一次账" |
| D-10 | 旧档里的超时任务被写成 `failed`，而 `isEligible`（`:124-127`）对 `failed`/`expired` 一视同仁，但 `failed` 语义上应是"显式失败" | 代码路径 | 需要在读档时把历史 `failed` 归一到 `expired`，否则语义漂移 |

### 1.3 数据现状（实测，供实现与评审核对）

- 任务总数 **120**：`src/quest/data.ts` 60 条 + `src/quest/data-extra.ts` 60 条；按 tier：`main` 14 / `side` 66 / `daily` 40；其中任务链 `chain` 15 环。
- `turnIn`：**120/120** 已填，无缺省 → 「交付人」数据面已就绪，缺的是门禁与文案。
- `turnInLine`：**60/120**（全部在 `data-extra.ts`），长度 6–12 字，全部满足「≤20 字」。
- `failLog`：**0/120** → 现行超时日志分支是死代码。
- `timeLimitDays`：**0/120**；`deadlineHour`：**1/120**（`d-wgf-med-night`，20–23 点窗口、21 点截止）。
- `window`（可接时段）：19/120；含 `wait` 目标的 5 条，最长 `wait.days = 3`（`c-a4-wait`）。
- 结论：三条诉求目前的落地程度是——**时限 5%（仅字段）、交付人 100%（仅显示）、地图标记 60%（有绘制、无一致性无临期态）**。

---

## 2. 时间基准与术语（后面所有规则的唯一前提）

### 2.1 游戏时钟事实（来自 `src/core/daynight.ts`）

- `DAY_MS = 15 min`、`NIGHT_MS = 3 min`、`CYCLE_MS = 18 min`（`:7-9`）；**1 个循环 = 1 个游戏日 = 24 游戏小时**。
- `gameHour()`（`:43-47`）返回值域 **`[6, 30)`**：白天 15 分钟映射 06:00→22:00，夜晚 3 分钟映射 22:00→30:00（30:00 ≡ 次日 06:00）。
- `gameDayIndex()`（`:50-52`）在循环边界自增，即**日界 = 游戏时钟 06:00**。第 D 个游戏日覆盖时钟 `[D 日 06:00, D+1 日 06:00)`。
- 显示小时 `fmtHour(h)`（`src/quest/questManager.ts:28-31`）为 `floor(h) % 24`，即 `26.5 → "02:00"`。

### 2.2 绝对游戏小时 `absGameHour`（新增，唯一时间标尺）

R-2-01 必须新增纯函数（放在 `src/core/daynight.ts` 导出）：

```ts
/** 绝对游戏小时：严格单调递增，1 个游戏日 = 24 小时；第 D 日 = [D*24+6, D*24+30) */
export function absGameHour(): number {
  return gameDayIndex() * 24 + gameHour();   // gameHour() ∈ [6,30)
}

/** 绝对小时 → 它所属的游戏日（日界 06:00） */
export function dayOfAbsHour(abs: number): number {
  return Math.floor((abs - 6) / 24);
}

/** 测试用：把时间钉到「第 day 日的 hour 点」，hour ∈ [0,24) */
export function setGameTime(day: number, hour: number): void;
```

R-2-02 全部时限判定、临期判定、文案计算必须只依赖 `absGameHour()` 与 `dayOfAbsHour()`，禁止再直接比较 `gameDayIndex()`/`gameHour()`（这两者只允许用于「每日刷新」「日程窗口」等既有逻辑）。

R-2-03 `setGameTime(day, hour)` 的实现：

```ts
const t = hour >= 6 ? ((hour - 6) / 16) * DAY_MS : DAY_MS + ((hour + 2) / 8) * NIGHT_MS;
OFFSET = day * CYCLE_MS + t - Date.now();
```

约束：`hour` 取 `[0, 24)`，按 `Math.min(23.999, Math.max(0, hour))` 收敛；该函数只允许挂到调试钩子上（§8.1），游戏逻辑禁止调用。

### 2.3 当场示例（用于自检公式）

| 时刻（时钟） | `gameHour()` | `gameDayIndex()` | `absGameHour()` | 所属游戏日 |
| --- | --- | --- | --- | --- |
| 第 100 日 06:00 | 6 | 100 | 2406 | 100 |
| 第 100 日 12:00 | 12 | 100 | 2412 | 100 |
| 第 100 日 21:00 | 21 | 100 | 2421 | 100 |
| 第 100 日 23:30 | 23.5 | 100 | 2423.5 | 100 |
| 第 100 日 当日凌晨 03:00 | 27 | 100 | 2427 | 100 |
| 第 101 日 06:00 | 6 | 101 | 2430 | 101 |

### 2.4 临界值总表（评审逐条对照，禁止含糊）

| 规则 | 判定式 | 临界（恰好相等）结论 |
| --- | --- | --- |
| 到期 | `absGameHour() >= deadlineAbsHour` | **算超时**（可完成窗口是半开区间 `[接取时刻, 截止时刻)`） |
| 临期一档 | `0 < remaining <= warnHours`（默认 2） | `remaining === 2` **算临期**，提示 |
| 临期二档 | `0 < remaining <= 0.5` | `remaining === 0.5` **算最后一档**，提示 |
| 交付距离 | `resident.distTo(px,py) <= 56` | `=== 56` **允许**交付；`56.001` 拒绝 |
| 地图标记数量 | 合并去重后 `<= 3` | 第 4 个**被截断**，不绘制 |
| 同点合并 | `Math.round(tx):Math.round(ty)` 相同 | 视为同一点，**只画一个** |
| 可接冷却（普通超时） | `gameDayIndex() - completedDay >= 3` | `=== 3` **可再接** |
| 日常重复冷却 | `gameDayIndex() - completedDay >= 5` | `=== 5` **可再接** |
| 主线超时重接 | 无冷却 | 超时当帧即可再接 |
| 当日截止（日型） | `absGameHour() >= (D+N+1)*24+6` | 次日 06:00 整**算超时** |

---

## 3. 时限规则

### 3.1 字段语义与取值域

| 字段 | 位置 | 语义（本次冻结） | 取值域 | 缺省行为 |
| --- | --- | --- | --- | --- |
| `timeLimitDays` | `types.ts:63` | 「接取日算第 0 天，还能再用 N 个整天」；日型截止 = 第 `D+N` 日结束（次日 06:00） | 整数 `0..7` | 走 §3.2 的 tier 默认值 |
| `deadlineHour` | `types.ts:64` | 当日截止**整点**；只允许 `6..23`（避开 `gameHour()` 的午夜段歧义，见 D-3） | 整数 `6..23` | 无整点截止 |
| `softDeadline` | `types.ts:65` | `true` = 超时后回 `available` 且可重接（不判失败） | 布尔 | `false` |
| `noDeadline` | **新增** | `true` = 该任务确实无时限（仅逃生舱，现有 120 条任务 0 条使用） | 布尔 | `false` |
| `warnHours` | **新增** | 临期一档阈值（游戏小时） | 数值 `(0, 12]`，默认 `2` | `2` |
| `turnIn` | `types.ts:60` | 交付人 NPC id | 必须是 `RESIDENTS` 里存在的 id | 回退 `giver`，见 §4.1 |

R-3-01 `timeLimitDays` 越界或非整数时，必须收敛为 `Math.min(7, Math.max(0, Math.round(v)))`，并在开发构建下 `console.warn`；禁止因此抛错或拒绝接取。
R-3-02 `deadlineHour` 越界或非整数时，必须收敛为 `Math.min(23, Math.max(6, Math.round(v)))`，并在开发构建下 `console.warn`。
R-3-03 `warnHours` 越界时收敛为 `Math.min(12, Math.max(0.1, v))`。
R-3-04 禁止出现「有时限字段但运行时无截止」的状态：除 `noDeadline === true` 外，接取成功后 `runtime.deadlineAbsHour` 必须有限。

### 3.2 字段优先级与 tier 默认值（消除「有的任务没时限」）

**优先级（自高到低，命中即停）**：

1. `noDeadline === true` → 无时限（`deadlineAbsHour === undefined`，`deadlineDay === 999999`）。
2. `deadlineHour !== undefined && timeLimitDays === undefined` → **当天型**：截止 = 当日 `H` 点；若接取时已到/过 `H` 点，截止顺延到次日 `H` 点。
3. `timeLimitDays !== undefined` → **日型（可叠加整点）**：
   - 无 `deadlineHour`：截止 = 第 `D + N` 日结束 = `(D + N + 1) * 24 + 6`；
   - 有 `deadlineHour`：截止 = `(D + N) * 24 + H`；若该值 `<=` 接取时刻，则 `+24`。
4. 两者皆缺省 → 取 tier 默认天数走第 3 条（无整点分支）：

| `def.tier` | 默认 `N` |
| --- | --- |
| `main` | 5 |
| `side` | 2 |
| `daily` | 0 |

R-3-05 含 `wait` 目标的任务，默认天数必须抬到 `max(tier默认, waitMaxDays + 1)`，其中 `waitMaxDays = max(o.days for o in objectives if o.kind === 'wait')`。例：`c-a4-wait`（`wait.days = 3`，tier `side`）→ `N = max(2, 4) = 4`。
R-3-06 默认值只影响**接取时**的计算，禁止在读档时按 def 重算（读档以 runtime 快照为准，见 §7.4）。

### 3.3 接取时的截止计算（算法，逐行可抄）

`accept()`（`src/quest/questManager.ts:349-388`）必须改为：

```ts
const nowAbs = absGameHour();
const day = gameDayIndex();
let deadlineAbs: number | undefined;

if (def.noDeadline) {
  deadlineAbs = undefined;
} else if (def.deadlineHour !== undefined && def.timeLimitDays === undefined) {
  const H = clampHour(def.deadlineHour);                       // 6..23
  deadlineAbs = day * 24 + H;
  if (deadlineAbs <= nowAbs) deadlineAbs += 24;                // 当天型顺延
} else {
  const N = def.timeLimitDays !== undefined
    ? clampDays(def.timeLimitDays)
    : defaultTimeLimitDays(def);                               // §3.2 表 + R-3-05
  if (def.deadlineHour === undefined) {
    deadlineAbs = (day + N + 1) * 24 + 6;                      // 第 D+N 日结束
  } else {
    const H = clampHour(def.deadlineHour);
    deadlineAbs = (day + N) * 24 + H;
    if (deadlineAbs <= nowAbs) deadlineAbs += 24;
  }
}
```

R-3-07 必须同时写入三个字段，且互相一致：

```ts
rt.deadlineAbsHour = deadlineAbs;                              // 权威
rt.deadlineDay = deadlineAbs === undefined
  ? 999999
  : (def.deadlineHour === undefined ? dayOfAbsHour(deadlineAbs) - 1 : dayOfAbsHour(deadlineAbs));
rt.deadlineHour = deadlineAbs === undefined ? undefined : (def.deadlineHour !== undefined ? clampHour(def.deadlineHour) : undefined);
rt.warnStage = 0;
rt.expiredLogged = false;
```

校验（自检用）：`side` 任务第 100 日 10:00 接取 → `deadlineAbsHour = 2478`（= 第 103 日 06:00），`deadlineDay = 102`，`deadlineHour = undefined`；`d-wgf-med-night` 第 100 日 20:30 接取 → `2421`（当天 21:00），`deadlineDay = 100`，`deadlineHour = 21`。

### 3.4 到期判定与「恰好到点」

R-3-08 到期判定只有一个函数：

```ts
private deadlinePassed(rt: QuestRuntime, nowAbs = absGameHour()): boolean {
  return rt.deadlineAbsHour !== undefined && nowAbs >= rt.deadlineAbsHour;
}
```

- **恰好到点算超时**（`>=`，不是 `>`）。可完成窗口是 `[接取时刻, 截止时刻)` 的半开区间。
- `checkDeadline`（`:534-540`）必须删除 `deadlineDay/hour` 双分支，改为调用 `deadlinePassed`。
- 判定必须对 `status === 'active'` 与 `status === 'ready'` 都生效（修 D-2）。

R-3-09 `update()`（`:460-493`）循环顺序必须固定为：

```
for (const id of [...this.active]) {
  ① 取 rt，rt.status 既不是 active 也不是 ready → 跳过
  ② status === 'active' → progressPassive(rt)
  ③ deadlinePassed(rt) → expire(rt) 并 continue          // 时限优先于完成
  ④ warnDeadline(rt)                                     // 临期提示（§3.6）
  ⑤ status === 'active' && allDone(rt) → 置 ready / 自动完成（§4.1）
}
```

R-3-10 **同一帧冲突优先级**：目标完成与到点同一帧发生时，以「到点」为准（③ 早于 ⑤），即该次完成不被承认，任务按超时处理。这条是硬规则，禁止调换顺序。

### 3.5 当天任务 vs 跨天任务

| 概念 | 定义 | 文案形态 |
| --- | --- | --- |
| 当天任务 | 截止落在接取当天（`deadlineAbsHour` 落在 `[D*24+6, D*24+30)`，或日型 `N === 0`） | 整点型：`今天 HH:00 前`；日型：`明早 06:00 前到期`（凌晨段见 §3.9） |
| 跨天任务 | 截止落在接取日之后（`deadlineDay > 接取日`） | 整点型：`还剩 N 天（HH:00 前）`；日型：`还剩 N 天` |

R-3-11 跨天任务跨过 06:00 日界时，`warnStage` **不清零**（临期按绝对小时连续判定，见 §3.6）。
R-3-12 当天型的「当天」以 `gameDayIndex()` 为准（日界 06:00）；玩家在 05:00 接到的日型 `N=0` 任务只剩 1 小时，这是正确行为而不是缺陷。

### 3.6 临期提示（提前多久、提示几次、文案）

R-3-13 每个任务最多提示 **2 次**，按档位单调递增，禁止重复：

```ts
private warnDeadline(rt: QuestRuntime, nowAbs: number): void {
  if (rt.deadlineAbsHour === undefined) return;
  const rem = rt.deadlineAbsHour - nowAbs;
  if (rem <= 0) return;                                  // 到期由 ③ 处理，这里不插话
  const warnAt = clampWarn(rt.def.warnHours ?? 2);       // (0,12]
  if (rt.warnStage < 2 && rem <= 0.5) {
    rt.warnStage = 2;
    this.ctx?.hud.toast(`⚠ ${rt.def.name}：只剩最后半小时。`);
  } else if (rt.warnStage < 1 && rem <= warnAt) {
    rt.warnStage = 1;
    this.ctx?.hud.toast(`⏳ ${rt.def.name}：快到时间了。`);
  }
}
```

- 一档：剩余 ≤ `warnHours`（默认 2 游戏小时）→ `⏳ {任务名}：快到时间了。`
- 二档：剩余 ≤ 0.5 游戏小时 → `⚠ {任务名}：只剩最后半小时。`
- 两档互斥：已经进过二档就不再补一档；一档已发而进入二档时补二档。
- 提示只在世界场景的 `update` 中产生（`hud.toast` 生命周期 2.2 秒，见 `src/ui/hud.ts:15-18`）；切到地图/面板/对话时不额外补发，恢复后按当前剩余继续判定。
- 接取后第一次 `update` 就按当前剩余判定：剩余本就不足 2 小时的任务（如 05:00 接下当日任务）在接取后立刻提示一档，这是允许且必须的。

R-3-14 面板同步：当 `remaining <= warnHours` 时，面板「目标 · 截止」这一行文字色必须用告警色 `#c96a5a`（该色已在 `src/ui/dialogue.ts:217`、`src/ui/questPanel.ts:350` 使用，不引入新美术风格）。
R-3-15 追踪条同步：临期（未完成）时行首符号由 `●` 改为 `⚠`，文字色 `#c96a5a`；可交差仍是 `✓` + `#7fd18a`。

### 3.7 超时后的表现（状态 / 面板文案 / 是否可重接 / 日志与年度报表）

R-3-16 `expire(rt)` 必须按下列状态机执行（修 D-6、D-10）：

| 条件（自上而下命中即停） | `status` | 冷却 | toast 文案（精确） |
| --- | --- | --- | --- |
| `def.tier === 'main'` | `available` | 无（当帧即可重接） | `这件事先放一放。以后还有机会。` |
| `def.softDeadline \|\| def.repeat \|\| def.tier === 'daily'` | `available` | `cooldown.set(id, gameDayIndex() + 3)` | `错过了时间：{任务名}。过几天还能再试。` |
| 其它（普通 `side`、链环） | `expired` | 不写 `cooldown`，靠 `isEligible` 的 `completedDay + 3` 拦 | `这件事没做成：{任务名}` |

R-3-17 超时记账必须幂等（同一任务同一次超时只记一次）：

```ts
if (!rt.expiredLogged) {
  rt.expiredLogged = true;
  if (rt.def.tier !== 'daily') {
    const text = rt.def.failLog ?? `${rt.def.name}，我没赶上时间。`;
    this.pushJournal(text);                                        // 人生日志
    this.yearEvents.push({ text, valence: -1, importance: 2 });     // 年度报表事件
  }
}
```

- 日常（`tier === 'daily'`）超时**不写**人生日志、**不写**年度事件——与完成规则对称（`src/quest/questManager.ts:606-610` 已有同一取舍）。
- 主线超时**要写**日志与年度事件（它是"没做成的事"，值得留痕），但状态回 `available` 可重接。
- 年度事件类型复用 `src/core/yearReport.ts:10-14` 的 `YearEvent`（`valence: -1`、`importance: 2`）。

R-3-18 超时后 `active` 必须立即移除该 id；`rt.warnStage = 0`、`rt.readyAnnounced = false`、`rt.completedDay = gameDayIndex()`。若玩家正在与该 NPC 对话，菜单下一帧重建（`src/ui/dialogue.ts:126-132` 的 `buildMenu` 会在回到菜单态时重算），「交差」项自然消失。

R-3-19 是否可重接（精确定义）：

| 类型 | 可重接 | 最早可接时刻 |
| --- | --- | --- |
| 主线 | 是 | 超时当帧（`available`，无 `cooldown`） |
| 日常 / `softDeadline` / `repeat !== 'none'` | 是 | `gameDayIndex() >= 超时日 + 3` |
| 普通支线 / 链环 | 是（转 `expired`） | `gameDayIndex() >= 超时日 + 3`（`isEligible` 的 `RETRY_COOLDOWN`，`:21`、`:124-127`） |

R-3-20 面板展示：`status === 'expired'` 的任务在「可接」页签出现时，条目前缀必须为 `✕`（区别于 `◆` 主线 / `⛓` 链环 / `○` 普通），并在详情页显示 `上次错过了 · 冷却结束后可再试`。

### 3.8 住院、跳过今年、离线时间的处理

R-3-21 `shiftActiveDeadlines(days)`（`:436-444`）必须同时顺延：`rt.acceptedDay += days`、`rt.deadlineDay += days`、`rt.deadlineAbsHour += days * 24`。语义保持「住院期间任务期限冻结/顺延」（调用方 `src/ui/medical.ts:272-273` 不改）。
R-3-22 「跳过今年」（`T`，`src/scenes/overworldScene.ts:374-383`）与 `skipGameDays`（`src/core/daynight.ts:56-58`）会让 `absGameHour` 一次跳很多天：进行中的任务在跳转后的第一帧按 §3.4 统一结算，可一次全部超时，每个任务各自记一次账（R-3-17 幂等）。
R-3-23 游戏时间由真实时间驱动（`src/core/daynight.ts:20-23`），离线期间时间照走（`src/core/save.ts:1-6` 的设计取舍）。因此**读档后可能立即超时**，这是规格认可的行为：读档第一帧结算，日志只记一次，面板不再显示该任务。
R-3-24 存档恢复时**禁止**按 def 重新推算截止（`deadlineAbsHour` 以快照为准）；只有快照缺字段时才按 §7.5 迁移。

### 3.9 面板 / 追踪条文案（精确串，实现逐字对照）

`deadlineText(rt)`（替换 `:712-721`）必须返回下表中一条，不允许出现其它形态：

| 情形 | 返回串 |
| --- | --- |
| `deadlineAbsHour === undefined` | `无时限` |
| 整点型，`deadlineDay === today` | `今天 ${HH}:00 前` |
| 整点型，`deadlineDay > today` | `还剩 ${deadlineDay - today} 天（${HH}:00 前）` |
| 日型，`deadlineDay === today` 且 `gameHour() < 24`（时钟 06:00–24:00） | `明早 06:00 前到期` |
| 日型，`deadlineDay === today` 且 `gameHour() >= 24`（凌晨 00:00–06:00） | `今天 06:00 前` |
| 日型，`deadlineDay > today` | `还剩 ${deadlineDay - today} 天` |

- `today = gameDayIndex()`；`gameHour() >= 24` 表示当前处于循环末段的凌晨 00:00–06:00（§2.1），此时 06:00 的截止点就在「今早」，故文案用「今天 06:00 前」。
- `HH` 用 `fmtHour(rt.deadlineHour)`，两位补零（如 `21:00`）。
- 临期后缀：`remaining <= 0.5` → 追加 ` · 最后半小时`；否则 `remaining <= warnHours` → 追加 ` · 快到期了`。
- 剩余已 `<= 0`（正常流程不会出现在面板上，防御分支）→ 返回 `已超时`。

追踪条 `drawTracker`（`:805-823`）每行格式固定为：

```
{mark} {任务名} · {currentHint} · {shortText}
```

| 情形 | `mark` | 颜色 | `shortText` |
| --- | --- | --- | --- |
| `ready` | `✓` | `#7fd18a` | 按下方通用规则，并保留临期后缀 |
| 未完成且 `remaining <= warnHours` | `⚠` | `#c96a5a` | 按下方通用规则，并保留临期后缀 |
| 未完成其它 | `●` | `#ffd166` | 按下方通用规则，并保留临期后缀 |

`shortText` 的取值：整点型 → `${HH}:00前`；日型 → `剩${deadlineDay - today}天`；无时限 → `无时限`；临期后缀按 `deadlineText` 的规则拼接。

---

## 4. 交付规则

### 4.1 交付人解析（`turnInNpc`）

R-4-01 必须新增唯一解析函数，所有交付相关路径（菜单、徽标、结算、标记、面板、提示）都必须调用它，禁止再直接读 `def.turnIn`：

```ts
function turnInNpc(def: QuestDef): string | undefined {
  return def.turnIn ?? def.giver;     // 缺省回退发布者
}
```

R-4-02 当 `turnIn` 与 `giver` 都缺省（现有 120 条任务不存在此情形）时：任务在目标全部完成后**自动完成**（保留旧行为），地图只标最后一条目标地点；面板「交付」行显示 `交付：—（自动完成）`。
R-4-03 数据现状满足要求：120/120 任务都有 `turnIn`（§1.3）。实现必须加一条开发期自检：`QUESTS` 中 `turnInNpc(def) === undefined` 的条目数必须为 0（`console.warn` 列出 id）。
R-4-04 交付人好感结算对象 = `turnInNpc(def)`（`complete()` 现有 `:595` 的 `def.turnIn ?? def.giver` 与该式等价，改用函数即可）。注意这是**有意设计**：`d-fj-tofu` 发布者冯军、交付人曹德顺，好感记在曹德顺账上。

### 4.2 交付前置校验（顺序固定，逐条可测）

`turnIn(id, choiceIndex?)`（替换 `:426-434`）必须按下列顺序校验，首个失败即返回：

1. 任务不存在 → `{ ok: false, text: '没有这个任务。' }`
2. 已到截止（`deadlinePassed`）→ 先执行 `expire(rt)`，再返回 `{ ok: false, text: '已经过了约定时间。' }`
3. `status !== 'ready'` → `{ ok: false, text: '这件事还没做完。' }`
4. 有 `choices` 但 `choiceIndex === undefined` → `{ ok: false, text: '这件事需要一个选择。' }`
5. 交付人校验（仅当 `turnInNpc(def)` 有值）：
   - 5a 玩家不在世界场景（`ctx.scenes.current !== ctx.overworld`）→ `{ ok: false, text: '要当面交给{交付人名}。' }`
   - 5b 世界里找不到该 NPC（`resident(id) === undefined`）→ `{ ok: false, text: '找不到{交付人名}。' }`
   - 5c `resident.distTo(玩家中心) > 56` → `{ ok: false, text: '离{交付人名}太远了，走近一点。' }`
6. 通过 → `complete(rt, choiceIndex)`。

R-4-05 「必须走到该 NPC 附近并交互」的两层保证：入口层（对话菜单只在与该 NPC 对话时出现「交差」）+ 校验层（`turnIn` 自身复核 5a/5b/5c）。任何脚本/调试调用都绕不过校验层。
R-4-06 玩家中心坐标取 `player.x + player.w / 2, player.y + player.h / 2`；距离用 `Resident.distTo`（`src/entities/resident.ts:113-115`，以 `(r.x+12, r.y+14)` 为 NPC 中心）。阈值 `56` 与现有交互距离 `ResidentManager.nearest`（`:280-291`）、`QuestManager.nearestTarget`（`:191`）一致，不新增手感参数。
R-4-07 `turnInOptionsForNpc(npcId)`（`:170-182`）必须：用 `turnInNpc` 比对、跳过 `deadlinePassed` 的任务、保持 `choices` 拆条行为。
R-4-08 `nearestTarget`（`:191-214`）与 `npcBadge`（`:184-188`）逻辑不变，但「可交差」判定自然消费新的 `turnInOptionsForNpc`。

### 4.3 「NPC 不在场」的定义与提示（本次冻结）

本作 NPC 不会被天气或疾病带走：`src/core/weather.ts:10-18` 只作用于玩家；`src/core/health.ts` 只有玩家疾病模型（`DISEASES`、`hospitalized`）。NPC 的日程段覆盖 24 小时（`ScheduleSeg` 支持跨天，`src/data/residents.ts:14-23`；`Resident.seg()` 在无匹配段时回退最后一段，`src/entities/resident.ts:52-55`）。因此「导致交付不可用」的不在场只有三种（P-1/P-2/P-3）；P-4/P-5 记录在表中，明确不构成缺席：

| 编号 | 情形 | 判定 | 提示（精确） | 交付是否可用 |
| --- | --- | --- | --- | --- |
| P-1 | 玩家不在世界场景（室内 / 出租车 / 年度结算 / 创建角色） | `ctx.scenes.current !== ctx.overworld` | `要当面交给{名}。` | 否 |
| P-2 | 数据里没有该 NPC id | `resident(id) === undefined` | `找不到{名}。` | 否 |
| P-3 | 玩家与 NPC 相距 > 56px | `distTo > 56` | `离{名}太远了，走近一点。` | 否 |
| P-4 | NPC 当前时段无匹配日程段 | `seg()` 回退最后一段（`:52-55`） | 不提示 | **是**（仍在场，只是站在上一段的锚点） |
| P-5 | 下雨 / NPC 生病 | 不适用（无此系统） | 不提示 | 是 |

R-4-09 禁止为 P-5 引入新系统或新提示（见 §10）。R-4-10 面板与接取文本里的「交付：X · 现在在Y」继续使用 `windowText`（`:724-745`）；当 P-1 成立时，面板该行追加 `（先出门）`。注：R-5-12 规定人生备忘录面板只在世界场景渲染，P-1（玩家不在世界场景）与面板打开无法同帧出现，故该 `（先出门）` 分支为防御性兜底，正常游玩不可达。

### 4.4 交付入口（对话菜单）

R-4-11 入口唯一：与 NPC 对话时，`Dialogue.buildMenu`（`src/ui/dialogue.ts:54-89`）在「聊天/送礼」之后、「委托」之前插入交差项。顺序固定为：`聊天` → `送礼` → `交差…` → `委托…` → `离开`。
R-4-12 标签格式：普通任务 `交差：{任务名}`；选择类 `交差：{任务名}（{choice.label}）`（保持 `:176` 现状）。
R-4-13 交付成功后 `Dialogue` 用 `turnIn` 返回的文本替换正文（`:65-69` 现状），并把模式切回 `msg`；交付失败（`ok: false`）必须把返回的失败文案显示为正文，禁止静默忽略。

### 4.5 交付文案规范

R-4-14 `turnInLine` 长度 ≤ **20 个字**，按 `[...str].length` 计数（全角/半角都算 1）；现有 60 条实测 6–12 字，全部合规。
R-4-15 `turnInLine` 缺省时**不输出**台词行（现状 `:636` 的行为保留）；禁止用占位句凑数。
R-4-16 交付文本格式固定：

```
【完成】{任务名}
{交付人名}：「{turnInLine}」        ← 仅在 turnInLine 存在时出现
{日志正文（choice.log ?? reward.log）}
（{结算摘要}）                        ← 仅在摘要非空时出现
```

`结算摘要` 片段顺序固定：`+N 元` → `好感 +K` → `获得「物品」` → `选择：{label}`，用 ` · ` 连接（保持 `:630-637` 现状）。
R-4-17 交付人不明（`turnInNpc` 为空）时，抬头省略台词行，`结算摘要` 不变。

### 4.6 交付后的结算顺序（必须逐字实现，禁止调换）

`complete(rt, choiceIndex)`（`:569-638`）顺序冻结为：

1. 从 `active` 移除该 id；`status = 'completed'`；`completedDay = gameDayIndex()`；`completed.add(id)`。
2. 解析 `choice`（越界钳制，现状 `:579-581`）。
3. **金钱**：`base = reward.money ?? 0`；`decay = repeatCount === 0 ? 1 : repeatCount === 1 ? 0.5 : 0.25`；`paid = max(0, min(round(base*decay), MONEY_CAP - moneyToday))`；`moneyToday += paid`；`player.money += paid`。（`MONEY_CAP = 30`，`:17`）
4. **交付人好感**：`reward.affinity` 记到 `turnInNpc(def)`（规则同 `:640-657`：当日全城 ≤3 心 `HEART_CAP`、同一 NPC 当日 ≤1 心、NPC 总好感 ≤4 `NPC_HEART_CAP`、增量每次 ≤1）。
5. **选择好感**：`choice.affinity` 用 `bypassDaily = true` 通道结算（仍受 `[1,5]` 边界）。
6. **物品**：`reward.item` 进 `inventory`，计数 +1。
7. **标签**：`reward.tag`、`choice.tag` 进 `tags`。
8. **日志与年度事件**：`tier !== 'daily'` 时 `pushJournal(log)` 且 `yearEvents.push({ text: log, valence: 1, importance: 2 })`。
9. **计数**：`repeatCount += 1`、`questsToday += 1`、`readyAnnounced = false`。
10. **解锁**：主线 → `discoverStory(day)`；链环 → 解锁下一环（`:616-625` 现状）。
11. **提示**：`hud.toast`（`:627-629` 现状：日常 `顺手做完了：X`，其它 `完成：X（+N 元）`）。
12. **返回文本**：按 R-4-16 组装。
13. **标记刷新**：下一帧 `markers()` 自动不再包含该任务（无需额外清理）。

R-4-18 顺序可观测后果：金钱失败（`paid = 0`，被日上限吃满）**不影响**好感与物品发放；日志一定在金钱/好感之后写入，因此年度报表里同一年既有「完成」又有「超时」时两条都会出现。

### 4.7 多任务并存 / 同一 NPC / 同一地点

R-4-19 同时进行中上限 `MAX_ACTIVE = 3`（`:16`）；超出时 `accept` 返回 `你手上已经有 3 件事了。先做完一件，再接新的。`（文案不变）。
R-4-20 同一 NPC 可同时持有多个可交差任务：菜单必须全部列出（不截断）；数字键 1–9 的选择限制沿用 `src/ui/dialogue.ts:138-140`，超过 9 项时用上下键。
R-4-21 多个任务指向同一位置时，地图只画一个标记（§5.5），但面板、追踪条、菜单各自仍按任务逐条显示（禁止合并任务条目）。
R-4-22 日常每日上限 `questsToday >= 3` 时 `offersForNpc` 返回空（`:156-157`），与交付无关，禁止改动。

### 4.8 放弃与交付的区别

R-4-23 「X 放下」继续走 `abandon`（`:446-458`）：不写日志、不扣好感、`cooldown = 今日 + 1`。放弃**不**算超时，不触发 R-3-17 记账。

---

## 5. 地图标记

### 5.1 单一数据源（消除"三处各画各的"）

R-5-01 必须新增唯一查询方法，三处渲染与面板状态色全部消费它：

```ts
markers(): MapMarker[]   // 已排序、已去重、已截断，长度 <= 3
```

R-5-02 `drawMinimapMarkers`（`:845-859`）、`drawBigMapMarkers`（`:861-880`）、`drawWorldMarkers`（`:825-843`）必须把内部实现改为 `for (const m of this.markers())`，禁止各自 `map/markerFor/filter/slice`。
R-5-03 面板「进行中」每行的符号与颜色，必须由同一条 `markerFor` 结果推导（§6.1），保证「面板说的」与「地图画的」是同一份数据。

### 5.2 标记字段与语义

```ts
export interface MapMarker {
  questId: string;                 // 归属任务，页面/测试可反查
  tx: number;                      // Tile 坐标（NPC：像素位置 / TILE）
  ty: number;
  color: string;                   // 见 §5.3 三色表
  label: string;                   // 大地图/世界内标签
  kind: 'npc' | 'place';           // 交付人/目标 NPC vs 目标地点
  urgency: 'ready' | 'urgent' | 'active';
  priority: number;                // ready=3 / urgent=2 / active=1（排序用）
}
```

R-5-04 `markerFor(rt)` 的解析顺序固定：

1. `status === 'ready'`：交付人存在 → 标交付人，`label = {交付人名} · 交差`，`kind='npc'`；交付人不存在 → `null`。
2. `status === 'active'`：取 `currentIndex(rt)`；`< 0` → `null`。
   - `talk` 目标 → 标该 NPC，`label = {NPC名}`，`kind='npc'`；NPC 不存在 → `null`。
   - `visit` 目标 → 标 `PLACES[place]`，`label = {地点名}`，`kind='place'`；地点不存在 → `null`。
   - `collect` 目标 → 标第一个未访问地点，`label = {地点名}`，`kind='place'`；全访问完 → `null`。
   - `wait` 目标 → 标交付人（`turnInNpc`），`label = {交付人名} · 等{剩余天数}天`（`剩余天数 = o.days - rt.progress[i]`），`kind='npc'`；交付人不存在 → `null`。**修 D-8 的 wait 目标无标记问题**。
3. `urgency` / `color` 计算（三色，全部取自既有调色板）：
   - `status === 'ready'` → `urgency='ready'`，`color='#7fd18a'`（绿，可交差）。
   - 未完成且 `remaining <= warnHours` → `urgency='urgent'`，`color='#c96a5a'`（红，临期）。
   - 其它 → `urgency='active'`，`color='#ffd166'`（黄，进行中）。
4. `priority` = `3 / 2 / 1` 对应上三者。

R-5-05 本次**取消**「日常任务不上地图」的旧规则（`:752-753`）：玩家诉求是"接下的任务必须在地图上标出来"，日常同样是接下的任务。日常与主线/支线在标记上的唯一差异是 `label`（仍为地点名/NPC 名）。
R-5-06 标记坐标保持现有约定：NPC 用 `(r.x + 12) / TILE, (r.y + 14) / TILE`（`:761-762`、`:772-773`），地点用 `PLACES[key].tx/ty`。

### 5.3 形状 / 颜色 / 尺寸 / 标签（三处一致）

| 位置 | 形状 | 尺寸 | 颜色 | 标签 |
| --- | --- | --- | --- | --- |
| 小地图（`minimapPos`） | `npc` = 菱形（旋转 45° 方块）；`place` = 正方形（不旋转） | 边长 7px | 三色表 | 不画文字 |
| 大地图（`bigMapScreenPos`） | 同上 | 边长 12px | 三色表 | 标记上方 14px，12px monospace，同色 |
| 世界内（相机坐标） | 同上 | 边长 10px | 三色表 | 距玩家中心 ≤ 6 Tile 时画，标记上方 14px，12px monospace，同色 + 黑描边 |
| 任务面板 | 符号（非图形） | — | 同色 | 见 §6.1 |

R-5-07 形状必须区分 `kind`（现`markerFor` 两种都用菱形，本次改为 NPC 菱形 / 地点正方形），并在三处保持一致。
R-5-08 描边统一 `rgba(10,12,16,0.9)`，线宽 2px（小地图 1.5px）。
R-5-09 禁止把颜色用于表达 `kind`：颜色只表达 `urgency`，形状只表达 `kind`，两轴正交。

### 5.4 三处显示一致性（玩家可见的硬约束）

R-5-10 同一帧内，小地图、大地图、世界内三处**地图绘制**的任务标记集合必须逐一对应：数量相同、`questId` 相同、`urgency` 相同、`color` 相同、`kind` 相同。实现上由 `markers()` 单点保证，禁止任何地图绘制处额外过滤。任务面板的「进行中」页签按任务逐条显示，不参与 §5.5 的同点合并（被合并的任务仍逐条保留，见 R-5-14 / AC-14），其每行符号/颜色由同一条 `markerFor` 结果推导（R-5-03），与地图共享 `urgency`/`color`/`kind`，但条目数量可多于去重后的地图标记数量。
R-5-11 世界内标记集合与两张地图相同（同一 `markers()`），差异只在「视口外改画边缘箭头」（§5.6）。
R-5-12 进入室内场景时不画任何地图，也不渲染人生备忘录（现状：`src/scenes/indoorScene.ts` 不调用 `drawMinimap/drawBigMap`，`questPanel.render` 只在世界场景调用）。这是已定边界，不算违规：室内没有地图就没有标记，回到世界场景后面板与标记按当时状态恢复。

### 5.5 数量上限与去重合并

R-5-13 上限 `MAX_MARKERS = 3`（等于 `MAX_ACTIVE = 3`）；`markers()` 返回前必须截断。
R-5-14 去重键：`${Math.round(tx)}:${Math.round(ty)}`；同键只保留优先级最高者（`priority` 大者优先；同优先级取 `deadlineAbsHour` 小者；仍相同取 `questId` 字典序小者）。被合并的任务仍保留在面板/追踪条里。
R-5-15 排序：`priority` 降序 → `deadlineAbsHour` 升序（`undefined` 排最后）→ `questId` 升序。排序结果必须稳定（同一状态两次调用返回同序）。

### 5.6 视口外边缘指示

R-5-16 世界内标记的屏幕坐标必须由纯函数给出（新增公开方法，供测试断言）：

```ts
markerScreen(m: MapMarker, camX: number, camY: number): { x: number; y: number; onScreen: boolean };
// 屏幕坐标 = { x: m.tx * TILE + 16 - camX, y: m.ty * TILE + 12 - camY }
// onScreen = x >= 0 && x < PANEL_X && y >= 0 && y < VIEW_H      （PANEL_X = 1088，src/ui/attrPanel.ts:11）
```

R-5-17 `onScreen === true` → 画菱形/正方形（§5.3）。
R-5-18 `onScreen === false` → **不画图形**，改在可玩视口边缘画方向箭头：把 `(x, y)` 沿射线夹到矩形 `[16, PANEL_X - 16] × [16, VIEW_H - 16]` 上，画边长 10px 的实心三角形，尖端朝标记方向，颜色同 `color`，透明度 0.85。
R-5-19 小地图与大地图**永不**画边缘箭头：`worldMapImage` 的 `scaleX/scaleY`（`src/map/minimap.ts:58-63`）保证任意 Tile 都落在圆内，不存在"视口外"。
R-5-20 边缘箭头同样受 §5.5 的数量与排序约束（最多 3 个）。

### 5.7 已过期 / 无位置 / 日常

| 情形 | 地图 | 面板 |
| --- | --- | --- |
| `status === 'expired'` / `'completed'` / `'failed'` | 不显示（已不在 `active`） | 「进行中」不再出现；`expired` 在「可接」以 `✕` 前缀出现（R-3-20） |
| 标记解析为 `null`（地点/NPC 数据缺失、`currentIndex < 0` 且非 ready） | 不显示 | 行尾追加 `（无地图位置）`，符号 `○` 灰色 `#6a7078` |
| `tier === 'daily'` | 显示（R-5-05 新规则） | 正常显示 |
| 无时限（`noDeadline`） | 显示（标签不带倒计时） | 截止行显示 `无时限` |

### 5.8 绘制顺序与层级

R-5-21 世界场景顺序不变：`renderBuildings` → `drawWorldMarkers` → `drawNpcBadges` → 雨层（`src/scenes/overworldScene.ts:411-418`）。
R-5-22 小地图：`drawMinimap` → `drawMinimapMarkers`（`:483-484` 现状保留）；标记必须画在圆内且不被外圈描边覆盖。
R-5-23 大地图：`drawBigMap` → `drawBigMapMarkers`（`:487-488` 现状保留）；标记与标签不得进入右侧地点面板（面板左边界 `x = 700`，地图最右 `652`，天然不冲突）。

---

## 6. 任务面板规格（`src/ui/questPanel.ts`）

### 6.1 「进行中」页签

R-6-01 行首符号由 `markers()`/`markerFor` 推导（禁止另算一套）：

| 状态 | 符号 | 颜色 |
| --- | --- | --- |
| `ready` | `◆` | `#7fd18a` |
| 临期未完成 | `▲` | `#c96a5a` |
| 其余未完成 | `◇` | `#ffd166` |
| 无地图位置 | `○` | `#6a7078` |

R-6-02 副标题行（`:203` 现状）保留 `currentHint(rt)`，临期时该行同样用 `#c96a5a`。
R-6-03 详情页字段顺序固定：名称 → `tier · type · source` → 描述 → `目标 · {deadlineText}` → 目标列表 → `交付：{交付人名} · {windowText}` → `奖励：{rewardText}` → 任务链 → 底部操作提示。
R-6-04 详情页「交付」行必须用 `turnInNpc`（修 `:335` 直接读 `def.turnIn`）；`turnInNpc` 为空时显示 `交付：—（自动完成）`。
R-6-05 `ready` 状态底部提示保持 `去和对方说一声，就算交付。`（`:353`）；非 ready 保持 `X 放下 · 事情不会消失，只是先不做了。`。
R-6-06 交付人所在地不可达（P-1）时，`交付` 行追加 `（先出门）`。注：因 R-5-12 规定面板只在世界场景渲染，P-1 成立时面板本就不显示，故此分支为防御性兜底，正常游玩不可达。

### 6.2 「可接」页签

R-6-07 条目前缀优先级：`✕`（`expired`）→ `⛓`（`chain`）→ `◆`（`main`）→ `○`（其它）。
R-6-08 详情页在「奖励」之前插入一行 `时限：{limitText(def)}`，`limitText` 取值：

| 情形 | 串 |
| --- | --- |
| `noDeadline` | `无时限` |
| 整点型且 `N === 0` | `当天 {HH}:00 前` |
| 整点型且 `N > 0` | `{N} 天内（{HH}:00 前）` |
| 日型且 `N === 0` | `当天（明早 06:00 前）` |
| 日型且 `N > 0` | `{N} 天` |

其中 `N` 按 §3.2 的优先级与默认值计算（未接取时用 def 推算，不写 runtime）。

### 6.3 接取文本（`acceptText`）

R-6-09 `acceptText` 改为接收 `rt`，输出格式固定：

```
【委托】{任务名}
{描述}

· {目标 hint}          （逐条）
截止：{deadlineText(rt)}
交付：{交付人名}{ · 现在在{区域} / 约 HH:00–HH:00 在{区域}}
奖励：{rewardText}
（Q 打开人生备忘录）
```

R-6-10 `toast` 文案保持 `接下：{任务名}`（`:386`），不追加其它内容。

---

## 7. 数据结构与存档兼容

### 7.1 字段增改总表

| 类型 | 字段 | 动作 | 类型 | 默认值 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `QuestDef` | `noDeadline` | 新增 | `boolean?` | `false` | 逃生舱，120 条数据均不使用 |
| `QuestDef` | `warnHours` | 新增 | `number?` | `2` | (0,12] |
| `QuestDef` | `timeLimitDays` | 语义收紧 | `number?` | 见 §3.2 | 取值域 0..7 |
| `QuestDef` | `deadlineHour` | 语义收紧 | `number?` | 无 | 取值域 6..23，注释同步改为「当日截止整点（6..23，日界 06:00）」 |
| `QuestRuntime` | `deadlineAbsHour` | 新增 | `number?` | `undefined` | **权威**截止时刻（绝对游戏小时） |
| `QuestRuntime` | `deadlineDay` | 保留 | `number` | `999999` | 镜像：最后一个可用游戏日；`999999` = 无时限 |
| `QuestRuntime` | `deadlineHour` | 保留 | `number?` | 无 | 镜像：整点型截止小时 |
| `QuestRuntime` | `warnStage` | 新增 | `0 \| 1 \| 2` | `0` | 已发出的临期档位 |
| `QuestRuntime` | `expiredLogged` | 新增 | `boolean` | `false` | 超时记账幂等标志 |
| `MapMarker` | `questId` | 新增 | `string` | — | 反查任务 |
| `MapMarker` | `urgency` | 新增 | `'ready'\|'urgent'\|'active'` | — | 颜色/排序依据 |
| `MapMarker` | `priority` | 新增 | `number` | — | 3/2/1 |
| `QuestRuntimeSnapshot` | `deadlineAbsHour` | 新增 | `number?` | 无 | 旧档缺省 → 迁移（§7.5） |
| `QuestRuntimeSnapshot` | `warnStage` | 新增 | `0\|1\|2?` | `0` | 旧档缺省 → 0 |
| `QuestRuntimeSnapshot` | `expiredLogged` | 新增 | `boolean?` | 见 §7.5 | 旧档缺省 → 由 status 推导 |

### 7.2 类型定义（可直接抄）

```ts
// src/quest/types.ts
export interface QuestDef {
  // …既有字段不动…
  timeLimitDays?: number;     // 0..7；接取日算第 0 天（§3.1）
  deadlineHour?: number;      // 6..23；当日截止整点（日界 06:00，§2.1）
  softDeadline?: boolean;
  noDeadline?: boolean;       // true = 确实无时限（§3.1）
  warnHours?: number;         // 默认 2；(0,12]
  // …
}

export interface QuestRuntime {
  // …既有字段不动…
  deadlineAbsHour?: number;   // 权威：绝对游戏小时
  warnStage: 0 | 1 | 2;
  expiredLogged: boolean;
}
```

```ts
// src/quest/questManager.ts
export interface MapMarker {
  questId: string;
  tx: number;
  ty: number;
  color: string;
  label: string;
  kind: 'npc' | 'place';
  urgency: 'ready' | 'urgent' | 'active';
  priority: number;
}

export interface QuestRuntimeSnapshot {
  // …既有字段不动…
  deadlineAbsHour?: number;
  warnStage?: 0 | 1 | 2;
  expiredLogged?: boolean;
}
```

R-7-01 `ensure()`（`:93-110`）初始化 runtime 时必须补齐 `warnStage: 0`、`expiredLogged: false`、`deadlineAbsHour: undefined`。
R-7-02 禁止把 `deadlineAbsHour` 的 `undefined` 与 `0`、`NaN` 混用；无时限必须是 `undefined` + `deadlineDay === 999999`。

### 7.3 新增 helper（位置固定，禁止散落）

| helper | 位置 | 职责 |
| --- | --- | --- |
| `absGameHour()` / `dayOfAbsHour()` / `setGameTime()` | `src/core/daynight.ts` | §2.2，唯一时间标尺；`setGameTime` 仅调试用 |
| `defaultTimeLimitDays(def)` | `src/quest/questManager.ts`（模块级函数） | §3.2 tier 默认 + R-3-05 wait 修正 |
| `turnInNpc(def)` | `src/quest/questManager.ts`（模块级函数，导出） | §4.1 交付人解析 |
| `deadlinePassed(rt, nowAbs?)` | `QuestManager` 私有方法 | §3.4 |
| `warnDeadline(rt, nowAbs)` | `QuestManager` 私有方法 | §3.6 |
| `markers()` / `markerScreen()` / `deadlineInfo()` | `QuestManager` 公开方法 | §5、§8.2 |

`deadlineInfo` 返回结构：

```ts
deadlineInfo(rt: QuestRuntime): {
  hasDeadline: boolean;
  remainingHours: number | null;   // null = 无时限
  deadlineDay: number;             // 999999 = 无时限
  deadlineHour?: number;
  warnStage: 0 | 1 | 2;
  text: string;                    // 恒等于 deadlineText(rt)
};
```

### 7.4 snapshot / restore

R-7-03 `snapshot()`（`:906-941`）必须写入 `deadlineAbsHour`、`warnStage`、`expiredLogged`（其余字段原样）。
R-7-04 `restore()`（`:943-992`）读取规则：

```
if (r.deadlineAbsHour !== undefined) → 直接用
else if (r.deadlineDay === 999999 || r.deadlineDay === undefined) → undefined（无时限）
else if (r.deadlineHour !== undefined) → r.deadlineDay * 24 + r.deadlineHour
else → (r.deadlineDay + 1) * 24 + 6            // 旧日型语义：该日结束
```

R-7-05 `warnStage` 缺省 → `0`；`expiredLogged` 缺省 → `r.status === 'expired' || r.status === 'failed'`。
R-7-06 历史 `status === 'failed'` 的条目在 `restore` 时必须归一为 `'expired'`（修 D-10）；`'completed'`/`'available'`/`'active'`/`'ready'` 原样保留。
R-7-07 `restore` 后 `active` 只保留 `status` 为 `active`/`ready` 的 id（`:986-991` 现状保留）；读档第一帧的 `update` 负责把已过期的清出去（R-3-23）。

### 7.5 旧存档迁移矩阵（localStorage，`SAVE_KEY = 'life-sim:save'`）

| 旧档情形 | `deadlineAbsHour` | `warnStage` | `expiredLogged` | 可见结果 |
| --- | --- | --- | --- | --- |
| `deadlineDay = 999999`（旧无时限） | `undefined` | `0` | `false` | 面板 `无时限`，永不过期 |
| 旧日型 `deadlineDay = D` | `(D + 1) * 24 + 6` | `0` | `false` | 与旧行为一致（第 D 日结束时到期） |
| 旧整点型 `deadlineDay = D, deadlineHour = H` | `D * 24 + H` | `0` | `false` | 与旧行为一致（当天 H 点） |
| `status = 'failed'`（旧超时） | 同上按字段推导 | `0` | `true` | 归一为 `expired`，不重复记账 |
| `status = 'ready'` 且已过截止 | 按字段推导 | `0` | `false` | 读档第一帧转 `expired` 并记一次账 |

### 7.6 SAVE_VERSION 决策（冻结）

R-7-08 `SAVE_KEY` 与 `SAVE_VERSION = 2` **保持不变**。理由：`loadSave`（`src/core/save.ts:147`）对 `v !== 2` 直接返回 `null`（丢档），升版本会清掉所有玩家存档；本次新增字段全部可缺省，`restore` 已给出默认值与迁移（§7.5），因此无需升版本。
R-7-09 禁止修改 `SaveData` 的既有键名与层级；只允许在 `QuestSnapshot` 内部追加字段。
R-7-10 读档兼容性必须由 AC-15/AC-16 证明（§9）。

---

## 8. 调试与可验证性（自动化验证的接口契约）

### 8.1 新增调试钩子（只加在 `src/main.ts` 的调试区，与 `__ctx/__player/__input` 同风格）

```ts
(window as unknown as { __time: unknown }).__time = {
  gameDayIndex, gameHour, absGameHour,
  setGameTime,          // §2.2
  skipGameDays, skipToNextMorning, advanceGameMinutes,
};
```

R-8-01 `__time.setGameTime(day, hour)` 必须能在 1 帧内把游戏时钟钉到「第 `day` 日的 `hour` 点」，且与 R-2-03 / §2.3 一致：`hour ∈ [6,24)` 时 `absGameHour() === day*24 + hour`；`hour ∈ [0,6)`（当日循环的凌晨段）时 `gameHour() === 24 + hour`、`gameDayIndex() === day`，故 `absGameHour() === day*24 + 24 + hour`。
R-8-02 `?dn=night` 会污染 `gameHour()`（`src/core/daynight.ts:14-18`、`:44`），验证脚本禁止同时使用 `?dn=night` 与 `__time.setGameTime`。

### 8.2 必须公开的查询 API（验收以此断言，禁止改名）

| API | 位置 | 用途 |
| --- | --- | --- |
| `__ctx.quests.accept(id, fromNpc)` | 既有 | 接取 |
| `__ctx.quests.turnIn(id, choiceIndex?)` | 既有 | 交付 |
| `__ctx.quests.runtime(id)` | 既有 | 取运行时 |
| `__ctx.quests.def(id)` | 既有 | 取定义（测试可临时改字段） |
| `__ctx.quests.deadlineText(rt)` | 既有 | 面板文案断言 |
| `__ctx.quests.deadlineInfo(rt)` | **新增** | 剩余小时/档位断言 |
| `__ctx.quests.markers()` | **新增** | 标记集合断言 |
| `__ctx.quests.markerScreen(m, camX, camY)` | **新增** | 视口/边缘指示断言 |
| `__ctx.quests.turnInOptionsForNpc(npc)` | 既有 | 交付入口断言 |
| `__ctx.quests.journalLines()` | 既有 | 日志条数断言 |
| `__ctx.quests.consumeYearEvents()` | 既有 | 年度事件断言（注意：消费后清空） |
| `__ctx.quests.snapshot()` / `.restore(s)` | 既有 | 存档往返断言 |
| `__ctx.overworld.residents.list` | 既有 | 找 NPC / 改好感做前置 |
| `__player.x / .y / .placeAtTile()` | 既有 | 摆放玩家位置 |
| `__input.setVirtual(code, down)` | `src/core/input.ts:38-45` | 注入按键（E/Q/Tab） |

### 8.3 现有 URL 调试参数（验证脚本可组合）

| 参数 | 作用 | 出处 |
| --- | --- | --- |
| `?auto` | 跳过建角直接进世界 | `src/main.ts:89-104` |
| `?new=1` | 忽略存档 | `:79` |
| `?quests` | 显示全部任务（`discoverAll`） | `:84` |
| `?quest` | 直接打开人生备忘录 | `src/scenes/overworldScene.ts:60` |
| `?at=tx,ty` | 传送出生点 | `src/main.ts:38-42` |
| `?age=N` | 快进到指定年龄 | `:99-103` |
| `?money=N` | 加钱 | `:96-97` |
| `?rain` | 固定下雨 | `src/core/weather.ts:8` |

---

## 9. 验收用例（AC-01 … AC-18）

通用约定：

- 环境：`npm run dev` 后打开 `?auto&money=100`；控制台可用 `__ctx / __player / __input / __time`。
- 「前置」里给 NPC 好感赋值只用于满足 `prereq.affinity`，属于测试脚手架，不改游戏数值。
- 在到达预期状态前，`update` 每帧自动运行；断言前至少等 2 帧（约 50ms）。
- 判定方式：控制台断言（`console.assert`）为主；肉眼/截图用于文案与颜色。

### AC-01 接取即产生「当天型」截止（日型 N=0）
- 前置：`__time.setGameTime(100, 10)`；无任何进行中任务。
- 操作：`__ctx.quests.accept('d-fj-tofu', true)`。
- 预期：
  1. `runtime('d-fj-tofu').deadlineAbsHour === 2430`（第 101 日 06:00）。
  2. `deadlineText(rt) === '明早 06:00 前到期'`。
  3. 接取文本包含 `截止：明早 06:00 前到期` 与 `交付：曹德顺`（`d-fj-tofu` 的 `turnIn` 是 `cds`）。
  4. `rt.warnStage === 0`、`rt.expiredLogged === false`。

### AC-02 整点型当天截止与文案
- 前置：`__time.setGameTime(100, 20.5)`（窗口 20–23 内）。
- 操作：`__ctx.quests.accept('d-wgf-med-night', true)`。
- 预期：
  1. `deadlineAbsHour === 2421`（当天 21:00）；`deadlineDay === 100`；`deadlineHour === 21`。
  2. `deadlineText(rt) === '今天 21:00 前 · 最后半小时'`（`remaining === 0.5`，§3.9 追加后缀）。
  3. `deadlineInfo(rt).remainingHours === 0.5`。

### AC-03 整点型「恰好到点」算超时
- 前置：承接 AC-02。
- 操作：`__time.setGameTime(100, 20.99)` → 等 2 帧；再 `__time.setGameTime(100, 21)` → 等 2 帧。
- 预期：
  1. 20.99 时 `runtime.status === 'active'`（未超时）。
  2. 21.00 时立即超时：`status !== 'active'`（日常走向 `available`），`snapshot().active` 已不含该 id。
  3. toast 为 `错过了时间：二十一点前。过几天还能再试。`
  4. 日常超时**不写**日志：`journalLines().length` 不变；年度事件不新增。

### AC-04 日型「恰好到点」算超时（跨天 + 06:00 日界）
- 前置：`__time.setGameTime(100, 10)`；`s-cdw-parcel` 前置好感：`__ctx.overworld.residents.list.find(r=>r.def.id==='cdw').affinity = 2`。
- 操作：`accept('s-cdw-parcel', false)`；然后依次 `setGameTime(102, 4)`（剩余 2 小时）、`setGameTime(102, 5.99)`（剩余 0.01 小时）、`setGameTime(103, 6)`（恰好到点），每步等 2 帧。
- 预期：
  1. 接取后 `deadlineAbsHour === 2478`（第 103 日 06:00）、`deadlineDay === 102`、`deadlineText === '还剩 2 天'`。
  2. 第 102 日 04:00 与 05:59（`absGameHour` 2476 / 2477.99）均 `status === 'active'`。
  3. 第 103 日 06:00 整变 `expired`（恰好到点算超时）。
  4. 日志 +1 且内容为 `…岁那年，三号楼那件，我没赶上时间。`；`consumeYearEvents()` 多出 1 条且 `valence === -1`、`importance === 2`（该调用会清空队列，断言放在本条用例末尾）；`expiredLogged === true`。
  5. 再等 3 帧不重复记账（日志条数不再增加）。

### AC-05 临期两档提示（含临界值 2 与 0.5）
- 前置：刷新页面后按 AC-04 的接取步骤得到 `deadlineAbsHour = 2478` 的 `s-cdw-parcel`（本用例不要推进到第 103 日）。
- 操作：`setGameTime(102, 4)` → 2 帧；`setGameTime(102, 4.5)` → 2 帧；`setGameTime(102, 5.5)` → 2 帧；`setGameTime(102, 5.8)` → 2 帧。
- 预期：
  1. 剩余 2 小时（`remaining === 2`）时 `warnStage === 1`，toast `⏳ 三号楼那件：快到时间了。`
  2. 剩余 1.5 小时时 `warnStage` 仍为 1，不重复提示一档。
  3. 剩余 0.5 小时（`remaining === 0.5`）时 `warnStage === 2`，toast `⚠ 三号楼那件：只剩最后半小时。`
  4. 剩余 0.2 小时时 `warnStage` 仍为 2，无新提示。
  5. `deadlineText(rt)` 在 `remaining <= 2` 后带 ` · 快到期了`，在 `remaining <= 0.5` 后带 ` · 最后半小时`。

### AC-06 「已完成未交付」同样受截止约束（修 D-2）
- 前置：`setGameTime(100, 10)`；接取 `s-cdw-parcel`；随后把 `rt.progress` 直接置为 `[1,1,1]` 并等 2 帧。
- 操作：确认 `status === 'ready'`；`setGameTime(103, 6)` 等 2 帧。
- 预期：
  1. ready 状态下 `turnInOptionsForNpc('cdw').length === 1`（有交付入口）。
  2. 到点后 `status === 'expired'`、`turnInOptionsForNpc('cdw').length === 0`。
  3. 日志 +1（且只有一条），`markers()` 不再含该任务。

### AC-07 交付人 ≠ 发布人：只能在交付人处交差
- 前置：`setGameTime(100, 10)`；接取 `d-fj-tofu`（`fromNpc = true`，第一目标已推进）；把 `rt.progress` 置为 `[1,1]` 等 2 帧使 `status === 'ready'`；玩家先站到冯军（`fj`）身边。
- 操作：读 `turnInOptionsForNpc('fj')` 与 `turnInOptionsForNpc('cds')`；再调用 `turnIn('d-fj-tofu')`。
- 预期：
  1. `turnInOptionsForNpc('fj').length === 0`（发布者不是交付人）。
  2. `turnInOptionsForNpc('cds').length === 1`，标签为 `交差：一碗豆腐脑`。
  3. 站在冯军旁边调用 `turnIn` 返回 `ok === false`，文案 `离曹德顺太远了，走近一点。`
  4. 任务仍是 `ready`，奖励未发放（金钱/好感/日志都不变）。

### AC-08 交付距离门禁（56px 临界）
- 前置：承接 AC-07，玩家移到曹德顺（`cds`）附近。
- 操作：
  1. `__player.x = cds.x + 60; __player.y = cds.y + 60;`（中心距约 84px）→ `turnIn`。
  2. `__player.x = cds.x; __player.y = cds.y;`（中心距 0px）→ `turnIn`。
- 预期：
  1. 距离 > 56 时返回 `ok === false`，文案 `离曹德顺太远了，走近一点。`
  2. 距离 0 时返回 `ok === true`，文本以 `【完成】一碗豆腐脑` 开头，含日志正文 `我替冯军给曹德顺送了一碗豆腐脑…`。
  3. 因 `d-fj-tofu` 没有 `turnInLine`，文本**不含** `「`。

### AC-09 交付结算顺序与上限
- 前置：承接 AC-08 第 2 步之前；记录 `player.money`、`cds.affinity`、`fj.affinity`、`__ctx.quests.journalLines().length`、`__ctx.quests.snapshot().questsToday`。
- 操作：近距离 `turnIn('d-fj-tofu')`。
- 预期：
  1. 金钱增加 `+8`（`d-fj-tofu` 奖励 8 元，当日任务收入未触顶）。
  2. `cds.affinity` 增加 1；`fj.affinity` 不变（好感记交付人）。
  3. 日志条数不变（`d-fj-tofu` 为 `daily`，不写人生日志、不进年度事件，见 §4.6 第 8 步与 O-10）；交付返回文本中的日志正文行仍为「我替冯军给曹德顺送了一碗豆腐脑。多出来的半勺，老曹没声张。」（R-4-16）。
  4. `runtime.status === 'completed'`；`markers()` 不含该任务；`snapshot().questsToday` 由 0 变 1。
  5. 连续第二次调用 `turnIn` 返回 `ok === false`（状态已不是 ready）。

### AC-10 玩家不在世界场景时禁止交付
- 前置：承接 AC-07 的 ready 状态；玩家站在曹德顺旁边。
- 操作：`__ctx.scenes.set({ update(){}, render(){} });`（临时替换当前场景，模拟"不在世界里"）→ `turnIn('d-fj-tofu')` → 立即 `__ctx.scenes.set(__ctx.overworld)` 复原。
- 预期：
  1. 返回 `ok === false`，文案 `要当面交给曹德顺。`
  2. 任务仍 `ready`，奖励未发放，日志条数不变。

### AC-11 下雨不构成「NPC 不在场」
- 前置：`?rain&auto` 进入（强制下雨）；接取并推到 ready（同 AC-07 的准备）；玩家站到曹德顺旁边。
- 操作：`turnIn('d-fj-tofu')`。
- 预期：
  1. 交付成功（`ok === true`），无任何"不在场/改天再来"提示。
  2. 地图标记、面板、对话入口在雨天与晴天表现一致。

### AC-12 三处标记一致 + 数量上限
- 前置：`setGameTime(100, 10)`；依次接取 `s-cdw-parcel`、`s-zxm-bugs`、`s-wjg-boxes`（好感前置按需赋值）。
- 操作：读 `markers()`；打开小地图与大地图（截图）；再尝试接第 4 个任务。
- 预期：
  1. `markers().length === 3`，每个元素都有 `questId/kind/urgency/priority/color`。
  2. 三个标记的 `color` 与各自 `deadlineInfo` 推算的 `urgency` 一致（无临期时 `#ffd166`）。
  3. 第 4 次 `accept` 返回失败文案 `你手上已经有 3 件事了。先做完一件，再接新的。`（`markers()` 仍为 3）。
  4. 小地图与大地图上的标记数量、位置、颜色与 `markers()` 一一对应（截图比对）。

### AC-13 标记跟随目标推进（talk → visit → talk → 交差）
- 前置：`setGameTime(100, 10)`；`cdw.affinity = 2`；接取 `s-cdw-parcel`；记录 `markers()[0]` 的 `tx/ty`（应为陈大伟位置）。
- 操作：把 `rt.progress` 依次置为 `[1,0,0]`、`[1,1,0]`、`[1,1,1]`，每步等 2 帧。
- 预期：
  1. `[1,0,0]` 后标记指向 `PLACES.h2`（`tx=329, ty=56`），`kind === 'place'`，`label === '苏家'`。
  2. `[1,1,0]` 后回到「和 cdw 说话」目标：标记指向陈大伟，`kind === 'npc'`，`label === '陈大伟'`。
  3. `[1,1,1]` 后进入 `ready`：标记指向陈大伟，`kind === 'npc'`，`label === '陈大伟 · 交差'`，`color === '#7fd18a'`。
  4. 四步的 `markers().length` 恒为 1。

### AC-14 同点合并与排序
- 前置：`setGameTime(100, 10)`；`cdw.affinity = 2`；接取 `s-cdw-parcel`；接取 `d-xwt-flower` 并把 `rt.progress` 置为 `[1,0]`（当前目标也是"和 `cdw` 说话"）。
- 操作：读 `markers()`；再把 `d-xwt-flower` 的 `progress` 置为 `[1,1]`（转 ready）等 2 帧；最后 `__ctx.quests.abandon('d-xwt-flower')`。
- 预期：
  1. `markers().length === 1`（两任务同点合并）。
  2. 合并后 `questId === 'd-xwt-flower'`（其截止更早：日常当天到期 vs 支线 2 天后）。
  3. 面板「进行中」仍显示 2 条任务（不合并条目）。
  4. `[1,1]` 后两者都指向陈大伟（一个目标 NPC、一个交付人），仍合并为 1 条；放弃 `d-xwt-flower` 后 `markers()` 仍为 1 条且 `questId === 's-cdw-parcel'`。

### AC-15 读档后时限仍精确（快照往返）
- 前置：`setGameTime(100, 10)` 接取 `s-cdw-parcel`，记录 `const s = __ctx.quests.snapshot()`。
- 操作：`setGameTime(101, 12)`；`__ctx.quests.restore(s)`；读 `deadlineAbsHour` 与 `deadlineText`；再 `setGameTime(103, 6)` 等 2 帧。
- 预期：
  1. 恢复后 `deadlineAbsHour === 2478`（不被当前时间重算）。
  2. `deadlineText === '还剩 1 天'`（今日 101，截止日 102）。
  3. 到 103 日 06:00 恰好超时一次：`journalLines().length` 只 +1，`expiredLogged === true`。
  4. 等自动存档（5 秒）后刷新页面：`localStorage.getItem('life-sim:save')` 可解析，且其中 `quests.runtimes` 里该任务的 `deadlineAbsHour === 2478`（续档后截止不变）。

### AC-16 旧存档兼容（缺字段 + 旧 failed 语义）
- 前置：手写一个"旧档形状"的快照：
  ```js
  const s = __ctx.quests.snapshot();
  const r = s.runtimes.find(x => x.id === 's-cdw-parcel');
  r.status = 'active'; r.deadlineDay = 102; delete r.deadlineHour;
  delete r.deadlineAbsHour; delete r.warnStage; delete r.expiredLogged;
  ```
- 操作：`__ctx.quests.restore(s)`；读迁移结果；再 `setGameTime(103, 6)` 等 2 帧。
- 预期：
  1. `deadlineAbsHour === 2478`（旧日型迁移为"该日结束"）。
  2. `warnStage === 0`、`expiredLogged === false`。
  3. 到点后 `status === 'expired'`，日志只 +1。
  4. 另一条构造：`r.status = 'failed'` 恢复后 `status === 'expired'` 且 `expiredLogged === true`（不重复记账）。

### AC-17 多任务并存互不影响
- 前置：`__time.setGameTime(100, 10)`；按 AC-12 赋好感满足前置后，临时把 `s-cdw-parcel` 的 `def.timeLimitDays = 0`（测试脚手架，令其截止为当天结束 `2430`，即第 101 日 06:00），`s-zxm-bugs`/`s-wjg-boxes` 保持默认（截止 `2478`，第 103 日 06:00）；依次接取这 3 个任务（同 AC-12）。
- 操作：`__time.setGameTime(101, 6)` 等 2 帧（仅 `s-cdw-parcel` 到点）；读取其余两个任务的 `status` 与 `markers()`；再 `__time.setGameTime(104, 7)` 等 2 帧，读 `availableDefs()`（冷却 `completedDay + 3`，第 101 日超时 → 第 104 日可再接）。
- 预期：
  1. 超时任务转 `expired`，另两个仍 `active`。
  2. `markers().length === 2`；剩下两个标记的 `color/urgency` 不变。
  3. 面板「进行中」剩 2 条；`availableDefs()` 在第 102 日（冷却期内）不含 `s-cdw-parcel`，第 104 日后包含它，且 `runtime('s-cdw-parcel').status === 'expired'`（「可接」以 `✕` 前缀显示）。
  4. 日志只 +1（只属于超时任务）。

### AC-18 面板/接取文本四形态（当天日型 / 当天整点 / 跨天日型 / 跨天整点）
- 前置：分别在可接窗口内制造四种截止并接取：`d-fj-tofu`（当天日型，`__time.setGameTime(100, 10)`）、`d-wgf-med-night`（当天整点，`__time.setGameTime(100, 20.5)`，此时 `remaining === 0.5`）、`s-cdw-parcel`（跨天日型，`__time.setGameTime(100, 10)`）、把 `d-wgf-med-night` 的 `def.timeLimitDays = 2` 后 `__time.setGameTime(100, 20.5)` 接取（跨天整点）。
- 操作：逐个读 `deadlineText(rt)` 与接取文本中的 `截止：` 行。
- 预期（逐字）：
  1. `明早 06:00 前到期`
  2. `今天 21:00 前 · 最后半小时`
  3. `还剩 2 天`
  4. `还剩 2 天（21:00 前）`
- 追加：四种情形下 `deadlineInfo(rt).text` 与 `deadlineText` 完全一致；面板「进行中」详情「目标 ·」行与之一致。

---

## 10. 明确不改（outOfScope，评审以此判定越界）

| 编号 | 不改什么 | 依据 |
| --- | --- | --- |
| O-1 | 不改经济数值与收支：`MONEY_CAP = 30`、任务奖励金额、零花、车费、学费、住院费、商店价格 | `src/quest/questManager.ts:17`；`src/entities/player.ts:200-205` |
| O-2 | 不改好感体系：`HEART_CAP = 3`、`NPC_HEART_CAP = 4`、每日同 NPC 1 心、聊天/送礼增减、冷淡日 | `src/quest/questManager.ts:18-19`、`:640-657`；`src/entities/resident.ts:124-144` |
| O-3 | 不引入新美术风格：不新增配色体系；临期色复用既有 `#c96a5a`，绿/黄沿用 `#7fd18a`/`#ffd166` | `src/ui/dialogue.ts:217`、`src/ui/questPanel.ts:350` |
| O-4 | 不动存档主版本：`SAVE_KEY`、`SAVE_VERSION = 2`、`SaveData` 键名与层级不变；只追加可选字段 | §7.6 |
| O-5 | 不改 120 条任务的内容与数值：名称、描述、目标、奖励、`prereq`、`window`、`chain`、`repeat` 一律不动；时限只通过 def 字段语义与默认值生效 | §1.3 |
| O-6 | 不新增「NPC 生病 / 天气导致 NPC 离场」系统；不为 NPC 增加疾病或避雨行为 | §4.3 |
| O-7 | 不改居民日程数据与寻路（`src/data/residents.ts`、`src/entities/resident.ts` 的移动逻辑） | R-4-06 |
| O-8 | 不改学校考勤/成绩、车流与出租车、室内场景布局；室内仍不画地图 | §5.4 R-5-12 |
| O-9 | 不改「放弃（X）」规则：不写日志、不扣好感、冷却 1 天 | R-4-23 |
| O-10 | 不改日常「不写人生日志、不进年度报表」的既有取舍（超时沿用同一取舍） | R-3-17 |
| O-11 | 不新增 UI 页签/浮层：人生备忘录仍是「进行中 / 可接 / 人生日志」三页签 | `src/ui/questPanel.ts:9` |
| O-12 | 不改构建与测试脚本（`package.json`、`tsconfig.json`、`test/*`） | — |
| O-13 | 不改存档读取失败的兜底策略（解析失败/版本不符一律返回 `null`） | `src/core/save.ts:140-153` |
| O-14 | 不新增第二条时间轴或"现实分钟"倒计时；一切以游戏时钟为准 | §2 |

---

## 11. 实现清单（逐文件、可直接打勾）

| # | 文件 | 改动点 | 关联规则 |
| --- | --- | --- | --- |
| 1 | `src/core/daynight.ts` | 新增导出 `absGameHour()`、`dayOfAbsHour()`、`setGameTime()` | R-2-01…03 |
| 2 | `src/quest/types.ts` | `QuestDef` 增 `noDeadline`/`warnHours`，收紧 `timeLimitDays`/`deadlineHour` 注释；`QuestRuntime` 增 `deadlineAbsHour`/`warnStage`/`expiredLogged` | §7.1、§7.2 |
| 3 | `src/quest/questManager.ts` | 常量 `MAX_MARKERS`；模块函数 `turnInNpc`、`defaultTimeLimitDays`；`accept()` 重写截止计算与接取文本；`update()` 重排 ①②③④⑤；`deadlinePassed`/`warnDeadline`/`expire`/`complete` 按 §3、§4；`deadlineText`/`deadlineInfo`/`drawTracker`；`markerFor`/`markers`/`markerScreen`/三处绘制；`turnInOptionsForNpc` 用 `turnInNpc` + 过期过滤；`snapshot`/`restore` 新字段与迁移；`MapMarker`/`QuestRuntimeSnapshot` 类型 | §3、§4、§5、§7 |
| 4 | `src/ui/questPanel.ts` | 符号/颜色改由 `markerFor` 推导；详情页「交付」用 `turnInNpc`（`:335`）；「可接」前缀 `✕`（`:226`）；插入 `时限：` 行（`:386` 前）；临期红字（`:323`） | §6 |
| 5 | `src/ui/dialogue.ts` | 菜单顺序（聊天→送礼→交差→委托→离开）；失败文案显示（`:60-71`） | R-4-11…13 |
| 6 | `src/scenes/overworldScene.ts` | 无需改逻辑；确认 `drawWorldMarkers` 的边缘箭头在可玩区裁剪内（`:393-462`） | §5.6 |
| 7 | `src/main.ts` | 调试钩子 `__time`（`:85-87` 同区追加） | R-8-01 |
| 8 | `src/core/save.ts` | 不改代码；确认 `SAVE_VERSION` 不升（`:19`）、`QuestSnapshot` 类型自动带新字段 | R-7-08 |
| 9 | `src/quest/data.ts` / `data-extra.ts` | **不改**（时限由默认值覆盖；现有唯一 `deadlineHour: 21` 保持） | O-5 |

实现完成的自检要求：

1. `npx tsc`（`npm run build` 的第一步）零错误；`strict: true` 下不得用 `any` 绕过（测试脚手架除外）。
2. `?auto&quests` 下连按 `Q` 三页签无异常；地图打开/关闭 20 次无报错。
3. §9 的 18 条用例全部通过。

---

## 12. 规格自检（对照本任务的验收口径）

| 验收项 | 落点 | 状态 |
| --- | --- | --- |
| 六个部分齐全（时限/交付/地图标记/数据结构/验收用例/边界） | §3 / §4 / §5+§6 / §7 / §9 / §10 | 满足 |
| 每条规则给出精确判定边界（含「恰好到点」） | §2.4 临界值总表 + R-3-08、R-3-10、R-5-14、R-4-06 | 满足 |
| 验收用例 ≥10 且为「前置→操作→预期」 | §9，共 18 条 | 满足 |
| 引用的文件/类型/函数名与现存代码一致 | §1.1 全部标注行号；文中引用的 `accept/expire/complete/markerFor/deadlineText/windowText/snapshot/restore/MapMarker/QuestRuntime/QuestDef/YearEvent/PANEL_X` 均为真实符号 | 满足 |
| 明确写出本次不改范围 | §10（O-1…O-14） | 满足 |
| 全文无未决表述 | 全文规则闭合，不含未决措辞（评审可用关键词检索复核） | 满足 |
| 只改文档、不动源码 | 本文件位于 `life-sim-ts/docs/`，未修改任何 `.ts` | 满足 |

---

## 13. 勘误记录（v1.1）

> 本表记录实现/验证/评审阶段共同发现的 7 处规格自相矛盾及最终裁定。裁定原则：**以更权威的条款为准，规格向已实现并通过全部测试（157 PASS / 0 FAIL）的语义对齐**，不改变任何运行时行为。

| # | 原条款 | 错误原因 | 最终解释 |
| --- | --- | --- | --- |
| 1 | R-8-01：`setGameTime(day, hour)` 让 `absGameHour() === day*24+hour`（`hour ∈ [0,24)`） | 与 R-2-03 公式矛盾：`hour ∈ [0,6)` 落入当日循环的凌晨段，`gameHour() === 24+hour` | 以 R-2-03 为准：`hour ∈ [6,24)` 时 `absGameHour === day*24+hour`；`hour ∈ [0,6)` 时 `absGameHour === day*24+24+hour` |
| 2 | R-5-10：「小地图、大地图、任务面板三处…数量相同」 | 与 R-5-14（被合并的任务仍保留在面板/追踪条）矛盾：面板按任务逐条显示，条目数可多于去重后的地图标记数 | 以 AC-14 为准：三处地图绘制数量逐一对齐；面板逐条显示、不参与同点合并，仅共享同一 `markerFor` 的 `urgency`/`color`/`kind` |
| 3 | R-4-10 / R-6-06：「P-1 成立时面板该行追加（先出门）」 | 与 R-5-12（面板只在世界场景渲染）矛盾：P-1 成立时面板不显示，分支不可达 | 保留为防御性兜底；在 R-4-10 / R-6-06 注明「正常游玩不可达」 |
| 4 | §2.3 示例「第 100 日 次日 03:00」 | 措辞错误：`gameHour() === 27` 属第 100 日循环的凌晨段（日界 06:00，`gameDayIndex()` 仍为 100） | 改为「第 100 日 当日凌晨 03:00」，数值 2427 不变 |
| 5 | AC-09.3：「日志 +1，文本为…」 | 与 §4.6 第 8 步 / O-10 矛盾：`d-fj-tofu` 为 `daily`，完成不写人生日志/年度事件 | 以 §4.6/O-10 为准：日志条数不变；交付返回文本仍含日志正文行（R-4-16） |
| 6 | AC-02.2 / AC-18.2：预期串 `今天 21:00 前` | 漏了 §3.9 的临期后缀：`remaining === 0.5` 时应追加「 · 最后半小时」 | 补全为 `今天 21:00 前 · 最后半小时` |
| 7 | AC-17 前置「同时接 3 个任务（同 AC-12）」 | 三个 `side` 同日接取默认截止同为 `2478`，无法单独让 `s-cdw-parcel` 超时 | 改写前置：临时令 `s-cdw-parcel.timeLimitDays = 0`（截止 `2430`），另两个保持默认（`2478`）；可再接日由第 106 日改为第 104 日（`completedDay + 3`） |
