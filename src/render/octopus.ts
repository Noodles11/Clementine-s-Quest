// Clementine, a small bioluminescent octopus seen from the side.
//
// Behaviour modelled on real octopuses:
// - Hovering: mantle upright and breathing, arms spread like an umbrella,
//   each arm slowly undulating with curled tips.
// - Setting off: the mantle squeezes, water jets from the siphon and the arms
//   flare then sweep together in one power stroke.
// - Cruising: mantle first, arms trailing in a loose bundle that ripples.
// Arms are verlet chains pulled toward a muscular pose and pushed by the water.
// The pupil stays horizontal whatever the body does (octopus statocysts do this).

import { Container, Graphics } from 'pixi.js';
import { clamp, darken, lighten, mixColor, wrapAngle } from '../core/math';
import type { FluidField } from '../ambient/fluid';
import type { Player } from '../game/player';
import { shade } from './style';

interface Pt {
  x: number;
  y: number;
  px: number;
  py: number;
}

interface Arm {
  pts: Pt[];
  seg: number;
  /** Rest angle from the body's down axis (rad). */
  base: number;
  near: boolean;
  phase: number;
  /** Which way the tip likes to curl. */
  curl: number;
  width: number;
}

interface Spot {
  u: number;
  v: number;
  r: number;
  ph: number;
}

const SKIN = 0xd8622e;
const SKIN_DARK = 0x7a2a14;
const SKIN_PALE = 0xf2b08a;
const N = 13;

export class OctopusView {
  container = new Container();
  private farG = new Graphics();
  private bodyG = new Graphics();
  private nearG = new Graphics();
  arms: Arm[] = [];
  /** Body rotation: 0 = mantle up. */
  axis = 0;
  face = 1;
  spread = 1;
  blink = 0;
  nextBlink = 2;
  lookX = 0;
  lookY = 0;
  size = 1;
  private spots: Spot[] = [];
  private tmp = { x: 0, y: 0 };
  private ML: number;
  private W: number;

  constructor(x: number, y: number, size = 1) {
    this.size = size;
    this.ML = 24 * size;
    this.W = 10.5 * size;
    this.container.addChild(this.farG, this.bodyG, this.nearG);
    const bases = [-1.15, -0.8, -0.45, -0.15, 0.15, 0.45, 0.8, 1.15];
    bases.forEach((b, i) => {
      const pts: Pt[] = [];
      for (let k = 0; k < N; k++) pts.push({ x, y: y + 10 + k * 4, px: x, py: y + 10 + k * 4 });
      this.arms.push({
        pts, seg: (4.3 + (i % 3) * 0.25) * size, base: b, near: i % 2 === 0,
        phase: i * 1.7 + Math.random(), curl: i % 2 ? 1 : -1, width: (i % 2 === 0 ? 4.4 : 3.8) * size,
      });
    });
    // Chromatophore spots scattered over the mantle and head.
    let s = 1234;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 30; i++) this.spots.push({ u: rnd() * 2 - 1, v: rnd(), r: 0.6 + rnd() * 1.4, ph: rnd() * 10 });
  }

  /** Local body coordinates (x toward the eye, y toward the arms) → world. */
  private tr(p: Player, lx: number, ly: number): [number, number] {
    const c = Math.cos(this.axis), s = Math.sin(this.axis);
    const x = lx * this.face;
    return [p.x + x * c - ly * s, p.y + x * s + ly * c];
  }

  /** Mantle squeeze (0..1) during a jet, and the slow breathing rhythm. */
  private mantle(p: Player, t: number) {
    const k = p.pulseKick;
    const ph = 1 - k;
    const jet = k <= 0 ? 0 : ph < 0.2 ? ph / 0.2 : Math.max(0, 1 - (ph - 0.2) / 0.6);
    const breathe = Math.sin(t * 2 * Math.PI * 0.55) * 0.06 * (1 - jet);
    return { jet, breathe };
  }

  update(dt: number, p: Player, fluid: FluidField, t: number) {
    const max = p.stats?.movePx ?? 230;
    const speed = Math.hypot(p.vx, p.vy);
    const cruising = p.moving && speed > max * 0.3;
    // Orientation: upright when hovering, mantle-first when swimming.
    const k = clamp((speed - 40) / (max * 0.6), 0, 1) * (p.moving ? 1 : 0.6);
    const mx = speed > 1 ? (p.vx / speed) * k : 0;
    const my = -(1 - k) + (speed > 1 ? (p.vy / speed) * k : 0);
    const sway = Math.sin(t * 0.8) * 0.06 * (1 - k);
    const target = Math.atan2(mx, -my) + sway;
    this.axis += wrapAngle(target - this.axis) * Math.min(1, dt * (p.pulseClock < 0.3 ? 9 : 5));
    if (Math.abs(p.vx) > 30) this.face = p.vx > 0 ? 1 : -1;
    else if (p.shootFlash > 0 && p.lastShootDir[0]) this.face = p.lastShootDir[0] > 0 ? 1 : -1;

    // Arm spread: flare, then one power sweep together, then a loose trailing bundle.
    let spreadT = p.moving ? 0.45 : 1;
    if (p.moving && p.pulseClock < 0.09) spreadT = 1.45;
    else if (p.moving && p.pulseClock < 0.42) spreadT = 0.06;
    this.spread += (spreadT - this.spread) * Math.min(1, dt * (p.pulseClock < 0.42 ? 16 : 4));

    const dt2 = dt * dt;
    const ML = this.ML;
    const crown = 0.36 * ML;
    const jetting = p.moving && p.pulseClock < 0.42;
    const kPose = jetting ? 4 : cruising ? 1.4 : 5;
    // Cruising arms ripple in a travelling wave; hovering arms curl and reach slowly.
    const amp = cruising ? 0.3 : 0.22;
    const freq = cruising ? 4.2 : 1.7;
    for (const a of this.arms) {
      const pts = a.pts;
      // Anchor around the arm crown.
      const ax = Math.sin(a.base) * this.W * 0.42;
      const [bx, by] = this.tr(p, ax, crown);
      pts[0].x = pts[0].px = bx;
      pts[0].y = pts[0].py = by;
      // Muscular pose (local): accumulate bend along the arm.
      const reach = cruising ? 0 : Math.sin(t * 0.45 + a.phase) * 0.22;
      let ang = (a.base + reach) * this.spread;
      let lx = ax, ly = crown;
      for (let j = 1; j < pts.length; j++) {
        const f = j / pts.length;
        let bend = amp * (0.35 + f) * Math.sin(t * freq + a.phase - j * 0.6);
        if (!cruising && f > 0.55) bend += a.curl * (f - 0.55) * 0.9 * (0.7 + 0.3 * Math.sin(t * 0.9 + a.phase));
        ang += bend;
        lx += Math.sin(ang) * a.seg;
        ly += Math.cos(ang) * a.seg;
        const [tx, ty] = this.tr(p, lx, ly);
        const q = pts[j];
        fluid.sample(q.x, q.y, this.tmp);
        const vx = (q.x - q.px) * 0.9, vy = (q.y - q.py) * 0.9;
        q.px = q.x;
        q.py = q.y;
        q.x += vx + this.tmp.x * 2.6 * dt2;
        q.y += vy + this.tmp.y * 2.6 * dt2;
        const pull = Math.min(1, kPose * dt * (1 - f * 0.5));
        q.x += (tx - q.x) * pull;
        q.y += (ty - q.y) * pull;
      }
      // Arms never stretch, however far the body moves in a frame.
      for (let j = 1; j < pts.length; j++) {
        const a0 = pts[j - 1], b0 = pts[j];
        const dx = b0.x - a0.x, dy = b0.y - a0.y;
        const d = Math.hypot(dx, dy) || 0.001;
        if (d > a.seg) {
          const s = a.seg / d;
          const nx = a0.x + dx * s, ny = a0.y + dy * s;
          b0.px += nx - b0.x;
          b0.py += ny - b0.y;
          b0.x = nx;
          b0.y = ny;
        }
      }
    }

    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 0.16;
      this.nextBlink = 2.5 + Math.random() * 3.5;
    }
    this.blink = Math.max(0, this.blink - dt);
    const lx = p.shootFlash > 0 || p.charge > 0 ? p.lastShootDir[0] : clamp(p.vx / max, -1, 1);
    const ly = p.shootFlash > 0 || p.charge > 0 ? p.lastShootDir[1] : clamp(p.vy / max, -1, 1);
    this.lookX += (lx - this.lookX) * Math.min(1, dt * 10);
    this.lookY += (ly - this.lookY) * Math.min(1, dt * 10);
  }

  /** Bioluminescent pulses travelling down the arms: start times. */
  private waves: number[] = [];
  private lastKick = -9;

  private skin(p: Player) {
    // Octopuses blanch when startled.
    return p.hurtFlash > 0 ? mixColor(SKIN, SKIN_PALE, p.hurtFlash) : SKIN;
  }

  private drawArm(g: Graphics, a: Arm, p: Player, t: number, far: boolean) {
    const pts = a.pts;
    const left: number[] = [], right: number[] = [];
    const n = pts.length;
    const normals: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)];
      let nx = -(q.y - o.y), ny = q.x - o.x;
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      normals.push([nx, ny]);
      const w = a.width * Math.pow(1 - (i / n) * 0.88, 0.9);
      left.push(pts[i].x + nx * w, pts[i].y + ny * w);
      right.push(pts[i].x - nx * w, pts[i].y - ny * w);
    }
    const poly = [...left];
    for (let i = right.length - 2; i >= 0; i -= 2) poly.push(right[i], right[i + 1]);
    const col = far ? darken(this.skin(p), 0.35) : this.skin(p);
    g.poly(poly).fill(shade(col, 0.9)).stroke({ width: 0.8, color: SKIN_DARK, alpha: 0.45, join: 'round' });
    // Paler oral side with two rows of suckers (bioluminescent rims).
    const side = a.base >= 0 ? -1 : 1;
    for (let i = 1; i < n - 1; i++) {
      const w = a.width * Math.pow(1 - (i / n) * 0.88, 0.9);
      const [nx, ny] = normals[i];
      const sx = pts[i].x + nx * w * 0.55 * side, sy = pts[i].y + ny * w * 0.55 * side;
      const r = Math.max(0.5, w * 0.36);
      const lit = this.pulseAt(t, i / n);
      g.circle(sx, sy, r).fill({ color: mixColor(SKIN_PALE, 0xfff0c8, lit), alpha: far ? 0.35 : 0.75 });
      if (!far && r > 0.9) g.circle(sx, sy, r * 0.45).fill({ color: SKIN_DARK, alpha: 0.35 });
    }
  }

  draw(p: Player, t: number, costumes: Set<string>) {
    const fg = this.farG, g = this.bodyG, ng = this.nearG;
    fg.clear();
    g.clear();
    ng.clear();
    this.container.alpha = p.invuln > 0 && Math.floor(t * 20) % 2 === 0 ? 0.5 : 1;
    if (p.pulseKick > 0.95 && t - this.lastKick > 0.25) {
      this.waves.push(t);
      this.lastKick = t;
    }
    this.waves = this.waves.filter((w0) => t - w0 < 1.2);
    const skin = this.skin(p);

    // Far arms and the web between the arm bases.
    for (const a of this.arms) if (!a.near) this.drawArm(fg, a, p, t, true);
    const sorted = [...this.arms].sort((a, b) => a.base - b.base);
    for (let i = 0; i < sorted.length - 1; i++) {
      const A = sorted[i].pts, B = sorted[i + 1].pts;
      const depth = 3 + Math.round(this.spread * 1.5);
      const web: number[] = [];
      for (let j = 0; j <= depth; j++) web.push(A[j].x, A[j].y);
      for (let j = depth; j >= 0; j--) web.push(B[j].x, B[j].y);
      fg.poly(web).fill({ color: darken(skin, 0.2), alpha: 0.6 });
    }

    // Mantle and head: one egg-shaped body, breathing and squeezing.
    const ML = this.ML, W = this.W;
    const { jet, breathe } = this.mantle(p, t);
    const rxK = (1 + breathe) * (1 - 0.28 * jet);
    const ryK = 1 + 0.1 * jet;
    const cy = -0.22 * ML;
    const lean = 0.35 * (1 - clamp(Math.hypot(p.vx, p.vy) / 200, 0, 1));
    const body: number[] = [];
    const M = 34;
    for (let i = 0; i < M; i++) {
      const phi = (i / M) * Math.PI * 2;
      const up = Math.cos(phi);
      const ry = (up > 0 ? 0.74 * ML * ryK : 0.58 * ML);
      const rx = W * (up > 0 ? rxK * (1 + 0.22 * up) : 0.95 - 0.1 * up * up);
      let lx = Math.sin(phi) * rx;
      const ly = cy - up * ry;
      // The mantle sac droops back behind the head.
      lx -= lean * Math.max(0, (0.1 * ML - ly) / ML) * W;
      body.push(...this.tr(p, lx, ly));
    }
    g.poly(body).fill(shade(skin, 1)).stroke({ width: 1, color: SKIN_DARK, alpha: 0.5, join: 'round' });
    // Chromatophores slowly flickering, and a few raised papillae.
    for (const s of this.spots) {
      const ly = cy - (0.15 + s.v * 0.75) * 0.74 * ML;
      const lx = s.u * W * 0.75 * (1 - s.v * 0.4) - lean * Math.max(0, (0.1 * ML - ly) / ML) * W;
      const [x, y] = this.tr(p, lx, ly);
      const a = 0.25 + 0.2 * Math.sin(t * 0.7 + s.ph);
      g.circle(x, y, s.r * this.size).fill({ color: SKIN_DARK, alpha: a });
    }
    const [hx, hy] = this.tr(p, -W * 0.25, cy - 0.55 * ML);
    g.ellipse(hx, hy, 5 * this.size, 2.4 * this.size).fill({ color: 0xffffff, alpha: 0.18 });
    // Siphon: a short funnel under the mantle edge, flaring as it jets.
    const [s0x, s0y] = this.tr(p, -W * 0.62, 0.1 * ML);
    const [s1x, s1y] = this.tr(p, -W * (0.92 + jet * 0.18), 0.22 * ML);
    g.moveTo(s0x, s0y).lineTo(s1x, s1y).stroke({ width: (4.2 + jet * 1.8) * this.size, color: darken(skin, 0.1), cap: 'round' });
    g.circle(s1x, s1y, (1.3 + jet) * this.size).fill({ color: SKIN_DARK, alpha: 0.6 });

    // Eye: a raised turret with a golden iris and a horizontal slit pupil.
    const [ex, ey] = this.tr(p, W * 0.5, -0.02 * ML);
    g.circle(ex, ey, 4.6 * this.size).fill(shade(lighten(skin, 0.05), 1));
    g.circle(ex, ey, 3.3 * this.size).fill(0xd8b05a);
    const ox = this.lookX * 0.8 * this.size, oy = this.lookY * 0.6 * this.size;
    g.roundRect(ex + ox - 2.3 * this.size, ey + oy - 0.65 * this.size, 4.6 * this.size, 1.3 * this.size, 0.6).fill(0x0a0604);
    g.circle(ex - 1.2 * this.size, ey - 1.3 * this.size, 0.8 * this.size).fill({ color: 0xffffff, alpha: 0.7 });
    if (this.blink > 0) g.circle(ex, ey, 3.6 * this.size).fill(shade(skin, 1));
    // Brow papilla above the eye.
    const [bx, by] = this.tr(p, W * 0.55, -0.24 * ML);
    g.circle(bx, by, 1.4 * this.size).fill(lighten(skin, 0.15));

    // Near arms in front of the head.
    for (const a of this.arms) if (a.near) this.drawArm(ng, a, p, t, false);

    // Item traits as subtle physical changes.
    if (costumes.has('spikes')) {
      for (let i = 0; i < 7; i++) {
        const u = -0.8 + (i / 6) * 1.6;
        const [x1, y1] = this.tr(p, u * W * 0.9, cy - 0.55 * ML * (1 - u * u * 0.4));
        const [x2, y2] = this.tr(p, u * W * 1.25, cy - 0.55 * ML * (1 - u * u * 0.4) - 6);
        g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 1.4, color: SKIN_PALE, alpha: 0.7, cap: 'round' });
      }
    }
    if (costumes.has('lure')) {
      const [x1, y1] = this.tr(p, 0, cy - 0.74 * ML);
      const [x2, y2] = this.tr(p, 8 + Math.sin(t * 2) * 3, cy - 0.74 * ML - 16);
      g.moveTo(x1, y1).quadraticCurveTo(x1 + 2, y2 - 6, x2, y2).stroke({ width: 1, color: SKIN_PALE, alpha: 0.6 });
      g.circle(x2, y2, 3).fill({ color: 0xfff6b0, alpha: 0.95 });
    }
    if (costumes.has('crown')) {
      for (let i = 0; i < 5; i++) {
        const [x, y] = this.tr(p, (i - 2) * 4 * this.size, cy - 0.7 * ML);
        g.circle(x, y, 1.4).fill({ color: 0xff9ad0, alpha: 0.8 });
      }
    }
    if (costumes.has('barnacles')) {
      for (const [lx, ly] of [[-6, -20], [5, -26], [7, -12], [-3, -30]]) {
        const [x, y] = this.tr(p, lx * this.size, ly * this.size);
        g.circle(x, y, 2.4).fill(shade(0xb8ab94));
      }
    }
    if (p.shield > 0) {
      const r = 44 * this.size + Math.sin(t * 6) * 2;
      ng.circle(p.x, p.y + 6, r).fill({ color: 0xa0e8ff, alpha: 0.08 }).stroke({ width: 1.5, color: 0xdffaff, alpha: 0.7 });
      ng.ellipse(p.x - r * 0.4, p.y - r * 0.45, 8, 3).fill({ color: 0xffffff, alpha: 0.5 });
    }
    if (p.charge > 0) {
      const [dx, dy] = p.chargeDir;
      const laser = p.stats.flags.has('laser') && !p.stats.flags.has('charge');
      ng.circle(p.x + dx * 26, p.y + dy * 26, 2 + p.charge * (laser ? 8 : 11)).fill({ color: laser ? 0xfff2a0 : 0xfff6e8, alpha: 0.9 });
    }
  }

  /** Brightness (0..1) of the travelling light pulse at fraction f along an arm. */
  private pulseAt(t: number, f: number) {
    let v = 0;
    for (const w0 of this.waves) {
      const front = (t - w0) / 0.8;
      v = Math.max(v, Math.max(0, 1 - Math.abs(front - f) * 5) * (1 - (t - w0) / 1.2));
    }
    return v;
  }

  /** Bioluminescence (drawn into the bloom layer). */
  drawGlow(gg: Graphics, p: Player, t: number, neon: boolean) {
    const col = neon ? (Math.floor(t * 6) % 2 ? 0xff5cf0 : 0x5cf2ff) : 0xffa040;
    const breathe = 0.8 + Math.sin(t * 2 * Math.PI * 0.55) * 0.2;
    const hurt = p.hurtFlash;
    const [mx, my] = this.tr(p, 0, -0.3 * this.ML);
    gg.circle(mx, my + 10, 40 * this.size).fill({ color: hurt > 0 ? 0xff2d6a : col, alpha: 0.12 * breathe });
    gg.circle(mx, my, 11 * this.size).fill({ color: 0xff9a3a, alpha: 0.14 * breathe + p.shootFlash * 0.25 });
    if (p.shootFlash > 0) gg.circle(p.x + p.lastShootDir[0] * 16, p.y + p.lastShootDir[1] * 16, 20).fill({ color: 0xffe0a0, alpha: p.shootFlash * 0.8 });
    if (hurt > 0) gg.circle(p.x, p.y, 44).fill({ color: 0xff2d6a, alpha: hurt * 0.5 });
    if (p.glowBurst > 0) gg.circle(p.x, p.y, 54 + Math.sin(t * 20) * 4).fill({ color: 0xfff27a, alpha: 0.35 });
    if (p.charge > 0) {
      const [dx, dy] = p.chargeDir;
      gg.circle(p.x + dx * 26, p.y + dy * 26, 8 + p.charge * 16).fill({ color: 0xfff6c0, alpha: 0.7 * p.charge });
    }
    // Glowing suckers, brightest where the stroke's light pulse passes.
    for (const a of this.arms) {
      const n = a.pts.length;
      for (let i = 2; i < n; i += 2) {
        const f = i / n;
        const lit = this.pulseAt(t, f);
        const idle = 0.1 + 0.07 * Math.sin(t * 1.6 + a.phase + i * 0.5);
        const al = Math.min(0.6, (idle + lit) * (a.near ? 0.6 : 0.35));
        if (al < 0.08) continue;
        const q = a.pts[i];
        gg.circle(q.x, q.y, 2.2 * this.size).fill({ color: lit > 0.3 ? 0xfff0c0 : 0xffb060, alpha: al });
      }
    }
  }
}
