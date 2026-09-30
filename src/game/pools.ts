import type { Rng } from '../core/rng';
import { ITEMS, type PoolKind } from './items';

/** Item pool bookkeeping. Items leave all pools once drawn. */
export class ItemPools {
  removed: Set<string>;
  unlocked: Set<string>;
  constructor(unlocked: Iterable<string>, removed: Iterable<string> = []) {
    this.unlocked = new Set(unlocked);
    this.removed = new Set(removed);
  }
  candidates(pool: PoolKind) {
    return ITEMS.filter(
      (it) => it.pools.includes(pool) && !this.removed.has(it.id) && (!it.unlock || this.unlocked.has(it.unlock)),
    );
  }
  draw(pool: PoolKind, rng: Rng): string {
    let cands = this.candidates(pool);
    if (cands.length === 0) cands = this.candidates('treasure');
    if (cands.length === 0) return '__heart_container';
    const pick = rng.weighted(cands, (it) => [1.2, 1.1, 1, 0.7, 0.4][it.quality] ?? 0.5)!;
    this.removed.add(pick.id);
    return pick.id;
  }
}
