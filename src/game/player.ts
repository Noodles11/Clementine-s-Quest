// Clementine: movement (with slow idle sink), shooting, actives.

import { input } from '../core/input';
import { sfx } from '../core/audio';
import { approach, clamp } from '../core/math';
import { cosmetic as R } from '../core/rng';
import { Entity, moveBox, type Solidity } from './entity';
import { Beam, Bubble, InkBomb } from './projectiles';
import type { DerivedStats } from './stats';
import type { RoomWorld } from './room';
import { ITEM_BY_ID } from './items';

export class Player extends Entity {
  stats!: DerivedStats;
  fireCd = 0;
  charge = 0;
  chargeDir: [number, number] = [0, 1];
  invuln = 0;
  shield = 0;
  glowBurst = 0;
  /** Visual state consumed by the renderer. */
  pulse = 0;
  pulseKick = 0;
  shootFlash = 0;
  hurtFlash = 0;
  lastShootDir: [number, number] = [0, 1];
  moving = false;
  sinkBlend = 0;
  helixPhase = 0;
  spiralFlip = 1;
  lastMoveDir: [number, number] = [0, 0];
  inkTrail = 0;
  sizeMul = 1;
  /** Solidity that lets the player pass through open door mouths. */
  solidity!: Solidity;

  constructor(x: number, y: number) {
    super();
    this.x = x;
    this.y = y;
    this.r = 13;
    this.hw = 14;
    this.hh = 14;
  }

  update(w: RoomWorld, dt: number) {
    this.age += dt;
    const st = this.stats;
    this.invuln = Math.max(0, this.invuln - dt);
    this.shield = Math.max(0, this.shield - dt);
    this.glowBurst = Math.max(0, this.glowBurst - dt);
    this.shootFlash = Math.max(0, this.shootFlash - dt * 4);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);

    // ── Movement ─────────────────────────────────────────────
    let [ix, iy] = input.moveAxis();
    const l = Math.hypot(ix, iy);
    // Keyboard diagonals normalize to 1; analog (touch) input keeps its strength.
    if (l > 1) {
      ix /= l;
      iy /= l;
    }
    const max = st.movePx;
    const moving = l > 0.05;
    // Pulse on direction changes, quantized to 8 directions so analog input doesn't spam it.
    const oct = moving ? Math.round(Math.atan2(iy, ix) / (Math.PI / 4)) : 99;
    if (moving && oct !== this.lastMoveDir[0]) this.kick();
    this.lastMoveDir = [oct, 0];
    this.moving = moving;
    const accel = moving ? 9 : 5;
    this.vx = approach(this.vx, ix * max, accel, dt);
    // Slow idle sink: eased in so it never fights the player.
    this.sinkBlend = moving ? 0 : Math.min(1, this.sinkBlend + dt / 0.5);
    const sinkV = st.noSink ? 0 : 12 * this.sinkBlend;
    this.vy = approach(this.vy, moving ? iy * max : sinkV, accel, dt);
    // Jellyfish pulses: rhythmic while swimming.
    this.pulse += dt * (moving ? 2.4 : 0.9);
    if (moving && this.pulse > 1) {
      this.pulse = 0;
      this.kick();
    }
    if (this.pulse > 1) this.pulse -= 1;
    this.pulseKick = Math.max(0, this.pulseKick - dt * 3);

    moveBox(this, this.vx * dt, this.vy * dt, this.solidity);
    this.x = clamp(this.x, -30, w.widthPx + 30);
    this.y = clamp(this.y, -30, w.heightPx + 30);

    // Water pushed by the bell: a ring behind her.
    if (moving && ((this.age * 60) | 0) % 2 === 0) {
      w.fluid.splat(this.x - ix * 16, this.y - iy * 16 + 10, -ix * 110 + this.vx * 0.4, -iy * 110 + this.vy * 0.4, 30);
    }

    // Kraken form: ink trail that slows enemies.
    if (st.transformations.has('kraken') && moving) {
      this.inkTrail -= dt;
      if (this.inkTrail <= 0) {
        this.inkTrail = 0.25;
        w.addZone(this.x, this.y + 14, 26, 1.8, 'ink');
      }
    }

    // ── Shooting ─────────────────────────────────────────────
    const allowDiag = w.options.diagonalShooting || st.transformations.has('kraken');
    const [sx, sy] = input.shootAxis(allowDiag);
    const shooting = sx !== 0 || sy !== 0;
    const fireDelay = st.fireDelay / (this.glowBurst > 0 ? 3 : 1);
    this.fireCd -= dt;
    const charged = st.flags.has('charge') || st.flags.has('laser');
    if (shooting) {
      const n = Math.hypot(sx, sy);
      this.lastShootDir = [sx / n, sy / n];
    }
    if (charged) {
      const full = fireDelay * (st.flags.has('laser') ? 4.5 : 3.5);
      if (shooting) {
        this.chargeDir = this.lastShootDir;
        this.charge = Math.min(1, this.charge + dt / full);
        if (this.charge < 1) sfx.charge();
      } else if (this.charge > 0) {
        if (st.flags.has('laser') && !st.flags.has('charge')) {
          if (this.charge >= 1) this.fireBeam(w);
        } else if (this.charge > 0.2) this.firePearl(w);
        this.charge = 0;
      }
    } else if (shooting && this.fireCd <= 0) {
      this.fireCd = fireDelay;
      this.fire(w, this.lastShootDir[0], this.lastShootDir[1]);
    }

    // ── Actions ──────────────────────────────────────────────
    if (input.wasPressed('KeyE')) w.dropBomb();
    if (input.wasPressed('Space')) w.useActive();
    if (input.wasPressed('KeyQ')) w.eatSnack();
  }

  kick() {
    this.pulseKick = 1;
  }

  private baseBubble(w: RoomWorld, dx: number, dy: number, extra: Partial<ConstructorParameters<typeof Bubble>[0]> = {}) {
    const st = this.stats;
    const inherit = 0.3;
    const speed = st.shotPx;
    const neon = st.transformations.has('neonrave');
    const color = neon ? 0xffffff : extra.color ?? bubbleColor(st);
    return new Bubble({
      x: this.x + dx * 16,
      y: this.y + dy * 12 - 2,
      vx: dx * speed + this.vx * inherit * (dx === 0 ? 1 : 0.4),
      vy: dy * speed + this.vy * inherit * (dy === 0 ? 1 : 0.4),
      dmg: st.damage,
      radius: 7 * st.bubbleScale * Math.sqrt(st.damage / 3.5) ** 0.5,
      range: st.rangePx,
      flags: st.flags,
      synergies: st.synergies,
      transformations: st.transformations,
      luck: st.luck,
      color,
      spiralDir: (this.spiralFlip = -this.spiralFlip),
      ...extra,
    });
  }

  fire(w: RoomWorld, dx: number, dy: number) {
    const st = this.stats;
    const dirs: [number, number, number][] = []; // dx, dy, wavePhase
    const a = Math.atan2(dy, dx);
    if (st.flags.has('triple')) {
      for (const o of [-0.2, 0, 0.2]) dirs.push([Math.cos(a + o), Math.sin(a + o), 0]);
    } else dirs.push([dx, dy, 0]);
    const out: Bubble[] = [];
    for (const [ddx, ddy] of dirs) {
      if (st.flags.has('wave')) {
        out.push(this.baseBubble(w, ddx, ddy, { wavePhase: 0 }));
        out.push(this.baseBubble(w, ddx, ddy, { wavePhase: Math.PI }));
      } else out.push(this.baseBubble(w, ddx, ddy));
    }
    if (st.flags.has('plankton')) {
      for (const s of [-1, 1]) {
        const pa = a + s * R.range(0.2, 0.45);
        const b = this.baseBubble(w, Math.cos(pa), Math.sin(pa), {
          dmg: st.damage * 0.3, radius: 3.5, mini: true, flags: new Set(), color: 0x9dff5c, range: st.rangePx * 0.6,
        });
        out.push(b);
      }
    }
    for (const b of out) w.addBubble(b);
    this.shootFlash = 1;
    this.kick();
    sfx.shoot();
    // Recoil pulse in the water.
    w.fluid.splat(this.x - dx * 14, this.y - dy * 14, -dx * 90, -dy * 90, 24);
    w.fx.light(this.x + dx * 18, this.y + dy * 18, 70, 0xffd28a, 0.9, 0.12);
  }

  firePearl(w: RoomWorld) {
    const st = this.stats;
    const c = this.charge;
    const [dx, dy] = this.chargeDir;
    const b = this.baseBubble(w, dx, dy, {
      dmg: st.damage * (1 + c * 3),
      radius: 8 + c * 12,
      pearl: c,
      color: 0xfff6e8,
      range: st.rangePx * (1 + c * 0.5),
    });
    w.addBubble(b);
    this.shootFlash = 1;
    this.kick();
    sfx.shoot();
    w.fx.text(this.x + dx * 30, this.y + dy * 30, c >= 1 ? 'PLINK!!' : 'plink', 0xfff6e8, c >= 1 ? 22 : 16);
  }

  fireBeam(w: RoomWorld) {
    const st = this.stats;
    const [dx, dy] = this.chargeDir;
    const lighthouse = st.synergies.has('lighthouse');
    const dur = lighthouse ? 0.9 : 0.45;
    w.beams.push(new Beam(this.x, this.y, dx, dy, st.damage * (lighthouse ? 0.8 : 1), dur, true, 26 * Math.sqrt(st.bubbleScale), 0xfff27a, lighthouse ? Math.PI * 2.4 : 0));
    this.shootFlash = 1;
    w.fx.shake(4);
    w.fx.flash(0xfff27a, 0.12);
    sfx.laser();
  }

  dropBomb(w: RoomWorld) {
    const b = new InkBomb(this.x, this.y + 10, this.vx * 0.3, 40);
    w.bombs.push(b);
  }
}

export function bubbleColor(st: DerivedStats): number {
  const f = st.flags;
  if (f.has('burn')) return 0xff7a3d;
  if (f.has('freeze')) return 0x9ef0ff;
  if (f.has('chain')) return 0x6ff0ff;
  if (f.has('explosive')) return 0x6a4a9a;
  if (f.has('homing')) return 0xfff27a;
  if (f.has('spectral')) return 0xd8e4ff;
  if (f.has('charm')) return 0xff9ae0;
  if (f.has('split')) return 0xff8ae0;
  return 0xffb347;
}

export function activeDef(id: string) {
  return ITEM_BY_ID[id];
}
