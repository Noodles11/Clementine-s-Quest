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
  | 'squidling'
  // Coral Carnival
  | 'clownanemone'
  | 'seahorse'
  | 'nettle'
  | 'stingray'
  // Twilight Trench
  | 'lanternfish'
  | 'ghostshrimp'
  | 'anglerling'
  | 'hatchetfish'
  // The Abyss
  | 'viperfish'
  | 'gulper'
  | 'isopod'
  // The Tank
  | 'toydiver'
  | 'snail';

export type BossKind =
  | 'barnacle' | 'queenclam' | 'kelpie' | 'sirurchin' | 'admiral' | 'treasuremimic'
  | 'ringmaster' | 'jesters' | 'motherangler' | 'siphonophore' | 'hollowmaw' | 'hand';

/** Depth-specific feature of the level. */
export type BiomeFeature = 'bounce' | 'dark' | 'currents' | 'tank';

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
  feature?: BiomeFeature;
  /** Radius multiplier of Clementine's own light (dark depths rely on it). */
  glowRadius?: number;
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
    waterTop: 0x2c6a7c,
    waterBottom: 0x0c2433,
    rock: 0x7c6450,
    rockDark: 0x3a2c22,
    sand: 0x86745c,
    accent: 0xc8a040,
    decoColors: [0xb8943e, 0xa0503a, 0x4e9a90, 0x7a6aa0],
    plantColor: 0x44603e,
    lightTop: 0.82,
    lightBottom: 0.5,
    godRays: 0.65,
    fishCount: 12,
    snowCount: 260,
    surface: false,
    grade: { tint: [0.88, 0.98, 1.05], lift: [0.02, 0.04, 0.08], saturation: 0.86, contrast: 1.06 },
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
  {
    depth: 4,
    name: 'Coral Carnival',
    subtitle: 'The lights are on, but nobody is laughing',
    menace: 0.55,
    waterTop: 0x5a3f8a,
    waterBottom: 0x170c2e,
    rock: 0x9a5a8a,
    rockDark: 0x3a1a3a,
    sand: 0xc89ab8,
    accent: 0xff5cae,
    decoColors: [0xff5cae, 0xffb347, 0x5cf2ff, 0xb06bff, 0x9dff5c],
    plantColor: 0x8a4aa8,
    lightTop: 0.86,
    lightBottom: 0.55,
    godRays: 0.5,
    fishCount: 14,
    snowCount: 220,
    surface: false,
    grade: { tint: [1.04, 0.92, 1.06], lift: [0.04, 0.0, 0.07], saturation: 1.05, contrast: 1.08 },
    enemies: [
      { kind: 'clownanemone', weight: 3, cost: 2 },
      { kind: 'seahorse', weight: 3, cost: 2 },
      { kind: 'nettle', weight: 3, cost: 2 },
      { kind: 'stingray', weight: 2, cost: 3 },
      { kind: 'jelly', weight: 2, cost: 1 },
      { kind: 'pufferling', weight: 2, cost: 2 },
      { kind: 'splitter', weight: 2, cost: 2 },
      { kind: 'barracuda', weight: 2, cost: 3 },
    ],
    bosses: ['ringmaster', 'jesters'],
    feature: 'bounce',
  },
  {
    depth: 5,
    name: 'Twilight Trench',
    subtitle: 'Only what glows can see',
    menace: 0.75,
    waterTop: 0x173a5e,
    waterBottom: 0x050c1c,
    rock: 0x4a5670,
    rockDark: 0x161c2c,
    sand: 0x6a7890,
    accent: 0x5cf2ff,
    decoColors: [0x5cf2ff, 0x5c8aff, 0xb06bff, 0x9dffd8],
    plantColor: 0x2e5a6a,
    lightTop: 0.62,
    lightBottom: 0.4,
    godRays: 0.15,
    fishCount: 6,
    snowCount: 320,
    surface: false,
    grade: { tint: [0.86, 0.96, 1.1], lift: [0.02, 0.04, 0.09], saturation: 0.9, contrast: 1.08 },
    enemies: [
      { kind: 'lanternfish', weight: 3, cost: 2 },
      { kind: 'ghostshrimp', weight: 3, cost: 2 },
      { kind: 'anglerling', weight: 3, cost: 3 },
      { kind: 'hatchetfish', weight: 3, cost: 1 },
      { kind: 'nettle', weight: 2, cost: 2 },
      { kind: 'squidling', weight: 2, cost: 3 },
      { kind: 'moray', weight: 2, cost: 2 },
    ],
    bosses: ['motherangler', 'siphonophore'],
    feature: 'dark',
    glowRadius: 1.6,
  },
  {
    depth: 6,
    name: 'The Abyss',
    subtitle: 'Something down here is swallowing the song',
    menace: 0.95,
    waterTop: 0x14243a,
    waterBottom: 0x03060e,
    rock: 0x3c3c52,
    rockDark: 0x12121c,
    sand: 0x585870,
    accent: 0xff3d6a,
    decoColors: [0xff3d6a, 0x5cf2ff, 0xb06bff],
    plantColor: 0x3a2a4a,
    lightTop: 0.58,
    lightBottom: 0.38,
    godRays: 0,
    fishCount: 0,
    snowCount: 380,
    surface: false,
    grade: { tint: [0.92, 0.92, 1.08], lift: [0.03, 0.02, 0.08], saturation: 0.8, contrast: 1.1 },
    enemies: [
      { kind: 'viperfish', weight: 3, cost: 3 },
      { kind: 'gulper', weight: 2, cost: 3 },
      { kind: 'isopod', weight: 3, cost: 2 },
      { kind: 'hatchetfish', weight: 3, cost: 1 },
      { kind: 'anglerling', weight: 2, cost: 3 },
      { kind: 'ghostshrimp', weight: 2, cost: 2 },
      { kind: 'lanternfish', weight: 2, cost: 2 },
    ],
    bosses: ['hollowmaw'],
    feature: 'currents',
    glowRadius: 1.5,
  },
  {
    depth: 7,
    name: 'The Tank',
    subtitle: 'Fluorescent light. Plastic plants. A giant shadow outside the glass.',
    menace: 0.5,
    waterTop: 0x9ad8f0,
    waterBottom: 0x3a8ab8,
    rock: 0xc8d8e8,
    rockDark: 0x6a8aa8,
    sand: 0x3a7aff,
    accent: 0xff5cae,
    decoColors: [0xff3d3d, 0x3dff7a, 0xffe14d, 0xff5cf0, 0x3dc8ff],
    plantColor: 0x3dd85c,
    lightTop: 1.05,
    lightBottom: 0.95,
    godRays: 0,
    fishCount: 0,
    snowCount: 40,
    surface: true,
    grade: { tint: [0.98, 1.02, 1.06], lift: [0.03, 0.04, 0.06], saturation: 1.1, contrast: 1.0 },
    enemies: [
      { kind: 'toydiver', weight: 3, cost: 2 },
      { kind: 'snail', weight: 3, cost: 1 },
    ],
    bosses: ['hand'],
    feature: 'tank',
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
  ringmaster: { name: 'Ringmaster Octo', issue: 'ISSUE #7', tagline: 'The show must go on... and on' },
  jesters: { name: 'The Jester Jellies', issue: 'ISSUE #8', tagline: 'Three heads, zero jokes' },
  motherangler: { name: 'Mother Angler', issue: 'ISSUE #9', tagline: 'Follow the pretty light' },
  siphonophore: { name: 'The Siphonophore', issue: 'ISSUE #10', tagline: 'A colony with one appetite' },
  hollowmaw: { name: 'The Hollow Maw', issue: 'ISSUE #11', tagline: 'It swallowed the Great Current' },
  hand: { name: 'The Hand', issue: 'FINAL ISSUE', tagline: 'Oh. Oh no. It\'s an aquarium.' },
};
