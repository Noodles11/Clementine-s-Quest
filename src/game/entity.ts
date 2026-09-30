import { TILE } from '../config';

let NEXT_ID = 1;

export interface Solidity {
  solidAt(x: number, y: number): boolean;
}

export abstract class Entity {
  id = NEXT_ID++;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  /** Collision radius for entity-vs-entity. */
  r = 12;
  /** Half-extents for terrain collision. */
  hw = 10;
  hh = 10;
  dead = false;
  age = 0;
  /** Ignores terrain (spectral/flying through walls). */
  ghost = false;
}

export interface MoveResult {
  hitX: boolean;
  hitY: boolean;
  ground: boolean;
  ceil: boolean;
}

/** Axis-separated box movement against the tile grid. */
export function moveBox(e: Entity, dx: number, dy: number, world: Solidity): MoveResult {
  const res: MoveResult = { hitX: false, hitY: false, ground: false, ceil: false };
  // Sub-step to avoid tunneling through thin walls.
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (TILE * 0.4)));
  const sx = dx / steps, sy = dy / steps;
  for (let s = 0; s < steps; s++) {
    if (sx !== 0) {
      const nx = e.x + sx;
      if (boxHits(nx, e.y, e.hw, e.hh, world)) {
        res.hitX = true;
        // Slide to contact.
        const dir = Math.sign(sx);
        let lo = 0, hi = Math.abs(sx);
        for (let i = 0; i < 6; i++) {
          const mid = (lo + hi) / 2;
          if (boxHits(e.x + dir * mid, e.y, e.hw, e.hh, world)) hi = mid;
          else lo = mid;
        }
        e.x += dir * lo;
      } else e.x = nx;
    }
    if (sy !== 0) {
      const ny = e.y + sy;
      if (boxHits(e.x, ny, e.hw, e.hh, world)) {
        res.hitY = true;
        if (sy > 0) res.ground = true;
        else res.ceil = true;
        const dir = Math.sign(sy);
        let lo = 0, hi = Math.abs(sy);
        for (let i = 0; i < 6; i++) {
          const mid = (lo + hi) / 2;
          if (boxHits(e.x, e.y + dir * mid, e.hw, e.hh, world)) hi = mid;
          else lo = mid;
        }
        e.y += dir * lo;
      } else e.y = ny;
    }
  }
  return res;
}

export function boxHits(x: number, y: number, hw: number, hh: number, world: Solidity): boolean {
  // Sample corners and edge midpoints (boxes are smaller than a tile).
  const l = x - hw, r = x + hw, t = y - hh, b = y + hh;
  return (
    world.solidAt(l, t) || world.solidAt(r, t) || world.solidAt(l, b) || world.solidAt(r, b) ||
    world.solidAt(x, t) || world.solidAt(x, b) || world.solidAt(l, y) || world.solidAt(r, y)
  );
}

export function overlap(a: Entity, b: Entity, pad = 0) {
  const dx = a.x - b.x, dy = a.y - b.y;
  const rr = a.r + b.r + pad;
  return dx * dx + dy * dy < rr * rr;
}
