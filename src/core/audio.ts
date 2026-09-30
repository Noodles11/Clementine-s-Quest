// Procedural WebAudio sound effects. No audio files.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let volume = 0.7;
let pitchShift = 1;

function ensure() {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volume * 0.5;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
  }
  return ctx;
}

export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') void c.resume();
}

export function setVolume(v: number) {
  volume = v;
  if (master) master.gain.value = v * 0.5;
}

/** Deeper depths lower the pitch of everything slightly (Descent Curve). */
export function setPitchShift(p: number) {
  pitchShift = p;
}

interface ToneOpts {
  type?: OscillatorType;
  f0: number;
  f1?: number;
  dur: number;
  vol?: number;
  attack?: number;
  delay?: number;
}

function tone(o: ToneOpts) {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime + (o.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f0 * pitchShift, t);
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1 * pitchShift), t + o.dur);
  const v = o.vol ?? 0.3;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + (o.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t);
  osc.stop(t + o.dur + 0.02);
}

function noise(dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = 'lowpass', freq1?: number) {
  const c = ensure();
  if (!c || !master || !noiseBuf) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq * pitchShift, t);
  if (freq1) f.frequency.exponentialRampToValueAtTime(freq1 * pitchShift, t + dur);
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

const last: Record<string, number> = {};
function throttle(key: string, ms: number) {
  const now = performance.now();
  if (now - (last[key] ?? 0) < ms) return false;
  last[key] = now;
  return true;
}

export const sfx = {
  shoot() {
    if (!throttle('shoot', 40)) return;
    tone({ type: 'sine', f0: 520 + Math.random() * 80, f1: 900, dur: 0.08, vol: 0.12 });
  },
  pop() {
    if (!throttle('pop', 30)) return;
    tone({ type: 'sine', f0: 900 + Math.random() * 300, f1: 300, dur: 0.07, vol: 0.1 });
  },
  hit() {
    if (!throttle('hit', 35)) return;
    tone({ type: 'square', f0: 220, f1: 110, dur: 0.07, vol: 0.08 });
    noise(0.06, 0.12, 2000);
  },
  kill() {
    tone({ type: 'triangle', f0: 400, f1: 80, dur: 0.25, vol: 0.2 });
    noise(0.2, 0.2, 1200, 1, 'lowpass', 200);
  },
  hurt() {
    tone({ type: 'sawtooth', f0: 300, f1: 90, dur: 0.3, vol: 0.18 });
    noise(0.25, 0.2, 900);
  },
  coin() {
    tone({ type: 'square', f0: 988, dur: 0.07, vol: 0.08 });
    tone({ type: 'square', f0: 1319, dur: 0.18, vol: 0.08, delay: 0.07 });
  },
  pickup() {
    tone({ type: 'triangle', f0: 600, f1: 1200, dur: 0.12, vol: 0.15 });
  },
  heart() {
    tone({ type: 'sine', f0: 660, dur: 0.1, vol: 0.15 });
    tone({ type: 'sine', f0: 880, dur: 0.18, vol: 0.15, delay: 0.08 });
  },
  item() {
    [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.25, vol: 0.14, delay: i * 0.08 }));
  },
  synergy() {
    [784, 988, 1175, 1568, 1976].forEach((f, i) => tone({ type: 'square', f0: f, dur: 0.18, vol: 0.07, delay: i * 0.06 }));
  },
  door() {
    noise(0.35, 0.18, 400, 2, 'bandpass', 120);
  },
  explosion() {
    noise(0.6, 0.5, 1500, 1, 'lowpass', 60);
    tone({ type: 'sine', f0: 120, f1: 30, dur: 0.5, vol: 0.4 });
  },
  zap() {
    if (!throttle('zap', 60)) return;
    tone({ type: 'sawtooth', f0: 1800, f1: 200, dur: 0.12, vol: 0.06 });
  },
  laser() {
    tone({ type: 'sawtooth', f0: 180, f1: 90, dur: 0.6, vol: 0.12 });
    noise(0.6, 0.12, 3000, 1, 'highpass');
  },
  charge() {
    if (!throttle('charge', 120)) return;
    tone({ type: 'sine', f0: 300, f1: 600, dur: 0.12, vol: 0.04 });
  },
  bossRoar() {
    tone({ type: 'sawtooth', f0: 90, f1: 45, dur: 1.2, vol: 0.25 });
    noise(1.2, 0.25, 500, 1, 'lowpass', 80);
  },
  enemyShoot() {
    if (!throttle('eshoot', 50)) return;
    tone({ type: 'triangle', f0: 300, f1: 180, dur: 0.08, vol: 0.08 });
  },
  splash() {
    noise(0.3, 0.2, 800, 1, 'bandpass', 300);
  },
  unlock() {
    [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.35, vol: 0.12, delay: i * 0.1 }));
  },
  deny() {
    tone({ type: 'square', f0: 160, f1: 120, dur: 0.15, vol: 0.08 });
  },
  descend() {
    tone({ type: 'sine', f0: 400, f1: 60, dur: 1.5, vol: 0.25 });
    noise(1.5, 0.25, 800, 1, 'lowpass', 100);
  },
  horn() {
    tone({ type: 'sawtooth', f0: 110, dur: 0.9, vol: 0.2, attack: 0.05 });
    tone({ type: 'sawtooth', f0: 165, dur: 0.9, vol: 0.12, attack: 0.05 });
  },
};
