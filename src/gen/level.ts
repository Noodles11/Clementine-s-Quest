// Whole-depth level generation: one large, organic reef labyrinth per depth.
//
// Layout: a macro grid of chambers linked by a randomized spanning tree (plus a
// few loops) is carved into solid rock as irregular blobs and winding tunnels,
// then smoothed with cellular automata so it reads as reef rather than bricks.
// Dead ends become caves (treasure, shop, secret, curse, side pockets). The boss
// arena sits at the bottom, farthest along the path from the start.

import { TILE } from '../config';
import { valueNoise1, valueNoise2 } from '../core/math';
import { Rng, stream } from '../core/rng';
import { ItemPools } from '../game/pools';
import { biomeFor, type BossKind, type EnemyKind } from './biomes';
import { isSolidTile, T_BREAK, T_EMPTY, T_ROCK, T_SECRET, T_SPIKE, type Attach, type Decor, type Spawn } from './tiles';

export type CaveKind = 'treasure' | 'shop' | 'secret' | 'curse' | 'side';

export interface Chamber {
  id: number;
  mx: number;
  my: number;
  /** Centre in tiles. */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  kind: 'start' | 'path' | 'cave' | 'boss';
  cave?: CaveKind;
  dist: number;
}

export interface SpawnGroup {
  id: number;
  x: number;
  y: number;
  r: number;
  spawns: Spawn[];
}

export interface PedestalSpec {
  x: number;
  y: number;
  itemId: string | null;
  price?: number;
  pickup?: string;
  hearts?: number;
}

export interface Gate {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

export interface LevelSpec {
  depth: number;
  tw: number;
  th: number;
  tiles: Uint8Array;
  surface: boolean;
  /** Tile columns [x0, x1] where row 0 is the open water surface. */
  surfaceSpan?: { x0: number; x1: number };
  chambers: Chamber[];
  edges: [number, number][];
  start: { x: number; y: number };
  boss: {
    kind: BossKind;
    arena: { x0: number; y0: number; x1: number; y1: number };
    crack: { x0: number; x1: number; y: number };
    gates: Gate[];
    item: string;
    grottoItems: string[];
  };
  groups: SpawnGroup[];
  pedestals: PedestalSpec[];
  pickups: { kind: string; x: number; y: number }[];
  shopkeeper?: { x: number; y: number };
  decor: Decor[];
  poolRemovedAfter: string[];
  /** Sealed pockets beside a corridor: one ink bomb opens them (px). */
  pockets?: { x: number; y: number; rx: number; ry: number }[];
  /** Coins buried just under the rock surface; a faint X marks the spot (px). */
  buried?: { x: number; y: number; mx: number; my: number; coins: string[] }[];
}

export interface LevelOptions {
  seed: number;
  depth: number;
  unlocked: Iterable<string>;
  poolRemoved: Iterable<string>;
}

const CW = 24; // macro cell size in tiles
const CH = 18;
const MARGIN = 4;

const MACRO: Record<number, [number, number]> = { 1: [5, 4], 2: [6, 5], 3: [7, 5] };

export function generateLevel(opts: LevelOptions): LevelSpec {
  const { seed, depth } = opts;
  for (let attempt = 0; attempt < 40; attempt++) {
    const rng = stream(seed, 'level', depth, attempt);
    const spec = tryGenerate(rng, opts, attempt);
    if (spec) return spec;
  }
  throw new Error('Level generation failed');
}

function tryGenerate(rng: Rng, opts: LevelOptions, attempt: number): LevelSpec | null {
  const { depth, seed } = opts;
  const biome = biomeFor(depth);
  const [MW, MH] = MACRO[Math.min(3, Math.max(1, depth))];
  const tw = MW * CW + MARGIN * 2;
  const th = MH * CH + MARGIN * 2;
  const tiles = new Uint8Array(tw * th).fill(T_ROCK);
  const keep = new Uint8Array(tw * th); // protected from smoothing
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= tw || y >= th ? T_ROCK : tiles[y * tw + x]);
  const set = (x: number, y: number, v: number) => {
    if (x >= 1 && y >= 1 && x < tw - 1 && y < th - 1) tiles[y * tw + x] = v;
  };
  const nseed = (seed ^ (depth * 7919) ^ attempt) & 0xffff;

  // ── Macro maze ────────────────────────────────────────────
  const idx = (x: number, y: number) => y * MW + x;
  const startMx = rng.int(1, MW - 2);
  const visited = new Uint8Array(MW * MH);
  const adj: number[][] = Array.from({ length: MW * MH }, () => []);
  const edges: [number, number][] = [];
  const stack = [idx(startMx, 0)];
  visited[stack[0]] = 1;
  while (stack.length) {
    const c = stack[stack.length - 1];
    const cx = c % MW, cy = (c / MW) | 0;
    const nbs = rng.shuffle([
      [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1], [cx + 1, cy], [cx - 1, cy], // bias horizontal corridors
    ]).filter(([x, y]) => x >= 0 && y >= 0 && x < MW && y < MH && !visited[idx(x, y)]);
    if (!nbs.length) {
      stack.pop();
      continue;
    }
    const [nx, ny] = nbs[0];
    const n = idx(nx, ny);
    visited[n] = 1;
    adj[c].push(n);
    adj[n].push(c);
    edges.push([c, n]);
    stack.push(n);
  }
  // A few loops keep it a labyrinth rather than a tree.
  const loops = Math.round(MW * MH * 0.12);
  for (let i = 0; i < loops * 4 && edges.length < MW * MH - 1 + loops; i++) {
    const x = rng.int(0, MW - 1), y = rng.int(0, MH - 1);
    const [dx, dy] = rng.pick([[1, 0], [0, 1]]);
    if (x + dx >= MW || y + dy >= MH) continue;
    const a = idx(x, y), b = idx(x + dx, y + dy);
    if (adj[a].includes(b)) continue;
    adj[a].push(b);
    adj[b].push(a);
    edges.push([a, b]);
  }
  // BFS distance from the start.
  const dist = new Int32Array(MW * MH).fill(-1);
  const q = [idx(startMx, 0)];
  dist[q[0]] = 0;
  while (q.length) {
    const c = q.shift()!;
    for (const n of adj[c]) if (dist[n] < 0) {
      dist[n] = dist[c] + 1;
      q.push(n);
    }
  }
  // Boss: farthest cell on the bottom row.
  let bossCell = -1;
  for (let x = 0; x < MW; x++) {
    const c = idx(x, MH - 1);
    if (bossCell < 0 || dist[c] > dist[bossCell]) bossCell = c;
  }
  // The boss arena should be a dead end reached by one tunnel; prune extra links.
  while (adj[bossCell].length > 1) {
    const other = adj[bossCell].reduce((a, b) => (dist[a] > dist[b] ? a : b));
    // Only drop a link if the other cell stays connected through something else.
    adj[bossCell] = adj[bossCell].filter((n) => n !== other);
    adj[other] = adj[other].filter((n) => n !== bossCell);
    const ei = edges.findIndex(([a, b]) => (a === bossCell && b === other) || (b === bossCell && a === other));
    edges.splice(ei, 1);
    if (!connected(adj, MW * MH, idx(startMx, 0))) return null;
  }

  // ── Chambers ──────────────────────────────────────────────
  const chambers: Chamber[] = [];
  const startCell = idx(startMx, 0);
  const leaves = [];
  for (let c = 0; c < MW * MH; c++) {
    const mx = c % MW, my = (c / MW) | 0;
    const kind: Chamber['kind'] = c === startCell ? 'start' : c === bossCell ? 'boss' : adj[c].length === 1 ? 'cave' : 'path';
    const big = kind === 'boss';
    const rx = big ? 11 : kind === 'cave' ? rng.range(4.5, 6) : rng.range(5, 8.5);
    const ry = big ? 6.5 : kind === 'cave' ? rng.range(3.2, 4.5) : rng.range(3.5, 5.5);
    const cx = MARGIN + mx * CW + CW / 2 + (big ? 0 : rng.range(-CW * 0.18, CW * 0.18));
    const cy = MARGIN + my * CH + CH / 2 + (big ? 1 : rng.range(-CH * 0.15, CH * 0.15));
    chambers.push({ id: c, mx, my, cx, cy, rx, ry, kind, dist: dist[c] });
    if (kind === 'cave') leaves.push(c);
  }
  // Assign cave roles: nearest to start are safest (treasure/shop), deeper ones riskier.
  rng.shuffle(leaves);
  const roles: CaveKind[] = ['treasure', 'shop', 'secret', 'curse', 'treasure'];
  leaves.forEach((c, i) => (chambers[c].cave = roles[i] ?? 'side'));
  if (!leaves.length || !chambers.some((c) => c.cave === 'shop')) {
    // Guarantee a shop: turn a path chamber with the fewest links into a side cave.
    const cand = chambers.filter((c) => c.kind === 'path').sort((a, b) => adj[a.id].length - adj[b.id].length)[0];
    if (cand) {
      cand.kind = 'cave';
      cand.cave = 'shop';
      cand.rx = Math.min(cand.rx, 7);
    }
  }

  // ── Carving ───────────────────────────────────────────────
  const carveBlob = (ch: Chamber) => {
    const s = (ch.id * 131 + nseed) & 0xffff;
    const x0 = Math.floor(ch.cx - ch.rx * 1.3), x1 = Math.ceil(ch.cx + ch.rx * 1.3);
    const y0 = Math.floor(ch.cy - ch.ry * 1.3), y1 = Math.ceil(ch.cy + ch.ry * 1.3);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - ch.cx) / ch.rx, dy = (y + 0.5 - ch.cy) / ch.ry;
        const a = Math.atan2(dy, dx);
        const r = 0.78 + valueNoise1((a + Math.PI) * 2.2, s) * 0.45 + valueNoise2(x * 0.3, y * 0.3, s) * 0.12;
        const d = Math.hypot(dx, dy);
        if (d < r) {
          set(x, y, T_EMPTY);
          if (d < r * 0.55) keep[y * tw + x] = 1;
        }
      }
  };
  const carveDisc = (cx: number, cy: number, r: number, protect: boolean) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d <= r) {
          set(x, y, T_EMPTY);
          if (protect && d <= Math.max(1, r - 1.2)) keep[y * tw + x] = 1;
        }
      }
  };
  const tunnelPts = new Map<string, { x: number; y: number }[]>();
  const carveTunnel = (a: Chamber, b: Chamber) => {
    const horiz = a.my === b.my;
    const mxp = (a.cx + b.cx) / 2 + (horiz ? 0 : rng.range(-5, 5));
    const myp = (a.cy + b.cy) / 2 + (horiz ? rng.range(-4, 4) : 0);
    const len = Math.hypot(b.cx - a.cx, b.cy - a.cy);
    const steps = Math.ceil(len * 2);
    const w0 = rng.range(1.35, 1.9);
    const s = (a.id * 31 + b.id * 17 + nseed) & 0xffff;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = (1 - t) * (1 - t) * a.cx + 2 * (1 - t) * t * mxp + t * t * b.cx;
      const y = (1 - t) * (1 - t) * a.cy + 2 * (1 - t) * t * myp + t * t * b.cy;
      const r = w0 + valueNoise1(i * 0.15, s) * 0.9;
      carveDisc(x, y, r, true);
      pts.push({ x, y });
    }
    tunnelPts.set(`${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`, pts);
  };
  for (const ch of chambers) carveBlob(ch);
  for (const [a, b] of edges) carveTunnel(chambers[a], chambers[b]);

  // Surface opening above the start (depth 1): open water up to the top edge.
  const start = chambers[startCell];
  const surface = biome.surface;
  let surfaceSpan: LevelSpec['surfaceSpan'];
  if (surface) {
    for (let y = 1; y < start.cy; y++) carveDisc(start.cx + Math.sin(y * 0.3) * 1.5, y, 3.2, true);
    // A sunlit lagoon right under the surface.
    const x0 = Math.max(2, Math.round(start.cx - 10)), x1 = Math.min(tw - 3, Math.round(start.cx + 10));
    for (let x = x0; x <= x1; x++) {
      const depthHere = 3 + Math.round(valueNoise1(x * 0.35, nseed) * 2.5) - (x - x0 < 2 || x1 - x < 2 ? 1 : 0);
      for (let y = 1; y <= depthHere; y++) {
        set(x, y, T_EMPTY);
        keep[y * tw + x] = 1;
      }
    }
    surfaceSpan = { x0, x1 };
  }

  // Boss arena: wide, flat floor.
  const boss = chambers[bossCell];
  const floorY = Math.round(boss.cy + boss.ry * 0.75);
  for (let x = Math.floor(boss.cx - boss.rx); x <= Math.ceil(boss.cx + boss.rx); x++) {
    for (let y = floorY; y < floorY + 4; y++) set(x, y, T_ROCK);
    for (let y = Math.round(boss.cy - boss.ry * 0.7); y < floorY; y++) {
      const dx = (x + 0.5 - boss.cx) / (boss.rx * 1.05);
      if (Math.abs(dx) < 1) {
        set(x, y, T_EMPTY);
        keep[y * tw + x] = 1;
      }
    }
  }

  // Irregular rock islands inside larger chambers.
  for (const ch of chambers) {
    if (ch.kind === 'boss' || ch.kind === 'start' || ch.rx < 7) continue;
    const n = rng.int(0, 2);
    for (let i = 0; i < n; i++) {
      const ox = ch.cx + rng.range(-ch.rx * 0.5, ch.rx * 0.5), oy = ch.cy + rng.range(-ch.ry * 0.4, ch.ry * 0.2);
      const r = rng.range(1, 1.8);
      for (let y = Math.floor(oy - r); y <= oy + r; y++)
        for (let x = Math.floor(ox - r * 1.4); x <= ox + r * 1.4; x++)
          if (Math.hypot((x - ox) / 1.4, y - oy) < r && !keep[y * tw + x]) set(x, y, T_ROCK);
    }
  }

  // ── Cellular-automata smoothing (reef, not bricks) ────────
  for (let it = 0; it < 3; it++) {
    const next = tiles.slice();
    for (let y = 1; y < th - 1; y++)
      for (let x = 1; x < tw - 1; x++) {
        const i = y * tw + x;
        if (keep[i]) continue;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(x + dx, y + dy) !== T_EMPTY) n++;
        const noise = valueNoise2(x * 0.45, y * 0.45, nseed + it) > 0.72 ? 1 : 0;
        if (n >= 5 + (it === 0 ? noise : 0)) next[i] = T_ROCK;
        else if (n <= 2) next[i] = T_EMPTY;
      }
    tiles.set(next);
  }
  // Keep the border solid.
  for (let x = 0; x < tw; x++) {
    tiles[x] = T_ROCK;
    tiles[(th - 1) * tw + x] = T_ROCK;
  }
  for (let y = 0; y < th; y++) {
    tiles[y * tw] = T_ROCK;
    tiles[y * tw + tw - 1] = T_ROCK;
  }

  // ── Connectivity ──────────────────────────────────────────
  const passable = (t: number) => t === T_EMPTY || t === T_SPIKE || t === T_BREAK || t === T_SECRET;
  const flood = () => {
    const seen = new Uint8Array(tw * th);
    const sx = Math.floor(start.cx), sy = Math.floor(start.cy);
    tiles[sy * tw + sx] = T_EMPTY;
    const st = [sy * tw + sx];
    seen[st[0]] = 1;
    while (st.length) {
      const i = st.pop()!;
      const x = i % tw, y = (i / tw) | 0;
      for (const j of [i + 1, i - 1, i + tw, i - tw]) {
        if (j < 0 || j >= tiles.length || seen[j] || !passable(tiles[j])) continue;
        if (Math.abs((j % tw) - x) > 1) continue;
        seen[j] = 1;
        st.push(j);
      }
      void y;
    }
    return seen;
  };
  let seen = flood();
  for (const ch of chambers) {
    const i = Math.floor(ch.cy) * tw + Math.floor(ch.cx);
    if (!seen[i]) {
      // Re-link a stranded chamber to the start with a direct tunnel.
      const other = chambers.filter((c) => seen[Math.floor(c.cy) * tw + Math.floor(c.cx)]).sort((a, b) => Math.hypot(a.cx - ch.cx, a.cy - ch.cy) - Math.hypot(b.cx - ch.cx, b.cy - ch.cy))[0];
      if (other) carveTunnel(ch, other);
      seen = flood();
    }
  }
  for (const ch of chambers) if (!seen[Math.floor(ch.cy) * tw + Math.floor(ch.cx)]) return null;
  for (let i = 0; i < tiles.length; i++) if (tiles[i] === T_EMPTY && !seen[i]) tiles[i] = T_ROCK;

  // ── Boss arena details ────────────────────────────────────
  const ax0 = (boss.cx - boss.rx) * TILE, ax1 = (boss.cx + boss.rx) * TILE;
  const ay0 = (boss.cy - boss.ry) * TILE, ay1 = floorY * TILE;
  const crackX = Math.round(boss.cx);
  const gates: Gate[] = [];
  for (const [a, b] of edges) {
    if (a !== bossCell && b !== bossCell) continue;
    const pts = tunnelPts.get(`${Math.min(a, b)}-${Math.max(a, b)}`)!;
    const fromBoss = pts[0] && Math.hypot(pts[0].x - boss.cx, pts[0].y - boss.cy) < 1 ? pts : [...pts].reverse();
    // First tunnel point outside the arena ellipse = where the arena is sealed.
    for (const p of fromBoss) {
      const d = Math.hypot((p.x - boss.cx) / (boss.rx + 1), (p.y - boss.cy) / (boss.ry + 1.5));
      if (d > 1) {
        const nx = boss.cx - p.x, ny = boss.cy - p.y, l = Math.hypot(nx, ny) || 1;
        gates.push({ x: p.x * TILE, y: p.y * TILE, nx: nx / l, ny: ny / l });
        break;
      }
    }
  }

  // ── Items ─────────────────────────────────────────────────
  const pools = new ItemPools(opts.unlocked, opts.poolRemoved);
  const irng = stream(seed, 'items', depth);
  const pedestals: PedestalSpec[] = [];
  const pickups: LevelSpec['pickups'] = [];
  let shopkeeper: LevelSpec['shopkeeper'];
  const floorBelow = (x: number, y: number) => {
    let yy = Math.floor(y);
    while (yy < th - 1 && at(x, yy) === T_EMPTY) yy++;
    return yy;
  };
  for (const ch of chambers) {
    if (ch.kind !== 'cave') continue;
    const cx = Math.floor(ch.cx);
    const fy = floorBelow(cx, ch.cy);
    switch (ch.cave) {
      case 'treasure':
      case 'secret':
      case 'curse': {
        const hasItem = ch.cave === 'treasure' || irng.chance(0.65);
        set(cx - 1, fy - 1, T_ROCK);
        set(cx, fy - 1, T_ROCK);
        if (hasItem) pedestals.push({ x: cx * TILE, y: (fy - 1) * TILE - 40, itemId: pools.draw(ch.cave === 'curse' ? 'curse' : ch.cave === 'secret' ? 'secret' : 'treasure', irng) });
        else for (let i = 0; i < 5; i++) pickups.push({ kind: irng.pick(['coin', 'coin5', 'bomb', 'coin', 'heart']), x: (cx + irng.range(-3, 3)) * TILE, y: (fy - 2) * TILE });
        if (ch.cave === 'curse') {
          for (let x = cx - 5; x <= cx + 5; x++) {
            if (Math.abs(x - cx) < 3) continue;
            const f = floorBelow(x, ch.cy);
            if (at(x, f) === T_ROCK && at(x, f - 1) === T_EMPTY) set(x, f - 1, T_SPIKE);
          }
        }
        break;
      }
      case 'shop': {
        const nItems = irng.int(1, 2);
        const slots: PedestalSpec[] = [];
        for (let i = 0; i < nItems; i++) slots.push({ x: 0, y: 0, itemId: pools.draw('shop', irng), price: 15 });
        const prices: Record<string, number> = { heart: 3, bomb: 5, snack: 4, foam: 5 };
        for (const p of irng.shuffle(['heart', 'bomb', 'snack', 'foam']).slice(0, 4 - nItems)) slots.push({ x: 0, y: 0, itemId: null, pickup: p, price: prices[p] });
        slots.forEach((s, i) => {
          const x = cx + Math.round((i - (slots.length - 1) / 2) * 2.6);
          const f = floorBelow(x, ch.cy);
          s.x = x * TILE;
          s.y = f * TILE - 34;
          pedestals.push(s);
        });
        const kx = cx + Math.round(slots.length * 1.5 + 2);
        shopkeeper = { x: kx * TILE, y: floorBelow(kx, ch.cy) * TILE - 30 };
        break;
      }
      default:
        pickups.push({ kind: irng.chance(0.3) ? 'goldclam' : 'clam', x: cx * TILE, y: (fy - 1) * TILE });
    }
  }
  // Secret caves: plug their tunnel with bombable rock.
  for (const ch of chambers) {
    if (ch.cave !== 'secret') continue;
    const n = adj[ch.id][0];
    const pts = tunnelPts.get(`${Math.min(ch.id, n)}-${Math.max(ch.id, n)}`);
    if (!pts) continue;
    const toCave = pts[pts.length - 1] && Math.hypot(pts[pts.length - 1].x - ch.cx, pts[pts.length - 1].y - ch.cy) < 1 ? pts : [...pts].reverse();
    const plug = toCave.find((p) => Math.hypot((p.x - ch.cx) / (ch.rx + 1.5), (p.y - ch.cy) / (ch.ry + 1.5)) < 1.4) ?? toCave[Math.floor(toCave.length * 0.7)];
    for (let y = Math.floor(plug.y - 4); y <= plug.y + 4; y++)
      for (let x = Math.floor(plug.x - 4); x <= plug.x + 4; x++)
        if (Math.hypot(x + 0.5 - plug.x, y + 0.5 - plug.y) < 2.6 && at(x, y) === T_EMPTY) set(x, y, T_SECRET);
  }
  const bossKind = irng.pick(biome.bosses);
  const bossItem = pools.draw('boss', irng);
  const grottoItems = [pools.draw('grotto', irng), pools.draw('grotto', irng)];

  // Breakable pots here and there.
  const brng = stream(seed, 'pots', depth);
  for (const ch of chambers) {
    if (ch.kind === 'boss') continue;
    const n = brng.int(0, ch.kind === 'cave' ? 2 : 1);
    for (let i = 0; i < n; i++) {
      const x = Math.floor(ch.cx + brng.range(-ch.rx * 0.7, ch.rx * 0.7));
      const f = floorBelow(x, ch.cy);
      if (at(x, f) === T_ROCK && at(x, f - 1) === T_EMPTY && at(x, f - 2) === T_EMPTY) set(x, f - 1, T_BREAK);
    }
  }
  // Urchin beds on deeper floors.
  if (depth >= 2) {
    for (const ch of chambers) {
      if (ch.kind !== 'path' || !brng.chance(0.35)) continue;
      const x0 = Math.floor(ch.cx + brng.range(-ch.rx * 0.5, ch.rx * 0.3));
      for (let x = x0; x < x0 + 3; x++) {
        const f = floorBelow(x, ch.cy);
        if (at(x, f) === T_ROCK && at(x, f - 1) === T_EMPTY) set(x, f - 1, T_SPIKE);
      }
    }
  }

  // ── Encounters ────────────────────────────────────────────
  const groups: SpawnGroup[] = [];
  const erng = stream(seed, 'enemies', depth);
  for (const ch of chambers) {
    if (ch.kind === 'start' || ch.kind === 'boss' || (ch.kind === 'cave' && ch.cave !== 'side' && ch.cave !== 'curse')) continue;
    const spawns = placeEnemies(erng, tiles, tw, th, ch, depth);
    if (spawns.length) groups.push({ id: groups.length, x: ch.cx * TILE, y: ch.cy * TILE, r: Math.max(ch.rx, ch.ry) * TILE * 1.3, spawns });
  }

  // ── Sealed pockets: small chambers one bomb below a corridor floor ──
  const arenaT = { x0: boss.cx - boss.rx - 3, x1: boss.cx + boss.rx + 3, y0: boss.cy - boss.ry - 3, y1: floorY + 5 };
  const nearSpecial = (x: number, y: number) =>
    (x > arenaT.x0 && x < arenaT.x1 && y > arenaT.y0 && y < arenaT.y1) ||
    chambers.some((c) => c.cave === 'shop' && Math.abs(x - c.cx) < c.rx + 4 && Math.abs(y - c.cy) < c.ry + 4) ||
    Math.hypot(x - start.cx, y - start.cy) < 6;
  const prng = stream(seed, 'pockets', depth);
  const pockets: NonNullable<LevelSpec['pockets']> = [];
  const PRX = 2.6, PRY = 1.8;
  const cands: { x: number; f: number }[] = [];
  for (let f = 4; f < th - 8; f++)
    for (let x = 6; x < tw - 6; x++)
      if (at(x, f) === T_ROCK && at(x, f - 1) === T_EMPTY && at(x, f - 2) === T_EMPTY && !nearSpecial(x, f)) cands.push({ x, f });
  prng.shuffle(cands);
  const wantPockets = depth === 1 ? 4 : depth === 2 ? 5 : 6;
  for (const c of cands) {
    if (pockets.length >= wantPockets) break;
    const cx = c.x + 0.5, cy = c.f + 1 + PRY;
    if (pockets.some((q) => Math.hypot(q.x / TILE - cx, q.y / TILE - cy) < 10)) continue;
    // The wall row and everything around the pocket must be solid rock.
    let ok = cy + PRY + 2 < th - 3;
    for (let y = c.f; ok && y <= Math.ceil(cy + PRY + 1.5); y++)
      for (let x = Math.floor(cx - PRX - 1.5); ok && x <= Math.ceil(cx + PRX + 1.5); x++) if (at(x, y) !== T_ROCK) ok = false;
    if (!ok) continue;
    for (let y = c.f + 1; y <= cy + PRY; y++)
      for (let x = Math.floor(cx - PRX); x <= cx + PRX; x++) {
        const dx = (x + 0.5 - cx) / PRX, dy = (y + 0.5 - cy) / PRY;
        if (dx * dx + dy * dy <= 1.05) set(x, y, T_EMPTY);
      }
    pockets.push({ x: cx * TILE, y: cy * TILE, rx: PRX * TILE, ry: PRY * TILE });
    const fy = floorBelow(Math.floor(cx), cy);
    if (pockets.length === 1) pedestals.push({ x: cx * TILE, y: fy * TILE - 34, itemId: pools.draw('treasure', prng) });
    else if (prng.chance(0.3)) pickups.push({ kind: prng.chance(0.4) ? 'goldclam' : 'clam', x: cx * TILE, y: (fy - 0.5) * TILE });
    else for (let i = 0; i < prng.int(3, 5); i++) pickups.push({ kind: prng.pick(['coin', 'coin', 'coin5', 'heart', 'bomb', 'bomb']), x: (cx + prng.range(-1.6, 1.6)) * TILE, y: (fy - 0.5) * TILE });
  }

  // ── Buried coins under X marks ────────────────────────────
  const buried: NonNullable<LevelSpec['buried']> = [];
  const crng = stream(seed, 'buried', depth);
  const spots: { x: number; f: number }[] = [];
  for (let f = 4; f < th - 5; f++)
    for (let x = 4; x < tw - 4; x++)
      if (at(x, f) === T_ROCK && at(x, f - 1) === T_EMPTY && at(x - 1, f) === T_ROCK && at(x + 1, f) === T_ROCK && at(x, f + 1) === T_ROCK && at(x, f + 2) === T_ROCK && !nearSpecial(x, f) &&
        !pockets.some((q) => Math.abs((x + 0.5) * TILE - q.x) < q.rx + TILE * 2 && Math.abs(f * TILE - q.y) < q.ry + TILE * 3))
        spots.push({ x, f });
  crng.shuffle(spots);
  const wantBuried = depth === 1 ? 8 : depth === 2 ? 10 : 12;
  for (const sp of spots) {
    if (buried.length >= wantBuried) break;
    if (buried.some((b) => Math.hypot(b.mx / TILE - sp.x, b.my / TILE - sp.f) < 9)) continue;
    const coins = crng.chance(0.25) ? ['coin5'] : Array.from({ length: crng.int(2, 3) }, () => 'coin');
    buried.push({ x: (sp.x + 0.5) * TILE, y: (sp.f + 0.6) * TILE, mx: (sp.x + 0.5) * TILE, my: sp.f * TILE, coins });
  }

  const decor = placeDecor(stream(seed, 'decor', depth), tiles, tw, th, depth, {
    x0: Math.floor(crackX - 4), x1: Math.ceil(crackX + 4), y: floorY,
  });
  const startPx = { x: start.cx * TILE, y: (surface ? start.cy - 2 : start.cy) * TILE };
  if (depth > 1) pickups.push({ kind: irng.pick(['coin', 'bomb', 'heart']), x: startPx.x + TILE * 3, y: startPx.y });

  return {
    depth, tw, th, tiles, surface, surfaceSpan, chambers, edges, start: startPx,
    boss: {
      kind: bossKind,
      arena: { x0: ax0, y0: ay0, x1: ax1, y1: ay1 },
      crack: { x0: (crackX - 2) * TILE, x1: (crackX + 2) * TILE, y: floorY * TILE },
      gates, item: bossItem, grottoItems,
    },
    groups, pedestals, pickups, shopkeeper, decor,
    poolRemovedAfter: [...pools.removed],
    pockets, buried,
  };
}

function connected(adj: number[][], n: number, from: number) {
  const seen = new Uint8Array(n);
  const st = [from];
  seen[from] = 1;
  let count = 1;
  while (st.length) {
    const c = st.pop()!;
    for (const m of adj[c]) if (!seen[m]) {
      seen[m] = 1;
      count++;
      st.push(m);
    }
  }
  return count === n;
}

const CLASS: Record<EnemyKind, Attach | 'swim' | 'wall'> = {
  blob: 'swim', jelly: 'swim', pufferling: 'swim', barracuda: 'swim', splitter: 'swim', squidling: 'swim',
  crabby: 'floor', cannoncrab: 'floor', mimic: 'floor', flounder: 'floor',
  urchin: 'none', moray: 'wall',
};

function placeEnemies(rng: Rng, tiles: Uint8Array, tw: number, th: number, ch: Chamber, depth: number): Spawn[] {
  const biome = biomeFor(depth);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= tw || y >= th ? T_ROCK : tiles[y * tw + x]);
  let budget = (2 + depth * 1.1 + rng.range(0, 1.5)) * (1 + biome.menace * 0.8) * (ch.kind === 'cave' ? 0.7 : 1.15);
  const spawns: Spawn[] = [];
  const used = new Set<number>();
  const x0 = Math.floor(ch.cx - ch.rx * 1.2), x1 = Math.ceil(ch.cx + ch.rx * 1.2);
  const y0 = Math.floor(ch.cy - ch.ry * 1.2), y1 = Math.ceil(ch.cy + ch.ry * 1.2);
  const free = (x: number, y: number) => at(x, y) === T_EMPTY && !used.has(y * tw + x);
  const candidates = (cls: Attach | 'swim' | 'wall') => {
    const out: { x: number; y: number; attach: Attach }[] = [];
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (!free(x, y)) continue;
        if (cls === 'swim') {
          if (at(x, y + 1) === T_EMPTY && at(x + 1, y) === T_EMPTY && at(x - 1, y) === T_EMPTY) out.push({ x, y, attach: 'none' });
        } else if (cls === 'floor') {
          if (at(x, y + 1) === T_ROCK) out.push({ x, y, attach: 'floor' });
        } else if (cls === 'wall') {
          if (at(x - 1, y) === T_ROCK && at(x + 1, y) === T_EMPTY) out.push({ x, y, attach: 'left' });
          else if (at(x + 1, y) === T_ROCK && at(x - 1, y) === T_EMPTY) out.push({ x, y, attach: 'right' });
        } else {
          if (at(x, y + 1) === T_ROCK) out.push({ x, y, attach: 'floor' });
          else if (at(x, y - 1) === T_ROCK) out.push({ x, y, attach: 'ceil' });
        }
      }
    return out;
  };
  let guard = 0;
  while (budget > 0.5 && guard++ < 40) {
    const def = rng.weighted(biome.enemies, (e) => (e.cost <= budget + 0.5 ? e.weight : 0));
    if (!def) break;
    let cands = candidates(CLASS[def.kind]);
    if (!cands.length) cands = candidates('swim');
    if (!cands.length) break;
    const c = rng.pick(cands);
    const group = def.kind === 'jelly' ? rng.int(3, 4) : 1;
    for (let g = 0; g < group; g++) {
      let x = (c.x + 0.5) * TILE, y = (c.y + 0.5) * TILE;
      if (g) {
        const ox = x + rng.range(-30, 30), oy = y + rng.range(-30, 30);
        if (at(Math.floor(ox / TILE), Math.floor(oy / TILE)) === T_EMPTY) {
          x = ox;
          y = oy;
        }
      }
      spawns.push({ kind: def.kind, x, y, attach: c.attach });
    }
    used.add(c.y * tw + c.x);
    budget -= def.cost;
  }
  return spawns;
}

function placeDecor(rng: Rng, tiles: Uint8Array, tw: number, th: number, depth: number, crack: { x0: number; x1: number; y: number }): Decor[] {
  const biome = biomeFor(depth);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= tw || y >= th ? T_ROCK : tiles[y * tw + x]);
  const out: Decor[] = [];
  const density = depth === 1 ? 0.95 : depth === 2 ? 0.8 : 0.6;
  for (let y = 1; y < th - 1; y++)
    for (let x = 1; x < tw - 1; x++) {
      if (at(x, y) !== T_EMPTY) continue;
      // Floor growth.
      if (at(x, y + 1) === T_ROCK) {
        if (y + 1 === crack.y && x >= crack.x0 && x <= crack.x1) continue;
        let free = 0;
        while (y - free >= 0 && at(x, y - free) === T_EMPTY) free++;
        const count = rng.chance(density) ? 1 + (rng.chance(0.55) ? 1 : 0) + (rng.chance(depth === 1 ? 0.3 : 0.15) ? 1 : 0) : 0;
        for (let k = 0; k < count; k++) {
          const px = (x + rng.range(0.05, 0.95)) * TILE;
          const py = (y + 1) * TILE;
          const r = rng.next();
          const front = rng.chance(0.28);
          const maxKelp = Math.max(0.6, (free * TILE - 30) / 60);
          const deep = depth >= 2 && rng.chance(0.4);
          const seed = rng.nextU32();
          if (r < 0.3) out.push({ kind: 'kelp', x: px, y: py, size: Math.min(maxKelp, rng.range(0.8, deep ? 3.4 : 2.6)), color: biome.plantColor, seed, attach: 'floor', front });
          else if (r < 0.55) out.push({ kind: 'grass', x: px, y: py, size: rng.range(0.6, 1.2), color: biome.plantColor, seed, attach: 'floor', front });
          else if (r < 0.66) out.push({ kind: 'coral', x: px, y: py, size: rng.range(0.6, 1.4), color: rng.pick(biome.decoColors), seed, attach: 'floor', front });
          else if (r < 0.72) out.push({ kind: 'fan', x: px, y: py, size: rng.range(0.7, 1.4), color: rng.pick(biome.decoColors), seed, attach: 'floor', front });
          else if (r < 0.78) out.push({ kind: 'anemone', x: px, y: py, size: rng.range(0.6, 1.1), color: rng.pick(biome.decoColors), seed, attach: 'floor', front });
          else if (r < 0.86) out.push({ kind: 'boulder', x: px, y: py, size: rng.range(0.5, 1.4), color: biome.rockDark, seed, attach: 'floor', front: rng.chance(0.4) });
          else if (r < 0.9) out.push({ kind: 'shell', x: px, y: py, size: rng.range(0.6, 1), color: rng.pick(biome.decoColors), seed, attach: 'floor' });
          else if (r < 0.93) out.push({ kind: 'starfish', x: px, y: py, size: rng.range(0.6, 1), color: rng.pick(biome.decoColors), seed, attach: 'floor' });
          else if (r < 0.96 && depth === 3) out.push({ kind: rng.chance(0.5) ? 'barrel' : 'chain', x: px, y: py, size: 1, color: 0x7a4a2a, seed, attach: 'floor' });
          else out.push({ kind: 'rockling', x: px, y: py, size: rng.range(0.5, 1), color: biome.rockDark, seed, attach: 'floor' });
        }
      }
      // Hanging growth under overhangs.
      if (at(x, y - 1) === T_ROCK && rng.chance(depth === 3 ? 0.12 : 0.1)) {
        let free = 0;
        while (y + free < th && at(x, y + free) === T_EMPTY) free++;
        const maxLen = Math.max(0.5, (free * TILE - 30) / 60);
        out.push({
          kind: depth === 3 && rng.chance(0.5) ? 'chain' : 'kelp',
          x: (x + 0.5) * TILE, y: y * TILE, size: Math.min(maxLen, rng.range(0.6, 1.4)),
          color: depth === 3 ? 0x6a5a4a : biome.plantColor, seed: rng.nextU32(), attach: 'ceil',
        });
      }
      // Sponges on walls.
      if ((at(x - 1, y) === T_ROCK || at(x + 1, y) === T_ROCK) && rng.chance(0.05)) {
        const left = at(x - 1, y) === T_ROCK;
        out.push({ kind: 'sponge', x: (left ? x : x + 1) * TILE, y: (y + 0.5) * TILE, size: rng.range(0.6, 1.1), color: rng.pick(biome.decoColors), seed: rng.nextU32(), attach: left ? 'left' : 'right' });
      }
    }
  void isSolidTile;
  return out;
}

/** The Mermaid's Grotto: a small hidden chamber with two Siren deals. */
export function generateGrotto(seed: number, depth: number, items: string[]): LevelSpec {
  const tw = 34, th = 20;
  const tiles = new Uint8Array(tw * th).fill(T_ROCK);
  const rng = stream(seed, 'grotto', depth);
  for (let y = 3; y < th - 4; y++)
    for (let x = 3; x < tw - 3; x++) {
      const dx = (x + 0.5 - tw / 2) / (tw / 2 - 3), dy = (y + 0.5 - th / 2 + 1) / (th / 2 - 4);
      if (Math.hypot(dx, dy) < 1 + valueNoise1(Math.atan2(dy, dx) * 2, seed & 0xfff) * 0.15) tiles[y * tw + x] = T_EMPTY;
    }
  const floorY = th - 5;
  for (let x = 4; x < tw - 4; x++) {
    for (let y = floorY - 1; y > 3; y--) if (tiles[y * tw + x] !== T_EMPTY && y > floorY - 3) tiles[y * tw + x] = T_EMPTY;
    tiles[floorY * tw + x] = T_ROCK;
  }
  const pedestals: PedestalSpec[] = items.map((id, i) => ({ x: (i === 0 ? 15 : 24) * TILE, y: floorY * TILE - 34, itemId: id, hearts: 2 }));
  return {
    depth, tw, th, tiles, surface: false, chambers: [], edges: [],
    start: { x: 10 * TILE, y: (floorY - 2) * TILE },
    boss: { kind: 'barnacle', arena: { x0: 0, y0: 0, x1: 0, y1: 0 }, crack: { x0: 0, x1: 0, y: 0 }, gates: [], item: '', grottoItems: [] },
    groups: [], pedestals, pickups: [], decor: placeDecor(rng, tiles, tw, th, depth, { x0: -1, x1: -1, y: -1 }),
    poolRemovedAfter: [],
  };
}

/** Title screen: a small patch of open water above a floor with one opening. */
export function generateTitleLevel(seed: number): LevelSpec {
  const tw = 40, th = 26;
  const tiles = new Uint8Array(tw * th).fill(T_EMPTY);
  const floorY = th - 4;
  const holeX = Math.floor(tw / 2);
  for (let x = 0; x < tw; x++)
    for (let y = floorY + Math.round(valueNoise1(x * 0.3, seed & 0xfff) * 1.5); y < th; y++) if (Math.abs(x - holeX) > 1.5) tiles[y * tw + x] = T_ROCK;
  for (let y = 0; y < th; y++) {
    tiles[y * tw] = T_ROCK;
    tiles[y * tw + tw - 1] = T_ROCK;
  }
  const rng = stream(seed, 'title');
  return {
    depth: 1, tw, th, tiles, surface: true, surfaceSpan: { x0: 1, x1: tw - 2 }, chambers: [], edges: [],
    start: { x: tw * TILE * 0.5, y: th * TILE * 0.35 },
    boss: { kind: 'barnacle', arena: { x0: 0, y0: 0, x1: 0, y1: 0 }, crack: { x0: holeX * TILE - TILE, x1: holeX * TILE + TILE, y: th * TILE }, gates: [], item: '', grottoItems: [] },
    groups: [], pedestals: [], pickups: [], decor: placeDecor(rng, tiles, tw, th, 1, { x0: holeX - 2, x1: holeX + 2, y: floorY }),
    poolRemovedAfter: [],
  };
}
