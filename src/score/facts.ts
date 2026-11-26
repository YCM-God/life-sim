// 唯一接触 GameContext 的计分模块：把游戏状态翻译成纯数据（WorldView / ScoreFacts / ScoreClock）。
// 之所以把胶水集中在这里，是为了让 engine/rules/achievements/store 全部能在 Node 里裸测。
import type { GameContext } from '../context';
import { gameDayIndex } from '../core/daynight';
import { factsFromState } from './engine';
import type { ScoreClock, ScoreFacts, ScoreState, WorldView } from './types';

export function clockOf(ctx: GameContext): ScoreClock {
  return { day: gameDayIndex(), age: ctx.player.age };
}

export function worldView(ctx: GameContext): WorldView {
  const residents = ctx.overworld.residents.list.map((r) => ({
    id: r.def.id,
    affinity: r.affinity,
    secretRevealed: r.secretRevealed,
  }));
  const s = ctx.schoolState;
  return {
    clock: clockOf(ctx),
    residents,
    school: {
      lastExamAge: s.lastExamAge,
      lastExamCorrect: s.lastExamCorrect,
      lastExamTotal: s.lastExamTotal,
      subjects: { ...s.subjects },
      graduated: s.graduated,
      gradeTag: s.gradeTag,
      recommendation: s.recommendation,
    },
    questsCompleted: ctx.quests.completedIds(),
  };
}

export function buildFacts(ctx: GameContext, state: ScoreState): ScoreFacts {
  return factsFromState(state, worldView(ctx));
}

/**
 * 立即结算一次（推导型加分 + 成就判定）。
 * 用于期末交卷、跳过今年、寿终等需要“马上看到结果”的时点；主循环里由 tick 每秒自动做。
 */
export function refreshScore(ctx: GameContext): void {
  const score = ctx.score;
  if (!score) return;
  const view = worldView(ctx);
  score.sync(view);
  score.evaluate(buildFacts(ctx, score.state), view.clock);
}
