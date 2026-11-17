// 游玩时长统计：只累计前台真实游玩的时间（创建角色界面不算，切后台 rAF 停转自然不计）
// 存进自动存档与玫瑰存档，读档时随进度一起恢复
let playMs = 0;

export function addPlayMs(ms: number): void {
  if (ms > 0) playMs += ms;
}

export function currentPlayMs(): number {
  return Math.round(playMs);
}

/** 读档恢复用：直接设定累计时长 */
export function setPlayMs(ms: number): void {
  playMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
}

/** 新开一局归零 */
export function resetPlayTime(): void {
  playMs = 0;
}

/** 面向玩家的时长文案：3秒 / 4分05秒 / 1小时23分 */
export function formatPlayMs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}小时${m}分`;
  if (m > 0) return `${m}分${ss.toString().padStart(2, '0')}秒`;
  return `${ss}秒`;
}
