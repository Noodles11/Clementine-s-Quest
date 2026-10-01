// The third-reef bosses, drawn from real animals with the same anatomy toolkit as the creatures.

import type { Graphics } from 'pixi.js';
import { darken, lighten, mixColor } from '../core/math';
import type { Boss } from '../game/bosses';
import { shade } from './style';
import { beadEye, edge, fish, fishEye, strand, strokePath, tint, tone, tubeOutline, type Pt } from './fauna';

const hash = (n: number) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

/** Draws one of the new bosses; returns false for any other kind. */
export function drawReefBoss(g: Graphics, b: Boss, t: number): boolean {
  const f = b.facing >= 0 ? 1 : -1;
  const X = b.x + (b.tele > 0 ? Math.sin(t * 50) * b.tele * 3 : 0);
  const y = b.y;
  const m = b.menace;
  const bb = b as any;
  const beat = b.anim * 5;
  switch (b.bossKind) {
    case 'grouper': {
      // Giant grouper: a heavy mottled body, a cavernous mouth, spiny dorsal fin.
      const back = tone(b, 0x6a5a40), belly = tint(b, 0xc8b890);
      fish(g, X, y, f, {
        L: 128, H: 64, peak: 0.36, nose: 0.75, ped: 0.32, back, belly, fin: darken(back, 0.1), finAlpha: 0.8,
        tailLen: 30, tailH: 54, fork: 0.1, dorsal: [[0.22, 0.5, 16], [0.5, 0.8, 22]], anal: [[0.62, 0.8, 18]],
        pectoral: 26, pelvic: 14, beat, beatAmp: 3, eyeU: 0.15, eyeR: 6.5, eyeV: -0.35, mouthU: 0.22, mouthV: 0.2,
        gape: bb.open ?? 0, menace: Math.max(m, 0.2),
        paint: (P) => {
          for (let i = 0; i < 26; i++) {
            const [sx, sy] = P(0.2 + hash(i + 3) * 0.75, -0.85 + hash(i * 7 + 1) * 1.5);
            g.circle(sx, sy, 3 + hash(i * 5) * 5).fill({ color: darken(back, 0.35), alpha: 0.35 });
          }
          for (let i = 0; i < 18; i++) {
            const [sx, sy] = P(0.08 + hash(i * 11) * 0.3, -0.6 + hash(i * 13) * 1.2);
            g.circle(sx, sy, 1.2).fill({ color: lighten(back, 0.4), alpha: 0.5 });
          }
        },
      });
      return true;
    }
    case 'otter': {
      // Sea otter floating on its back, an urchin on its belly; it rolls over to dive.
      const fur = tone(b, 0x6a4a30), pale = tint(b, 0xd8c0a0);
      const diving = b.state === 'dive';
      const rot = diving ? Math.atan2(b.vy, Math.abs(b.vx) + 1) * f : Math.sin(b.anim * 2) * 0.05;
      const c = Math.cos(rot), s = Math.sin(rot);
      const R = (lx: number, ly: number): Pt => [X + (f * lx) * c - ly * s, y + (f * lx) * s + ly * c];
      const up = diving ? 1 : -1; // belly up while floating
      // Tail and webbed hind feet.
      g.poly([...R(-46, 2), ...R(-74, up * -2 + Math.sin(b.anim * 3) * 3), ...R(-72, up * -8), ...R(-44, -6 * up)]).fill(shade(darken(fur, 0.1)));
      for (const k of [0, 1]) g.poly([...R(-40 + k * 6, up * 10), ...R(-52 + k * 6, up * 24), ...R(-40 + k * 8, up * 22)]).fill(shade(darken(fur, 0.2)));
      // Body.
      const body: number[] = [];
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        body.push(...R(Math.cos(a) * 50 - 4, Math.sin(a) * (18 + Math.cos(a) * 2)));
      }
      g.poly(body).fill(shade(fur)).stroke(edge(fur));
      g.ellipse(...R(4, up * 8), 30, 8).fill({ color: lighten(fur, 0.2), alpha: 0.4 });
      for (let i = 0; i < 20; i++) {
        const [hx, hy] = R(-40 + hash(i) * 80, -14 + hash(i * 3) * 28);
        g.moveTo(hx, hy).lineTo(hx - f * 3, hy + 1).stroke({ width: 0.8, color: darken(fur, 0.35), alpha: 0.5 });
      }
      // Head with a pale face.
      const [hx, hy] = R(52, -2);
      g.circle(hx, hy, 18).fill(shade(fur));
      g.ellipse(...R(58, up * 4), 13, 10).fill(shade(pale, 0.6));
      for (const k of [-1, 1]) g.circle(...R(44 + k * 2, -14 + k * 2), 4).fill(shade(darken(fur, 0.15)));
      g.ellipse(...R(68, up * 4), 3.6, 2.6).fill(0x1a120c);
      for (let i = 0; i < 3; i++) {
        const [wx, wy] = R(64, up * (6 + i * 2));
        strand(g, wx, wy, (f > 0 ? 0 : Math.PI) + rot + (i - 1) * 0.25, 14, 3, () => 0, 0.6, 0xf0e8e0, 0.8, false);
      }
      const [ex, ey] = R(58, up * -4);
      fishEye(g, ex, ey, 3.2, m, f * 0.3, 0, 0x2a1a10);
      // Forepaws clutching an urchin on the belly.
      if (!diving) {
        const [ux, uy] = R(16, -24);
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          g.moveTo(ux, uy).lineTo(ux + Math.cos(a) * 12, uy + Math.sin(a) * 12).stroke({ width: 1.4, color: 0x3a1a4a });
        }
        g.circle(ux, uy, 7).fill(shade(0x5a2a6a));
        for (const k of [-1, 1]) g.ellipse(...R(16 + k * 8, -18), 6, 4).fill(shade(darken(fur, 0.1)));
      }
      return true;
    }
    case 'sawfish': {
      // Sawfish: a flattened shark-like body and a long toothed rostrum.
      const back = tone(b, 0x8a8070), belly = tint(b, 0xe8e0d0);
      const charging = b.state === 'charge';
      const { P } = fish(g, X, y, f, {
        L: 140, H: 34, peak: 0.3, nose: 0.25, ped: 0.2, back, belly, fin: back, finAlpha: 0.9,
        tailLen: 34, tailH: 44, fork: 0.55, dorsal: [[0.33, 0.43, 24], [0.62, 0.7, 18]], anal: [], pectoral: 32, pelvic: 14,
        beat, beatAmp: charging ? 5 : 3, eyeU: 0.12, eyeR: 3.6, eyeV: -0.5, mouthU: 0.12, mouthV: 0.6, scales: false, menace: m,
        paint: (P) => {
          for (let i = 0; i < 5; i++) {
            const a = P(0.16 + i * 0.022, -0.1), c = P(0.165 + i * 0.022, 0.5);
            g.moveTo(a[0], a[1]).lineTo(c[0], c[1]).stroke({ width: 1, color: darken(back, 0.5), alpha: 0.6 });
          }
        },
      });
      // Rostrum with its teeth, sweeping as it charges.
      const sw = charging ? Math.sin(t * 22) * 0.12 : Math.sin(t * 2) * 0.04;
      const [nx, ny] = P(0.01, 0);
      const L = 72;
      const ca = Math.cos(sw), sa = Math.sin(sw);
      const Rp = (lx: number, ly: number): Pt => [nx + f * (lx * ca - ly * sa), ny + lx * sa * f * f + ly * ca];
      g.poly([...Rp(-4, -5), ...Rp(L, -2.5), ...Rp(L + 3, 0), ...Rp(L, 2.5), ...Rp(-4, 5)]).fill(shade(lighten(back, 0.05))).stroke(edge(back));
      for (let i = 0; i < 12; i++) {
        const lx = 8 + i * 5.5;
        for (const sd of [-1, 1]) g.poly([...Rp(lx - 1.2, sd * 2.4), ...Rp(lx, sd * 6.5), ...Rp(lx + 1.2, sd * 2.4)]).fill(tint(b, 0xf0ece0));
      }
      return true;
    }
    case 'mantis': {
      // Peacock mantis shrimp: armoured, rainbow-coloured, with a folded hammer club.
      const green = tone(b, 0x3aa86a), blue = tint(b, 0x3a7ad8), orange = tint(b, 0xff7a3a), red = tint(b, 0xd83a4a);
      const S = 1.45;
      const L = (lx: number, ly: number): Pt => [X + f * lx * S, y + ly * S];
      // Walking legs and swimmerets.
      for (let i = 0; i < 3; i++) {
        const lx = 6 - i * 9;
        const ph = Math.sin(b.anim * 10 + i);
        g.moveTo(...L(lx, 10)).lineTo(...L(lx - 2 + ph * 2, 22)).lineTo(...L(lx - 4 + ph * 3, 27)).stroke({ width: 2.4, color: orange, cap: 'round' });
      }
      // Abdomen: six segments ending in a tail fan.
      for (let i = 5; i >= 0; i--) {
        const lx = -10 - i * 9;
        const h = 15 - i * 0.8;
        const [rx, ry] = L(lx + (f > 0 ? -5 : 6), -h);
        g.roundRect(rx, ry, 11 * S, (h * 2 - 2) * S, 4 * S).fill(shade(i % 2 ? green : mixColor(green, blue, 0.3)));
        g.moveTo(...L(lx - 4, -h + 2)).lineTo(...L(lx - 4, h - 4)).stroke({ width: 1, color: darken(green, 0.45), alpha: 0.6 });
      }
      const fanW = Math.sin(b.anim * 3) * 2;
      for (const d of [-1, 0, 1]) g.poly([...L(-62, 0), ...L(-80, d * 14 - 3 + fanW), ...L(-80, d * 14 + 3 + fanW)]).fill(shade(d === 0 ? blue : orange));
      // Carapace and head.
      const cara = [...L(-12, -16), ...L(14, -17), ...L(26, -10), ...L(28, 2), ...L(14, 10), ...L(-12, 12)];
      g.poly(cara).fill(shade(green)).stroke(edge(green));
      g.moveTo(...L(-4, -16)).lineTo(...L(-4, 10)).stroke({ width: 1, color: darken(green, 0.4), alpha: 0.5 });
      // Antennal scales: orange paddles.
      for (const k of [0, 1]) g.ellipse(...L(32 + k * 4, -14 - k * 4), 7, 3).fill(shade(orange));
      strand(g, ...L(30, -16), f > 0 ? -0.6 : Math.PI + 0.6, 34, 6, (i) => f * Math.sin(t * 2 + i) * 0.05, 1.4, red);
      // Stalked eyes with the mid-band of a mantis shrimp.
      for (const k of [0, 1]) {
        const [sx, sy] = L(24 + k * 5, -20 - k * 2);
        g.moveTo(...L(22 + k * 4, -12)).lineTo(sx, sy).stroke({ width: 3, color: blue, cap: 'round' });
        g.ellipse(sx, sy - 3, 4.5, 3.4).fill(shade(0x2a6a5a));
        g.moveTo(sx - 4, sy - 3).lineTo(sx + 4, sy - 3).stroke({ width: 1.2, color: 0xb8f0d0 });
        beadEye(g, sx + f * 1.2, sy - 4.2, 1.2, m);
      }
      // Raptorial club: folded under the head, flung out on a punch.
      const pk = bb.punch ?? 0;
      const ext = pk > 0 ? 1 : b.tele * 0.3;
      const sh: Pt = L(22, 6), el: Pt = L(18 + ext * 30, 16 - ext * 10), cl: Pt = L(30 + ext * 42, 12 - ext * 14);
      g.moveTo(sh[0], sh[1]).lineTo(el[0], el[1]).stroke({ width: 6, color: red, cap: 'round' });
      g.moveTo(el[0], el[1]).lineTo(cl[0], cl[1]).stroke({ width: 5, color: orange, cap: 'round' });
      g.circle(cl[0], cl[1], 6).fill(shade(tint(b, 0xffc8d0)));
      if (pk > 0.5) g.circle(cl[0] + f * 6, cl[1], 10 * pk).stroke({ width: 2, color: 0xffffff, alpha: pk });
      for (let i = 0; i < 8; i++) g.circle(...L(-6 + hash(i) * 30, -12 + hash(i * 3) * 18), 1.1).fill({ color: lighten(green, 0.4), alpha: 0.5 });
      return true;
    }
    case 'giantsquid': {
      // Giant squid: a long red mantle, the biggest eye in the sea, eight arms and two whip tentacles.
      const skin = tone(b, 0xa84a4a);
      // Lash tentacles reaching out to their targets.
      for (const l of bb.lashes ?? []) {
        const k = Math.min(1, 1.2 - l.t);
        const ex = b.x + (l.x - b.x) * Math.max(0.2, k), ey = b.y + 40 + (l.y - b.y - 40) * Math.max(0.2, k);
        const pts: Pt[] = [];
        for (let i = 0; i <= 12; i++) {
          const u = i / 12;
          pts.push([b.x + (ex - b.x) * u + Math.sin(u * 6 + t * 4) * 10 * (1 - u), b.y + 40 + (ey - b.y - 40) * u]);
        }
        strokePath(g, pts);
        g.stroke({ width: 5, color: darken(skin, 0.1), cap: 'round' });
        g.ellipse(ex, ey, 9, 6).fill(shade(skin));
        for (let i = 0; i < 4; i++) g.circle(ex - 6 + i * 4, ey + 2, 1.4).fill(lighten(skin, 0.4));
      }
      // Hanging arms.
      for (let i = 0; i < 8; i++) {
        const off = (i - 3.5) * 5;
        strand(g, X + off, y + 32, Math.PI / 2 + off * 0.01, 54 + Math.abs(i - 3.5) * -3, 8, (k) => Math.sin(t * 1.8 + i + k * 0.5) * 0.12, 6, darken(skin, 0.08));
      }
      for (const sd of [-1, 1]) {
        const [ex2, ey2] = strand(g, X + sd * 6, y + 32, Math.PI / 2 + sd * 0.2, 90, 12, (k) => Math.sin(t * 1.4 + k * 0.4 + sd) * 0.15, 2.4, darken(skin, 0.08), 1, false);
        g.ellipse(ex2, ey2, 5, 8).fill(shade(skin));
      }
      // Mantle pointing up, fins at its tip.
      const fl = Math.sin(b.anim * 3) * 4;
      for (const sd of [-1, 1]) g.poly([X, y - 72, X + sd * (26 + fl), y - 86, X + sd * 4, y - 100]).fill({ color: lighten(skin, 0.05), alpha: 0.85 });
      const mantle: number[] = [];
      for (let i = 0; i <= 14; i++) {
        const u = i / 14;
        mantle.push(X - 22 * Math.pow(Math.sin((u * Math.PI) / 2 + 0.2), 0.8) * (1 - u * 0.75), y + 10 - u * 102);
      }
      for (let i = 14; i >= 0; i--) {
        const u = i / 14;
        mantle.push(X + 22 * Math.pow(Math.sin((u * Math.PI) / 2 + 0.2), 0.8) * (1 - u * 0.75), y + 10 - u * 102);
      }
      g.poly(mantle).fill(shade(skin)).stroke(edge(skin));
      for (let i = 0; i < 26; i++) g.circle(X + (hash(i) - 0.5) * 30, y - 6 - hash(i * 3) * 86, 0.8 + (0.5 + 0.5 * Math.sin(t * 4 + i)) * 1.6).fill({ color: darken(skin, 0.45), alpha: 0.5 });
      // Head and the huge eye.
      g.ellipse(X, y + 22, 20, 16).fill(shade(skin));
      fishEye(g, X + f * 6, y + 18, 11, Math.max(m, 0.3), f * 0.3, 0, 0x8a9aa8);
      return true;
    }
    case 'frillshark': {
      // Frilled shark: a long eel-like body, ruffled red gill frills, a mouth full of trident teeth.
      const skin = tone(b, 0x4a3a32);
      const segs: { x: number; y: number }[] = bb.segs ?? [];
      const cl: [number, number, number][] = [[b.x, b.y, 18]];
      segs.forEach((s, i) => cl.push([s.x, s.y, 18 - (i / segs.length) * 13]));
      if (cl.length < 3) return true;
      // Tail fin and small rear fins.
      const tl = cl[cl.length - 1], tp = cl[cl.length - 2];
      const ta = Math.atan2(tl[1] - tp[1], tl[0] - tp[0]);
      g.poly([tl[0], tl[1], tl[0] + Math.cos(ta - 0.5) * 30, tl[1] + Math.sin(ta - 0.5) * 30, tl[0] + Math.cos(ta + 0.25) * 20, tl[1] + Math.sin(ta + 0.25) * 20]).fill({ color: darken(skin, 0.1), alpha: 0.85 });
      g.poly(tubeOutline(cl)).fill(shade(skin)).stroke(edge(skin));
      for (let i = 1; i < cl.length - 1; i++) g.circle(cl[i][0], cl[i][1] - cl[i][2] * 0.4, 1).fill({ color: lighten(skin, 0.25), alpha: 0.35 });
      // Head frame.
      const [hx, hy] = [b.x, b.y];
      const n0 = segs[0] ?? { x: hx - 1, y: hy };
      const a = Math.atan2(hy - n0.y, hx - n0.x);
      const ux = Math.cos(a), uy = Math.sin(a);
      let px = -uy, py = ux;
      if (py > 0) {
        px = -px;
        py = -py;
      }
      const H = (u: number, v: number): Pt => [hx + ux * u + px * v, hy + uy * u + py * v];
      // Six frilly gill slits.
      for (let i = 0; i < 6; i++) {
        const pts: Pt[] = [];
        for (let k = 0; k <= 6; k++) {
          const [qx, qy] = H(-6 - i * 4, -14 + k * 4.6);
          pts.push([qx + Math.sin(k * 2 + t * 6) * 1.4, qy]);
        }
        strokePath(g, pts);
        g.stroke({ width: 2, color: tint(b, 0xc83a3a), alpha: 0.85 });
      }
      const open = bb.open ?? 0;
      g.poly([...H(22, 3), ...H(4, -2), ...H(20, -6 - open * 12)]).fill(0x14060a);
      for (let i = 0; i < 6; i++) {
        const [tx, ty] = H(18 - i * 2.6, -3 - open * i * 1.5);
        for (const o of [-1.4, 0, 1.4]) g.moveTo(tx, ty).lineTo(tx + ux * o - px * 2.6, ty + uy * o - py * 2.6).stroke({ width: 0.7, color: 0xf0ece0 });
      }
      const [ex, ey] = H(10, 7);
      fishEye(g, ex, ey, 4.2, Math.max(m, 0.3), ux, uy, 0x5ad88a);
      return true;
    }
    case 'seaspider': {
      // Giant sea spider: a slender segmented trunk carried on eight banded stilt legs.
      const pale = tone(b, 0xd8b890);
      const feet: { x: number; y: number; stab: number }[] = bb.feet ?? [];
      feet.forEach((ft, i) => {
        const side = i < 4 ? -1 : 1;
        const k = i % 4;
        const hx = b.x + side * 14, hy = b.y - 14 + k * 11;
        const mx = (hx + ft.x) / 2, my = Math.min(hy, ft.y) - 70 - k * 8;
        const kx = mx + side * 20;
        // Three segments: coxa up, femur out, tibia down to the foot.
        g.moveTo(hx, hy).lineTo(kx, my).stroke({ width: 4.5, color: darken(pale, 0.08), cap: 'round' });
        g.moveTo(kx, my).lineTo(ft.x, ft.y).stroke({ width: 3.2, color: darken(pale, 0.08), cap: 'round' });
        for (const u of [0.33, 0.66]) g.circle(kx + (ft.x - kx) * u, my + (ft.y - my) * u, 2.6).fill(darken(pale, 0.35));
        g.circle(kx, my, 3.4).fill(shade(pale));
        g.circle(ft.x, ft.y, ft.stab > 0 ? 3.2 : 2.2).fill(darken(pale, 0.5));
      });
      // Trunk with lateral processes, eye tubercle and a long proboscis.
      for (let i = 0; i < 4; i++) g.ellipse(X, y - 14 + i * 11, 18 - i * 1.5, 7).fill(shade(i % 2 ? pale : darken(pale, 0.06))).stroke(edge(pale));
      g.poly([X + f * 14, y - 22, X + f * 58, y - 15, X + f * 58, y - 9, X + f * 14, y - 6]).fill(shade(lighten(pale, 0.05))).stroke(edge(pale));
      g.circle(X + f * 2, y - 26, 7).fill(shade(pale));
      for (const k of [-1, 1]) beadEye(g, X + f * 2 + k * 3.2, y - 29, 1.8, m);
      g.moveTo(X, y + 24).lineTo(X - f * 5, y + 38).stroke({ width: 3, color: pale, cap: 'round' });
      return true;
    }
  }
  return false;
}
