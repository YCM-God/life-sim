// 天气系统：每日天气（晴/雨），雨天下玩家暴露在户外累积淋雨时长 → 感冒风险
// ?rain 强制今天下雨（调试）
import { gameDayIndex } from './daynight';

export class WeatherSystem {
  private decidedDay = -1;
  private rainyToday = false;
  private forceRain = new URLSearchParams(location.search).has('rain');

  isRainy(): boolean {
    const d = gameDayIndex();
    if (this.forceRain) return true;
    if (d !== this.decidedDay) {
      this.decidedDay = d;
      this.rainyToday = Math.random() < 0.25; // 25% 的天下雨
    }
    return this.rainyToday;
  }

  /** 新的一天开始时提示语（null = 不提示） */
  dayNotice(hasUmbrella: boolean): string | null {
    if (this.decidedDay !== gameDayIndex()) this.isRainy(); // 确保已判定
    if (this.rainyToday) return hasUmbrella ? '下雨了。幸好带了伞。' : '下雨了——不打伞淋着走，可是会感冒的。';
    return null;
  }

  /** 雨天屏幕叠层：斜雨丝 + 轻压暗（程序绘制，无资产） */
  drawRain(g: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    g.fillStyle = 'rgba(40,60,90,0.14)';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(170,200,235,0.55)';
    g.lineWidth = 1.5;
    g.beginPath();
    for (let i = 0; i < 110; i++) {
      const seed = i * 137.5;
      const x = (seed * 13.7 + t * 260) % (w + 80) - 40;
      const y = (seed * 7.3 + t * 620) % (h + 40) - 20;
      g.moveTo(x, y);
      g.lineTo(x - 5, y + 13);
    }
    g.stroke();
  }

  // ---- 存档 ----

  snapshot(): WeatherSnapshot {
    return {
      decidedDay: this.decidedDay,
      rainyToday: this.rainyToday,
      forceRain: this.forceRain,
    };
  }

  restore(s: WeatherSnapshot): void {
    this.decidedDay = s.decidedDay ?? -1;
    this.rainyToday = !!s.rainyToday;
    this.forceRain = !!s.forceRain;
  }
}

/** 存档快照：当日天气（当天已判定过的结果要保留，否则读档会重新掷一次雨） */
export interface WeatherSnapshot {
  decidedDay: number;
  rainyToday: boolean;
  forceRain: boolean;
}
