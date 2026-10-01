import { describe, expect, it } from 'vitest';
import { Run } from '../src/game/run';
import { LEVEL_ID, RoomWorld } from '../src/game/room';
import { NullFx } from '../src/game/fx';
import { DEFAULT_OPTIONS } from '../src/core/save';
import { ITEMS } from '../src/game/items';
import { ENEMY_INFO, createEnemy } from '../src/game/enemies';
import { BIOMES } from '../src/gen/biomes';
import { createBoss } from '../src/game/bosses';
import { generateTank } from '../src/gen/level';
import { isSolidTile } from '../src/gen/tiles';
import { TILE } from '../src/config';

describe('content', () => {
  it('has ~60 items, ~25 creatures, 7 depths and a boss for each', () => {
    expect(ITEMS.length).toBeGreaterThanOrEqual(60);
    expect(Object.keys(ENEMY_INFO).length).toBeGreaterThanOrEqual(25);
    expect(BIOMES.length).toBe(7);
    for (const b of BIOMES) expect(b.bosses.length).toBeGreaterThan(0);
  });

  it('every creature and boss can be built and simulated', () => {
    const run = Run.create('CREATURE', true, [], 7);
    run.p.hp = run.p.maxHp = 9999;
    const w = new RoomWorld(run, run.level, LEVEL_ID, NullFx, DEFAULT_OPTIONS);
    const p = w.player;
    for (const kind of Object.keys(ENEMY_INFO)) {
      const e = createEnemy(kind as any, p.x + 120, p.y, 0.6, 'none');
      w.addEnemy(e);
    }
    for (const b of BIOMES) for (const k of b.bosses) w.addEnemy(createBoss(k, p.x, p.y - 100, b.menace, b.depth));
    for (let i = 0; i < 240; i++) {
      w.step(1 / 60);
      for (const e of w.enemies) expect(Number.isFinite(e.x) && Number.isFinite(e.y), `${e.kind}`).toBe(true);
    }
  });
});

describe('The Tank', () => {
  it('is a glass tank with a lobby and an open arena for The Hand', () => {
    const spec = generateTank(5, [], []);
    expect(spec.boss.kind).toBe('hand');
    expect(isSolidTile(spec.tiles[Math.floor(spec.start.y / TILE) * spec.tw + Math.floor(spec.start.x / TILE)])).toBe(false);
    expect(spec.boss.arena.x0).toBeGreaterThan(spec.start.x);
    expect(spec.intake).toBeTruthy();
  });

  it('beating The Hand triggers the finale', () => {
    const run = Run.create('TANKTANK', true, [], 7);
    run.data.depth = 7;
    run.buildFloor();
    const w = new RoomWorld(run, run.level, LEVEL_ID, NullFx, DEFAULT_OPTIONS);
    w.spawnBoss();
    w.boss!.intro = 0;
    w.boss!.hurt(w, 99999, null);
    expect(w.events.some((e) => e.type === 'finale')).toBe(true);
  });
});

describe('new actives', () => {
  it('work without crashing', () => {
    const run = Run.create('ACTIVES1', true, [], 7);
    run.p.hp = run.p.maxHp = 500;
    const w = new RoomWorld(run, run.level, LEVEL_ID, NullFx, DEFAULT_OPTIONS);
    for (const id of ['tidalwave', 'seadice', 'krakensummon', 'inkcloud', 'whalesong', 'anchor']) {
      run.giveItem(id);
      run.p.active!.charge = 99;
      run.p.hp = 100;
      w.addEnemy(createEnemy('blob', w.player.x + 100, w.player.y, 0, 'none'));
      w.useActive();
      w.step(1 / 60);
    }
    expect(w.player.hidden).toBeGreaterThan(0);
  });
});
