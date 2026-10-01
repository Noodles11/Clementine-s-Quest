// Doors, props, projectiles, bombs, zones and hazards.

import type { Graphics } from 'pixi.js';
import { EA, EW, shade } from './style';
import { TILE } from '../config';
import { darken, hsl, lighten, mixColor } from '../core/math';
import { INK } from '../ambient/plants';
import type { InkMark, RoomWorld } from '../game/room';
import type { Gate } from '../gen/level';
import type { Prop } from '../game/pickups';
import type { Bubble, EnemyShot } from '../game/projectiles';

/** Arena gates: while the boss fight lasts, a current pours in through each tunnel. */
export function drawGate(g: Graphics, gate: Gate, t: number, glow?: Graphics) {
  const { x, y, nx, ny } = gate;
  const span = TILE * 1.6;
  for (let i = 0; i < 8; i++) {
    const phase = (t * 1.8 + i / 8) % 1;
    const off = (i / 7 - 0.5) * span * 1.6;
    const x0 = x - nx * TILE * 1.5 + nx * phase * TILE * 3 - ny * off;
    const y0 = y - ny * TILE * 1.5 + ny * phase * TILE * 3 + nx * off;
    const len = 30;
    g.moveTo(x0, y0).lineTo(x0 + nx * len, y0 + ny * len).stroke({ width: 1.6, color: 0xdff6ff, alpha: 0.4 * Math.sin(phase * Math.PI) });
  }
  if (glow) glow.circle(x, y, TILE * 1.2).fill({ color: 0xff5a4a, alpha: 0.06 + Math.sin(t * 3) * 0.03 });
}

export function drawProp(g: Graphics, glow: Graphics, p: Prop, w: RoomWorld, t: number) {
  switch (p.kind) {
    case 'crack': {
      if (w.depth === 7) break; // no rift in the tank
      const x0 = p.x - p.w / 2, x1 = p.x + p.w / 2, y = p.y;
      if (w.depth === 6 && w.stage === 3 && w.run.data.maxDepth >= 7 && p.active) {
        // The Crack was a pipe all along: a rusty grate over a dark intake.
        g.ellipse(p.x, y + 6, p.w / 2 + 10, 20).fill(0x5a4a3a).stroke({ width: 3 * EW, color: INK, alpha: EA });
        g.ellipse(p.x, y + 6, p.w / 2, 14).fill(0x05040a);
        for (let i = -3; i <= 3; i++) g.moveTo(p.x + i * (p.w / 8), y - 6).lineTo(p.x + i * (p.w / 8), y + 18).stroke({ width: 3, color: 0x8a5a3a });
        g.moveTo(p.x - p.w / 2, y + 6).lineTo(p.x + p.w / 2, y + 6).stroke({ width: 3, color: 0x8a5a3a });
        glow.ellipse(p.x, y + 4, p.w / 2, 18).fill({ color: 0xdff6ff, alpha: 0.25 + Math.sin(t * 5) * 0.1 });
        break;
      }
      const pts: number[] = [];
      const n = 10;
      for (let i = 0; i <= n; i++) pts.push(x0 + (i / n) * (x1 - x0), y + (i % 2 ? 6 : -2) + (i === 0 || i === n ? -2 : 0));
      for (let i = n; i >= 0; i--) pts.push(x0 + (i / n) * (x1 - x0) + 4, y + 16 + (i % 2 ? 10 : 4));
      if (p.active) {
        g.poly(pts).fill(0x0a0612).stroke({ width: (3) * EW, color: INK, alpha: EA });
        const pulse = 0.6 + Math.sin(t * 3) * 0.3;
        glow.poly(pts).fill({ color: 0x9ef0ff, alpha: pulse });
        glow.rect(x0 + 10, y - 220, x1 - x0 - 20, 220).fill({ color: 0x9ef0ff, alpha: 0.12 * pulse });
        g.moveTo(p.x, y - 40).lineTo(p.x, y - 16).moveTo(p.x - 8, y - 24).lineTo(p.x, y - 14).lineTo(p.x + 8, y - 24).stroke({ width: 4, color: 0xffffff, alpha: 0.7 + Math.sin(t * 5) * 0.3 });
      } else {
        g.poly(pts).fill(0x2a1a2a).stroke({ width: (3) * EW, color: INK, alpha: EA });
      }
      break;
    }
    case 'grotto':
    case 'grottoExit': {
      const r = 30;
      for (let i = 0; i < 3; i++) {
        const a = t * 2 + (i / 3) * Math.PI * 2;
        g.moveTo(p.x + Math.cos(a) * (r - i * 8), p.y + Math.sin(a) * (r - i * 8)).arc(p.x, p.y, r - i * 8, a, a + 3.5).stroke({ width: 4, color: i % 2 ? 0xff9ae0 : 0x9a6bff });
      }
      g.circle(p.x, p.y, r).stroke({ width: (3) * EW, color: INK, alpha: EA });
      glow.circle(p.x, p.y, r + 12).fill({ color: 0xff5cae, alpha: 0.4 + Math.sin(t * 3) * 0.15 });
      break;
    }
    case 'shopkeeper': {
      // Barnaby the hermit crab behind his counter.
      const x = p.x, y = p.y;
      g.moveTo(x - 30, y + 10).quadraticCurveTo(x - 34, y - 40, x + 4, y - 44).quadraticCurveTo(x + 34, y - 30, x + 26, y + 10).closePath().fill(0xf2a65a).stroke({ width: (3) * EW, color: INK, alpha: EA });
      for (let i = 0; i < 3; i++) g.moveTo(x - 20 + i * 12, y + 6).quadraticCurveTo(x - 14 + i * 12, y - 20, x - 4 + i * 12, y - 34).stroke({ width: 2, color: darken(0xf2a65a, 0.3) });
      g.ellipse(x - 30, y + 2, 12, 9).fill(0xff6a4d).stroke({ width: (2.5) * EW, color: INK, alpha: EA });
      g.circle(x - 36, y - 10, 5).fill(0xffffff).stroke({ width: (2) * EW, color: INK, alpha: EA });
      g.circle(x - 37, y - 10, 2.3).fill(INK);
      g.moveTo(x - 30, y - 50).lineTo(x - 30, y - 90).stroke({ width: (3) * EW, color: INK, alpha: EA });
      g.roundRect(x - 62, y - 118, 64, 30, 6).fill(0xfff0c8).stroke({ width: (3) * EW, color: INK, alpha: EA });
      g.circle(x - 30, y - 103, 8).fill(0xfff0c8).stroke({ width: (2) * EW, color: INK, alpha: EA });
      break;
    }
  }
}

/** Clementine's shots: wobbling blobs of ink with a smeared tail. */
/** Depth features: anemone pads, abyssal currents, the tank's filter intake. */
export function drawFeatures(g: Graphics, glow: Graphics, w: RoomWorld, t: number, view: { x0: number; y0: number; x1: number; y1: number }) {
  const inV = (x: number, y: number, m: number) => x > view.x0 - m && x < view.x1 + m && y > view.y0 - m && y < view.y1 + m;
  const spec = w.spec;
  spec.bouncers?.forEach((b, i) => {
    if (!inV(b.x, b.y, 80)) return;
    const a = w.bounceAnim.get(i) ?? 0;
    const sq = 1 - a * 0.45;
    for (let k = 0; k < 9; k++) {
      const ang = Math.PI + 0.25 + (k / 8) * (Math.PI - 0.5);
      const L = (22 + (k % 2) * 6) * sq;
      g.moveTo(b.x + Math.cos(ang) * 8, b.y - 4).lineTo(b.x + Math.cos(ang) * L, b.y - 4 + Math.sin(ang) * L).stroke({ width: 5, color: k % 2 ? 0xff5cae : 0xffb3e0, cap: 'round' });
    }
    g.ellipse(b.x, b.y - 4, 20, 8 * sq).fill(shade(0xd84a9a)).stroke({ width: 2 * EW, color: INK, alpha: EA });
    glow.ellipse(b.x, b.y - 10, 28, 14).fill({ color: 0xff5cae, alpha: 0.25 + a * 0.4 });
  });
  for (const c of spec.currents ?? []) {
    if (!inV(c.x, c.y, c.len + 40)) continue;
    for (let i = 0; i < 5; i++) {
      const ph = (t * 0.9 + i / 5) % 1;
      const off = (i / 4 - 0.5) * c.w * 1.4;
      const sx = c.x + c.dx * c.len * ph - c.dy * off, sy = c.y + c.dy * c.len * ph + c.dx * off;
      g.moveTo(sx, sy).lineTo(sx + c.dx * 40, sy + c.dy * 40).stroke({ width: 1.6, color: 0x9ef0ff, alpha: 0.4 * Math.sin(ph * Math.PI) });
    }
  }
  if (spec.intake && inV(spec.intake.x, spec.intake.y, 200)) {
    const { x, y } = spec.intake;
    g.roundRect(x - 70, y - 40, 70, 80, 10).fill(shade(0x9aa8b8)).stroke({ width: 3 * EW, color: INK, alpha: EA });
    for (let i = 0; i < 6; i++) g.rect(x - 64, y - 32 + i * 12, 58, 5).fill(0x2a3038);
    g.roundRect(x - 20, y - 400, 20, 360, 6).fill(shade(0xb8c8d8)).stroke({ width: 2 * EW, color: INK, alpha: EA });
    glow.circle(x - 34, y, 50 + Math.sin(t * 8) * 4).fill({ color: 0xdff6ff, alpha: 0.12 });
  }
}

export function drawBubble(g: Graphics, glow: Graphics, b: Bubble, t: number, neon: boolean) {
  let col = b.color;
  if (neon) col = hsl(b.hue + t * 0.8, 1, 0.65);
  const r = b.r;
  if (b.pearl > 0) {
    g.circle(b.x, b.y, r).fill(0xfff6e8).stroke({ width: (2.5) * EW, color: INK, alpha: EA });
    g.circle(b.x - r * 0.35, b.y - r * 0.35, r * 0.3).fill(0xffffff);
    glow.circle(b.x, b.y, r * 2).fill({ color: 0xfff6c0, alpha: 0.5 });
    return;
  }
  const ink = neon ? mixColor(0x140c1e, col, 0.6) : b.ink;
  const alpha = b.ghost ? 0.5 : 0.95;
  const sp = Math.hypot(b.vx, b.vy) || 1;
  const dx = b.vx / sp, dy = b.vy / sp;
  // Tail: ink stretched out behind the blob, thinning and fading.
  for (let i = 6; i >= 1; i--) {
    const k = i / 6;
    g.circle(b.x - dx * r * 0.75 * i, b.y - dy * r * 0.75 * i, r * (1 - k * 0.7)).fill({ color: ink, alpha: alpha * (0.5 - k * 0.3) });
  }
  // Wobbling head of the blob.
  const pts: number[] = [];
  const n = 12;
  const seed = b.id * 1.7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const along = Math.cos(a) * dx + Math.sin(a) * dy;
    const wob = 1 + Math.sin(t * 14 + seed + i * 2.1) * 0.12;
    const rr = r * wob * (along < 0 ? 1 + -along * 0.25 : 1);
    pts.push(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr);
  }
  g.poly(pts).fill({ color: ink, alpha });
  // The item's tint shows as a sheen on the ink.
  g.circle(b.x - dx * r * 0.2, b.y - dy * r * 0.2, r * 0.6).fill({ color: mixColor(ink, col, 0.55), alpha: 0.45 * alpha });
  g.circle(b.x - r * 0.35, b.y - r * 0.4, Math.max(0.8, r * 0.22)).fill({ color: 0xffffff, alpha: 0.45 });
  if (b.flags.has('explosive') && !b.mini) g.circle(b.x + r * 0.3, b.y - r * 0.9, 2).fill(Math.floor(t * 20) % 2 ? 0xffa53d : 0xffffff);
  if (b.syn.has('wisp')) glow.circle(b.x - b.vx * 0.03, b.y - b.vy * 0.03, r * 2.4).fill({ color: 0xc8d8ff, alpha: 0.4 });
  // Ink is dark; only a faint coloured luminescence betrays its effect.
  glow.circle(b.x, b.y, r * 1.6).fill({ color: col, alpha: col === 0xffb347 ? 0.12 : 0.28 });
}

/** A splat of ink stuck to the rock: blob, spatter along the face, drips on walls and ceilings. */
export function drawInkMark(g: Graphics, m: InkMark) {
  let s = m.seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const { x, y, nx, ny, color } = m;
  const r = m.r * 1.9;
  const tx = -ny, ty = nx; // along the surface
  // Main blob, flattened against the surface and pushed slightly into the rock.
  const pts: number[] = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const along = Math.cos(a) * r * (1.5 + rnd() * 0.5);
    const out = Math.sin(a) * r * (0.55 + rnd() * 0.35);
    pts.push(x + tx * along + nx * (out - r * 0.25), y + ty * along + ny * (out - r * 0.25));
  }
  g.poly(pts).fill({ color, alpha: 0.9 });
  g.poly(pts).fill({ color: 0x000000, alpha: 0.15 });
  // Spatter along the face.
  for (let i = 0; i < 7; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    const d = r * (1.6 + rnd() * 1.8);
    const px = x + tx * d * side + nx * (rnd() - 0.6) * r * 0.5;
    const py = y + ty * d * side + ny * (rnd() - 0.6) * r * 0.5;
    g.circle(px, py, r * (0.12 + rnd() * 0.22)).fill({ color, alpha: 0.75 });
  }
  // Drips run down walls and hang from ceilings.
  if (ny > -0.5) {
    for (let i = 0; i < 2 + Math.floor(rnd() * 2); i++) {
      const o = (rnd() - 0.5) * r * 2;
      const sx = x + tx * o, sy = y + ty * o;
      const len = r * (0.8 + rnd() * 1.6);
      const w = r * (0.18 + rnd() * 0.12);
      g.moveTo(sx, sy).lineTo(sx, sy + len).stroke({ width: w, color, alpha: 0.7, cap: 'round' });
      g.circle(sx, sy + len, w * 0.9).fill({ color, alpha: 0.75 });
    }
  }
  // Wet sheen.
  g.ellipse(x + tx * r * 0.3 + nx * r * 0.05, y + ty * r * 0.3 + ny * r * 0.05, r * 0.35, r * 0.12).fill({ color: 0xffffff, alpha: 0.12 });
}

export function drawShot(g: Graphics, glow: Graphics, s: EnemyShot, t: number) {
  const wob = 1 + Math.sin(t * 20 + s.id) * 0.08;
  g.circle(s.x, s.y, s.r * wob).fill(s.color).stroke({ width: (2.2) * EW, color: INK, alpha: EA });
  g.circle(s.x, s.y, s.r * 0.45).fill({ color: 0xffffff, alpha: 0.85 });
  glow.circle(s.x, s.y, s.r * 2).fill({ color: s.color === 0x2a2a38 || s.color === 0x3a3a48 ? 0xff5a3d : s.color, alpha: 0.45 });
}

export function drawWorldExtras(g: Graphics, glow: Graphics, w: RoomWorld, t: number) {
  for (const z of w.zones) {
    const k = 1 - z.age / z.life;
    if (z.kind === 'ink') g.ellipse(z.x, z.y, z.r, z.r * 0.6).fill({ color: 0x1a0a2a, alpha: 0.45 * k });
    else if (z.kind === 'cloud') {
      // Dash ink: dense puffs that billow outwards, drift up and thin away.
      const age = z.age / z.life;
      const grow = 0.55 + Math.sqrt(age) * 0.75;
      const seed = (z.x * 7.3 + z.y * 3.1) | 0;
      for (let i = 0; i < 9; i++) {
        const h = Math.sin((seed + i) * 12.9898) * 43758.5453;
        const fr = h - Math.floor(h);
        const a = (i / 9) * Math.PI * 2 + fr * 1.3;
        const d = (i === 0 ? 0 : 0.35 + fr * 0.35) * z.r * grow;
        const px = z.x + Math.cos(a) * d, py = z.y + Math.sin(a) * d * 0.8 - age * 14;
        const pr = z.r * (0.42 + fr * 0.25) * grow;
        g.circle(px, py, pr * 1.25).fill({ color: 0x24123a, alpha: 0.18 * k });
        g.circle(px, py, pr).fill({ color: 0x14081e, alpha: 0.6 * Math.pow(k, 1.4) });
      }
    }
    else g.circle(z.x, z.y, z.r).fill({ color: 0xffffff, alpha: 0.25 * k });
  }
  for (const b of w.bombs) {
    const blink = b.fuse < 0.6 ? Math.floor(t * 20) % 2 === 0 : Math.floor(t * 6) % 2 === 0;
    g.circle(b.x, b.y, 13).fill(blink ? 0x6a4a9a : 0x3a2a5a).stroke({ width: (3) * EW, color: INK, alpha: EA });
    g.circle(b.x - 4, b.y - 4, 4).fill({ color: 0xffffff, alpha: 0.4 });
    g.moveTo(b.x + 6, b.y - 9).quadraticCurveTo(b.x + 12, b.y - 18, b.x + 5, b.y - 21).stroke({ width: (2.5) * EW, color: INK, alpha: EA });
    glow.circle(b.x + 5, b.y - 21, 7).fill({ color: 0xffa53d, alpha: 0.9 });
  }
  for (const bm of w.beams) {
    const k = 1 - bm.age / bm.dur;
    const x2 = bm.x + bm.dx * bm.len, y2 = bm.y + bm.dy * bm.len;
    const wd = bm.width * (0.6 + 0.4 * Math.sin(t * 40)) * (0.4 + k * 0.6);
    glow.moveTo(bm.x, bm.y).lineTo(x2, y2).stroke({ width: wd * 2.2, color: bm.color, alpha: 0.8 });
    g.moveTo(bm.x, bm.y).lineTo(x2, y2).stroke({ width: (wd + 6) * EW, color: INK, alpha: 0.6 });
    g.moveTo(bm.x, bm.y).lineTo(x2, y2).stroke({ width: wd, color: bm.color });
    g.moveTo(bm.x, bm.y).lineTo(x2, y2).stroke({ width: wd * 0.4, color: 0xffffff });
  }
  for (const h of w.hazards) {
    const warn = h.warning;
    const blink = Math.floor(t * 12) % 2 === 0;
    if (h.kind === 'hline') {
      if (warn) g.moveTo(w.arena.x0, h.y).lineTo(w.arena.x1, h.y).stroke({ width: 4, color: blink ? 0xff3d5a : 0xffffff, alpha: 0.7 });
      else {
        g.moveTo(w.arena.x0, h.y);
        for (let x = w.arena.x0; x <= w.arena.x1; x += 30) g.lineTo(x, h.y + Math.sin(x * 0.05 + t * 20) * 6);
        g.stroke({ width: (h.size + 6) * EW, color: INK, alpha: EA });
        g.moveTo(w.arena.x0, h.y);
        for (let x = w.arena.x0; x <= w.arena.x1; x += 30) g.lineTo(x, h.y + Math.sin(x * 0.05 + t * 20) * 6);
        g.stroke({ width: h.size, color: h.color });
        glow.moveTo(w.arena.x0, h.y).lineTo(w.arena.x1, h.y).stroke({ width: h.size * 2, color: h.color, alpha: 0.5 });
      }
    } else if (h.kind === 'vline') {
      if (warn) g.moveTo(h.x, w.arena.y0).lineTo(h.x, w.arena.y1).stroke({ width: 4, color: blink ? 0xff3d5a : 0xffffff, alpha: 0.7 });
      else {
        g.moveTo(h.x, w.arena.y0).lineTo(h.x, w.arena.y1).stroke({ width: (h.size + 6) * EW, color: INK, alpha: EA });
        g.moveTo(h.x, w.arena.y0).lineTo(h.x, w.arena.y1).stroke({ width: h.size, color: h.color });
      }
    } else {
      // Circle: a shrinking shadow ring, then the strike.
      if (warn) {
        const k = h.age / h.warn;
        g.circle(h.x, h.y, h.size * (1.4 - k * 0.4)).stroke({ width: 4, color: blink ? 0xff3d5a : 0xffffff, alpha: 0.7 });
        g.circle(h.x, h.y, h.size).fill({ color: 0x000000, alpha: 0.15 + k * 0.2 });
      } else {
        g.circle(h.x, h.y, h.size).fill({ color: h.color, alpha: 0.45 });
        glow.circle(h.x, h.y, h.size * 1.2).fill({ color: h.color, alpha: 0.35 });
      }
    }
  }
}
