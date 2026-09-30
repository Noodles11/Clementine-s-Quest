// Room interior generation for the side-view "fish tank" rooms.

import { CELL_H, CELL_W, TILE } from '../config';
import { Rng } from '../core/rng';
import { valueNoise1, valueNoise2 } from '../core/math';
import { biomeFor, type EnemyKind } from './biomes';
import type { DoorSpec, FloorRoom } from './floor';

export const T_EMPTY = 0;
export const T_ROCK = 1;
export const T_BREAK = 2;
export const T_SPIKE = 3;
export const T_SECRET = 4;

export const isSolidTile = (t: number) => t === T_ROCK || t === T_BREAK || t === T_SECRET;

export type Attach = 'floor' | 'ceil' | 'left' | 'right' | 'none';

export interface Spawn {
  kind: EnemyKind;
  x: number;
  y: number;
  attach: Attach;
}

export type DecorKind = 'kelp' | 'grass' | 'coral' | 'fan' | 'shell' | 'anemone' | 'rockling' | 'starfish' | 'pot' | 'chain' | 'barrel';

export interface Decor {
  kind: DecorKind;
  x: number;
  y: number;
  size: number;
  color: number;
  seed: number;
  /** Where it is anchored. */
  attach: Attach;
}

export interface DoorMouth {
  door: DoorSpec;
  /** Pixel center of the opening at the room edge. */
  x: number;
  y: number;
  /** Pixel position just inside the room (spawn point when entering). */
  ix: number;
  iy: number;
}

export interface RoomLayout {
  tw: number;
  th: number;
  tiles: Uint8Array;
  spawns: Spawn[];
  decor: Decor[];
  mouths: DoorMouth[];
  /** Item pedestal / feature points (px). */
  center: { x: number; y: number };
  floorAt: (tx: number) => number;
  shopSpots: { x: number; y: number }[];
  crack?: { x0: number; x1: number; y: number };
  hintText?: boolean;
  surface: boolean;
}

type Template = { rows: string[]; anchor: 'float' | 'floor' | 'ceil' };

const TEMPLATES: Template[] = [
  { anchor: 'float', rows: ['.##.', '####', '.##.'] },
  { anchor: 'float', rows: ['###'] },
  { anchor: 'float', rows: ['##', '##'] },
  { anchor: 'float', rows: ['#..#', '####'] },
  { anchor: 'float', rows: ['.#.', '###', '.#.'] },
  { anchor: 'float', rows: ['####', '.##.'] },
  { anchor: 'float', rows: ['b#b'] },
  { anchor: 'floor', rows: ['.#.', '###'] },
  { anchor: 'floor', rows: ['#', '#', '#'] },
  { anchor: 'floor', rows: ['##', '##'] },
  { anchor: 'floor', rows: ['bb'] },
  { anchor: 'floor', rows: ['b.b'] },
  { anchor: 'floor', rows: ['^^^^'] },
  { anchor: 'floor', rows: ['^^'] },
  { anchor: 'ceil', rows: ['###', '.#.', '.#.'] },
  { anchor: 'ceil', rows: ['##', '#.'] },
  { anchor: 'ceil', rows: ['####', '.##.'] },
];

export function doorMouthTiles(door: DoorSpec, tw: number, th: number) {
  const ox = door.lx * CELL_W, oy = door.ly * CELL_H;
  switch (door.side) {
    case 'L':
      return { cols: [0, 1, 2], rows: [oy + 4, oy + 5, oy + 6] };
    case 'R':
      return { cols: [tw - 1, tw - 2, tw - 3], rows: [oy + 4, oy + 5, oy + 6] };
    case 'U':
      return { cols: [ox + 9, ox + 10], rows: [0, 1, 2, 3] };
    case 'D':
      return { cols: [ox + 9, ox + 10], rows: [th - 1, th - 2, th - 3, th - 4] };
  }
}

export function buildRoom(room: FloorRoom, depth: number): RoomLayout {
  const rng = new Rng(room.seed);
  const biome = biomeFor(depth);
  const tw = room.w * CELL_W;
  const th = room.h * CELL_H;
  const tiles = new Uint8Array(tw * th);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= tw || y >= th ? T_ROCK : tiles[y * tw + x]);
  const set = (x: number, y: number, v: number) => {
    if (x >= 0 && y >= 0 && x < tw && y < th) tiles[y * tw + x] = v;
  };

  const flat = room.type !== 'normal';
  // Shallows rooms without an upward shaft show the water surface as ceiling.
  const surface = biome.surface && !room.doors.some((d) => d.side === 'U');
  const nseed = room.seed & 0xffff;
  // Floor / ceiling heightlines.
  const floorH: number[] = [];
  const ceilH: number[] = [];
  for (let x = 0; x < tw; x++) {
    const n = valueNoise1(x * 0.22, nseed);
    const c = valueNoise1(x * 0.3 + 40, nseed);
    floorH.push(flat ? 2 : 1 + Math.round(n * 2.2));
    ceilH.push(surface || flat ? 1 : 1 + (c > 0.62 ? 1 : 0));
  }
  for (let x = 0; x < tw; x++) {
    for (let y = 0; y < th; y++) {
      const edgeX = x === 0 || x === tw - 1;
      if (edgeX || y < ceilH[x] || y >= th - floorH[x]) set(x, y, T_ROCK);
    }
  }
  // Side wall bumps.
  if (!flat)
    for (let y = 2; y < th - 3; y++) {
      if (valueNoise1(y * 0.5, nseed + 7) > 0.72) set(1, y, T_ROCK);
      if (valueNoise1(y * 0.5, nseed + 9) > 0.72) set(tw - 2, y, T_ROCK);
    }

  // Carve door mouths.
  const mouths: DoorMouth[] = [];
  const reserved = new Uint8Array(tw * th);
  const reserve = (cx: number, cy: number, r: number) => {
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++) if (x >= 0 && y >= 0 && x < tw && y < th) reserved[y * tw + x] = 1;
  };
  for (const door of room.doors) {
    const { cols, rows } = doorMouthTiles(door, tw, th);
    for (const c of cols) for (const r of rows) set(c, r, door.hidden ? T_SECRET : T_EMPTY);
    if (door.hidden) {
      // Only the outermost wall tiles are secret; interior stays open.
      for (const c of cols) for (const r of rows) {
        const outer = door.side === 'L' ? c === 0 : door.side === 'R' ? c === tw - 1 : door.side === 'U' ? r === 0 : r === th - 1;
        set(c, r, outer ? T_SECRET : T_EMPTY);
      }
    }
    const ox = door.lx * CELL_W, oy = door.ly * CELL_H;
    let x = 0, y = 0, ix = 0, iy = 0;
    if (door.side === 'L') { x = 0; y = (oy + 5.5) * TILE; ix = 1.6 * TILE; iy = y; reserve(2, oy + 5, 3); }
    if (door.side === 'R') { x = tw * TILE; y = (oy + 5.5) * TILE; ix = (tw - 1.6) * TILE; iy = y; reserve(tw - 3, oy + 5, 3); }
    if (door.side === 'U') { x = (ox + 10) * TILE; y = 0; ix = x; iy = 2.4 * TILE; reserve(ox + 10, 2, 3); }
    if (door.side === 'D') { x = (ox + 10) * TILE; y = th * TILE; ix = x; iy = (th - 3.2) * TILE; reserve(ox + 10, th - 3, 3); }
    mouths.push({ door, x, y, ix, iy });
  }

  const floorTop = (tx: number) => {
    for (let y = th - 1; y >= 0; y--) if (at(tx, y) === T_EMPTY || at(tx, y) === T_SPIKE) return y + 1;
    return th;
  };

  const center = { x: (tw * TILE) / 2, y: (th * TILE) / 2 };
  // Columns occupied by downward shafts (no pedestals, cracks or spikes there).
  const shaftCols = new Set<number>();
  for (const d of room.doors) if (d.side === 'D') for (let c = d.lx * CELL_W + 7; c <= d.lx * CELL_W + 12; c++) shaftCols.add(c);
  const nearestFreeCol = (c: number) => {
    for (let o = 0; o < tw; o++) {
      for (const cc of [c + o, c - o]) if (cc > 2 && cc < tw - 3 && !shaftCols.has(cc) && !shaftCols.has(cc - 1)) return cc;
    }
    return c;
  };
  const layout: RoomLayout = {
    tw, th, tiles, spawns: [], decor: [], mouths, center, shopSpots: [], surface,
    floorAt: (tx) => floorTop(tx) * TILE,
  };

  if (room.type === 'normal') {
    placeObstacles(rng, tiles, tw, th, reserved, depth, surface);
  } else if (room.type === 'treasure' || room.type === 'secret' || room.type === 'curse') {
    // Stone pedestal near the middle, never above a floor shaft.
    const cx = nearestFreeCol(Math.floor(tw / 2));
    const fy = floorTop(cx);
    set(cx - 1, fy - 1, T_ROCK);
    set(cx, fy - 1, T_ROCK);
    center.x = cx * TILE;
    center.y = (fy - 1) * TILE - 40;
    if (room.type === 'curse') {
      for (let x = 3; x < tw - 3; x++) if ((x < cx - 3 || x > cx + 2) && !shaftCols.has(x)) set(x, floorTop(x) - 1, T_SPIKE);
    }
  } else if (room.type === 'shop' || room.type === 'grotto') {
    const cols = room.type === 'grotto' ? [6, 14] : [4, 7, 13, 16];
    const n = room.type === 'grotto' ? 2 : Math.min(4, room.shop?.length ?? 3);
    for (let i = 0; i < n; i++) {
      const tx = nearestFreeCol(cols[i]);
      const fy = floorTop(tx);
      layout.shopSpots.push({ x: tx * TILE, y: fy * TILE - 34 });
    }
  } else if (room.type === 'boss') {
    const cx = shaftCols.size ? 5 : Math.floor(tw / 2);
    const fy = floorTop(cx);
    layout.crack = { x0: (cx - 2) * TILE, x1: (cx + 2) * TILE, y: fy * TILE };
    center.y = (th * TILE) * 0.45;
  } else if (room.type === 'start') {
    layout.hintText = depth === 1;
  }

  ensureConnectivity(tiles, tw, th, mouths);
  if (room.type === 'normal') layout.spawns = placeEnemies(rng, tiles, tw, th, reserved, room, depth);
  // Keep door mouths and shafts clear of decoration.
  const noDecor = new Uint8Array(tw * th);
  for (const m of mouths) {
    const { cols, rows } = doorMouthTiles(m.door, tw, th);
    for (const c of cols) for (const r of rows) for (let dx = -1; dx <= 1; dx++) if (c + dx >= 0 && c + dx < tw) noDecor[r * tw + c + dx] = 1;
  }
  layout.decor = placeDecor(rng, tiles, tw, th, noDecor, depth, room.type, surface);
  return layout;
}

function placeObstacles(rng: Rng, tiles: Uint8Array, tw: number, th: number, reserved: Uint8Array, depth: number, surface: boolean) {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= tw || y >= th ? T_ROCK : tiles[y * tw + x]);
  const canPlace = (x: number, y: number) => x > 1 && y > 0 && x < tw - 2 && y < th - 1 && !reserved[y * tw + x] && at(x, y) === T_EMPTY;
  const cells = (tw / CELL_W) * (th / CELL_H);

  if (rng.chance(0.3)) {
    // Fully procedural blobs.
    const s = rng.int(0, 99999);
    for (let y = 3; y < th - 3; y++)
      for (let x = 3; x < tw - 3; x++) {
        const n = valueNoise2(x * 0.28, y * 0.4, s);
        const sym = valueNoise2((tw - 1 - x) * 0.28, y * 0.4, s);
        if (Math.max(n, sym) > 0.78 && canPlace(x, y)) tiles[y * tw + x] = rng.chance(0.12) ? T_BREAK : T_ROCK;
      }
  }
  const count = Math.round(rng.int(2, 4) * cells);
  for (let i = 0; i < count; i++) {
    const tpl = rng.pick(TEMPLATES);
    if (surface && tpl.anchor === 'ceil') continue;
    if (tpl.rows[0].includes('^') && depth === 1 && rng.chance(0.5)) continue;
    const mirror = rng.chance(0.5);
    const rows = mirror ? tpl.rows.map((r) => r.split('').reverse().join('')) : tpl.rows;
    const h = rows.length, w = rows[0].length;
    for (let tries = 0; tries < 12; tries++) {
      const x0 = rng.int(3, tw - 3 - w);
      let y0: number;
      if (tpl.anchor === 'float') y0 = rng.int(3, th - 4 - h);
      else if (tpl.anchor === 'ceil') {
        let y = 0;
        while (y < th && at(x0, y) !== T_EMPTY) y++;
        y0 = y;
      } else {
        let y = th - 1;
        while (y > 0 && at(x0, y) !== T_EMPTY) y--;
        y0 = y - h + 1;
      }
      let ok = true;
      for (let yy = 0; yy < h && ok; yy++)
        for (let xx = 0; xx < w && ok; xx++) if (rows[yy][xx] !== '.' && !canPlace(x0 + xx, y0 + yy)) ok = false;
      // Keep one tile of clearance around floating rocks.
      if (ok && tpl.anchor === 'float') {
        for (let yy = -1; yy <= h && ok; yy++)
          for (let xx = -1; xx <= w && ok; xx++) if (at(x0 + xx, y0 + yy) !== T_EMPTY) ok = false;
      }
      if (!ok) continue;
      for (let yy = 0; yy < h; yy++)
        for (let xx = 0; xx < w; xx++) {
          const ch = rows[yy][xx];
          if (ch === '#') tiles[(y0 + yy) * tw + x0 + xx] = T_ROCK;
          if (ch === 'b') tiles[(y0 + yy) * tw + x0 + xx] = T_BREAK;
          if (ch === '^') {
            const below = at(x0 + xx, y0 + yy + 1);
            if (below === T_ROCK) tiles[(y0 + yy) * tw + x0 + xx] = T_SPIKE;
          }
        }
      break;
    }
  }
}

/** Flood fill from door mouths; seal unreachable pockets; guarantee doors connect. */
function ensureConnectivity(tiles: Uint8Array, tw: number, th: number, mouths: DoorMouth[]) {
  const passable = (t: number) => t === T_EMPTY || t === T_SPIKE || t === T_BREAK || t === T_SECRET;
  const seen = new Uint8Array(tw * th);
  const startX = mouths.length ? Math.floor(mouths[0].ix / TILE) : Math.floor(tw / 2);
  const startY = mouths.length ? Math.floor(mouths[0].iy / TILE) : Math.floor(th / 2);
  const fill = () => {
    seen.fill(0);
    const q = [startY * tw + startX];
    seen[q[0]] = 1;
    while (q.length) {
      const i = q.pop()!;
      const x = i % tw, y = (i / tw) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= tw || ny >= th) continue;
        const j = ny * tw + nx;
        if (seen[j] || !passable(tiles[j])) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
  };
  tiles[startY * tw + startX] = T_EMPTY;
  fill();
  // Any door mouth not reached: carve a straight tunnel toward the start.
  for (const m of mouths) {
    let x = Math.floor(m.ix / TILE), y = Math.floor(m.iy / TILE);
    if (seen[y * tw + x]) continue;
    while (!seen[y * tw + x]) {
      tiles[y * tw + x] = T_EMPTY;
      if (x !== startX) x += Math.sign(startX - x);
      else if (y !== startY) y += Math.sign(startY - y);
      else break;
      if (seen[y * tw + x]) break;
    }
    fill();
  }
  // Seal pockets nobody can reach.
  for (let i = 0; i < tiles.length; i++) if (tiles[i] === T_EMPTY && !seen[i]) tiles[i] = T_ROCK;
}

const CLASS: Record<EnemyKind, Attach | 'swim' | 'wall'> = {
  blob: 'swim', jelly: 'swim', pufferling: 'swim', barracuda: 'swim', splitter: 'swim', squidling: 'swim',
  crabby: 'floor', cannoncrab: 'floor', mimic: 'floor', flounder: 'floor',
  urchin: 'none', moray: 'wall',
};

function placeEnemies(rng: Rng, tiles: Uint8Array, tw: number, th: number, reserved: Uint8Array, room: FloorRoom, depth: number): Spawn[] {
  const biome = biomeFor(depth);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= tw || y >= th ? T_ROCK : tiles[y * tw + x]);
  const cells = room.w * room.h;
  let budget = (2 + depth * 1.1 + rng.range(0, 1.5)) * (1 + biome.menace * 0.8) * (cells > 1 ? 1.7 : 1);
  const spawns: Spawn[] = [];
  const used = new Set<number>();
  const free = (x: number, y: number) => at(x, y) === T_EMPTY && !reserved[y * tw + x] && !used.has(y * tw + x);

  const candidates = (cls: Attach | 'swim' | 'wall') => {
    const out: { x: number; y: number; attach: Attach }[] = [];
    for (let y = 1; y < th - 1; y++)
      for (let x = 2; x < tw - 2; x++) {
        if (!free(x, y)) continue;
        if (cls === 'swim') {
          if (y < th - 2 && at(x, y + 1) === T_EMPTY) out.push({ x, y, attach: 'none' });
        } else if (cls === 'floor') {
          if (at(x, y + 1) === T_ROCK) out.push({ x, y, attach: 'floor' });
        } else if (cls === 'wall') {
          if (at(x - 1, y) === T_ROCK && at(x + 1, y) === T_EMPTY) out.push({ x, y, attach: 'left' });
          else if (at(x + 1, y) === T_ROCK && at(x - 1, y) === T_EMPTY) out.push({ x, y, attach: 'right' });
          else if (at(x, y + 1) === T_ROCK) out.push({ x, y, attach: 'floor' });
        } else {
          // Urchin: any surface.
          if (at(x, y + 1) === T_ROCK) out.push({ x, y, attach: 'floor' });
          else if (at(x, y - 1) === T_ROCK) out.push({ x, y, attach: 'ceil' });
          else if (at(x - 1, y) === T_ROCK) out.push({ x, y, attach: 'left' });
          else if (at(x + 1, y) === T_ROCK) out.push({ x, y, attach: 'right' });
        }
      }
    return out;
  };

  let guard = 0;
  while (budget > 0.5 && guard++ < 40) {
    const def = rng.weighted(biome.enemies, (e) => (e.cost <= budget + 0.5 ? e.weight : 0));
    if (!def) break;
    const c = rng.pick(candidates(CLASS[def.kind]).length ? candidates(CLASS[def.kind]) : candidates('swim'));
    if (!c) break;
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

function placeDecor(rng: Rng, tiles: Uint8Array, tw: number, th: number, blocked: Uint8Array, depth: number, type: string, surface: boolean): Decor[] {
  const biome = biomeFor(depth);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= tw || y >= th ? T_ROCK : tiles[y * tw + x]);
  const out: Decor[] = [];
  for (let x = 1; x < tw - 1; x++) {
    for (let y = 1; y < th; y++) {
      if (at(x, y) !== T_EMPTY || at(x, y + 1) !== T_ROCK) continue;
      if (blocked[y * tw + x] || blocked[Math.min(th - 1, y + 1) * tw + x]) continue;
      const px = (x + rng.range(0.1, 0.9)) * TILE;
      const py = (y + 1) * TILE;
      const r = rng.next();
      const deep = y > th * 0.55;
      if (r < 0.28) out.push({ kind: 'kelp', x: px, y: py, size: rng.range(0.9, deep ? 3.6 : 2.4), color: biome.plantColor, seed: rng.nextU32(), attach: 'floor' });
      else if (r < 0.55) out.push({ kind: 'grass', x: px, y: py, size: rng.range(0.5, 1), color: biome.plantColor, seed: rng.nextU32(), attach: 'floor' });
      else if (r < 0.66) out.push({ kind: 'coral', x: px, y: py, size: rng.range(0.6, 1.2), color: rng.pick(biome.decoColors), seed: rng.nextU32(), attach: 'floor' });
      else if (r < 0.72) out.push({ kind: 'fan', x: px, y: py, size: rng.range(0.7, 1.2), color: rng.pick(biome.decoColors), seed: rng.nextU32(), attach: 'floor' });
      else if (r < 0.78) out.push({ kind: 'anemone', x: px, y: py, size: rng.range(0.6, 1), color: rng.pick(biome.decoColors), seed: rng.nextU32(), attach: 'floor' });
      else if (r < 0.84) out.push({ kind: 'shell', x: px, y: py, size: rng.range(0.6, 1), color: rng.pick(biome.decoColors), seed: rng.nextU32(), attach: 'floor' });
      else if (r < 0.88) out.push({ kind: 'starfish', x: px, y: py, size: rng.range(0.6, 1), color: rng.pick(biome.decoColors), seed: rng.nextU32(), attach: 'floor' });
      else if (r < 0.92 && depth === 3) out.push({ kind: rng.chance(0.5) ? 'barrel' : 'chain', x: px, y: py, size: 1, color: 0x7a4a2a, seed: rng.nextU32(), attach: 'floor' });
      else if (r < 0.96) out.push({ kind: 'rockling', x: px, y: py, size: rng.range(0.5, 1), color: biome.rockDark, seed: rng.nextU32(), attach: 'floor' });
    }
  }
  // A few things hanging from the ceiling.
  for (let x = 2; x < tw - 2; x++) {
    for (let y = 1; y < th - 1; y++) {
      if (at(x, y) !== T_EMPTY || at(x, y - 1) !== T_ROCK || surface) continue;
      if (blocked[y * tw + x]) continue;
      if (rng.chance(depth === 3 ? 0.08 : 0.05)) {
        out.push({
          kind: depth === 3 ? 'chain' : 'kelp',
          x: (x + 0.5) * TILE, y: y * TILE, size: rng.range(0.8, 1.6), color: depth === 3 ? 0x6a5a4a : biome.plantColor,
          seed: rng.nextU32(), attach: 'ceil',
        });
      }
    }
  }
  if (type === 'boss') return out.filter((d) => d.kind !== 'kelp' || d.attach !== 'floor' || rng.chance(0.4));
  return out;
}
