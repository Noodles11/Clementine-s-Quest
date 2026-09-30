// Background fish schools (boids). Purely cosmetic, on parallax layers.

import { Container, Sprite, type Texture } from 'pixi.js';
import { cosmetic as R } from '../core/rng';
import { mixColor } from '../core/math';

interface Fish {
  s: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  school: number;
  speed: number;
  phase: number;
}

export class FishSchools {
  container = new Container();
  fish: Fish[] = [];
  private threats: { x: number; y: number; r: number; t: number }[] = [];

  constructor(
    private w: number,
    private h: number,
    count: number,
    public depthFactor: number,
    textures: Texture[],
    colors: number[],
    water: number,
  ) {
    const schools = Math.max(1, Math.round(count / 7));
    for (let sc = 0; sc < schools; sc++) {
      const cx = R.range(0.1, 0.9) * w, cy = R.range(0.15, 0.75) * h;
      const tex = R.pick(textures);
      const col = mixColor(R.pick(colors), water, 0.35 + (1 - depthFactor) * 0.45);
      const n = Math.round(count / schools);
      const dir = R.chance(0.5) ? 1 : -1;
      for (let i = 0; i < n; i++) {
        const s = new Sprite(tex);
        s.anchor.set(0.5);
        s.tint = col;
        const scale = (0.35 + R.next() * 0.2) * (0.5 + depthFactor * 0.8);
        s.scale.set(scale);
        s.alpha = 0.45 + depthFactor * 0.45;
        this.container.addChild(s);
        this.fish.push({
          s, x: cx + R.range(-60, 60), y: cy + R.range(-30, 30), vx: dir * R.range(20, 40), vy: 0,
          school: sc, speed: R.range(28, 45) * (0.6 + depthFactor * 0.6), phase: R.next() * 10,
        });
      }
    }
  }

  /** Shift the school against camera motion (parallax), wrapping around the view. */
  pan(dx: number, dy: number) {
    if (!dx && !dy) return;
    const W = this.w + 240, H = this.h + 200;
    for (const f of this.fish) {
      f.x -= dx;
      f.y -= dy;
      if (f.x < -120) f.x += W;
      else if (f.x > this.w + 120) f.x -= W;
      if (f.y < -100) f.y += H;
      else if (f.y > this.h + 100) f.y -= H;
    }
  }

  scare(x: number, y: number, r: number, t = 0.6) {
    this.threats.push({ x, y, r, t });
  }

  update(dt: number, px: number, py: number, time: number) {
    this.threats = this.threats.filter((th) => (th.t -= dt) > 0);
    const all = [...this.threats, { x: px, y: py, r: 120, t: 1 }];
    const F = this.fish;
    for (const f of F) {
      let ax = 0, ay = 0, cx = 0, cy = 0, avx = 0, avy = 0, n = 0;
      for (const o of F) {
        if (o === f || o.school !== f.school) continue;
        const dx = o.x - f.x, dy = o.y - f.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 90 * 90) continue;
        n++;
        cx += o.x; cy += o.y; avx += o.vx; avy += o.vy;
        if (d2 < 20 * 20 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          ax -= (dx / d) * 60;
          ay -= (dy / d) * 60;
        }
      }
      if (n) {
        ax += (cx / n - f.x) * 0.6 + (avx / n - f.vx) * 1.2;
        ay += (cy / n - f.y) * 0.6 + (avy / n - f.vy) * 1.2;
      }
      // Wander.
      ax += Math.sin(time * 0.4 + f.school * 3) * 14;
      ay += Math.cos(time * 0.3 + f.school * 5) * 8;
      // Flee.
      for (const th of all) {
        const dx = f.x - th.x, dy = f.y - th.y;
        const d = Math.hypot(dx, dy);
        if (d < th.r && d > 0.01) {
          const k = (1 - d / th.r) * 900;
          ax += (dx / d) * k;
          ay += (dy / d) * k;
        }
      }
      // Soft bounds.
      const m = 40;
      if (f.x < m) ax += (m - f.x) * 3;
      if (f.x > this.w - m) ax -= (f.x - (this.w - m)) * 3;
      if (f.y < m) ay += (m - f.y) * 3;
      if (f.y > this.h * 0.85) ay -= (f.y - this.h * 0.85) * 3;

      f.vx += ax * dt;
      f.vy += ay * dt;
      const sp = Math.hypot(f.vx, f.vy);
      const max = f.speed * (this.threats.length ? 3 : 1.4);
      if (sp > max) {
        f.vx = (f.vx / sp) * max;
        f.vy = (f.vy / sp) * max;
      } else if (sp < f.speed * 0.5 && sp > 0.01) {
        f.vx = (f.vx / sp) * f.speed * 0.5;
        f.vy = (f.vy / sp) * f.speed * 0.5;
      }
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.phase += dt * (4 + sp * 0.05);
      const s = f.s;
      s.x = f.x;
      s.y = f.y;
      const flip = f.vx < 0 ? -1 : 1;
      s.scale.x = Math.abs(s.scale.y) * flip * (0.92 + Math.sin(f.phase) * 0.08);
      s.rotation = Math.atan2(f.vy, Math.abs(f.vx)) * 0.5 * flip;
    }
  }
}
