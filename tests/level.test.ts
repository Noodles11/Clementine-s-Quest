import { describe, expect, it } from 'vitest';
import { TILE } from '../src/config';
import { generateGrotto, generateLevel, type LevelSpec } from '../src/gen/level';
import { isSolidTile, T_BREAK, T_EMPTY, T_SECRET, T_SPIKE } from '../src/gen/tiles';

const UNLOCKS = ['beat_barnacle', 'beat_queenclam', 'beat_kelpie'];

/** Flood fill from the start. `bombs` lets the fill pass secret plugs. */
function reach(spec: LevelSpec, bombs: boolean) {
  const { tw, th, tiles } = spec;
  const seen = new Uint8Array(tw * th);
  const pass = (t: number) => t === T_EMPTY || t === T_SPIKE || t === T_BREAK || (bombs && t === T_SECRET);
  const s = Math.floor(spec.start.y / TILE) * tw + Math.floor(spec.start.x / TILE);
  const st = [s];
  seen[s] = 1;
  while (st.length) {
    const i = st.pop()!;
    const x = i % tw;
    for (const j of [i - 1, i + 1, i - tw, i + tw]) {
      if (j < 0 || j >= tiles.length || seen[j] || !pass(tiles[j])) continue;
      if (Math.abs((j % tw) - x) > 1) continue;
      seen[j] = 1;
      st.push(j);
    }
  }
  return (x: number, y: number) => !!seen[Math.floor(y / TILE) * tw + Math.floor(x / TILE)];
}

const SEEDS = [1, 2, 3, 42, 1337, 0xdeadbeef, 777777, 31337, 99, 123456];

describe('level generation', () => {
  it('builds a big, connected reef with a reachable boss at the bottom', () => {
    for (const seed of SEEDS)
      for (const depth of [1, 2, 3]) {
        const spec = generateLevel({ seed, depth, unlocked: UNLOCKS, poolRemoved: [] });
        expect(spec.tw * spec.th).toBeGreaterThan(8000);
        expect(isSolidTile(spec.tiles[Math.floor(spec.start.y / TILE) * spec.tw + Math.floor(spec.start.x / TILE)])).toBe(false);
        const r = reach(spec, false);
        const a = spec.boss.arena;
        const c = spec.boss.crack;
        expect(r((c.x0 + c.x1) / 2, c.y - TILE)).toBe(true);
        // The boss waits in the lower part of the level.
        expect(a.y1).toBeGreaterThan(spec.th * TILE * 0.6);
        expect(spec.boss.gates.length).toBeGreaterThan(0);
        // Every cave and encounter is reachable (secret caves need a bomb).
        const rb = reach(spec, true);
        for (const ch of spec.chambers) expect(rb(ch.cx * TILE, ch.cy * TILE), `chamber ${ch.id} ${ch.kind}/${ch.cave}`).toBe(true);
        for (const pd of spec.pedestals) expect(rb(pd.x, pd.y), 'pedestal').toBe(true);
        expect(spec.chambers.some((ch) => ch.cave === 'shop')).toBe(true);
        expect(spec.pedestals.some((p) => p.itemId && p.price === undefined)).toBe(true);
        // Spawns sit in open water.
        for (const g of spec.groups)
          for (const s of g.spawns) expect(isSolidTile(spec.tiles[Math.floor(s.y / TILE) * spec.tw + Math.floor(s.x / TILE)])).toBe(false);
      }
  });

  it('is plentifully planted, with growth in front of the action', () => {
    const spec = generateLevel({ seed: 5, depth: 1, unlocked: [], poolRemoved: [] });
    expect(spec.decor.length).toBeGreaterThan(600);
    expect(spec.decor.filter((d) => d.front).length).toBeGreaterThan(100);
  });

  it('is deterministic per seed', () => {
    const a = generateLevel({ seed: 77, depth: 2, unlocked: UNLOCKS, poolRemoved: [] });
    const b = generateLevel({ seed: 77, depth: 2, unlocked: UNLOCKS, poolRemoved: [] });
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
    expect(a.pedestals).toEqual(b.pedestals);
    expect(a.groups).toEqual(b.groups);
    const c = generateLevel({ seed: 78, depth: 2, unlocked: UNLOCKS, poolRemoved: [] });
    expect(Array.from(a.tiles)).not.toEqual(Array.from(c.tiles));
  });

  it('builds a grotto with two deals', () => {
    const g = generateGrotto(9, 1, ['a', 'b']);
    expect(g.pedestals.length).toBe(2);
    const r = reach(g, false);
    for (const p of g.pedestals) expect(r(p.x, p.y)).toBe(true);
  });
});
