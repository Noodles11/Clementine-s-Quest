// Procedural comic creatures drawn in profile. Menace changes their look:
// round eyes → slit pupils with glowing irises, smiles → teeth, darker bodies.

import type { Graphics } from 'pixi.js';
import { darken, desaturate, lighten, mixColor } from '../core/math';
import { INK } from '../ambient/plants';
import { ENEMY_INFO, type Enemy } from '../game/enemies';
import type { Boss } from '../game/bosses';

const W = 3; // outline width

function tone(e: Enemy, col: number) {
  let c = col;
  if (e.boss) c = desaturate(c, 0.45); // drained by the Hollow Maw
  c = desaturate(darken(c, e.menace * 0.35), e.menace * 0.4);
  if (e.frozen > 0) c = mixColor(c, 0x9ef0ff, 0.6);
  if (e.burn > 0) c = mixColor(c, 0xff7a3d, 0.25 + Math.sin(e.anim * 20) * 0.1);
  if (e.flash > 0) c = mixColor(c, 0xffffff, 0.75);
  return c;
}

function eye(g: Graphics, x: number, y: number, r: number, lx: number, ly: number, menace: number, angry = false) {
  g.ellipse(x, y, r, r * 1.1).fill(0xffffff).stroke({ width: 2.2, color: INK });
  const px = x + lx * r * 0.35, py = y + ly * r * 0.35;
  if (menace >= 0.2) {
    g.circle(px, py, r * 0.62).fill(menace >= 0.35 ? 0xff3d3d : 0xffb03d);
    g.ellipse(px, py, r * 0.18, r * 0.55).fill(INK);
  } else {
    g.circle(px, py, r * 0.55).fill(INK);
    g.circle(px - r * 0.2, py - r * 0.25, r * 0.2).fill(0xffffff);
  }
  if (angry || menace >= 0.3) {
    g.moveTo(x - r * 1.1, y - r * 1.25).lineTo(x + r * 1.0, y - r * 0.7).stroke({ width: 3, color: INK, cap: 'round' });
  }
}

function mouth(g: Graphics, x: number, y: number, w: number, menace: number, open = 0) {
  const teeth = Math.round(menace * 12);
  if (teeth < 2 && open < 0.2) {
    g.moveTo(x - w / 2, y).quadraticCurveTo(x, y + w * 0.4, x + w / 2, y).stroke({ width: 2.5, color: INK, cap: 'round' });
    return;
  }
  const h = w * (0.25 + open * 0.4);
  g.moveTo(x - w / 2, y).quadraticCurveTo(x, y + h * 2, x + w / 2, y).closePath().fill(0x5a1020).stroke({ width: 2.2, color: INK });
  const n = Math.max(3, teeth);
  for (let i = 0; i < n; i++) {
    const tx = x - w / 2 + ((i + 0.5) / n) * w;
    g.moveTo(tx - w / n / 2, y + 0.5).lineTo(tx, y + 5).lineTo(tx + w / n / 2, y + 0.5).fill(0xffffff);
  }
}

export function drawEnemy(g: Graphics, e: Enemy, t: number) {
  const f = e.facing >= 0 ? 1 : -1;
  const x = e.x, y = e.y;
  const m = e.menace;
  const info = ENEMY_INFO[e.kind as keyof typeof ENEMY_INFO];
  const base = tone(e, info?.color ?? 0xffffff);
  const shakeX = e.tele > 0 ? Math.sin(t * 60) * e.tele * 2 : 0;
  const X = x + shakeX;
  switch (e.kind) {
    case 'blob': {
      const wob = Math.sin(e.anim * 5) * 2;
      const pts: number[] = [];
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const r = 17 + Math.sin(a * 3 + e.anim * 4) * 1.6 + (m > 0.3 ? (i % 2) * 3 : 0);
        pts.push(X + Math.cos(a) * (r + wob * 0.3), y + Math.sin(a) * (r - wob * 0.5) * 0.9);
      }
      g.poly(pts).fill(base).stroke({ width: W, color: INK, join: 'round' });
      g.ellipse(X - 6 * f, y - 8, 5, 3).fill({ color: 0xffffff, alpha: 0.6 });
      eye(g, X + 4 * f, y - 3, 5, f * 0.6, 0.2, m);
      eye(g, X + 13 * f, y - 2, 4, f * 0.6, 0.2, m);
      mouth(g, X + 8 * f, y + 7, 11, m);
      break;
    }
    case 'jelly': {
      const k = Math.max(0, 1 - e.anim * 3);
      for (let i = 0; i < 3; i++) {
        const bx = X - 6 + i * 6;
        g.moveTo(bx, y + 4);
        for (let s = 1; s <= 4; s++) g.lineTo(bx + Math.sin(t * 6 + i + s) * 3, y + 4 + s * 5);
        g.stroke({ width: 2, color: lighten(base, 0.2) });
      }
      g.ellipse(X, y - 2, 11 * (1 - k * 0.2), 9 * (1 + k * 0.15)).fill({ color: base, alpha: 0.9 }).stroke({ width: 2.5, color: INK });
      g.circle(X - 3, y - 3, 1.8).fill(INK);
      g.circle(X + 3, y - 3, 1.8).fill(m > 0.3 ? 0xff3d3d : INK);
      break;
    }
    case 'crabby':
    case 'cannoncrab': {
      const crouch = e.state === 'crouch' ? e.tele * 5 : 0;
      const leg = Math.sin(e.anim * 14) * (Math.abs(e.vx) > 10 ? 4 : 0);
      for (const s of [-1, 1])
        for (let i = 0; i < 3; i++) {
          const lx = X + s * (8 + i * 6);
          g.moveTo(lx, y + 4).lineTo(lx + s * 6, y + 10 + (i % 2 ? leg : -leg)).lineTo(lx + s * 8, y + 16).stroke({ width: 2.5, color: INK });
        }
      const by = y + crouch;
      g.ellipse(X, by, 20, 12 - crouch * 0.3).fill(base).stroke({ width: W, color: INK });
      g.ellipse(X - 6, by - 5, 6, 3).fill({ color: 0xffffff, alpha: 0.45 });
      // Claws.
      for (const s of [-1, 1]) {
        const cx = X + s * 24, cy = by - 6 + Math.sin(e.anim * 3 + s) * 2;
        g.circle(cx, cy, 7).fill(lighten(base, 0.1)).stroke({ width: 2.5, color: INK });
        g.moveTo(cx, cy).lineTo(cx + s * 8, cy - 4).stroke({ width: 2.5, color: INK });
      }
      for (const s of [-1, 1]) {
        g.moveTo(X + s * 5, by - 10).lineTo(X + s * 6, by - 18).stroke({ width: 2.5, color: INK });
        eye(g, X + s * 6, by - 21, 4, f * 0.5, 0, m, e.kind === 'cannoncrab');
      }
      mouth(g, X, by + 1, 10, m);
      if (e.kind === 'cannoncrab') {
        const cx = X - f * 2, cy = by - 16;
        g.roundRect(cx - 4, cy - 7, 26, 12, 5).fill(0x3a3a48).stroke({ width: 2.5, color: INK });
        g.circle(cx + 22 * (f > 0 ? 1 : 0) - (f < 0 ? 4 : 0), cy - 1, 4).fill(INK);
      }
      break;
    }
    case 'urchin': {
      const spike = 14 + e.tele * 8;
      const n = 16;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.sin(t * 2) * 0.05;
        const len = spike + (i % 2 ? -4 : 0);
        g.moveTo(X, y).lineTo(X + Math.cos(a) * len, y + Math.sin(a) * len).stroke({ width: 4, color: INK, cap: 'round' });
        g.moveTo(X, y).lineTo(X + Math.cos(a) * (len - 2), y + Math.sin(a) * (len - 2)).stroke({ width: 2, color: lighten(base, 0.2), cap: 'round' });
      }
      g.circle(X, y, 12).fill(darken(base, 0.2)).stroke({ width: W, color: INK });
      eye(g, X - 4, y - 1, 3.5, 0, 0.3, m);
      eye(g, X + 4, y - 1, 3.5, 0, 0.3, m);
      break;
    }
    case 'pufferling': {
      const p = (e as any).puff ?? 0;
      const r = 15 + p * 10;
      if (p > 0.1)
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          g.moveTo(X + Math.cos(a) * r, y + Math.sin(a) * r).lineTo(X + Math.cos(a) * (r + 7 * p), y + Math.sin(a) * (r + 7 * p)).stroke({ width: 3, color: INK });
        }
      // Tail.
      g.poly([X - f * r * 0.9, y, X - f * (r + 12), y - 8, X - f * (r + 12), y + 8]).fill(darken(base, 0.1)).stroke({ width: 2.5, color: INK, join: 'round' });
      g.circle(X, y, r).fill(base).stroke({ width: W, color: INK });
      g.ellipse(X, y + r * 0.4, r * 0.7, r * 0.4).fill(lighten(base, 0.35));
      for (let i = 0; i < 5; i++) g.circle(X - f * 4 + (i - 2) * 5, y - r * 0.5 + (i % 2) * 3, 1.6).fill(darken(base, 0.4));
      eye(g, X + f * r * 0.35, y - r * 0.2, 5 + p * 2, f * 0.4, 0, m);
      mouth(g, X + f * r * 0.75, y + r * 0.15, 6 + p * 4, m, p);
      break;
    }
    case 'moray': {
      const mo = e as any;
      const hx = mo.homeX, hy = mo.homeY;
      g.ellipse(hx, hy, 18, 18).fill(0x0a0612).stroke({ width: W, color: INK });
      if (mo.out > 0.05 || e.state === 'peek') {
        const dx = X - hx, dy = y - hy;
        const len = Math.hypot(dx, dy);
        const nx = dx / (len || 1), ny = dy / (len || 1);
        const px = -ny, py = nx;
        const wig = Math.sin(t * 12) * 3;
        g.poly([hx + px * 11, hy + py * 11, X + px * 12 + wig, y + py * 12, X - px * 12 + wig, y - py * 12, hx - px * 11, hy - py * 11])
          .fill(base).stroke({ width: W, color: INK, join: 'round' });
        g.circle(X, y, 15).fill(base).stroke({ width: W, color: INK });
        const open = e.state === 'lunge' ? 1 : 0.3;
        const jx = X + nx * 12, jy = y + ny * 12;
        g.poly([jx - px * 10, jy - py * 10, jx + nx * 10 * open + px * 2, jy + ny * 10 * open + py * 2, jx + px * 10, jy + py * 10]).fill(0x5a1020).stroke({ width: 2, color: INK });
        for (let i = -1; i <= 1; i++) g.circle(jx + px * i * 5 + nx * 3, jy + py * i * 5 + ny * 3, 1.8).fill(0xffffff);
        eye(g, X - px * 6 - nx * 2, y - py * 6 - ny * 2, 4, nx, ny, m, true);
        for (let i = 1; i < 4; i++) g.circle(hx + dx * (i / 4) + px * 4, hy + dy * (i / 4) + py * 4, 2.5).fill(darken(base, 0.3));
      } else {
        g.circle(hx - 4, hy - 2, 2.5).fill(m > 0.2 ? 0xff3d3d : 0xfff27a);
        g.circle(hx + 4, hy - 2, 2.5).fill(m > 0.2 ? 0xff3d3d : 0xfff27a);
      }
      break;
    }
    case 'barracuda': {
      const dashing = e.state === 'dash';
      g.poly([X - f * 22, y, X - f * 34, y - 10, X - f * 32, y, X - f * 34, y + 10]).fill(darken(base, 0.1)).stroke({ width: 2.5, color: INK, join: 'round' });
      g.ellipse(X, y, 26, 9).fill(base).stroke({ width: W, color: INK });
      g.poly([X - f * 4, y - 8, X - f * 12, y - 17, X + f * 4, y - 8]).fill(darken(base, 0.2)).stroke({ width: 2, color: INK });
      g.moveTo(X - f * 20, y + 2).lineTo(X + f * 18, y + 2).stroke({ width: 1.5, color: lighten(base, 0.4) });
      g.poly([X + f * 16, y + 1, X + f * 28, y + 1, X + f * 16, y + 7]).fill(0x5a1020).stroke({ width: 2, color: INK });
      for (let i = 0; i < 4; i++) g.poly([X + f * (17 + i * 3), y + 1, X + f * (18.5 + i * 3), y + 4, X + f * (20 + i * 3), y + 1]).fill(0xffffff);
      eye(g, X + f * 14, y - 3, 3.5, f, 0, Math.max(m, e.state === 'aim' ? 0.4 : 0), true);
      if (dashing) for (let i = 0; i < 3; i++) g.moveTo(X - f * (36 + i * 8), y - 8 + i * 8).lineTo(X - f * (56 + i * 10), y - 8 + i * 8).stroke({ width: 2, color: 0xffffff, alpha: 0.7 });
      break;
    }
    case 'splitter': {
      const s = e.scale;
      const r = 18 * s;
      const pts: number[] = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const rr = r + Math.sin(a * 2 + e.anim * 5) * 2 * s;
        pts.push(X + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.85);
      }
      g.poly(pts).fill({ color: base, alpha: 0.8 }).stroke({ width: W, color: INK, join: 'round' });
      g.circle(X - 3 * s, y + 3 * s, 6 * s).fill({ color: darken(base, 0.4), alpha: 0.6 });
      g.ellipse(X - 7 * s, y - 7 * s, 4 * s, 2.5 * s).fill({ color: 0xffffff, alpha: 0.7 });
      eye(g, X + 4 * f * s, y - 4 * s, 4 * s, f * 0.5, 0, m);
      eye(g, X + 12 * f * s, y - 3 * s, 3 * s, f * 0.5, 0, m);
      break;
    }
    case 'flounder': {
      if (e.hidden) {
        const tr = e.state === 'tremble' ? Math.sin(t * 50) * 2 : 0;
        g.ellipse(X + tr, y + 10, 22, 5).fill({ color: 0xc8a676, alpha: 0.7 });
        g.circle(X - 5 + tr, y + 5, 3).fill(0xffffff).stroke({ width: 1.5, color: INK });
        g.circle(X + 5 + tr, y + 5, 3).fill(0xffffff).stroke({ width: 1.5, color: INK });
        g.circle(X - 5 + tr, y + 5, 1.4).fill(m > 0.2 ? 0xff3d3d : INK);
        g.circle(X + 5 + tr, y + 5, 1.4).fill(m > 0.2 ? 0xff3d3d : INK);
        break;
      }
      g.poly([X - f * 22, y, X - f * 32, y - 8, X - f * 32, y + 8]).fill(darken(base, 0.1)).stroke({ width: 2.5, color: INK, join: 'round' });
      g.ellipse(X, y, 24, 10).fill(base).stroke({ width: W, color: INK });
      for (let i = 0; i < 6; i++) g.circle(X - 12 + i * 5, y + (i % 2 ? 3 : -3), 1.6).fill(darken(base, 0.35));
      eye(g, X + f * 10, y - 6, 3.5, f, -0.5, m);
      eye(g, X + f * 16, y - 7, 3.5, f, -0.5, m);
      mouth(g, X + f * 18, y + 3, 7, m, 0.5);
      break;
    }
    case 'mimic': {
      const awake = e.state !== 'disguised';
      const open = awake ? 0.5 + Math.sin(e.anim * 10) * 0.3 : 0;
      g.roundRect(X - 20, y - 4, 40, 18, 5).fill(darken(base, 0.1)).stroke({ width: W, color: INK });
      const lidY = y - 4 - open * 14;
      g.moveTo(X - 20, y - 4).quadraticCurveTo(X, lidY - 18, X + 20, y - 4 - open * 6).lineTo(X - 20, y - 4).closePath()
        .fill(base).stroke({ width: W, color: INK });
      if (!awake) {
        g.rect(X - 3, y - 8, 6, 8).fill(0xffd23d).stroke({ width: 2, color: INK });
        if (Math.floor(t * 2) % 3 === 0) g.circle(X + 10, y - 12, 2).fill(0xffffff);
      } else {
        g.moveTo(X - 18, y - 3).lineTo(X + 18, y - 3).stroke({ width: 6, color: 0x5a1020 });
        for (let i = 0; i < 6; i++) g.poly([X - 16 + i * 6, y - 4, X - 13 + i * 6, y + 2, X - 10 + i * 6, y - 4]).fill(0xffffff).stroke({ width: 1, color: INK });
        eye(g, X - 7, lidY - 6, 4, f, 0.3, Math.max(m, 0.3), true);
        eye(g, X + 7, lidY - 6, 4, f, 0.3, Math.max(m, 0.3), true);
      }
      break;
    }
    case 'squidling': {
      for (let i = 0; i < 5; i++) {
        const bx = X - 8 + i * 4;
        g.moveTo(bx, y + 8);
        for (let s = 1; s <= 4; s++) g.lineTo(bx + Math.sin(t * 5 + i + s * 0.8) * 3, y + 8 + s * 5);
        g.stroke({ width: 3, color: INK });
        g.moveTo(bx, y + 8);
        for (let s = 1; s <= 4; s++) g.lineTo(bx + Math.sin(t * 5 + i + s * 0.8) * 3, y + 8 + s * 5);
        g.stroke({ width: 1.6, color: lighten(base, 0.2) });
      }
      g.poly([X - 12, y + 8, X - 10, y - 12, X, y - 24, X + 10, y - 12, X + 12, y + 8]).fill(base).stroke({ width: W, color: INK, join: 'round' });
      g.poly([X - 10, y - 12, X - 18, y - 16, X - 10, y - 20]).fill(darken(base, 0.15)).stroke({ width: 2, color: INK });
      g.poly([X + 10, y - 12, X + 18, y - 16, X + 10, y - 20]).fill(darken(base, 0.15)).stroke({ width: 2, color: INK });
      eye(g, X - 4, y - 2, 4, f * 0.6, 0, m);
      eye(g, X + 5, y - 2, 4, f * 0.6, 0, m);
      break;
    }
    default:
      g.circle(X, y, e.r).fill(base).stroke({ width: W, color: INK });
  }
  // Status overlays.
  if (e.frozen > 0) {
    g.roundRect(x - e.r - 4, y - e.r - 4, e.r * 2 + 8, e.r * 2 + 8, 6).fill({ color: 0xcff8ff, alpha: 0.35 }).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
  }
  if (e.charmed > 0) {
    const hy = y - e.r - 14 + Math.sin(t * 5) * 2;
    heart(g, x, hy, 6, 0xff5cae);
  }
  if (e.stun > 0 && !e.boss) {
    for (let i = 0; i < 3; i++) {
      const a = t * 5 + (i / 3) * Math.PI * 2;
      g.circle(x + Math.cos(a) * 14, y - e.r - 8 + Math.sin(a) * 4, 2.5).fill(0xfff27a);
    }
  }
}

export function heart(g: Graphics, x: number, y: number, s: number, col: number) {
  g.moveTo(x, y + s * 0.9)
    .bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.8, y - s * 1.4, x, y - s * 0.5)
    .bezierCurveTo(x + s * 0.8, y - s * 1.4, x + s * 1.6, y - s * 0.2, x, y + s * 0.9)
    .fill(col).stroke({ width: 2, color: INK });
}

export function drawBoss(g: Graphics, b: Boss, t: number) {
  const f = b.facing >= 0 ? 1 : -1;
  const x = b.x + (b.tele > 0 ? Math.sin(t * 50) * b.tele * 3 : 0);
  const y = b.y;
  const m = b.menace;
  switch (b.bossKind) {
    case 'barnacle': {
      const col = tone(b, 0xb8a58a);
      const squash = b.grounded ? 1 + Math.sin(b.anim * 3) * 0.03 : 0.94;
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        const lx = x + s * (20 + i * 12);
        g.moveTo(lx, y + 20).lineTo(lx + s * 8, y + 36 + Math.sin(b.anim * 8 + i) * 2).stroke({ width: 5, color: INK, cap: 'round' });
      }
      g.ellipse(x, y, 52, 40 * squash).fill(col).stroke({ width: 4, color: INK });
      for (const [bx, by, r] of [[-30, -18, 9], [-10, -30, 11], [16, -26, 9], [32, -8, 8], [-38, 4, 7], [4, -10, 6]] as const) {
        g.moveTo(x + bx - r, y + by + r * 0.6).lineTo(x + bx - r * 0.5, y + by - r).lineTo(x + bx + r * 0.5, y + by - r).lineTo(x + bx + r, y + by + r * 0.6).closePath()
          .fill(lighten(col, 0.25)).stroke({ width: 2.5, color: INK });
        g.ellipse(x + bx, y + by - r * 0.9, r * 0.45, r * 0.2).fill(INK);
      }
      eye(g, x + f * 12, y + 4, 8, f * 0.5, 0.2, m, b.phase > 1);
      eye(g, x + f * 32, y + 6, 6, f * 0.5, 0.2, m, b.phase > 1);
      // Mustache.
      g.moveTo(x + f * 22, y + 18).quadraticCurveTo(x + f * 8, y + 26, x + f * 2, y + 16).quadraticCurveTo(x + f * 16, y + 20, x + f * 22, y + 18)
        .fill(0x3a2a20).stroke({ width: 2, color: INK });
      g.moveTo(x + f * 22, y + 18).quadraticCurveTo(x + f * 36, y + 26, x + f * 44, y + 14).quadraticCurveTo(x + f * 30, y + 20, x + f * 22, y + 18)
        .fill(0x3a2a20).stroke({ width: 2, color: INK });
      break;
    }
    case 'queenclam': {
      const col = tone(b, 0x9ad8e8);
      const qc = b as any;
      const open = qc.open ?? 0;
      g.ellipse(x, y + 8, 60, 24).fill(darken(col, 0.1)).stroke({ width: 4, color: INK });
      for (let i = -3; i <= 3; i++) g.moveTo(x + i * 14, y + 26).lineTo(x + i * 10, y + 4).stroke({ width: 2, color: darken(col, 0.3) });
      if (open > 0.05) {
        g.ellipse(x, y, 50, 12 + open * 14).fill(0xff9ac0).stroke({ width: 3, color: INK });
        g.circle(x, y - 2, 12).fill(0xfff6e8).stroke({ width: 2.5, color: INK });
        g.circle(x - 4, y - 6, 3).fill(0xffffff);
        eye(g, x - 26, y - 4, 6, 0, 0, m);
        eye(g, x + 26, y - 4, 6, 0, 0, m);
      }
      const lift = open * 34;
      g.moveTo(x - 60, y + 4 - lift * 0.2).quadraticCurveTo(x, y - 46 - lift, x + 60, y + 4 - lift * 0.2).lineTo(x - 60, y + 4 - lift * 0.2).closePath()
        .fill(col).stroke({ width: 4, color: INK });
      for (let i = -3; i <= 3; i++) g.moveTo(x + i * 16, y - lift * 0.3).lineTo(x + i * 6, y - 26 - lift * 0.9).stroke({ width: 2, color: darken(col, 0.25) });
      // Crown on the lid.
      const cy = y - 34 - lift * 0.95;
      g.poly([x - 16, cy, x - 16, cy - 12, x - 8, cy - 5, x, cy - 16, x + 8, cy - 5, x + 16, cy - 12, x + 16, cy]).fill(0xffd23d).stroke({ width: 2.5, color: INK });
      break;
    }
    case 'kelpie': {
      const col = tone(b, 0x5cd65c);
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI + (i / 8) * Math.PI;
        const sx = x + Math.cos(a) * 34, sy = y + Math.sin(a) * 30;
        g.moveTo(sx, sy);
        for (let s = 1; s <= 6; s++) g.lineTo(sx + Math.cos(a) * s * 9 + Math.sin(t * 3 + i + s) * 8, sy + Math.sin(a) * s * 6 + s * 7);
        g.stroke({ width: 9, color: INK, cap: 'round', join: 'round' });
        g.moveTo(sx, sy);
        for (let s = 1; s <= 6; s++) g.lineTo(sx + Math.cos(a) * s * 9 + Math.sin(t * 3 + i + s) * 8, sy + Math.sin(a) * s * 6 + s * 7);
        g.stroke({ width: 5.5, color: darken(col, 0.15), cap: 'round', join: 'round' });
      }
      g.circle(x, y, 40).fill(col).stroke({ width: 4, color: INK });
      g.ellipse(x - 14, y - 18, 10, 5).fill({ color: 0xffffff, alpha: 0.5 });
      eye(g, x - 13, y - 4, 9, f * 0.4, 0.3, Math.max(m, 0.25), true);
      eye(g, x + 13, y - 4, 9, f * 0.4, 0.3, Math.max(m, 0.25), true);
      mouth(g, x, y + 18, 26, Math.max(m, 0.3), b.phase > 1 ? 0.8 : 0.3);
      break;
    }
    case 'sirurchin': {
      const col = tone(b, 0x7a4dff);
      const n = 24;
      const spike = 20 + b.tele * 14;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + b.anim * 0.8;
        g.moveTo(x, y).lineTo(x + Math.cos(a) * (36 + spike), y + Math.sin(a) * (36 + spike)).stroke({ width: 6, color: INK, cap: 'round' });
        g.moveTo(x, y).lineTo(x + Math.cos(a) * (34 + spike), y + Math.sin(a) * (34 + spike)).stroke({ width: 3, color: lighten(col, 0.25), cap: 'round' });
      }
      g.circle(x, y, 36).fill(darken(col, 0.15)).stroke({ width: 4, color: INK });
      // Knight's visor.
      g.roundRect(x - 26, y - 16, 52, 26, 8).fill(0xb8c0d0).stroke({ width: 3, color: INK });
      g.rect(x - 22, y - 6, 44, 5).fill(INK);
      g.circle(x - 10, y - 4, 3).fill(0xff3d3d);
      g.circle(x + 10, y - 4, 3).fill(0xff3d3d);
      g.poly([x, y - 16, x - 6, y - 34, x + 6, y - 34]).fill(0xff4d4d).stroke({ width: 2.5, color: INK });
      break;
    }
    case 'admiral': {
      const col = tone(b, 0xd9583b);
      const leg = Math.sin(b.anim * 10) * (Math.abs(b.vx) > 10 ? 5 : 0);
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        const lx = x + s * (18 + i * 10);
        g.moveTo(lx, y + 14).lineTo(lx + s * 10, y + 26 + (i % 2 ? leg : -leg)).lineTo(lx + s * 12, y + 36).stroke({ width: 4.5, color: INK });
      }
      g.ellipse(x, y + 4, 50, 28).fill(col).stroke({ width: 4, color: INK });
      for (const s of [-1, 1]) {
        const cx = x + s * 58, cy = y - 4 + Math.sin(b.anim * 3 + s) * 3;
        g.circle(cx, cy, 16).fill(lighten(col, 0.1)).stroke({ width: 3.5, color: INK });
        g.moveTo(cx, cy).lineTo(cx + s * 18, cy - 10).stroke({ width: 4, color: INK });
      }
      eye(g, x + f * 12, y - 6, 8, f * 0.4, 0, Math.max(m, 0.3), true);
      g.circle(x - f * 12, y - 6, 9).fill(INK);
      g.moveTo(x - f * 24, y - 16).lineTo(x + f * 4, y - 2).stroke({ width: 2.5, color: INK });
      mouth(g, x, y + 16, 24, Math.max(m, 0.4), 0.3);
      // Bicorne hat with a cannon.
      g.moveTo(x - 46, y - 22).quadraticCurveTo(x, y - 64, x + 46, y - 22).quadraticCurveTo(x, y - 34, x - 46, y - 22).fill(0x1a1a2a).stroke({ width: 3.5, color: INK });
      g.circle(x, y - 40, 6).fill(0xffd23d).stroke({ width: 2, color: INK });
      g.roundRect(x + f * 6 - (f < 0 ? 38 : 0), y - 62, 38, 14, 6).fill(0x3a3a48).stroke({ width: 3, color: INK });
      break;
    }
    case 'treasuremimic': {
      const col = tone(b, 0x9a6b45);
      const open = 0.35 + Math.sin(b.anim * 6) * 0.15 + (b.grounded ? 0 : 0.3);
      g.roundRect(x - 50, y - 8, 100, 46, 8).fill(col).stroke({ width: 4, color: INK });
      g.rect(x - 50, y + 4, 100, 7).fill(0xffd23d).stroke({ width: 2, color: INK });
      const lid = y - 8 - open * 38;
      g.moveTo(x - 50, y - 8).lineTo(x - 50, lid).quadraticCurveTo(x, lid - 36, x + 50, lid).lineTo(x + 50, y - 8 - open * 6).closePath()
        .fill(lighten(col, 0.08)).stroke({ width: 4, color: INK });
      g.rect(x - 50, lid - 10, 100, 7).fill(0xffd23d);
      g.moveTo(x - 46, y - 8).lineTo(x + 46, y - 8).stroke({ width: 10, color: 0x5a1020 });
      for (let i = 0; i < 9; i++) g.poly([x - 44 + i * 11, y - 10, x - 39 + i * 11, y + 2, x - 34 + i * 11, y - 10]).fill(0xffffff).stroke({ width: 1.5, color: INK });
      for (let i = 0; i < 8; i++) g.poly([x - 42 + i * 11, lid + 2, x - 37 + i * 11, lid + 14, x - 32 + i * 11, lid + 2]).fill(0xffffff).stroke({ width: 1.5, color: INK });
      g.moveTo(x - 6, y - 4).quadraticCurveTo(x + f * 30, y + 6, x + f * 40, y - 12).stroke({ width: 8, color: 0xff6f8a, cap: 'round' });
      eye(g, x - 18, lid - 16, 8, f * 0.5, 0.3, Math.max(m, 0.4), true);
      eye(g, x + 18, lid - 16, 8, f * 0.5, 0.3, Math.max(m, 0.4), true);
      for (let i = 0; i < 5; i++) g.circle(x - 30 + i * 15, lid - 2 + (i % 2) * 3, 5).fill(0xffd23d).stroke({ width: 1.5, color: INK });
      break;
    }
  }
  if (b.frozen > 0) g.circle(b.x, b.y, b.r + 6).stroke({ width: 4, color: 0xcff8ff, alpha: 0.8 });
}

/** Telegraph glows for the bloom layer. */
export function drawEnemyGlow(g: Graphics, e: Enemy, t: number) {
  if (e.tele > 0) g.circle(e.x, e.y, e.r + 10 + e.tele * 10).fill({ color: 0xff3d5a, alpha: 0.25 + e.tele * 0.4 * (0.6 + Math.sin(t * 30) * 0.4) });
  if (e.flash > 0) g.circle(e.x, e.y, e.r + 6).fill({ color: 0xffffff, alpha: e.flash * 4 });
  if (e.burn > 0) g.circle(e.x, e.y - 4, e.r + 4).fill({ color: 0xff7a3d, alpha: 0.35 });
  if (e.frozen > 0) g.circle(e.x, e.y, e.r + 8).fill({ color: 0x9ef0ff, alpha: 0.3 });
  if (e.menace >= 0.35 && !e.hidden) {
    g.circle(e.x + e.facing * e.r * 0.4, e.y - e.r * 0.2, 5).fill({ color: 0xff3d3d, alpha: 0.6 });
  }
}
