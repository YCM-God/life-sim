# 交接：人生得分 + 成就系统（Agent Team）

> 给新会话的说明：请先读完本文件，再用 agent_teams_create(approval="required") 建队，
> 计划交给用户审阅后再启动。

## 用户需求（原话要点）

1. 给 2D 游戏做一个“后端得分系统”：完成各种任务和生活琐事后，给人生加分。
2. 人生成就系统，例如：
   - 交朋友、提升别人对你的好感度会增加友情分；友情分累积到一定阶段（如第五阶）时解锁对应成就。
   - 学习系统：成绩达到一定高度时解锁成就。
3. 由团队设计这套人生成就和加分系统。

## 已确认的口径

- “后端”= **纯前端计分核心，但抽出一层存储接口**。计分/成就引擎在浏览器本地运行，
  存档沿用现有 localStorage（`life-sim:save`）和 IndexedDB（`life-sim-saves` 玫瑰存档）。
  “存在哪里”抽象成接口，以后接服务器只需替换实现。不做真服务器。
- 必须兼容旧存档：老存档读进来时，新字段要有默认值，不能导致崩溃。

## 团队编排（用户指定）

| 成员 | 模型路由 | 职责 |
|---|---|---|
| designer | yan-shen-2 / claude-opus-5-5 | 理解需求，提出意见，写设计文档（计分规则、成就表、数据结构、存储接口、UI 落点） |
| implementer | deepseek-official / deepseek-flash（DeepSeek-V4.1-Flash） | 按设计实现并按审查意见修改 |
| reviewer | DeepSeek-V4-Pro（路由待用户配置） | 检查改动、修复错误，把最终版提交并推送到 GitHub |

GitHub 推送属于对外发布，必须在用户明确确认后才能执行。

## 工程事实

- 源码：`life-sim-ts/`（分支 `source`）；发布仓：`github-life-sim/`（分支 `main`，GitHub Pages 根目录）
- 远程：`git@github.com:YCM-God/life-sim.git`
- Node：`C:\Users\ASUS\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`
- 验证命令（在 `life-sim-ts/` 下执行）：
  - 类型检查：`node .\node_modules\typescript\bin\tsc --noEmit`（基线 0 错误）
  - 回归测试：`node .\test\quest-logic-check.mjs`（基线 PASS 157 / FAIL 0）
  - 构建：`node .\node_modules\vite\bin\vite.js build --base ./`
    —— 沙箱内会报 `spawn EPERM`（vite 会执行 `net use`，esbuild 需要启动子进程），需要申请提权单次运行。
- 发布脚本：`tools/publish.mjs`（检查 → 测试 → 构建 → 备份 → 同步 dist → 推送 main）
- 网络：hosts 把 GitHub 域名指向 127.0.0.1（本地代理）；Node 需要加 `--use-system-ca`，git 用 `C:/Windows/System32/OpenSSH/ssh.exe`。

## 可直接接入的现有数据

- `src/systems/classroom.ts`：课堂事件已有 `favor`（老师好感）、`score`、`neighbor`/`neighborFavor`（同桌好感 0~5）
- `src/systems/schoolState.ts`：期末考试成绩、“学神”称号
- `src/data/residents.ts` / `src/entities/resident.ts`：居民与对话
- `src/quest/questManager.ts`：任务完成事件（适合作为“完成任务加分”的钩子）
- `src/core/yearReport.ts` + `src/scenes/yearEndScene.ts`：年终结算（适合展示年度得分）
- `src/scenes/lifeEndScene.ts`：100 岁寿终结局（适合展示人生总分与成就墙）
- `src/core/save.ts` / `src/core/saveSlots.ts`：存档
