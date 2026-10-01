import { describe, expect, it } from 'vitest';
import { Run, HEAL_HEART, START_HP } from '../src/game/run';
import { LEVEL_ID, RoomWorld } from '../src/game/room';
import { NullFx } from '../src/game/fx';
import { DEFAULT_OPTIONS } from '../src/core/save';
import { TILE } from '../src/config';
import { Bubble } from '../src/game/projectiles';
import { Pickup } from '../src/game/pickups';

/** A rock point with open water just above it, away from the level's shell. */
function floorSpot(w: RoomWorld) {
  for (let y = TILE * 4; y < w.heightPx - TILE * 4; y += 8)
    for (let x = TILE * 4; x < w.widthPx - TILE * 4; x += 24)
      if (w.solidAt(x, y) && w.solidAt(x, y + 40) && !w.solidAt(x, y - 30) && !w.solidAt(x, y - 60)) return { x, y };
  throw new Error('no floor');
}

describe('destructible reef', () => {
  it('ink bombs blow round craters that persist; plain ink does not dig', () => {
    const run = Run.create('DIGDIGDG', true, [], 1);
    const w = new RoomWorld(run, run.level, LEVEL_ID, NullFx, DEFAULT_OPTIONS);
    const f = floorSpot(w);
    // Plain ink shot straight into the floor.
    w.addBubble(new Bubble({ x: f.x, y: f.y - 20, vx: 0, vy: 430, dmg: 3.5, radius: 7, range: 300, flags: new Set(), synergies: new Set(), transformations: new Set(), luck: 0 }));
    for (let i = 0; i < 30; i++) w.step(1 / 60);
    expect(w.holes.length).toBe(0);
    expect(w.solidAt(f.x, f.y + 4)).toBe(true);
    // A bomb on the floor.
    w.explode(f.x, f.y, 95, 60, { fromBomb: true });
    expect(w.holes.length).toBe(1);
    expect(w.solidAt(f.x, f.y + 20)).toBe(false);
    expect(w.solidAt(f.x + 30, f.y + 30)).toBe(false);
    expect(w.solidAt(f.x, f.y + 100)).toBe(true); // round, not bottomless
    w.persist();
    const again = new RoomWorld(run, run.level, LEVEL_ID, NullFx, DEFAULT_OPTIONS);
    expect(again.solidAt(f.x, f.y + 20)).toBe(false);
  });

  it('never breaches the outer shell of the level', () => {
    const run = Run.create('DIGDIGDG', true, [], 1);
    const w = new RoomWorld(run, run.level, LEVEL_ID, NullFx, DEFAULT_OPTIONS);
    w.carve(TILE * 0.5, w.heightPx / 2, 90);
    expect(w.solidAt(TILE * 0.5, w.heightPx / 2)).toBe(true);
  });
});

describe('numeric health', () => {
  it('starts at 100 HP; hearts heal 15; mobs deal sensible damage', () => {
    const run = Run.create('HPHPHPHP', true, [], 1);
    expect(run.p.hp).toBe(START_HP);
    expect(run.p.maxHp).toBe(100);
    const w = new RoomWorld(run, run.level, LEVEL_ID, NullFx, DEFAULT_OPTIONS);
    w.hurtPlayer(30, 'test');
    expect(run.p.hp).toBe(70);
    w.player.invuln = 0;
    const pk = new Pickup('heart', w.player.x, w.player.y);
    pk.delay = 0;
    w.pickups.push(pk);
    w.step(1 / 60);
    expect(run.p.hp).toBe(70 + HEAL_HEART);
  });
});

describe('hidden rewards', () => {
  it('a bomb on the floor above a pocket opens it; a bomb on an X digs up coins', () => {
    const run = Run.create('POCKETSS', true, [], 1);
    const w = new RoomWorld(run, run.level, LEVEL_ID, NullFx, DEFAULT_OPTIONS);
    const q = run.level.pockets![0];
    const wallTop = (Math.round((q.y - q.ry) / TILE) - 1) * TILE; // corridor floor surface
    // Ink bomb resting on the floor (its centre ~13px above the surface).
    w.explode(q.x, wallTop - 13, 95, 60, { fromBomb: true });
    // There is now an open path from the corridor into the pocket.
    let open = true;
    for (let y = wallTop - 10; y < q.y; y += 4) if (w.solidAt(q.x, y)) open = false;
    expect(open).toBe(true);

    const b = w.buried[0];
    const before = w.pickups.length;
    w.explode(b.mx, b.my - 13, 95, 60, { fromBomb: true });
    expect(w.pickups.length).toBeGreaterThan(before);
    expect(w.buried.some((x) => x.i === b.i)).toBe(false);
    w.persist();
    const again = new RoomWorld(run, run.level, LEVEL_ID, NullFx, DEFAULT_OPTIONS);
    expect(again.buried.some((x) => x.i === b.i)).toBe(false);
  });
});
