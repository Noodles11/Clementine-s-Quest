// Procedural comic creatures drawn in profile. Menace changes their look:
// round eyes → slit pupils with glowing irises, smiles → teeth, darker bodies.

import type { Graphics } from 'pixi.js';
import { EA, EW, natural, shade } from './style';
import { darken, desaturate, lighten, mixColor } from '../core/math';
import { INK } from '../ambient/plants';
import { ENEMY_INFO, type Enemy } from '../game/enemies';
import type { Boss } from '../game/bosses';
import { EYELESS } from './mobs';
import { drawReefBoss } from './bossart';

const W = 3; // outline width

function tone(e: Enemy, col: number) {
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

function eye(g: Graphics, x: number, y: number, r: number, lx: number, ly: number, menace: number, angry = false) {
  // Realistic fish eye: dark socket, metallic iris ring, glossy pupil, specular glint.
  const rr = r * 0.78;
  g.circle(x, y, rr * 1.12).fill({ color: 0x0a0d10, alpha: 0.55 });
  const iris = menace >= 0.35 ? 0xb8322a : menace >= 0.2 ? 0xc98a2a : 0xc9b98a;
  g.circle(x, y, rr).fill(shade(iris, 0.8));
  g.circle(x + lx * rr * 0.18, y + ly * rr * 0.18, rr * (angry || menace > 0.3 ? 0.62 : 0.7)).fill(0x040506);
  g.circle(x - rr * 0.32, y - rr * 0.36, Math.max(0.8, rr * 0.22)).fill({ color: 0xffffff, alpha: 0.85 });
}

function mouth(g: Graphics, x: number, y: number, w: number, menace: number, open = 0) {
  const teeth = Math.round(menace * 10);
  if (open < 0.2) {
    g.moveTo(x - w / 2, y).quadraticCurveTo(x, y + w * 0.12, x + w / 2, y).stroke({ width: 1.2, color: 0x0a0d10, alpha: 0.6 });
    return;
  }
  const h = w * (0.2 + open * 0.35);
  g.moveTo(x - w / 2, y).quadraticCurveTo(x, y + h * 2, x + w / 2, y).closePath().fill({ color: 0x1a0608, alpha: 0.85 });
  const n = Math.max(0, teeth);
  for (let i = 0; i < n; i++) {
    const tx = x - w / 2 + ((i + 0.5) / n) * w;
    g.moveTo(tx - w / n / 3, y + 0.5).lineTo(tx, y + 3.5).lineTo(tx + w / n / 3, y + 0.5).fill({ color: 0xe8e4d8, alpha: 0.9 });
  }
}

export { drawEnemy } from './mobs';

export function heart(g: Graphics, x: number, y: number, s: number, col: number) {
  g.moveTo(x, y + s * 0.9)
    .bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.8, y - s * 1.4, x, y - s * 0.5)
    .bezierCurveTo(x + s * 0.8, y - s * 1.4, x + s * 1.6, y - s * 0.2, x, y + s * 0.9)
    .fill(shade(col)).stroke({ width: (2) * EW, color: INK, alpha: EA });
}

export function drawBoss(g: Graphics, b: Boss, t: number) {
  const f = b.facing >= 0 ? 1 : -1;
  const x = b.x + (b.tele > 0 ? Math.sin(t * 50) * b.tele * 3 : 0);
  const y = b.y;
  const m = b.menace;
  if (drawReefBoss(g, b, t)) {
    if (b.frozen > 0) g.circle(b.x, b.y, b.r + 6).stroke({ width: 4, color: 0xcff8ff, alpha: 0.8 });
    return;
  }
  switch (b.bossKind) {
    case 'barnacle': {
      const col = tone(b, 0xb8a58a);
      const squash = b.grounded ? 1 + Math.sin(b.anim * 3) * 0.03 : 0.94;
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        const lx = x + s * (20 + i * 12);
        g.moveTo(lx, y + 20).lineTo(lx + s * 8, y + 36 + Math.sin(b.anim * 8 + i) * 2).stroke({ width: (5) * EW, color: INK, alpha: EA, cap: 'round' });
      }
      g.ellipse(x, y, 52, 40 * squash).fill(shade(col)).stroke({ width: (4) * EW, color: INK, alpha: EA });
      for (const [bx, by, r] of [[-30, -18, 9], [-10, -30, 11], [16, -26, 9], [32, -8, 8], [-38, 4, 7], [4, -10, 6]] as const) {
        g.moveTo(x + bx - r, y + by + r * 0.6).lineTo(x + bx - r * 0.5, y + by - r).lineTo(x + bx + r * 0.5, y + by - r).lineTo(x + bx + r, y + by + r * 0.6).closePath()
          .fill(shade(lighten(col, 0.25))).stroke({ width: (2.5) * EW, color: INK, alpha: EA });
        g.ellipse(x + bx, y + by - r * 0.9, r * 0.45, r * 0.2).fill(INK);
      }
      eye(g, x + f * 12, y + 4, 8, f * 0.5, 0.2, m, b.phase > 1);
      eye(g, x + f * 32, y + 6, 6, f * 0.5, 0.2, m, b.phase > 1);
      break;
    }
    case 'queenclam': {
      const col = tone(b, 0x9ad8e8);
      const qc = b as any;
      const open = qc.open ?? 0;
      g.ellipse(x, y + 8, 60, 24).fill(shade(darken(col, 0.1))).stroke({ width: (4) * EW, color: INK, alpha: EA });
      for (let i = -3; i <= 3; i++) g.moveTo(x + i * 14, y + 26).lineTo(x + i * 10, y + 4).stroke({ width: 2, color: darken(col, 0.3) });
      if (open > 0.05) {
        g.ellipse(x, y, 50, 12 + open * 14).fill(0xff9ac0).stroke({ width: (3) * EW, color: INK, alpha: EA });
        g.circle(x, y - 2, 12).fill(0xfff6e8).stroke({ width: (2.5) * EW, color: INK, alpha: EA });
        g.circle(x - 4, y - 6, 3).fill(0xffffff);
        eye(g, x - 26, y - 4, 6, 0, 0, m);
        eye(g, x + 26, y - 4, 6, 0, 0, m);
      }
      const lift = open * 34;
      g.moveTo(x - 60, y + 4 - lift * 0.2).quadraticCurveTo(x, y - 46 - lift, x + 60, y + 4 - lift * 0.2).lineTo(x - 60, y + 4 - lift * 0.2).closePath()
        .fill(shade(col)).stroke({ width: (4) * EW, color: INK, alpha: EA });
      for (let i = -3; i <= 3; i++) g.moveTo(x + i * 16, y - lift * 0.3).lineTo(x + i * 6, y - 26 - lift * 0.9).stroke({ width: 2, color: darken(col, 0.25) });
      // Crown on the lid.
      const cy = y - 34 - lift * 0.95;
      g.poly([x - 16, cy, x - 16, cy - 12, x - 8, cy - 5, x, cy - 16, x + 8, cy - 5, x + 16, cy - 12, x + 16, cy]).fill(0xffd23d).stroke({ width: (2.5) * EW, color: INK, alpha: EA });
      break;
    }
    case 'kelpie': {
      const col = tone(b, 0x5cd65c);
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI + (i / 8) * Math.PI;
        const sx = x + Math.cos(a) * 34, sy = y + Math.sin(a) * 30;
        g.moveTo(sx, sy);
        for (let s = 1; s <= 6; s++) g.lineTo(sx + Math.cos(a) * s * 9 + Math.sin(t * 3 + i + s) * 8, sy + Math.sin(a) * s * 6 + s * 7);
        g.stroke({ width: (9) * EW, color: INK, alpha: EA, cap: 'round', join: 'round' });
        g.moveTo(sx, sy);
        for (let s = 1; s <= 6; s++) g.lineTo(sx + Math.cos(a) * s * 9 + Math.sin(t * 3 + i + s) * 8, sy + Math.sin(a) * s * 6 + s * 7);
        g.stroke({ width: 5.5, color: darken(col, 0.15), cap: 'round', join: 'round' });
      }
      g.circle(x, y, 40).fill(shade(col)).stroke({ width: (4) * EW, color: INK, alpha: EA });
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
        g.moveTo(x, y).lineTo(x + Math.cos(a) * (36 + spike), y + Math.sin(a) * (36 + spike)).stroke({ width: (6) * EW, color: INK, alpha: EA, cap: 'round' });
        g.moveTo(x, y).lineTo(x + Math.cos(a) * (34 + spike), y + Math.sin(a) * (34 + spike)).stroke({ width: 3, color: lighten(col, 0.25), cap: 'round' });
      }
      g.circle(x, y, 36).fill(shade(darken(col, 0.15))).stroke({ width: (4) * EW, color: INK, alpha: EA });
      // Knight's visor.
      g.roundRect(x - 26, y - 16, 52, 26, 8).fill(0xb8c0d0).stroke({ width: (3) * EW, color: INK, alpha: EA });
      g.rect(x - 22, y - 6, 44, 5).fill(INK);
      g.circle(x - 10, y - 4, 3).fill(0xff3d3d);
      g.circle(x + 10, y - 4, 3).fill(0xff3d3d);
      g.poly([x, y - 16, x - 6, y - 34, x + 6, y - 34]).fill(0xff4d4d).stroke({ width: (2.5) * EW, color: INK, alpha: EA });
      break;
    }
    case 'admiral': {
      const col = tone(b, 0xd9583b);
      const leg = Math.sin(b.anim * 10) * (Math.abs(b.vx) > 10 ? 5 : 0);
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        const lx = x + s * (18 + i * 10);
        g.moveTo(lx, y + 14).lineTo(lx + s * 10, y + 26 + (i % 2 ? leg : -leg)).lineTo(lx + s * 12, y + 36).stroke({ width: (4.5) * EW, color: INK, alpha: EA });
      }
      g.ellipse(x, y + 4, 50, 28).fill(shade(col)).stroke({ width: (4) * EW, color: INK, alpha: EA });
      for (const s of [-1, 1]) {
        const cx = x + s * 58, cy = y - 4 + Math.sin(b.anim * 3 + s) * 3;
        g.circle(cx, cy, 16).fill(shade(lighten(col, 0.1))).stroke({ width: (3.5) * EW, color: INK, alpha: EA });
        g.moveTo(cx, cy).lineTo(cx + s * 18, cy - 10).stroke({ width: (4) * EW, color: INK, alpha: EA });
      }
      eye(g, x + f * 12, y - 6, 8, f * 0.4, 0, Math.max(m, 0.3), true);
      g.circle(x - f * 12, y - 6, 9).fill(INK);
      g.moveTo(x - f * 24, y - 16).lineTo(x + f * 4, y - 2).stroke({ width: (2.5) * EW, color: INK, alpha: EA });
      mouth(g, x, y + 16, 24, Math.max(m, 0.4), 0.3);
      // Bicorne hat with a cannon.
      g.moveTo(x - 46, y - 22).quadraticCurveTo(x, y - 64, x + 46, y - 22).quadraticCurveTo(x, y - 34, x - 46, y - 22).fill(0x1a1a2a).stroke({ width: (3.5) * EW, color: INK, alpha: EA });
      g.circle(x, y - 40, 6).fill(0xffd23d).stroke({ width: (2) * EW, color: INK, alpha: EA });
      g.roundRect(x + f * 6 - (f < 0 ? 38 : 0), y - 62, 38, 14, 6).fill(0x3a3a48).stroke({ width: (3) * EW, color: INK, alpha: EA });
      break;
    }
    case 'treasuremimic': {
      const col = tone(b, 0x9a6b45);
      const open = 0.35 + Math.sin(b.anim * 6) * 0.15 + (b.grounded ? 0 : 0.3);
      g.roundRect(x - 50, y - 8, 100, 46, 8).fill(shade(col)).stroke({ width: (4) * EW, color: INK, alpha: EA });
      g.rect(x - 50, y + 4, 100, 7).fill(0xffd23d).stroke({ width: (2) * EW, color: INK, alpha: EA });
      const lid = y - 8 - open * 38;
      g.moveTo(x - 50, y - 8).lineTo(x - 50, lid).quadraticCurveTo(x, lid - 36, x + 50, lid).lineTo(x + 50, y - 8 - open * 6).closePath()
        .fill(shade(lighten(col, 0.08))).stroke({ width: (4) * EW, color: INK, alpha: EA });
      g.rect(x - 50, lid - 10, 100, 7).fill(0xffd23d);
      g.moveTo(x - 46, y - 8).lineTo(x + 46, y - 8).stroke({ width: 10, color: 0x5a1020 });
      for (let i = 0; i < 9; i++) g.poly([x - 44 + i * 11, y - 10, x - 39 + i * 11, y + 2, x - 34 + i * 11, y - 10]).fill(0xffffff).stroke({ width: (1.5) * EW, color: INK, alpha: EA });
      for (let i = 0; i < 8; i++) g.poly([x - 42 + i * 11, lid + 2, x - 37 + i * 11, lid + 14, x - 32 + i * 11, lid + 2]).fill(0xffffff).stroke({ width: (1.5) * EW, color: INK, alpha: EA });
      g.moveTo(x - 6, y - 4).quadraticCurveTo(x + f * 30, y + 6, x + f * 40, y - 12).stroke({ width: 8, color: 0xff6f8a, cap: 'round' });
      eye(g, x - 18, lid - 16, 8, f * 0.5, 0.3, Math.max(m, 0.4), true);
      eye(g, x + 18, lid - 16, 8, f * 0.5, 0.3, Math.max(m, 0.4), true);
      for (let i = 0; i < 5; i++) g.circle(x - 30 + i * 15, lid - 2 + (i % 2) * 3, 5).fill(0xffd23d).stroke({ width: (1.5) * EW, color: INK, alpha: EA });
      break;
    }
    case 'ringmaster': {
      const col = tone(b, 0xd8622e);
      // Eight arms juggling below the mantle.
      for (let i = 0; i < 8; i++) {
        const a0 = Math.PI * 0.15 + (i / 7) * Math.PI * 0.7;
        g.moveTo(x + Math.cos(a0) * 26, y + 20);
        for (let s2 = 1; s2 <= 6; s2++) g.lineTo(x + Math.cos(a0) * (26 + s2 * 10) + Math.sin(t * 3 + i + s2) * 8, y + 20 + s2 * 9 * Math.sin(a0) + Math.sin(t * 2 + i) * 4);
        g.stroke({ width: 7 - (i % 2), color: darken(col, 0.1), cap: 'round', join: 'round' });
      }
      g.ellipse(x, y - 4, 44, 40).fill(shade(col)).stroke({ width: 4 * EW, color: INK, alpha: EA });
      for (let i = 0; i < 9; i++) g.circle(x - 26 + (i % 3) * 22, y - 22 + Math.floor(i / 3) * 12, 2.4).fill({ color: darken(col, 0.4), alpha: 0.5 });
      eye(g, x - 14, y + 4, 8, f * 0.4, 0.2, Math.max(m, 0.3), b.phase > 1);
      eye(g, x + 14, y + 4, 8, f * 0.4, 0.2, Math.max(m, 0.3), b.phase > 1);
      // Top hat and a big bow tie.
      g.roundRect(x - 24, y - 92, 48, 46, 4).fill(0x1a1a2a).stroke({ width: 3 * EW, color: INK, alpha: EA });
      g.rect(x - 24, y - 60, 48, 8).fill(0xff2d5a);
      g.roundRect(x - 40, y - 50, 80, 8, 4).fill(0x1a1a2a);
      g.poly([x, y + 28, x - 16, y + 20, x - 16, y + 36]).fill(0xff2d5a);
      g.poly([x, y + 28, x + 16, y + 20, x + 16, y + 36]).fill(0xff2d5a);
      break;
    }
    case 'jesters': {
      const jb = b as any;
      for (let i = 0; i < 3; i++) {
        const h = jb.head(i);
        const c = tone(b, [0xff5cae, 0xffe14d, 0x5cf2ff][i]);
        for (let k = 0; k < 4; k++) {
          g.moveTo(h.x - 6 + k * 4, h.y + 10);
          for (let s2 = 1; s2 <= 4; s2++) g.lineTo(h.x - 6 + k * 4 + Math.sin(t * 6 + i + s2) * 4, h.y + 10 + s2 * 7);
          g.stroke({ width: 2, color: lighten(c, 0.2) });
        }
        g.ellipse(h.x, h.y, 22, 18).fill({ color: c, alpha: 0.88 }).stroke({ width: 3 * EW, color: INK, alpha: EA });
        // Jester cap with bells.
        for (const s2 of [-1, 1]) {
          g.poly([h.x, h.y - 14, h.x + s2 * 24, h.y - 30, h.x + s2 * 8, h.y - 12]).fill(darken(c, 0.25)).stroke({ width: 2 * EW, color: INK, alpha: EA });
          g.circle(h.x + s2 * 24, h.y - 30, 4).fill(0xffd23d);
        }
        eye(g, h.x - 7, h.y - 2, 4.5, 0, 0.3, Math.max(m, 0.3), true);
        eye(g, h.x + 7, h.y - 2, 4.5, 0, 0.3, Math.max(m, 0.3), true);
        mouth(g, h.x, h.y + 7, 14, Math.max(m, 0.4), 0.6);
      }
      break;
    }
    case 'motherangler': {
      const col = tone(b, 0x3a3048);
      const lure = { x: x + f * 76, y: y - 64 + Math.sin(t * 1.6) * 6 };
      g.moveTo(x + f * 10, y - 44).quadraticCurveTo(x + f * 50, y - 96, lure.x, lure.y).stroke({ width: 3, color: darken(col, 0.2) });
      g.circle(lure.x, lure.y, 9).fill(0xc8fff0);
      g.poly([x - f * 46, y, x - f * 84, y - 26, x - f * 84, y + 26]).fill(shade(darken(col, 0.1))).stroke({ width: 3 * EW, color: INK, alpha: EA });
      g.circle(x, y, 54).fill(shade(col)).stroke({ width: 4 * EW, color: INK, alpha: EA });
      const open = b.state === 'dark' ? 0.4 + b.tele * 0.6 : 0.35;
      g.poly([x + f * 4, y + 10, x + f * 60, y - 14 - open * 18, x + f * 60, y + 30 + open * 22]).fill(0x14060c);
      for (let i = 0; i < 9; i++) {
        const tx = x + f * (12 + i * 5.4);
        g.poly([tx, y + 2 - i * 1.8, tx + f * 2.4, y + 18, tx + f * 4.8, y + 2 - i * 1.8]).fill(0xe8e4d8);
        g.poly([tx, y + 22 + i * 1.6, tx + f * 2.4, y + 8, tx + f * 4.8, y + 22 + i * 1.6]).fill(0xe8e4d8);
      }
      eye(g, x + f * 12, y - 22, 7, f, 0, Math.max(m, 0.5), true);
      break;
    }
    case 'siphonophore': {
      const sb = b as any;
      const segs: { x: number; y: number }[] = sb.segs;
      for (let i = segs.length - 1; i >= 0; i--) {
        const sg = segs[i];
        const c = tone(b, i % 3 === 0 ? 0xff9ad0 : i % 3 === 1 ? 0xb06bff : 0x9ad8ff);
        const r = 12 - i * 0.35;
        g.moveTo(sg.x, sg.y + r * 0.6);
        for (let s2 = 1; s2 <= 3; s2++) g.lineTo(sg.x + Math.sin(t * 4 + i + s2) * 3, sg.y + r * 0.6 + s2 * 8);
        g.stroke({ width: 1.2, color: lighten(c, 0.2), alpha: 0.7 });
        g.ellipse(sg.x, sg.y, r, r * 0.8).fill({ color: c, alpha: 0.75 }).stroke({ width: 2 * EW, color: INK, alpha: EA });
      }
      const hc = tone(b, 0xff6fa8);
      g.circle(x, y, 26).fill({ color: hc, alpha: 0.9 }).stroke({ width: 3 * EW, color: INK, alpha: EA });
      g.circle(x, y - 6, 10).fill({ color: 0xffffff, alpha: 0.25 });
      eye(g, x - 8, y + 2, 5, 0, 0.3, Math.max(m, 0.5), true);
      eye(g, x + 8, y + 2, 5, 0, 0.3, Math.max(m, 0.5), true);
      break;
    }
    case 'hollowmaw': {
      const hb = b as any;
      const open = hb.open ?? 0.4;
      const col = tone(b, 0x2a1a2a);
      // A crater of flesh in the floor with a ring of teeth.
      g.ellipse(x, y + 20, 120, 46).fill(shade(col)).stroke({ width: 4 * EW, color: INK, alpha: EA });
      g.ellipse(x, y + 14, 92 * (0.6 + open * 0.4), 30 * (0.4 + open * 0.6)).fill(0x050208);
      const n = 18;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rx = 92 * (0.6 + open * 0.4), ry = 30 * (0.4 + open * 0.6);
        const bx = x + Math.cos(a) * rx, by = y + 14 + Math.sin(a) * ry;
        const tx = x + Math.cos(a) * rx * 0.72, ty = y + 14 + Math.sin(a) * ry * 0.6;
        g.poly([bx - Math.sin(a) * 6, by + Math.cos(a) * 3, tx, ty, bx + Math.sin(a) * 6, by - Math.cos(a) * 3]).fill(0xe8e4d8);
      }
      for (let i = 0; i < 5; i++) {
        const ex = x - 80 + i * 40, ey = y - 18 - Math.abs(i - 2) * 6;
        g.circle(ex, ey, 6).fill(0x14060c);
        g.circle(ex, ey, 3.5).fill(0xff3d6a);
      }
      break;
    }
    case 'hand': {
      const col = 0xf0c0a0;
      const reach = (b as any).reach ?? 0;
      // Arm coming down from above the surface.
      g.roundRect(x - 34, y - 400, 68, 360, 30).fill(shade(darken(col, 0.05))).stroke({ width: 3 * EW, color: INK, alpha: EA });
      g.roundRect(x - 40, y - 70, 80, 26, 10).fill(0x4a6ad8); // sleeve cuff
      g.roundRect(x - 50, y - 46, 100, 78, 34).fill(shade(col)).stroke({ width: 4 * EW, color: INK, alpha: EA });
      const fingers = b.state === 'jab' || b.state === 'poke' ? [0, 1] : b.state === 'grab' ? [0.6, 0.6] : [0.3, 0.4];
      for (let i = 0; i < 4; i++) {
        const fx = x - 36 + i * 24;
        const ext = i === 1 ? 34 + fingers[0] * 40 + reach * 20 : 26 + fingers[1] * 16 - Math.abs(i - 1.5) * 4;
        g.roundRect(fx - 10, y + 16, 20, ext, 10).fill(shade(col)).stroke({ width: 3 * EW, color: INK, alpha: EA });
        g.roundRect(fx - 6, y + 12 + ext - 9, 12, 7, 3).fill({ color: 0xffe8e0, alpha: 0.8 }); // nail
      }
      g.roundRect(x + 38, y - 22, 22, 46, 11).fill(shade(col)).stroke({ width: 3 * EW, color: INK, alpha: EA }); // thumb
      // Cartoon bandage and a smiley sticker.
      g.roundRect(x - 2, y + 30, 22, 9, 3).fill(0xe8c890);
      g.circle(x - 26, y - 20, 9).fill(0xffe14d);
      g.circle(x - 29, y - 22, 1.4).fill(INK);
      g.circle(x - 23, y - 22, 1.4).fill(INK);
      g.moveTo(x - 31, y - 17).quadraticCurveTo(x - 26, y - 13, x - 21, y - 17).stroke({ width: 1.4, color: INK });
      break;
    }
  }
  if (b.frozen > 0) g.circle(b.x, b.y, b.r + 6).stroke({ width: 4, color: 0xcff8ff, alpha: 0.8 });
}

/** Telegraph glows for the bloom layer. */
export function drawEnemyGlow(g: Graphics, e: Enemy, t: number) {
  if (e.champion && !e.hidden) g.circle(e.x, e.y, e.r + 12 + Math.sin(t * 5) * 3).fill({ color: e.champion, alpha: 0.35 });
  if (e.tele > 0) g.circle(e.x, e.y, e.r + 10 + e.tele * 10).fill({ color: 0xff3d5a, alpha: 0.25 + e.tele * 0.4 * (0.6 + Math.sin(t * 30) * 0.4) });
  if (e.flash > 0) g.circle(e.x, e.y, e.r + 6).fill({ color: 0xffffff, alpha: e.flash * 4 });
  if (e.burn > 0) g.circle(e.x, e.y - 4, e.r + 4).fill({ color: 0xff7a3d, alpha: 0.35 });
  if (e.frozen > 0) g.circle(e.x, e.y, e.r + 8).fill({ color: 0x9ef0ff, alpha: 0.3 });
  // Bioluminescence.
  switch (e.kind) {
    case 'lanternfish':
      for (let i = 0; i < 8; i++) g.circle(e.x + e.facing * (16 - (0.2 + i * 0.1) * 32), e.y + 3.5, 3.5).fill({ color: 0x6ab8ff, alpha: 0.55 });
      break;
    case 'hatchetfish':
      g.ellipse(e.x, e.y + 8, 7, 3).fill({ color: 0x9ef0ff, alpha: 0.35 });
      break;
    case 'gulper':
      g.circle(e.x - e.facing * 68, e.y + Math.sin(t * 4 + 6) * 9, 7).fill({ color: 0xff5cae, alpha: 0.5 });
      break;
    case 'anglerling':
      g.circle(e.x + e.facing * 20, e.y - 26 + Math.sin(t * 2) * 3, 14).fill({ color: 0x9effd8, alpha: 0.7 });
      break;
    case 'viperfish':
      g.circle(e.x, e.y + 4, 22).fill({ color: 0x5cf2ff, alpha: 0.18 });
      break;
    case 'clownanemone':
      g.circle(e.x, e.y, 26).fill({ color: 0xff5cae, alpha: 0.25 + Math.sin(t * 6) * 0.1 });
      break;
    case 'motherangler':
      g.circle(e.x + e.facing * 76, e.y - 64 + Math.sin(t * 1.6) * 6, 40).fill({ color: 0x9effd8, alpha: 0.8 });
      break;
    case 'siphonophore':
      for (const sg of (e as any).segs) g.circle(sg.x, sg.y, 16).fill({ color: 0xb06bff, alpha: 0.22 });
      break;
    case 'hollowmaw':
      g.circle(e.x, e.y + 14, 90).fill({ color: 0xff3d6a, alpha: 0.12 });
      break;
    case 'giantsquid':
      g.circle(e.x + e.facing * 6, e.y + 18, 22).fill({ color: 0x9ad8f0, alpha: 0.18 });
      break;
  }
  if (e.menace >= 0.35 && !e.hidden && !e.boss && e.kind !== 'ghostshrimp' && !EYELESS.has(e.kind)) {
    g.circle(e.x + e.facing * e.r * 0.4, e.y - e.r * 0.2, 5).fill({ color: 0xff3d3d, alpha: 0.6 });
  }
}
