// 出租车电台：歌单播放 + WebAudio 合成占位 + 本地 mp3 接入
// 歌单（方大同六首，用户指定）：Love Song / 特别的人 / 麦恩莉 / 红豆 / 三人游 / 春风吹
// 版权说明：工程内不捆绑受版权保护的录音。把 mp3 放到 public/music/khalil-1.mp3 … khalil-6.mp3
// 即自动播放原曲；缺失的曲目用原创合成小调占位（非原曲旋律）。
import { VIEW_W } from '../config';

export interface Track {
  title: string;
  artist: string;
  file: string;      // /music/khalil-N.mp3
  hasFile: boolean;  // 启动时探测
}

export const PLAYLIST: Track[] = [
  { title: 'Love Song', artist: '方大同', file: '/music/khalil-1.mp3', hasFile: false },
  { title: '特别的人', artist: '方大同', file: '/music/khalil-2.mp3', hasFile: false },
  { title: '麦恩莉', artist: '方大同', file: '/music/khalil-3.mp3', hasFile: false },
  { title: '红豆', artist: '方大同', file: '/music/khalil-4.mp3', hasFile: false },
  { title: '三人游', artist: '方大同', file: '/music/khalil-5.mp3', hasFile: false },
  { title: '春风吹', artist: '方大同', file: '/music/khalil-6.mp3', hasFile: false },
];

// B 站电台（用户指定来源）：方大同精选合集，官方播放器 iframe 接入
// 优先级：本地 mp3（public/music/）> B 站电台 > 原创合成占位
const BILI_BVID = 'BV139pxeGENb';

// ---- 原创合成占位旋律（6 首各不同调式/速度，非任何现有歌曲）----
// 音名 → 频率
function n2f(semi: number, base = 220): number {
  return base * Math.pow(2, semi / 12);
}
// 每首：十六分音符级进数组（音程 semitone，-99 = 休止），配和弦根音走向
interface SynthTune {
  tempo: number;      // BPM
  wave: OscillatorType;
  melody: number[];   // 相对 A3 的半音，-99 休止
  bass: number[];     // 每小节根音（4 拍一小节，循环）
}
const TUNES: SynthTune[] = [
  { tempo: 96,  wave: 'triangle', melody: [0,4,7,4, 9,7,4,2, 0,4,7,11, 9,7,4,-99, 2,4,7,4, 12,9,7,4, 5,7,9,7, 4,2,0,-99], bass: [0,0,5,7] },
  { tempo: 82,  wave: 'sine',     melody: [7,9,11,9, 7,4,2,4, 0,2,4,7, 9,7,4,2, 7,9,11,14, 12,9,7,9, 4,2,0,-99, 2,4,2,0], bass: [0,-3,5,7] },
  { tempo: 104, wave: 'square',   melody: [0,0,7,7, 4,4,2,2, 5,5,4,2, 0,-99,2,4, 7,7,9,9, 11,9,7,4, 5,4,2,4, 0,-99,-99,-99], bass: [0,5,3,7] },
  { tempo: 72,  wave: 'sine',     melody: [4,7,11,7, 9,7,4,2, 0,4,9,4, 7,4,2,-99, 4,7,12,7, 11,9,7,4, 2,0,-3,0, 2,-99,0,-99], bass: [0,0,-4,5] },
  { tempo: 92,  wave: 'triangle', melody: [0,2,4,7, 9,7,4,2, 4,7,9,12, 11,9,7,4, 0,2,4,2, 7,4,2,0, -99,4,2,4, 0,-99,-99,-99], bass: [0,3,5,4] },
  { tempo: 112, wave: 'square',   melody: [7,9,11,12, 14,12,11,9, 7,4,2,4, 7,9,7,-99, 11,12,14,16, 14,12,11,9, 12,11,9,7, 9,7,4,-99], bass: [0,7,5,3] },
];

export class Radio {
  private audio: AudioContext | null = null;
  private idx = 0;
  private playing = false;
  private muted = false;
  private el: HTMLAudioElement | null = null;   // mp3 模式
  private biliFrame: HTMLIFrameElement | null = null; // B 站电台模式
  private mode: 'synth' | 'mp3' | 'bili' = 'synth';
  private synthTimer: number | null = null;     // 合成模式
  private synthStep = 0;
  private synthNext = 0;
  private probed = false;

  get current(): Track {
    return PLAYLIST[this.idx];
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** 启动探测：哪些曲目有本地 mp3（用 Content-Type 判定，防止 SPA 回退页被当成音频） */
  async probe(): Promise<void> {
    if (this.probed) return;
    this.probed = true;
    await Promise.all(PLAYLIST.map(async (t) => {
      try {
        const r = await fetch(t.file, { method: 'HEAD' });
        t.hasFile = r.ok && (r.headers.get('content-type') ?? '').startsWith('audio');
      } catch {
        t.hasFile = false;
      }
    }));
  }

  private ensureAudio(): AudioContext | null {
    try {
      this.audio ??= new AudioContext();
      if (this.audio.state === 'suspended') void this.audio.resume();
      return this.audio;
    } catch {
      return null;
    }
  }

  play(index?: number): void {
    if (index !== undefined) this.idx = ((index % PLAYLIST.length) + PLAYLIST.length) % PLAYLIST.length;
    this.stop();
    this.playing = true;
    const t = this.current;
    if (t.hasFile) {
      this.mode = 'mp3';
      this.el = new Audio(t.file);
      this.el.loop = true;
      void this.el.play().catch(() => {});
    } else {
      this.mode = 'synth';
      this.startSynth();
    }
  }

  /** B 站电台：嵌入方大同精选合集（官方播放器 iframe，音频流不落地）。
   *  下车调用 stop() 即移除 iframe 停声。浏览器可能拦截自动发声，需玩家先有一次点击/按键。 */
  playBili(bvid: string = BILI_BVID): void {
    this.stop();
    this.playing = true;
    this.mode = 'bili';
    const f = document.createElement('iframe');
    f.src = `https://player.bilibili.com/player.html?bvid=${bvid}&autoplay=1&danmaku=0`;
    f.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
    f.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    f.style.cssText = 'position:fixed;left:-3000px;top:0;width:640px;height:360px;border:0;';
    document.body.appendChild(f);
    this.biliFrame = f;
  }

  next(): void {
    if (this.mode === 'bili') return; // 视频电台无法逐首切换，保持整集播放
    this.play(this.idx + 1);
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.el) this.el.muted = this.muted;
    if (this.synthTimer !== null && this.muted) this.stopSynth();
    else if (!this.muted && this.playing && !this.current.hasFile) this.startSynth();
  }

  stop(): void {
    this.playing = false;
    this.stopSynth();
    if (this.el) {
      this.el.pause();
      this.el = null;
    }
    if (this.biliFrame) {
      this.biliFrame.remove();
      this.biliFrame = null;
    }
  }

  private startSynth(): void {
    const ac = this.ensureAudio();
    if (!ac || this.muted) return;
    const tune = TUNES[this.idx % TUNES.length];
    this.synthStep = 0;
    this.synthNext = ac.currentTime + 0.06;
    const stepDur = 60 / tune.tempo / 4; // 十六分音符
    const scheduleAhead = 0.18;
    const tick = (): void => {
      if (!this.playing || this.muted) return;
      while (this.synthNext < ac.currentTime + scheduleAhead) {
        const s = this.synthStep % tune.melody.length;
        const semi = tune.melody[s];
        const bar = Math.floor(this.synthStep / 16) % tune.bass.length;
        this.note(ac, n2f(tune.bass[bar] + 0, 110), this.synthNext, stepDur * 3.6, 'sine', 0.05);
        if (semi > -50) this.note(ac, n2f(semi), this.synthNext, stepDur * 1.7, tune.wave, 0.055);
        this.synthStep += 1;
        this.synthNext += stepDur;
      }
      this.synthTimer = window.setTimeout(tick, 60);
    };
    tick();
  }

  private stopSynth(): void {
    if (this.synthTimer !== null) {
      clearTimeout(this.synthTimer);
      this.synthTimer = null;
    }
  }

  private note(ac: AudioContext, freq: number, t: number, dur: number, wave: OscillatorType, vol: number): void {
    const o = ac.createOscillator();
    const gn = ac.createGain();
    o.type = wave;
    o.frequency.value = freq;
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn).connect(ac.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** 左下角迷你播放器（车程场景调用） */
  draw(g: CanvasRenderingContext2D): void {
    const w = 300;
    const x = 16;
    const y = 60;
    g.fillStyle = 'rgba(10,12,16,0.6)';
    g.fillRect(x, y, w, 46);
    g.strokeStyle = 'rgba(232,232,232,0.3)';
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, w - 1, 45);
    g.font = '13px monospace';
    g.textBaseline = 'top';
    g.fillStyle = this.playing ? '#e86a6a' : '#8a8f98';
    g.fillText(this.playing ? '♪ 正在播放' : '♪ 电台已关', x + 10, y + 6);
    g.fillStyle = '#e8e8e8';
    const t = this.current;
    const label = this.mode === 'bili'
      ? '方大同精选合集 · B站电台'
      : `${t.title} · ${t.artist}${t.hasFile ? '' : '（合成伴奏）'}`;
    g.fillText(label, x + 10, y + 24);
    g.fillStyle = '#8a8f98';
    g.textAlign = 'right';
    g.fillText(this.mode === 'bili' ? '整集连播' : `R 换歌${this.muted ? ' · 已静音' : ''}`, x + w - 10, y + 24);
    g.textAlign = 'left';
    void VIEW_W;
  }
}
