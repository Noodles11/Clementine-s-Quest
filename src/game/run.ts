// Run state: everything needed to resume a run, plus player bookkeeping.

import { Rng, stream } from '../core/rng';
import { seedToNumber } from '../gen/seed';
import { generateGrotto, generateLevel, type LevelSpec } from '../gen/level';
import { ItemPools } from './pools';
import { ITEM_BY_ID, type StatBlock } from './items';
import { computeStats, type DerivedStats } from './stats';

export type PickupKind =
  | 'coin'
  | 'coin5'
  | 'key'
  | 'bomb'
  | 'heart'
  | 'halfheart'
  | 'foam'
  | 'snack'
  | 'glowjelly'
  | 'clam'
  | 'goldclam'
  | 'container';

export interface PickupData {
  kind: PickupKind;
  x: number;
  y: number;
  snack?: string;
}

export interface PedestalData {
  itemId: string | null;
  x: number;
  y: number;
  price?: number;
  pickup?: PickupKind;
  hearts?: number;
  charge?: number;
}

export interface RoomPersist {
  visited: boolean;
  cleared: boolean;
  init: boolean;
  pickups: PickupData[];
  pedestals: PedestalData[];
  broken: number[];
  bossDead?: boolean;
  grotto?: boolean;
  groupsCleared?: number[];
  /** Packed fog-of-war bitmap. */
  explored?: string;
  /** Where Clementine was when last saved. */
  pos?: { x: number; y: number };
}

export interface PlayerData {
  hp: number;
  maxHp: number;
  foam: number;
  coins: number;
  bombs: number;
  keys: number;
  items: string[];
  active: { id: string; charge: number } | null;
  snack: string | null;
  temp: Partial<StatBlock>;
}

export const SNACK_EFFECTS = [
  'speedup', 'speeddown', 'fullheal', 'ouch', 'luckup', 'rangeup', 'rangedown', 'tearsup', 'foam', 'bombs',
] as const;
export type SnackEffect = (typeof SNACK_EFFECTS)[number];

export const SNACK_EFFECT_TEXT: Record<SnackEffect, string> = {
  speedup: 'Speed Up!', speeddown: 'Speed Down...', fullheal: 'Full Belly!', ouch: 'Bad Clam! Ouch',
  luckup: 'Lucky Bite!', rangeup: 'Range Up!', rangedown: 'Range Down...', tearsup: 'Ink Up!',
  foam: 'Foamy!', bombs: 'Ink Refill!',
};

const SNACK_NAMES = [
  'Purple Krill', 'Green Algae Chip', 'Pink Shrimp Puff', 'Blue Sea-Grape', 'Yellow Plankton Pop',
  'Red Roe Candy', 'Orange Kelp Crunch', 'White Salt Taffy', 'Teal Nori Roll', 'Gold Urchin Drop',
];
export const SNACK_COLORS: Record<string, number> = {
  'Purple Krill': 0xb06bff, 'Green Algae Chip': 0x5cd65c, 'Pink Shrimp Puff': 0xff8ac8, 'Blue Sea-Grape': 0x4d8cff,
  'Yellow Plankton Pop': 0xffe14d, 'Red Roe Candy': 0xff4d4d, 'Orange Kelp Crunch': 0xff9a3d,
  'White Salt Taffy': 0xf4f4f4, 'Teal Nori Roll': 0x2ec4b6, 'Gold Urchin Drop': 0xffc43d,
};

export interface RunData {
  v: 2;
  seedCode: string;
  custom: boolean;
  depth: number;
  maxDepth: number;
  unlocked: string[];
  floorPoolStart: string[];
  poolRemoved: string[];
  player: PlayerData;
  /** Per-area state: the level (0) and the Mermaid's Grotto (-2). */
  rooms: Record<string, RoomPersist>;
  currentRoom: number;
  time: number;
  kills: number;
  synergies: string[];
  transformations: string[];
  floorDamaged: boolean;
  mapRevealed: boolean;
  /** snack name → effect */
  snacks: Record<string, SnackEffect>;
  identified: string[];
  bossesBeaten: string[];
}

export class Run {
  data: RunData;
  seed: number;
  level!: LevelSpec;
  stats!: DerivedStats;
  private pools!: ItemPools;

  constructor(data: RunData) {
    if (data.v !== 2) throw new Error('Old run format');
    this.data = data;
    this.seed = seedToNumber(data.seedCode);
    this.buildFloor();
    this.recompute();
  }

  static create(seedCode: string, custom: boolean, unlocked: string[], maxDepth: number): Run {
    const seed = seedToNumber(seedCode);
    const rng = stream(seed, 'snacks');
    const names = rng.shuffle([...SNACK_NAMES]);
    const snacks: Record<string, SnackEffect> = {};
    SNACK_EFFECTS.forEach((e, i) => (snacks[names[i]] = e));
    const data: RunData = {
      v: 2,
      seedCode,
      custom,
      depth: 1,
      maxDepth,
      unlocked: [...unlocked],
      floorPoolStart: [],
      poolRemoved: [],
      player: {
        hp: 6, maxHp: 6, foam: 0, coins: 0, bombs: 1, keys: 0, items: [], active: null, snack: null, temp: {},
      },
      rooms: {},
      currentRoom: 0,
      time: 0,
      kills: 0,
      synergies: [],
      transformations: [],
      floorDamaged: false,
      mapRevealed: false,
      snacks,
      identified: [],
      bossesBeaten: [],
    };
    return new Run(data);
  }

  buildFloor() {
    const d = this.data;
    this.level = generateLevel({ seed: this.seed, depth: d.depth, unlocked: d.unlocked, poolRemoved: d.floorPoolStart });
    // Pool state continues from level generation plus anything rerolled since.
    this.pools = new ItemPools(d.unlocked, [...this.level.poolRemovedAfter, ...d.poolRemoved]);
  }

  /** The Mermaid's Grotto of the current depth. */
  grottoSpec(): LevelSpec {
    return generateGrotto(this.seed, this.data.depth, this.level.boss.grottoItems);
  }

  nextFloor() {
    const d = this.data;
    d.floorPoolStart = [...this.pools.removed];
    d.poolRemoved = [];
    d.depth++;
    d.rooms = {};
    d.mapRevealed = false;
    d.floorDamaged = false;
    this.buildFloor();
    d.currentRoom = 0;
  }

  /** Draw a fresh item (rerolls). Recorded so continuing reproduces pools. */
  drawItem(pool: 'treasure' | 'boss' | 'shop' | 'secret' | 'grotto' | 'curse', rng: Rng): string {
    const id = this.pools.draw(pool, rng);
    this.data.poolRemoved.push(id);
    return id;
  }

  roomState(id: number): RoomPersist {
    const key = String(id);
    let s = this.data.rooms[key];
    if (!s) {
      s = { visited: false, cleared: false, init: false, pickups: [], pedestals: [], broken: [] };
      this.data.rooms[key] = s;
    }
    return s;
  }

  roomRng(roomId: number, label: string): Rng {
    return stream(this.seed, 'roomrng', this.data.depth, roomId, label);
  }

  recompute() {
    this.stats = computeStats(this.data.player.items, this.data.player.temp);
  }

  // ── Player health ───────────────────────────────────────────
  get p() {
    return this.data.player;
  }

  /** Returns true if the player died. Damage in half-hearts. */
  damage(halves: number): boolean {
    const p = this.p;
    this.data.floorDamaged = true;
    let rem = halves;
    const fromFoam = Math.min(p.foam, rem);
    p.foam -= fromFoam;
    rem -= fromFoam;
    p.hp = Math.max(0, p.hp - rem);
    return p.hp <= 0 && p.foam <= 0;
  }

  heal(halves: number) {
    const p = this.p;
    p.hp = Math.min(p.maxHp, p.hp + halves);
  }

  totalHeartCap() {
    return 24; // 12 hearts incl. foam
  }

  addFoam(halves: number) {
    const p = this.p;
    p.foam = Math.min(this.totalHeartCap() - p.maxHp, p.foam + halves);
  }

  addContainer(n: number) {
    const p = this.p;
    p.maxHp = Math.min(this.totalHeartCap(), p.maxHp + n * 2);
    p.hp = Math.min(p.maxHp, p.hp + n * 2);
    p.foam = Math.min(p.foam, this.totalHeartCap() - p.maxHp);
  }

  /** Grants an item. Returns the previous active (to drop) if swapped. */
  giveItem(id: string): { id: string; charge: number } | null {
    const def = ITEM_BY_ID[id];
    const p = this.p;
    if (!def) {
      if (id === '__heart_container') this.addContainer(1);
      return null;
    }
    if (def.kind === 'active') {
      const old = p.active;
      p.active = { id, charge: def.charge ?? 0 };
      return old;
    }
    p.items.push(id);
    if (def.hearts) this.addContainer(def.hearts);
    if (def.foam) this.addFoam(def.foam);
    this.recompute();
    return null;
  }
}
