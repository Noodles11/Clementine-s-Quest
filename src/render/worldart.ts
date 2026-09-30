// Doors, props, projectiles, bombs, zones and hazards.

import type { Graphics } from 'pixi.js';
import { EA, EW, shade } from './style';
import { TILE } from '../config';
import { darken, hsl, lighten } from '../core/math';
import { INK } from '../ambient/plants';
import type { RoomWorld } from '../game/room';
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
      const x0 = p.x - p.w / 2, x1 = p.x + p.w / 2, y = p.y;
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
        // Sealed with a glowing "?" rune while the next depth is locked.
        const sealed = w.run.data.depth >= w.run.data.maxDepth;
        if (sealed && w.bossDead) glow.circle(p.x, y + 4, 14).fill({ color: 0xb06bff, alpha: 0.5 + Math.sin(t * 2) * 0.2 });
      }
      break;
    }
    case 'surface': {
      const r = 34 + Math.sin(t * 2) * 3;
      g.circle(p.x, p.y, r).fill({ color: 0xcffaff, alpha: 0.35 }).stroke({ width: 4, color: 0xffffff });
      g.ellipse(p.x - r * 0.4, p.y - r * 0.45, 10, 6).fill({ color: 0xffffff, alpha: 0.85 });
      g.poly([p.x, p.y - 16, p.x - 12, p.y, p.x - 5, p.y, p.x - 5, p.y + 14, p.x + 5, p.y + 14, p.x + 5, p.y, p.x + 12, p.y]).fill(0xffffff).stroke({ width: (2.5) * EW, color: INK, alpha: EA });
      glow.circle(p.x, p.y, r + 10).fill({ color: 0xcffaff, alpha: 0.35 });
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

export function drawBubble(g: Graphics, glow: Graphics, b: Bubble, t: number, neon: boolean) {
  let col = b.color;
  if (neon) col = hsl(b.hue + t * 0.8, 1, 0.65);
  const r = b.r;
  const alpha = b.ghost ? 0.55 : 0.92;
  if (b.pearl > 0) {
    g.circle(b.x, b.y, r).fill(0xfff6e8).stroke({ width: (2.5) * EW, color: INK, alpha: EA });
    g.circle(b.x - r * 0.35, b.y - r * 0.35, r * 0.3).fill(0xffffff);
    glow.circle(b.x, b.y, r * 2).fill({ color: 0xfff6c0, alpha: 0.5 });
    return;
  }
  if (b.flags.has('explosive') && !b.mini) {
    g.circle(b.x, b.y, r).fill(0x3a2a5a).stroke({ width: (2.2) * EW, color: INK, alpha: EA });
    g.circle(b.x + r * 0.3, b.y - r * 0.9, 2).fill(Math.floor(t * 20) % 2 ? 0xffa53d : 0xffffff);
  } else {
    g.circle(b.x, b.y, r).fill({ color: col, alpha }).stroke({ width: (b.mini ? 1.5 : 2.2) * EW, color: INK, alpha: b.ghost ? 0.5 : 1 });
    g.circle(b.x - r * 0.35, b.y - r * 0.35, Math.max(1, r * 0.3)).fill({ color: 0xffffff, alpha: 0.9 });
  }
  if (b.syn.has('wisp')) glow.circle(b.x - b.vx * 0.03, b.y - b.vy * 0.03, r * 2.4).fill({ color: 0xc8d8ff, alpha: 0.4 });
  glow.circle(b.x, b.y, r * 1.8).fill({ color: col, alpha: 0.55 });
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
        glow.moveTo(w.arena.x0, h.y).lineTo(w.arena.x1, h.y).stroke({ width: h.size * 2, color: 0x5cd65c, alpha: 0.5 });
      }
    } else if (h.kind === 'vline') {
      if (warn) g.moveTo(h.x, w.arena.y0).lineTo(h.x, w.arena.y1).stroke({ width: 4, color: blink ? 0xff3d5a : 0xffffff, alpha: 0.7 });
      else {
        g.moveTo(h.x, w.arena.y0).lineTo(h.x, w.arena.y1).stroke({ width: (h.size + 6) * EW, color: INK, alpha: EA });
        g.moveTo(h.x, w.arena.y0).lineTo(h.x, w.arena.y1).stroke({ width: h.size, color: h.color });
      }
    }
  }
}
