import { describe, expect, it } from 'vitest';
import { Run } from '../src/game/run';
import { LEVEL_ID, RoomWorld } from '../src/game/room';
import { NullFx } from '../src/game/fx';
import { DEFAULT_OPTIONS } from '../src/core/save';
import { input } from '../src/core/input';
import { TILE } from '../src/config';

describe('boss arena', () => {
  it('wakes the boss on entry and seals the tunnels with a current until it is beaten', () => {
    const run = Run.create('ARENATST', true, [], 1);
    run.p.hp = run.p.maxHp = 9999;
    const w = new RoomWorld(run, run.level, LEVEL_ID, NullFx, DEFAULT_OPTIONS);
    const a = w.arena;
    const c = w.spec.boss.crack;
    w.player.x = (c.x0 + c.x1) / 2 + TILE * 4;
    w.player.y = c.y - TILE * 2;
    w.fluid.follow(w.player.x, w.player.y, true);
    w.step(1 / 60);
    expect(w.bossPending).toBe(true);
    w.spawnBoss();
    // Try to swim out through a gate: the current pushes back.
    const g = w.gates[0];
    w.player.x = g.x + g.nx * TILE;
    w.player.y = g.y + g.ny * TILE;
    input.setTouchMove(-g.nx, -g.ny);
    for (let i = 0; i < 240; i++) {
      w.step(1 / 60);
      w.boss!.intro = 1; // keep the boss harmless
    }
    const along = (w.player.x - g.x) * g.nx + (w.player.y - g.y) * g.ny;
    expect(along).toBeGreaterThan(-TILE * 3.5);
    // Beat it: the gates open and the Crack wakes.
    w.boss!.hp = 0;
    w.boss!.intro = 0;
    w.onBossKilled(w.boss!);
    w.boss!.dead = true;
    expect(w.bossFight).toBe(false);
    expect(w.props.find((p) => p.kind === 'crack')?.active).toBe(true); // the rift always opens
    expect(w.props.some((p) => (p.kind as string) === 'surface')).toBe(false);
    input.setTouchMove(0, 0);
    void a;
  });
});

describe('debug dive', () => {
  it('starts stocked: 999 HP, 99 bombs/coins, a snack, all depths', () => {
    const run = Run.create('ABCDEFGH', true, [], 1);
    run.makeDebug();
    expect(run.p.hp).toBe(999);
    expect(run.p.maxHp).toBe(999);
    expect(run.p.bombs).toBe(99);
    expect(run.p.coins).toBe(99);
    expect(run.p.snack).toBeTruthy();
    expect(run.data.maxDepth).toBe(3);
    const w = new RoomWorld(run, run.level, LEVEL_ID, NullFx, DEFAULT_OPTIONS);
    w.debugGive('lure');
    expect(run.p.items).toContain('lure');
    w.eatSnack();
    expect(run.p.snack).toBeTruthy(); // never runs out
  });
});

describe('debug item picker', () => {
  it('sets the exact item set, adding and removing', () => {
    const run = Run.create('ABCDEFGH', true, [], 1);
    run.makeDebug();
    const w = new RoomWorld(run, run.level, LEVEL_ID, NullFx, DEFAULT_OPTIONS);
    w.debugSetItems(['lure', 'swordfish', 'conch']);
    expect(run.p.items.sort()).toEqual(['lure', 'swordfish']);
    expect(run.p.active?.id).toBe('conch');
    w.debugSetItems(['swordfish']);
    expect(run.p.items).toEqual(['swordfish']);
    expect(run.p.active).toBeNull();
    expect(run.stats.flags.has('homing')).toBe(false);
  });
});
