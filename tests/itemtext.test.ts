import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/game/items';
import { itemEffects } from '../src/game/itemtext';

describe('item effect text', () => {
  it('describes every item with at least one concrete effect', () => {
    for (const it of ITEMS) {
      const fx = itemEffects(it);
      expect(fx.length, it.id).toBeGreaterThan(0);
      for (const line of fx) expect(line, it.id).toBeTruthy();
    }
  });
  it('spells out stat numbers', () => {
    const tooth = ITEMS.find((i) => i.id === 'sharktooth')!;
    expect(itemEffects(tooth)).toContain('+0.8 damage');
  });
});
