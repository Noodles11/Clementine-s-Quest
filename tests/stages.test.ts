import { describe, expect, it } from 'vitest';
import { Run } from '../src/game/run';
import { BIOMES, bossForStage, stagesAt } from '../src/gen/biomes';
import { generateLevel } from '../src/gen/level';
import { maxDepthFor } from '../src/game/achievements';
import { newProfile } from '../src/core/save';

describe('three reefs per depth', () => {
  it('every biome down to the Abyss has at least three bosses', () => {
    for (const b of BIOMES.slice(0, 6)) expect(new Set(b.bosses).size, b.name).toBeGreaterThanOrEqual(3);
  });

  it('each reef of a depth has its own boss; the Hollow Maw is always last', () => {
    for (const seed of [1, 2, 3, 42, 99, 1337, 777, 31337]) {
      for (let depth = 1; depth <= 6; depth++) {
        const bosses = [1, 2, 3].map((s) => bossForStage(seed, depth, s));
        expect(new Set(bosses).size).toBe(3);
        if (depth === 6) expect(bosses[2]).toBe('hollowmaw');
      }
    }
  });

  it('each reef is a different level with that boss', () => {
    const a = generateLevel({ seed: 5, depth: 2, stage: 1, unlocked: [], poolRemoved: [] });
    const b = generateLevel({ seed: 5, depth: 2, stage: 2, unlocked: [], poolRemoved: [] });
    expect(a.stage).toBe(1);
    expect(b.stage).toBe(2);
    expect(a.boss.kind).not.toBe(b.boss.kind);
    expect(a.boss.kind).toBe(bossForStage(5, 2, 1));
    expect(a.tw === b.tw && a.tiles.every((v, i) => v === b.tiles[i])).toBe(false);
  });

  it('a run goes 1-1, 1-2, 1-3, 2-1 … 6-3, then The Tank when its pipe is open', () => {
    const run = Run.create('STAGESAA', true, [], 7);
    const seen: string[] = [];
    while (run.data.depth < 7) {
      seen.push(`${run.data.depth}-${run.stage}`);
      run.nextFloor();
    }
    expect(seen.length).toBe(18);
    expect(seen[0]).toBe('1-1');
    expect(seen[3]).toBe('2-1');
    expect(seen[17]).toBe('6-3');
    expect(stagesAt(7)).toBe(1);
    expect(run.level.boss.kind).toBe('hand');
  });

  it('the dive reaches the Abyss from the start; The Tank needs the pipe', () => {
    const p = newProfile();
    expect(maxDepthFor(p)).toBe(6);
    p.achievements.push('tank');
    expect(maxDepthFor(p)).toBe(7);
    const run = Run.create('STAGESBB', true, [], 6);
    expect(run.atBottom).toBe(false);
    while (!(run.data.depth === 6 && run.stage === 3)) run.nextFloor();
    expect(run.atBottom).toBe(true);
    run.data.maxDepth = 7;
    expect(run.atBottom).toBe(false);
  });
});

describe('floor identity', () => {
  it('changes with every reef, so worlds never save into the next reef', () => {
    const run = Run.create('STAGESCC', true, [], 6);
    const keys = new Set<number>();
    for (let i = 0; i < 6; i++) {
      keys.add(run.floorKey);
      run.nextFloor();
    }
    expect(keys.size).toBe(6);
  });
});
