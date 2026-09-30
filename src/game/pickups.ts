// Pickups sink (or float) and settle; pedestals hold items.

import { Entity, moveBox } from './entity';
import type { PickupKind } from './run';
import type { RoomWorld } from './room';
import { cosmetic as R } from '../core/rng';

export class Pickup extends Entity {
  kind: PickupKind;
  snack?: string;
  settled = false;
  bob = R.next() * 10;
  /** Seconds before it can be collected (after spawning). */
  delay = 0.35;
  opened = false;
  constructor(kind: PickupKind, x: number, y: number, vx = 0, vy = 0) {
    super();
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.r = kind === 'clam' || kind === 'goldclam' ? 18 : 12;
    this.hw = kind === 'clam' || kind === 'goldclam' ? 16 : 9;
    this.hh = kind === 'clam' || kind === 'goldclam' ? 11 : 9;
  }
  get floats() {
    return this.kind === 'foam';
  }
  update(w: RoomWorld, dt: number) {
    this.age += dt;
    this.delay -= dt;
    this.bob += dt;
    const g = this.floats ? -70 : 150;
    this.vy += g * dt;
    this.vx *= Math.exp(-2.2 * dt);
    this.vy *= Math.exp(-1.6 * dt);
    const wasSettled = this.settled;
    const res = moveBox(this, this.vx * dt, this.vy * dt, w);
    if (res.hitY) {
      if (!this.floats && !wasSettled && this.vy > 60) w.fx.burst(this.x, this.y + this.hh, 'sand', undefined, 4);
      this.vy = 0;
      this.settled = true;
    } else if (Math.abs(this.vy) > 20) this.settled = false;
    if (res.hitX) this.vx = -this.vx * 0.4;
    this.x = Math.max(24, Math.min(w.widthPx - 24, this.x));
    this.y = Math.max(24, Math.min(w.heightPx - 24, this.y));
  }
}

export class Pedestal extends Entity {
  itemId: string | null;
  price?: number;
  pickup?: PickupKind;
  hearts?: number;
  charge?: number;
  bob = R.next() * 10;
  cooldown = 0;
  constructor(itemId: string | null, x: number, y: number) {
    super();
    this.itemId = itemId;
    this.x = x;
    this.y = y;
    this.r = 20;
  }
}

export type PropKind = 'crack' | 'surface' | 'grotto' | 'grottoExit' | 'shopkeeper';

export class Prop {
  dead = false;
  age = 0;
  active = false;
  constructor(public kind: PropKind, public x: number, public y: number, public w = 60, public h = 60) {}
}
