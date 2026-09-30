// Pooled sprite particles: bubbles, marine snow, sand puffs, sparks, rings.

import { Container, Sprite, type Texture } from 'pixi.js';
import type { FluidField } from './fluid';
import { cosmetic as R } from '../core/rng';

export type PKind = 'bubble' | 'snow' | 'sand' | 'spark' | 'ring' | 'dot' | 'star' | 'ink' | 'shard';

export interface Particle {
  sprite: Sprite;
  kind: PKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size0: number;
  size1: number;
  alpha0: number;
  drag: number;
  /** Positive sinks, negative rises. */
  gravity: number;
  fluid: number;
  wobble: number;
  phase: number;
  spin: number;
  wrap: boolean;
  stretch: boolean;
  stuck: number;
}

export interface SpawnOpts {
  kind: PKind;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  life?: number;
  size?: number;
  size1?: number;
  alpha?: number;
  color?: number;
  drag?: number;
  gravity?: number;
  fluid?: number;
  wobble?: number;
  spin?: number;
  wrap?: boolean;
  texture?: Texture;
  stretch?: boolean;
  rotation?: number;
}

export class ParticleSystem {
  container = new Container();
  private pool: Sprite[] = [];
  list: Particle[] = [];
  max: number;
  /** Wrap region for wrapping particles (e.g. the camera view). */
  bounds = { x: 0, y: 0, w: 960, h: 528 };
  private tmp = { x: 0, y: 0 };

  constructor(private textures: Record<string, Texture>, max = 900, additive = false) {
    this.max = max;
    if (additive) this.container.blendMode = 'add';
  }

  spawn(o: SpawnOpts): Particle | null {
    if (this.list.length >= this.max) return null;
    const sprite = this.pool.pop() ?? new Sprite();
    sprite.texture = o.texture ?? this.textures[o.kind] ?? this.textures.dot;
    sprite.anchor.set(0.5);
    sprite.tint = o.color ?? 0xffffff;
    sprite.rotation = o.rotation ?? 0;
    sprite.visible = true;
    this.container.addChild(sprite);
    const life = o.life ?? 1;
    const p: Particle = {
      sprite, kind: o.kind, x: o.x, y: o.y, vx: o.vx ?? 0, vy: o.vy ?? 0,
      life, maxLife: life, size0: o.size ?? 1, size1: o.size1 ?? o.size ?? 1,
      alpha0: o.alpha ?? 1, drag: o.drag ?? 1.5, gravity: o.gravity ?? 0, fluid: o.fluid ?? 0.6,
      wobble: o.wobble ?? 0, phase: R.next() * 10, spin: o.spin ?? 0, wrap: o.wrap ?? false,
      stretch: o.stretch ?? false, stuck: 0,
    };
    this.list.push(p);
    this.apply(p);
    return p;
  }

  private apply(p: Particle) {
    const t = 1 - p.life / p.maxLife;
    const s = p.size0 + (p.size1 - p.size0) * t;
    const sp = p.sprite;
    sp.x = p.x;
    sp.y = p.y;
    const texW = sp.texture.width || 16;
    const base = s / texW;
    if (p.stretch) {
      const v = Math.hypot(p.vx, p.vy);
      sp.rotation = Math.atan2(p.vy, p.vx);
      sp.scale.set(base * Math.max(1, v / 60), base);
    } else sp.scale.set(base);
    let a = p.alpha0;
    if (!p.wrap) {
      const fadeIn = Math.min(1, (p.maxLife - p.life) / 0.08);
      const fadeOut = Math.min(1, p.life / (p.maxLife * 0.35));
      a *= Math.min(fadeIn, fadeOut);
    }
    sp.alpha = a;
  }

  update(dt: number, fluid: FluidField | null, isSolid: (x: number, y: number) => boolean, onPop?: (p: Particle) => void) {
    const tmp = this.tmp;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (!p.wrap) p.life -= dt;
      if (p.life <= 0) {
        this.kill(i);
        continue;
      }
      if (fluid && p.fluid > 0) {
        fluid.sample(p.x, p.y, tmp);
        p.vx += (tmp.x - p.vx) * Math.min(1, p.fluid * dt * 4);
        p.vy += (tmp.y - p.vy) * Math.min(1, p.fluid * dt * 4);
      }
      p.vy += p.gravity * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.phase += dt;
      const wob = p.wobble ? Math.sin(p.phase * 5) * p.wobble : 0;
      let nx = p.x + (p.vx + wob) * dt;
      let ny = p.y + p.vy * dt;
      if (p.kind === 'bubble') {
        if (isSolid(nx, ny - p.size0 * 0.4)) {
          // Collect under overhangs, then pop.
          p.stuck += dt;
          ny = p.y;
          p.vy = 0;
          if (p.stuck > 0.6 + (p.phase % 1.7)) {
            onPop?.(p);
            this.kill(i);
            continue;
          }
        }
      } else if ((p.kind === 'sand' || p.kind === 'shard') && isSolid(nx, ny)) {
        p.vx *= 0.3;
        p.vy = 0;
        ny = p.y;
        nx = p.x;
      }
      p.x = nx;
      p.y = ny;
      if (p.spin) p.sprite.rotation += p.spin * dt;
      if (p.wrap) {
        const { x: bx, y: by, w, h } = this.bounds;
        if (p.x < bx - 10) p.x += w + 20;
        if (p.x > bx + w + 10) p.x -= w + 20;
        if (p.y < by - 10) p.y += h + 20;
        if (p.y > by + h + 10) p.y -= h + 20;
      }
      this.apply(p);
    }
  }

  kill(i: number) {
    const p = this.list[i];
    p.sprite.visible = false;
    this.container.removeChild(p.sprite);
    this.pool.push(p.sprite);
    this.list[i] = this.list[this.list.length - 1];
    this.list.pop();
  }

  clear() {
    for (let i = this.list.length - 1; i >= 0; i--) this.kill(i);
  }
}
