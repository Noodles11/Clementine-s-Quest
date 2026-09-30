// Clementine, seen from the side: a pulsing, deformable bell with physically
// simulated trailing tentacles (verlet chains sampled by the water field).

import { Container, Graphics } from 'pixi.js';
import { clamp, lighten, mixColor } from '../core/math';
import type { FluidField } from '../ambient/fluid';
import type { Player } from '../game/player';
import { INK } from '../ambient/plants';

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
      for (let it = 0; it < 3; it++) {
        for (let i = 1; i < pts.length; i++) {
          const a0 = pts[i - 1], b0 = pts[i];
          const dx = b0.x - a0.x, dy = b0.y - a0.y;
          const d = Math.hypot(dx, dy) || 0.001;
          const diff = (d - tc.seg) / d;
          if (i === 1) {
            b0.x -= dx * diff;
            b0.y -= dy * diff;
          } else {
            a0.x += dx * diff * 0.5;
            a0.y += dy * diff * 0.5;
            b0.x -= dx * diff * 0.5;
            b0.y -= dy * diff * 0.5;
          }
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

  draw(p: Player, t: number, costumes: Set<string>) {
    const tg = this.tg, g = this.bg;
    tg.clear();
    g.clear();
    const blinkOut = p.invuln > 0 && Math.floor(t * 20) % 2 === 0;
    this.container.alpha = blinkOut ? 0.45 : 1;
    const { sx, sy } = this.deform(p, t);

    // Tentacles (behind the bell).
    for (const tc of this.tentacles) {
      const pts = tc.pts;
      if (tc.kind === 'marginal') {
        tg.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) tg.lineTo(pts[i].x, pts[i].y);
        tg.stroke({ width: tc.width + 2, color: INK, alpha: 0.55, cap: 'round', join: 'round' });
        tg.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) tg.lineTo(pts[i].x, pts[i].y);
        tg.stroke({ width: tc.width, color: lighten(TENT, 0.25), alpha: 0.95, cap: 'round', join: 'round' });
      } else {
        const left: number[] = [], right: number[] = [];
        for (let i = 0; i < pts.length; i++) {
          const q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
          let nx = -(q.y - o.y), ny = q.x - o.x;
          const l = Math.hypot(nx, ny) || 1;
          nx /= l;
          ny /= l;
          const frill = 1 + Math.sin(i * 2.2 + t * 6 + tc.phase) * 0.35;
          const w = (tc.width * (1 - (i / pts.length) * 0.75)) * frill * this.size;
          left.push(pts[i].x + nx * w, pts[i].y + ny * w);
          right.push(pts[i].x - nx * w, pts[i].y - ny * w);
        }
        const poly = [...left];
        for (let i = right.length - 2; i >= 0; i -= 2) poly.push(right[i], right[i + 1]);
        tg.poly(poly).fill({ color: mixColor(TENT, 0xff7a9a, 0.35), alpha: 0.92 }).stroke({ width: 2, color: INK, join: 'round' });
      }
    }

    // Bell.
    const R = 22 * this.size;
    const c = Math.cos(this.tilt), s = Math.sin(this.tilt);
    const tr = (lx: number, ly: number): [number, number] => [p.x + lx * c - ly * s, p.y + lx * s + ly * c];
    const dome: number[] = [];
    const N = 22;
    for (let i = 0; i <= N; i++) {
      const a = Math.PI + (i / N) * Math.PI;
      const [x, y] = tr(Math.cos(a) * R * sx, Math.sin(a) * R * 0.95 * sy + R * 0.2);
      dome.push(x, y);
    }
    // Scalloped rim back to the left.
    const S = 16;
    for (let i = 0; i <= S; i++) {
      const u = 1 - (i / S) * 2;
      const [x, y] = tr(u * R * sx, R * 0.2 + R * 0.12 * sy + Math.sin(i * Math.PI) * 0 + (i % 2 ? 4 : 0) * this.size);
      dome.push(x, y);
    }
    const hurt = p.hurtFlash;
    const bodyCol = hurt > 0 ? mixColor(BODY, 0xff4d8a, hurt * 0.6) : BODY;
    g.poly(dome).fill({ color: bodyCol, alpha: 0.93 }).stroke({ width: 3.2, color: INK, join: 'round' });
    // Inner lighter dome.
    const inner: number[] = [];
    for (let i = 0; i <= N; i++) {
      const a = Math.PI + (i / N) * Math.PI;
      const [x, y] = tr(Math.cos(a) * R * sx * 0.72, Math.sin(a) * R * 0.7 * sy + R * 0.18);
      inner.push(x, y);
    }
    g.poly(inner).fill({ color: BODY_LIGHT, alpha: 0.55 });
    // Four-leaf gonad pattern.
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      const [x, y] = tr(Math.cos(a) * 6 * sx, -R * 0.35 + Math.sin(a) * 4 * sy);
      g.circle(x, y, 3.6 * this.size).fill({ color: 0xff6f8a, alpha: 0.55 });
    }
    // Highlight.
    const [hx, hy] = tr(-R * 0.45 * sx, -R * 0.55 * sy);
    g.ellipse(hx, hy, 6 * this.size, 3.5 * this.size).fill({ color: 0xffffff, alpha: 0.85 });
    const [hx2, hy2] = tr(-R * 0.2 * sx, -R * 0.72 * sy);
    g.circle(hx2, hy2, 2 * this.size).fill({ color: 0xffffff, alpha: 0.85 });

    // Face.
    const eyeY = -R * 0.02;
    const blink = this.blink > 0;
    for (const side of [-1, 1]) {
      const [ex, ey] = tr(side * R * 0.34 * sx, eyeY);
      if (hurt > 0.5) {
        g.moveTo(ex - 4, ey - 4).lineTo(ex + 4, ey + 4).moveTo(ex + 4, ey - 4).lineTo(ex - 4, ey + 4).stroke({ width: 3, color: INK });
        continue;
      }
      if (blink) {
        g.moveTo(ex - 5, ey).quadraticCurveTo(ex, ey + 3, ex + 5, ey).stroke({ width: 2.5, color: INK });
        continue;
      }
      g.ellipse(ex, ey, 5.6 * this.size, 6.6 * this.size).fill(0xffffff).stroke({ width: 2.2, color: INK });
      g.circle(ex + this.lookX * 2.2, ey + this.lookY * 2.2, 3.2 * this.size).fill(INK);
      g.circle(ex + this.lookX * 2.2 - 1.2, ey + this.lookY * 2.2 - 1.4, 1.1).fill(0xffffff);
    }
    const [mx, my] = tr(0, R * 0.16);
    if (p.shootFlash > 0.3 || p.charge > 0) g.circle(mx, my, 2.8).fill(INK);
    else g.moveTo(mx - 4, my - 1).quadraticCurveTo(mx, my + 3.5, mx + 4, my - 1).stroke({ width: 2, color: INK, cap: 'round' });
    // Blush.
    for (const side of [-1, 1]) {
      const [bx, by] = tr(side * R * 0.58 * sx, R * 0.1);
      g.ellipse(bx, by, 4, 2.2).fill({ color: 0xff5c7a, alpha: 0.5 });
    }

    // Costumes from items.
    if (costumes.has('crown')) {
      const pts: number[] = [];
      const base = -R * 0.93 * sy;
      const cw = 13;
      for (const [lx, ly] of [[-cw, base], [-cw, base - 10], [-cw / 2, base - 4], [0, base - 13], [cw / 2, base - 4], [cw, base - 10], [cw, base]]) {
        const [x, y] = tr(lx, ly);
        pts.push(x, y);
      }
      g.poly(pts).fill(0xffd23d).stroke({ width: 2.5, color: INK, join: 'round' });
      const [gx, gy] = tr(0, base - 5);
      g.circle(gx, gy, 2.5).fill(0xff6fa8);
    }
    if (costumes.has('spikes')) {
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + ((i + 0.5) / 7) * Math.PI;
        const [x1, y1] = tr(Math.cos(a) * R * sx, Math.sin(a) * R * 0.95 * sy + R * 0.2);
        const [x2, y2] = tr(Math.cos(a) * (R + 7) * sx, Math.sin(a) * (R + 7) * 0.95 * sy + R * 0.2);
        g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 3, color: INK, cap: 'round' });
      }
    }
    if (costumes.has('barnacles')) {
      for (const [lx, ly] of [[-14, -6], [10, -12], [15, 2], [-4, -18]]) {
        const [x, y] = tr(lx * this.size, ly * this.size);
        g.circle(x, y, 3.2).fill(0xd8c8a8).stroke({ width: 1.8, color: INK });
      }
    }
    if (costumes.has('lure')) {
      const [x1, y1] = tr(0, -R * 0.9 * sy);
      const [x2, y2] = tr(10 + Math.sin(t * 2) * 3, -R * 0.9 * sy - 20);
      g.moveTo(x1, y1).quadraticCurveTo(x1 + 2, y2 - 6, x2, y2).stroke({ width: 2, color: INK });
      g.circle(x2, y2, 4.5).fill(0xfff27a).stroke({ width: 2, color: INK });
    }
    if (costumes.has('ghost')) {
      g.poly(dome).stroke({ width: 7, color: 0xc8d8ff, alpha: 0.25 + Math.sin(t * 4) * 0.1 });
    }
    if (costumes.has('jitter') && p.moving) {
      for (const side of [-1, 1]) {
        const [x, y] = tr(side * (R + 8), -R * 0.3);
        g.moveTo(x, y - 5).lineTo(x + side * 6, y).lineTo(x, y + 5).stroke({ width: 2, color: INK });
      }
    }
    // Bubble shield.
    if (p.shield > 0) {
      const r = 40 * this.size + Math.sin(t * 6) * 2;
      g.circle(p.x, p.y + 4, r).fill({ color: 0xa0e8ff, alpha: 0.18 }).stroke({ width: 3, color: 0xdffaff, alpha: 0.9 });
      g.ellipse(p.x - r * 0.4, p.y - r * 0.4, 9, 5).fill({ color: 0xffffff, alpha: 0.7 });
    }
    // Charge orb.
    if (p.charge > 0) {
      const [dx, dy] = p.chargeDir;
      const ox = p.x + dx * 26, oy = p.y + dy * 26;
      const laser = p.stats.flags.has('laser') && !p.stats.flags.has('charge');
      const r = 3 + p.charge * (laser ? 9 : 12);
      g.circle(ox, oy, r).fill({ color: laser ? 0xfff27a : 0xfff6e8, alpha: 0.9 }).stroke({ width: 2, color: INK });
      if (p.charge >= 1 && Math.floor(t * 12) % 2) g.circle(ox, oy, r + 4).stroke({ width: 2, color: 0xffffff });
    }
  }

  /** Neon glow contribution (drawn into the bloom layer). */
  drawGlow(gg: Graphics, p: Player, t: number, neon: boolean) {
    const base = 0.22 + Math.sin(t * 2) * 0.04;
    const col = neon ? (Math.floor(t * 6) % 2 ? 0xff5cf0 : 0x5cf2ff) : 0xffa040;
    gg.circle(p.x, p.y - 2, 30 * this.size).fill({ color: col, alpha: base });
    if (p.shootFlash > 0) gg.circle(p.x + p.lastShootDir[0] * 14, p.y + p.lastShootDir[1] * 14, 22).fill({ color: 0xffe0a0, alpha: p.shootFlash * 0.9 });
    if (p.hurtFlash > 0) gg.circle(p.x, p.y, 40).stroke({ width: 10, color: 0xff2d8a, alpha: p.hurtFlash });
    if (p.glowBurst > 0) gg.circle(p.x, p.y, 44 + Math.sin(t * 20) * 4).fill({ color: 0xfff27a, alpha: 0.35 });
    if (p.charge > 0) {
      const [dx, dy] = p.chargeDir;
      gg.circle(p.x + dx * 26, p.y + dy * 26, 8 + p.charge * 14).fill({ color: 0xfff6c0, alpha: 0.6 * p.charge });
    }
    for (const tc of this.tentacles) {
      if (tc.kind !== 'marginal') continue;
      const e = tc.pts[tc.pts.length - 1];
      gg.circle(e.x, e.y, 3).fill({ color: 0xffd28a, alpha: 0.5 });
    }
  }
}
