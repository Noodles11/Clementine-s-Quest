import { describe, expect, it } from 'vitest';
import { Run } from '../src/game/run';
import { RoomWorld } from '../src/game/room';
import { NullFx } from '../src/game/fx';
import { DEFAULT_OPTIONS } from '../src/core/save';
import { input } from '../src/core/input';

describe('doorway currents', () => {
  it('keep Clementine inside until the room is cleared', () => {
    const run = Run.create('DOORTEST', true, [], 1);
    let tested = 0;
    for (const room of run.floor.rooms) {
      if (room.type !== 'normal') continue;
      const w = new RoomWorld(run, room, NullFx, DEFAULT_OPTIONS, { side: null, from: -1 });
      if (!w.enemies.length) continue;
      const d = w.doors.find((dd) => !dd.hidden && !dd.locked);
      if (!d) continue;
      const [nx, ny] = RoomWorld.inward(d.spec.side);
      w.player.x = d.mouth.ix;
      w.player.y = d.mouth.iy;
      for (const e of w.enemies) e.x = e.y = -9999; // keep enemies away
      run.p.hp = 99;
      input.setTouchMove(-nx, -ny);
      for (let i = 0; i < 240; i++) w.step(1 / 60);
      expect(w.events.some((e) => e.type === 'exit')).toBe(false);
      // Clear the room: the current stops and the way out opens.
      for (const e of w.enemies) e.die(w);
      for (let i = 0; i < 240 && !w.events.some((e) => e.type === 'exit'); i++) w.step(1 / 60);
      expect(w.events.some((e) => e.type === 'exit')).toBe(true);
      input.setTouchMove(0, 0);
      tested++;
      if (tested >= 3) break;
    }
    expect(tested).toBeGreaterThan(0);
  });
});
