// Floor layout generation (Isaac-style room grid, seen from the side:
// x = left/right, y = down the water column).

import { FLOOR_GRID } from '../config';
import { Rng, stream } from '../core/rng';
import { ITEMS, type PoolKind } from '../game/items';
import { biomeFor, type BossKind } from './biomes';

export type RoomType = 'start' | 'normal' | 'treasure' | 'shop' | 'boss' | 'secret' | 'curse' | 'grotto';
export type Side = 'L' | 'R' | 'U' | 'D';

export const SIDE_DELTA: Record<Side, [number, number]> = { L: [-1, 0], R: [1, 0], U: [0, -1], D: [0, 1] };
export const OPPOSITE: Record<Side, Side> = { L: 'R', R: 'L', U: 'D', D: 'U' };

export interface DoorSpec {
  side: Side;
  /** Local cell within this room. */
  lx: number;
  ly: number;
  to: number;
  /** Cell of the destination room (local to it). */
  tlx: number;
  tly: number;
  kind: RoomType;
  locked: boolean;
  hidden: boolean;
}

export interface ShopSlot {
  kind: 'item' | 'pickup';
  itemId?: string;
  pickup?: string;
  price: number;
}

export interface FloorRoom {
  id: number;
  type: RoomType;
  x: number;
  y: number;
  w: number;
  h: number;
  dist: number;
  doors: DoorSpec[];
  item?: string;
  shop?: ShopSlot[];
  boss?: BossKind;
  grottoItems?: string[];
  seed: number;
}

export interface Floor {
  depth: number;
  rooms: FloorRoom[];
  grid: Int16Array;
  startId: number;
  bossId: number;
  poolRemovedAfter: string[];
}

/** Item pool bookkeeping. Items leave all pools once drawn. */
export class ItemPools {
  removed: Set<string>;
  unlocked: Set<string>;
  constructor(unlocked: Iterable<string>, removed: Iterable<string> = []) {
    this.unlocked = new Set(unlocked);
    this.removed = new Set(removed);
  }
  candidates(pool: PoolKind) {
    return ITEMS.filter(
      (it) => it.pools.includes(pool) && !this.removed.has(it.id) && (!it.unlock || this.unlocked.has(it.unlock)),
    );
  }
  draw(pool: PoolKind, rng: Rng): string {
    let cands = this.candidates(pool);
    if (cands.length === 0) cands = this.candidates('treasure');
    if (cands.length === 0) return '__heart_container';
    const pick = rng.weighted(cands, (it) => [1.2, 1.1, 1, 0.7, 0.4][it.quality] ?? 0.5)!;
    this.removed.add(pick.id);
    return pick.id;
  }
}

const idx = (x: number, y: number) => y * FLOOR_GRID + x;
const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < FLOOR_GRID && y < FLOOR_GRID;

function neighborCount(filled: Uint8Array, x: number, y: number) {
  let n = 0;
  for (const [dx, dy] of Object.values(SIDE_DELTA)) {
    const nx = x + dx, ny = y + dy;
    if (inBounds(nx, ny) && filled[idx(nx, ny)]) n++;
  }
  return n;
}

interface Cell {
  x: number;
  y: number;
  dist: number;
}

function growLayout(rng: Rng, target: number): Cell[] | null {
  const filled = new Uint8Array(FLOOR_GRID * FLOOR_GRID);
  const sx = 6, sy = 2;
  const cells: Cell[] = [{ x: sx, y: sy, dist: 0 }];
  filled[idx(sx, sy)] = 1;
  const queue: Cell[] = [cells[0]];
  // Downward expansion is favored: the dive goes down.
  const dirs: { d: [number, number]; p: number }[] = [
    { d: [0, 1], p: 0.6 },
    { d: [-1, 0], p: 0.5 },
    { d: [1, 0], p: 0.5 },
    { d: [0, -1], p: 0.25 },
  ];
  while (queue.length && cells.length < target) {
    const c = queue.shift()!;
    for (const { d, p } of rng.shuffle([...dirs])) {
      if (cells.length >= target) break;
      const nx = c.x + d[0], ny = c.y + d[1];
      if (!inBounds(nx, ny) || filled[idx(nx, ny)]) continue;
      if (neighborCount(filled, nx, ny) > 1) continue;
      if (!rng.chance(p)) continue;
      filled[idx(nx, ny)] = 1;
      const n = { x: nx, y: ny, dist: c.dist + 1 };
      cells.push(n);
      queue.push(n);
    }
    if (queue.length === 0 && cells.length < target) {
      // Re-seed the frontier from random existing cells to keep growing.
      queue.push(rng.pick(cells));
      if (rng.chance(0.02)) return null;
    }
  }
  return cells.length >= target ? cells : null;
}

export interface FloorGenOptions {
  seed: number;
  depth: number;
  unlocked: Iterable<string>;
  poolRemoved: Iterable<string>;
}

export function generateFloor(opts: FloorGenOptions): Floor {
  const { seed, depth } = opts;
  const pools = new ItemPools(opts.unlocked, opts.poolRemoved);
  for (let attempt = 0; attempt < 200; attempt++) {
    const rng = stream(seed, 'floor', depth, attempt);
    const target = Math.min(20, Math.round(3.33 * depth + rng.int(5, 6)));
    const cells = growLayout(rng, target);
    if (!cells) continue;
    const floor = assignRooms(cells, rng, depth, seed);
    if (!floor) continue;
    fillContents(floor, pools, stream(seed, 'items', depth));
    floor.poolRemovedAfter = [...pools.removed];
    return floor;
  }
  throw new Error('Floor generation failed');
}

function assignRooms(cells: Cell[], rng: Rng, depth: number, seed: number): Floor | null {
  const filled = new Uint8Array(FLOOR_GRID * FLOOR_GRID);
  for (const c of cells) filled[idx(c.x, c.y)] = 1;
  const deadEnds = cells
    .filter((c) => c.dist > 0 && neighborCount(filled, c.x, c.y) === 1);
  if (deadEnds.length < 3) return null;

  // Boss: farthest dead end, preferring lower rows.
  deadEnds.sort((a, b) => b.dist + b.y * 0.35 - (a.dist + a.y * 0.35));
  const boss = deadEnds[0];
  if (boss.dist < 2) return null;
  const rest = rng.shuffle(deadEnds.slice(1));
  const types = new Map<Cell, RoomType>();
  types.set(boss, 'boss');
  const specials: RoomType[] = ['treasure', 'shop', 'curse'];
  for (let i = 0; i < specials.length && i < rest.length; i++) types.set(rest[i], specials[i]);
  if (!Array.from(types.values()).includes('shop')) return null;

  const grid = new Int16Array(FLOOR_GRID * FLOOR_GRID).fill(-1);
  const rooms: FloorRoom[] = [];
  const cellRoom = new Map<Cell, FloorRoom>();

  // Big rooms (depth 2+): merge adjacent normal cells into 2x1 / 1x2.
  const merged = new Set<Cell>();
  const byPos = new Map<number, Cell>();
  for (const c of cells) byPos.set(idx(c.x, c.y), c);
  const isNormal = (c: Cell | undefined) => !!c && c.dist > 0 && !types.has(c) && !merged.has(c);
  let merges = depth >= 2 ? rng.int(1, 2) : 0;
  for (const c of rng.shuffle([...cells])) {
    if (merges <= 0) break;
    if (!isNormal(c)) continue;
    const opts: [number, number][] = rng.shuffle([
      [1, 0],
      [0, 1],
    ]);
    for (const [dx, dy] of opts) {
      const o = byPos.get(idx(c.x + dx, c.y + dy));
      if (!isNormal(o)) continue;
      merged.add(c);
      merged.add(o!);
      const room: FloorRoom = {
        id: rooms.length, type: 'normal', x: c.x, y: c.y, w: dx ? 2 : 1, h: dy ? 2 : 1,
        dist: Math.min(c.dist, o!.dist), doors: [], seed: 0,
      };
      rooms.push(room);
      cellRoom.set(c, room);
      cellRoom.set(o!, room);
      merges--;
      break;
    }
  }

  let startId = -1, bossId = -1;
  for (const c of cells) {
    if (cellRoom.has(c)) continue;
    const type: RoomType = c.dist === 0 ? 'start' : types.get(c) ?? 'normal';
    const room: FloorRoom = { id: rooms.length, type, x: c.x, y: c.y, w: 1, h: 1, dist: c.dist, doors: [], seed: 0 };
    rooms.push(room);
    cellRoom.set(c, room);
  }
  for (const [c, r] of cellRoom) grid[idx(c.x, c.y)] = r.id;
  for (const r of rooms) {
    if (r.type === 'start') startId = r.id;
    if (r.type === 'boss') bossId = r.id;
  }

  // Secret room: empty cell with the most neighbours, not touching boss/start.
  let best: { x: number; y: number; n: number } | null = null;
  for (let y = 0; y < FLOOR_GRID; y++)
    for (let x = 0; x < FLOOR_GRID; x++) {
      if (grid[idx(x, y)] !== -1) continue;
      let n = 0, bad = false;
      for (const [dx, dy] of Object.values(SIDE_DELTA)) {
        const nx = x + dx, ny = y + dy;
        if (!inBounds(nx, ny)) continue;
        const rid = grid[idx(nx, ny)];
        if (rid === -1) continue;
        const t = rooms[rid].type;
        if (t === 'boss' || t === 'start' || t === 'curse') bad = true;
        if (t === 'normal') n++;
        else bad = true;
      }
      if (bad || n < 2) continue;
      const score = n + rng.next() * 0.5;
      if (!best || score > best.n) best = { x, y, n: score };
    }
  if (best) {
    const r: FloorRoom = { id: rooms.length, type: 'secret', x: best.x, y: best.y, w: 1, h: 1, dist: 99, doors: [], seed: 0 };
    rooms.push(r);
    grid[idx(best.x, best.y)] = r.id;
  }

  // Doors: every adjacency between two different rooms.
  for (const r of rooms) {
    for (let ly = 0; ly < r.h; ly++)
      for (let lx = 0; lx < r.w; lx++) {
        const gx = r.x + lx, gy = r.y + ly;
        for (const side of ['L', 'R', 'U', 'D'] as Side[]) {
          const [dx, dy] = SIDE_DELTA[side];
          const nx = gx + dx, ny = gy + dy;
          if (!inBounds(nx, ny)) continue;
          const oid = grid[idx(nx, ny)];
          if (oid === -1 || oid === r.id) continue;
          const o = rooms[oid];
          const special = o.type !== 'normal' && o.type !== 'start' ? o : r.type !== 'normal' && r.type !== 'start' ? r : null;
          const kind: RoomType = special ? special.type : 'normal';
          const locked = depth >= 2 && (kind === 'treasure' || kind === 'shop');
          r.doors.push({
            side, lx, ly, to: oid, tlx: nx - o.x, tly: ny - o.y, kind, locked,
            hidden: r.type === 'secret' || o.type === 'secret',
          });
        }
      }
  }

  for (const r of rooms) r.seed = stream(seed, 'room', depth, r.id).nextU32();
  const floor: Floor = { depth, rooms, grid, startId, bossId, poolRemovedAfter: [] };
  // Sanity: boss must have exactly one door.
  if (rooms[bossId].doors.length !== 1) return null;
  return floor;
}

function fillContents(floor: Floor, pools: ItemPools, rng: Rng) {
  const biome = biomeFor(floor.depth);
  for (const r of floor.rooms) {
    switch (r.type) {
      case 'treasure':
        r.item = pools.draw('treasure', rng);
        break;
      case 'boss':
        r.boss = rng.pick(biome.bosses);
        r.item = pools.draw('boss', rng);
        r.grottoItems = [pools.draw('grotto', rng), pools.draw('grotto', rng)];
        break;
      case 'secret':
        if (rng.chance(0.6)) r.item = pools.draw('secret', rng);
        break;
      case 'curse':
        if (rng.chance(0.6)) r.item = pools.draw('curse', rng);
        break;
      case 'shop': {
        const slots: ShopSlot[] = [];
        const nItems = rng.int(1, 2);
        for (let i = 0; i < nItems; i++) slots.push({ kind: 'item', itemId: pools.draw('shop', rng), price: 15 });
        const pickups = rng.shuffle(['heart', 'bomb', 'key', 'snack', 'foam', 'bomb']).slice(0, 4 - nItems);
        const prices: Record<string, number> = { heart: 3, bomb: 5, key: 5, snack: 4, foam: 5 };
        for (const p of pickups) slots.push({ kind: 'pickup', pickup: p, price: prices[p] });
        r.shop = slots;
        break;
      }
    }
  }
}

export function roomAt(floor: Floor, gx: number, gy: number): FloorRoom | undefined {
  if (!inBounds(gx, gy)) return undefined;
  const id = floor.grid[idx(gx, gy)];
  return id >= 0 ? floor.rooms[id] : undefined;
}
