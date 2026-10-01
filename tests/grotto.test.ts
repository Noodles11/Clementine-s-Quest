import { describe, expect, it } from 'vitest';
import { Run } from '../src/game/run';
import { GROTTO_ID, RoomWorld } from '../src/game/room';
import { NullFx } from '../src/game/fx';
import { DEFAULT_OPTIONS } from '../src/core/save';

describe("Mermaid's Grotto", () => {
  it('has a working way back out', () => {
    const run = Run.create('GROTTOTS', true, [], 1);
    const w = new RoomWorld(run, run.grottoSpec(), GROTTO_ID, NullFx, DEFAULT_OPTIONS);
    const exit = w.props.find((p) => p.kind === 'grottoExit')!;
    expect(exit.active).toBe(true);
    expect(w.solidAt(exit.x, exit.y)).toBe(false);
    // Swim into the portal after arriving.
    for (let i = 0; i < 90; i++) w.step(1 / 60);
    w.player.x = exit.x;
    w.player.y = exit.y;
    w.step(1 / 60);
    expect(w.events.some((e) => e.type === 'grottoExit')).toBe(true);
  });
});
