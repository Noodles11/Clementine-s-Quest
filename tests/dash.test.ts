import { describe, expect, it } from 'vitest';
import { Run } from '../src/game/run';
import { LEVEL_ID, RoomWorld } from '../src/game/room';
import { NullFx } from '../src/game/fx';
import { DEFAULT_OPTIONS } from '../src/core/save';
import { input } from '../src/core/input';

function world() {
  const run = Run.create('DASHER', true, [], 1);
  const w = new RoomWorld(run, run.level, LEVEL_ID, NullFx, DEFAULT_OPTIONS);
  w.enemies.length = 0;
  return w;
}

describe('ink dash', () => {
  it('bursts along the swim direction, leaves an ink cloud and grants brief invulnerability', () => {
    const w = world();
    const p = w.player;
    input.setTouchMove(1, 0);
    for (let i = 0; i < 30; i++) w.step(1 / 60);
    const cruise = Math.hypot(p.vx, p.vy);
    const x0 = p.x;
    input.press('ShiftLeft');
    w.step(1 / 60);
    input.endFrame();
    expect(p.vx).toBeGreaterThan(cruise * 2);
    expect(Math.abs(p.vy)).toBeLessThan(Math.abs(p.vx) * 0.2);
    expect(w.zones.some((z) => z.kind === 'cloud' && z.x < x0 + 10)).toBe(true);
    const hp = w.run.p.hp;
    w.hurtPlayer(20, 'test');
    expect(w.run.p.hp).toBe(hp);
    // Cooldown: an immediate second dash does nothing.
    input.press('ShiftLeft');
    const cd = p.dashCd;
    w.step(1 / 60);
    input.endFrame();
    expect(p.dashCd).toBeLessThan(cd);
    input.setTouchMove(0, 0);
    // The cloud dissolves.
    for (let i = 0; i < 150; i++) w.step(1 / 60);
    expect(w.zones.some((z) => z.kind === 'cloud')).toBe(false);
  });

  it('goes where her head points when hovering (upright = up)', () => {
    const w = world();
    const p = w.player;
    p.vx = p.vy = 0;
    for (let i = 0; i < 60; i++) w.step(1 / 60);
    input.press('ShiftLeft');
    w.step(1 / 60);
    input.endFrame();
    expect(p.vy).toBeLessThan(-300);
    expect(Math.abs(p.vx)).toBeLessThan(60);
  });
});
