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
  /** Camera color grade: channel gains, shadow lift, saturation, contrast. */
  grade: { tint: [number, number, number]; lift: [number, number, number]; saturation: number; contrast: number };
  enemies: { kind: EnemyKind; weight: number; cost: number }[];
  bosses: BossKind[];
}

export const BIOMES: Biome[] = [
  {
    depth: 1,
    name: 'Sunlit Shallows',
    subtitle: 'Where the sun still tickles the sand',
    menace: 0,
    waterTop: 0x46a9ba,
    waterBottom: 0x0d4a66,
    rock: 0xa8906e,
    rockDark: 0x4e4034,
    sand: 0xcdbb94,
    accent: 0xd9728a,
    decoColors: [0xc86a7e, 0xd08a4e, 0x8a6aa8, 0x5aa88a],
    plantColor: 0x4f8f52,
    lightTop: 0.98,
    lightBottom: 0.6,
    godRays: 1.25,
    fishCount: 34,
    snowCount: 140,
    surface: true,
    grade: { tint: [0.94, 1.0, 1.03], lift: [0.0, 0.03, 0.06], saturation: 0.9, contrast: 1.06 },
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
    waterTop: 0x2f8a7a,
    waterBottom: 0x06302e,
    rock: 0x5f6e52,
    rockDark: 0x222c20,
    sand: 0x9aa07c,
    accent: 0xc8b44a,
    decoColors: [0xb8a04a, 0xb8703e, 0x7a9a4a, 0x4a8aa0],
    plantColor: 0x3f7a3a,
    lightTop: 0.82,
    lightBottom: 0.4,
    godRays: 0.9,
    fishCount: 22,
    snowCount: 200,
    surface: false,
    grade: { tint: [0.86, 1.02, 0.95], lift: [0.0, 0.04, 0.04], saturation: 0.85, contrast: 1.1 },
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
    waterTop: 0x1d4c5e,
    waterBottom: 0x040e18,
    rock: 0x6a5442,
    rockDark: 0x221a14,
    sand: 0x86745c,
    accent: 0xc8a040,
    decoColors: [0xb8943e, 0xa0503a, 0x4e9a90, 0x7a6aa0],
    plantColor: 0x44603e,
    lightTop: 0.6,
    lightBottom: 0.24,
    godRays: 0.55,
    fishCount: 12,
    snowCount: 260,
    surface: false,
    grade: { tint: [0.8, 0.95, 1.06], lift: [0.0, 0.02, 0.07], saturation: 0.8, contrast: 1.14 },
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
