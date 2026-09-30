import { describe, expect, it } from 'vitest';
import { generateFloor, OPPOSITE } from '../src/gen/floor';
import { buildRoom, isSolidTile, T_SECRET } from '../src/gen/roomgen';
import { seedToNumber } from '../src/gen/seed';
import { TILE } from '../src/config';

const ALL = ['beat_barnacle', 'beat_queenclam', 'beat_kelpie', 'beat_sirurchin', 'beat_admiral', 'beat_treasuremimic', 'first_synergy', 'transformation', 'die_5'];
const seeds = ['KELP7Q2Z', 'AAAAAAAA', 'ZZZZ9999', 'HUGEJELL', 'DARKDEEP', 'PARTYFSH', 'BCDFGHJK', 'MNPQRSTU'];

describe('floor generation', () => {
  it('is deterministic', () => {
    for (const code of seeds) {
      const a = generateFloor({ seed: seedToNumber(code), depth: 2, unlocked: ALL, poolRemoved: [] });
      const b = generateFloor({ seed: seedToNumber(code), depth: 2, unlocked: ALL, poolRemoved: [] });
      expect(JSON.stringify(a.rooms)).toBe(JSON.stringify(b.rooms));
    }
  });

  it('has required rooms and symmetric doors', () => {
    for (const code of seeds)
      for (let depth = 1; depth <= 3; depth++) {
        const f = generateFloor({ seed: seedToNumber(code), depth, unlocked: ALL, poolRemoved: [] });
        const types = f.rooms.map((r) => r.type);
        expect(types).toContain('start');
        expect(types).toContain('boss');
        expect(types).toContain('treasure');
        expect(types).toContain('shop');
        expect(f.rooms[f.bossId].doors.length).toBe(1);
        expect(f.rooms[f.bossId].boss).toBeTruthy();
        for (const r of f.rooms)
          for (const d of r.doors) {
            const o = f.rooms[d.to];
            const back = o.doors.find((od) => od.to === r.id && od.side === OPPOSITE[d.side] && od.tlx === d.lx && od.tly === d.ly);
            expect(back, `door back ${code} ${r.id}->${d.to}`).toBeTruthy();
          }
        // Reachability from start (secret doors count, they can be bombed).
        const seen = new Set([f.startId]);
        const q = [f.startId];
        while (q.length) {
          const id = q.pop()!;
          for (const d of f.rooms[id].doors) if (!seen.has(d.to)) { seen.add(d.to); q.push(d.to); }
        }
        expect(seen.size).toBe(f.rooms.length);
      }
  });

  it('does not repeat items within a floor', () => {
    for (const code of seeds) {
      const f = generateFloor({ seed: seedToNumber(code), depth: 3, unlocked: ALL, poolRemoved: [] });
      const items = f.rooms.flatMap((r) => [r.item, ...(r.grottoItems ?? []), ...(r.shop?.map((s) => s.itemId) ?? [])]).filter(Boolean);
      expect(new Set(items).size).toBe(items.length);
    }
  });
});

describe('room generation', () => {
  it('keeps every door mouth reachable', () => {
    for (const code of seeds)
      for (let depth = 1; depth <= 3; depth++) {
        const f = generateFloor({ seed: seedToNumber(code), depth, unlocked: ALL, poolRemoved: [] });
        for (const r of f.rooms) {
          const L = buildRoom(r, depth);
          const passable = (t: number) => !isSolidTile(t) || t === T_SECRET || t === 2;
          const start = L.mouths[0];
          if (!start) continue;
          const sx = Math.floor(start.ix / TILE), sy = Math.floor(start.iy / TILE);
          const seen = new Uint8Array(L.tiles.length);
          const q = [sy * L.tw + sx];
          seen[q[0]] = 1;
          while (q.length) {
            const i = q.pop()!;
            const x = i % L.tw, y = (i / L.tw) | 0;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = x + dx, ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= L.tw || ny >= L.th) continue;
              const j = ny * L.tw + nx;
              if (!seen[j] && passable(L.tiles[j])) { seen[j] = 1; q.push(j); }
            }
          }
          for (const m of L.mouths) {
            const i = Math.floor(m.iy / TILE) * L.tw + Math.floor(m.ix / TILE);
            expect(seen[i], `mouth ${code} d${depth} room ${r.id} ${m.door.side}`).toBe(1);
          }
          for (const s of L.spawns) {
            const i = Math.floor(s.y / TILE) * L.tw + Math.floor(s.x / TILE);
            expect(isSolidTile(L.tiles[i])).toBe(false);
          }
        }
      }
  });
});
