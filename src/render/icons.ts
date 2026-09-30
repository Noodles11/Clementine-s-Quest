// Item icons, pickups and pedestals (procedural, comic outlined).

import type { Graphics } from 'pixi.js';
import { darken, lighten } from '../core/math';
import { INK } from '../ambient/plants';
import { ITEM_BY_ID } from '../game/items';
import type { PickupKind } from '../game/run';
import { SNACK_COLORS } from '../game/run';
import { heart } from './creatures';

/** Draw an item icon centered at (x, y), roughly 2*s in size. */
export function drawItemIcon(g: Graphics, id: string, x: number, y: number, s = 16, t = 0) {
  const def = ITEM_BY_ID[id];
  const c = def?.color ?? 0xff4d6d;
  const O = { width: 2.5, color: INK, join: 'round' as const, cap: 'round' as const };
  const k = s / 16;
  switch (id) {
    case '__heart_container':
      heart(g, x, y, s * 0.8, 0xff4d6d);
      g.moveTo(x - 4 * k, y - 2 * k).lineTo(x + 4 * k, y - 2 * k).moveTo(x, y - 6 * k).lineTo(x, y + 2 * k).stroke({ width: 2.5, color: 0xffffff });
      break;
    case 'coralcrown':
      g.poly([x - 14 * k, y + 8 * k, x - 14 * k, y - 6 * k, x - 7 * k, y + 1 * k, x, y - 12 * k, x + 7 * k, y + 1 * k, x + 14 * k, y - 6 * k, x + 14 * k, y + 8 * k]).fill(c).stroke(O);
      g.circle(x, y + 2 * k, 3 * k).fill(0xffffff);
      break;
    case 'espresso':
      g.roundRect(x - 10 * k, y - 8 * k, 18 * k, 18 * k, 4 * k).fill(0xffffff).stroke(O);
      g.rect(x - 8 * k, y - 5 * k, 14 * k, 4 * k).fill(c);
      g.circle(x + 11 * k, y + 1 * k, 5 * k).stroke(O);
      for (let i = 0; i < 3; i++) g.moveTo(x - 5 * k + i * 5 * k, y - 11 * k).quadraticCurveTo(x - 2 * k + i * 5 * k, y - 15 * k, x - 5 * k + i * 5 * k, y - 19 * k).stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
      break;
    case 'whalelung':
      g.ellipse(x - 5 * k, y, 8 * k, 12 * k).fill(c).stroke(O);
      g.ellipse(x + 5 * k, y, 8 * k, 12 * k).fill(lighten(c, 0.2)).stroke(O);
      g.moveTo(x, y - 12 * k).lineTo(x, y - 17 * k).stroke(O);
      break;
    case 'pout':
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        g.moveTo(x + Math.cos(a) * 11 * k, y + Math.sin(a) * 11 * k).lineTo(x + Math.cos(a) * 16 * k, y + Math.sin(a) * 16 * k).stroke(O);
      }
      g.circle(x, y, 12 * k).fill(c).stroke(O);
      g.moveTo(x - 6 * k, y - 5 * k).lineTo(x - 1 * k, y - 2 * k).moveTo(x + 6 * k, y - 5 * k).lineTo(x + 1 * k, y - 2 * k).stroke(O);
      g.circle(x, y + 5 * k, 3 * k).fill(INK);
      break;
    case 'seaglass':
      g.poly([x, y - 14 * k, x + 11 * k, y - 2 * k, x + 5 * k, y + 13 * k, x - 7 * k, y + 11 * k, x - 12 * k, y - 3 * k]).fill({ color: c, alpha: 0.9 }).stroke(O);
      g.poly([x - 4 * k, y - 8 * k, x + 2 * k, y - 8 * k, x - 6 * k, y + 2 * k]).fill({ color: 0xffffff, alpha: 0.7 });
      break;
    case 'barnacle':
      for (const [bx, by] of [[-7, 4], [6, 5], [0, -6]]) {
        g.poly([x + (bx - 7) * k, y + (by + 6) * k, x + (bx - 3) * k, y + (by - 6) * k, x + (bx + 3) * k, y + (by - 6) * k, x + (bx + 7) * k, y + (by + 6) * k]).fill(c).stroke(O);
        g.ellipse(x + bx * k, y + (by - 6) * k, 3 * k, 1.4 * k).fill(INK);
      }
      break;
    case 'plankton':
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4;
        const r = (i % 3) * 5 + 3;
        g.circle(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k, (2.5 + (i % 2)) * k).fill(c).stroke({ width: 1.5, color: INK });
      }
      break;
    case 'eeltail':
      g.moveTo(x - 14 * k, y + 8 * k).bezierCurveTo(x - 4 * k, y - 16 * k, x + 4 * k, y + 16 * k, x + 14 * k, y - 8 * k).stroke({ width: 8 * k, color: INK, cap: 'round' });
      g.moveTo(x - 14 * k, y + 8 * k).bezierCurveTo(x - 4 * k, y - 16 * k, x + 4 * k, y + 16 * k, x + 14 * k, y - 8 * k).stroke({ width: 5 * k, color: 0x4a7a5a, cap: 'round' });
      g.poly([x - 2 * k, y - 12 * k, x + 4 * k, y - 3 * k, x, y - 2 * k, x + 5 * k, y + 8 * k, x - 3 * k, y - 4 * k, x + 1 * k, y - 5 * k]).fill(c).stroke({ width: 1.5, color: INK });
      break;
    case 'nautilus': {
      g.circle(x, y, 13 * k).fill(c).stroke(O);
      g.moveTo(x, y);
      for (let i = 0; i < 40; i++) {
        const a = i * 0.35;
        const r = i * 0.3 * k;
        g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.stroke({ width: 2, color: darken(c, 0.4) });
      break;
    }
    case 'mirrorscale':
      g.poly([x, y - 14 * k, x + 12 * k, y, x, y + 14 * k, x - 12 * k, y]).fill(c).stroke(O);
      g.poly([x - 4 * k, y - 6 * k, x + 2 * k, y - 8 * k, x - 6 * k, y + 2 * k]).fill(0xffffff);
      break;
    case 'lure':
      g.moveTo(x - 10 * k, y + 14 * k).quadraticCurveTo(x - 8 * k, y - 12 * k, x + 4 * k, y - 8 * k).stroke(O);
      g.circle(x + 6 * k, y - 4 * k, 7 * k).fill(c).stroke(O);
      g.circle(x + 4 * k, y - 6 * k, 2.5 * k).fill(0xffffff);
      break;
    case 'swordfish':
      g.poly([x - 14 * k, y + 14 * k, x + 14 * k, y - 14 * k, x + 8 * k, y - 6 * k, x - 10 * k, y + 14 * k]).fill(c).stroke(O);
      g.moveTo(x - 10 * k, y + 4 * k).lineTo(x - 4 * k, y + 10 * k).stroke({ width: 4 * k, color: INK });
      break;
    case 'ghostjelly':
      g.moveTo(x - 12 * k, y + 10 * k).lineTo(x - 12 * k, y - 2 * k).quadraticCurveTo(x - 12 * k, y - 14 * k, x, y - 14 * k).quadraticCurveTo(x + 12 * k, y - 14 * k, x + 12 * k, y - 2 * k)
        .lineTo(x + 12 * k, y + 10 * k).lineTo(x + 6 * k, y + 5 * k).lineTo(x, y + 10 * k).lineTo(x - 6 * k, y + 5 * k).closePath().fill({ color: c, alpha: 0.85 }).stroke(O);
      g.circle(x - 4 * k, y - 3 * k, 2.2 * k).fill(INK);
      g.circle(x + 4 * k, y - 3 * k, 2.2 * k).fill(INK);
      break;
    case 'mitosis':
      g.circle(x - 5 * k, y, 9 * k).fill({ color: c, alpha: 0.9 }).stroke(O);
      g.circle(x + 6 * k, y, 9 * k).fill({ color: lighten(c, 0.2), alpha: 0.9 }).stroke(O);
      g.circle(x - 5 * k, y, 3 * k).fill(darken(c, 0.4));
      g.circle(x + 6 * k, y, 3 * k).fill(darken(c, 0.4));
      break;
    case 'frostkelp':
      g.moveTo(x, y + 14 * k).quadraticCurveTo(x - 8 * k, y, x + 2 * k, y - 14 * k).stroke({ width: 5 * k, color: INK, cap: 'round' });
      g.moveTo(x, y + 14 * k).quadraticCurveTo(x - 8 * k, y, x + 2 * k, y - 14 * k).stroke({ width: 3 * k, color: c, cap: 'round' });
      for (const [sx, sy] of [[6, -6], [-6, 4]]) {
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI;
          g.moveTo(x + sx * k - Math.cos(a) * 5 * k, y + sy * k - Math.sin(a) * 5 * k).lineTo(x + sx * k + Math.cos(a) * 5 * k, y + sy * k + Math.sin(a) * 5 * k).stroke({ width: 2, color: 0xffffff });
        }
      }
      break;
    case 'firecoral':
      g.moveTo(x, y + 14 * k).lineTo(x, y - 2 * k).lineTo(x - 8 * k, y - 12 * k).moveTo(x, y + 2 * k).lineTo(x + 9 * k, y - 10 * k).stroke({ width: 7 * k, color: INK, cap: 'round' });
      g.moveTo(x, y + 14 * k).lineTo(x, y - 2 * k).lineTo(x - 8 * k, y - 12 * k).moveTo(x, y + 2 * k).lineTo(x + 9 * k, y - 10 * k).stroke({ width: 4 * k, color: c, cap: 'round' });
      g.circle(x - 8 * k, y - 14 * k, 3 * k).fill(0xffe14d);
      g.circle(x + 9 * k, y - 12 * k, 3 * k).fill(0xffe14d);
      break;
    case 'boomerang':
      g.moveTo(x - 12 * k, y + 8 * k).quadraticCurveTo(x, y - 18 * k, x + 12 * k, y + 8 * k).stroke({ width: 9 * k, color: INK, cap: 'round' });
      g.moveTo(x - 12 * k, y + 8 * k).quadraticCurveTo(x, y - 18 * k, x + 12 * k, y + 8 * k).stroke({ width: 6 * k, color: c, cap: 'round' });
      g.circle(x + 2 * k, y - 4 * k, 1.8 * k).fill(INK);
      break;
    case 'pearldiver':
      g.ellipse(x, y + 6 * k, 14 * k, 7 * k).fill(0x9ad8e8).stroke(O);
      g.circle(x, y - 2 * k, 8 * k).fill(c).stroke(O);
      g.circle(x - 3 * k, y - 5 * k, 2.5 * k).fill(0xffffff);
      break;
    case 'sunbeam':
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + t;
        g.moveTo(x + Math.cos(a) * 9 * k, y + Math.sin(a) * 9 * k).lineTo(x + Math.cos(a) * 15 * k, y + Math.sin(a) * 15 * k).stroke({ width: 3, color: INK, cap: 'round' });
      }
      g.circle(x, y, 9 * k).fill(c).stroke(O);
      break;
    case 'helix':
      for (const ph of [0, Math.PI]) {
        g.moveTo(x - 14 * k, y + Math.sin(ph) * 8 * k);
        for (let i = 1; i <= 14; i++) g.lineTo(x - 14 * k + i * 2 * k, y + Math.sin(i * 0.45 + ph) * 8 * k);
        g.stroke({ width: 3.5 * k, color: ph ? lighten(c, 0.3) : c, cap: 'round' });
      }
      break;
    case 'tripletentacle':
      for (const o of [-7, 0, 7]) {
        g.moveTo(x + o * k, y + 14 * k).quadraticCurveTo(x + (o - 5) * k, y, x + o * 1.6 * k, y - 13 * k).stroke({ width: 6 * k, color: INK, cap: 'round' });
        g.moveTo(x + o * k, y + 14 * k).quadraticCurveTo(x + (o - 5) * k, y, x + o * 1.6 * k, y - 13 * k).stroke({ width: 3.5 * k, color: c, cap: 'round' });
      }
      break;
    case 'starfish': {
      const pts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = (i % 2 ? 6 : 15) * k;
        pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.poly(pts).fill(c).stroke(O);
      break;
    }
    case 'inksac':
      g.moveTo(x, y - 14 * k).quadraticCurveTo(x + 14 * k, y + 2 * k, x, y + 13 * k).quadraticCurveTo(x - 14 * k, y + 2 * k, x, y - 14 * k).fill(c).stroke(O);
      g.circle(x - 3 * k, y + 2 * k, 3 * k).fill({ color: 0xffffff, alpha: 0.4 });
      break;
    case 'sirensong':
      g.circle(x - 6 * k, y + 8 * k, 5 * k).fill(c).stroke(O);
      g.circle(x + 8 * k, y + 5 * k, 5 * k).fill(c).stroke(O);
      g.moveTo(x - 2 * k, y + 8 * k).lineTo(x - 2 * k, y - 12 * k).lineTo(x + 12 * k, y - 15 * k).lineTo(x + 12 * k, y + 5 * k).stroke(O);
      break;
    case 'conch':
      g.moveTo(x - 14 * k, y + 6 * k).lineTo(x + 8 * k, y - 12 * k).quadraticCurveTo(x + 18 * k, y - 4 * k, x + 10 * k, y + 8 * k).closePath().fill(c).stroke(O);
      for (let i = 1; i < 4; i++) g.moveTo(x - 14 * k + i * 6 * k, y + 6 * k - i * 5 * k).lineTo(x - 10 * k + i * 6 * k, y + 8 * k - i * 3 * k).stroke({ width: 1.5, color: darken(c, 0.3) });
      break;
    case 'bubbleshield':
      g.circle(x, y, 14 * k).fill({ color: c, alpha: 0.35 }).stroke({ width: 3, color: 0xffffff });
      g.ellipse(x - 5 * k, y - 5 * k, 4 * k, 2.5 * k).fill(0xffffff);
      break;
    case 'treasuremap':
      g.poly([x - 13 * k, y - 10 * k, x - 4 * k, y - 13 * k, x + 4 * k, y - 10 * k, x + 13 * k, y - 13 * k, x + 13 * k, y + 10 * k, x + 4 * k, y + 13 * k, x - 4 * k, y + 10 * k, x - 13 * k, y + 13 * k]).fill(c).stroke(O);
      g.moveTo(x + 2 * k, y - 2 * k).lineTo(x + 8 * k, y + 4 * k).moveTo(x + 8 * k, y - 2 * k).lineTo(x + 2 * k, y + 4 * k).stroke({ width: 2.5, color: 0xd93b3b });
      g.moveTo(x - 9 * k, y + 6 * k).lineTo(x - 4 * k, y + 2 * k).lineTo(x, y + 3 * k).stroke({ width: 1.5, color: INK });
      break;
    case 'mimicclam':
      g.ellipse(x, y + 5 * k, 14 * k, 7 * k).fill(c).stroke(O);
      g.moveTo(x - 14 * k, y + 3 * k).quadraticCurveTo(x, y - 18 * k, x + 14 * k, y + 3 * k).fill(lighten(c, 0.15)).stroke(O);
      for (let i = 0; i < 4; i++) g.poly([x - 9 * k + i * 6 * k, y + 2 * k, x - 6 * k + i * 6 * k, y + 7 * k, x - 3 * k + i * 6 * k, y + 2 * k]).fill(0xffffff);
      g.circle(x - 4 * k, y - 4 * k, 2 * k).fill(INK);
      g.circle(x + 4 * k, y - 4 * k, 2 * k).fill(INK);
      break;
    case 'glowburst':
      g.poly([x + 2 * k, y - 15 * k, x - 9 * k, y + 2 * k, x - 1 * k, y + 2 * k, x - 3 * k, y + 15 * k, x + 9 * k, y - 3 * k, x + 1 * k, y - 3 * k]).fill(c).stroke(O);
      break;
    default:
      g.circle(x, y, 12 * k).fill(c).stroke(O);
  }
}

export function drawPickup(g: Graphics, kind: PickupKind, x: number, y: number, t: number, opened = false, snack?: string) {
  const O = { width: 2.5, color: INK };
  switch (kind) {
    case 'coin':
    case 'coin5': {
      const big = kind === 'coin5';
      const r = big ? 11 : 9;
      const squash = Math.abs(Math.cos(t * 3));
      g.ellipse(x, y, r * (0.3 + squash * 0.7), r).fill(big ? 0xc0c8d8 : 0xfff0c8).stroke(O);
      // Sand dollar star.
      if (squash > 0.5)
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          g.ellipse(x + Math.cos(a) * r * 0.45 * squash, y + Math.sin(a) * r * 0.45, 1.6, 1.6).fill(big ? 0x6a7288 : 0xc89a5a);
        }
      break;
    }
    case 'key':
      g.circle(x - 6, y, 6).fill(0xffe0f0).stroke(O);
      g.circle(x - 6, y, 2.2).fill(INK);
      g.moveTo(x, y).lineTo(x + 12, y).lineTo(x + 12, y + 5).moveTo(x + 7, y).lineTo(x + 7, y + 4).stroke({ width: 4, color: INK });
      g.moveTo(x, y).lineTo(x + 12, y).lineTo(x + 12, y + 5).moveTo(x + 7, y).lineTo(x + 7, y + 4).stroke({ width: 2, color: 0xffe0f0 });
      break;
    case 'bomb':
      g.circle(x, y + 2, 10).fill(0x3a2a5a).stroke(O);
      g.circle(x - 3, y - 1, 3).fill({ color: 0xffffff, alpha: 0.4 });
      g.moveTo(x + 5, y - 6).quadraticCurveTo(x + 10, y - 14, x + 4, y - 16).stroke({ width: 2.5, color: INK });
      g.circle(x + 4, y - 16, 2.5).fill(0xffa53d);
      break;
    case 'heart':
      heart(g, x, y, 10, 0xff4d6d);
      break;
    case 'halfheart':
      heart(g, x, y, 7, 0xff4d6d);
      break;
    case 'foam':
      heart(g, x, y, 10, 0xd8f4ff);
      g.circle(x - 3, y - 4, 2).fill(0xffffff);
      break;
    case 'container':
      heart(g, x, y, 13, 0xff4d6d);
      g.moveTo(x - 5, y - 2).lineTo(x + 5, y - 2).moveTo(x, y - 7).lineTo(x, y + 3).stroke({ width: 3, color: 0xffffff });
      break;
    case 'snack': {
      const col = snack ? SNACK_COLORS[snack] ?? 0xffffff : 0xffffff;
      g.roundRect(x - 10, y - 6, 20, 12, 6).fill(col).stroke(O);
      g.moveTo(x, y - 6).lineTo(x, y + 6).stroke({ width: 2, color: darken(col, 0.3) });
      g.circle(x - 4, y - 2, 1.6).fill({ color: 0xffffff, alpha: 0.8 });
      break;
    }
    case 'glowjelly':
      g.ellipse(x, y - 2, 9, 8).fill(0xfff27a).stroke(O);
      g.moveTo(x - 4, y + 5).lineTo(x - 5, y + 12).moveTo(x, y + 5).lineTo(x, y + 13).moveTo(x + 4, y + 5).lineTo(x + 5, y + 12).stroke({ width: 2, color: INK });
      g.poly([x + 1, y - 7, x - 3, y, x, y, x - 1, y + 4, x + 3, y - 2, x, y - 2]).fill(INK);
      break;
    case 'clam':
    case 'goldclam': {
      const col = kind === 'goldclam' ? 0xffd23d : 0xd8b8e8;
      g.ellipse(x, y + 5, 17, 8).fill(darken(col, 0.1)).stroke(O);
      if (opened) {
        g.moveTo(x - 17, y + 3).quadraticCurveTo(x - 8, y - 26, x + 12, y - 22).quadraticCurveTo(x, y - 8, x - 17, y + 3).fill(col).stroke(O);
      } else {
        g.moveTo(x - 17, y + 3).quadraticCurveTo(x, y - 18, x + 17, y + 3).closePath().fill(col).stroke(O);
        for (let i = -2; i <= 2; i++) g.moveTo(x + i * 6, y + 1).lineTo(x + i * 3, y - 9).stroke({ width: 1.5, color: darken(col, 0.3) });
        if (kind === 'goldclam') g.rect(x - 3, y - 2, 6, 6).fill(0x8a6a2a).stroke({ width: 1.5, color: INK });
      }
      break;
    }
  }
}

export function drawPedestal(g: Graphics, x: number, y: number, kind: 'rock' | 'shop' | 'grotto') {
  const baseY = y + 26;
  if (kind === 'shop') {
    g.roundRect(x - 22, baseY - 4, 44, 10, 4).fill(0x8a5a32).stroke({ width: 2.5, color: INK });
    return;
  }
  if (kind === 'grotto') {
    g.ellipse(x, baseY + 2, 26, 9).fill(0xff9ae0).stroke({ width: 2.5, color: INK });
    g.moveTo(x - 26, baseY).quadraticCurveTo(x, baseY - 26, x + 26, baseY).stroke({ width: 3, color: INK });
    return;
  }
  // Open clam shell pedestal.
  g.ellipse(x, baseY + 2, 24, 9).fill(0xe8d8f0).stroke({ width: 2.5, color: INK });
  g.moveTo(x - 24, baseY).quadraticCurveTo(x - 20, baseY - 30, x + 2, baseY - 34).quadraticCurveTo(x - 6, baseY - 12, x - 24, baseY)
    .fill(0xd8c0e8).stroke({ width: 2.5, color: INK });
}
