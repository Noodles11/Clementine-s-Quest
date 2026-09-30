// RoomWorld: the live simulation of one room.

import { TILE } from '../config';
import { dist } from '../core/math';
import { cosmetic as R, stream } from '../core/rng';
import { sfx } from '../core/audio';
import type { Options } from '../core/save';
import { biomeFor, type Biome } from '../gen/biomes';
import { OPPOSITE, type DoorSpec, type FloorRoom, type Side } from '../gen/floor';
import { buildRoom, isSolidTile, T_BREAK, T_EMPTY, T_SECRET, T_SPIKE, type DoorMouth, type RoomLayout } from '../gen/roomgen';
import { FluidField } from '../ambient/fluid';
import { createBoss, Hazard, type Boss } from './bosses';
import { createEnemy, Enemy } from './enemies';
import type { Fx } from './fx';
import { ITEM_BY_ID, HEART_CONTAINER_ID } from './items';
import { Pedestal, Pickup, Prop } from './pickups';
import { Player } from './player';
import { Beam, Bubble, EnemyShot, InkBomb, Zone } from './projectiles';
import { SNACK_EFFECT_TEXT, type PickupKind, type Run } from './run';
import { SYNERGIES, TRANSFORMATIONS } from './synergies';
import type { Solidity } from './entity';
import { moveBox } from './entity';

export interface DoorState {
  mouth: DoorMouth;
  spec: DoorSpec;
  open: boolean;
  locked: boolean;
  hidden: boolean;
  /** 0 closed .. 1 open (animation). */
  anim: number;
}

export type WorldEvent =
  | { type: 'exit'; door: DoorSpec }
  | { type: 'descend' }
  | { type: 'surface' }
  | { type: 'grotto' }
  | { type: 'grottoExit' }
  | { type: 'died'; by: string }
  | { type: 'item'; id: string }
  | { type: 'synergy'; id: string }
  | { type: 'transformation'; id: string }
  | { type: 'bossDefeated'; kind: string }
  | { type: 'cleared' }
  | { type: 'enemySeen'; kind: string }
  | { type: 'mapReveal' }
  | { type: 'snack'; name: string; effect: string };

export const GROTTO_ID = -2;

export function doorKey(a: number, b: number) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export class RoomWorld implements Solidity {
  run: Run;
  room: FloorRoom;
  layout: RoomLayout;
  biome: Biome;
  menace: number;
  depth: number;
  tiles: Uint8Array;
  tw: number;
  th: number;
  widthPx: number;
  heightPx: number;
  blocked: Uint8Array;
  tileHp = new Map<number, number>();

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
  doors: DoorState[] = [];
  fluid: FluidField;

  events: WorldEvent[] = [];
  time = 0;
  cleared: boolean;
  boss: Boss | null = null;
  bossPending = false;
  terrainDirty = true;
  exiting = false;
  bossHurtPlayer = false;
  rerolls = 0;

  constructor(run: Run, room: FloorRoom, public fx: Fx, public options: Options, entry: { side: Side | null; from: number; door?: DoorSpec }) {
    this.run = run;
    this.room = room;
    this.depth = run.data.depth;
    this.biome = biomeFor(this.depth);
    this.menace = this.biome.menace;
    this.layout = buildRoom(room, this.depth);
    this.tiles = this.layout.tiles;
    this.tw = this.layout.tw;
    this.th = this.layout.th;
    this.widthPx = this.tw * TILE;
    this.heightPx = this.th * TILE;
    this.blocked = new Uint8Array(this.tiles.length);

    const persist = run.roomState(room.id);
    for (const i of persist.broken) this.tiles[i] = T_EMPTY;

    // Doors.
    for (const m of this.layout.mouths) {
      const key = doorKey(room.id, m.door.to);
      const opened = run.data.openedDoors.includes(key);
      const hidden = m.door.hidden && !opened;
      if (m.door.hidden && opened) this.openSecretTiles(m);
      this.doors.push({ mouth: m, spec: m.door, open: true, locked: m.door.locked && !opened, hidden, anim: 1 });
    }

    // Player placement.
    let px = this.layout.center.x, py = this.layout.center.y;
    if (entry.door) {
      const d = entry.door;
      const m = this.layout.mouths.find((mm) => mm.door.to === entry.from && mm.door.side === OPPOSITE[d.side] && mm.door.tlx === d.lx && mm.door.tly === d.ly)
        ?? this.layout.mouths.find((mm) => mm.door.to === entry.from);
      if (m) {
        px = m.ix;
        py = m.iy;
      }
    } else if (room.type === 'start') {
      px = this.widthPx / 2;
      py = TILE * 3;
    }
    this.player = new Player(px, py);
    this.player.stats = run.stats;
    this.player.solidity = { solidAt: (x, y) => this.solidAtForPlayer(x, y) };

    this.fluid = new FluidField(this.widthPx, this.heightPx, options.quality === 'low' ? 24 : 16);
    this.fluid.iterations = options.quality === 'low' ? 6 : 10;
    this.fluid.setSolid((x, y) => this.solidAt(x, y));
    this.fluid.baseX = 3;

    // Contents.
    this.cleared = persist.cleared;
    if (!persist.init) this.initContents(persist);
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
    if (!this.cleared && room.type === 'normal') {
      const crng = run.roomRng(room.id, 'champions');
      for (const s of this.layout.spawns) {
        const e = createEnemy(s.kind, s.x, s.y, this.menace, s.attach);
        // Descent Curve: champions appear from Depth 2 on.
        if (crng.chance(this.menace * 0.6)) e.makeChampion(crng.pick([0xff3d5a, 0x5cf2ff, 0xffe14d, 0xb06bff]));
        this.addEnemy(e);
      }
    }
    if (room.type === 'boss') {
      if (!persist.bossDead) {
        this.bossPending = true;
        this.cleared = false;
      } else this.setupBossRewards(false);
      if (this.layout.crack) this.props.push(new Prop('crack', (this.layout.crack.x0 + this.layout.crack.x1) / 2, this.layout.crack.y, this.layout.crack.x1 - this.layout.crack.x0, 40));
    }
    if (room.type === 'shop') this.props.push(new Prop('shopkeeper', this.widthPx - TILE * 3.5, this.layout.floorAt(this.tw - 4) - 30));
    if (room.id === GROTTO_ID) {
      this.props.push(new Prop('grottoExit', TILE * 2.5, this.layout.floorAt(3) - 60));
      if (entry.from !== undefined) {
        this.player.x = TILE * 4;
        this.player.y = this.layout.floorAt(4) - 80;
      }
    }
    if (this.enemies.length === 0 && !this.bossPending) this.cleared = true;
    // The Urchin Den's spiked door stings on the way in.
    if (room.type === 'curse' && entry.door && !persist.visited) {
      const died = run.damage(1);
      this.player.invuln = 1;
      this.player.hurtFlash = 1;
      this.fx.text(this.player.x, this.player.y - 40, 'PRICKLY!', 0xd93b3b, 22);
      if (died) this.events.push({ type: 'died', by: 'the Urchin Den door' });
    }
    persist.visited = true;
    persist.cleared = this.cleared;
    this.updateDoorBlocks(true);
    for (const e of this.enemies) this.events.push({ type: 'enemySeen', kind: e.kind });
  }

  private initContents(persist: ReturnType<Run['roomState']>) {
    const r = this.room;
    persist.init = true;
    const c = this.layout.center;
    const rng = this.run.roomRng(r.id, 'contents');
    if ((r.type === 'treasure' || r.type === 'secret' || r.type === 'curse') && r.item) {
      persist.pedestals.push({ itemId: r.item, x: c.x, y: c.y });
    } else if (r.type === 'secret') {
      for (let i = 0; i < rng.int(4, 6); i++) persist.pickups.push({ kind: rng.pick<PickupKind>(['coin', 'coin5', 'bomb', 'key', 'heart']), x: c.x + rng.range(-160, 160), y: c.y - 40 });
    } else if (r.type === 'curse') {
      persist.pickups.push({ kind: 'goldclam', x: c.x, y: c.y - 20 });
      persist.pickups.push({ kind: 'foam', x: c.x + 60, y: c.y - 20 });
    } else if (r.type === 'shop' && r.shop) {
      r.shop.forEach((slot, i) => {
        const spot = this.layout.shopSpots[i];
        if (!spot) return;
        persist.pedestals.push({ itemId: slot.kind === 'item' ? slot.itemId! : null, pickup: slot.pickup as PickupKind, x: spot.x, y: spot.y, price: slot.price });
      });
    } else if (r.id === GROTTO_ID && r.grottoItems) {
      r.grottoItems.forEach((id, i) => {
        const spot = this.layout.shopSpots[i];
        if (!spot) return;
        const q = ITEM_BY_ID[id]?.quality ?? 2;
        persist.pedestals.push({ itemId: id, x: spot.x, y: spot.y, hearts: q >= 3 ? 2 : 1 });
      });
    } else if (r.type === 'start' && this.depth > 1) {
      // A little welcome gift on deeper floors.
      if (rng.chance(0.5)) persist.pickups.push({ kind: rng.pick<PickupKind>(['coin', 'bomb', 'key']), x: c.x + 80, y: c.y });
    }
  }

  // ── Terrain ───────────────────────────────────────────────────
  tileAt(tx: number, ty: number) {
    if (tx < 0 || ty < 0 || tx >= this.tw || ty >= this.th) return 1;
    return this.tiles[ty * this.tw + tx];
  }

  solidAt(x: number, y: number) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.tw || ty >= this.th) return true;
    const i = ty * this.tw + tx;
    return isSolidTile(this.tiles[i]) || this.blocked[i] === 1;
  }

  /** Like solidAt, but open door mouths extend beyond the room edge. */
  solidAtForPlayer(x: number, y: number) {
    let tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const outside = tx < 0 || ty < 0 || tx >= this.tw || ty >= this.th;
    if (outside) {
      tx = Math.max(0, Math.min(this.tw - 1, tx));
      ty = Math.max(0, Math.min(this.th - 1, ty));
    }
    const i = ty * this.tw + tx;
    return isSolidTile(this.tiles[i]) || this.blocked[i] === 1;
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

  breakTile(tx: number, ty: number) {
    const i = ty * this.tw + tx;
    if (this.tiles[i] !== T_BREAK) return;
    this.tiles[i] = T_EMPTY;
    this.run.roomState(this.room.id).broken.push(i);
    this.terrainDirty = true;
    this.fluid.setSolid((x, y) => this.solidAt(x, y));
    const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
    this.fx.burst(cx, cy, 'shards', 0xc8743a, 12);
    this.fx.text(cx, cy - 10, 'KRAK!', 0xffa53d, 18);
    sfx.hit();
    const rng = stream(this.run.seed, 'pot', this.depth, this.room.id, i);
    if (rng.chance(0.35)) this.spawnPickup(rng.pick<PickupKind>(['coin', 'coin', 'heart', 'bomb', 'key']), cx, cy, 0, -40);
  }

  private openSecretTiles(m: DoorMouth) {
    const tx = Math.floor(m.x / TILE), ty = Math.floor(m.y / TILE);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = Math.max(0, Math.min(this.tw - 1, tx + dx)), y = Math.max(0, Math.min(this.th - 1, ty + dy));
        if (this.tiles[y * this.tw + x] === T_SECRET) this.tiles[y * this.tw + x] = T_EMPTY;
      }
  }

  openSecretNear(x: number, y: number, r: number) {
    for (const d of this.doors) {
      if (!d.hidden) continue;
      if (dist(x, y, d.mouth.x, d.mouth.y) > r + TILE * 1.5) continue;
      d.hidden = false;
      d.locked = false;
      this.openSecretTiles(d.mouth);
      const key = doorKey(this.room.id, d.spec.to);
      if (!this.run.data.openedDoors.includes(key)) this.run.data.openedDoors.push(key);
      this.terrainDirty = true;
      this.fluid.setSolid((xx, yy) => this.solidAt(xx, yy));
      this.fx.text(d.mouth.x, d.mouth.y, 'SECRET!', 0xfff27a, 28);
      sfx.unlock();
    }
  }

  updateDoorBlocks(instant = false) {
    this.blocked.fill(0);
    for (const d of this.doors) {
      const shouldOpen = this.cleared && !d.locked && !d.hidden;
      if (shouldOpen !== d.open) {
        d.open = shouldOpen;
        if (!instant) sfx.door();
      }
      if (instant) d.anim = d.open ? 1 : 0;
      if (d.open) continue;
      const { mouth } = d;
      const tx = Math.floor(Math.min(mouth.x, this.widthPx - 1) / TILE), ty = Math.floor(Math.min(mouth.y, this.heightPx - 1) / TILE);
      // Block the outer mouth tiles.
      if (d.spec.side === 'L' || d.spec.side === 'R') {
        for (let yy = ty - 1; yy <= ty + 1; yy++) this.blocked[yy * this.tw + tx] = 1;
      } else {
        for (let xx = tx - 1; xx <= tx; xx++) this.blocked[ty * this.tw + xx] = 1;
      }
    }
  }

  // ── Entities ──────────────────────────────────────────────────
  addEnemy(e: Enemy) {
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
    const kind = this.room.boss ?? 'barnacle';
    const c = this.layout.crack;
    const x = c ? (c.x0 + c.x1) / 2 : this.widthPx / 2;
    const y = c ? c.y - 70 : this.heightPx / 2;
    const b = createBoss(kind, x, y, this.menace, this.depth);
    this.boss = b;
    this.addEnemy(b);
    this.bossPending = false;
    this.fx.shake(10);
    this.fx.burst(x, y + 30, 'sand', undefined, 30);
    this.fx.burst(x, y, 'bubbles', undefined, 30);
    this.fluid.blast(x, y, 400, 300);
    sfx.bossRoar();
    this.updateDoorBlocks();
  }

  // ── Player interaction ───────────────────────────────────────
  hurtPlayer(halves: number, by: string) {
    const p = this.player;
    if (p.invuln > 0 || p.shield > 0 || this.exiting) return;
    if (this.boss && !this.boss.dead) this.bossHurtPlayer = true;
    const died = this.run.damage(halves);
    p.invuln = 1.1;
    p.hurtFlash = 1;
    this.fx.shake(7);
    this.fx.flash(0xff2d8a, 0.35);
    this.fx.hitstop(4);
    this.fx.text(p.x, p.y - 34, R.pick(['OUCH!', 'EEK!', 'BLUB!!']), 0xff5cae, 24);
    this.fx.burst(p.x, p.y, 'blood', 0xff9a3d, 10);
    this.fx.light(p.x, p.y, 160, 0xff2d8a, 1, 0.35);
    this.fluid.blast(p.x, p.y, 180, 90);
    sfx.hurt();
    if (died) this.events.push({ type: 'died', by });
  }

  explode(x: number, y: number, r: number, dmg: number, o: { hurtsPlayer?: boolean; steam?: boolean; ink?: boolean; fromBomb?: boolean } = {}) {
    for (const e of this.enemies) {
      if (e.dead || e.hidden) continue;
      if (dist(x, y, e.x, e.y) < r + e.r) {
        e.hurt(this, dmg, null);
        e.knock(e.x - x, e.y - y, 260);
      }
    }
    if (o.hurtsPlayer && dist(x, y, this.player.x, this.player.y) < r + this.player.r) this.hurtPlayer(2, 'Ink Bomb');
    const t0x = Math.floor((x - r) / TILE), t1x = Math.floor((x + r) / TILE);
    const t0y = Math.floor((y - r) / TILE), t1y = Math.floor((y + r) / TILE);
    if (o.fromBomb || !o.steam)
      for (let ty = t0y; ty <= t1y; ty++)
        for (let tx = t0x; tx <= t1x; tx++) {
          if (this.tileAt(tx, ty) === T_BREAK && dist(x, y, (tx + 0.5) * TILE, (ty + 0.5) * TILE) < r + TILE * 0.5) this.breakTile(tx, ty);
        }
    if (o.fromBomb) this.openSecretNear(x, y, r);
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
        this.events.push({ type: 'mapReveal' });
        this.fx.text(p.x, p.y - 40, 'X MARKS THE SPOT', 0xf2d49a, 22);
        sfx.pickup();
        break;
      case 'mimicclam': {
        const targets = this.pedestals.filter((pd) => pd.itemId && pd.itemId !== HEART_CONTAINER_ID);
        if (!targets.length) { ok = false; break; }
        for (const pd of targets) {
          const rng = stream(this.run.seed, 'reroll', this.depth, this.room.id, this.run.data.poolRemoved.length);
          pd.itemId = this.run.drawItem(this.room.type === 'shop' ? 'shop' : 'treasure', rng);
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
    d.snack = null;
    const t = d.temp;
    const p = this.player;
    switch (effect) {
      case 'speedup': t.speed = (t.speed ?? 0) + 0.15; break;
      case 'speeddown': t.speed = (t.speed ?? 0) - 0.1; break;
      case 'fullheal': d.hp = d.maxHp; break;
      case 'ouch': if (d.hp + d.foam > 1) this.run.damage(1); else this.run.heal(2); p.hurtFlash = 1; break;
      case 'luckup': t.luck = (t.luck ?? 0) + 1; break;
      case 'rangeup': t.range = (t.range ?? 0) + 0.75; break;
      case 'rangedown': t.range = (t.range ?? 0) - 0.5; break;
      case 'tearsup': t.fireRate = (t.fireRate ?? 0) + 0.25; break;
      case 'foam': this.run.addFoam(2); break;
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
      case 'key': d.keys = Math.min(99, d.keys + 1); sfx.pickup(); break;
      case 'bomb': d.bombs = Math.min(99, d.bombs + 1); sfx.pickup(); break;
      case 'heart':
      case 'halfheart':
        if (d.hp >= d.maxHp) return false;
        this.run.heal(pk.kind === 'heart' ? 2 : 1);
        this.fx.burst(p.x, p.y, 'heal', 0xff4d6d, 8);
        sfx.heart();
        break;
      case 'foam':
        if (d.maxHp + d.foam >= this.run.totalHeartCap()) return false;
        this.run.addFoam(2);
        sfx.heart();
        break;
      case 'container':
        this.run.addContainer(1);
        this.fx.text(p.x, p.y - 40, 'HEART UP!', 0xff4d6d, 24);
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
        if (pk.kind === 'goldclam') {
          if (d.keys <= 0) return false;
          d.keys--;
        }
        pk.opened = true;
        const rng = stream(this.run.seed, 'clam', this.depth, this.room.id, Math.round(pk.x), Math.round(pk.y));
        const n = pk.kind === 'goldclam' ? rng.int(3, 5) : rng.int(2, 3);
        for (let i = 0; i < n; i++)
          this.spawnPickup(rng.pick<PickupKind>(['coin', 'coin', 'coin5', 'heart', 'bomb', 'key', 'snack', 'foam']), pk.x, pk.y - 10, rng.range(-160, 160), rng.range(-260, -120));
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
      const cost = pd.hearts * 2;
      const payContainers = d.maxHp >= cost && (d.maxHp > cost || d.foam > 0);
      const payFoam = !payContainers && d.foam >= cost * 1.5 && (d.foam > cost * 1.5 || d.maxHp > 0);
      if (!payContainers && !payFoam) {
        pd.cooldown = 0.8;
        this.fx.text(pd.x, pd.y - 50, 'NOT ENOUGH HEART', 0xff4d6d, 18);
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
      const rng = stream(this.run.seed, 'champ', this.depth, this.room.id, this.run.data.kills);
      this.spawnPickup(rng.pick<PickupKind>(['heart', 'coin', 'bomb', 'key', 'foam', 'halfheart']), e.x, e.y, 0, -80);
    }
  }

  onBossKilled(b: Boss) {
    this.onEnemyKilled(b);
    this.fx.shake(18);
    this.fx.flash(0xffffff, 0.6);
    this.fx.hitstop(10);
    this.fx.text(b.x, b.y - 60, 'K.O.!', 0xfff27a, 48);
    this.fx.burst(b.x, b.y, 'explosion', 0xfff27a, 40);
    const persist = this.run.roomState(this.room.id);
    persist.bossDead = true;
    for (const e of this.enemies) if (!e.dead && !e.boss) e.die(this);
    this.shots.length = 0;
    this.events.push({ type: 'bossDefeated', kind: b.bossKind });
    this.setupBossRewards(true);
  }

  private setupBossRewards(fresh: boolean) {
    const persist = this.run.roomState(this.room.id);
    const c = this.layout.crack;
    const cx = c ? (c.x0 + c.x1) / 2 : this.widthPx / 2;
    if (fresh) {
      const left = cx < this.widthPx / 2;
      const px = left ? cx + TILE * 7 : cx - TILE * 5;
      const floorY = this.layout.floorAt(Math.floor(px / TILE));
      persist.pedestals.push({ itemId: this.room.item ?? HEART_CONTAINER_ID, x: px, y: floorY - 40 });
      const ped = persist.pedestals[persist.pedestals.length - 1];
      const pd = new Pedestal(ped.itemId, ped.x, ped.y);
      this.pedestals.push(pd);
      this.spawnPickup('container', left ? cx + TILE * 10 : cx + TILE * 5, TILE * 2, 0, 0);
      const rng = this.run.roomRng(this.room.id, 'grotto');
      const chance = this.bossHurtPlayer ? 0.33 : 0.66;
      persist.grotto = rng.chance(chance) && !!this.room.grottoItems;
    }
    const canDescend = this.depth < this.run.data.maxDepth;
    for (const pr of this.props) if (pr.kind === 'crack') pr.active = canDescend;
    const surf = new Prop('surface', this.widthPx / 2, TILE * 2.6, 70, 70);
    surf.active = true;
    this.props.push(surf);
    if (persist.grotto) {
      const gp = new Prop('grotto', this.widthPx - TILE * 3, this.layout.floorAt(this.tw - 3) - 60, 60, 80);
      gp.active = true;
      this.props.push(gp);
    }
    this.cleared = true;
    persist.cleared = true;
    this.updateDoorBlocks(!fresh);
  }

  private onRoomCleared() {
    const persist = this.run.roomState(this.room.id);
    persist.cleared = true;
    this.cleared = true;
    this.updateDoorBlocks();
    this.events.push({ type: 'cleared' });
    const d = this.run.p;
    if (d.active) {
      const def = ITEM_BY_ID[d.active.id];
      d.active.charge = Math.min(def?.charge ?? 0, d.active.charge + 1);
    }
    if (this.room.type !== 'normal') return;
    // Reward roll (deterministic per room).
    const rng = this.run.roomRng(this.room.id, 'clear');
    const luck = this.run.stats.luck;
    if (!rng.chance(0.55 + luck * 0.04)) return;
    const kind = rng.weighted<PickupKind>(['coin', 'heart', 'key', 'bomb', 'snack', 'clam', 'glowjelly', 'foam', 'goldclam', 'coin5'], (k) =>
      ({ coin: 34, heart: 16, key: 12, bomb: 13, snack: 8, clam: 6, glowjelly: 3, foam: 4, goldclam: 2, coin5: 3 } as Record<string, number>)[k])!;
    const c = this.layout.center;
    // Find an open spot near the center.
    let sx = c.x, sy = c.y;
    for (let i = 0; i < 20 && this.solidAt(sx, sy); i++) {
      sx = c.x + rng.range(-200, 200);
      sy = c.y + rng.range(-100, 60);
    }
    const pk = this.spawnPickup(kind, sx, sy, 0, -80);
    if (kind === 'snack') pk.snack = rng.pick(Object.keys(this.run.data.snacks));
    this.fx.burst(sx, sy, 'sparkle', 0xfff27a, 10);
  }

  // ── Simulation step ─────────────────────────────────────────
  step(dt: number) {
    this.time += dt;
    this.run.data.time += dt;
    const p = this.player;
    p.stats = this.run.stats;
    p.update(this, dt);

    // Spikes.
    if (this.spikeAt(p.x, p.y + p.hh)) this.hurtPlayer(1, 'Urchin Spikes');

    for (const e of this.enemies) if (!e.dead) e.update(this, dt);
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
    // Contact damage.
    for (const e of this.enemies) {
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

    // Locked doors: unlock with a key when touching them.
    for (const d of this.doors) {
      if (!d.locked || d.hidden) continue;
      if (dist(d.mouth.ix, d.mouth.iy, p.x, p.y) < 70) {
        if (this.run.p.keys > 0) {
          this.run.p.keys--;
          d.locked = false;
          const key = doorKey(this.room.id, d.spec.to);
          if (!this.run.data.openedDoors.includes(key)) this.run.data.openedDoors.push(key);
          this.fx.text(d.mouth.ix, d.mouth.iy - 30, 'CLICK!', 0xffe14d, 22);
          sfx.unlock();
          this.updateDoorBlocks();
        } else if (R.chance(dt * 1.5)) this.fx.text(d.mouth.ix, d.mouth.iy - 30, 'LOCKED', 0xffe14d, 16);
      }
    }
    for (const d of this.doors) d.anim += ((d.open ? 1 : 0) - d.anim) * Math.min(1, dt * 8);

    // Props.
    for (const pr of this.props) {
      pr.age += dt;
      if (!pr.active) continue;
      if (pr.kind === 'crack') {
        if (Math.abs(p.x - pr.x) < pr.w / 2 && p.y > pr.y - 70) this.exit({ type: 'descend' });
        if (R.chance(dt * 20)) this.fx.burst(pr.x + R.range(-pr.w / 2, pr.w / 2), pr.y - 10, 'bubbles', undefined, 1);
        this.fluid.splat(pr.x, pr.y - 30, 0, -240 * dt * 10, 60);
      } else if (pr.kind === 'surface') {
        if (dist(p.x, p.y, pr.x, pr.y) < 50) this.exit({ type: 'surface' });
      } else if (pr.kind === 'grotto') {
        if (dist(p.x, p.y, pr.x, pr.y) < 44) this.exit({ type: 'grotto' });
      } else if (pr.kind === 'grottoExit') {
        if (pr.age > 1 && dist(p.x, p.y, pr.x, pr.y) < 44) this.exit({ type: 'grottoExit' });
      }
    }

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

    if (!this.cleared && !this.bossPending && this.enemies.length === 0) this.onRoomCleared();

    // Door exits.
    if (!this.exiting) {
      const out = p.x < 0 ? 'L' : p.x > this.widthPx ? 'R' : p.y < 0 ? 'U' : p.y > this.heightPx ? 'D' : null;
      if (out) {
        let best: DoorState | null = null, bd = 1e9;
        for (const d of this.doors) {
          if (d.spec.side !== out || !d.open) continue;
          const dd = dist(p.x, p.y, d.mouth.x, d.mouth.y);
          if (dd < bd) { bd = dd; best = d; }
        }
        if (best) this.exit({ type: 'exit', door: best.spec });
      }
    }

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
    const s = this.run.roomState(this.room.id);
    // Opened clams are gone once you leave.
    s.pickups = this.pickups.filter((p) => !p.opened).map((p) => ({ kind: p.kind, x: p.x, y: p.y, snack: p.snack }));
    s.pedestals = this.pedestals.map((p) => ({ itemId: p.itemId, x: p.x, y: p.y, price: p.price, pickup: p.pickup, hearts: p.hearts, charge: p.charge }));
    s.cleared = this.cleared;
  }
}
