// Anatomy toolkit for realistic sea creatures: fusiform fish bodies with
// countershading, rayed fins, gill covers and scales; tapered tubes for eels,
// seahorses and tentacles; and lifelike eyes.

import type { Graphics } from 'pixi.js';
import { darken, desaturate, lighten, mixColor } from '../core/math';
import { natural, shade } from './style';
import type { Enemy } from '../game/enemies';

export type Pt = [number, number];
export type Mapper = (u: number, v: number) => Pt;

/** Final body color of a creature: menace drains and darkens it, status effects tint it. */
export function tone(e: Enemy, col: number) {
  let c = natural(col);
  if (e.boss && !(e as { restored?: boolean }).restored) c = desaturate(c, 0.45); // drained by the Hollow Maw
  c = desaturate(darken(c, e.menace * 0.35), e.menace * 0.4);
  if (e.champion) c = mixColor(c, e.champion, 0.45);
  if (e.frozen > 0) c = mixColor(c, 0x9ef0ff, 0.6);
  if (e.burn > 0) c = mixColor(c, 0xff7a3d, 0.25 + Math.sin(e.anim * 20) * 0.1);
  if (e.poison > 0) c = mixColor(c, 0x7adf3d, 0.3);
  if (e.flash > 0) c = mixColor(c, 0xffffff, 0.75);
  return c;
}

/** Same tint pipeline for a secondary color (bellies, fins, markings). */
export function tint(e: Enemy, col: number) {
  let c = desaturate(darken(col, e.menace * 0.3), e.menace * 0.35);
  if (e.frozen > 0) c = mixColor(c, 0x9ef0ff, 0.6);
  if (e.flash > 0) c = mixColor(c, 0xffffff, 0.75);
  return c;
}

/** Soft contact edge in a darker shade of the body, never comic ink. */
export const edge = (c: number, w = 1.1, a = 0.55) => ({ width: w, color: darken(c, 0.55), alpha: a, join: 'round' as const });

/** Fish eye: dark rim, metallic iris, round pupil, wet catchlight. Menace turns irises amber, then red. */
export function fishEye(g: Graphics, x: number, y: number, r: number, menace: number, lx = 0, ly = 0, iris?: number) {
  const ir = iris ?? (menace >= 0.35 ? 0xb8322a : menace >= 0.2 ? 0xc98a2a : 0xb8a878);
  g.circle(x, y, r * 1.18).fill({ color: 0x0a0d10, alpha: 0.5 });
  g.circle(x, y, r).fill(shade(ir, 0.9));
  g.circle(x, y, r).stroke({ width: Math.max(0.6, r * 0.18), color: darken(ir, 0.6), alpha: 0.7 });
  g.circle(x + lx * r * 0.15, y + ly * r * 0.15, r * (menace > 0.3 ? 0.58 : 0.66)).fill(0x030405);
  g.circle(x - r * 0.3, y - r * 0.34, Math.max(0.7, r * 0.24)).fill({ color: 0xffffff, alpha: 0.85 });
  g.circle(x + r * 0.28, y + r * 0.3, Math.max(0.4, r * 0.1)).fill({ color: 0xffffff, alpha: 0.35 });
}

/** Beady arthropod eye: glossy black with a sheen. */
export function beadEye(g: Graphics, x: number, y: number, r: number, menace: number) {
  g.circle(x, y, r).fill(menace >= 0.35 ? 0x2a0606 : 0x0a0c10);
  if (menace >= 0.35) g.circle(x, y, r * 0.6).fill({ color: 0xb8322a, alpha: 0.6 });
  g.circle(x - r * 0.35, y - r * 0.35, Math.max(0.6, r * 0.32)).fill({ color: 0xffffff, alpha: 0.8 });
}

/** Tapered tube along a centerline: each point carries its half-width. Returns the outline. */
export function tubeOutline(pts: [number, number, number][]): number[] {
  const left: number[] = [], right: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, y, w] = pts[i];
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    left.push(x - ty * w, y + tx * w);
    right.push(x + ty * w, y - tx * w);
  }
  const out = [...left];
  for (let i = right.length - 2; i >= 0; i -= 2) out.push(right[i], right[i + 1]);
  return out;
}

export function strokePath(g: Graphics, pts: Pt[]) {
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
}

/** Thin flexible strand (tentacle, antenna, barbel) that sways from its root. */
export function strand(g: Graphics, x: number, y: number, ang: number, len: number, segs: number, sway: (i: number) => number, width: number, color: number, alpha = 1, taper = true) {
  let px = x, py = y, a = ang;
  const step = len / segs;
  for (let i = 1; i <= segs; i++) {
    a = ang + sway(i);
    const nx = px + Math.cos(a) * step, ny = py + Math.sin(a) * step;
    g.moveTo(px, py).lineTo(nx, ny).stroke({ width: taper ? Math.max(0.5, width * (1 - (i - 1) / segs)) : width, color, alpha, cap: 'round' });
    px = nx;
    py = ny;
  }
  return [px, py] as Pt;
}

export interface FishSpec {
  /** Body length (snout to tail base) and maximum depth, px. */
  L: number;
  H: number;
  /** Where the body is deepest, 0 = snout … 1 = tail base. */
  peak?: number;
  /** 0 = pointed snout, 1 = blunt rounded head. */
  nose?: number;
  /** Tail stalk thickness relative to max depth. */
  ped?: number;
  /** Back and belly depth multipliers (hatchetfish have a deep keel). */
  top?: number;
  bot?: number;
  back: number;
  belly: number;
  fin?: number;
  finAlpha?: number;
  tailLen?: number;
  tailH?: number;
  /** Caudal shape: 0 = rounded, 0.5 = truncate, 1 = deeply forked. */
  fork?: number;
  dorsal?: [number, number, number][];
  anal?: [number, number, number][];
  pectoral?: number;
  pelvic?: number;
  beat?: number;
  beatAmp?: number;
  eyeU?: number;
  eyeR?: number;
  eyeV?: number;
  /** Mouth corner position along the body, and gape 0..1. */
  mouthU?: number;
  gape?: number;
  mouthV?: number;
  gillU?: number;
  scales?: boolean;
  lateral?: boolean;
  menace: number;
  /** Nose-up tilt in radians. */
  tilt?: number;
  iris?: number;
  /** Extra markings painted over the flank before eyes and fins in front. */
  paint?: (P: Mapper, hh: (u: number) => number) => void;
}

/**
 * Draw a fish in profile and return a mapper from body space to the screen:
 * u runs from the snout (0) to the tail base (1); v is in units of the local
 * half-depth (−1 = back edge, +1 = belly edge).
 */
export function fish(g: Graphics, X: number, Y: number, f: number, s: FishSpec): { P: Mapper; hh: (u: number) => number; eye: Pt } {
  const peak = s.peak ?? 0.35, nose = s.nose ?? 0.5, ped = s.ped ?? 0.14;
  const top = s.top ?? 1, bot = s.bot ?? 1;
  const L = s.L, H2 = s.H / 2;
  const beat = s.beat ?? 0, amp = s.beatAmp ?? 1.5;
  const th = -(s.tilt ?? 0) * f;
  const ct = Math.cos(th), st = Math.sin(th);
  const raw = (u: number) => {
    if (u <= 0) return 0;
    if (u < peak) {
      const k = u / peak;
      return Math.pow(k, 0.85) * (1 - nose) + Math.sqrt(k * (2 - k)) * nose;
    }
    const k = Math.min(1, (u - peak) / (1 - peak));
    return ped + (1 - ped) * Math.pow(Math.cos((k * Math.PI) / 2), 1.25);
  };
  const hh = (u: number) => raw(u) * H2;
  const mid = (u: number) => Math.sin(beat) * amp * Math.pow(Math.max(0, u), 2.5);
  // v in half-depth units; back and belly scale separately.
  const local = (u: number, v: number): Pt => [f * (L / 2 - u * L), mid(u) + v * hh(u) * (v < 0 ? top : bot)];
  const toScreen = (lx: number, ly: number): Pt => [X + lx * ct - ly * st, Y + lx * st + ly * ct];
  const P: Mapper = (u, v) => {
    const [lx, ly] = local(u, v);
    return toScreen(lx, ly);
  };
  /** Raw px offset from the body midline (for fins beyond the edge). */
  const Q = (u: number, dyPx: number): Pt => {
    const [lx, ly] = local(u, 0);
    return toScreen(lx, ly + dyPx);
  };

  const finC = s.fin ?? darken(s.back, 0.1);
  const finA = s.finAlpha ?? 0.7;
  const N = 22;

  // Median fins behind the body.
  const finFill = { color: finC, alpha: finA };
  const rays = { width: 0.7, color: darken(finC, 0.45), alpha: finA * 0.8 };
  const medianFin = (u0: number, u1: number, h: number, side: -1 | 1) => {
    const steps = 6;
    const base: Pt[] = [], tip: Pt[] = [];
    for (let i = 0; i <= steps; i++) {
      const u = u0 + ((u1 - u0) * i) / steps;
      const k = i / steps;
      // Tall leading rays, sloping trailing edge.
      const prof = k < 0.25 ? 0.55 + (k / 0.25) * 0.45 : 1 - (k - 0.25) * 0.85;
      const fl = Math.sin(beat * 1.5 + k * 3) * 0.08;
      const edgeY = side * (hh(u) * (side < 0 ? top : bot) - 0.5);
      base.push(Q(u, edgeY));
      tip.push(Q(u + 0.03, edgeY + side * h * (prof + fl)));
    }
    const poly: number[] = [];
    for (const p of base) poly.push(p[0], p[1]);
    for (let i = tip.length - 1; i >= 0; i--) poly.push(tip[i][0], tip[i][1]);
    g.poly(poly).fill(finFill);
    for (let i = 0; i <= steps; i++) g.moveTo(base[i][0], base[i][1]).lineTo(tip[i][0], tip[i][1]);
    g.stroke(rays);
  };
  for (const [u0, u1, h] of s.dorsal ?? []) medianFin(u0, u1, h, -1);
  for (const [u0, u1, h] of s.anal ?? []) medianFin(u0, u1, h, 1);

  // Caudal fin, foreshortened as it sweeps side to side.
  {
    const tl = (s.tailLen ?? L * 0.28) * (0.8 + 0.2 * Math.abs(Math.cos(beat)));
    const tH = (s.tailH ?? s.H * 0.9) / 2;
    const fork = s.fork ?? 0.6;
    const b0 = Q(1, -hh(1) + 0.5), b1 = Q(1, hh(1) - 0.5);
    const sw = mid(1) + Math.sin(beat) * amp * 0.8;
    const [ex] = local(1, 0);
    const tipX = ex - f * tl;
    const up = toScreen(tipX, sw - tH), lo = toScreen(tipX, sw + tH);
    const notch = toScreen(ex - f * tl * (1 - fork * 0.65), sw);
    const poly: number[] = [b0[0], b0[1]];
    if (fork < 0.3) {
      // Rounded fan.
      for (let i = 0; i <= 8; i++) {
        const a = -Math.PI / 2 + (i / 8) * Math.PI;
        const p = toScreen(ex - f * tl * (0.55 + 0.45 * Math.cos(a)), sw + Math.sin(a) * tH);
        poly.push(p[0], p[1]);
      }
    } else poly.push(up[0], up[1], notch[0], notch[1], lo[0], lo[1]);
    poly.push(b1[0], b1[1]);
    g.poly(poly).fill(finFill);
    const mid0 = Q(1, 0);
    for (let i = 0; i <= 6; i++) {
      const k = i / 6;
      const v = -1 + 2 * k;
      const reach = fork < 0.3 ? 0.55 + 0.45 * Math.cos(v * Math.PI / 2) : 1 - fork * 0.65 * (1 - Math.abs(v));
      const p = toScreen(ex - f * tl * reach * 0.95, sw + v * tH * 0.95);
      g.moveTo(mid0[0], mid0[1]).lineTo(p[0], p[1]);
    }
    g.stroke(rays);
  }

  // Body with top-lit shading.
  const outline: number[] = [];
  for (let i = 0; i <= N; i++) {
    const p = P(i / N, -1);
    outline.push(p[0], p[1]);
  }
  for (let i = N; i >= 0; i--) {
    const p = P(i / N, 1);
    outline.push(p[0], p[1]);
  }
  g.poly(outline).fill(shade(s.back, 0.9));
  // Countershading: a pale belly blending up into the flank.
  for (const [from, a] of [[-0.05, 0.35], [0.3, 0.6]] as const) {
    const pts: number[] = [];
    for (let i = 1; i < N; i++) {
      const p = P(i / N, from);
      pts.push(p[0], p[1]);
    }
    for (let i = N - 1; i >= 1; i--) {
      const p = P(i / N, 1);
      pts.push(p[0], p[1]);
    }
    g.poly(pts).fill({ color: s.belly, alpha: a });
  }
  s.paint?.(P, hh);

  // Scales: overlapping arcs that open towards the tail.
  const gu = s.gillU ?? Math.min(0.3, peak * 0.75);
  if (s.scales !== false && s.H >= 10) {
    const r = Math.max(1.6, s.H * 0.09);
    const a0 = f > 0 ? Math.PI / 2 : -Math.PI / 2;
    for (let u = gu + 0.06; u < 0.94; u += (r * 1.5) / L) {
      for (let v = -0.7; v <= 0.71; v += 0.35) {
        const [cx, cy] = P(u, v + ((Math.round(u * 50) % 2) * 0.17));
        g.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r).arc(cx, cy, r, a0, a0 + Math.PI);
      }
    }
    g.stroke({ width: 0.6, color: lighten(s.back, 0.45), alpha: 0.16 });
  }
  if (s.lateral !== false) {
    const pts: Pt[] = [];
    for (let u = gu + 0.02; u <= 0.97; u += 0.05) pts.push(P(u, -0.25 + Math.sin(u * 4) * 0.05));
    strokePath(g, pts);
    g.stroke({ width: 0.8, color: lighten(s.back, 0.35), alpha: 0.4 });
  }
  g.poly(outline).stroke(edge(s.back));
  // Gill cover.
  {
    const a = P(gu, -0.7), c = P(gu + 0.07, 0), b = P(gu, 0.85);
    g.moveTo(a[0], a[1]).quadraticCurveTo(c[0], c[1], b[0], b[1]).stroke({ width: 1, color: darken(s.back, 0.5), alpha: 0.5 });
  }
  // Mouth.
  {
    const mu = s.mouthU ?? 0.09, mv = s.mouthV ?? 0.15, gp = s.gape ?? 0;
    const tip = P(0.004, mv), corner = P(mu, mv + 0.05);
    if (gp > 0.05) {
      const lo = P(0.03, mv + 0.5 + gp * 1.2);
      g.poly([tip[0], tip[1], corner[0], corner[1], lo[0], lo[1]]).fill({ color: 0x1a0608, alpha: 0.85 });
    } else g.moveTo(tip[0], tip[1]).lineTo(corner[0], corner[1]).stroke({ width: 1, color: darken(s.back, 0.6), alpha: 0.7 });
  }
  // Pectoral fin, fluttering.
  if (s.pectoral) {
    const pl = s.pectoral;
    const root = P(gu + 0.04, 0.25);
    const fl = Math.sin(beat * 1.7) * 0.35;
    const ang = (f > 0 ? Math.PI : 0) + f * (-0.5 - fl) + th;
    const tx = root[0] + Math.cos(ang) * pl, ty = root[1] + Math.sin(ang) * pl;
    const nx = -Math.sin(ang) * pl * 0.28, ny = Math.cos(ang) * pl * 0.28;
    g.moveTo(root[0], root[1]).quadraticCurveTo(tx + nx, ty + ny, tx, ty).quadraticCurveTo(tx - nx * 0.3, ty - ny * 0.3, root[0], root[1])
      .fill({ color: lighten(finC, 0.15), alpha: finA * 0.85 });
    g.moveTo(root[0], root[1]).lineTo(tx, ty).stroke(rays);
  }
  if (s.pelvic) {
    const root = P(Math.min(0.5, peak + 0.08), 0.95);
    const pl = s.pelvic;
    g.poly([root[0], root[1], root[0] - f * pl, root[1] + pl * 0.55, root[0] - f * pl * 0.35, root[1] + 0.5]).fill({ color: finC, alpha: finA });
  }
  const eu = s.eyeU ?? 0.13;
  const eye = P(eu, s.eyeV ?? -0.25);
  fishEye(g, eye[0], eye[1], s.eyeR ?? Math.max(2, s.H * 0.13), s.menace, f * 0.5, 0, s.iris);
  return { P, hh, eye };
}
