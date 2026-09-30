import { describe, expect, it } from 'vitest';
import { Rng, stream } from '../src/core/rng';
import { normalizeSeedCode, seedToNumber, SEED_ALPHABET } from '../src/gen/seed';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(1234), b = new Rng(1234);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('streams are independent of consumption order', () => {
    const s = seedToNumber('KELP7Q2Z');
    const x = stream(s, 'room', 1, 3).next();
    stream(s, 'room', 1, 2).next();
    expect(stream(s, 'room', 1, 3).next()).toBe(x);
  });
  it('ranges stay in bounds', () => {
    const r = new Rng(9);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
});

describe('seed codes', () => {
  it('normalizes input', () => {
    expect(normalizeSeedCode('kelp 7q2z')).toBe('KELP7Q2Z');
    expect(normalizeSeedCode('short')).toBeNull();
    expect(normalizeSeedCode('KELP7Q2O')).toBeNull();
  });
  it('alphabet has no ambiguous glyphs', () => {
    for (const ch of 'IO01') expect(SEED_ALPHABET.includes(ch)).toBe(false);
  });
});
