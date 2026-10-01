import { describe, expect, it } from 'vitest';
import { Run } from '../src/game/run';
import { LEVEL_ID, RoomWorld } from '../src/game/room';
import { createEnemy } from '../src/game/enemies';
import { NullFx } from '../src/game/fx';
import { DEFAULT_OPTIONS } from '../src/core/save';
import { TILE } from '../src/config';

function setup() {
  const run = Run.create('AGGROTST', true, [], 1);
  run.p.hp = run.p.maxHp = 9999;
  const w = new RoomWorld(run, run.level, LEVEL_ID, NullFx, DEFAULT_OPTIONS);
  // Stop encounter groups from waking during the test.
  for (const g of run.level.groups) (w as any).clearedGroups.add(g.id);
  return w;
}

describe('creature aggro', () => {
  it('hunts nearby, gives up when Clementine is far away', () => {
    const w = setup();
    const p = w.player;
    const e = createEnemy('blob', p.x + 200, p.y, 0, 'none');
    w.addEnemy(e);
    expect(w.canChase(e)).toBe(true);
    p.x = e.x + 1400;
    expect(w.canChase(e)).toBe(false);
  });

  it('never follows into the shop, and stays out of it', () => {
    const w = setup();
    const z = w.safeZones[0];
    expect(z).toBeTruthy();
    const p = w.player;
    p.x = z.x;
    p.y = z.y;
    // A blob just outside the safe zone, right next to her.
    const e = createEnemy('blob', z.x + z.rx + 20, z.y, 0, 'none');
    e.spawnGrace = 0;
    w.addEnemy(e);
    expect(w.canChase(e)).toBe(false);
    e.vx = -400; // shove it toward the shop
    for (let i = 0; i < 120; i++) {
      p.x = z.x;
      p.y = z.y;
      p.vx = p.vy = 0;
      w.step(1 / 60);
      expect(w.inSafeZone(e.x, e.y)).toBe(false);
    }
  });

  it('does not follow into the boss arena', () => {
    const w = setup();
    const a = w.arena;
    const p = w.player;
    p.x = (a.x0 + a.x1) / 2;
    p.y = (a.y0 + a.y1) / 2;
    const e = createEnemy('blob', a.x0 - TILE * 4, p.y, 0, 'none');
    w.addEnemy(e);
    expect(w.canChase(e)).toBe(false);
  });
});
