// 8-bit 音效小工具：结算屏涨跌音、琶音（与属性面板生日音同风格）
let ac: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ac ??= new AudioContext();
    return ac;
  } catch {
    return null; // 无音频环境
  }
}

function beep(freqFrom: number, freqTo: number, dur: number, vol: number, delay = 0): void {
  const a = audio();
  if (!a) return;
  const o = a.createOscillator();
  const gn = a.createGain();
  o.type = 'square';
  const t0 = a.currentTime + delay;
  o.frequency.setValueAtTime(freqFrom, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(freqTo, 1), t0 + dur);
  gn.gain.setValueAtTime(0.0001, t0);
  gn.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
  gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(gn).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

// 属性上涨/下跌短音；big=大幅变化叠加低哑闷响
export function tick(up: boolean, big = false): void {
  if (up) beep(440, 660, 0.08, 0.05);
  else beep(330, 220, 0.08, 0.05);
  if (big) beep(160, 90, 0.25, 0.07, 0.05);
}

// 上扬琶音（好年收尾 / 生日）
export function arpeggio(notes: number[], step = 0.14, vol = 0.07): void {
  notes.forEach((f, i) => beep(f, f, 0.24, vol, i * step));
}
