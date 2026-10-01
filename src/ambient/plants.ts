// Simulated decorations: kelp & chains (verlet), sea grass & anemones (springs),
// and static coral/shells that wobble on nearby impacts.

import { Container, Graphics } from 'pixi.js';
import { EA, EW, shade } from '../render/style';
import type { Decor } from '../gen/tiles';
import type { FluidField } from './fluid';
import { Rng } from '../core/rng';
import { darken, lighten, mixColor } from '../core/math';

export const INK = 0x1b1030;

interface Pt {
  x: number;
  y: number;
  px: number;
  py: number;
}

interface Chain {
  d: Decor;
  pts: Pt[];
  seg: number;
  buoy: number;
  kind: 'kelp' | 'chain';
  leafSide: number[];
}

interface Clump {
  d: Decor;
  blades: { h: number; lean: number; tx: number; vx: number; w: number }[];
  kind: 'grass' | 'anemone';
}

interface Wobbly {
  d: Decor;
  g: Graphics;
  a: number;
  va: number;
  s: number;
  vs: number;
}

export interface ViewRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const inView = (d: Decor, v: ViewRect, m: number) => d.x > v.x0 - m && d.x < v.x1 + m && d.y > v.y0 - m && d.y < v.y1 + m;

export class PlantSystem {
  /** Growth behind Clementine and the creatures. */
  container = new Container();
  /** Growth in front of them: it covers whatever swims behind it. */
  front = new Container();
  private dyn = new Graphics();
  private dynFront = new Graphics();
  private staticLayer = new Container();
  private staticFront = new Container();
  private view: ViewRect = { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 };
  chains: Chain[] = [];
  clumps: Clump[] = [];
  wobblies: Wobbly[] = [];
  private tmp = { x: 0, y: 0 };
  menace = 0;

  constructor(decor: Decor[], menace: number) {
    this.menace = menace;
    this.container.addChild(this.staticLayer, this.dyn);
    this.front.addChild(this.staticFront, this.dynFront);
    for (const d of decor) {
      const rng = new Rng(d.seed);
      if (d.kind === 'kelp' || (d.kind === 'chain' && d.attach === 'ceil')) {
        const n = Math.max(3, Math.round(d.size * 5));
        const seg = d.kind === 'chain' ? 10 : 12;
        const dir = d.attach === 'ceil' ? 1 : -1;
        const pts: Pt[] = [];
        for (let i = 0; i < n; i++) {
          const x = d.x + rng.range(-2, 2), y = d.y + dir * i * seg;
          pts.push({ x, y, px: x, py: y });
        }
        this.chains.push({
          d, pts, seg, kind: d.kind === 'chain' ? 'chain' : 'kelp',
          buoy: d.kind === 'chain' ? 260 : d.attach === 'ceil' ? 60 : -150,
          leafSide: pts.map(() => (rng.chance(0.5) ? 1 : -1)),
        });
      } else if (d.kind === 'grass' || d.kind === 'anemone') {
        const n = d.kind === 'grass' ? rng.int(3, 5) : rng.int(6, 8);
        const blades = [];
        for (let i = 0; i < n; i++)
          blades.push({
            h: (d.kind === 'grass' ? rng.range(18, 40) : rng.range(12, 20)) * d.size,
            lean: d.kind === 'grass' ? rng.range(-8, 8) : ((i / (n - 1)) - 0.5) * 30,
            tx: 0, vx: 0, w: rng.range(3, 5),
          });
        this.clumps.push({ d, blades, kind: d.kind });
      } else {
        const g = new Graphics();
        drawStatic(g, d, rng, menace);
        g.x = d.x;
        g.y = d.y;
        (d.front ? this.staticFront : this.staticLayer).addChild(g);
        this.wobblies.push({ d, g, a: 0, va: 0, s: 1, vs: 0 });
      }
    }
  }

  /** Uproot everything anchored inside a crater. */
  removeNear(x: number, y: number, r: number) {
    const inside = (d: Decor) => (d.x - x) ** 2 + (d.y - y) ** 2 < (r + 8) ** 2;
    this.chains = this.chains.filter((c) => !inside(c.d));
    this.clumps = this.clumps.filter((c) => !inside(c.d));
    this.wobblies = this.wobblies.filter((wb) => {
      if (!inside(wb.d)) return true;
      wb.g.destroy();
      return false;
    });
  }

  /** Nudge static decor near an impact. */
  impulse(x: number, y: number, strength: number, radius: number) {
    for (const w of this.wobblies) {
      const dx = w.d.x - x, dy = w.d.y - y;
      const dd = Math.hypot(dx, dy);
      if (dd > radius) continue;
      const k = (1 - dd / radius) * strength;
      w.va += Math.sign(dx || 1) * k * 6;
      w.vs -= k * 2;
    }
  }

  update(dt: number, fluid: FluidField, pushers: { x: number; y: number; r: number }[], time: number, view?: ViewRect) {
    const tmp = this.tmp;
    const dt2 = dt * dt;
    if (view) this.view = view;
    const v = this.view;
    for (const c of this.chains) {
      if (!inView(c.d, v, 280)) continue;
      const pts = c.pts;
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        fluid.sample(p.x, p.y, tmp);
        const vx = (p.x - p.px) * 0.96, vy = (p.y - p.py) * 0.96;
        p.px = p.x;
        p.py = p.y;
        const sway = Math.sin(time * 0.9 + c.d.x * 0.03 + i * 0.4) * (c.kind === 'kelp' ? 22 : 4);
        p.x += vx + (tmp.x * 2.2 + sway) * dt2 * 8;
        p.y += vy + (c.buoy + tmp.y * 2.2) * dt2 * 8 * 0.5;
        for (const pu of pushers) {
          const dx = p.x - pu.x, dy = p.y - pu.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < pu.r * pu.r && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const push = (pu.r - d) * 0.12;
            p.x += (dx / d) * push;
            p.y += (dy / d) * push;
          }
        }
      }
      for (let it = 0; it < 3; it++) {
        pts[0].x = c.d.x;
        pts[0].y = c.d.y;
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.001;
          const diff = (d - c.seg) / d;
          if (i === 1) {
            b.x -= dx * diff;
            b.y -= dy * diff;
          } else {
            a.x += dx * diff * 0.5;
            a.y += dy * diff * 0.5;
            b.x -= dx * diff * 0.5;
            b.y -= dy * diff * 0.5;
          }
        }
      }
    }
    for (const c of this.clumps) {
      if (!inView(c.d, v, 80)) continue;
      fluid.sample(c.d.x, c.d.y - 20, tmp);
      let push = 0;
      for (const pu of pushers) {
        const dx = c.d.x - pu.x, dy = c.d.y - 20 - pu.y;
        const d = Math.hypot(dx, dy);
        if (d < pu.r + 20) push += Math.sign(-dx || 1) * -1 * (pu.r + 20 - d) * 0.8;
      }
      for (const b of c.blades) {
        const target = tmp.x * 0.18 + push + Math.sin(time * 1.3 + c.d.x * 0.05 + b.lean) * 4;
        b.vx += (target - b.tx) * 40 * dt;
        b.vx *= Math.exp(-4 * dt);
        b.tx += b.vx * dt;
      }
    }
    for (const w of this.wobblies) {
      w.g.visible = inView(w.d, v, 120);
      // Plastic plants never sway: deliberately uncanny next to living water.
      if (!w.g.visible || w.d.kind === 'plastic') continue;
      fluid.sample(w.d.x, w.d.y - 16, tmp);
      w.va += (-w.a * 60 + tmp.x * 0.004) * dt;
      w.va *= Math.exp(-5 * dt);
      w.a += w.va * dt;
      w.vs += (-(w.s - 1) * 120) * dt;
      w.vs *= Math.exp(-6 * dt);
      w.s += w.vs * dt;
      w.g.rotation = w.a * 0.25;
      w.g.scale.set(1 + (1 - w.s) * 0.4, w.s);
    }
    this.draw(time);
  }

  private draw(time: number) {
    this.dyn.clear();
    this.dynFront.clear();
    const v = this.view;
    for (const c of this.chains) {
      if (!inView(c.d, v, 280)) continue;
      const g = c.d.front ? this.dynFront : this.dyn;
      if (c.kind === 'chain') {
        for (let i = 1; i < c.pts.length; i++) {
          const a = c.pts[i - 1], b = c.pts[i];
          const ang = Math.atan2(b.y - a.y, b.x - a.x);
          g.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, 7, 4)
            .stroke({ width: (3) * EW, color: INK, alpha: EA });
          g.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, 7, 4).stroke({ width: 1.5, color: c.d.color });
          void ang;
        }
        continue;
      }
      const pts = c.pts;
      const left: number[] = [], right: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
        let nx = -(q.y - o.y), ny = q.x - o.x;
        const l = Math.hypot(nx, ny) || 1;
        nx /= l; ny /= l;
        const w = 6.5 * (1 - i / pts.length) + 2;
        left.push(p.x + nx * w, p.y + ny * w);
        right.push(p.x - nx * w, p.y - ny * w);
      }
      const poly = [...left];
      for (let i = right.length - 2; i >= 0; i -= 2) poly.push(right[i], right[i + 1]);
      const col = c.d.color;
      // Leaves.
      for (let i = 2; i < pts.length - 1; i += 2) {
        const p = pts[i], q = pts[i + 1];
        const ang = Math.atan2(q.y - p.y, q.x - p.x) + c.leafSide[i] * 0.9;
        const L = 16 + (i % 3) * 3;
        const tx = p.x + Math.cos(ang) * L, ty = p.y + Math.sin(ang) * L;
        const mx = (p.x + tx) / 2 + Math.cos(ang + 1.57) * 5, my = (p.y + ty) / 2 + Math.sin(ang + 1.57) * 5;
        g.moveTo(p.x, p.y).quadraticCurveTo(mx, my, tx, ty).quadraticCurveTo(mx - Math.cos(ang + 1.57) * 9, my - Math.sin(ang + 1.57) * 9, p.x, p.y)
          .fill(shade(lighten(col, 0.1), 0.8)).stroke({ width: (2) * EW, color: INK, alpha: EA });
      }
      g.poly(poly).fill(shade(col, 0.8)).stroke({ width: (2.5) * EW, color: INK, alpha: EA, join: 'round' });
      // Highlight line.
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x - 1.5, pts[i].y);
      g.stroke({ width: 1.5, color: lighten(col, 0.35), alpha: 0.7 });
    }
    for (const c of this.clumps) {
      if (!inView(c.d, v, 80)) continue;
      const g = c.d.front ? this.dynFront : this.dyn;
      const col = c.d.color;
      if (c.kind === 'anemone') {
        const bx = c.d.x, by = c.d.y;
        for (const b of c.blades) {
          const tipx = bx + b.lean + b.tx + Math.sin(time * 2 + b.lean) * 3;
          const tipy = by - 10 - b.h;
          g.moveTo(bx + b.lean * 0.3, by - 8).quadraticCurveTo(bx + b.lean * 0.8, by - 8 - b.h * 0.6, tipx, tipy)
            .stroke({ width: (b.w + 3) * EW, color: INK, alpha: EA, cap: 'round' });
          g.moveTo(bx + b.lean * 0.3, by - 8).quadraticCurveTo(bx + b.lean * 0.8, by - 8 - b.h * 0.6, tipx, tipy)
            .stroke({ width: b.w, color: lighten(col, 0.2), cap: 'round' });
          g.circle(tipx, tipy, 2.5).fill(shade(lighten(col, 0.6), 0.8));
        }
        g.ellipse(bx, by - 5, 13 * c.d.size, 9 * c.d.size).fill(shade(darken(col, 0.15), 0.8)).stroke({ width: (2.5) * EW, color: INK, alpha: EA });
        continue;
      }
      for (const b of c.blades) {
        const bx = c.d.x + b.lean * 0.4;
        const tipx = bx + b.lean + b.tx, tipy = c.d.y - b.h;
        const cx = bx + (b.lean + b.tx) * 0.3, cy = c.d.y - b.h * 0.6;
        g.moveTo(bx - b.w / 2, c.d.y).quadraticCurveTo(cx, cy, tipx, tipy).quadraticCurveTo(cx + b.w * 0.6, cy, bx + b.w / 2, c.d.y)
          .fill(shade(mixColor(col, 0xffffff, 0.08), 0.8)).stroke({ width: (2) * EW, color: INK, alpha: EA, join: 'round' });
      }
    }
  }
}

function drawStatic(g: Graphics, d: Decor, rng: Rng, menace: number) {
  const s = d.size;
  const col = d.color;
  switch (d.kind) {
    case 'coral': {
      // Branching coral from the base (local origin at base).
      const branch = (x: number, y: number, ang: number, len: number, w: number, depth: number) => {
        const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
        g.moveTo(x, y).lineTo(x2, y2).stroke({ width: (w + 4) * EW, color: INK, alpha: EA, cap: 'round' });
        g.moveTo(x, y).lineTo(x2, y2).stroke({ width: w, color: col, cap: 'round' });
        if (depth > 0) {
          branch(x2, y2, ang - rng.range(0.3, 0.6), len * 0.72, w * 0.75, depth - 1);
          branch(x2, y2, ang + rng.range(0.3, 0.6), len * 0.72, w * 0.75, depth - 1);
        } else g.circle(x2, y2, w * 0.45).fill(shade(lighten(col, 0.45), 0.8));
      };
      branch(0, 0, -Math.PI / 2 + rng.range(-0.2, 0.2), 22 * s, 9 * s, 2);
      break;
    }
    case 'fan': {
      const pts: number[] = [0, 0];
      const n = 9;
      for (let i = 0; i <= n; i++) {
        const a = -Math.PI + (i / n) * Math.PI;
        const r = (30 + rng.range(-4, 4)) * s;
        pts.push(Math.cos(a) * r, Math.sin(a) * r - 6 * s);
      }
      g.poly(pts).fill(shade(col, 0.8)).stroke({ width: (3) * EW, color: INK, alpha: EA, join: 'round' });
      for (let i = 1; i <= n; i += 2) g.moveTo(0, 0).lineTo(pts[i * 2], pts[i * 2 + 1]).stroke({ width: 1.5, color: darken(col, 0.3) });
      g.rect(-3, -4, 6, 6).fill(shade(darken(col, 0.4), 0.8));
      break;
    }
    case 'shell': {
      g.moveTo(-12 * s, 0).quadraticCurveTo(-14 * s, -18 * s, 0, -20 * s).quadraticCurveTo(14 * s, -18 * s, 12 * s, 0).closePath()
        .fill(shade(lighten(col, 0.3), 0.8)).stroke({ width: (3) * EW, color: INK, alpha: EA });
      for (let i = -2; i <= 2; i++) g.moveTo(0, -2).lineTo(i * 5 * s, -17 * s).stroke({ width: 1.5, color: darken(col, 0.2) });
      break;
    }
    case 'starfish': {
      const pts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = (i % 2 ? 5 : 13) * s;
        pts.push(Math.cos(a) * r, Math.sin(a) * r * 0.6 - 5 * s);
      }
      g.poly(pts).fill(shade(col, 0.8)).stroke({ width: (2.5) * EW, color: INK, alpha: EA, join: 'round' });
      g.circle(0, -5 * s, 2).fill(shade(lighten(col, 0.5), 0.8));
      break;
    }
    case 'rockling': {
      g.ellipse(0, -7 * s, 16 * s, 10 * s).fill(shade(col, 0.8)).stroke({ width: (3) * EW, color: INK, alpha: EA });
      g.ellipse(-4 * s, -11 * s, 5 * s, 2.5 * s).fill(shade(lighten(col, 0.3), 0.8));
      break;
    }
    case 'boulder': {
      // A rounded, algae-dusted stone half sunk in the sediment.
      const rw = 26 * s, rh = 19 * s;
      const pts: number[] = [];
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI + (i / 12) * Math.PI;
        const r = 1 + rng.range(-0.12, 0.1);
        pts.push(Math.cos(a) * rw * r, Math.sin(a) * rh * r * 1.3 + 3);
      }
      g.poly(pts).fill(shade(col, 1)).stroke({ width: 3 * EW, color: INK, alpha: EA, join: 'round' });
      g.ellipse(-rw * 0.3, -rh * 0.75, rw * 0.35, rh * 0.18).fill({ color: 0xffffff, alpha: 0.1 });
      for (let i = 0; i < 4; i++) g.circle(rng.range(-rw * 0.7, rw * 0.7), -rng.range(2, rh), rng.range(1, 3) * s).fill({ color: mixColor(col, 0x6aa05a, 0.5), alpha: 0.7 });
      break;
    }
    case 'sponge': {
      // Tube sponges growing sideways out of a wall.
      const dir = d.attach === 'left' ? 1 : -1;
      const n = rng.int(2, 4);
      for (let i = 0; i < n; i++) {
        const oy = (i - (n - 1) / 2) * 11 * s;
        const len = rng.range(16, 30) * s, w = rng.range(7, 10) * s;
        const ang = rng.range(-0.6, -0.1);
        const ex = Math.cos(ang) * len * dir, ey = oy + Math.sin(ang) * len;
        g.moveTo(0, oy).lineTo(ex, ey).stroke({ width: w + 3 * EW, color: INK, alpha: EA, cap: 'round' });
        g.moveTo(0, oy).lineTo(ex, ey).stroke({ width: w, color: col, cap: 'round' });
        g.circle(ex, ey, w * 0.32).fill(darken(col, 0.5));
      }
      break;
    }
    case 'plastic': {
      // A cheap aquarium plant: glossy, flat, perfectly symmetrical.
      for (let i = -2; i <= 2; i++) {
        const h = (34 - Math.abs(i) * 6) * s, ang = i * 0.28;
        const tx = Math.sin(ang) * h, ty = -Math.cos(ang) * h;
        g.moveTo(0, 0).quadraticCurveTo(tx * 0.3 - 6 * s, ty * 0.5, tx, ty).quadraticCurveTo(tx * 0.3 + 6 * s, ty * 0.5, 0, 0).fill(col).stroke({ width: 1.2, color: darken(col, 0.4) });
        g.moveTo(0, 0).lineTo(tx * 0.9, ty * 0.9).stroke({ width: 1, color: lighten(col, 0.4), alpha: 0.8 });
      }
      g.roundRect(-7 * s, -3 * s, 14 * s, 6 * s, 2).fill(0x2a2a2a);
      break;
    }
    case 'barrel': {
      g.roundRect(-14, -34, 28, 34, 6).fill(0x8a5a32).stroke({ width: (3) * EW, color: INK, alpha: EA });
      g.rect(-14, -26, 28, 4).fill(0x4a4a52);
      g.rect(-14, -10, 28, 4).fill(0x4a4a52);
      break;
    }
    case 'chain': {
      for (let i = 0; i < 3; i++) g.ellipse(i * 10 - 10, -4, 6, 4).stroke({ width: (3) * EW, color: INK, alpha: EA });
      break;
    }
    case 'pot': {
      g.moveTo(-10, 0).quadraticCurveTo(-18, -16, -7, -26).lineTo(7, -26).quadraticCurveTo(18, -16, 10, 0).closePath()
        .fill(0xc8743a).stroke({ width: (3) * EW, color: INK, alpha: EA });
      break;
    }
    default:
      break;
  }
  void menace;
}
