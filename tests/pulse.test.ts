import { describe, expect, it } from 'vitest';
import { Run } from '../src/game/run';
import { RoomWorld, TITLE_ID } from '../src/game/room';
import { generateTitleLevel } from '../src/gen/level';
import { NullFx } from '../src/game/fx';
import { DEFAULT_OPTIONS } from '../src/core/save';
import { input } from '../src/core/input';

describe('octopus swimming', () => {
  it('darts off with one jet, then cruises smoothly', () => {
    const run = Run.create('PULSETST', true, [], 1);
    const w = new RoomWorld(run, generateTitleLevel(3), TITLE_ID, NullFx, DEFAULT_OPTIONS);
    w.player.x = 200;
    w.player.y = 300;
    for (let i = 0; i < 60; i++) w.step(1 / 60); // rest first
    input.setTouchMove(1, 0);
    const speeds: number[] = [];
    let jets = 0;
    for (let i = 0; i < 150; i++) {
      const before = w.player.pulseClock;
      w.step(1 / 60);
      if (w.player.pulseClock < before) jets++;
      speeds.push(w.player.vx);
    }
    input.setTouchMove(0, 0);
    const movePx = w.player.stats.movePx;
    const launch = Math.max(...speeds.slice(0, 30));
    const cruise = speeds.slice(60);
    console.log({ launch: Math.round(launch), min: Math.round(Math.min(...cruise)), max: Math.round(Math.max(...cruise)) });
    expect(jets).toBe(1); // only the start is a push
    expect(launch).toBeGreaterThan(movePx * 1.3); // the jet darts her forward
    expect(Math.min(...cruise)).toBeGreaterThan(movePx * 0.97); // then steady
    expect(Math.max(...cruise)).toBeLessThan(movePx * 1.03);
  });
});
