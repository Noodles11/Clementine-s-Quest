// RoomWorld: the live simulation of one area — a whole depth level (a large
// reef labyrinth), the Mermaid's Grotto, or the title screen's patch of water.

import { TILE } from '../config';
import { dist } from '../core/math';
import { cosmetic as R, stream } from '../core/rng';
import { sfx } from '../core/audio';
import type { Options } from '../core/save';
import { biomeFor, type Biome } from '../gen/biomes';
import type { Gate, LevelSpec, SpawnGroup } from '../gen/level';
import { isSolidTile, T_BREAK, T_EMPTY, T_SECRET, T_SPIKE } from '../gen/tiles';
import { FluidField } from '../ambient/fluid';
import { createBoss, Hazard, type Boss } from './bosses';
import { createEnemy, Enemy } from './enemies';
import type { Fx } from './fx';
import { ITEM_BY_ID, HEART_CONTAINER_ID } from './items';
import { Pedestal, Pickup, Prop } from './pickups';
import { Player } from './player';
import { Beam, Bubble, EnemyShot, InkBomb, Zone } from './projectiles';
import { FOAM_PICKUP, HEAL_HALF, HEAL_HEART, HP_PER_CONTAINER, SNACK_EFFECT_TEXT, type PickupKind, type Run } from './run';
import { SYNERGIES, TRANSFORMATIONS } from './synergies';
import type { Solidity } from './entity';
import { moveBox } from './entity';

export type WorldEvent =
  | { type: 'descend' }
  | { type: 'grotto' }
  | { type: 'grottoExit' }
  | { type: 'died'; by: string }
  | { type: 'item'; id: string }
  | { type: 'synergy'; id: string }
  | { type: 'transformation'; id: string }
  | { type: 'bossDefeated'; kind: string }
  | { type: 'cleared' }
  | { type: 'autosave' }
  | { type: 'enemySeen'; kind: string }
  | { type: 'mapReveal' }
  | { type: 'snack'; name: string; effect: string };

/** Area ids: the depth level itself, the Mermaid's Grotto, the title screen. */
export const LEVEL_ID = 0;
export const GROTTO_ID = -2;
export const TITLE_ID = -9;

/** Enemies farther than this from Clementine are dormant. */
const ACTIVE_RANGE = 1250;
/** Encounter groups wake up when Clementine gets this close to their edge. */
const WAKE_RANGE = 420;
/** A creature starts hunting Clementine within this distance… */
const ENGAGE_RANGE = 720;
/** …and gives up beyond this one. */
const LEASH_RANGE = 1050;

function packBits(a: Uint8Array): string {
  const bytes = new Uint8Array(Math.ceil(a.length / 8));
  for (let i = 0; i < a.length; i++) if (a[i]) bytes[i >> 3] |= 1 << (i & 7);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function unpackBits(str: string, out: Uint8Array) {
  try {
    const s = atob(str);
    for (let i = 0; i < out.length; i++) out[i] = (s.charCodeAt(i >> 3) >> (i & 7)) & 1;
  } catch {
    /* corrupt map: start unexplored */
  }
}

export interface InkMark {
  x: number;
  y: number;
  /** Surface normal (pointing out of the rock). */
  nx: number;
  ny: number;
  r: number;
  color: number;
  seed: number;
  /** Adjusted onto the drawn rock surface by the renderer. */
  seated?: boolean;
}

const MAX_INK_MARKS = 260;
/** Resolution of the destructible-rock mask (px). */
const CARVE = 8;

export class RoomWorld implements Solidity {
  run: Run;
  spec: LevelSpec;
  areaId: number;
  biome: Biome;
  menace: number;
  depth: number;
  tiles: Uint8Array;
  tw: number;
  th: number;
  widthPx: number;
  heightPx: number;
  tileHp = new Map<number, number>();
  /** Boss arena bounds (px). */
  arena: { x0: number; y0: number; x1: number; y1: number };
  gates: Gate[];

  player: Player;
  enemies: Enemy[] = [];
  bubbles: Bubble[] = [];
  shots: EnemyShot[] = [];
  pickups: Pickup[] = [];
  pedestals: Pedestal[] = [];
  bombs: InkBomb[] = [];
  beams: Beam[] = [];
  zones: Zone[] = [];
  hazards: Hazard[] = [];
  props: Prop[] = [];
  fluid: FluidField;

  events: WorldEvent[] = [];
  time = 0;
  boss: Boss | null = null;
  bossPending = false;
  bossDead = false;
  /** Tiles changed since the terrain was last drawn. */
  terrainDirty = true;
  dirtyTiles: number[] = [];
  exiting = false;
  bossHurtPlayer = false;
  private wasSafe = false;
  /** Ink stains on the rock (cosmetic, newest last). */
  inkMarks: InkMark[] = [];
  inkVersion = 0;
  /** Craters blown into the rock (Worms-style destructible terrain). */
  holes: { x: number; y: number; r: number }[] = [];
  /** Fine collision mask: 1 where rock has been blown away. */
  private carved: Uint8Array;
  private cw: number;
  /** Craters made since the scene last looked (plants there get uprooted). */
  newHoles: { x: number; y: number; r: number }[] = [];
  /** Coins still buried under X marks. */
  buried: { i: number; x: number; y: number; mx: number; my: number; coins: string[] }[] = [];
  buriedVersion = 0;
  /** Fog of war: tiles Clementine has seen. */
  explored: Uint8Array;
  exploredVersion = 0;
  private revealClock = 0;
  private spawnedGroups = new Set<number>();
  private clearedGroups: Set<number>;

  constructor(run: Run, spec: LevelSpec, areaId: number, public fx: Fx, public options: Options) {
    this.run = run;
    this.spec = spec;
    this.areaId = areaId;
    this.depth = spec.depth;
    this.biome = biomeFor(this.depth);
    this.menace = this.biome.menace;
    this.tiles = spec.tiles.slice();
    this.tw = spec.tw;
    this.th = spec.th;
    this.widthPx = this.tw * TILE;
    this.heightPx = this.th * TILE;
    this.arena = spec.boss.arena;
    this.gates = spec.boss.gates;
    this.explored = new Uint8Array(this.tiles.length);

    const persist = run.roomState(areaId);
    for (const i of persist.broken) this.tiles[i] = T_EMPTY;
    this.cw = Math.ceil(this.widthPx / CARVE);
    this.carved = new Uint8Array(this.cw * Math.ceil(this.heightPx / CARVE));
    for (const [hx, hy, hr] of persist.holes ?? []) this.carveMask(hx, hy, hr);
    const dug = new Set(persist.dug ?? []);
    (spec.buried ?? []).forEach((b, i) => {
      if (!dug.has(i)) this.buried.push({ i, ...b });
    });
    this.clearedGroups = new Set(persist.groupsCleared ?? []);
    this.bossDead = !!persist.bossDead;
    if (persist.explored) unpackBits(persist.explored, this.explored);
    if (run.data.mapRevealed && areaId === LEVEL_ID) this.explored.fill(1);

    const start = persist.pos ?? spec.start;
    this.player = new Player(start.x, start.y);
    this.player.stats = run.stats;
    this.player.solidity = this;

    // The water is simulated only in a window that follows Clementine.
    const cell = options.quality === 'low' ? 24 : 18;
    this.fluid = new FluidField(Math.min(this.widthPx, 2016), Math.min(this.heightPx, 1260), cell);
    this.fluid.iterations = options.quality === 'low' ? 6 : 10;
    this.fluid.solidFn = (x, y) => this.solidAt(x, y);
    this.fluid.follow(this.player.x, this.player.y, true);
    this.fluid.baseX = 3;

    if (!persist.init) {
      persist.init = true;
      for (const pd of spec.pedestals) persist.pedestals.push({ itemId: pd.itemId, x: pd.x, y: pd.y, price: pd.price, pickup: pd.pickup as PickupKind | undefined, hearts: pd.hearts });
      for (const pk of spec.pickups) persist.pickups.push({ kind: pk.kind as PickupKind, x: pk.x, y: pk.y });
    }
    for (const p of persist.pickups) {
      const pk = new Pickup(p.kind, p.x, p.y);
      pk.snack = p.snack;
      pk.delay = 0;
      this.pickups.push(pk);
    }
    for (const pd of persist.pedestals) {
      const ped = new Pedestal(pd.itemId, pd.x, pd.y);
      ped.price = pd.price;
      ped.pickup = pd.pickup;
      ped.hearts = pd.hearts;
      ped.charge = pd.charge;
      this.pedestals.push(ped);
    }
    if (spec.shopkeeper) this.props.push(new Prop('shopkeeper', spec.shopkeeper.x, spec.shopkeeper.y));

    if (areaId === LEVEL_ID) {
      const c = spec.boss.crack;
      this.props.push(new Prop('crack', (c.x0 + c.x1) / 2, c.y, c.x1 - c.x0, 40));
      if (this.bossDead) this.setupBossRewards(false);
    } else if (areaId === GROTTO_ID) {
      const exit = new Prop('grottoExit', TILE * 6.5, spec.start.y - 10);
      exit.active = true;
      this.props.push(exit);
    } else if (areaId === TITLE_ID) {
      const c = spec.boss.crack;
      this.props.push(new Prop('crack', (c.x0 + c.x1) / 2, c.y, c.x1 - c.x0, 40));
    }
    this.reveal(true);
  }

  // ── Terrain ───────────────────────────────────────────────────
  tileAt(tx: number, ty: number) {
    if (tx < 0 || ty < 0 || tx >= this.tw || ty >= this.th) return 1;
    return this.tiles[ty * this.tw + tx];
  }

  solidAt(x: number, y: number) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.tw || ty >= this.th) return true;
    if (!isSolidTile(this.tiles[ty * this.tw + tx])) return false;
    return !this.carved[Math.floor(y / CARVE) * this.cw + Math.floor(x / CARVE)];
  }

  private carveMask(x: number, y: number, r: number) {
    this.holes.push({ x, y, r });
    const m = TILE * 2; // the level's outer shell can't be breached
    const x0 = Math.max(m, x - r), x1 = Math.min(this.widthPx - m, x + r);
    const y0 = Math.max(m, y - r), y1 = Math.min(this.heightPx - m, y + r);
    for (let cy = Math.floor(y0 / CARVE); cy <= Math.floor(y1 / CARVE); cy++)
      for (let cx = Math.floor(x0 / CARVE); cx <= Math.floor(x1 / CARVE); cx++) {
        const px = (cx + 0.5) * CARVE, py = (cy + 0.5) * CARVE;
        if ((px - x) ** 2 + (py - y) ** 2 <= r * r) this.carved[cy * this.cw + cx] = 1;
      }
  }

  /**
   * Blow a round crater into the rock (bombs, explosive ink, charged shots,
   * beams). Pots, urchins and ink stains inside it are destroyed.
   */
  carve(x: number, y: number, r: number) {
    // Only bother if there is rock here at all.
    let any = false;
    for (let a = 0; a < 12 && !any; a++) any = this.solidAt(x + Math.cos(a * 0.52) * r * 0.8, y + Math.sin(a * 0.52) * r * 0.8);
    if (!any && !this.solidAt(x, y)) return;
    this.carveMask(x, y, r);
    this.newHoles.push({ x, y, r });
    const s = this.run.roomState(this.areaId);
    (s.holes ??= []).push([Math.round(x), Math.round(y), Math.round(r)]);
    // Redraw a margin around the crater too (its edges shade the rock nearby).
    const t0x = Math.floor((x - r) / TILE) - 2, t1x = Math.floor((x + r) / TILE) + 2;
    const t0y = Math.floor((y - r) / TILE) - 2, t1y = Math.floor((y + r) / TILE) + 2;
    for (let ty = t0y; ty <= t1y; ty++)
      for (let tx = t0x; tx <= t1x; tx++) {
        if (tx < 0 || ty < 0 || tx >= this.tw || ty >= this.th) continue;
        const i = ty * this.tw + tx;
        const near = dist(x, y, (tx + 0.5) * TILE, (ty + 0.5) * TILE) < r + TILE * 0.3;
        if (near && this.tiles[i] === T_SPIKE) this.setTile(i, T_EMPTY);
        else {
          this.dirtyTiles.push(i);
          this.terrainDirty = true;
        }
      }
    const before = this.inkMarks.length;
    this.inkMarks = this.inkMarks.filter((m) => dist(m.x, m.y, x, y) > r + 6);
    if (this.inkMarks.length !== before) this.inkVersion++;
    this.fluid.refreshSolid();
    this.digUpTreasure();
    // Rubble and silt.
    this.fx.burst(x, y, 'shards', this.biome.rock, Math.round(6 + r / 5));
    this.fx.burst(x, y + r * 0.3, 'sand', undefined, Math.round(4 + r / 10));
  }

  spikeAt(x: number, y: number) {
    return this.tileAt(Math.floor(x / TILE), Math.floor(y / TILE)) === T_SPIKE;
  }

  damageTileAt(x: number, y: number, dmg: number, instant = false) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (this.tileAt(tx, ty) !== T_BREAK) return;
    const i = ty * this.tw + tx;
    const hp = (this.tileHp.get(i) ?? 9) - (instant ? 99 : dmg);
    this.tileHp.set(i, hp);
    this.fx.burst((tx + 0.5) * TILE, (ty + 0.5) * TILE, 'shards', 0xc8743a, 3);
    if (hp <= 0) this.breakTile(tx, ty);
  }

  private setTile(i: number, v: number) {
    this.tiles[i] = v;
    this.run.roomState(this.areaId).broken.push(i);
    this.terrainDirty = true;
    this.dirtyTiles.push(i);
  }

  breakTile(tx: number, ty: number) {
    const i = ty * this.tw + tx;
    if (this.tiles[i] !== T_BREAK) return;
    this.setTile(i, T_EMPTY);
    this.fluid.refreshSolid();
    const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
    this.fx.burst(cx, cy, 'shards', 0xc8743a, 12);
    this.fx.text(cx, cy - 10, 'KRAK!', 0xffa53d, 18);
    sfx.hit();
    const rng = stream(this.run.seed, 'pot', this.depth, this.areaId, i);
    if (rng.chance(0.35)) this.spawnPickup(rng.pick<PickupKind>(['coin', 'coin', 'heart', 'bomb', 'coin']), cx, cy, 0, -40);
  }

  /** Coins buried under an X spill out once the rock above them is blown away. */
  private digUpTreasure() {
    const found = this.buried.filter((b) => !this.solidAt(b.x, b.y));
    if (!found.length) return;
    const s = this.run.roomState(this.areaId);
    for (const b of found) {
      (s.dug ??= []).push(b.i);
      for (const c of b.coins) this.spawnPickup(c as PickupKind, b.x + R.range(-8, 8), b.y, R.range(-90, 90), R.range(-260, -160));
      this.fx.burst(b.x, b.y, 'sparkle', 0xfff27a, 18);
      this.fx.text(b.x, b.y - 30, 'TREASURE!', 0xffe14d, 24);
      sfx.coin();
    }
    this.buried = this.buried.filter((b) => !found.includes(b));
    this.buriedVersion++;
  }

  /** Ink bombs crack open the weak rock sealing secret caves. */
  openSecretNear(x: number, y: number, r: number) {
    const reach = r + TILE * 1.5;
    const t0x = Math.floor((x - reach) / TILE), t1x = Math.floor((x + reach) / TILE);
    const t0y = Math.floor((y - reach) / TILE), t1y = Math.floor((y + reach) / TILE);
    const seeds: number[] = [];
    for (let ty = t0y; ty <= t1y; ty++)
      for (let tx = t0x; tx <= t1x; tx++) if (this.tileAt(tx, ty) === T_SECRET) seeds.push(ty * this.tw + tx);
    if (!seeds.length) return;
    // The whole plug crumbles at once.
    const stack = [...seeds];
    let n = 0, sx = 0, sy = 0;
    while (stack.length) {
      const i = stack.pop()!;
      if (this.tiles[i] !== T_SECRET) continue;
      this.setTile(i, T_EMPTY);
      n++;
      sx += (i % this.tw) + 0.5;
      sy += Math.floor(i / this.tw) + 0.5;
      for (const j of [i - 1, i + 1, i - this.tw, i + this.tw]) if (this.tiles[j] === T_SECRET) stack.push(j);
    }
    this.fluid.refreshSolid();
    const cx = (sx / n) * TILE, cy = (sy / n) * TILE;
    this.fx.burst(cx, cy, 'shards', 0x8a7a6a, 30);
    this.fx.text(cx, cy, 'SECRET!', 0xfff27a, 28);
    sfx.unlock();
  }

  addInkMark(x: number, y: number, nx: number, ny: number, r: number, color: number) {
    // Snap onto the rock face so the splat hugs the surface.
    let sx = x, sy = y;
    for (let i = 0; i < 6 && !this.solidAt(sx - nx * 2, sy - ny * 2); i++) {
      sx -= nx * 4;
      sy -= ny * 4;
    }
    this.inkMarks.push({ x: sx, y: sy, nx, ny, r: Math.max(4, r), color, seed: (Math.random() * 1e9) | 0 });
    if (this.inkMarks.length > MAX_INK_MARKS) this.inkMarks.shift();
    this.inkVersion++;
  }

  /** Mark the tiles around Clementine as seen on the map. */
  reveal(force = false) {
    const p = this.player;
    const cx = Math.floor(p.x / TILE), cy = Math.floor(p.y / TILE);
    const rx = 15, ry = 9;
    let changed = force;
    for (let y = Math.max(0, cy - ry); y <= Math.min(this.th - 1, cy + ry); y++)
      for (let x = Math.max(0, cx - rx); x <= Math.min(this.tw - 1, cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy > 1) continue;
        const i = y * this.tw + x;
        if (!this.explored[i]) {
          this.explored[i] = 1;
          changed = true;
        }
      }
    if (changed) this.exploredVersion++;
  }

  revealAll() {
    this.explored.fill(1);
    this.exploredVersion++;
  }

  /** Barnaby's shop and its surroundings: creatures never come in. */
  get safeZones() {
    return (this._safe ??= this.spec.chambers
      .filter((c) => c.cave === 'shop')
      .map((c) => ({ x: c.cx * TILE, y: c.cy * TILE, rx: (c.rx + 2) * TILE, ry: (c.ry + 2) * TILE })));
  }
  private _safe?: { x: number; y: number; rx: number; ry: number }[];

  inSafeZone(x: number, y: number) {
    for (const z of this.safeZones) if (((x - z.x) / z.rx) ** 2 + ((y - z.y) / z.ry) ** 2 < 1) return true;
    return false;
  }

  /** Places a creature may not swim into. */
  private forbidden(e: Enemy) {
    if (e.boss) return false;
    if (this.inSafeZone(e.x, e.y)) return true;
    return !e.arenaBorn && this.bossFight && this.inArena(e.x, e.y, 0);
  }

  /**
   * Whether a creature keeps hunting Clementine: it notices her when she comes
   * close and gives up when she gets far away, hides in a safe place, or is in
   * the boss arena (only the boss's own minions follow her in there).
   */
  canChase(e: Enemy) {
    const p = this.player;
    const d = dist(p.x, p.y, e.x, e.y);
    if (!e.chasing && d < ENGAGE_RANGE) e.chasing = true;
    else if (e.chasing && d > LEASH_RANGE) e.chasing = false;
    if (!e.chasing) return false;
    if (this.inSafeZone(p.x, p.y)) return false;
    if (this.inArena(p.x, p.y, 0) && !e.arenaBorn) return false;
    return true;
  }

  /** True while Clementine is inside the boss arena. */
  inArena(x: number, y: number, margin = TILE * 1.5) {
    const a = this.arena;
    return a.x1 > a.x0 && x > a.x0 + margin && x < a.x1 - margin && y > a.y0 && y < a.y1;
  }

  get bossFight() {
    return this.bossPending || (!!this.boss && !this.boss.dead);
  }

  /**
   * Arena gates: during the boss fight a strong current pours in through every
   * tunnel into the arena, pushing Clementine back inside.
   */
  private applyGateCurrents(dt: number) {
    if (!this.bossFight) return;
    const p = this.player;
    const range = TILE * 3.5;
    for (const g of this.gates) {
      const along = (p.x - g.x) * g.nx + (p.y - g.y) * g.ny; // > 0: arena side
      const lateral = Math.abs((p.x - g.x) * g.ny - (p.y - g.y) * g.nx);
      if (along < TILE * 1.2 && along > -range && lateral < TILE * 2.6) {
        const k = Math.min(1, (TILE * 1.2 - along) / range);
        const push = 560 * k * (1 - lateral / (TILE * 2.6));
        p.x += g.nx * push * dt;
        p.y += g.ny * push * dt;
        p.vx += g.nx * push * dt * 4;
        p.vy += g.ny * push * dt * 4;
      }
      if (((this.time * 60) | 0) % 6 === 0) this.fluid.splat(g.x - g.nx * 20, g.y - g.ny * 20, g.nx * 60, g.ny * 60, TILE * 0.9);
    }
  }

  // ── Encounters ────────────────────────────────────────────────
  private updateGroups() {
    const p = this.player;
    for (const g of this.spec.groups) {
      if (this.spawnedGroups.has(g.id) || this.clearedGroups.has(g.id)) continue;
      if (dist(p.x, p.y, g.x, g.y) > g.r + WAKE_RANGE) continue;
      this.spawnGroup(g);
    }
    for (const id of this.spawnedGroups) {
      if (this.clearedGroups.has(id)) continue;
      if (this.enemies.some((e) => e.groupId === id && !e.dead)) continue;
      this.onGroupCleared(this.spec.groups[id]);
    }
  }

  private spawnGroup(g: SpawnGroup) {
    this.spawnedGroups.add(g.id);
    const crng = stream(this.run.seed, 'champions', this.depth, g.id);
    for (const s of g.spawns) {
      const e = createEnemy(s.kind, s.x, s.y, this.menace, s.attach);
      e.groupId = g.id;
      // Descent Curve: champions appear from Depth 2 on.
      if (crng.chance(this.menace * 0.6)) e.makeChampion(crng.pick([0xff3d5a, 0x5cf2ff, 0xffe14d, 0xb06bff]));
      this.addEnemy(e);
    }
  }

  private onGroupCleared(g: SpawnGroup) {
    this.clearedGroups.add(g.id);
    const persist = this.run.roomState(this.areaId);
    persist.groupsCleared = [...this.clearedGroups];
    this.events.push({ type: 'cleared' });
    const d = this.run.p;
    if (d.active) {
      const def = ITEM_BY_ID[d.active.id];
      d.active.charge = Math.min(def?.charge ?? 0, d.active.charge + 1);
    }
    // Reward roll (deterministic per encounter).
    const rng = stream(this.run.seed, 'clear', this.depth, g.id);
    const luck = this.run.stats.luck;
    if (rng.chance(0.55 + luck * 0.04)) {
      const kind = rng.weighted<PickupKind>(['coin', 'heart', 'bomb', 'snack', 'clam', 'glowjelly', 'foam', 'goldclam', 'coin5'], (k) =>
        ({ coin: 38, heart: 18, bomb: 17, snack: 8, clam: 6, glowjelly: 3, foam: 4, goldclam: 2, coin5: 3 } as Record<string, number>)[k])!;
      // Drop it near Clementine so she sees it.
      const p = this.player;
      let sx = p.x, sy = p.y - 40;
      for (let i = 0; i < 20 && this.solidAt(sx, sy); i++) {
        sx = p.x + rng.range(-120, 120);
        sy = p.y + rng.range(-100, 40);
      }
      const pk = this.spawnPickup(kind, sx, sy, 0, -80);
      if (kind === 'snack') pk.snack = rng.pick(Object.keys(this.run.data.snacks));
      this.fx.burst(sx, sy, 'sparkle', 0xfff27a, 10);
    }
    this.events.push({ type: 'autosave' });
  }

  // ── Entities ──────────────────────────────────────────────────
  addEnemy(e: Enemy) {
    e.arenaBorn = this.inArena(e.x, e.y, 0);
    this.enemies.push(e);
    this.events.push({ type: 'enemySeen', kind: e.kind });
  }
  addBubble(b: Bubble) {
    this.bubbles.push(b);
  }
  addZone(x: number, y: number, r: number, life: number, kind: 'ink' | 'steam', dps = 0) {
    this.zones.push(new Zone(x, y, r, life, kind, dps));
  }
  spawnPickup(kind: PickupKind, x: number, y: number, vx = 0, vy = 0) {
    const p = new Pickup(kind, x, y, vx, vy);
    if (kind === 'snack') p.snack = this.randomSnack();
    this.pickups.push(p);
    return p;
  }
  randomSnack() {
    return R.pick(Object.keys(this.run.data.snacks));
  }

  nearestEnemy(x: number, y: number, maxD: number): Enemy | null {
    let best: Enemy | null = null, bd = maxD;
    for (const e of this.enemies) {
      if (e.dead || !e.hittable() || e.charmed > 0) continue;
      const d = dist(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }


  spawnBoss() {
    const kind = this.spec.boss.kind;
    const c = this.spec.boss.crack;
    const x = (c.x0 + c.x1) / 2;
    const y = c.y - 70;
    const b = createBoss(kind, x, y, this.menace, this.depth);
    this.boss = b;
    this.addEnemy(b);
    this.bossPending = false;
    this.fx.shake(10);
    this.fx.burst(x, y + 30, 'sand', undefined, 30);
    this.fx.burst(x, y, 'bubbles', undefined, 30);
    this.fluid.blast(x, y, 400, 300);
    sfx.bossRoar();
  }

  // ── Player interaction ───────────────────────────────────────
  /** Damage Clementine by `amount` hit points. */
  hurtPlayer(amount: number, by: string) {
    const p = this.player;
    if (p.invuln > 0 || p.shield > 0 || this.exiting) return;
    if (this.boss && !this.boss.dead) this.bossHurtPlayer = true;
    amount = Math.round(amount);
    const died = this.run.damage(amount);
    p.invuln = 1.1;
    p.hurtFlash = 1;
    this.fx.shake(7);
    this.fx.flash(0xff2d8a, 0.35);
    this.fx.hitstop(4);
    this.fx.text(p.x, p.y - 34, `-${amount}`, 0xff5c7a, 24);
    this.fx.burst(p.x, p.y, 'blood', 0xff9a3d, 10);
    this.fx.light(p.x, p.y, 160, 0xff2d8a, 1, 0.35);
    this.fluid.blast(p.x, p.y, 180, 90);
    sfx.hurt();
    if (died) this.events.push({ type: 'died', by });
  }

  explode(x: number, y: number, r: number, dmg: number, o: { hurtsPlayer?: boolean; steam?: boolean; ink?: boolean; fromBomb?: boolean; carve?: number } = {}) {
    for (const e of this.enemies) {
      if (e.dead || e.hidden) continue;
      if (dist(x, y, e.x, e.y) < r + e.r) {
        e.hurt(this, dmg, null);
        e.knock(e.x - x, e.y - y, 260);
      }
    }
    if (o.hurtsPlayer && dist(x, y, this.player.x, this.player.y) < r + this.player.r) this.hurtPlayer(20, 'Ink Bomb');
    const t0x = Math.floor((x - r) / TILE), t1x = Math.floor((x + r) / TILE);
    const t0y = Math.floor((y - r) / TILE), t1y = Math.floor((y + r) / TILE);
    if (o.fromBomb || !o.steam)
      for (let ty = t0y; ty <= t1y; ty++)
        for (let tx = t0x; tx <= t1x; tx++) {
          if (this.tileAt(tx, ty) === T_BREAK && dist(x, y, (tx + 0.5) * TILE, (ty + 0.5) * TILE) < r + TILE * 0.5) this.breakTile(tx, ty);
        }
    if (o.fromBomb) this.openSecretNear(x, y, r);
    if (o.fromBomb) this.carve(x, y, 72);
    else if (o.carve) this.carve(x, y, o.carve);
    for (const p of this.pickups) {
      const d = dist(x, y, p.x, p.y);
      if (d < r * 1.5 && d > 0.1) {
        p.vx += ((p.x - x) / d) * 300;
        p.vy += ((p.y - y) / d) * 300;
      }
    }
    if (o.steam) {
      this.addZone(x, y, r * 0.8, 1.6, 'steam', dmg * 0.3);
      this.fx.burst(x, y, 'steam', 0xffffff, 24);
      this.fx.text(x, y - 20, 'FSSSSH!', 0xe8f4ff, 26);
    } else {
      this.fx.burst(x, y, 'explosion', 0x6a4a9a, o.fromBomb ? 30 : 14);
      this.fx.text(x, y - 20, o.fromBomb ? 'KA-BLOOSH!' : 'BLOP!', o.fromBomb ? 0xb06bff : 0x9a6bff, o.fromBomb ? 32 : 18);
    }
    if (o.ink) this.addZone(x, y, 48, 3, 'ink');
    this.fx.shake(o.fromBomb ? 12 : 3);
    this.fx.light(x, y, r * 2.2, o.steam ? 0xffffff : 0xb06bff, 1, 0.3);
    this.fluid.blast(x, y, o.fromBomb ? 700 : 260, r * 2.4);
    if (o.fromBomb) {
      this.fx.flash(0xffffff, 0.15);
      this.fx.hitstop(3);
      sfx.explosion();
    }
  }

  dropBomb() {
    const d = this.run.p;
    if (d.bombs <= 0) {
      sfx.deny();
      return;
    }
    d.bombs--;
    this.player.dropBomb(this);
  }

  useActive() {
    const d = this.run.p;
    if (!d.active) return;
    const def = ITEM_BY_ID[d.active.id];
    if (!def || d.active.charge < (def.charge ?? 0)) {
      sfx.deny();
      return;
    }
    const p = this.player;
    let ok = true;
    switch (def.id) {
      case 'conch':
        for (const e of this.enemies) {
          e.stun = e.boss ? 1 : 2.5;
          e.knock(e.x - p.x, e.y - p.y, 400);
        }
        this.fluid.blast(p.x, p.y, 900, 500);
        this.fx.text(p.x, p.y - 40, 'BWAAAAMP!', 0xffb4a0, 34);
        this.fx.shake(10);
        this.fx.ring(p.x, p.y, 400, 0xffb4a0);
        sfx.horn();
        break;
      case 'bubbleshield':
        p.shield = 3.5;
        this.fx.text(p.x, p.y - 40, 'BLOOP!', 0xa0e8ff, 26);
        sfx.pickup();
        break;
      case 'treasuremap':
        this.run.data.mapRevealed = true;
        if (this.areaId === LEVEL_ID) this.revealAll();
        this.events.push({ type: 'mapReveal' });
        this.fx.text(p.x, p.y - 40, 'X MARKS THE SPOT', 0xf2d49a, 22);
        sfx.pickup();
        break;
      case 'mimicclam': {
        const targets = this.pedestals.filter((pd) => pd.itemId && pd.itemId !== HEART_CONTAINER_ID);
        if (!targets.length) { ok = false; break; }
        for (const pd of targets) {
          const rng = stream(this.run.seed, 'reroll', this.depth, this.areaId, this.run.data.poolRemoved.length);
          pd.itemId = this.run.drawItem(pd.price !== undefined ? 'shop' : 'treasure', rng);
          this.fx.burst(pd.x, pd.y - 20, 'sparkle', 0xb88adf, 16);
        }
        this.fx.text(p.x, p.y - 40, 'CHOMP-SHUFFLE!', 0xb88adf, 24);
        sfx.item();
        break;
      }
      case 'glowburst':
        p.glowBurst = 5;
        this.fx.flash(0xfff27a, 0.25);
        this.fx.text(p.x, p.y - 40, 'OVERGLOW!', 0xfff27a, 28);
        sfx.synergy();
        break;
    }
    if (ok) d.active.charge = 0;
    else sfx.deny();
  }

  eatSnack() {
    const d = this.run.p;
    if (!d.snack) return;
    const name = d.snack;
    const effect = this.run.data.snacks[name];
    // Debug runs never run out of snacks.
    d.snack = this.run.data.debug ? R.pick(Object.keys(this.run.data.snacks)) : null;
    const t = d.temp;
    const p = this.player;
    switch (effect) {
      case 'speedup': t.speed = (t.speed ?? 0) + 0.15; break;
      case 'speeddown': t.speed = (t.speed ?? 0) - 0.1; break;
      case 'fullheal': d.hp = d.maxHp; break;
      case 'ouch': if (d.hp + d.foam > 10) this.run.damage(10); else this.run.heal(HEAL_HEART); p.hurtFlash = 1; break;
      case 'luckup': t.luck = (t.luck ?? 0) + 1; break;
      case 'rangeup': t.range = (t.range ?? 0) + 0.75; break;
      case 'rangedown': t.range = (t.range ?? 0) - 0.5; break;
      case 'tearsup': t.fireRate = (t.fireRate ?? 0) + 0.25; break;
      case 'foam': this.run.addFoam(FOAM_PICKUP); break;
      case 'bombs': d.bombs = Math.min(99, d.bombs + 2); break;
    }
    if (!this.run.data.identified.includes(name)) this.run.data.identified.push(name);
    this.run.recompute();
    this.player.stats = this.run.stats;
    this.fx.text(p.x, p.y - 44, SNACK_EFFECT_TEXT[effect], 0xffffff, 24);
    this.events.push({ type: 'snack', name, effect });
    sfx.pickup();
  }

  private collectPickup(pk: Pickup) {
    const d = this.run.p;
    const p = this.player;
    switch (pk.kind) {
      case 'coin': d.coins = Math.min(99, d.coins + 1); sfx.coin(); break;
      case 'coin5': d.coins = Math.min(99, d.coins + 5); sfx.coin(); break;
      case 'bomb': d.bombs = Math.min(99, d.bombs + 1); sfx.pickup(); break;
      case 'heart':
      case 'halfheart':
        if (d.hp >= d.maxHp) return false;
        this.run.heal(pk.kind === 'heart' ? HEAL_HEART : HEAL_HALF);
        this.fx.text(p.x, p.y - 40, `+${pk.kind === 'heart' ? HEAL_HEART : HEAL_HALF}`, 0x7aff9a, 20);
        this.fx.burst(p.x, p.y, 'heal', 0xff4d6d, 8);
        sfx.heart();
        break;
      case 'foam':
        if (d.maxHp + d.foam >= this.run.totalHeartCap()) return false;
        this.run.addFoam(FOAM_PICKUP);
        sfx.heart();
        break;
      case 'container':
        this.run.addContainer(1);
        this.fx.text(p.x, p.y - 40, `MAX HP +${HP_PER_CONTAINER}`, 0xff4d6d, 24);
        sfx.item();
        break;
      case 'snack': {
        const old = d.snack;
        d.snack = pk.snack ?? this.randomSnack();
        if (old) {
          const np = this.spawnPickup('snack', pk.x, pk.y - 20, 0, -60);
          np.snack = old;
          np.delay = 1.2;
        }
        sfx.pickup();
        break;
      }
      case 'glowjelly':
        if (!d.active) return false;
        {
          const def = ITEM_BY_ID[d.active.id];
          if (d.active.charge >= (def?.charge ?? 0)) return false;
          d.active.charge = def?.charge ?? 0;
        }
        sfx.pickup();
        break;
      case 'clam':
      case 'goldclam': {
        if (pk.opened) return false;
        pk.opened = true;
        const rng = stream(this.run.seed, 'clam', this.depth, this.areaId, Math.round(pk.x), Math.round(pk.y));
        const n = pk.kind === 'goldclam' ? rng.int(3, 5) : rng.int(2, 3);
        for (let i = 0; i < n; i++)
          this.spawnPickup(rng.pick<PickupKind>(['coin', 'coin', 'coin5', 'heart', 'bomb', 'snack', 'foam']), pk.x, pk.y - 10, rng.range(-160, 160), rng.range(-260, -120));
        this.fx.text(pk.x, pk.y - 30, 'CLACK!', 0xfff27a, 22);
        sfx.coin();
        return false; // the shell stays, opened
      }
    }
    this.fx.burst(pk.x, pk.y, 'sparkle', 0xfff27a, 5);
    return true;
  }

  private takePedestal(pd: Pedestal) {
    const d = this.run.p;
    const p = this.player;
    if (pd.cooldown > 0) return;
    if (!pd.itemId && !pd.pickup) return;
    if (pd.price !== undefined && d.coins < pd.price) {
      pd.cooldown = 0.8;
      this.fx.text(pd.x, pd.y - 50, `NEED ${pd.price}¢`, 0xffe14d, 18);
      sfx.deny();
      return;
    }
    if (pd.pickup) {
      // Shop pickups: only charge if the pickup is actually usable now.
      const pk = new Pickup(pd.pickup, pd.x, pd.y);
      if (pd.pickup === 'snack') pk.snack = this.randomSnack();
      if (!this.collectPickup(pk)) {
        pd.cooldown = 0.8;
        this.fx.text(pd.x, pd.y - 50, 'FULL!', 0xffffff, 18);
        sfx.deny();
        return;
      }
      if (pd.price !== undefined) d.coins -= pd.price;
      sfx.coin();
      pd.dead = true;
      return;
    }
    if (pd.price !== undefined) {
      d.coins -= pd.price;
      sfx.coin();
    }
    if (pd.hearts !== undefined) {
      // A Siren deal costs max HP (or 1.5× as much foam).
      const cost = pd.hearts * HP_PER_CONTAINER;
      const payContainers = d.maxHp > cost;
      const payFoam = !payContainers && d.foam >= cost * 1.5;
      if (!payContainers && !payFoam) {
        pd.cooldown = 0.8;
        this.fx.text(pd.x, pd.y - 50, 'NOT ENOUGH HP', 0xff4d6d, 18);
        sfx.deny();
        return;
      }
      if (payContainers) {
        d.maxHp -= cost;
        d.hp = Math.min(d.hp, d.maxHp);
      } else d.foam -= cost * 1.5;
      this.fx.text(p.x, p.y - 50, 'A SIREN DEAL...', 0xff5cae, 20);
    }
    const id = pd.itemId!;
    pd.cooldown = 1;
    const old = this.run.giveItem(id);
    if (old) {
      pd.itemId = old.id;
      pd.charge = old.charge;
    } else pd.itemId = null;
    if (pd.charge !== undefined && !old && d.active && ITEM_BY_ID[id]?.kind === 'active') {
      d.active.charge = pd.charge;
    }
    if (pd.price !== undefined || pd.hearts !== undefined) {
      pd.price = undefined;
      pd.hearts = undefined;
      if (!pd.itemId) pd.dead = true;
    }
    this.player.stats = this.run.stats;
    this.events.push({ type: 'item', id });
    this.checkSynergies();
    this.fx.burst(p.x, p.y, 'sparkle', ITEM_BY_ID[id]?.color ?? 0xffffff, 24);
    this.fx.light(p.x, p.y, 220, ITEM_BY_ID[id]?.color ?? 0xffffff, 1, 0.6);
    sfx.item();
  }

  /** Debug: hand Clementine any item. */
  debugGive(id: string) {
    const old = this.run.giveItem(id);
    if (old) this.run.p.active = { id, charge: ITEM_BY_ID[id]?.charge ?? 0 };
    const d = this.run.p;
    if (d.active) d.active.charge = ITEM_BY_ID[d.active.id]?.charge ?? 0;
    this.player.stats = this.run.stats;
    this.events.push({ type: 'item', id });
    this.checkSynergies();
    this.fx.burst(this.player.x, this.player.y, 'sparkle', ITEM_BY_ID[id]?.color ?? 0xffffff, 24);
  }

  /** Debug: make Clementine's items exactly this set. */
  debugSetItems(ids: string[]) {
    const want = new Set(ids);
    const d = this.run.p;
    d.items = d.items.filter((id) => want.has(id));
    if (d.active && !want.has(d.active.id)) d.active = null;
    this.run.recompute();
    for (const id of ids) {
      const def = ITEM_BY_ID[id];
      if (!def) continue;
      if (def.kind === 'active' ? d.active?.id !== id : !d.items.includes(id)) this.debugGive(id);
    }
    this.run.recompute();
    this.player.stats = this.run.stats;
  }

  checkSynergies() {
    const st = this.run.stats;
    for (const s of st.synergies) {
      if (!this.run.data.synergies.includes(s)) {
        this.run.data.synergies.push(s);
        this.events.push({ type: 'synergy', id: s });
        const def = SYNERGIES.find((x) => x.id === s)!;
        this.fx.flash(def.color, 0.3);
        sfx.synergy();
      }
    }
    for (const t of st.transformations) {
      if (!this.run.data.transformations.includes(t)) {
        this.run.data.transformations.push(t);
        this.events.push({ type: 'transformation', id: t });
        const def = TRANSFORMATIONS.find((x) => x.id === t)!;
        this.fx.flash(def.color, 0.4);
        sfx.synergy();
      }
    }
  }

  // ── Kills & rewards ──────────────────────────────────────────
  onEnemyKilled(e: Enemy) {
    this.run.data.kills++;
    const loud = e.menace > 0.3 ? ['SPLAT!', 'KRSSH!', 'GLORK!'] : ['BLORP!', 'POP!', 'SPLOOSH!', 'BLUB!'];
    this.fx.burst(e.x, e.y, 'kill', (e as any).color ?? 0xffffff, 16);
    this.fx.text(e.x, e.y - 20, R.pick(loud), 0xffffff, 22);
    this.fx.light(e.x, e.y, 120, 0xffffff, 0.7, 0.2);
    this.fluid.blast(e.x, e.y, 200, 70);
    sfx.kill();
    if (e.frozen > 0) {
      // Frozen foes shatter into ice shards.
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        this.addBubble(new Bubble({
          x: e.x, y: e.y, vx: Math.cos(a) * 340, vy: Math.sin(a) * 340, dmg: this.run.stats.damage * 0.5, radius: 5,
          range: 180, flags: new Set(['piercing']), synergies: new Set(), transformations: new Set(), luck: 0, mini: true, color: 0x9ef0ff,
        }));
      }
      this.fx.burst(e.x, e.y, 'shards', 0x9ef0ff, 14);
      this.fx.text(e.x, e.y - 40, 'SHATTER!', 0x9ef0ff, 22);
    }
    if (!e.boss && R.chance(0.05 + this.run.stats.luck * 0.01)) this.spawnPickup('coin', e.x, e.y, 0, -60);
    if (e.champion) {
      const rng = stream(this.run.seed, 'champ', this.depth, this.areaId, this.run.data.kills);
      this.spawnPickup(rng.pick<PickupKind>(['heart', 'coin', 'bomb', 'coin', 'foam', 'halfheart']), e.x, e.y, 0, -80);
    }
  }


  onBossKilled(b: Boss) {
    this.onEnemyKilled(b);
    this.fx.shake(18);
    this.fx.flash(0xffffff, 0.6);
    this.fx.hitstop(10);
    this.fx.text(b.x, b.y - 60, 'K.O.!', 0xfff27a, 48);
    this.fx.burst(b.x, b.y, 'explosion', 0xfff27a, 40);
    const persist = this.run.roomState(this.areaId);
    persist.bossDead = true;
    this.bossDead = true;
    for (const e of this.enemies) if (!e.dead && !e.boss && dist(e.x, e.y, b.x, b.y) < 1200) e.die(this);
    this.shots.length = 0;
    this.events.push({ type: 'bossDefeated', kind: b.bossKind });
    this.setupBossRewards(true);
    this.events.push({ type: 'autosave' });
  }

  private setupBossRewards(fresh: boolean) {
    const persist = this.run.roomState(this.areaId);
    const c = this.spec.boss.crack;
    const cx = (c.x0 + c.x1) / 2;
    const a = this.arena;
    if (fresh) {
      const ped = { itemId: this.spec.boss.item || HEART_CONTAINER_ID, x: cx + TILE * 6, y: c.y - 40 };
      persist.pedestals.push(ped);
      this.pedestals.push(new Pedestal(ped.itemId, ped.x, ped.y));
      this.spawnPickup('container', cx - TILE * 5, c.y - TILE * 3, 0, 0);
      const rng = stream(this.run.seed, 'grotto', this.depth);
      const chance = this.bossHurtPlayer ? 0.33 : 0.66;
      persist.grotto = rng.chance(chance) && this.spec.boss.grottoItems.length > 0;
    }
    // The rift opens: deeper if this depth is unlocked, otherwise it ends the dive.
    for (const pr of this.props) if (pr.kind === 'crack') pr.active = true;
    if (persist.grotto) {
      const gp = new Prop('grotto', a.x1 - TILE * 2.5, c.y - 60, 60, 80);
      gp.active = true;
      this.props.push(gp);
    }
  }

  // ── Simulation step ─────────────────────────────────────────
  step(dt: number) {
    this.time += dt;
    this.run.data.time += dt;
    const p = this.player;
    p.stats = this.run.stats;
    p.update(this, dt);
    this.applyGateCurrents(dt);
    this.fluid.follow(p.x, p.y);
    this.revealClock -= dt;
    if (this.revealClock <= 0) {
      this.revealClock = 0.2;
      this.reveal();
    }
    if (this.areaId === LEVEL_ID) {
      this.updateGroups();
      if (!this.bossDead && !this.bossFight && this.inArena(p.x, p.y)) this.bossPending = true;
    }

    // Spikes.
    if (this.spikeAt(p.x, p.y + p.hh)) this.hurtPlayer(Math.round(8 * (1 + this.menace)), 'Urchin Spikes');

    const act2 = ACTIVE_RANGE * ACTIVE_RANGE;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (!e.boss && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 > act2) continue;
      const ox = e.x, oy = e.y;
      e.update(this, dt);
      // Creatures are turned back at the edge of safe places.
      if (this.forbidden(e)) {
        e.x = ox;
        e.y = oy;
        e.vx = -e.vx * 0.3;
        e.vy = -e.vy * 0.3;
        e.kx = e.ky = 0;
      }
    }
    // Soft separation between enemies.
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (a.dead || !a.swimmer || a.boss) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (b.dead || !b.swimmer || b.boss) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (rr - d) * 0.5;
          a.x -= (dx / d) * push * 0.5;
          a.y -= (dy / d) * push * 0.5;
          b.x += (dx / d) * push * 0.5;
          b.y += (dy / d) * push * 0.5;
        }
      }
    }
    // Contact damage (never inside safe places).
    const safe = this.inSafeZone(p.x, p.y);
    for (const e of this.enemies) {
      if (safe) break;
      if (e.dead || e.charmed > 0 || e.spawnGrace > 0 || e.frozen > 0) continue;
      if (e.hidden && !(e.kind === 'moray' && (e as any).out > 0.2)) continue;
      if (e.kind === 'mimic' && e.state === 'disguised') continue;
      const rr = e.r + p.r - 4;
      if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < rr * rr) {
        this.hurtPlayer(e.contactDmg, e.display);
        if (p.shield > 0) e.knock(e.x - p.x, e.y - p.y, 300);
      }
    }

    for (const b of this.bubbles) if (!b.dead) b.update(this, dt);
    for (const s of this.shots) {
      if (s.dead) continue;
      s.update(this, dt);
      if (s.dead && (s as any).burst) this.burstShot(s);
      if (s.dead) continue;
      const rr = s.r + p.r - 3;
      if ((s.x - p.x) ** 2 + (s.y - p.y) ** 2 < rr * rr) {
        if (p.shield > 0 || p.invuln > 0) {
          if (p.shield > 0) {
            s.dead = true;
            this.fx.burst(s.x, s.y, 'pop', 0xa0e8ff, 3);
          }
          continue;
        }
        s.dead = true;
        this.hurtPlayer(s.dmg, this.boss && !this.boss.dead ? this.boss.display : 'a stray shot');
      } else if (p.shield > 0 && (s.x - p.x) ** 2 + (s.y - p.y) ** 2 < 46 * 46) {
        s.dead = true;
        this.fx.burst(s.x, s.y, 'pop', 0xa0e8ff, 3);
      }
    }
    for (const bm of this.beams) bm.update(this, dt);
    for (const z of this.zones) z.update(this, dt);
    for (const h of this.hazards) h.update(this, dt);

    // Bombs.
    for (const b of this.bombs) {
      b.age += dt;
      b.fuse -= dt;
      b.vy += 220 * dt;
      b.vx *= Math.exp(-2 * dt);
      b.vy *= Math.exp(-1.2 * dt);
      const res = moveBox(b, b.vx * dt, b.vy * dt, this);
      if (res.hitY) {
        b.vy = 0;
        // Roll down slopes a little.
        if (!this.solidAt(b.x + 20, b.y + b.hh + 4)) b.vx += 60 * dt;
        else if (!this.solidAt(b.x - 20, b.y + b.hh + 4)) b.vx -= 60 * dt;
      }
      if (res.hitX) b.vx = -b.vx * 0.5;
      if (b.fuse <= 0) {
        b.dead = true;
        this.explode(b.x, b.y, 95, 60, { hurtsPlayer: true, fromBomb: true });
      }
    }

    // Pickups.
    for (const pk of this.pickups) {
      if (pk.dead) continue;
      pk.update(this, dt);
      if (pk.delay > 0) continue;
      const rr = pk.r + p.r + 4;
      if ((pk.x - p.x) ** 2 + (pk.y - p.y) ** 2 < rr * rr) {
        if (this.collectPickup(pk)) pk.dead = true;
      }
    }
    for (const pd of this.pedestals) {
      pd.bob += dt;
      pd.cooldown = Math.max(0, pd.cooldown - dt);
      if (pd.dead) continue;
      if (dist(pd.x, pd.y - 10, p.x, p.y) < 38) this.takePedestal(pd);
    }


    // Props.
    for (const pr of this.props) {
      pr.age += dt;
      if (!pr.active) continue;
      if (pr.kind === 'crack') {
        if (Math.abs(p.x - pr.x) < pr.w / 2 && p.y > pr.y - 70) this.exit({ type: 'descend' });
        if (R.chance(dt * 20)) this.fx.burst(pr.x + R.range(-pr.w / 2, pr.w / 2), pr.y - 10, 'bubbles', undefined, 1);
        this.fluid.splat(pr.x, pr.y - 30, 0, -240 * dt * 10, 60);
      } else if (pr.kind === 'grotto') {
        if (dist(p.x, p.y, pr.x, pr.y) < 44) this.exit({ type: 'grotto' });
      } else if (pr.kind === 'grottoExit') {
        if (pr.age > 1 && dist(p.x, p.y, pr.x, pr.y) < 44) this.exit({ type: 'grottoExit' });
      }
    }

    // Shots fizzle at the edge of safe places.
    for (const s of this.shots) if (!s.dead && this.inSafeZone(s.x, s.y)) {
      s.dead = true;
      this.fx.burst(s.x, s.y, 'pop', s.color, 3);
    }
    // Stray shots far from the action fade out.
    if (this.inSafeZone(p.x, p.y) !== this.wasSafe) {
      this.wasSafe = !this.wasSafe;
      if (this.wasSafe) this.fx.text(p.x, p.y - 50, 'Safe waters', 0x9ef0c8, 18);
    }
    const far2 = 1600 * 1600;
    for (const s of this.shots) if ((s.x - p.x) ** 2 + (s.y - p.y) ** 2 > far2) s.dead = true;

    // Cleanup.
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.bubbles = this.bubbles.filter((b) => !b.dead);
    this.shots = this.shots.filter((s) => !s.dead);
    this.bombs = this.bombs.filter((b) => !b.dead);
    this.pickups = this.pickups.filter((pk) => !pk.dead);
    this.pedestals = this.pedestals.filter((pd) => !pd.dead);
    this.beams = this.beams.filter((b) => !b.dead);
    this.zones = this.zones.filter((z) => !z.dead);
    this.hazards = this.hazards.filter((h) => !h.dead);

    this.fluid.step(dt);
  }

  private burstShot(s: EnemyShot) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.shots.push(new EnemyShot(s.x, s.y - 6, Math.cos(a) * 180, Math.sin(a) * 180, { color: 0xffe14d, r: 6 }));
    }
    this.fx.text(s.x, s.y - 20, 'POP!', 0xffe14d, 18);
  }

  exit(ev: WorldEvent) {
    if (this.exiting) return;
    this.exiting = true;
    this.events.push(ev);
  }

  /** Save transient contents back into run data (on leaving/saving). */
  persist() {
    const s = this.run.roomState(this.areaId);
    // Opened clams are gone once saved.
    s.pickups = this.pickups.filter((p) => !p.opened).map((p) => ({ kind: p.kind, x: p.x, y: p.y, snack: p.snack }));
    s.pedestals = this.pedestals.map((p) => ({ itemId: p.itemId, x: p.x, y: p.y, price: p.price, pickup: p.pickup, hearts: p.hearts, charge: p.charge }));
    s.groupsCleared = [...this.clearedGroups];
    s.explored = packBits(this.explored);
    // Resume where she was, unless mid boss fight (then back at the arena mouth).
    const p = this.player;
    if (!this.bossFight && !this.solidAt(p.x, p.y)) s.pos = { x: Math.round(p.x), y: Math.round(p.y) };
  }
}
