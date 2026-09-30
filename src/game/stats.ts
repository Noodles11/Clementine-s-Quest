import { BASE_STATS, ITEM_BY_ID, type ShotFlag, type StatBlock } from './items';
import { activeSynergies, activeTransformations, type SynergyId, type TransformationId } from './synergies';

export interface TempMods {
  add: Partial<StatBlock>;
}

export interface DerivedStats extends StatBlock {
  flags: Set<ShotFlag>;
  synergies: Set<SynergyId>;
  transformations: Set<TransformationId>;
  bubbleScale: number;
  noSink: boolean;
  /** Seconds between shots. */
  fireDelay: number;
  /** Projectile speed in px/s. */
  shotPx: number;
  /** Range in px. */
  rangePx: number;
  /** Movement speed in px/s. */
  movePx: number;
}

const KEYS: (keyof StatBlock)[] = ['damage', 'fireRate', 'shotSpeed', 'range', 'speed', 'luck'];

/** Pure: derive final stats from collected items plus temporary modifiers. */
export function computeStats(items: readonly string[], temp: Partial<StatBlock> = {}): DerivedStats {
  const s: StatBlock = { ...BASE_STATS };
  const mul: StatBlock = { damage: 1, fireRate: 1, shotSpeed: 1, range: 1, speed: 1, luck: 1 };
  const flags = new Set<ShotFlag>();
  let bubbleScale = 1;
  let noSink = false;

  for (const id of items) {
    const def = ITEM_BY_ID[id];
    if (!def) continue;
    if (def.add) for (const k of KEYS) s[k] += def.add[k] ?? 0;
    if (def.mul) for (const k of KEYS) mul[k] *= def.mul[k] ?? 1;
    if (def.flags) for (const f of def.flags) flags.add(f);
    if (def.bubbleScale) bubbleScale *= def.bubbleScale;
    if (def.noSink) noSink = true;
  }
  for (const k of KEYS) s[k] += temp[k] ?? 0;

  const synergies = activeSynergies(items);
  const transformations = activeTransformations(items);
  if (transformations.has('kraken')) s.damage += 1;
  if (transformations.has('neonrave')) mul.damage *= 1.2;

  for (const k of KEYS) s[k] *= mul[k];

  s.damage = Math.max(0.5, s.damage);
  s.fireRate = Math.max(0.6, Math.min(12, s.fireRate));
  s.shotSpeed = Math.max(0.5, Math.min(2.2, s.shotSpeed));
  s.range = Math.max(2.5, s.range);
  s.speed = Math.max(0.45, Math.min(2, s.speed));

  return {
    ...s,
    flags,
    synergies,
    transformations,
    bubbleScale,
    noSink,
    fireDelay: 1 / s.fireRate,
    shotPx: 430 * s.shotSpeed,
    rangePx: s.range * 48 * 1.15,
    movePx: 230 * s.speed,
  };
}
