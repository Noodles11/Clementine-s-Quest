// Realistic sea creatures, drawn in profile from real anatomy: countershaded
// fish with rayed fins, jointed crustaceans, translucent jellies and salps.
// Menace shows through darker, drained colors and amber-to-red irises.

import type { Graphics } from 'pixi.js';
import { darken, lighten, mixColor } from '../core/math';
import { ENEMY_INFO, type Enemy } from '../game/enemies';
import { gelFill, shade } from './style';
import { beadEye, edge, fish, fishEye, strand, strokePath, tint, tone, tubeOutline, type Pt } from './fauna';
import { heart } from './creatures';

/** Cheap per-creature hash so every individual has its own markings. */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

export function drawEnemy(g: Graphics, e: Enemy, t: number) {
  const f = e.facing >= 0 ? 1 : -1;
  const x = e.x, y = e.y;
  const m = e.menace;
  const info = ENEMY_INFO[e.kind as keyof typeof ENEMY_INFO];
  const base = tone(e, info?.color ?? 0xffffff);
  const shakeX = e.tele > 0 ? Math.sin(t * 60) * e.tele * 2 : 0;
  const X = x + shakeX;
  const spd = Math.hypot(e.vx, e.vy);
  const beat = e.anim * 9;
  const amp = 1 + Math.min(2, spd / 90);
  const id = e.id;
  /** Local coordinates with the creature facing +x. */
  const L = (lx: number, ly: number): Pt => [X + f * lx, y + ly];

  switch (e.kind) {
    case 'blob': {
      // Spanish dancer: a nudibranch that swims by rippling its frilled red mantle.
      const len = 40;
      const top: Pt[] = [], bot: Pt[] = [];
      const N = 18;
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const cy = y + Math.sin(u * Math.PI * 2 - e.anim * 4) * 3;
        const th = 8 * Math.pow(Math.sin(Math.PI * Math.min(0.98, u * 0.92 + 0.04)), 0.55);
        const frill = Math.sin(u * 15 - e.anim * 10) * 1.6 * Math.sin(Math.PI * u);
        const lx = len / 2 - u * len;
        top.push(L(lx, cy - y - th - 3 - frill));
        bot.push(L(lx, cy - y + th + 3 + frill));
      }
      const poly: number[] = [];
      for (const p of top) poly.push(p[0], p[1]);
      for (let i = bot.length - 1; i >= 0; i--) poly.push(bot[i][0], bot[i][1]);
      g.poly(poly).fill(shade(base, 0.9));
      // Pale frilled rim, darker core.
      strokePath(g, top);
      g.stroke({ width: 2, color: tint(e, 0xfff0e8), alpha: 0.8 });
      strokePath(g, bot);
      g.stroke({ width: 2, color: tint(e, 0xfff0e8), alpha: 0.6 });
      const core: number[] = [];
      for (let i = 2; i <= N - 2; i++) {
        const p = top[i], q = bot[i];
        core.push(p[0] + (q[0] - p[0]) * 0.3, p[1] + (q[1] - p[1]) * 0.3);
      }
      for (let i = N - 2; i >= 2; i--) {
        const p = top[i], q = bot[i];
        core.push(p[0] + (q[0] - p[0]) * 0.7, p[1] + (q[1] - p[1]) * 0.7);
      }
      g.poly(core).fill({ color: darken(base, 0.3), alpha: 0.55 });
      for (let i = 0; i < 7; i++) {
        const p = top[3 + i * 2] ?? top[N - 2], q = bot[3 + i * 2] ?? bot[N - 2];
        g.circle(p[0] + (q[0] - p[0]) * (0.25 + hash(id + i) * 0.5), p[1] + (q[1] - p[1]) * (0.25 + hash(id * 3 + i) * 0.5), 1).fill({ color: 0xfff0e8, alpha: 0.5 });
      }
      // Rhinophores in front, gill plume behind.
      const h0 = top[1];
      for (const o of [0, 3]) {
        const [ex, ey] = strand(g, h0[0] - f * o, h0[1] + 2, -Math.PI / 2 + f * 0.35, 7, 3, (i) => Math.sin(t * 2 + i) * 0.1, 2.2, tint(e, 0xe86a50));
        g.circle(ex, ey, 1.4).fill(tint(e, 0xfff0e8));
      }
      const gp = top[N - 3];
      for (let i = 0; i < 6; i++) strand(g, gp[0], gp[1] + 2, -Math.PI / 2 + (i - 2.5) * 0.35, 6 + (i % 2) * 2, 3, (k) => Math.sin(t * 3 + i + k) * 0.15, 1.4, tint(e, 0xffd8c8), 0.85);
      break;
    }
    case 'jelly': {
      // Moon jelly: clear bell, four horseshoe gonads, a fringe of fine tentacles.
      const k = Math.max(0, 1 - e.anim * 3);
      const bw = 12 * (1 - k * 0.18), bh = 8 * (1 + k * 0.2);
      for (let i = 0; i < 9; i++) {
        const bx = X - bw + (i / 8) * bw * 2;
        strand(g, bx, y + 1, Math.PI / 2, 9, 4, (s) => Math.sin(t * 4 + i + s) * 0.25, 0.7, lighten(base, 0.4), 0.55, false);
      }
      for (let i = 0; i < 4; i++) strand(g, X - 3 + i * 2, y + 1, Math.PI / 2 + (i - 1.5) * 0.15, 8, 4, (s) => Math.sin(t * 2.5 + i * 2 + s) * 0.3, 2, lighten(base, 0.2), 0.6);
      g.moveTo(X - bw, y + 1).bezierCurveTo(X - bw, y - bh * 1.3, X + bw, y - bh * 1.3, X + bw, y + 1).quadraticCurveTo(X, y - 1.5, X - bw, y + 1)
        .fill(gelFill(base, lighten(base, 0.5)));
      for (let i = 0; i < 4; i++) {
        const a = Math.PI + 0.45 + i * 0.75;
        g.circle(X + Math.cos(a) * bw * 0.45, y - 2 + Math.sin(a) * bh * 0.35, 1.8).stroke({ width: 1, color: tint(e, 0xd88ab8), alpha: 0.75 });
      }
      g.moveTo(X - bw * 0.7, y - bh * 0.7).quadraticCurveTo(X - bw * 0.2, y - bh * 1.05, X + bw * 0.3, y - bh * 0.9).stroke({ width: 1, color: 0xffffff, alpha: 0.4 });
      break;
    }
    case 'crabby':
    case 'cannoncrab': {
      const crouch = e.state === 'crouch' ? e.tele * 5 : 0;
      const by = y + crouch;
      const moving = Math.abs(e.vx) > 10 && e.state !== 'air';
      const shellC = base, legC = darken(base, 0.15), tipC = darken(base, 0.55);
      // Four jointed walking legs per side.
      for (const s of [-1, 1])
        for (let i = 0; i < 4; i++) {
          const ph = e.anim * 14 + i * 1.6 + (s > 0 ? Math.PI : 0);
          const lift = moving ? Math.max(0, Math.cos(ph)) * 3 : 0;
          const root: Pt = [X + s * (9 + i * 3.5), by + 3];
          const knee: Pt = [root[0] + s * (9 + i * 1.5), by - 6 + i * 1.5 - lift];
          const foot: Pt = [knee[0] + s * (4 + i) + (moving ? Math.sin(ph) * 3 : 0), y + 15 - lift];
          g.moveTo(root[0], root[1]).lineTo(knee[0], knee[1]).stroke({ width: 3.6, color: legC, cap: 'round' });
          g.moveTo(knee[0], knee[1]).lineTo(foot[0], foot[1]).stroke({ width: 2.6, color: legC, cap: 'round' });
          const mid: Pt = [knee[0] + (foot[0] - knee[0]) * 0.75, knee[1] + (foot[1] - knee[1]) * 0.75];
          g.moveTo(mid[0], mid[1]).lineTo(foot[0], foot[1]).stroke({ width: 1.8, color: tipC, cap: 'round' });
          g.circle(knee[0], knee[1], 1.6).fill(darken(legC, 0.2));
        }
      // Carapace: a broad dome with toothed front-side margins.
      const pts: number[] = [];
      for (let i = 0; i <= 24; i++) {
        const a = Math.PI + (i / 24) * Math.PI;
        const side = Math.abs(Math.cos(a));
        const tooth = side > 0.45 && side < 0.95 && i % 2 === 0 ? 2 : 0;
        pts.push(X + Math.cos(a) * (21 + tooth), by + 3 + Math.sin(a) * (13 + tooth * 0.5));
      }
      pts.push(X + 17, by + 7, X, by + 9, X - 17, by + 7);
      g.poly(pts).fill(shade(shellC, 1)).stroke(edge(shellC));
      // Regions of the shell and granules.
      g.moveTo(X - 8, by - 8).quadraticCurveTo(X, by - 2, X + 8, by - 8).stroke({ width: 1, color: darken(shellC, 0.4), alpha: 0.45 });
      for (let i = 0; i < 14; i++) g.circle(X + (hash(id + i) - 0.5) * 32, by - 6 + hash(id * 7 + i) * 10, 0.9).fill({ color: lighten(shellC, 0.4), alpha: 0.4 });
      g.ellipse(X - 6, by - 4, 7, 3).fill({ color: 0xffffff, alpha: 0.18 });
      // Mouthparts.
      g.roundRect(X - 4, by + 2, 8, 5, 1.5).fill(darken(shellC, 0.35));
      g.moveTo(X, by + 2).lineTo(X, by + 7).stroke({ width: 0.8, color: darken(shellC, 0.6) });
      // Stalked eyes in their sockets.
      for (const s of [-1, 1]) {
        g.moveTo(X + s * 4, by - 8).lineTo(X + s * 5, by - 11.5).stroke({ width: 2, color: legC, cap: 'round' });
        beadEye(g, X + s * 5.2, by - 12, 1.9, m);
      }
      // Chelipeds: a short arm, a swollen palm, and dark-tipped pincers pointing inwards.
      for (const sd of [-1, 1]) {
        const snap = Math.max(0, Math.sin(e.anim * 3 + sd)) * 0.6 + (e.tele > 0 ? e.tele * 0.6 : 0);
        const bob = Math.sin(e.anim * 2 + sd) * 1.2;
        const pc: Pt = [X + sd * 22, by + 9 + bob];
        g.moveTo(X + sd * 14, by + 4).lineTo(pc[0] + sd * 4, pc[1] - 2).stroke({ width: 4.4, color: legC, cap: 'round' });
        const inner = pc[0] - sd * 5;
        const ft: Pt = [X + sd * 6.5, pc[1] + 3];
        g.poly([inner, pc[1] + 0.5, X + sd * 11, pc[1] + 4.6, ft[0], ft[1], X + sd * 11, pc[1] + 2, inner, pc[1] + 3.8]).fill(shade(shellC, 0.6));
        const dtp: Pt = [X + sd * (7 + snap * 2), pc[1] - 1.5 - snap * 6];
        g.poly([inner, pc[1] - 4.2, X + sd * 11, pc[1] - 5 - snap * 4, dtp[0], dtp[1], X + sd * 11, pc[1] - 2.2 - snap * 3, inner, pc[1] - 0.5]).fill(shade(shellC, 0.6));
        g.circle(ft[0] + sd * 1.2, ft[1] - 0.4, 1.2).fill(tipC);
        g.circle(dtp[0] + sd * 1.2, dtp[1] + 0.3, 1.2).fill(tipC);
        g.ellipse(pc[0], pc[1], 6.5, 4.8).fill(shade(lighten(shellC, 0.06))).stroke(edge(shellC));
        g.ellipse(pc[0] - 1, pc[1] - 1.8, 3, 1.3).fill({ color: 0xffffff, alpha: 0.25 });
      }
      if (e.kind === 'cannoncrab') {
        // An old iron cannon lashed to its back.
        const cx = X - f * 6, cy = by - 16;
        const poly = [cx - f * 3, cy - 6, cx + f * 22, cy - 4.5, cx + f * 22, cy + 4.5, cx - f * 3, cy + 6];
        g.poly(poly).fill(shade(0x3a3a44)).stroke(edge(0x3a3a44));
        g.circle(cx - f * 4.5, cy, 2.6).fill(shade(0x34343e));
        for (const k of [5, 12]) g.rect(cx + f * k - 1, cy - 5.6, 2.4, 11.2).fill(0x24242c);
        g.ellipse(cx + f * 22, cy, 2, 4.8).fill(0x2a2a32);
        g.ellipse(cx + f * 22.4, cy, 1.2, 3).fill(0x050506);
        for (let i = 0; i < 4; i++) g.circle(cx + f * (2 + hash(id + i) * 18), cy - 3 + hash(id * 5 + i) * 6, 1.4).fill({ color: 0x8a4a2a, alpha: 0.6 });
        g.moveTo(cx + f * 2, cy + 5).lineTo(X - 10, by - 6).moveTo(cx + f * 14, cy + 5).lineTo(X + 10, by - 6).stroke({ width: 1, color: 0x6a5a3a, alpha: 0.8 });
      }
      break;
    }
    case 'urchin': {
      // Long-spined urchin: a dark test bristling with tapering spines, tube feet below.
      const n = 34;
      const ext = e.tele * 7;
      const spineC = darken(base, 0.45);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.sin(t * 1.5 + i) * 0.03;
        const len = 20 + hash(id + i) * 12 + ext;
        const ex = X + Math.cos(a) * len, ey = y + Math.sin(a) * len;
        g.moveTo(X + Math.cos(a) * 8, y + Math.sin(a) * 8).lineTo(ex, ey).stroke({ width: 1.7, color: spineC, cap: 'round' });
        g.moveTo(X + Math.cos(a) * 9, y + Math.sin(a) * 9).lineTo(X + Math.cos(a) * len * 0.7, y + Math.sin(a) * len * 0.7).stroke({ width: 0.8, color: lighten(base, 0.15), alpha: 0.6 });
      }
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * 0.15 + (i / 5) * Math.PI * 0.7;
        strand(g, X + Math.cos(a) * 10, y + Math.sin(a) * 10, a, 6, 3, (k) => Math.sin(t * 2 + i + k) * 0.2, 1, lighten(base, 0.35), 0.6, false);
      }
      g.circle(X, y, 11).fill(shade(darken(base, 0.25)));
      for (let r = 0; r < 5; r++) {
        const a = (r / 5) * Math.PI * 2 - Math.PI / 2;
        for (let k = 1; k <= 3; k++) g.circle(X + Math.cos(a) * k * 3, y + Math.sin(a) * k * 3, 0.9).fill({ color: lighten(base, 0.3), alpha: 0.45 });
      }
      g.circle(X, y, 11).stroke(edge(base));
      g.circle(X - 3, y - 4, 3).fill({ color: 0xffffff, alpha: 0.12 });
      break;
    }
    case 'pufferling': {
      const p = (e as any).puff ?? 0;
      const back = base, belly = tint(e, 0xf2ece0);
      if (p < 0.12) {
        fish(g, X, y, f, {
          L: 32, H: 22, peak: 0.42, nose: 0.9, ped: 0.22, back, belly,
          fin: lighten(back, 0.1), finAlpha: 0.55, tailLen: 9, tailH: 14, fork: 0.1,
          dorsal: [[0.72, 0.84, 6]], anal: [[0.72, 0.84, 6]], pectoral: 6,
          beat, beatAmp: amp, eyeU: 0.22, eyeR: 3.6, eyeV: -0.35, mouthU: 0.05, mouthV: 0.05, scales: false, lateral: false, menace: m,
          paint: (P) => {
            for (let i = 0; i < 14; i++) {
              const [sx, sy] = P(0.25 + hash(id + i) * 0.65, -0.9 + hash(id * 3 + i) * 0.85);
              g.circle(sx, sy, 1.1).fill({ color: darken(back, 0.55), alpha: 0.7 });
            }
          },
        });
        break;
      }
      // Inflated: a prickly ball, the fins still fanning.
      const r = 15 + p * 10;
      g.poly([X - f * r * 0.85, y, X - f * (r + 9), y - 6 + Math.sin(beat) * 2, X - f * (r + 9), y + 6 + Math.sin(beat) * 2]).fill({ color: lighten(back, 0.1), alpha: 0.6 });
      g.circle(X, y, r).fill(shade(back));
      g.ellipse(X, y + r * 0.35, r * 0.85, r * 0.6).fill({ color: belly, alpha: 0.75 });
      for (let i = 0; i < 22; i++) {
        const a = hash(id + i) * Math.PI * 2;
        const rr = r * (0.55 + hash(id * 9 + i) * 0.4);
        const sx = X + Math.cos(a) * rr, sy = y + Math.sin(a) * rr;
        g.moveTo(sx, sy).lineTo(sx + Math.cos(a) * 3 * p, sy + Math.sin(a) * 3 * p).stroke({ width: 1, color: darken(back, 0.45), alpha: 0.8 });
      }
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        g.moveTo(X + Math.cos(a) * r, y + Math.sin(a) * r).lineTo(X + Math.cos(a) * (r + 4 * p), y + Math.sin(a) * (r + 4 * p)).stroke({ width: 1.2, color: darken(back, 0.35) });
      }
      g.circle(X, y, r).stroke(edge(back));
      g.ellipse(X + f * (r * 0.1), y - r * 0.15, 4, 2.5 + Math.sin(beat * 2) * 1.5).fill({ color: lighten(back, 0.2), alpha: 0.6 });
      fishEye(g, X + f * r * 0.5, y - r * 0.3, 3.4 + p, m, f * 0.5, 0);
      g.ellipse(X + f * r * 0.95, y + r * 0.05, 2.6, 2).fill(tint(e, 0xe8e0c8));
      g.moveTo(X + f * (r * 0.95 + 2.6), y + r * 0.05).lineTo(X + f * r * 0.8, y + r * 0.05).stroke({ width: 0.8, color: 0x2a2018 });
      break;
    }
    case 'moray': {
      const mo = e as any;
      const hx = mo.homeX, hy = mo.homeY;
      // The burrow: a dark crevice in the rock.
      g.ellipse(hx, hy, 22, 19).fill({ color: 0x05030a, alpha: 0.45 });
      g.ellipse(hx, hy, 17, 15).fill(0x05030a);
      if (mo.out > 0.05 || e.state === 'peek') {
        const dx = X - hx, dy = y - hy;
        const len = Math.hypot(dx, dy) || 1;
        const nx = dx / len, ny = dy / len;
        // Perpendicular pointing up-screen, so the eye sits on top.
        let px = -ny, py = nx;
        if (py > 0) {
          px = -px;
          py = -py;
        }
        const spots = darken(base, 0.5);
        const cl: [number, number, number][] = [];
        for (let i = 0; i <= 10; i++) {
          const k = i / 10;
          const wv = Math.sin(k * Math.PI * 1.5 - t * 3) * 5 * k * (1 - k);
          cl.push([hx + dx * k + px * wv, hy + dy * k + py * wv, 9 - k * 1.2]);
        }
        g.poly(tubeOutline(cl)).fill(shade(base)).stroke(edge(base));
        // Dorsal fin ridge along the back.
        const ridge: Pt[] = cl.map(([cx, cy, w]) => [cx + px * (w + 1.5), cy + py * (w + 1.5)]);
        strokePath(g, ridge);
        g.stroke({ width: 2, color: darken(base, 0.2), alpha: 0.7 });
        for (let i = 0; i < 16; i++) {
          const c = cl[1 + Math.floor(hash(id + i) * 9)];
          const o = (hash(id * 5 + i) - 0.5) * 14;
          g.circle(c[0] + px * o, c[1] + py * o, 1.4 + hash(id * 11 + i)).fill({ color: spots, alpha: 0.55 });
        }
        // Head: long snout, gaping to breathe, wide when it lunges.
        const H = (a: number, b: number): Pt => [X + nx * a + px * b, y + ny * a + py * b];
        const head: number[] = [];
        for (const [a, b] of [[-6, 9.5], [4, 9.2], [12, 7.5], [18, 5], [22.5, 2], [23.5, -0.5], [20, -3.5], [12, -6.5], [3, -8.5], [-6, -9.5]] as const) head.push(...H(a, b));
        g.poly(head).fill(shade(base)).stroke(edge(base));
        const open = e.state === 'lunge' ? 1 : 0.2 + Math.sin(t * 2.5) * 0.15;
        const jaw = [...H(23, -0.5), ...H(5, -1.5), ...H(20, -1.5 - open * 9)];
        g.poly(jaw).fill(0x3a0c14);
        for (let i = 0; i < 4; i++) {
          const [tx, ty] = H(20 - i * 3.5, -0.8);
          const [bx, by2] = H(19.5 - i * 3.5, -0.8 - 2.2 * (0.4 + open));
          g.moveTo(tx, ty).lineTo(bx, by2).stroke({ width: 0.9, color: 0xe8e4d8 });
        }
        const [nx0, ny0] = H(21, 2.2);
        g.moveTo(nx0, ny0).lineTo(nx0 + nx * 3 + px * 2, ny0 + ny * 3 + py * 2).stroke({ width: 1.2, color: darken(base, 0.3) });
        const [ex, ey] = H(15, 4);
        fishEye(g, ex, ey, 2.1, Math.max(m, 0.2), nx, ny);
        g.moveTo(...H(4, 8)).quadraticCurveTo(...H(1, 0), ...H(4, -7)).stroke({ width: 1, color: darken(base, 0.45), alpha: 0.5 });
      } else {
        g.circle(hx - 4, hy - 2, 1.8).fill(m > 0.2 ? 0xc83d2a : 0xc8b070);
        g.circle(hx + 4, hy - 2, 1.8).fill(m > 0.2 ? 0xc83d2a : 0xc8b070);
      }
      break;
    }
    case 'barracuda': {
      const dashing = e.state === 'dash';
      const aim = e.state === 'aim';
      const back = mixColor(base, 0x3a5060, 0.3), belly = tint(e, 0xe8eef2);
      fish(g, X, y, f, {
        L: 58, H: 12, peak: 0.45, nose: 0.05, ped: 0.18, back, belly,
        fin: darken(back, 0.15), tailLen: 14, tailH: 17, fork: 0.85,
        dorsal: [[0.36, 0.46, 8], [0.72, 0.8, 6]], anal: [[0.73, 0.81, 6]], pectoral: 7, pelvic: 4,
        beat, beatAmp: dashing ? 3 : amp, eyeU: 0.14, eyeR: 3, eyeV: -0.25, mouthU: 0.15, mouthV: 0.2, gape: dashing ? 0.6 : aim ? 0.3 : 0,
        menace: Math.max(m, aim ? 0.4 : 0),
        paint: (P) => {
          for (let i = 0; i < 9; i++) {
            const u = 0.28 + i * 0.075;
            const a = P(u, -0.95), b = P(u - 0.02, -0.1), c = P(u + 0.015, 0.15);
            g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).lineTo(c[0], c[1]).stroke({ width: 1.6, color: darken(back, 0.45), alpha: 0.45 });
          }
          for (let i = 0; i < 5; i++) {
            const [sx, sy] = P(0.65 + hash(id + i) * 0.3, 0.1 + hash(id * 2 + i) * 0.5);
            g.circle(sx, sy, 0.9).fill({ color: 0x14181c, alpha: 0.7 });
          }
        },
      });
      if (dashing || aim) {
        // Fangs of the underslung jaw.
        for (let i = 0; i < 4; i++) {
          const tx = X + f * (27 - i * 2.4);
          g.poly([tx, y + 1, tx - f * 0.8, y + 3.4, tx - f * 1.6, y + 1]).fill(0xf0ece0);
        }
      }
      if (dashing) for (let i = 0; i < 3; i++) g.moveTo(X - f * (40 + i * 8), y - 6 + i * 6).lineTo(X - f * (58 + i * 10), y - 6 + i * 6).stroke({ width: 1, color: 0xffffff, alpha: 0.35 });
      break;
    }
    case 'splitter': {
      // Salps: glassy barrels with muscle bands; the chain breaks into single salps.
      const s = e.scale;
      const gen = (e as any).gen ?? 0;
      const zoids: Pt[] = gen === 0 ? [[-9, -3], [9, 3]] : [[0, 0]];
      zoids.forEach(([ox, oy], k) => {
        const cx = X + ox * s, cy = y + oy * s;
        const pulse = 1 + Math.sin(e.anim * 5 + k) * 0.06;
        const lw = 14 * s * pulse, lh = 9 * s / pulse;
        const tilt = (gen === 0 ? 0.25 : 0) * (k ? 1 : -1);
        const R = (a: number, b: number): Pt => [cx + a * Math.cos(tilt) - b * Math.sin(tilt), cy + a * Math.sin(tilt) + b * Math.cos(tilt)];
        const pts: number[] = [];
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * Math.PI * 2;
          const sq = Math.pow(Math.abs(Math.cos(a)), 0.6) * Math.sign(Math.cos(a));
          pts.push(...R(sq * lw, Math.sin(a) * lh));
        }
        g.poly(pts).fill(gelFill(base, lighten(base, 0.5))).stroke({ width: 0.8, color: 0xffffff, alpha: 0.45 });
        for (let i = 0; i < 6; i++) {
          const bx = -lw * 0.7 + (i / 5) * lw * 1.4;
          const a = R(bx, -lh * 0.92), b = R(bx + 2 * s, 0), c = R(bx, lh * 0.92);
          g.moveTo(a[0], a[1]).quadraticCurveTo(b[0], b[1], c[0], c[1]).stroke({ width: 1, color: lighten(base, 0.45), alpha: 0.5 });
        }
        const [gx, gy] = R(-lw * 0.55, lh * 0.2);
        g.ellipse(gx, gy, 3.2 * s, 2.4 * s).fill({ color: tint(e, 0xc86a2a), alpha: 0.85 });
        g.circle(gx - s, gy - s, 0.8 * s).fill({ color: 0xffffff, alpha: 0.6 });
        for (const sd of [-1, 1]) {
          const [sx, sy] = R(sd * lw * 0.98, 0);
          g.ellipse(sx, sy, 1.2 * s, 3 * s).stroke({ width: 0.8, color: 0xffffff, alpha: 0.5 });
        }
      });
      break;
    }
    case 'flounder': {
      const sand = tint(e, 0xc8a676);
      if (e.hidden) {
        // Buried in sand: just a low hump and two eyes peering up.
        const tr = e.state === 'tremble' ? Math.sin(t * 50) * 2 : 0;
        g.ellipse(X + tr, y + 11, 24, 4).fill({ color: sand, alpha: 0.65 });
        for (let i = 0; i < 8; i++) g.circle(X + tr - 18 + hash(id + i) * 36, y + 10 + hash(id * 3 + i) * 3, 0.9).fill({ color: darken(sand, 0.3), alpha: 0.6 });
        fishEye(g, X - 3 + tr, y + 7, 2.2, m, 0, -0.4);
        fishEye(g, X + 3 + tr, y + 6, 2.2, m, 0, -0.4);
        break;
      }
      // Seen from above: an oval body fringed by one long rippling fin, both eyes on one side.
      const fr: number[] = [];
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        const rr = 1 + 0.18 + Math.sin(i * 1.9 - e.anim * 12) * 0.05;
        fr.push(X + Math.cos(a) * 23 * rr, y + Math.sin(a) * 11 * rr);
      }
      g.poly([X - f * 22, y, X - f * 33, y - 7 + Math.sin(beat) * 2, X - f * 33, y + 7 + Math.sin(beat) * 2]).fill({ color: darken(base, 0.1), alpha: 0.8 });
      g.poly(fr).fill({ color: darken(base, 0.1), alpha: 0.7 });
      for (let i = 0; i < 32; i += 2) g.moveTo(X + Math.cos((i / 32) * Math.PI * 2) * 22, y + Math.sin((i / 32) * Math.PI * 2) * 10.5).lineTo(fr[i * 2], fr[i * 2 + 1]);
      g.stroke({ width: 0.6, color: darken(base, 0.45), alpha: 0.5 });
      g.ellipse(X, y, 23, 11).fill(shade(base, 0.6)).stroke(edge(base));
      for (let i = 0; i < 18; i++) {
        const c = hash(id + i) > 0.5 ? lighten(base, 0.3) : darken(base, 0.35);
        g.circle(X - 18 + hash(id * 3 + i) * 32, y - 8 + hash(id * 7 + i) * 16, 0.8 + hash(id * 13 + i) * 1.6).fill({ color: c, alpha: 0.55 });
      }
      g.moveTo(X - f * 18, y).lineTo(X + f * 10, y).stroke({ width: 0.8, color: lighten(base, 0.3), alpha: 0.4 });
      fishEye(g, X + f * 13, y - 3, 2.6, m, f * 0.4, 0);
      fishEye(g, X + f * 16, y + 2, 2.6, m, f * 0.4, 0);
      g.moveTo(X + f * 21, y + 3).lineTo(X + f * 18, y + 6).stroke({ width: 1, color: darken(base, 0.5) });
      break;
    }
    case 'mimic': {
      // Giant clam: heavy fluted valves with interlocking wavy lips; open, it shows a jewelled
      // mantle dotted with tiny eyespots.
      const awake = e.state !== 'disguised';
      const open = awake ? 0.55 + Math.sin(e.anim * 10) * 0.3 : 0.06;
      const shellC = tint(e, 0xd8d0c0);
      const W = 23, folds = 5;
      const lip = (yy: number, sgn: number) => {
        const pts: number[] = [];
        for (let i = 0; i <= folds * 4; i++) {
          const k = i / (folds * 4);
          const env = Math.sin(k * Math.PI);
          pts.push(X - W + k * W * 2, yy + sgn * Math.sin(k * Math.PI * folds * 2) * 3.2 * Math.pow(env, 0.3) - env * 1.5);
        }
        return pts;
      };
      const gapeTop = y - 2 - open * 13;
      const pairs = (a: number[]) => {
        const out: number[] = [];
        for (let i = a.length - 2; i >= 0; i -= 2) out.push(a[i], a[i + 1]);
        return out;
      };
      if (open > 0.1) {
        g.poly([...lip(gapeTop, 1), ...pairs(lip(y - 1, 1))]).fill(shade(mixColor(base, 0x2a8ab0, 0.55)));
        for (let i = 0; i < 12; i++) g.circle(X - 19 + i * 3.5, (gapeTop + y) / 2 + Math.sin(i * 2.3) * (open * 4), 0.9).fill({ color: 0x9ef0ff, alpha: 0.9 });
        for (let i = 0; i < 8; i++) g.circle(X - 16 + hash(id + i) * 32, (gapeTop + y) / 2 + (hash(id * 3 + i) - 0.5) * open * 8, 1.6).fill({ color: mixColor(base, 0x60e0a0, 0.5), alpha: 0.5 });
        if (awake) for (const sd of [-1, 1]) fishEye(g, X + sd * 7, (gapeTop + y) / 2, 2.2, Math.max(m, 0.3), f, 0);
      }
      // Lower valve: a deep fluted bowl.
      const bowl: number[] = [...lip(y - 1, 1)];
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI;
        bowl.push(X + Math.cos(a) * W * 0.98, y - 1 + Math.sin(a) * 15);
      }
      g.poly(bowl).fill(shade(shellC)).stroke(edge(shellC));
      for (let i = 0; i < folds; i++) {
        const k = (i + 0.5) / folds;
        const lx = X - W + k * W * 2;
        g.moveTo(lx, y + 1).quadraticCurveTo(lx + (X - lx) * 0.2, y + 9, X + (lx - X) * 0.3, y + 13.5).stroke({ width: 2.4, color: darken(shellC, 0.22), alpha: 0.5 });
      }
      for (let i = 1; i < 4; i++) g.moveTo(X - W + i * 1.5, y + i * 3.5).quadraticCurveTo(X, y + i * 4 + 4, X + W - i * 1.5, y + i * 3.5).stroke({ width: 0.6, color: darken(shellC, 0.3), alpha: 0.35 });
      // Upper valve: a lower dome, lifting from the hinge.
      const dome: number[] = [...lip(gapeTop, 1)];
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI;
        dome.push(X + Math.cos(a) * W * 0.98, gapeTop - Math.sin(a) * 9);
      }
      g.poly(dome).fill(shade(lighten(shellC, 0.05))).stroke(edge(shellC));
      for (let i = 0; i < folds; i++) {
        const k = (i + 0.5) / folds;
        const lx = X - W + k * W * 2;
        g.moveTo(lx, gapeTop - 1).quadraticCurveTo(lx + (X - lx) * 0.2, gapeTop - 6, X + (lx - X) * 0.35, gapeTop - 8.5).stroke({ width: 2.2, color: darken(shellC, 0.22), alpha: 0.45 });
      }
      g.ellipse(X - 8, gapeTop - 5, 6, 2).fill({ color: 0xffffff, alpha: 0.18 });
      if (!awake) {
        // A pearl glinting in the gap: the bait.
        g.circle(X + f * 6, y - 2.5, 2.4).fill(shade(0xf4f0ff));
        if (Math.floor(t * 2) % 3 === 0) g.circle(X + f * 5, y - 3.5, 1).fill(0xffffff);
      }
      break;
    }
    case 'squidling': {
      // Squid: torpedo mantle with fins at the tip; eight arms and two long tentacles reach forward.
      const jet = e.state === 'jet';
      const mantleC = base;
      const bob = Math.sin(e.anim * 3) * 1.5;
      const Y = y + bob;
      const spread = jet ? 0.25 : 1;
      for (let i = 0; i < 8; i++) {
        const off = (i - 3.5) * 1.2 * spread;
        strand(g, X + f * 6, Y + off * 0.6, f > 0 ? 0 : Math.PI, 17 - Math.abs(i - 3.5) * 1.2, 5, (k) => f * (off * 0.06 + Math.sin(t * 5 + i + k * 0.8) * 0.18 * spread), 2.4, darken(mantleC, 0.08), 0.95);
      }
      for (const s of [-1, 1]) {
        const [ex, ey] = strand(g, X + f * 6, Y + s, f > 0 ? 0 : Math.PI, 27, 7, (k) => f * (s * 0.1 + Math.sin(t * 4 + k * 0.7 + s) * 0.15 * spread), 1.1, darken(mantleC, 0.08), 0.95, false);
        g.ellipse(ex, ey, 2.4, 1.5).fill(darken(mantleC, 0.1));
      }
      // Mantle.
      const mp: number[] = [];
      for (let i = 0; i <= 12; i++) {
        const u = i / 12;
        mp.push(...L(4 - u * 30, -(6.5 * Math.pow(1 - u * 0.95, 0.6))));
      }
      for (let i = 12; i >= 0; i--) {
        const u = i / 12;
        mp.push(...L(4 - u * 30, 6.5 * Math.pow(1 - u * 0.95, 0.6)));
      }
      const flap = Math.sin(e.anim * 6) * 3;
      for (const s of [-1, 1]) g.poly([...L(-16, s * 3), ...L(-24, s * (10 + flap)), ...L(-28, s * 1)].map((v, i) => (i % 2 ? v + Y - y : v))).fill({ color: lighten(mantleC, 0.05), alpha: 0.75 });
      g.poly(mp.map((v, i) => (i % 2 ? v + Y - y : v))).fill(shade(mantleC)).stroke(edge(mantleC));
      // Chromatophores pulse.
      for (let i = 0; i < 16; i++) {
        const [cx, cy] = L(2 - hash(id + i) * 26, (hash(id * 3 + i) - 0.5) * 9);
        g.circle(cx, cy + Y - y, 0.6 + (0.5 + 0.5 * Math.sin(t * 6 + i * 2.3)) * 1.1).fill({ color: darken(mantleC, 0.5), alpha: 0.55 });
      }
      // Head and the big eye.
      g.ellipse(...L(5, Y - y), 5, 5.5).fill(shade(lighten(mantleC, 0.05)));
      const [ex, ey] = L(5, Y - y - 0.5);
      fishEye(g, ex, ey, 3.6, m, f * 0.4, 0, 0x9aa8b8);
      break;
    }
    case 'clownanemone': {
      // Bubble-tip anemone with its clownfish lodger.
      const up = e.attach === 'ceil' ? 1 : -1;
      const ext = 1 + e.tele * 0.4;
      // Column.
      g.moveTo(X - 9, y - up * 2).quadraticCurveTo(X - 6, y + up * 6, X - 8, y + up * 10).lineTo(X + 8, y + up * 10).quadraticCurveTo(X + 6, y + up * 6, X + 9, y - up * 2).closePath()
        .fill(shade(darken(base, 0.25)));
      for (let i = 0; i < 6; i++) g.circle(X - 6 + i * 2.4, y + up * (3 + (i % 2) * 3), 0.9).fill({ color: lighten(base, 0.2), alpha: 0.5 });
      const tipC = tint(e, mixColor(base, 0xd0ff9a, 0.25));
      const n = 18;
      for (let pass = 0; pass < 2; pass++)
        for (let i = pass; i < n; i += 2) {
          const a = (i / (n - 1) - 0.5) * 2.6;
          const len = (15 + hash(id + i) * 8) * ext;
          let px = X + Math.sin(a) * 7, py = y + up * Math.cos(a) * 2;
          const sway = Math.sin(t * 1.8 + i * 0.7) * 0.25;
          const segs = 4;
          for (let k = 1; k <= segs; k++) {
            const dir = a + ((sway + a * 0.35 + (hash(id * 7 + i) - 0.5) * 0.5) * k) / segs;
            const nx = px + Math.sin(dir) * (len / segs), ny = py + up * Math.cos(dir) * (len / segs);
            g.moveTo(px, py).lineTo(nx, ny).stroke({ width: 3.2 - k * 0.3, color: pass ? lighten(base, 0.05) : darken(base, 0.12), cap: 'round' });
            px = nx;
            py = ny;
          }
          // Swollen bubble tip.
          g.circle(px, py, 2.4).fill(shade(tipC, 0.6));
          g.circle(px - 0.6, py - 0.8, 0.8).fill({ color: 0xffffff, alpha: 0.5 });
        }
      g.ellipse(X, y, 8, 3).fill({ color: darken(base, 0.4), alpha: 0.8 });
      // The clownfish weaves through the tentacles.
      const ph = t * 1.3 + id;
      const cx = X + Math.sin(ph) * 16, cy = y + up * (16 + Math.cos(ph * 1.4) * 4);
      const cf = Math.cos(ph) >= 0 ? 1 : -1;
      const orange = tint(e, 0xff7a1a);
      fish(g, cx, cy, cf, {
        L: 16, H: 8.5, peak: 0.4, nose: 0.85, ped: 0.3, back: orange, belly: lighten(orange, 0.2),
        fin: orange, finAlpha: 0.9, tailLen: 4, tailH: 6, fork: 0.1, dorsal: [[0.3, 0.8, 2.5]], anal: [[0.6, 0.85, 2]],
        beat: t * 12, beatAmp: 0.8, eyeU: 0.16, eyeR: 1.3, scales: false, lateral: false, menace: m,
        paint: (P) => {
          for (const u of [0.22, 0.52, 0.86]) {
            const a = P(u, -1), b = P(u, 1);
            g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ width: 2.4, color: 0x14100c, alpha: 0.8 });
            g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ width: 1.5, color: 0xffffff });
          }
        },
      });
      break;
    }
    case 'seahorse': {
      // Seahorse: armored ring-segmented trunk, tubular snout, coronet and a curled prehensile tail.
      const bob = Math.sin(e.anim * 3) * 2;
      const Y = y + bob;
      const S = (lx: number, ly: number): Pt => [X + f * lx, Y + ly];
      const cl: [number, number, number][] = [];
      for (const [lx, ly, w] of [[4, -19, 4.6], [1, -13, 3.8], [2.5, -6, 5.5], [3.2, 1, 6.6], [2, 7, 5.6], [-0.5, 12, 4]] as const) cl.push([...S(lx, ly), w]);
      // Prehensile tail curling forwards.
      const tail: [number, number, number][] = [cl[cl.length - 1]];
      for (let i = 1; i <= 14; i++) {
        const k = i / 14;
        const a = Math.PI * 0.95 - k * Math.PI * 1.7;
        const r = 6.5 * (1 - k * 0.6);
        tail.push([...S(4 + Math.cos(a) * r * 1.1 - 4.5 * (1 - k), 18 + Math.sin(a) * r + 2 * (1 - k)), 3.6 * (1 - k * 0.75)]);
      }
      // Dorsal fin fluttering on the back.
      const df = Math.sin(e.anim * 20) * 1.5;
      g.poly([...S(-3, -3), ...S(-9 - df, -1), ...S(-9 + df, 5), ...S(-2.5, 6)]).fill({ color: lighten(base, 0.2), alpha: 0.55 });
      for (let i = 0; i < tail.length - 1; i++) {
        const [ax, ay, aw] = tail[i], [bx, by2] = tail[i + 1];
        g.moveTo(ax, ay).lineTo(bx, by2).stroke({ width: aw * 2, color: darken(base, 0.08), cap: 'round' });
      }
      for (let i = 1; i < tail.length - 1; i += 2) g.circle(tail[i][0], tail[i][1], 0.7).fill({ color: lighten(base, 0.3), alpha: 0.6 });
      const out = tubeOutline(cl);
      g.poly(out).fill(shade(base)).stroke(edge(base));
      // Bony rings.
      for (let i = 1; i < cl.length - 1; i++) {
        const [px, py, w] = cl[i], [qx, qy] = cl[i + 1];
        const l = Math.hypot(qx - px, qy - py) || 1;
        const nx = -(qy - py) / l, ny = (qx - px) / l;
        g.moveTo(px + nx * w * 0.9, py + ny * w * 0.9).lineTo(px - nx * w * 0.9, py - ny * w * 0.9).stroke({ width: 0.6, color: darken(base, 0.4), alpha: 0.35 });
        g.circle(px + nx * w, py + ny * w, 0.8).fill({ color: lighten(base, 0.3), alpha: 0.6 });
      }
      // Head: snout, coronet, gill and eye.
      g.poly([...S(6, -21.2), ...S(15, -19.2), ...S(16, -17.6), ...S(15, -16.2), ...S(6, -16.8)]).fill(shade(base)).stroke(edge(base));
      g.poly([...S(1.5, -22.5), ...S(2.5, -27), ...S(4, -23)]).fill(shade(lighten(base, 0.1)));
      g.poly([...S(-0.5, -21), ...S(-2, -24), ...S(1.5, -22)]).fill(shade(lighten(base, 0.1)));
      g.moveTo(...S(2, -18)).quadraticCurveTo(...S(-0.5, -15), ...S(1.5, -12.5)).stroke({ width: 0.8, color: darken(base, 0.45), alpha: 0.6 });
      const pf = Math.sin(e.anim * 22) * 1.2;
      g.poly([...S(0, -15), ...S(-4 - pf, -17), ...S(-4 + pf, -12)]).fill({ color: lighten(base, 0.25), alpha: 0.5 });
      const [ex, ey] = S(6, -19.5);
      fishEye(g, ex, ey, 2, m, f * 0.6, 0);
      break;
    }
    case 'nettle': {
      // Sea nettle: striped translucent bell, scalloped margin, trailing threads and ruffled oral arms.
      const k = Math.max(0, 1 - e.anim * 2);
      const bw = 15 * (1 - k * 0.15), bh = 12 * (1 + k * 0.12);
      for (let i = 0; i < 18; i++) {
        const bx = X - bw + (i / 17) * bw * 2;
        strand(g, bx, y + 2, Math.PI / 2, 46 + hash(id + i) * 20, 10, (s) => Math.sin(t * 1.6 + i * 0.7 + s * 0.5) * 0.12, 0.7, tint(e, 0xffd8b0), 0.5, false);
      }
      for (let i = 0; i < 4; i++) {
        const bx = X - 4.5 + i * 3;
        const pts: Pt[] = [];
        for (let s = 0; s <= 10; s++) pts.push([bx + Math.sin(t * 1.1 + i * 1.7 + s * 0.45) * (2 + s * 0.6), y + 2 + s * 4.2]);
        strokePath(g, pts);
        g.stroke({ width: 4.5, color: lighten(base, 0.15), alpha: 0.35, cap: 'round' });
        strokePath(g, pts);
        g.stroke({ width: 1.8, color: lighten(base, 0.35), alpha: 0.7, cap: 'round' });
      }
      const bell: number[] = [];
      for (let i = 0; i <= 24; i++) {
        const a = Math.PI + (i / 24) * Math.PI;
        bell.push(X + Math.cos(a) * bw, y + 2 + Math.sin(a) * bh);
      }
      for (let i = 16; i >= 0; i--) bell.push(X - bw + (i / 16) * bw * 2, y + 2 + (i % 2 ? 2.2 : 0.4));
      g.poly(bell).fill(gelFill(base, lighten(base, 0.35)));
      for (let i = 0; i < 16; i++) {
        const a = Math.PI + ((i + 0.5) / 16) * Math.PI;
        g.moveTo(X + Math.cos(a) * bw * 0.15, y + 2 - bh * 0.9 + Math.abs(Math.cos(a)) * 2).lineTo(X + Math.cos(a) * bw * 0.97, y + 2 + Math.sin(a) * bh * 0.3)
          .stroke({ width: 1.4, color: tint(e, 0xa84a2a), alpha: 0.45 });
      }
      g.moveTo(X - bw * 0.6, y - bh * 0.4).quadraticCurveTo(X - bw * 0.2, y - bh * 0.95, X + bw * 0.3, y - bh * 0.85).stroke({ width: 1.2, color: 0xffffff, alpha: 0.35 });
      break;
    }
    case 'stingray': {
      // Stingray from a low angle: a flat disc rippling at the edges, spiracles behind the eyes, a barbed whip tail.
      const sandC = base, under = tint(e, 0xece6d8);
      const tailSw = Math.sin(e.anim * 2) * 4;
      const tail: Pt[] = [];
      for (let i = 0; i <= 8; i++) tail.push(L(-20 - i * 4.4, 1 + Math.sin(i * 0.5 + e.anim * 2) * (i / 8) * tailSw));
      strokePath(g, tail);
      g.stroke({ width: 2.4, color: darken(sandC, 0.2), cap: 'round' });
      const bp = tail[3];
      g.poly([bp[0], bp[1], bp[0] - f * 9, bp[1] - 2.4, bp[0] - f * 8, bp[1] - 0.8]).fill(tint(e, 0xe8e4d8));
      for (let i = 0; i < 3; i++) g.moveTo(bp[0] - f * (2 + i * 2.5), bp[1] - 1 - i * 0.4).lineTo(bp[0] - f * (1 + i * 2.5), bp[1] - 2.6 - i * 0.4).stroke({ width: 0.6, color: 0xe8e4d8 });
      const rim = (side: 1 | -1, ry: number) => {
        const pts: number[] = [];
        for (let i = 0; i <= 20; i++) {
          const u = i / 20;
          const lx = 24 - u * 46;
          const w = Math.sin(u * Math.PI);
          const wave = Math.sin(u * 7 - e.anim * 6) * 2.4 * w;
          pts.push(...L(lx, side * (ry * Math.pow(w, 0.7)) + wave));
        }
        return pts;
      };
      const top = rim(-1, 9), bot = rim(1, 4);
      const disc = [...top];
      for (let i = bot.length - 2; i >= 0; i -= 2) disc.push(bot[i], bot[i + 1]);
      g.poly(disc).fill(shade(sandC, 0.8)).stroke(edge(sandC));
      const lower = [...bot];
      for (let i = 20; i >= 0; i--) {
        const u = i / 20;
        const lx = 24 - u * 46;
        const wv = Math.sin(u * 7 - e.anim * 6) * 2.4 * Math.sin(u * Math.PI);
        lower.push(...L(lx, 1.5 * Math.pow(Math.sin(u * Math.PI), 0.7) + wv));
      }
      g.poly(lower).fill({ color: under, alpha: 0.85 });
      for (let i = 0; i < 12; i++) {
        const [sx, sy] = L(16 - hash(id + i) * 34, -7 + hash(id * 3 + i) * 7);
        g.circle(sx, sy, 0.8 + hash(id * 5 + i) * 0.9).fill({ color: darken(sandC, 0.4), alpha: 0.5 });
      }
      g.poly([...L(-16, 1), ...L(-23, 6), ...L(-19, 1)]).fill({ color: darken(sandC, 0.1), alpha: 0.8 });
      const [ex, ey] = L(11, -6);
      fishEye(g, ex, ey, 2.1, m, f * 0.5, -0.3);
      g.ellipse(...L(6, -6.5), 1.6, 1).fill(0x14100c);
      break;
    }
    case 'lanternfish': {
      const back = mixColor(base, 0x1e2a3a, 0.55), belly = tint(e, 0xc8d0dc);
      fish(g, X, y, f, {
        L: 32, H: 10, peak: 0.32, nose: 0.7, ped: 0.16, back, belly, fin: darken(back, 0.1), finAlpha: 0.5,
        tailLen: 9, tailH: 11, fork: 0.7, dorsal: [[0.42, 0.56, 6], [0.8, 0.84, 2.5]], anal: [[0.58, 0.78, 5]], pectoral: 5,
        beat, beatAmp: amp, eyeU: 0.12, eyeR: 3.4, eyeV: -0.15, mouthU: 0.18, mouthV: 0.1, menace: m, iris: 0x9ab0c8,
        paint: (P) => {
          for (let i = 0; i < 8; i++) {
            const [px, py] = P(0.2 + i * 0.1, 0.78);
            g.circle(px, py, 1.4).fill(0x0a1018);
            g.circle(px, py, 1).fill(0xc8f0ff);
          }
          for (let i = 0; i < 4; i++) {
            const [px, py] = P(0.3 + i * 0.12, 0.4);
            g.circle(px, py, 0.9).fill(0xc8f0ff);
          }
        },
      });
      break;
    }
    case 'ghostshrimp': {
      // Glass shrimp: a clear shell over visible organs. It is hard to see until close.
      const a = Math.max(0.12, (e as any).fade ?? 0);
      const clear = { color: lighten(base, 0.2), alpha: a * 0.28 };
      const rimS = { width: 0.9, color: 0xffffff, alpha: a * 0.7 };
      // Antennae.
      for (const [len, ang] of [[40, -0.35], [34, -0.15], [9, -0.6], [8, -0.45]] as const)
        strand(g, X + f * 11, y - 3, f > 0 ? ang : Math.PI - ang, len, 8, (k) => f * Math.sin(t * 2 + k * 0.5 + len) * 0.05 * k, 0.6, 0xffffff, a * 0.7, false);
      // Walking legs and beating swimmerets.
      for (let i = 0; i < 5; i++) {
        const lx = 8 - i * 3;
        g.moveTo(...L(lx, 3)).lineTo(...L(lx + 2, 8)).lineTo(...L(lx + 1, 12)).stroke({ width: 0.6, color: 0xffffff, alpha: a * 0.6 });
      }
      for (let i = 0; i < 5; i++) {
        const sw = Math.sin(e.anim * 18 + i) * 1.5;
        g.moveTo(...L(-4 - i * 3.5, 4)).lineTo(...L(-5 - i * 3.5 + sw, 8)).stroke({ width: 0.7, color: 0xffffff, alpha: a * 0.5 });
      }
      // Abdomen: six segments arching back and down to the tail fan.
      const segs: [number, number, number][] = [];
      for (let i = 0; i < 6; i++) {
        const k = i / 5;
        segs.push([-3 - k * 19, Math.sin(k * 2.4) * 4 - 1, 5.5 - k * 2]);
      }
      for (let i = segs.length - 1; i >= 0; i--) {
        const [lx, ly, r] = segs[i];
        g.ellipse(...L(lx, ly), r * 0.9, r).fill(clear).stroke(rimS);
      }
      const [tx, ty] = L(-26, 2);
      const fan = Math.sin(e.anim * 4) * 0.15;
      for (const d of [-0.5, 0, 0.5]) {
        const ang = (f > 0 ? Math.PI : 0) + f * (d + fan);
        g.poly([tx, ty, tx + Math.cos(ang - 0.15) * 8, ty + Math.sin(ang - 0.15) * 8, tx + Math.cos(ang + 0.15) * 8, ty + Math.sin(ang + 0.15) * 8]).fill(clear).stroke(rimS);
      }
      // Carapace with a serrated rostrum.
      const cara = [...L(11, -1), ...L(8, -5), ...L(0, -6), ...L(-5, -4), ...L(-5, 3), ...L(4, 4), ...L(10, 2)];
      g.poly(cara).fill(clear).stroke(rimS);
      g.poly([...L(9, -4), ...L(20, -6), ...L(9, -2.5)]).fill(clear).stroke(rimS);
      for (let i = 0; i < 3; i++) g.moveTo(...L(11 + i * 3, -4.6 - i * 0.3)).lineTo(...L(11.5 + i * 3, -6 - i * 0.3)).stroke({ width: 0.5, color: 0xffffff, alpha: a * 0.6 });
      // Organs showing through.
      const gut: Pt[] = [L(6, -1), L(0, -2), ...segs.map(([lx, ly]) => L(lx, ly - 0.5))];
      strokePath(g, gut);
      g.stroke({ width: 1.2, color: 0xc86a2a, alpha: a * 0.75 });
      g.ellipse(...L(1, -2), 2.4, 1.6).fill({ color: 0x9ad86a, alpha: a * 0.6 });
      const [ex, ey] = L(10, -3.5);
      g.moveTo(...L(8, -2.5)).lineTo(ex, ey).stroke({ width: 1, color: 0xffffff, alpha: a * 0.7 });
      g.circle(ex, ey, 1.8).fill({ color: 0x080a10, alpha: Math.min(1, a * 1.4) });
      g.circle(ex - 0.5, ey - 0.6, 0.5).fill({ color: 0xffffff, alpha: a });
      break;
    }
    case 'anglerling': {
      // Black seadevil: a lumpy dark body, a cavernous jaw of needle teeth and a glowing lure.
      const lure: Pt = [X + f * 20, y - 26 + Math.sin(t * 2) * 3];
      const skin = base;
      const open = e.state === 'bite' ? 1 : e.state === 'aim' ? e.tele * 0.7 : 0.3;
      g.poly([...L(-14, -3), ...L(-25, -8 + Math.sin(beat) * 2), ...L(-25, 8 + Math.sin(beat) * 2), ...L(-14, 4)]).fill({ color: darken(skin, 0.1), alpha: 0.8 });
      g.poly([...L(-6, -15), ...L(-14, -14), ...L(-12, -10)]).fill({ color: darken(skin, 0.1), alpha: 0.8 });
      g.poly([...L(-6, 15), ...L(-14, 14), ...L(-11, 10)]).fill({ color: darken(skin, 0.1), alpha: 0.8 });
      const body: number[] = [];
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        const r = 17 + Math.sin(a * 3 + 1) * 1.2;
        body.push(...L(Math.cos(a) * r * 1.05 - 2, Math.sin(a) * r * 0.95));
      }
      g.poly(body).fill(shade(skin, 0.7)).stroke(edge(skin));
      for (let i = 0; i < 16; i++) g.circle(...L(-14 + hash(id + i) * 26, -12 + hash(id * 3 + i) * 24), 0.7).fill({ color: lighten(skin, 0.25), alpha: 0.35 });
      // Jaw.
      const up: Pt = L(18, -4 - open * 5), lo: Pt = L(20, 9 + open * 9), hinge: Pt = L(1, 3);
      g.poly([hinge[0], hinge[1], up[0], up[1], ...L(19, 2), lo[0], lo[1]]).fill(0x0c0408);
      for (let i = 0; i < 5; i++) {
        const k = (i + 0.5) / 5;
        const ux = hinge[0] + (up[0] - hinge[0]) * k, uy = hinge[1] + (up[1] - hinge[1]) * k;
        const lx = hinge[0] + (lo[0] - hinge[0]) * k, ly = hinge[1] + (lo[1] - hinge[1]) * k;
        const tl = 3 + k * 4;
        g.moveTo(ux, uy).quadraticCurveTo(ux + f * 1, uy + tl * 0.6, ux - f * 1.2, uy + tl).stroke({ width: 1, color: 0xe8ecf0, alpha: 0.85 });
        g.moveTo(lx, ly).quadraticCurveTo(lx + f * 1, ly - tl * 0.6, lx - f * 1.2, ly - tl).stroke({ width: 1, color: 0xe8ecf0, alpha: 0.85 });
      }
      g.moveTo(...L(1, 3)).lineTo(lo[0], lo[1]).stroke({ width: 1.4, color: lighten(skin, 0.15), alpha: 0.6 });
      // Illicium and its glowing esca.
      g.moveTo(...L(6, -15)).quadraticCurveTo(X + f * 14, y - 32, lure[0], lure[1]).stroke({ width: 1.3, color: darken(skin, 0.1) });
      g.circle(lure[0], lure[1], 3.4).fill(0xc8fff0);
      for (let i = 0; i < 3; i++) strand(g, lure[0], lure[1] + 2, Math.PI / 2 + (i - 1) * 0.4, 4, 2, () => 0, 0.6, 0xc8fff0, 0.7, false);
      const [ex, ey] = L(8, -8);
      fishEye(g, ex, ey, 1.9, Math.max(m, 0.3), f, 0, 0x5a6a7a);
      break;
    }
    case 'hatchetfish': {
      // Hatchetfish: a mirror-silver blade with a keel of lights and upturned tubular eyes.
      const silver = tint(e, mixColor(base, 0xd8e0ea, 0.4));
      g.poly([...L(-10, -1.5), ...L(-16, -5 + Math.sin(beat) * 1.5), ...L(-14.5, 0), ...L(-16, 5 + Math.sin(beat) * 1.5), ...L(-10, 2)]).fill({ color: silver, alpha: 0.5 });
      g.poly([...L(-3, -7.5), ...L(-6, -12), ...L(-7, -6.5)]).fill({ color: silver, alpha: 0.5 });
      const body = [...L(9, -3), ...L(6, -7), ...L(-2, -8), ...L(-8, -5), ...L(-10.5, -1.6), ...L(-10.5, 2), ...L(-6, 6), ...L(-1, 11), ...L(4, 9), ...L(8, 3)];
      g.poly(body).fill(shade(silver, 1.1)).stroke(edge(silver));
      g.poly([...L(5, -6), ...L(-6, -5), ...L(-3, 2), ...L(4, 3)]).fill({ color: 0xffffff, alpha: 0.22 });
      g.moveTo(...L(-8, -4)).lineTo(...L(5, -6.5)).stroke({ width: 1.4, color: darken(silver, 0.5), alpha: 0.5 });
      for (let i = 0; i < 7; i++) {
        const k = i / 6;
        const [px, py] = L(3 - k * 8, 8.8 - Math.abs(k - 0.35) * 5);
        g.circle(px, py, 0.9).fill(0x9ef0ff);
      }
      g.moveTo(...L(9, -3)).lineTo(...L(6, -1)).stroke({ width: 0.9, color: 0x2a3038 });
      const [ex, ey] = L(5, -4);
      g.ellipse(ex, ey - 1, 2.6, 3.2).fill(0x14181c);
      fishEye(g, ex, ey - 1.6, 2.2, m, 0, -0.8, 0xc8d8e0);
      g.poly([...L(1, 1), ...L(-4, 4 + Math.sin(beat * 1.6) * 1.2), ...L(-1, 0)]).fill({ color: silver, alpha: 0.45 });
      break;
    }
    case 'viperfish': {
      const back = mixColor(base, 0x1a3040, 0.4), belly = tint(e, 0x3a5a70);
      const { P } = fish(g, X, y, f, {
        L: 50, H: 10, peak: 0.24, nose: 0.6, ped: 0.12, back, belly, fin: darken(back, 0.2), finAlpha: 0.55,
        tailLen: 10, tailH: 11, fork: 0.5, dorsal: [[0.2, 0.28, 4]], anal: [[0.82, 0.9, 5]], pectoral: 5,
        beat, beatAmp: amp, eyeU: 0.1, eyeR: 3, eyeV: -0.3, mouthU: 0.2, mouthV: 0.15, gape: 0.5,
        menace: Math.max(m, 0.4), iris: 0x5a8aa0,
        paint: (P) => {
          for (let i = 0; i < 12; i++) {
            const [px, py] = P(0.15 + i * 0.065, 0.82);
            g.circle(px, py, 0.9).fill(0x5cf2ff);
          }
          for (let i = 0; i < 9; i++) {
            const [px, py] = P(0.2 + i * 0.08, 0.5);
            g.circle(px, py, 0.7).fill({ color: 0x5cf2ff, alpha: 0.8 });
          }
        },
      });
      // Long first dorsal ray tipped with a light.
      const r0 = P(0.2, -1);
      const tip: Pt = [X + f * 18, y - 16 + Math.sin(t * 2) * 1.5];
      g.moveTo(r0[0], r0[1]).quadraticCurveTo(X + f * 8, y - 20, tip[0], tip[1]).stroke({ width: 0.8, color: lighten(back, 0.2), alpha: 0.8 });
      g.circle(tip[0], tip[1], 1.3).fill(0x9ef0ff);
      // Fangs too long to fit inside the mouth.
      for (const [u, L1] of [[0.03, 13], [0.08, 10]] as const) {
        const a = P(u, 0.9), b = P(u + 0.02, -1.3);
        g.moveTo(a[0], a[1]).quadraticCurveTo(a[0] + f * (L1 * 0.15), (a[1] + b[1]) / 2, b[0], a[1] - L1).stroke({ width: 1.3, color: 0xe8e4d8, alpha: 0.95, cap: 'round' });
      }
      for (const u of [0.05, 0.12]) {
        const a = P(u, -0.2);
        g.moveTo(a[0], a[1]).lineTo(a[0] + f * 0.6, a[1] + 7).stroke({ width: 1.1, color: 0xe8e4d8, alpha: 0.9, cap: 'round' });
      }
      break;
    }
    case 'gulper': {
      const go = e as any;
      const open = go.open ?? 0;
      // Whip-thin tail ending in a pink light organ.
      const tail: [number, number, number][] = [];
      for (let i = 0; i <= 12; i++) {
        const k = i / 12;
        const [px, py] = L(-6 - k * 62, Math.sin(t * 4 + k * 6) * (1 + k * 8));
        tail.push([px, py, 4 * (1 - k) + 0.6]);
      }
      g.poly(tubeOutline(tail)).fill(shade(base, 0.7)).stroke(edge(base));
      const ridge: Pt[] = tail.slice(1, 10).map(([px, py, w]) => [px, py - w - 1.5]);
      strokePath(g, ridge);
      g.stroke({ width: 1.2, color: lighten(base, 0.15), alpha: 0.5 });
      const end = tail[tail.length - 1];
      g.circle(end[0], end[1], 2.4).fill(0xff5cae);
      // Enormous loose jaw with a sagging, translucent pouch.
      const jaw = 8 + open * 26;
      const hU: Pt = L(-2, -4), hL: Pt = L(-2, 5);
      const tU: Pt = L(28, -jaw), tL: Pt = L(28, jaw * 0.9);
      g.moveTo(hL[0], hL[1]).lineTo(tL[0], tL[1]).quadraticCurveTo(X + f * 18, y + jaw * 1.25 + 4, hL[0] + f * 6, hL[1] + 4).closePath().fill({ color: mixColor(base, 0x4a2a3a, 0.4), alpha: 0.75 });
      g.poly([...hU, ...tU, ...L(24, 0), ...tL, ...hL]).fill({ color: 0x0c0408, alpha: 0.92 });
      g.moveTo(hU[0], hU[1]).lineTo(tU[0], tU[1]).moveTo(hL[0], hL[1]).lineTo(tL[0], tL[1]).stroke({ width: 2, color: lighten(base, 0.15) });
      g.ellipse(...L(-3, 0), 7, 5.5).fill(shade(base)).stroke(edge(base));
      fishEye(g, ...L(1, -3), 1.4, m, f, 0, 0x6a7080);
      break;
    }
    case 'isopod': {
      const iso = e as any;
      const shellC = base;
      if (iso.rolling > 0) {
        const a = e.anim * 12 * f;
        g.circle(X, y, 15).fill(shade(shellC)).stroke(edge(shellC));
        for (let i = 0; i < 7; i++) {
          const aa = a + i * 0.9;
          g.moveTo(X + Math.cos(aa) * 15, y + Math.sin(aa) * 15).quadraticCurveTo(X + Math.cos(aa + 0.4) * 6, y + Math.sin(aa + 0.4) * 6, X + Math.cos(aa + 1.2) * 15, y + Math.sin(aa + 1.2) * 15)
            .stroke({ width: 1.1, color: darken(shellC, 0.35), alpha: 0.7 });
        }
        g.circle(X - 4, y - 5, 4).fill({ color: 0xffffff, alpha: 0.15 });
        break;
      }
      // Giant isopod: overlapping dorsal plates, big compound eyes, seven pairs of walking legs.
      for (let i = 0; i < 7; i++) {
        const lx = 14 - i * 4.6;
        const ph = Math.sin(e.anim * 14 + i * 1.3);
        g.moveTo(...L(lx, 5)).lineTo(...L(lx + 2 + ph * 1.5, 10)).lineTo(...L(lx + 1 + ph * 2, 13)).stroke({ width: 1.3, color: darken(shellC, 0.3), cap: 'round' });
      }
      strand(g, X + f * 21, y + 1, f > 0 ? 0.35 : Math.PI - 0.35, 18, 6, (k) => f * Math.sin(t * 1.5 + k * 0.4) * 0.06 * k, 1.1, darken(shellC, 0.2));
      strand(g, X + f * 21, y - 1, f > 0 ? -0.2 : Math.PI + 0.2, 7, 3, () => 0, 0.9, darken(shellC, 0.2));
      const plates = 12;
      for (let i = plates - 1; i >= 0; i--) {
        const k = i / (plates - 1);
        const lx0 = 20 - k * 40, lx1 = lx0 - 4.6;
        const hgt = 13 * Math.sin(0.25 + k * 2.4) * (i === 0 ? 0.85 : 1);
        const c = i % 2 ? shellC : lighten(shellC, 0.06);
        g.poly([...L(lx0 + 1.5, 6), ...L(lx0 + 1, -hgt * 0.6), ...L(lx0 - 1, -hgt), ...L(lx1, -hgt * 0.95), ...L(lx1 - 1, 6)]).fill(shade(c, 0.8));
        g.moveTo(...L(lx0 + 1.5, 6)).lineTo(...L(lx0 + 1, -hgt * 0.6)).lineTo(...L(lx0 - 1, -hgt)).stroke({ width: 0.9, color: darken(shellC, 0.4), alpha: 0.6 });
      }
      // Tail fan with spines.
      g.poly([...L(-21, -3), ...L(-27, -1), ...L(-27, 4), ...L(-21, 6)]).fill(shade(shellC, 0.8)).stroke(edge(shellC));
      for (let i = 0; i < 4; i++) g.moveTo(...L(-27, -0.5 + i * 1.4)).lineTo(...L(-29.5, -0.5 + i * 1.6)).stroke({ width: 0.6, color: darken(shellC, 0.4) });
      g.moveTo(...L(20, 6)).lineTo(...L(-22, 6)).stroke({ width: 1, color: darken(shellC, 0.5), alpha: 0.6 });
      // Compound eye.
      const [ex, ey] = L(16, -4);
      g.ellipse(ex, ey, 3.4, 2.6).fill(0x14100e);
      for (let i = 0; i < 6; i++) g.circle(ex - 1.8 + (i % 3) * 1.8, ey - 0.8 + Math.floor(i / 3) * 1.6, 0.5).fill({ color: m >= 0.35 ? 0xb8322a : 0x8a8aa0, alpha: 0.7 });
      g.circle(ex - 1, ey - 1, 0.8).fill({ color: 0xffffff, alpha: 0.6 });
      break;
    }
    case 'toydiver': {
      // A plastic aquarium diver: brass helmet with portholes, canvas suit, lead boots and an air hose.
      const brass = tint(e, 0xc8a050), suit = tint(e, 0xd8cbb0), lead = tint(e, 0x3a3a44);
      g.moveTo(...L(-7, -16)).bezierCurveTo(...L(-16, -22), ...L(-14, -32), ...L(-8, -36)).stroke({ width: 2.4, color: 0x2a2a30, cap: 'round' });
      g.roundRect(X - 7, y - 3, 14, 13, 3).fill(shade(suit)).stroke(edge(suit));
      for (const s of [-1, 1]) g.roundRect(X + s * 8 - 2.5, y - 2, 5, 11, 2).fill(shade(suit, 0.8));
      for (const s of [-1, 1]) g.circle(X + s * 8, y + 9.5, 2.2).fill(shade(tint(e, 0x8a6a4a)));
      g.rect(X - 7.5, y + 6, 15, 3).fill(lead);
      for (const s of [-1, 1]) {
        g.roundRect(X + s * 3.5 - 3, y + 9, 6, 5, 1).fill(shade(suit, 0.8));
        g.roundRect(X + s * 3.5 - 3.6, y + 13, 7.2, 3.4, 1).fill(shade(lead));
      }
      g.poly([X - 9, y - 4, X + 9, y - 4, X + 7, y - 9, X - 7, y - 9]).fill(shade(brass));
      for (let i = 0; i < 5; i++) g.circle(X - 7 + i * 3.5, y - 6, 0.8).fill(lighten(brass, 0.4));
      g.circle(X, y - 16, 9.5).fill(shade(brass, 1.2)).stroke(edge(brass));
      for (const [ox, oy, r] of [[f * 3.5, -16, 4.2], [-f * 5.5, -17, 2.4], [f * 1, -23, 2]] as const) {
        g.circle(X + ox, y + oy, r + 1).fill(shade(darken(brass, 0.15)));
        g.circle(X + ox, y + oy, r).fill({ color: 0x5a8aa0, alpha: 0.9 });
        g.circle(X + ox - r * 0.3, y + oy - r * 0.3, r * 0.3).fill({ color: 0xffffff, alpha: 0.6 });
      }
      g.moveTo(X + f * 3.5 - 4.2, y - 16).lineTo(X + f * 3.5 + 4.2, y - 16).moveTo(X + f * 3.5, y - 20.2).lineTo(X + f * 3.5, y - 11.8).stroke({ width: 0.8, color: darken(brass, 0.3) });
      g.circle(X - 3, y - 21, 2.5).fill({ color: 0xffffff, alpha: 0.35 });
      break;
    }
    case 'snail': {
      const sn = e as any;
      const hide = (sn.shell ?? 0) > 0;
      const ang = e.attach === 'ceil' ? Math.PI : e.attach === 'left' ? Math.PI / 2 : e.attach === 'right' ? -Math.PI / 2 : 0;
      const c = Math.cos(ang), s2 = Math.sin(ang);
      const P = (lx: number, ly: number): Pt => [X + lx * c - ly * s2, y + lx * s2 + ly * c];
      const flesh = tint(e, 0xb8a890);
      if (!hide) {
        // Muscular foot, siphon, and two long tentacles with eyes at their base.
        const foot: number[] = [];
        for (const [lx, ly] of [[-18, 9], [-10, 6], [6, 5], [16, 5], [22, 8], [18, 10], [-16, 10]] as const) foot.push(...P(lx * f, ly));
        g.poly(foot).fill(shade(flesh, 0.7)).stroke(edge(flesh));
        for (let i = 0; i < 6; i++) g.circle(...P(f * (-12 + i * 5), 8), 0.7).fill({ color: darken(flesh, 0.3), alpha: 0.6 });
        const head: Pt = P(f * 17, 3);
        g.ellipse(head[0], head[1], 4.5, 3.5).fill(shade(flesh, 0.7));
        for (const [la, ll] of [[-0.9, 13], [-0.45, 15]] as const) {
          const a = (f > 0 ? 0 : Math.PI) + f * la + ang + Math.sin(t * 1.5 + la) * 0.1;
          strand(g, head[0], head[1], a, ll, 5, (k) => Math.sin(t * 2 + k + la) * 0.05 * k, 1.4, flesh, 0.95);
        }
        const [ex, ey] = P(f * 18.5, 0.5);
        beadEye(g, ex, ey, 1, m);
        strand(g, ...P(f * 6, -2), ang + (f > 0 ? -2.3 : -0.85), 8, 3, () => 0, 2.2, darken(flesh, 0.1), 0.9);
      }
      // Coiled shell: body whorl, spire, growth lines and colour bands.
      const shellC = base;
      const [sx, sy] = P(-2 * f, -6);
      g.circle(sx, sy, 12).fill(shade(shellC));
      const spire: Pt = P(-9 * f, -13);
      g.circle(spire[0], spire[1], 5).fill(shade(lighten(shellC, 0.06)));
      g.circle(...P(-12 * f, -16), 2.4).fill(shade(lighten(shellC, 0.1)));
      for (let i = 0; i < 3; i++) {
        g.moveTo(sx, sy);
        for (let k = 0; k < 24; k++) {
          const a = k * 0.32 + i * 0.4;
          const r = 11 - k * 0.35 - i * 2.5;
          if (r < 1) break;
          g.lineTo(sx + Math.cos(a + ang) * r * f, sy + Math.sin(a + ang) * r);
        }
        g.stroke({ width: i === 1 ? 2 : 1, color: darken(shellC, i === 1 ? 0.45 : 0.25), alpha: 0.55 });
      }
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        g.moveTo(sx + Math.cos(a) * 7, sy + Math.sin(a) * 7).lineTo(sx + Math.cos(a) * 11.5, sy + Math.sin(a) * 11.5).stroke({ width: 0.5, color: darken(shellC, 0.3), alpha: 0.35 });
      }
      g.circle(sx, sy, 12).stroke(edge(shellC));
      g.ellipse(sx - 4, sy - 5, 4, 2.4).fill({ color: 0xffffff, alpha: 0.25 });
      if (hide) {
        const [ox, oy] = P(f * 6, 2);
        g.ellipse(ox, oy, 5, 3.5).fill(shade(tint(e, 0x5a3a2a)));
        g.ellipse(ox, oy, 2.5, 1.6).stroke({ width: 0.6, color: 0x2a1a10, alpha: 0.6 });
      }
      break;
    }
    default:
      g.circle(X, y, e.r).fill(shade(base)).stroke(edge(base));
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

/** Creatures without visible eyes get no menacing eye-glint. */
export const EYELESS = new Set(['urchin', 'nettle', 'jelly', 'splitter', 'blob', 'toydiver']);
