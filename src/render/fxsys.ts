// Presentation-side implementation of Fx: particles, comic onomatopoeia,
// lightning, rings, transient lights, shake, flashes, hitstop.

import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { FONT_TITLE } from '../config';
import { cosmetic as R } from '../core/rng';
import { ParticleSystem } from '../ambient/particles';
import type { BurstKind, Fx } from '../game/fx';
import { INK } from '../ambient/plants';
import { tex } from './textures';

interface FloatText {
  t: Text;
  age: number;
  life: number;
  vy: number;
  rot: number;
}

interface Bolt {
  pts: number[];
  age: number;
  life: number;
  color: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  age: number;
  life: number;
  color: number;
}

export interface Light {
  x: number;
  y: number;
  r: number;
  color: number;
  intensity: number;
  age: number;
  life: number;
}

export class FxSystem implements Fx {
  world: ParticleSystem;
  glow: ParticleSystem;
  textLayer = new Container();
  texts: FloatText[] = [];
  bolts: Bolt[] = [];
  rings: Ring[] = [];
  lights: Light[] = [];
  shakeAmt = 0;
  flashAmt = 0;
  flashColor = 0xffffff;
  hitstopFrames = 0;
  sandColor = 0xffe3a3;
  shakeScale = 1;
  flashScale = 1;
  onExplosion?: (x: number, y: number) => void;
  /** Nearby decorations wobble on impacts. */
  onImpact?: (x: number, y: number, strength: number) => void;
  onBanner?: (title: string, sub: string, color?: number) => void;
  onToast?: (title: string, sub: string) => void;
  private flashSprite: Sprite;

  constructor(flashLayer: Container) {
    const t = tex();
    const set = { bubble: t.bubble, snow: t.dot, sand: t.dot, spark: t.spark, ring: t.ring, dot: t.dot, star: t.star, ink: t.soft, shard: t.dot };
    this.world = new ParticleSystem(set, 900, false);
    this.glow = new ParticleSystem(set, 500, true);
    this.flashSprite = new Sprite(Texture.WHITE);
    this.flashSprite.alpha = 0;
    this.flashSprite.width = 2000;
    this.flashSprite.height = 2000;
    this.flashSprite.x = -500;
    this.flashSprite.y = -500;
    flashLayer.addChild(this.flashSprite);
  }

  burst(x: number, y: number, kind: BurstKind, color = 0xffffff, n = 6) {
    const W = this.world, G = this.glow;
    const impact = ({ pop: 0.35, kill: 1, sand: 0.6, explosion: 3, shards: 0.6 } as Record<string, number>)[kind];
    if (impact) this.onImpact?.(x, y, impact);
    switch (kind) {
      case 'pop':
        W.spawn({ kind: 'ring', x, y, life: 0.25, size: 10, size1: 26, color: 0xeaffff, alpha: 0.9, fluid: 0 });
        for (let i = 0; i < n; i++)
          W.spawn({ kind: 'bubble', x, y, vx: R.range(-60, 60), vy: R.range(-90, 10), life: R.range(0.5, 1.2), size: R.range(4, 8), gravity: -80, fluid: 0.5, wobble: 10 });
        G.spawn({ kind: 'dot', x, y, life: 0.18, size: 30, size1: 10, color, alpha: 0.9 });
        break;
      case 'hit':
        for (let i = 0; i < n + 2; i++) {
          const a = R.range(0, Math.PI * 2);
          G.spawn({ kind: 'spark', x, y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, life: 0.2, size: 14, color, drag: 6, stretch: true, fluid: 0 });
        }
        break;
      case 'kill':
        W.spawn({ kind: 'ring', x, y, life: 0.35, size: 14, size1: 70, color: 0xffffff, alpha: 0.9, fluid: 0 });
        for (let i = 0; i < n; i++) {
          const a = R.range(0, Math.PI * 2), s = R.range(80, 220);
          W.spawn({ kind: 'dot', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: R.range(0.4, 0.8), size: R.range(8, 16), size1: 2, color, drag: 3, fluid: 0.2 });
        }
        for (let i = 0; i < n; i++)
          W.spawn({ kind: 'bubble', x: x + R.range(-10, 10), y: y + R.range(-10, 10), vx: R.range(-80, 80), vy: R.range(-140, -20), life: R.range(0.8, 1.6), size: R.range(5, 12), gravity: -120, wobble: 14 });
        for (let i = 0; i < 6; i++) {
          const a = R.range(0, Math.PI * 2);
          G.spawn({ kind: 'spark', x, y, vx: Math.cos(a) * 320, vy: Math.sin(a) * 320, life: 0.25, size: 18, color: 0xffffff, drag: 5, stretch: true, fluid: 0 });
        }
        break;
      case 'sand':
        for (let i = 0; i < n; i++)
          W.spawn({ kind: 'sand', x: x + R.range(-12, 12), y, vx: R.range(-90, 90), vy: R.range(-120, -30), life: R.range(0.8, 1.6), size: R.range(3, 7), color: this.sandColor, gravity: 90, drag: 2.5, alpha: 0.85, fluid: 0.5 });
        W.spawn({ kind: 'ink', x, y: y - 6, life: 1.2, size: 30, size1: 70, color: this.sandColor, alpha: 0.35, fluid: 0.3 });
        break;
      case 'bubbles':
        for (let i = 0; i < n; i++)
          W.spawn({ kind: 'bubble', x: x + R.range(-20, 20), y: y + R.range(-10, 10), vx: R.range(-30, 30), vy: R.range(-120, -40), life: R.range(1.5, 3.5), size: R.range(5, 14), gravity: -60, wobble: 12, fluid: 0.6 });
        break;
      case 'ink':
        for (let i = 0; i < n; i++)
          W.spawn({ kind: 'ink', x: x + R.range(-10, 10), y: y + R.range(-10, 10), vx: R.range(-40, 40), vy: R.range(-40, 40), life: R.range(0.8, 1.5), size: R.range(20, 30), size1: R.range(50, 80), color, alpha: 0.6, fluid: 0.8 });
        break;
      case 'steam':
        for (let i = 0; i < n; i++)
          W.spawn({ kind: 'ink', x: x + R.range(-30, 30), y: y + R.range(-20, 20), vx: R.range(-60, 60), vy: R.range(-90, -20), life: R.range(0.8, 1.6), size: 30, size1: 90, color: 0xffffff, alpha: 0.55, gravity: -30, fluid: 0.6 });
        break;
      case 'shards':
        for (let i = 0; i < n; i++) {
          const a = R.range(0, Math.PI * 2), s = R.range(80, 240);
          W.spawn({ kind: 'shard', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: R.range(0.5, 1.1), size: R.range(4, 8), color, gravity: 300, drag: 1.5, spin: R.range(-8, 8), fluid: 0.2 });
        }
        break;
      case 'sparkle':
        for (let i = 0; i < n; i++)
          G.spawn({ kind: 'star', x: x + R.range(-16, 16), y: y + R.range(-16, 16), vx: R.range(-40, 40), vy: R.range(-80, -10), life: R.range(0.4, 0.9), size: R.range(8, 16), size1: 2, color, spin: R.range(-4, 4), fluid: 0.2 });
        break;
      case 'blood':
        for (let i = 0; i < n; i++) {
          const a = R.range(0, Math.PI * 2), s = R.range(80, 200);
          W.spawn({ kind: 'dot', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, size: R.range(6, 10), size1: 2, color, drag: 4 });
        }
        W.spawn({ kind: 'ring', x, y, life: 0.35, size: 20, size1: 90, color: 0xff5cae, alpha: 0.9, fluid: 0 });
        break;
      case 'explosion':
        W.spawn({ kind: 'ring', x, y, life: 0.4, size: 20, size1: 200, color: 0xffffff, alpha: 0.9, fluid: 0 });
        for (let i = 0; i < n; i++)
          W.spawn({ kind: 'ink', x: x + R.range(-20, 20), y: y + R.range(-20, 20), vx: R.range(-120, 120), vy: R.range(-120, 120), life: R.range(0.8, 1.6), size: 40, size1: 110, color, alpha: 0.7, fluid: 0.8 });
        for (let i = 0; i < n; i++)
          W.spawn({ kind: 'bubble', x, y, vx: R.range(-200, 200), vy: R.range(-240, 40), life: R.range(1, 2.2), size: R.range(6, 16), gravity: -140, wobble: 16 });
        G.spawn({ kind: 'dot', x, y, life: 0.25, size: 220, size1: 80, color: 0xffe0ff, alpha: 1 });
        for (let i = 0; i < 10; i++) {
          const a = R.range(0, Math.PI * 2);
          G.spawn({ kind: 'spark', x, y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, life: 0.3, size: 26, color: 0xfff27a, drag: 4, stretch: true, fluid: 0 });
        }
        this.onExplosion?.(x, y);
        break;
      case 'heal':
        for (let i = 0; i < n; i++)
          G.spawn({ kind: 'star', x: x + R.range(-14, 14), y: y + R.range(-8, 8), vy: R.range(-120, -60), life: 0.7, size: 12, size1: 3, color });
        break;
    }
  }

  text(x: number, y: number, str: string, color = 0xffffff, size = 22) {
    const t = new Text({
      text: str,
      style: {
        fontFamily: FONT_TITLE,
        fontSize: size,
        fill: color,
        stroke: { color: INK, width: Math.max(4, size * 0.22), join: 'round' },
        letterSpacing: 1,
        dropShadow: { color: INK, distance: 3, angle: Math.PI / 3, alpha: 1, blur: 0 },
      },
    });
    t.anchor.set(0.5);
    t.x = x;
    t.y = y;
    t.scale.set(0.2);
    const rot = R.range(-0.18, 0.18);
    t.rotation = rot;
    this.textLayer.addChild(t);
    this.texts.push({ t, age: 0, life: 0.9, vy: -40, rot });
    if (this.texts.length > 30) {
      const old = this.texts.shift()!;
      old.t.destroy();
    }
  }

  shake(a: number) {
    this.shakeAmt = Math.min(24, this.shakeAmt + a * this.shakeScale);
  }
  flash(color: number, amount: number) {
    this.flashColor = color;
    this.flashAmt = Math.max(this.flashAmt, amount * this.flashScale);
  }
  hitstop(frames: number) {
    this.hitstopFrames = Math.max(this.hitstopFrames, frames);
  }
  lightning(x1: number, y1: number, x2: number, y2: number, color = 0x6ff0ff) {
    const pts = [x1, y1];
    const n = 7;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      pts.push(x1 + (x2 - x1) * t + R.range(-12, 12), y1 + (y2 - y1) * t + R.range(-12, 12));
    }
    pts.push(x2, y2);
    this.bolts.push({ pts, age: 0, life: 0.18, color });
    this.light((x1 + x2) / 2, (y1 + y2) / 2, 140, color, 0.8, 0.15);
  }
  ring(x: number, y: number, r: number, color: number) {
    this.rings.push({ x, y, r, age: 0, life: 0.5, color });
  }
  light(x: number, y: number, r: number, color: number, intensity: number, life: number) {
    this.lights.push({ x, y, r, color, intensity, age: 0, life });
  }
  banner(title: string, sub: string, color?: number) {
    this.onBanner?.(title, sub, color);
  }
  toast(title: string, sub: string) {
    this.onToast?.(title, sub);
  }

  update(dt: number) {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const f = this.texts[i];
      f.age += dt;
      const k = f.age / f.life;
      const pop = f.age < 0.12 ? 0.2 + (f.age / 0.12) * 1.1 : f.age < 0.22 ? 1.3 - ((f.age - 0.12) / 0.1) * 0.3 : 1;
      f.t.scale.set(pop);
      f.t.y += f.vy * dt;
      f.vy *= Math.exp(-3 * dt);
      f.t.alpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      if (f.age >= f.life) {
        f.t.destroy();
        this.texts.splice(i, 1);
      }
    }
    this.bolts = this.bolts.filter((b) => (b.age += dt) < b.life);
    this.rings = this.rings.filter((r) => (r.age += dt) < r.life);
    this.lights = this.lights.filter((l) => (l.age += dt) < l.life);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 40);
    this.flashAmt = Math.max(0, this.flashAmt - dt * 2.5);
    this.flashSprite.tint = this.flashColor;
    this.flashSprite.alpha = this.flashAmt * 0.6;
  }

  drawGlow(g: Graphics) {
    for (const b of this.bolts) {
      const a = 1 - b.age / b.life;
      g.poly(b.pts, false).stroke({ width: 7, color: b.color, alpha: a });
      g.poly(b.pts, false).stroke({ width: 2.5, color: 0xffffff, alpha: a });
    }
    for (const r of this.rings) {
      const k = r.age / r.life;
      g.circle(r.x, r.y, r.r * k).stroke({ width: 10 * (1 - k), color: r.color, alpha: 1 - k });
    }
  }

  clear() {
    this.world.clear();
    this.glow.clear();
    for (const t of this.texts) t.t.destroy();
    this.texts = [];
    this.bolts = [];
    this.rings = [];
    this.lights = [];
  }
}
