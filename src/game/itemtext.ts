// Plain-language, numeric descriptions of what an item actually does in play.

import { ITEM_BY_ID, type ActiveId, type ItemDef, type ShotFlag, type StatBlock } from './items';
import { FOAM_PER_HALF, HP_PER_CONTAINER } from './run';
import { TRANSFORMATIONS } from './synergies';

const STAT_NAME: Record<keyof StatBlock, string> = {
  damage: 'damage',
  fireRate: 'fire rate',
  shotSpeed: 'shot speed',
  range: 'range',
  speed: 'speed',
  luck: 'luck',
};

const FLAG_TEXT: Record<ShotFlag, string> = {
  homing: 'Ink homes in on foes',
  piercing: 'Ink pierces through foes',
  spectral: 'Ink passes through rock',
  split: 'Ink splits in 2 on hit (50% damage each)',
  bounce: 'Ink bounces off walls (up to 6 times)',
  chain: 'Hits arc lightning to 2 nearby foes (50% damage)',
  spiral: 'Ink spirals outwards',
  freeze: '20% chance to freeze foes for 1.6s',
  burn: '30% chance to set foes on fire',
  boomerang: 'Ink flies back to you',
  charge: 'Hold fire to charge a big pearl shot',
  laser: 'Hold fire to charge a piercing light beam',
  triple: 'Fires 3 shots in a spread',
  grow: 'Ink grows bigger and stronger with distance',
  explosive: 'Ink explodes on impact and chips rock',
  wave: 'Fires 2 wavy shots',
  plankton: 'Extra tiny shots at 30% damage',
  charm: '15% chance to charm foes for 4s',
  poison: 'Poisons foes for 4s',
  slow: 'Hit foes move at half speed for 2s',
  crit: '10% chance for ×3 critical hits (more with luck)',
  rear: 'Also fires backwards at 70% damage',
  shotgun: 'Fires 5 pellets (55% damage, shorter range)',
  leech: 'Every kill heals 3 HP',
  knockback: 'Hits knock foes far back',
  volatile: 'Killed foes burst into 6 fiery shards',
  magnet: 'Pickups drift towards you',
  compass: 'Shops, treasure and boss rooms show on the map',
  lantern: 'Your glow lights a wider area',
};

const ACTIVE_TEXT: Record<ActiveId, string> = {
  conch: 'Stuns all foes for 2.5s and blasts them away',
  bubbleshield: 'Invulnerable for 3.5s',
  treasuremap: 'Reveals the whole map of this depth',
  mimicclam: 'Rerolls the items on nearby pedestals',
  glowburst: 'Triple fire rate for 5s',
  tidalwave: 'A wave hits and sweeps away every foe in front of you',
  seadice: 'Rerolls nearby pickups',
  krakensummon: 'Tentacles slam up to 6 nearby foes for 45 damage',
  inkcloud: 'Foes lose track of you for 4s',
  whalesong: 'Heals 35 HP',
  anchor: 'Digs a shaft straight down, crushing foes in the way',
};

const num = (n: number) => String(Math.round(n * 100) / 100);

/** One short line per real effect of the item. */
export function itemEffects(def: ItemDef): string[] {
  const out: string[] = [];
  if (def.kind === 'active') {
    const a = ACTIVE_TEXT[def.id as ActiveId];
    if (a) out.push(a);
    if (def.charge) out.push(`Recharges after ${def.charge} encounter${def.charge > 1 ? 's' : ''}`);
    return out;
  }
  if (def.hearts) out.push(`+${def.hearts * HP_PER_CONTAINER} max HP`);
  if (def.foam) out.push(`+${def.foam * FOAM_PER_HALF} foam HP`);
  for (const k of Object.keys(STAT_NAME) as (keyof StatBlock)[]) {
    const a = def.add?.[k];
    if (a) out.push(`${a > 0 ? '+' : '−'}${num(Math.abs(a))} ${STAT_NAME[k]}`);
    const m = def.mul?.[k];
    if (m && m !== 1) out.push(`×${num(m)} ${STAT_NAME[k]}`);
  }
  for (const f of def.flags ?? []) out.push(FLAG_TEXT[f]);
  if (def.bubbleScale && def.bubbleScale !== 1) out.push('Bigger ink');
  if (def.noSink) out.push('No more sinking when idle');
  if (def.coins) out.push(`+${def.coins} coins`);
  for (const t of def.tags ?? []) {
    const tr = TRANSFORMATIONS.find((x) => x.tag === t);
    if (tr) out.push(`Counts toward ${tr.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())} (3 needed)`);
  }
  return out;
}

export function itemEffectText(id: string): string {
  const def = ITEM_BY_ID[id];
  return def ? itemEffects(def).join(' · ') : '';
}
