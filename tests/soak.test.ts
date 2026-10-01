import { describe, expect, it } from 'vitest';
import { Run } from '../src/game/run';
import { RoomWorld, GROTTO_ID, LEVEL_ID } from '../src/game/room';
import { NullFx } from '../src/game/fx';
import { DEFAULT_OPTIONS } from '../src/core/save';
import { ITEMS } from '../src/game/items';
import { TILE } from '../src/config';

const ALL_UNLOCKS = ['beat_barnacle', 'beat_queenclam', 'beat_kelpie', 'beat_sirurchin', 'beat_admiral', 'beat_treasuremimic', 'first_synergy', 'transformation', 'die_5'];

function finite(n: number) {
  return Number.isFinite(n);
}

/** Simulate every encounter, the boss and the grotto of every depth with a scripted "player". */
function soak(seed: string, items: string[]) {
  const run = Run.create(seed, true, ALL_UNLOCKS, 3);
  for (const id of items) run.giveItem(id);
  run.p.maxHp = run.p.hp = 300;
  for (let depth = 1; depth <= 3; depth++) {
    const areas: [number, ReturnType<Run['grottoSpec']>][] = [[LEVEL_ID, run.level], [GROTTO_ID, run.grottoSpec()]];
    const spots = [...run.level.groups.map((g) => ({ x: g.x, y: g.y, boss: false })), { x: run.level.boss.crack.x0 + TILE * 3, y: run.level.boss.crack.y - TILE * 2, boss: true }];
    for (const [id, spec] of areas)
    for (const spot of id === LEVEL_ID ? spots : [{ x: spec.start.x, y: spec.start.y, boss: false }]) {
      const w = new RoomWorld(run, spec, id, NullFx, DEFAULT_OPTIONS);
      w.player.x = spot.x;
      w.player.y = spot.y;
      if (w.solidAt(spot.x, spot.y)) {
        w.player.x = spec.start.x;
        w.player.y = spec.start.y;
      }
      w.fluid.follow(w.player.x, w.player.y, true);
      if (spot.boss) w.spawnBoss();
      const p = w.player;
      for (let f = 0; f < 300; f++) {
        // Wander and shoot at the nearest enemy.
        const t = f / 60;
        p.vx = Math.cos(t * 1.3) * 150;
        p.vy = Math.sin(t * 0.9) * 110;
        const target = w.nearestEnemy(p.x, p.y, 2000);
        if (f % 10 === 0) {
          const dx = target ? target.x - p.x : 1, dy = target ? target.y - p.y : 0;
          const ax = Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : 0, ay = ax ? 0 : Math.sign(dy);
          if (p.stats.flags.has('charge')) {
            p.charge = 1;
            p.chargeDir = [ax, ay];
            p.firePearl(w);
          } else if (p.stats.flags.has('laser') && f % 60 === 0) {
            p.chargeDir = [ax, ay];
            p.fireBeam(w);
          } else p.fire(w, ax, ay);
        }
        if (f === 100) w.dropBomb();
        if (f === 200) w.useActive();
        run.p.hp = Math.max(run.p.hp, 150); // never die during the soak
        w.step(1 / 60);
        w.events.length = 0;
        w.exiting = false;
        for (const e of w.enemies) {
          expect(finite(e.x) && finite(e.y), `enemy ${e.kind} position`).toBe(true);
          expect(finite(e.hp), `enemy ${e.kind} hp`).toBe(true);
        }
        for (const b of w.bubbles) expect(finite(b.x) && finite(b.y)).toBe(true);
      }
      // Cheat-clear the room to exercise rewards and doors.
      for (const e of w.enemies) e.die(w);
      w.step(1 / 60);
      w.persist();
      expect(finite(p.x) && finite(p.y)).toBe(true);
    }
    if (depth < 3) run.nextFloor();
  }
  return run;
}

describe('soak', { timeout: 120000 }, () => {
  it('survives every room with no items', () => {
    const run = soak('SOAKAAAA', []);
    expect(run.data.depth).toBe(3);
  });
  it('survives every room with every passive item', () => {
    const passives = ITEMS.filter((i) => i.kind === 'passive').map((i) => i.id);
    soak('SOAKBBBB', passives);
  });
  it('survives charge + laser builds', () => {
    soak('SOAKCCCC', ['pearldiver', 'mitosis', 'sunbeam', 'nautilus', 'inksac', 'lure']);
    soak('SOAKDDDD', ['sunbeam', 'nautilus', 'firecoral', 'frostkelp', 'eeltail', 'mirrorscale', 'conch']);
  });
});
