// Clementine, seen from the side: a pulsing, deformable bell with physically
// simulated trailing tentacles (verlet chains sampled by the water field).

import { Container, Graphics } from 'pixi.js';
import { clamp, lighten, mixColor } from '../core/math';
import type { FluidField } from '../ambient/fluid';
import type { Player } from '../game/player';
import { INK } from '../ambient/plants';
import { gelFill, glowFill, shade } from './style';

interface Pt {
  x: number;
  y: number;
  px: number;
  py: number;
}

interface Tentacle {
  pts: Pt[];
  seg: number;
  /** Anchor along the rim, -1..1. */
  u: number;
  kind: 'oral' | 'marginal';
  width: number;
  phase: number;
}

const BODY = 0xff9a2e;
const BODY_LIGHT = 0xffc27a;
const TENT = 0xffb877;

export class JellyView {
  container = new Container();
  private tg = new Graphics();
  private bg = new Graphics();
  tentacles: Tentacle[] = [];
  tilt = 0;
  blink = 0;
  nextBlink = 2;
  private tmp = { x: 0, y: 0 };
  lookX = 0;
  lookY = 0;
  squash = 0;
  size = 1;

  constructor(x: number, y: number, size = 1) {
    this.size = size;
    this.container.addChild(this.tg, this.bg);
    const make = (u: number, kind: 'oral' | 'marginal', n: number, seg: number, width: number) => {
      const pts: Pt[] = [];
      for (let i = 0; i < n; i++) pts.push({ x: x + u * 12, y: y + 6 + i * seg, px: x + u * 12, py: y + 6 + i * seg });
      this.tentacles.push({ pts, seg: seg * size, u, kind, width, phase: Math.random() * 10 });
    };
    for (const u of [-0.95, -0.7, -0.45, -0.2, 0.2, 0.45, 0.7, 0.95]) make(u, 'marginal', 11, 5.2, 1.6);
    for (const u of [-0.35, -0.12, 0.12, 0.35]) make(u, 'oral', 9, 6, 5);
  }

  /** Rim point in world space for rim coordinate u (-1..1). */
  private rim(p: Player, u: number, sx: number, sy: number) {
    const R = 22 * this.size;
    const lx = u * R * 0.82 * sx;
    const ly = R * 0.28 * sy;
    const c = Math.cos(this.tilt), s = Math.sin(this.tilt);
    return { x: p.x + lx * c - ly * s, y: p.y + lx * s + ly * c };
  }

  private deform(p: Player, t: number) {
    const k = p.pulseKick;
    const c = k > 0.5 ? (1 - k) * 2 : k * 2; // 0→1→0 over the kick
    const breathe = Math.sin(t * 2.2) * 0.03;
    return { sx: 1 - 0.2 * c + breathe, sy: 1 + 0.14 * c - breathe, c };
  }

  update(dt: number, p: Player, fluid: FluidField, t: number) {
    const max = p.stats?.movePx ?? 230;
    // Tilt toward swim direction (max ~60°).
    let target = clamp(p.vx / max, -1, 1) * 0.75;
    if (p.vy > 40) target += Math.sign(p.vx || 0.0001) * clamp(p.vy / max, 0, 1) * 0.3;
    target = clamp(target, -1.05, 1.05);
    this.tilt += (target - this.tilt) * Math.min(1, dt * 6);

    const { sx, sy } = this.deform(p, t);
    const down = { x: -Math.sin(this.tilt), y: Math.cos(this.tilt) };
    const dt2 = dt * dt;
    const idleFloat = p.sinkBlend;
    for (const tc of this.tentacles) {
      const a = this.rim(p, tc.u, sx, sy);
      const pts = tc.pts;
      pts[0].x = a.x;
      pts[0].y = a.y;
      pts[0].px = a.x;
      pts[0].py = a.y;
      for (let i = 1; i < pts.length; i++) {
        const q = pts[i];
        fluid.sample(q.x, q.y, this.tmp);
        const vx = (q.x - q.px) * 0.92, vy = (q.y - q.py) * 0.92;
        q.px = q.x;
        q.py = q.y;
        const f = i / pts.length;
        // Hang along the bell's down axis; float up a little while resting.
        const hang = tc.kind === 'oral' ? 220 : 160;
        const lift = idleFloat * 140 * f;
        const wave = Math.sin(t * 3 + tc.phase + i * 0.6) * 30 * f;
        const fx = down.x * hang + this.tmp.x * 3.2 + wave * down.y;
        const fy = down.y * hang - lift + this.tmp.y * 3.2 - wave * down.x;
        q.x += vx + fx * dt2;
        q.y += vy + fy * dt2;
      }
      // Follow-the-leader constraint: tentacles never stretch, even when
      // the bell moves a long way in one frame.
      for (let i = 1; i < pts.length; i++) {
        const a0 = pts[i - 1], b0 = pts[i];
        const dx = b0.x - a0.x, dy = b0.y - a0.y;
        const d = Math.hypot(dx, dy) || 0.001;
        if (d > tc.seg) {
          const k = tc.seg / d;
          const nx = a0.x + dx * k, ny = a0.y + dy * k;
          // Carry velocity along so the correction doesn't add energy.
          b0.px += nx - b0.x;
          b0.py += ny - b0.y;
          b0.x = nx;
          b0.y = ny;
        }
      }
    }
    // Eyes.
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 0.14;
      this.nextBlink = 2 + Math.random() * 3;
    }
    this.blink = Math.max(0, this.blink - dt);
    const lx = p.shootFlash > 0 || p.charge > 0 ? p.lastShootDir[0] : clamp(p.vx / max, -1, 1);
    const ly = p.shootFlash > 0 || p.charge > 0 ? p.lastShootDir[1] : clamp(p.vy / max, -1, 1);
    this.lookX += (lx - this.lookX) * Math.min(1, dt * 10);
    this.lookY += (ly - this.lookY) * Math.min(1, dt * 10);
  }

  /** Bioluminescent pulses: times since each pulse started. */
  private waves: number[] = [];
  private lastKick = 0;

  draw(p: Player, t: number, costumes: Set<string>) {
    const tg = this.tg, g = this.bg;
    tg.clear();
    g.clear();
    const blinkOut = p.invuln > 0 && Math.floor(t * 20) % 2 === 0;
    this.container.alpha = blinkOut ? 0.5 : 1;
    const { sx, sy } = this.deform(p, t);
    // A new light pulse ripples down the body with every propulsion stroke.
    if (p.pulseKick > 0.95 && t - this.lastKick > 0.25) {
      this.waves.push(t);
      this.lastKick = t;
    }
    this.waves = this.waves.filter((w0) => t - w0 < 1.2);

    // Tentacles: translucent, drawn behind the bell.
    for (const tc of this.tentacles) {
      const pts = tc.pts;
      if (tc.kind === 'marginal') {
        tg.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) tg.lineTo(pts[i].x, pts[i].y);
        tg.stroke({ width: tc.width * 0.9, color: 0xffd9b0, alpha: 0.45, cap: 'round', join: 'round' });
      } else {
        const left: number[] = [], right: number[] = [];
        for (let i = 0; i < pts.length; i++) {
          const q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
          let nx = -(q.y - o.y), ny = q.x - o.x;
          const l = Math.hypot(nx, ny) || 1;
          nx /= l;
          ny /= l;
          const frill = 1 + Math.sin(i * 2.2 + t * 6 + tc.phase) * 0.4;
          const w = tc.width * (1 - (i / pts.length) * 0.75) * frill * this.size;
          left.push(pts[i].x + nx * w, pts[i].y + ny * w);
          right.push(pts[i].x - nx * w, pts[i].y - ny * w);
        }
        const poly = [...left];
        for (let i = right.length - 2; i >= 0; i -= 2) poly.push(right[i], right[i + 1]);
        tg.poly(poly).fill({ color: 0xffa870, alpha: 0.32 }).stroke({ width: 1, color: 0xffe2c0, alpha: 0.5, join: 'round' });
      }
    }

    // Bell: gelatinous, translucent, with a luminous rim.
    const R = 22 * this.size;
    const c = Math.cos(this.tilt), s = Math.sin(this.tilt);
    const tr = (lx: number, ly: number): [number, number] => [p.x + lx * c - ly * s, p.y + lx * s + ly * c];
    const dome: number[] = [];
    const N = 26;
    for (let i = 0; i <= N; i++) {
      const a = Math.PI + (i / N) * Math.PI;
      const [x, y] = tr(Math.cos(a) * R * sx, Math.sin(a) * R * 0.95 * sy + R * 0.2);
      dome.push(x, y);
    }
    const S = 16;
    for (let i = 0; i <= S; i++) {
      const u = 1 - (i / S) * 2;
      const [x, y] = tr(u * R * sx, R * 0.2 + R * 0.1 * sy + (i % 2 ? 2.5 : 0) * this.size);
      dome.push(x, y);
    }
    const hurt = p.hurtFlash;
    const rim = hurt > 0 ? mixColor(0xffc080, 0xff3d6a, hurt) : 0xffc27a;
    g.poly(dome).fill(gelFill(hurt > 0 ? mixColor(0xff8a3a, 0xff4d7a, hurt * 0.6) : 0xff8a3a, rim));
    // Radial canals.
    const [cx0, cy0] = tr(0, -R * 0.2);
    for (let k = 0; k < 8; k++) {
      const a = Math.PI + ((k + 0.5) / 8) * Math.PI;
      const [x, y] = tr(Math.cos(a) * R * 0.92 * sx, Math.sin(a) * R * 0.85 * sy + R * 0.2);
      g.moveTo(cx0, cy0).lineTo(x, y).stroke({ width: 0.8, color: 0xfff0dc, alpha: 0.35 });
    }
    // Glowing gonads (the "heart" of the light).
    const beat = 0.75 + Math.sin(t * 3.1) * 0.15 + p.shootFlash * 0.3;
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4 + Math.sin(t * 0.7) * 0.2;
      const [x, y] = tr(Math.cos(a) * 6 * sx, -R * 0.3 + Math.sin(a) * 4 * sy);
      g.circle(x, y, 4.2 * this.size).fill({ color: 0xffb040, alpha: 0.55 * beat });
      g.circle(x, y, 2 * this.size).fill({ color: 0xfff0c0, alpha: 0.8 * beat });
    }
    // Specular sheen on the dome.
    const [hx, hy] = tr(-R * 0.4 * sx, -R * 0.55 * sy);
    g.ellipse(hx, hy, 7 * this.size, 3 * this.size).fill({ color: 0xffffff, alpha: 0.35 });
    g.poly(dome).stroke({ width: 1.4, color: rim, alpha: 0.75, join: 'round' });
    // Marginal light organs along the rim, lit by the travelling pulse.
    for (let i = 0; i <= 10; i++) {
      const u = -1 + (i / 10) * 2;
      const [x, y] = tr(u * R * 0.95 * sx, R * 0.3);
      const lit = 0.35 + this.pulseAt(t, 0) * 0.65;
      g.circle(x, y, 1.3 * this.size).fill({ color: 0xfff2d0, alpha: lit });
    }

    // Item traits shown as subtle physical changes (no costumes).
    if (costumes.has('spikes')) {
      for (let i = 0; i < 9; i++) {
        const a = Math.PI + ((i + 0.5) / 9) * Math.PI;
        const [x1, y1] = tr(Math.cos(a) * R * sx, Math.sin(a) * R * 0.95 * sy + R * 0.2);
        const [x2, y2] = tr(Math.cos(a) * (R + 5) * sx, Math.sin(a) * (R + 5) * 0.95 * sy + R * 0.2);
        g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 1.2, color: 0xffe0b0, alpha: 0.6 });
      }
    }
    if (costumes.has('lure')) {
      const [x1, y1] = tr(0, -R * 0.9 * sy);
      const [x2, y2] = tr(9 + Math.sin(t * 2) * 3, -R * 0.9 * sy - 18);
      g.moveTo(x1, y1).quadraticCurveTo(x1 + 2, y2 - 6, x2, y2).stroke({ width: 1, color: 0xffe0b0, alpha: 0.6 });
      g.circle(x2, y2, 3).fill({ color: 0xfff6b0, alpha: 0.95 });
    }
    if (costumes.has('crown')) {
      for (let i = 0; i < 5; i++) {
        const [x, y] = tr((i - 2) * 5, -R * 0.95 * sy - 1);
        g.circle(x, y, 1.4).fill({ color: 0xff9ad0, alpha: 0.8 });
      }
    }
    if (costumes.has('barnacles')) {
      for (const [lx, ly] of [[-14, -6], [10, -12], [15, 2], [-4, -18]]) {
        const [x, y] = tr(lx * this.size, ly * this.size);
        g.circle(x, y, 2.6).fill(shade(0xb8ab94));
      }
    }
    if (p.shield > 0) {
      const r = 40 * this.size + Math.sin(t * 6) * 2;
      g.circle(p.x, p.y + 4, r).fill({ color: 0xa0e8ff, alpha: 0.08 }).stroke({ width: 1.5, color: 0xdffaff, alpha: 0.7 });
      g.ellipse(p.x - r * 0.4, p.y - r * 0.45, 8, 3).fill({ color: 0xffffff, alpha: 0.5 });
    }
    if (p.charge > 0) {
      const [dx, dy] = p.chargeDir;
      const ox = p.x + dx * 26, oy = p.y + dy * 26;
      const laser = p.stats.flags.has('laser') && !p.stats.flags.has('charge');
      const r = 2 + p.charge * (laser ? 8 : 11);
      g.circle(ox, oy, r).fill({ color: laser ? 0xfff2a0 : 0xfff6e8, alpha: 0.9 });
    }
    void INK;
  }

  /** Brightness (0..1) of the travelling light pulse at fractional position f along the body. */
  private pulseAt(t: number, f: number) {
    let v = 0;
    for (const w0 of this.waves) {
      const front = (t - w0) / 0.9; // pulse travels the body in ~0.9 s
      v = Math.max(v, Math.max(0, 1 - Math.abs(front - f) * 5) * (1 - (t - w0) / 1.2));
    }
    return v;
  }

  /** Bioluminescence (drawn into the bloom layer). */
  drawGlow(gg: Graphics, p: Player, t: number, neon: boolean) {
    const col = neon ? (Math.floor(t * 6) % 2 ? 0xff5cf0 : 0x5cf2ff) : 0xffa040;
    const breathe = 0.8 + Math.sin(t * 2.2) * 0.2;
    const hurt = p.hurtFlash;
    const glowCol = hurt > 0 ? 0xff2d6a : col;
    // Wide scattering halo in the water plus a hot core.
    gg.circle(p.x, p.y - 2, 64 * this.size).fill(glowFill(glowCol));
    gg.circle(p.x, p.y - 6, 18 * this.size).fill({ color: 0xff9a3a, alpha: 0.3 * breathe + p.shootFlash * 0.35 });
    gg.circle(p.x, p.y - 8, 5 * this.size).fill({ color: 0xffd9a0, alpha: 0.6 * breathe });
    if (p.shootFlash > 0) gg.circle(p.x + p.lastShootDir[0] * 16, p.y + p.lastShootDir[1] * 16, 20).fill({ color: 0xffe0a0, alpha: p.shootFlash * 0.8 });
    if (hurt > 0) gg.circle(p.x, p.y, 44).fill({ color: 0xff2d6a, alpha: hurt * 0.5 });
    if (p.glowBurst > 0) gg.circle(p.x, p.y, 54 + Math.sin(t * 20) * 4).fill({ color: 0xfff27a, alpha: 0.35 });
    if (p.charge > 0) {
      const [dx, dy] = p.chargeDir;
      gg.circle(p.x + dx * 26, p.y + dy * 26, 8 + p.charge * 16).fill({ color: 0xfff6c0, alpha: 0.7 * p.charge });
    }
    // Light travelling down every tentacle.
    for (const tc of this.tentacles) {
      const n = tc.pts.length;
      for (let i = 1; i < n; i += tc.kind === 'oral' ? 1 : 2) {
        const f = i / n;
        const lit = this.pulseAt(t, f);
        const idle = 0.12 + 0.08 * Math.sin(t * 2 + tc.phase + i * 0.5);
        const a = Math.min(1, idle + lit);
        if (a < 0.1) continue;
        const q = tc.pts[i];
        gg.circle(q.x, q.y, (tc.kind === 'oral' ? 3.2 : 2) * this.size).fill({ color: lit > 0.3 ? 0xfff0c0 : 0xffb060, alpha: a });
      }
    }
  }
}
