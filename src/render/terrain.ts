// Reef terrain. The tile grid is only the collision skeleton: the rock is
// drawn as smooth, irregular contours (marching squares over a jittered field
// sampled at tile centres), textured, shaded darker toward its core, dusted
// with silt on top faces and lit by caustics near the surface. The level is
// split into chunks so only what the camera sees is drawn.

import { Container, FillGradient, Graphics, Matrix, TilingSprite } from 'pixi.js';
import { TILE } from '../config';
import { clamp, darken, hash2, lighten, mixColor, valueNoise2 } from '../core/math';

const lightenC = (c: number) => lighten(c, 0.2);
import { Rng } from '../core/rng';
import { isSolidTile, T_BREAK, T_SECRET, T_SPIKE } from '../gen/tiles';
import type { RoomWorld } from '../game/room';
import { natural, shade } from './style';
import { tex } from './textures';

const CHUNK = 16;
const ISO = 0.5;

interface Chunk {
  cx: number;
  cy: number;
  c: Container;
  caustic: TilingSprite | null;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Outward normal (toward open water). */
  nx: number;
  ny: number;
}

type Emit = { poly(pts: number[]): void; rect(x: number, y: number, w: number, h: number): void; seg?(s: Seg): void };

/**
 * Marching squares on the dual grid (corners at tile centres). Cells whose four
 * corners are inside merge into horizontal runs to keep geometry light.
 */
function march(val: (i: number, j: number) => number, i0: number, i1: number, j0: number, j1: number, out: Emit, T = TILE, off = T / 2) {
  for (let j = j0; j <= j1; j++) {
    let run = -1;
    const flush = (end: number) => {
      if (run >= 0) out.rect(run * T + off, j * T + off, (end - run) * T, T);
      run = -1;
    };
    for (let i = i0; i <= i1; i++) {
      const a = val(i, j), b = val(i + 1, j), c = val(i + 1, j + 1), d = val(i, j + 1);
      const ia = a >= ISO, ib = b >= ISO, ic = c >= ISO, id = d >= ISO;
      if (ia && ib && ic && id) {
        if (run < 0) run = i;
        continue;
      }
      flush(i);
      if (!ia && !ib && !ic && !id) continue;
      const x = i * T + off, y = j * T + off;
      const lerp = (p: number, q: number) => (ISO - p) / (q - p);
      const top = [x + lerp(a, b) * T, y];
      const right = [x + T, y + lerp(b, c) * T];
      const bottom = [x + lerp(d, c) * T, y + T];
      const left = [x, y + lerp(a, d) * T];
      const saddle = ia === ic && ib === id && ia !== ib;
      const centre = (a + b + c + d) / 4 >= ISO;
      if (saddle && !centre) {
        // Two separate corners of rock.
        if (ia) out.poly([x, y, ...top, ...left]);
        if (ib) out.poly([x + T, y, ...right, ...top]);
        if (ic) out.poly([x + T, y + T, ...bottom, ...right]);
        if (id) out.poly([x, y + T, ...left, ...bottom]);
      } else {
        const pts: number[] = [];
        if (ia) pts.push(x, y);
        if (ia !== ib) pts.push(...top);
        if (ib) pts.push(x + T, y);
        if (ib !== ic) pts.push(...right);
        if (ic) pts.push(x + T, y + T);
        if (ic !== id) pts.push(...bottom);
        if (id) pts.push(x, y + T);
        if (id !== ia) pts.push(...left);
        out.poly(pts);
      }
      if (!out.seg) continue;
      // Contour segments with outward normals.
      const cross: number[][] = [];
      if (ia !== ib) cross.push(top);
      if (ib !== ic) cross.push(right);
      if (ic !== id) cross.push(bottom);
      if (id !== ia) cross.push(left);
      const pairs: [number[], number[]][] = [];
      if (cross.length === 2) pairs.push([cross[0], cross[1]]);
      else if (cross.length === 4) {
        // top, right, bottom, left
        const insideJoined = centre;
        const tlIn = ia;
        if (insideJoined === tlIn) {
          pairs.push([cross[0], cross[1]], [cross[2], cross[3]]);
        } else {
          pairs.push([cross[3], cross[0]], [cross[1], cross[2]]);
        }
      }
      for (const [p, q] of pairs) {
        const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
        // Gradient of the bilinear field → points toward rock.
        const u = (mx - x) / T, v = (my - y) / T;
        const gx = (b - a) * (1 - v) + (c - d) * v;
        const gy = (d - a) * (1 - u) + (c - b) * u;
        const l = Math.hypot(gx, gy) || 1;
        out.seg({ ax: p[0], ay: p[1], bx: q[0], by: q[1], nx: -gx / l, ny: -gy / l });
      }
    }
    flush(i1 + 1);
  }
}

/** Join loose contour segments into polylines (so strokes have clean joins). */
function chain(segs: Seg[]): Seg[][] {
  const key = (x: number, y: number) => `${Math.round(x * 4)},${Math.round(y * 4)}`;
  const at = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const k of [key(s.ax, s.ay), key(s.bx, s.by)]) {
      let l = at.get(k);
      if (!l) at.set(k, (l = []));
      l.push(i);
    }
  });
  const used = new Uint8Array(segs.length);
  const flip = (s: Seg): Seg => ({ ax: s.bx, ay: s.by, bx: s.ax, by: s.ay, nx: s.nx, ny: s.ny });
  const next = (x: number, y: number) => {
    for (const i of at.get(key(x, y)) ?? []) if (!used[i]) return i;
    return -1;
  };
  const out: Seg[][] = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const line = [segs[i]];
    for (let e = line[0], j = next(e.bx, e.by); j >= 0; j = next(e.bx, e.by)) {
      used[j] = 1;
      const s = segs[j];
      e = key(s.ax, s.ay) === key(e.bx, e.by) ? s : flip(s);
      line.push(e);
    }
    for (let e = line[0], j = next(e.ax, e.ay); j >= 0; j = next(e.ax, e.ay)) {
      used[j] = 1;
      const s = segs[j];
      e = key(s.bx, s.by) === key(e.ax, e.ay) ? s : flip(s);
      line.unshift(e);
    }
    out.push(line);
  }
  return out;
}

/** Stroke the runs of a chain whose segments pass `pick`, offset inward by k. */
function strokeRuns(g: Graphics, lines: Seg[][], pick: (s: Seg) => boolean, k: number) {
  for (const line of lines) {
    let open = false;
    for (const s of line) {
      if (!pick(s)) {
        open = false;
        continue;
      }
      if (!open) {
        g.moveTo(s.ax - s.nx * k, s.ay - s.ny * k);
        open = true;
      }
      g.lineTo(s.bx - s.nx * k, s.by - s.ny * k);
    }
  }
}

export class TerrainView {
  /** Rock and everything drawn on it. */
  container = new Container();
  surfaceG = new Graphics();
  private chunkLayer = new Container();
  private chunks: Chunk[] = [];
  private cols = 0;
  private rows = 0;
  private rockTex = tex().rock;
  private rockMatrix = new Matrix().scale(1.4, 1.4);
  private field = new Float32Array(0);
  private depthField = new Float32Array(0);

  constructor() {
    this.container.addChild(this.chunkLayer, this.surfaceG);
  }

  /** Tinted rock texture, anchored in world space so chunks tile seamlessly. */
  private rockFill(color: number) {
    return { texture: this.rockTex, color, matrix: this.rockMatrix, textureSpace: 'global' as const };
  }

  private lastW: RoomWorld | null = null;

  /** True where the drawn (noisy, smoothed) rock is, which can differ slightly from the tiles. */
  visualRockAt(x: number, y: number) {
    const w = this.lastW;
    if (!w) return false;
    const Wt = w.tw + 2;
    const fx = clamp(x / TILE - 0.5 + 1, 0, w.tw + 1), fy = clamp(y / TILE - 0.5 + 1, 0, w.th + 1);
    const ix = Math.min(Math.floor(fx), w.tw), iy = Math.min(Math.floor(fy), w.th);
    const u = fx - ix, v = fy - iy;
    const k = iy * Wt + ix;
    const f = this.field;
    const base = (f[k] * (1 - u) + f[k + 1] * u) * (1 - v) + (f[k + Wt] * (1 - u) + f[k + Wt + 1] * u) * v;
    const seed = w.spec.tw * 13 + w.depth * 101;
    const noise = (valueNoise2(x / 70, y / 70, seed) - 0.5) * 0.3 + (valueNoise2(x / 26, y / 26, seed + 1) - 0.5) * 0.16 + 0.03;
    if (base + noise < ISO) return false;
    for (const ho of w.holes) if ((x - ho.x) ** 2 + (y - ho.y) ** 2 < ho.r * ho.r) return false;
    return true;
  }

  private holesNear(w: RoomWorld, x0: number, y0: number, x1: number, y1: number) {
    const m = TILE * 6;
    return w.holes.filter((ho) => ho.x + ho.r + m > x0 && ho.x - ho.r - m < x1 && ho.y + ho.r + m > y0 && ho.y - ho.r - m < y1);
  }

  private isRock(w: RoomWorld, x: number, y: number) {
    if (x < 0 || x >= w.tw || y >= w.th) return true;
    if (y < 0) return !this.surfaceOpen(w, x);
    if (y === 0 && this.surfaceOpen(w, x) && !isSolidTile(w.tiles[w.tw + x])) return false;
    const t = w.tiles[y * w.tw + x];
    return t !== T_BREAK && isSolidTile(t);
  }

  private surfaceOpen(w: RoomWorld, x: number) {
    const s = w.spec.surfaceSpan;
    return !!s && x >= s.x0 && x <= s.x1;
  }

  /** Scalar field at tile centres, padded by one tile on each side. */
  private computeField(w: RoomWorld) {
    const W = w.tw + 2, H = w.th + 2;
    if (this.field.length !== W * H) {
      this.field = new Float32Array(W * H);
      this.depthField = new Float32Array(W * H);
    }
    const seed = w.spec.tw * 31 + w.depth * 7;
    for (let y = -1; y <= w.th; y++)
      for (let x = -1; x <= w.tw; x++) {
        const h = hash2(x, y, seed);
        this.field[(y + 1) * W + x + 1] = this.isRock(w, x, y) ? 0.72 + h * 0.28 : h * 0.26;
      }
    // Distance into the rock (in tiles, capped) for core shading.
    const D = this.depthField;
    for (let i = 0; i < D.length; i++) D[i] = this.field[i] >= ISO ? 9 : 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!D[i]) continue;
        if (x > 0) D[i] = Math.min(D[i], D[i - 1] + 1);
        if (y > 0) D[i] = Math.min(D[i], D[i - W] + 1);
      }
    for (let y = H - 1; y >= 0; y--)
      for (let x = W - 1; x >= 0; x--) {
        const i = y * W + x;
        if (!D[i]) continue;
        if (x < W - 1) D[i] = Math.min(D[i], D[i + 1] + 1);
        if (y < H - 1) D[i] = Math.min(D[i], D[i + W] + 1);
      }
  }


  build(w: RoomWorld) {
    this.lastW = w;
    for (const ch of this.chunks) ch.c.destroy({ children: true });
    this.chunks = [];
    this.computeField(w);
    this.cols = Math.ceil(w.tw / CHUNK);
    this.rows = Math.ceil(w.th / CHUNK);
    for (let cy = 0; cy < this.rows; cy++)
      for (let cx = 0; cx < this.cols; cx++) {
        const ch = this.buildChunk(w, cx, cy);
        this.chunks.push(ch);
        this.chunkLayer.addChild(ch.c);
      }
    w.dirtyTiles.length = 0;
  }

  /** Redraw only the chunks touched by changed tiles. */
  rebuildDirty(w: RoomWorld) {
    if (!w.dirtyTiles.length) return;
    this.computeField(w);
    const todo = new Set<number>();
    for (const i of w.dirtyTiles) {
      const tx = i % w.tw, ty = Math.floor(i / w.tw);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const cx = Math.floor((tx + dx) / CHUNK), cy = Math.floor((ty + dy) / CHUNK);
          if (cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows) todo.add(cy * this.cols + cx);
        }
    }
    w.dirtyTiles.length = 0;
    for (const k of todo) {
      const old = this.chunks[k];
      const ch = this.buildChunk(w, old.cx, old.cy);
      const idx = this.chunkLayer.getChildIndex(old.c);
      this.chunkLayer.addChildAt(ch.c, idx);
      old.c.destroy({ children: true });
      this.chunks[k] = ch;
    }
  }

  private buildChunk(w: RoomWorld, cx: number, cy: number): Chunk {
    const b = w.biome;
    const c = new Container();
    const shadow = new Graphics();
    const rock = new Graphics();
    const core = new Graphics();
    const detail = new Graphics();
    // The contour is traced on a third-of-a-tile grid over the smoothed tile
    // field plus two octaves of noise, so walls wander like real reef. Craters
    // blown into the rock are subtracted as round holes.
    const h = TILE / 3;
    const n = CHUNK * 3;
    const i0 = cx * n, i1 = Math.min(Math.ceil(w.widthPx / h) - 1, i0 + n - 1);
    const j0 = cy * n, j1 = Math.min(Math.ceil(w.heightPx / h) - 1, j0 + n - 1);
    const Wt = w.tw + 2;
    const seed = w.spec.tw * 13 + w.depth * 101;
    const bil = (arr: Float32Array, x: number, y: number) => {
      const fx = clamp(x / TILE - 0.5 + 1, 0, w.tw + 1), fy = clamp(y / TILE - 0.5 + 1, 0, w.th + 1);
      const ix = Math.min(Math.floor(fx), w.tw), iy = Math.min(Math.floor(fy), w.th);
      const u = fx - ix, v = fy - iy;
      const k = iy * Wt + ix;
      return (arr[k] * (1 - u) + arr[k + 1] * u) * (1 - v) + (arr[k + Wt] * (1 - u) + arr[k + Wt + 1] * u) * v;
    };
    const holes = this.holesNear(w, i0 * h - h, j0 * h - h, (i1 + 2) * h, (j1 + 2) * h);
    const cols = i1 - i0 + 2;
    const fv = new Float32Array(cols * (j1 - j0 + 2));
    const dv = new Float32Array(fv.length);
    for (let j = j0; j <= j1 + 1; j++)
      for (let i = i0; i <= i1 + 1; i++) {
        const x = i * h, y = j * h;
        const noise = (valueNoise2(x / 70, y / 70, seed) - 0.5) * 0.3 + (valueNoise2(x / 26, y / 26, seed + 1) - 0.5) * 0.16 + 0.03;
        const k = (j - j0) * cols + (i - i0);
        fv[k] = bil(this.field, x, y) + noise;
        dv[k] = Math.min(bil(this.depthField, x, y), 6) / 6 + noise * 0.6;
        for (const ho of holes) {
          const d = Math.hypot(x - ho.x, y - ho.y) - ho.r;
          if (d > TILE * 2) continue;
          fv[k] = Math.min(fv[k], ISO + d / 24);
          // Freshly exposed rock is lit like an outer face, blending back to the core.
          dv[k] = Math.min(dv[k], Math.max(0, d) / (TILE * 6) + Math.max(0, d - TILE) / TILE);
        }
      }
    const val = (i: number, j: number) => fv[(j - j0) * cols + (i - i0)];
    const rockBase = mixColor(b.rock, b.rockDark, 0.2);
    const H = w.heightPx;
    const colAt = (y: number) => mixColor(rockBase, b.rockDark, clamp(y / H, 0, 1) * 0.45);
    const segs: Seg[] = [];
    const bandCol = (y: number) => colAt(Math.floor(y / (TILE * 3)) * TILE * 3);
    march(val, i0, i1, j0, j1, {
      poly: (pts) => rock.poly(pts).fill(this.rockFill(bandCol(pts[1]))),
      rect: (x, y, ww, hh) => rock.rect(x, y, ww, hh).fill(this.rockFill(bandCol(y))),
      seg: (sg) => segs.push(sg),
    }, h, 0);
    // Darker, colder core: nested contours of distance into the rock.
    for (const [lvl, a] of [[0.2, 0.12], [0.34, 0.13], [0.48, 0.14], [0.62, 0.15], [0.8, 0.18]] as const) {
      const f = (i: number, j: number) => dv[(j - j0) * cols + (i - i0)] - lvl + ISO;
      march(f, i0, i1, j0, j1, {
        poly: (pts) => core.poly(pts).fill({ color: 0x03060a, alpha: a }),
        rect: (x, y, ww, hh) => core.rect(x, y, ww, hh).fill({ color: 0x03060a, alpha: a }),
      }, h, 0);
    }
    const lines = chain(segs);
    // Contact shadow in the water, hugging the rock.
    strokeRuns(shadow, lines, () => true, 0);
    shadow.stroke({ width: 18, color: 0x02050a, alpha: 0.3, cap: 'round', join: 'round' });
    const rng = new Rng((cx * 73856093) ^ (cy * 19349663) ^ (w.depth * 83492791));
    // Coralline algae and sponge crusts in patches along the lit edges.
    const crust = [mixColor(b.decoColors[0], rockBase, 0.35), mixColor(b.plantColor, rockBase, 0.3), mixColor(b.decoColors[2] ?? b.accent, rockBase, 0.4)];
    for (const line of lines) {
      let run = 0;
      let col = rng.pick(crust);
      for (const sg of line) {
        if (run <= 0) {
          run = rng.int(-6, 8);
          col = rng.pick(crust);
        }
        run--;
        if (run < 0) continue;
        const px = (sg.ax + sg.bx) / 2 - sg.nx * rng.range(4, 10), py = (sg.ay + sg.by) / 2 - sg.ny * rng.range(4, 10);
        detail.ellipse(px, py, rng.range(5, 11), rng.range(3, 7)).fill({ color: col, alpha: 0.55 });
      }
    }
    // Silt on top faces, deep shadow under overhangs, a thin dark lip.
    const sand = b.sand;
    strokeRuns(detail, lines, (sg) => sg.ny < -0.4, 5);
    detail.stroke({ width: 10, color: darken(sand, 0.12), alpha: 0.85, cap: 'round', join: 'round' });
    strokeRuns(detail, lines, (sg) => sg.ny < -0.4, 1);
    detail.stroke({ width: 2.5, color: mixColor(sand, 0xffffff, 0.25), alpha: 0.5, cap: 'round', join: 'round' });
    strokeRuns(detail, lines, (sg) => sg.ny > 0.35, 10);
    detail.stroke({ width: 20, color: 0x000000, alpha: 0.3, cap: 'round', join: 'round' });
    // Rim light: the water's glow catching every edge keeps the silhouette readable.
    strokeRuns(detail, lines, () => true, 4);
    detail.stroke({ width: 5, color: mixColor(b.waterTop, 0xffffff, 0.35), alpha: 0.16, cap: 'round', join: 'round' });
    strokeRuns(detail, lines, () => true, 0);
    detail.stroke({ width: 1.6, color: 0x05080c, alpha: 0.5, cap: 'round', join: 'round' });
    // Pores, tube worms, specks.
    for (const sg of segs) {
      if (!rng.chance(0.3)) continue;
      const t = rng.next();
      const px = sg.ax + (sg.bx - sg.ax) * t - sg.nx * rng.range(6, 22);
      const py = sg.ay + (sg.by - sg.ay) * t - sg.ny * rng.range(6, 22);
      if (rng.chance(0.5)) detail.circle(px, py, rng.range(1.5, 3.2)).fill({ color: 0x05080c, alpha: 0.45 });
      else detail.ellipse(px, py, rng.range(2, 5), rng.range(1.5, 3.5)).fill({ color: rng.pick([mixColor(b.accent, rockBase, 0.5), lightenC(rockBase)]), alpha: 0.8 });
    }

    // Tile features inside this chunk.
    const tx0 = cx * CHUNK, tx1 = Math.min(w.tw - 1, cx * CHUNK + CHUNK - 1);
    const ty0 = cy * CHUNK, ty1 = Math.min(w.th - 1, cy * CHUNK + CHUNK - 1);
    for (let y = ty0; y <= ty1; y++)
      for (let x = tx0; x <= tx1; x++) {
        const k = w.tiles[y * w.tw + x];
        const px = x * TILE, py = y * TILE;
        if (k === T_SECRET) {
          const ccx = px + TILE / 2, ccy = py + TILE / 2;
          detail.moveTo(ccx - 14, ccy - 12).lineTo(ccx - 3, ccy - 2).lineTo(ccx - 8, ccy + 8).lineTo(ccx + 4, ccy + 15)
            .moveTo(ccx - 3, ccy - 2).lineTo(ccx + 12, ccy - 8)
            .stroke({ width: 1.6, color: 0x000000, alpha: 0.5 });
        } else if (k === T_BREAK) {
          // Old clay amphorae.
          const ccx = px + TILE / 2, by = py + TILE;
          const col = natural(w.depth === 3 ? 0x9a6b45 : rng.pick([0xb8703a, 0xa8603a, 0x8a5a3a]));
          detail.ellipse(ccx, by - 1, 16, 4).fill({ color: 0x000000, alpha: 0.35 });
          detail.moveTo(ccx - 13, by - 2).quadraticCurveTo(ccx - 23, by - 26, ccx - 8, by - 38).lineTo(ccx + 8, by - 38)
            .quadraticCurveTo(ccx + 23, by - 26, ccx + 13, by - 2).closePath().fill(shade(col, 1.2));
          detail.rect(ccx - 8, by - 44, 16, 7).fill(shade(darken(col, 0.15)));
          detail.ellipse(ccx - 7, by - 26, 2.5, 7).fill({ color: 0xffffff, alpha: 0.18 });
          for (let i = 0; i < 3; i++) detail.circle(ccx + rng.range(-10, 10), by - rng.range(6, 30), rng.range(1, 2.5)).fill({ color: mixColor(b.plantColor, col, 0.4), alpha: 0.7 });
        } else if (k === T_SPIKE) {
          // Urchin beds: dark spiny tests.
          for (let q = 0; q < 2; q++) {
            const ucx = px + 12 + q * 24, ucy = py + TILE - 9;
            for (let i = 0; i < 15; i++) {
              const a = Math.PI + 0.1 + (i / 14) * (Math.PI - 0.2);
              const L = 14 + ((i * 7) % 5);
              detail.moveTo(ucx, ucy).lineTo(ucx + Math.cos(a) * L, ucy + Math.sin(a) * L).stroke({ width: 1.2, color: 0x2a1838, alpha: 0.95 });
            }
            detail.circle(ucx, ucy, 8).fill(shade(0x3a2250, 1.2));
          }
        }
      }

    c.addChild(shadow, rock, core, detail);
    // Caustics play over rock near the sunlit surface.
    const x0 = i0 * h, y0 = j0 * h;
    const x1 = (i1 + 1) * h, y1 = (j1 + 1) * h;
    const light = w.spec.surface ? b.lightTop * clamp(1 - y0 / (TILE * 24), 0, 1) : 0;
    let caustic: TilingSprite | null = null;
    if (light > 0.05) {
      const mask = new Graphics();
      march(val, i0, i1, j0, j1, {
        poly: (pts) => mask.poly(pts).fill(0xffffff),
        rect: (x, y, ww, hh) => mask.rect(x, y, ww, hh).fill(0xffffff),
      }, h, 0);
      caustic = new TilingSprite({ texture: tex().caustic, width: x1 - x0, height: y1 - y0 });
      caustic.position.set(x0, y0);
      caustic.blendMode = 'add';
      caustic.alpha = 0.1 * light;
      caustic.tileScale.set(1.7);
      caustic.mask = mask;
      c.addChild(mask, caustic);
    }
    return { cx, cy, c, caustic, x0: x0 - 30, y0: y0 - 30, x1: x1 + 30, y1: y1 + 30 };
  }

  update(t: number, w: RoomWorld, view: { x0: number; y0: number; x1: number; y1: number }) {
    for (const ch of this.chunks) {
      const vis = ch.x1 > view.x0 && ch.x0 < view.x1 && ch.y1 > view.y0 && ch.y0 < view.y1;
      ch.c.visible = vis;
      if (vis && ch.caustic) ch.caustic.tilePosition.set(t * 9 - ch.caustic.x, t * 4 - ch.caustic.y);
    }
    // Snell's window: the bright, rippling underside of the surface.
    const sg = this.surfaceG;
    sg.clear();
    const span = w.spec.surfaceSpan;
    if (!span) return;
    const X0 = span.x0 * TILE - TILE * 0.5, X1 = (span.x1 + 1) * TILE + TILE * 0.5;
    if (X1 < view.x0 || X0 > view.x1 || view.y0 > TILE * 3) return;
    const yAt = (x: number) => TILE * 0.75 + Math.sin(x * 0.03 + t * 1.6) * 5 + Math.sin(x * 0.07 - t * 2.4) * 2;
    sg.moveTo(X0, 0);
    for (let x = X0; x <= X1; x += 16) sg.lineTo(x, yAt(x));
    sg.lineTo(X1, 0).closePath().fill(vertFade(0xdffcff, 0.75));
    sg.moveTo(X0, yAt(X0));
    for (let x = X0 + 16; x <= X1; x += 16) sg.lineTo(x, yAt(x));
    sg.stroke({ width: 1.5, color: 0xffffff, alpha: 0.7 });
    for (let i = 0; i < 14; i++) {
      const x = X0 + ((i * 137 + t * 24) % (X1 - X0));
      sg.ellipse(x, TILE * 0.45 + Math.sin(t + i) * 4, 22, 2.5).fill({ color: 0xffffff, alpha: 0.25 + Math.sin(t * 3 + i) * 0.15 });
    }
  }
}

const fadeCache = new Map<string, FillGradient>();
/** Vertical fade from a color (top) to transparent (bottom), or reversed. */
function vertFade(color: number, alpha: number, reverse = false) {
  const key = `${color}:${alpha}:${reverse}`;
  let f = fadeCache.get(key);
  if (f) return f;
  const hex = '#' + color.toString(16).padStart(6, '0');
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  f = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    textureSpace: 'local',
    colorStops: reverse
      ? [{ offset: 0, color: hex + '00' }, { offset: 1, color: hex + a }]
      : [{ offset: 0, color: hex + a }, { offset: 1, color: hex + '00' }],
  });
  fadeCache.set(key, f);
  return f;
}
