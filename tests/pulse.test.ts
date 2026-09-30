import { describe, expect, it } from 'vitest';
import { Run } from '../src/game/run';
import { RoomWorld } from '../src/game/room';
import { NullFx } from '../src/game/fx';
import { DEFAULT_OPTIONS } from '../src/core/save';
import { input } from '../src/core/input';

describe('jellyfish propulsion', () => {
  it('moves in pulses: speed surges then glides, averaging the speed stat', () => {
    const run = Run.create('PULSETST', true, [], 1);
    const w = new RoomWorld(run, run.floor.rooms[run.floor.startId], NullFx, DEFAULT_OPTIONS, { side: null, from: -1 });
    w.player.x = 300;
    w.player.y = 300;
    input.setTouchMove(1, 0);
    const speeds: number[] = [];
    for (let i = 0; i < 180; i++) {
      w.step(1 / 60);
      speeds.push(w.player.vx);
    }
    input.setTouchMove(0, 0);
    const tail = speeds.slice(60);
    const avg = tail.reduce((a, b) => a + b, 0) / tail.length;
    const max = Math.max(...tail), min = Math.min(...tail);
    console.log({ avg: Math.round(avg), min: Math.round(min), max: Math.round(max) });
    expect(avg).toBeGreaterThan(w.player.stats.movePx * 0.75);
    expect(avg).toBeLessThan(w.player.stats.movePx * 1.25);
    expect(max - min).toBeGreaterThan(w.player.stats.movePx * 0.4); // clearly pulsating, not a jet
  });
});
