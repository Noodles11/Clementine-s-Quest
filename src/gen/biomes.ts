// Per-depth data: palettes, Menace, enemy pools, boss pools.

export type EnemyKind =
  | 'blob'
  | 'urchin'
  | 'crabby'
  | 'pufferling'
  | 'moray'
  | 'barracuda'
  | 'jelly'
  | 'splitter'
  | 'flounder'
  | 'cannoncrab'
  | 'mimic'
  | 'squidling';

export type BossKind = 'barnacle' | 'queenclam' | 'kelpie' | 'sirurchin' | 'admiral' | 'treasuremimic';

export interface Biome {
  depth: number;
  name: string;
  subtitle: string;
  /** 0 = cute and bright, 1 = ruthless and dark. */
  menace: number;
  waterTop: number;
  waterBottom: number;
  rock: number;
  rockDark: number;
  sand: number;
  accent: number;
  decoColors: number[];
  plantColor: number;
  /** Ambient brightness at top/bottom of the room (lightmap). */
  lightTop: number;
  lightBottom: number;
  godRays: number;
  fishCount: number;
  snowCount: number;
  /** Ceiling of the start room is the water surface. */
  surface: boolean;
  enemies: { kind: EnemyKind; weight: number; cost: number }[];
  bosses: BossKind[];
}

export const BIOMES: Biome[] = [
  {
    depth: 1,
    name: 'Sunlit Shallows',
    subtitle: 'Where the sun still tickles the sand',
    menace: 0,
    waterTop: 0x3fd8e0,
    waterBottom: 0x1a8fb8,
    rock: 0xf2c27b,
    rockDark: 0xc98a4a,
    sand: 0xffe3a3,
    accent: 0xff6fa8,
    decoColors: [0xff6fa8, 0xffa53d, 0xb86bff, 0x5cf2a0],
    plantColor: 0x46d17a,
    lightTop: 1.0,
    lightBottom: 0.86,
    godRays: 1,
    fishCount: 34,
    snowCount: 140,
    surface: true,
    enemies: [
      { kind: 'blob', weight: 5, cost: 1 },
      { kind: 'jelly', weight: 3, cost: 1 },
      { kind: 'crabby', weight: 4, cost: 2 },
      { kind: 'urchin', weight: 3, cost: 2 },
      { kind: 'pufferling', weight: 2, cost: 2 },
      { kind: 'flounder', weight: 2, cost: 2 },
    ],
    bosses: ['barnacle', 'queenclam'],
  },
  {
    depth: 2,
    name: 'Kelp Jungle',
    subtitle: 'Something rustles between the fronds',
    menace: 0.2,
    waterTop: 0x2fb89a,
    waterBottom: 0x0f5a52,
    rock: 0x7fb069,
    rockDark: 0x3f6b3a,
    sand: 0xc9d98b,
    accent: 0xffe14d,
    decoColors: [0xffe14d, 0xff8a3d, 0x9dff5c, 0x4de0ff],
    plantColor: 0x2e9e4f,
    lightTop: 0.92,
    lightBottom: 0.68,
    godRays: 0.65,
    fishCount: 22,
    snowCount: 200,
    surface: false,
    enemies: [
      { kind: 'blob', weight: 3, cost: 1 },
      { kind: 'jelly', weight: 2, cost: 1 },
      { kind: 'crabby', weight: 3, cost: 2 },
      { kind: 'urchin', weight: 2, cost: 2 },
      { kind: 'pufferling', weight: 3, cost: 2 },
      { kind: 'moray', weight: 3, cost: 2 },
      { kind: 'barracuda', weight: 2, cost: 3 },
      { kind: 'splitter', weight: 3, cost: 2 },
      { kind: 'squidling', weight: 2, cost: 3 },
    ],
    bosses: ['kelpie', 'sirurchin'],
  },
  {
    depth: 3,
    name: 'Sunken Galleon',
    subtitle: 'Rust, gold, and things that bite',
    menace: 0.4,
    waterTop: 0x2a6f8a,
    waterBottom: 0x10283a,
    rock: 0x9a6b45,
    rockDark: 0x523321,
    sand: 0xc8a676,
    accent: 0xffc43d,
    decoColors: [0xffc43d, 0xd9583b, 0x6bd3c7, 0xb98cff],
    plantColor: 0x4f8a5a,
    lightTop: 0.8,
    lightBottom: 0.5,
    godRays: 0.35,
    fishCount: 12,
    snowCount: 260,
    surface: false,
    enemies: [
      { kind: 'crabby', weight: 3, cost: 2 },
      { kind: 'pufferling', weight: 2, cost: 2 },
      { kind: 'moray', weight: 3, cost: 2 },
      { kind: 'barracuda', weight: 3, cost: 3 },
      { kind: 'splitter', weight: 2, cost: 2 },
      { kind: 'cannoncrab', weight: 3, cost: 3 },
      { kind: 'mimic', weight: 1, cost: 3 },
      { kind: 'squidling', weight: 3, cost: 3 },
      { kind: 'blob', weight: 2, cost: 1 },
    ],
    bosses: ['admiral', 'treasuremimic'],
  },
];

export function biomeFor(depth: number): Biome {
  return BIOMES[Math.max(0, Math.min(BIOMES.length - 1, depth - 1))];
}

export const BOSS_NAMES: Record<BossKind, { name: string; issue: string; tagline: string }> = {
  barnacle: { name: 'Big Barnacle Bill', issue: 'ISSUE #1', tagline: 'He sticks around!' },
  queenclam: { name: 'Queen Clam', issue: 'ISSUE #2', tagline: 'Her pearls are NOT for sharing' },
  kelpie: { name: 'Kelpie the Tangler', issue: 'ISSUE #3', tagline: 'All tied up in knots' },
  sirurchin: { name: 'Sir Urchin', issue: 'ISSUE #4', tagline: 'A very prickly knight' },
  admiral: { name: 'The Rusty Admiral', issue: 'ISSUE #5', tagline: 'Fire the cannons!' },
  treasuremimic: { name: 'Treasure Mimic', issue: 'ISSUE #6', tagline: 'All that glitters... bites' },
};
