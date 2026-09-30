import { describe, expect, it } from 'vitest';
import { computeStats } from '../src/game/stats';
import { BASE_STATS, ITEMS } from '../src/game/items';
import { SYNERGIES, activeSynergies, activeTransformations } from '../src/game/synergies';

describe('stats', () => {
  it('base stats with no items', () => {
    const s = computeStats([]);
    expect(s.damage).toBe(BASE_STATS.damage);
    expect(s.flags.size).toBe(0);
  });
  it('applies additive then multiplicative', () => {
    const s = computeStats(['coralcrown', 'pout']);
    expect(s.damage).toBeCloseTo((3.5 + 0.3) * 1.5);
  });
  it('clamps extremes', () => {
    const s = computeStats(Array(20).fill('espresso'));
    expect(s.speed).toBeLessThanOrEqual(2);
    expect(s.fireRate).toBeLessThanOrEqual(12);
  });
  it('every synergy references real items', () => {
    const ids = new Set(ITEMS.map((i) => i.id));
    for (const syn of SYNERGIES) for (const n of syn.needs) expect(ids.has(n)).toBe(true);
  });
  it('detects synergies and transformations', () => {
    expect(activeSynergies(['eeltail', 'mirrorscale']).has('pinball')).toBe(true);
    expect(activeTransformations(['tripletentacle', 'helix', 'starfish']).has('kraken')).toBe(true);
    expect(activeTransformations(['tripletentacle', 'tripletentacle', 'tripletentacle']).size).toBe(0);
  });
});
