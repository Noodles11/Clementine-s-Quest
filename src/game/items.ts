// Item definitions. Items are data: stat modifiers + composable shot flags.
// Synergies (see synergies.ts) emerge mostly from combining shot flags.

export type PoolKind = 'treasure' | 'shop' | 'boss' | 'secret' | 'grotto' | 'curse';

export type ShotFlag =
  | 'homing'
  | 'piercing'
  | 'spectral'
  | 'split'
  | 'bounce'
  | 'chain'
  | 'spiral'
  | 'freeze'
  | 'burn'
  | 'boomerang'
  | 'charge'
  | 'laser'
  | 'triple'
  | 'grow'
  | 'explosive'
  | 'wave'
  | 'plankton'
  | 'charm';

export type ItemTag = 'tentacle' | 'glow';

export interface StatBlock {
  damage: number;
  fireRate: number; // shots per second
  shotSpeed: number;
  range: number; // tiles
  speed: number;
  luck: number;
}

export type ActiveId = 'conch' | 'bubbleshield' | 'treasuremap' | 'mimicclam' | 'glowburst';

export interface ItemDef {
  id: string;
  name: string;
  tagline: string;
  lore: string;
  kind: 'passive' | 'active';
  quality: number;
  pools: PoolKind[];
  tags?: ItemTag[];
  add?: Partial<StatBlock>;
  mul?: Partial<StatBlock>;
  flags?: ShotFlag[];
  /** Extra heart containers. */
  hearts?: number;
  /** Foam (bonus HP), in half-heart units (×FOAM_PER_HALF HP). */
  foam?: number;
  /** Active item charge in rooms. */
  charge?: number;
  /** Achievement id that must be unlocked before the item enters pools. */
  unlock?: string;
  /** Visual costume key drawn on Clementine. */
  costume?: string;
  color: number;
  /** Bigger ink blobs (visual + hitbox). */
  bubbleScale?: number;
  noSink?: boolean;
}

export const ITEMS: ItemDef[] = [
  // ── Stat passives ──────────────────────────────────────────────
  {
    id: 'coralcrown', name: 'Coral Crown', tagline: 'Royalty of the reef',
    lore: "A reef princess's lost tiara. It still hums with her lullabies.",
    kind: 'passive', quality: 3, pools: ['treasure', 'boss'], hearts: 1, add: { damage: 0.3 },
    costume: 'crown', color: 0xff6fa8,
  },
  {
    id: 'espresso', name: 'Squid Ink Espresso', tagline: 'Zoom zoom blub',
    lore: "The Galleon's cook swore by it. Nobody has slept since.",
    kind: 'passive', quality: 2, pools: ['treasure', 'shop', 'boss'], tags: ['tentacle'],
    add: { speed: 0.3, fireRate: 0.35 }, costume: 'jitter', color: 0x3a2a4a,
  },
  {
    id: 'whalelung', name: 'Whale Lung', tagline: 'Deep breath!',
    lore: 'Breathe like a whale, float like a bubble. You will never sink again.',
    kind: 'passive', quality: 2, pools: ['treasure', 'boss'], add: { range: 1.5 },
    bubbleScale: 1.35, noSink: true, color: 0x7ab8ff,
  },
  {
    id: 'pout', name: 'Pufferfish Pout', tagline: 'Big mad energy',
    lore: 'Angry and proud of it. Puff up, blow up.',
    kind: 'passive', quality: 3, pools: ['treasure', 'curse'], mul: { damage: 1.5 },
    add: { shotSpeed: -0.2 }, costume: 'spikes', color: 0xffc23d,
  },
  {
    id: 'seaglass', name: 'Lucky Sea Glass', tagline: 'Luck up',
    lore: 'Found only on moonlit tides. Rub it for fortune.',
    kind: 'passive', quality: 1, pools: ['treasure', 'shop'], tags: ['glow'], add: { luck: 2 },
    unlock: 'flawless_floor', color: 0x5cf2c0,
  },
  {
    id: 'barnacle', name: 'Barnacle Armor', tagline: 'Clingy but cozy',
    lore: 'A suit of barnacles that refuse to leave. They block hits for you.',
    kind: 'passive', quality: 2, pools: ['treasure', 'shop', 'boss'], foam: 4, add: { speed: -0.1 },
    costume: 'barnacles', color: 0xb8a58a,
  },
  {
    id: 'plankton', name: 'Plankton Swarm', tagline: 'Tiny friends, tiny ink drops',
    lore: "A cloud of plankton rides your glow and spits little ink drops of their own.",
    kind: 'passive', quality: 2, pools: ['treasure'], flags: ['plankton'], add: { fireRate: 0.3 },
    color: 0x9dff5c,
  },

  // ── Shot modifiers ────────────────────────────────────────────
  {
    id: 'eeltail', name: 'Electric Eel Tail', tagline: 'Shocking ink',
    lore: 'Still twitching. Ink arcs to nearby enemies with a ZAP.',
    kind: 'passive', quality: 3, pools: ['treasure'], tags: ['glow'], flags: ['chain'],
    unlock: 'beat_barnacle', color: 0x6ff0ff,
  },
  {
    id: 'nautilus', name: 'Nautilus Spiral', tagline: 'Round and round',
    lore: 'Its shell remembers the golden ratio. So will your ink.',
    kind: 'passive', quality: 2, pools: ['treasure', 'secret'], tags: ['tentacle'], flags: ['spiral'],
    add: { range: 1 }, color: 0xf2a65a,
  },
  {
    id: 'mirrorscale', name: 'Mirror Scale', tagline: 'Bouncy ink',
    lore: 'A scale so shiny that even ink bounces off walls near it.',
    kind: 'passive', quality: 2, pools: ['treasure', 'shop'], flags: ['bounce'], color: 0xd8e8ff,
  },
  {
    id: 'lure', name: 'Anglerfish Lure', tagline: 'Homing ink',
    lore: 'Everyone follows the light. Especially your ink.',
    kind: 'passive', quality: 3, pools: ['treasure', 'grotto'], tags: ['glow'], flags: ['homing'],
    costume: 'lure', color: 0xfff27a,
  },
  {
    id: 'swordfish', name: 'Swordfish Bill', tagline: 'Piercing ink',
    lore: 'En garde! Ink passes straight through their victims.',
    kind: 'passive', quality: 2, pools: ['treasure', 'boss'], flags: ['piercing'], add: { shotSpeed: 0.2 },
    color: 0x8aa0c8,
  },
  {
    id: 'ghostjelly', name: 'Ghost Jelly', tagline: 'Spectral ink',
    lore: 'A cousin who drifted a little too far. Ink ignores rocks.',
    kind: 'passive', quality: 2, pools: ['treasure', 'secret', 'grotto'], flags: ['spectral'],
    costume: 'ghost', color: 0xc8d8ff,
  },
  {
    id: 'mitosis', name: 'Mitosis', tagline: 'Ink splits',
    lore: 'One becomes two becomes trouble. Ink splits on impact.',
    kind: 'passive', quality: 3, pools: ['treasure', 'secret'], flags: ['split'], unlock: 'first_synergy',
    color: 0xff8ae0,
  },
  {
    id: 'frostkelp', name: 'Frost Kelp', tagline: 'Chilly ink',
    lore: 'Grows near icy vents. Frozen foes shatter into shards.',
    kind: 'passive', quality: 2, pools: ['treasure', 'shop'], flags: ['freeze'], color: 0x9ef0ff,
  },
  {
    id: 'firecoral', name: 'Fire Coral', tagline: 'Burning ink',
    lore: "Don't touch it. Seriously. Ink sets foes ablaze underwater somehow.",
    kind: 'passive', quality: 2, pools: ['treasure', 'curse'], tags: ['glow'], flags: ['burn'], color: 0xff5a3d,
  },
  {
    id: 'boomerang', name: 'Boomerang Shrimp', tagline: 'Ink comes back',
    lore: 'A mantis shrimp taught this ink to always return home.',
    kind: 'passive', quality: 2, pools: ['treasure', 'shop'], flags: ['boomerang'], add: { range: 1 },
    color: 0xff9a5c,
  },
  {
    id: 'pearldiver', name: 'Pearl Diver', tagline: 'Charge shot',
    lore: 'Hold to grow a pearl. Release to make a point.',
    kind: 'passive', quality: 3, pools: ['treasure', 'boss'], flags: ['charge'], unlock: 'beat_queenclam',
    color: 0xfff6e8,
  },
  {
    id: 'sunbeam', name: 'Sunbeam', tagline: 'Charged light beam',
    lore: 'A sliver of the surface sun, bottled. Hold to charge a beam of pure light.',
    kind: 'passive', quality: 4, pools: ['treasure', 'grotto'], tags: ['glow'], flags: ['laser'],
    unlock: 'beat_kelpie', color: 0xfff27a,
  },
  {
    id: 'helix', name: 'Double Helix', tagline: 'Wavy double shot',
    lore: 'Two ink blobs dancing the same dance.',
    kind: 'passive', quality: 2, pools: ['treasure', 'shop'], tags: ['tentacle'], flags: ['wave'],
    unlock: 'transformation', color: 0x5cf2a0,
  },
  {
    id: 'tripletentacle', name: 'Triple Tentacle', tagline: 'Triple shot',
    lore: 'Three arms, three ink blobs, three times the fun (a bit weaker each).',
    kind: 'passive', quality: 3, pools: ['treasure', 'boss'], tags: ['tentacle'], flags: ['triple'],
    mul: { damage: 0.8, fireRate: 0.85 }, color: 0xff6f6f,
  },
  {
    id: 'starfish', name: 'Starfish Arm', tagline: 'Growing ink',
    lore: 'It regrew. And regrew. Ink blobs grow as they travel.',
    kind: 'passive', quality: 2, pools: ['treasure', 'secret'], tags: ['tentacle'], flags: ['grow'],
    unlock: 'beat_sirurchin', color: 0xff8a3d,
  },
  {
    id: 'inksac', name: 'Ink Sac', tagline: 'Explosive ink',
    lore: 'Every ink blob a tiny bomb. Mind your arms.',
    kind: 'passive', quality: 4, pools: ['treasure', 'curse'], tags: ['tentacle'], flags: ['explosive'],
    mul: { fireRate: 0.75 }, unlock: 'beat_admiral', color: 0x3a2a5a,
  },
  {
    id: 'sirensong', name: 'Siren Song', tagline: 'Charming ink',
    lore: 'A melody that makes enemies forget who they were angry at.',
    kind: 'passive', quality: 2, pools: ['treasure', 'grotto'], flags: ['charm'], unlock: 'beat_treasuremimic',
    color: 0xff9ae0,
  },

  // ── Actives ───────────────────────────────────────────────────
  {
    id: 'conch', name: 'Conch Horn', tagline: 'BWAAAAMP!',
    lore: 'Blow it and the whole room freezes in shock.',
    kind: 'active', quality: 2, pools: ['treasure', 'shop'], charge: 3, color: 0xffb4a0,
  },
  {
    id: 'bubbleshield', name: 'Bubble Shield', tagline: 'Safe inside',
    lore: 'Wrap yourself in a big bubble. Nothing gets in for a while.',
    kind: 'active', quality: 2, pools: ['treasure', 'shop', 'boss'], charge: 2, color: 0xa0e8ff,
  },
  {
    id: 'treasuremap', name: 'Treasure Map', tagline: 'X marks everything',
    lore: 'Soggy but accurate. Reveals the whole depth, secrets included.',
    kind: 'active', quality: 1, pools: ['shop', 'secret'], charge: 6, color: 0xf2d49a,
  },
  {
    id: 'mimicclam', name: 'Mimic Clam', tagline: 'Reroll destiny',
    lore: 'It swallows items and spits out different ones. Rude, but useful.',
    kind: 'active', quality: 4, pools: ['treasure', 'secret'], charge: 6, color: 0xb88adf,
  },
  {
    id: 'glowburst', name: 'Glow Burst', tagline: 'Overcharge!',
    lore: 'Glow so hard it hurts. Triple fire rate for a few seconds.',
    kind: 'active', quality: 3, pools: ['treasure', 'shop'], tags: ['glow'], charge: 2, unlock: 'die_5', color: 0xfff27a,
  },
];

export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export const BASE_STATS: StatBlock = {
  damage: 3.5,
  fireRate: 2.7,
  shotSpeed: 1,
  range: 6.5,
  speed: 1,
  luck: 0,
};

/** Heart container item (boss drop). Not in pools; spawned directly. */
export const HEART_CONTAINER_ID = '__heart_container';
