// Enemies. Behavior scales with Menace (Descent Curve).

import { clamp, dist, lerp } from '../core/math';
import { cosmetic as R } from '../core/rng';
import { sfx } from '../core/audio';
import type { EnemyKind } from '../gen/biomes';
import type { Attach } from '../gen/tiles';
import { Entity, moveBox } from './entity';
import { Bubble, EnemyShot } from './projectiles';
import type { RoomWorld } from './room';

export const ENEMY_INFO: Record<EnemyKind, { name: string; lore: string; hp: number; color: number }> = {
  blob: { name: 'Spanish Dancer', lore: 'A frilly sea slug that swims like a twirling skirt. Its touch stings.', hp: 10, color: 0xe0503a },
  jelly: { name: 'Jelly Swarm', lore: 'Tiny stinging drifters with bad manners.', hp: 4, color: 0xd99cff },
  crabby: { name: 'Crabby', lore: 'Scuttles sideways, leaps upwards, complains constantly.', hp: 14, color: 0xff6a4d },
  urchin: { name: 'Sea Urchin', lore: 'Never moves. Never needs to.', hp: 12, color: 0x7a4dff },
  pufferling: { name: 'Pufferling', lore: 'Puffs up when nervous. Is always nervous.', hp: 16, color: 0xffd24d },
  moray: { name: 'Moray Pop-up', lore: 'Lives in a hole. Hates visitors.', hp: 20, color: 0x7fae4a },
  barracuda: { name: 'Barracuda', lore: 'All teeth, no brakes.', hp: 18, color: 0x9ab4c8 },
  splitter: { name: 'Salp Chain', lore: 'Glassy barrels strung together. Break the chain and each one swims on.', hp: 14, color: 0x9ad8f0 },
  flounder: { name: 'Sand Flounder', lore: 'Flat, sneaky, and very rude.', hp: 12, color: 0xc8a676 },
  cannoncrab: { name: 'Cannon Crab', lore: 'Found a cannon. Loves it.', hp: 22, color: 0xd9583b },
  mimic: { name: 'Giant Clam', lore: 'Shows a pearl. Snaps shut on whoever reaches for it.', hp: 30, color: 0xb88adf },
  squidling: { name: 'Squidling', lore: 'Squirts ink and runs. Classic squid.', hp: 16, color: 0xff8ac8 },
  clownanemone: { name: 'Clown Anemone', lore: 'A bubble-tip anemone and its fierce clownfish lodger. Flings bouncing stingers.', hp: 22, color: 0xff5cae },
  seahorse: { name: 'Seahorse Lancer', lore: 'Stands tall, fires in threes, never breaks formation.', hp: 18, color: 0xffb347 },
  nettle: { name: 'Sea Nettle', lore: 'A drifting jelly with a curtain of stinging threads.', hp: 16, color: 0xffa060 },
  stingray: { name: 'Stingray', lore: 'Glides along the floor. Mind the barb.', hp: 24, color: 0x8a9ab0 },
  lanternfish: { name: 'Lanternfish', lore: 'Its glowing spots hunt you down in the dark.', hp: 16, color: 0x6ab8ff },
  ghostshrimp: { name: 'Ghost Shrimp', lore: 'Clear as water — until it is right next to you.', hp: 14, color: 0xd8f0ff },
  anglerling: { name: 'Anglerling', lore: 'Dangles a pretty light. Waits. Bites.', hp: 26, color: 0x5a4a6a },
  hatchetfish: { name: 'Hatchetfish', lore: 'Silver blades that hunt in shoals.', hp: 6, color: 0xc8d0e0 },
  viperfish: { name: 'Viperfish', lore: 'Fangs too long to close its own mouth. Never stops.', hp: 26, color: 0x3a4a6a },
  gulper: { name: 'Gulper Eel', lore: 'Mostly mouth. Inhales whatever swims by.', hp: 40, color: 0x2a2236 },
  isopod: { name: 'Giant Isopod', lore: 'Armored in front, patient forever.', hp: 36, color: 0xb8a8a0 },
  toydiver: { name: 'Plastic Diver', lore: 'A toy that bubbles. Nobody wound it up.', hp: 24, color: 0xffd23d },
  snail: { name: 'Tank Snail', lore: 'Licks the glass clean. Hides in its shell when poked.', hp: 20, color: 0xc8925a },
};

export class Enemy extends Entity {
  kind: EnemyKind | string;
  hp: number;
  maxHp: number;
  boss = false;
  menace: number;
  facing = 1;
  frozen = 0;
  burn = 0;
  burnDps = 0;
  poison = 0;
  poisonDps = 0;
  charmed = 0;
  stun = 0;
  flash = 0;
  slow = 0;
  /** Damage to Clementine on touch / per shot, in HP. */
  contactDmg = 12;
  shotDmg = 10;
  attach: Attach;
  gravity = 0;
  grounded = false;
  swimmer = true;
  /** Behavior state. */
  state = 'idle';
  t = 0;
  cd = 0;
  anim = 0;
  /** Telegraph intensity 0..1 for rendering. */
  tele = 0;
  hidden = false;
  gen = 0;
  kx = 0;
  ky = 0;
  scale = 1;
  display: string;
  lastHitBy: Bubble | null = null;
  spawnGrace = 0.6;
  /** Where it lives; it drifts back here when it loses interest. */
  spawnX = 0;
  spawnY = 0;
  /** Currently hunting Clementine. */
  chasing = false;
  /** Spawned inside the boss arena (boss minions may stay there). */
  arenaBorn = false;
  /** Encounter group this enemy belongs to (-1: none). */
  groupId = -1;
  /** Champion variant: tougher, tinted, drops a bonus pickup. */
  champion = 0;

  makeChampion(color: number) {
    this.champion = color;
    this.hp = this.maxHp = this.maxHp * 1.8;
    this.r *= 1.12;
    this.contactDmg = Math.round(this.contactDmg * 1.25);
    this.shotDmg = Math.round(this.shotDmg * 1.2);
  }

  constructor(kind: EnemyKind | string, x: number, y: number, menace: number, attach: Attach = 'none') {
    super();
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.spawnX = x;
    this.spawnY = y;
    this.menace = menace;
    this.attach = attach;
    const info = ENEMY_INFO[kind as EnemyKind];
    this.hp = this.maxHp = (info?.hp ?? 20) * (1 + menace * 0.6);
    this.display = info?.name ?? kind;
    // Damage to Clementine (HP of 100), harsher deeper down.
    const hit = CONTACT_DMG[kind as EnemyKind] ?? 12;
    this.contactDmg = Math.round(hit * (1 + menace * 0.75));
    this.shotDmg = Math.round(10 * (1 + menace * 0.6));
    this.r = 16;
    this.hw = this.hh = 14;
    this.cd = R.range(0.5, 1.5);
    this.anim = R.next() * 10;
  }

  get teleTime() {
    return lerp(0.8, 0.35, this.menace / 1);
  }
  get speedK() {
    return (1 + this.menace * 0.5) * (this.slow > 0 ? 0.5 : 1);
  }
  get aggression() {
    return lerp(0.4, 1, this.menace);
  }

  hittable() {
    return !this.hidden;
  }

  hurt(w: RoomWorld, dmg: number, src: Bubble | null, silent = false) {
    if (this.dead || this.hidden) return;
    if (this.invulnerable()) {
      if (!silent) {
        w.fx.burst(this.x, this.y, 'sparkle', 0xffffff, 3);
        sfx.deny();
      }
      return;
    }
    this.hp -= dmg;
    if (!silent) {
      this.flash = 0.12;
      w.fx.burst(src?.x ?? this.x, src?.y ?? this.y, 'hit', 0xffffff, 3);
      sfx.hit();
    }
    this.lastHitBy = src;
    if (this.hp <= 0) this.die(w);
  }

  invulnerable() {
    return false;
  }

  knock(vx: number, vy: number, force: number) {
    if (this.boss) return;
    const l = Math.hypot(vx, vy) || 1;
    this.kx += (vx / l) * force;
    this.ky += (vy / l) * force;
  }

  freeze(t: number) {
    if (this.boss) t *= 0.3;
    this.frozen = Math.max(this.frozen, t);
  }
  poisonUp(t: number, dps: number) {
    this.poison = Math.max(this.poison, t);
    this.poisonDps = Math.max(this.poisonDps, dps);
  }
  ignite(t: number, dps: number) {
    this.burn = Math.max(this.burn, t);
    this.burnDps = Math.max(this.burnDps, dps);
  }

  die(w: RoomWorld) {
    if (this.dead) return;
    this.dead = true;
    w.onEnemyKilled(this);
  }

  update(w: RoomWorld, dt: number) {
    this.age += dt;
    this.anim += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.slow = Math.max(0, this.slow - dt);
    this.spawnGrace = Math.max(0, this.spawnGrace - dt);
    if (this.poison > 0) {
      this.poison -= dt;
      this.hurt(w, this.poisonDps * dt, null, true);
      if (R.chance(dt * 8)) w.fx.burst(this.x + R.range(-8, 8), this.y - 4, 'bubbles', 0x9dff5c, 1);
      if (this.dead) return;
    }
    if (this.burn > 0) {
      this.burn -= dt;
      this.hurt(w, this.burnDps * dt, null, true);
      if (R.chance(dt * 12)) w.fx.burst(this.x + R.range(-8, 8), this.y - 6, 'sparkle', 0xff7a3d, 1);
      if (this.dead) return;
    }
    if (this.charmed > 0) this.charmed -= dt;
    if (this.frozen > 0) {
      this.frozen -= dt;
      this.applyPhysics(w, dt, true);
      return;
    }
    if (this.stun > 0) {
      this.stun -= dt;
      this.applyPhysics(w, dt, true);
      return;
    }
    if (this.charmed > 0) this.thinkCharmed(w, dt);
    else if (this.boss || w.canChase(this)) this.think(w, dt);
    else this.idle(w, dt);
    this.applyPhysics(w, dt, false);
  }

  /** Charmed: attack the nearest other enemy. */
  thinkCharmed(w: RoomWorld, dt: number) {
    let best: Enemy | null = null, bd = 1e9;
    for (const o of w.enemies) {
      if (o === this || o.dead || o.charmed > 0) continue;
      const d = dist(this.x, this.y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    if (best) {
      this.steer(best.x, best.y, 90, dt);
      if (bd < this.r + best.r + 4) best.hurt(w, 8 * dt, null, true);
    }
  }

  /**
   * Lost interest (Clementine is far away, in a safe place or in the boss
   * arena): stop attacking and wander lazily back home.
   */
  idle(_w: RoomWorld, dt: number) {
    this.tele = 0;
    if (this.state !== 'disguised') this.state = 'idle';
    if (this.attach !== 'none' && !this.swimmer && this.gravity === 0) return; // clingers stay put
    const dx = this.spawnX - this.x, dy = this.spawnY - this.y;
    const d = Math.hypot(dx, dy);
    if (this.state === 'disguised') {
      this.vx *= Math.exp(-4 * dt);
      return;
    }
    if (d > 40) this.steer(this.spawnX, this.spawnY, 45 * this.speedK, dt, 2);
    else {
      // Mill about at home.
      const a = this.age * 0.6 + this.id;
      this.steer(this.spawnX + Math.cos(a) * 30, this.spawnY + Math.sin(a * 1.3) * 18, 20, dt, 1.5);
    }
  }

  think(w: RoomWorld, dt: number) {
    const p = w.player;
    this.steer(p.x, p.y, 60 * this.speedK, dt);
  }

  steer(tx: number, ty: number, speed: number, dt: number, accel = 4) {
    const a = Math.atan2(ty - this.y, tx - this.x);
    this.vx += (Math.cos(a) * speed - this.vx) * Math.min(1, accel * dt);
    if (this.swimmer) this.vy += (Math.sin(a) * speed - this.vy) * Math.min(1, accel * dt);
    if (Math.abs(this.vx) > 5) this.facing = Math.sign(this.vx);
  }

  applyPhysics(w: RoomWorld, dt: number, frozen: boolean) {
    if (this.attach !== 'none' && !this.swimmer && this.gravity === 0) return; // clingers
    if (frozen && this.swimmer) {
      this.vx *= Math.exp(-6 * dt);
      this.vy *= Math.exp(-6 * dt);
    }
    if (!this.swimmer) this.vy += this.gravity * dt;
    this.kx *= Math.exp(-8 * dt);
    this.ky *= Math.exp(-8 * dt);
    const res = moveBox(this, (this.vx + this.kx) * dt, (this.vy + this.ky) * dt, w);
    this.grounded = res.ground;
    if (res.hitY) this.vy = 0;
    if (res.hitX) {
      this.vx = 0;
      this.onWall(w);
    }
    // Water resistance for swimmers.
    if (this.swimmer && ((this.age * 60) | 0) % 4 === 0) w.fluid.splat(this.x, this.y, this.vx * 0.5, this.vy * 0.5, 26);
  }

  onWall(_w: RoomWorld) {}

  shoot(w: RoomWorld, angle: number, speed: number, opts: ConstructorParameters<typeof EnemyShot>[4] = {}) {
    const s = new EnemyShot(this.x + Math.cos(angle) * this.r, this.y + Math.sin(angle) * this.r, Math.cos(angle) * speed, Math.sin(angle) * speed, { dmg: this.shotDmg, ...opts });
    w.shots.push(s);
    return s;
  }
}

/** Contact damage per creature at Depth 1, in HP. */
const CONTACT_DMG: Partial<Record<EnemyKind, number>> = {
  clownanemone: 10, seahorse: 10, nettle: 10, stingray: 16, lanternfish: 10, ghostshrimp: 14, anglerling: 22,
  hatchetfish: 6, viperfish: 18, gulper: 24, isopod: 14, toydiver: 12, snail: 8,
  blob: 10, jelly: 6, pufferling: 14, splitter: 10, squidling: 8, barracuda: 16,
  crabby: 12, cannoncrab: 12, mimic: 18, flounder: 14, urchin: 12, moray: 18,
};

// ── Kinds ──────────────────────────────────────────────────────────

class Blob extends Enemy {
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    const d = dist(this.x, this.y, p.x, p.y);
    if (d < 420 || R.chance(this.aggression * dt)) this.state = 'chase';
    if (this.state === 'chase') this.steer(p.x, p.y, 62 * this.speedK, dt, 2);
    else this.steer(this.x + Math.sin(this.anim) * 60, this.y + Math.cos(this.anim * 0.7) * 40, 30, dt, 1);
  }
}

class Jelly extends Enemy {
  constructor(...a: ConstructorParameters<typeof Enemy>) {
    super(...a);
    this.r = 10;
    this.hw = this.hh = 9;
  }
  override think(w: RoomWorld, dt: number) {
    this.t -= dt;
    if (this.t <= 0) {
      const p = w.player;
      this.t = R.range(0.5, 0.9);
      const a = Math.atan2(p.y - this.y, p.x - this.x) + R.range(-1.2, 1.2) * (1 - this.aggression * 0.5);
      const sp = 150 * this.speedK;
      this.vx = Math.cos(a) * sp;
      this.vy = Math.sin(a) * sp;
      this.anim = 0;
    }
    this.vx *= Math.exp(-2.5 * dt);
    this.vy *= Math.exp(-2.5 * dt);
    this.facing = Math.sign(this.vx) || this.facing;
  }
}

class Crabby extends Enemy {
  constructor(...a: ConstructorParameters<typeof Enemy>) {
    super(...a);
    this.swimmer = false;
    this.gravity = 900;
    this.hw = 16;
    this.hh = 12;
    this.r = 16;
  }
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    this.cd -= dt;
    if (this.grounded) {
      const dx = p.x - this.x;
      const want = Math.abs(dx) > 10 ? Math.sign(dx) : 0;
      this.vx += (want * 95 * this.speedK - this.vx) * Math.min(1, 5 * dt);
      if (this.state === 'crouch') {
        this.t -= dt;
        this.tele = 1 - this.t / this.teleTime;
        this.vx *= 0.5;
        if (this.t <= 0) {
          this.state = 'idle';
          this.tele = 0;
          this.vy = -520 - this.menace * 120;
          this.vx = clamp(dx * 1.5, -260, 260);
          this.cd = 1.4 - this.menace * 0.6;
        }
      } else if (this.cd <= 0 && p.y < this.y - 30 && Math.abs(dx) < 170) {
        this.state = 'crouch';
        this.t = this.teleTime;
      }
    }
    if (Math.abs(this.vx) > 5) this.facing = Math.sign(this.vx);
  }
}

class Urchin extends Enemy {
  constructor(...a: ConstructorParameters<typeof Enemy>) {
    super(...a);
    this.swimmer = false;
    if (this.attach === 'none') this.attach = 'floor';
  }
  override knock() {}
  override think(w: RoomWorld, dt: number) {
    this.cd -= dt;
    const tt = this.teleTime;
    if (this.cd < tt) this.tele = 1 - Math.max(0, this.cd) / tt;
    if (this.cd <= 0) {
      const n = this.menace > 0.3 ? 8 : 6;
      const off = R.next() * Math.PI;
      for (let i = 0; i < n; i++) this.shoot(w, off + (i / n) * Math.PI * 2, 170 * (1 + this.menace * 0.4), { color: 0xb06bff });
      sfx.enemyShoot();
      this.cd = R.range(2, 2.6) - this.menace;
      this.tele = 0;
    }
  }
}

class Pufferling extends Enemy {
  puff = 0;
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    const d = dist(this.x, this.y, p.x, p.y);
    this.cd -= dt;
    if (this.state === 'inflate') {
      this.t -= dt;
      this.puff = Math.min(1, this.puff + dt / this.teleTime);
      this.tele = this.puff;
      this.vx *= 0.9;
      this.vy *= 0.9;
      if (this.t <= 0) {
        const n = 8 + Math.round(this.menace * 4);
        for (let i = 0; i < n; i++) this.shoot(w, (i / n) * Math.PI * 2, 200, { color: 0xffd24d, r: 6 });
        sfx.enemyShoot();
        w.fx.text(this.x, this.y - 30, 'PFFT!', 0xffd24d);
        this.state = 'deflate';
        this.cd = 2.6 - this.menace;
      }
    } else {
      this.puff = Math.max(0, this.puff - dt * 1.5);
      this.tele = 0;
      if (this.puff <= 0) this.state = 'drift';
      this.steer(p.x, p.y, 45 * this.speedK, dt, 1.5);
      if (d < 130 && this.cd <= 0) {
        this.state = 'inflate';
        this.t = this.teleTime;
      }
    }
    this.r = 16 + this.puff * 10;
  }
}

class Moray extends Enemy {
  out = 0;
  homeX: number;
  homeY: number;
  constructor(...a: ConstructorParameters<typeof Enemy>) {
    super(...a);
    this.homeX = this.x;
    this.homeY = this.y;
    this.hidden = true;
    this.swimmer = true;
    this.r = 15;
  }
  override hittable() {
    return this.out > 0.25;
  }
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    const dirx = this.attach === 'left' ? 1 : this.attach === 'right' ? -1 : 0;
    const diry = this.attach === 'floor' ? -1 : 0;
    this.facing = dirx || this.facing;
    this.cd -= dt;
    if (this.state === 'idle') {
      this.out = Math.max(0, this.out - dt * 2);
      const inLine = dirx !== 0 ? Math.abs(p.y - this.y) < 60 && Math.sign(p.x - this.x) === dirx : Math.abs(p.x - this.x) < 60 && p.y < this.y;
      if (this.cd <= 0 && inLine && dist(p.x, p.y, this.x, this.y) < 330) {
        this.state = 'peek';
        this.t = this.teleTime;
      }
    } else if (this.state === 'peek') {
      this.t -= dt;
      this.out = 0.3;
      this.tele = 1 - this.t / this.teleTime;
      if (this.t <= 0) {
        this.state = 'lunge';
        this.t = 0.35;
        sfx.enemyShoot();
      }
    } else if (this.state === 'lunge') {
      this.t -= dt;
      this.out = Math.min(1, this.out + dt * 5);
      if (this.t <= 0) {
        this.state = 'retract';
        this.t = 0.9;
      }
    } else if (this.state === 'retract') {
      this.t -= dt;
      this.tele = 0;
      if (this.t <= 0.5) this.out = Math.max(0, this.out - dt * 2);
      if (this.t <= 0) {
        this.state = 'idle';
        this.cd = 1.2 - this.menace;
      }
    }
    this.hidden = this.out < 0.25;
    const reach = 150 * (1 + this.menace * 0.3);
    this.x = this.homeX + dirx * this.out * reach;
    this.y = this.homeY + diry * this.out * reach;
    this.vx = this.vy = 0;
  }
  override applyPhysics() {}
  override idle(_w: RoomWorld, dt: number) {
    // Back into its burrow.
    this.state = 'idle';
    this.tele = 0;
    this.out = Math.max(0, this.out - dt * 2);
    this.hidden = this.out < 0.25;
    const dirx = this.attach === 'left' ? 1 : this.attach === 'right' ? -1 : 0;
    const diry = this.attach === 'floor' ? -1 : 0;
    const reach = 150 * (1 + this.menace * 0.3);
    this.x = this.homeX + dirx * this.out * reach;
    this.y = this.homeY + diry * this.out * reach;
  }
}

class Barracuda extends Enemy {
  constructor(...a: ConstructorParameters<typeof Enemy>) {
    super(...a);
    this.r = 15;
    this.hw = 18;
    this.hh = 10;
  }
  dashA = 0;
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    this.cd -= dt;
    if (this.state === 'aim') {
      this.t -= dt;
      this.tele = 1 - this.t / this.teleTime;
      this.vx *= 0.85;
      this.vy *= 0.85;
      this.dashA = Math.atan2(p.y - this.y, p.x - this.x);
      this.facing = Math.cos(this.dashA) >= 0 ? 1 : -1;
      if (this.t <= 0) {
        this.state = 'dash';
        this.t = 0.55;
        this.tele = 0;
        const sp = 540 * (1 + this.menace * 0.4);
        this.vx = Math.cos(this.dashA) * sp;
        this.vy = Math.sin(this.dashA) * sp;
        w.fx.text(this.x, this.y - 24, 'ZOOM!', 0x9ab4c8, 20);
      }
    } else if (this.state === 'dash') {
      this.t -= dt;
      if (this.t <= 0) {
        this.state = 'idle';
        this.cd = 1.6 - this.menace;
      }
    } else {
      this.steer(p.x + Math.sin(this.anim * 0.8) * 160, p.y - 60 + Math.cos(this.anim) * 40, 70 * this.speedK, dt, 2);
      if (this.cd <= 0 && dist(p.x, p.y, this.x, this.y) < 420) {
        this.state = 'aim';
        this.t = this.teleTime;
      }
    }
  }
  override onWall(w: RoomWorld) {
    if (this.state === 'dash') {
      this.state = 'idle';
      this.stun = 0.6;
      this.cd = 1.5;
      w.fx.shake(3);
      w.fx.burst(this.x, this.y, 'sand', undefined, 8);
    }
  }
}

class Splitter extends Enemy {
  constructor(kind: EnemyKind, x: number, y: number, menace: number, attach: Attach = 'none', gen = 0) {
    super(kind, x, y, menace, attach);
    this.gen = gen;
    const s = gen === 0 ? 1 : 0.62;
    this.scale = s;
    this.r = 18 * s;
    this.hw = this.hh = 15 * s;
    if (gen > 0) this.hp = this.maxHp = this.maxHp * 0.45;
  }
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    this.steer(p.x, p.y, (this.gen ? 85 : 55) * this.speedK, dt, 2);
  }
  override die(w: RoomWorld) {
    super.die(w);
    if (this.gen === 0) {
      for (const s of [-1, 1]) {
        const c = new Splitter('splitter', this.x + s * 14, this.y, this.menace, 'none', 1);
        c.vx = s * 160;
        c.spawnGrace = 0.3;
        w.addEnemy(c);
      }
    }
  }
}

class Flounder extends Enemy {
  constructor(...a: ConstructorParameters<typeof Enemy>) {
    super(...a);
    this.hidden = true;
    this.swimmer = false;
    this.gravity = 800;
    this.hw = 20;
    this.hh = 8;
    this.r = 16;
  }
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    this.cd -= dt;
    if (this.state === 'idle') {
      this.hidden = true;
      if (this.grounded && this.cd <= 0 && Math.abs(p.x - this.x) < 90 && p.y < this.y && this.y - p.y < 300) {
        this.state = 'tremble';
        this.t = this.teleTime * 0.8;
      }
    } else if (this.state === 'tremble') {
      this.t -= dt;
      this.tele = 1 - this.t / (this.teleTime * 0.8);
      if (this.t <= 0) {
        this.hidden = false;
        this.tele = 0;
        this.vy = -560 - this.menace * 150;
        this.vx = clamp(p.x - this.x, -120, 120);
        this.state = 'air';
        w.fx.burst(this.x, this.y + 8, 'sand', undefined, 14);
        w.fx.text(this.x, this.y - 20, 'FWUMP!', 0xc8a676);
      }
    } else if (this.state === 'air') {
      this.facing = Math.sign(this.vx) || this.facing;
      if (this.grounded && this.vy >= 0) {
        this.state = 'idle';
        this.vx = 0;
        this.cd = 1.6 - this.menace;
        w.fx.burst(this.x, this.y + 8, 'sand', undefined, 10);
      }
    }
  }
}

class CannonCrab extends Crabby {
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    this.cd -= dt;
    if (this.grounded) {
      const dx = p.x - this.x;
      const want = Math.abs(dx) < 200 ? -Math.sign(dx) : Math.abs(dx) > 380 ? Math.sign(dx) : 0;
      this.vx += (want * 60 * this.speedK - this.vx) * Math.min(1, 4 * dt);
      this.facing = Math.sign(dx) || 1;
    }
    if (this.cd < this.teleTime) this.tele = 1 - Math.max(0, this.cd) / this.teleTime;
    if (this.cd <= 0) {
      this.cd = 2.6 - this.menace;
      this.tele = 0;
      // Lob a sinking cannonball in an arc toward the player.
      const dx = p.x - this.x;
      const T = 1.1;
      const g = 420;
      const vx = dx / T;
      const vy = (p.y - this.y - 0.5 * g * T * T) / T;
      w.shots.push(new EnemyShot(this.x + this.facing * 18, this.y - 16, vx, vy, { r: 10, color: 0x3a3a48, gravity: g, life: 4 }));
      w.fx.burst(this.x + this.facing * 20, this.y - 18, 'ink', 0x999999, 6);
      w.fx.text(this.x, this.y - 34, 'BOOM!', 0xd9583b, 20);
      sfx.enemyShoot();
    }
  }
}

class Mimic extends Enemy {
  constructor(...a: ConstructorParameters<typeof Enemy>) {
    super(...a);
    this.swimmer = false;
    this.gravity = 900;
    this.hw = 18;
    this.hh = 14;
    this.r = 18;
    this.state = 'disguised';
  }
  override invulnerable() {
    return false;
  }
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    if (this.state === 'disguised') {
      if (dist(p.x, p.y, this.x, this.y) < 100 || this.hp < this.maxHp) {
        this.state = 'awake';
        w.fx.text(this.x, this.y - 30, 'SURPRISE!', 0xb88adf, 22);
        sfx.enemyShoot();
      }
      return;
    }
    this.cd -= dt;
    if (this.grounded && this.cd <= 0) {
      this.cd = 0.9 - this.menace * 0.4;
      this.vy = -380;
      this.vx = clamp(p.x - this.x, -1, 1) * 170 * this.speedK;
      this.facing = Math.sign(this.vx) || 1;
    }
    if (this.grounded) this.vx *= 0.8;
  }
}

class Squidling extends Enemy {
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    const d = dist(this.x, this.y, p.x, p.y);
    this.cd -= dt;
    if (this.state === 'jet') {
      this.t -= dt;
      if (this.t <= 0) this.state = 'idle';
      this.vx *= Math.exp(-2 * dt);
      this.vy *= Math.exp(-2 * dt);
      return;
    }
    const ideal = 220;
    const a = Math.atan2(p.y - this.y, p.x - this.x);
    const tx = p.x - Math.cos(a) * ideal, ty = p.y - Math.sin(a) * ideal;
    this.steer(tx, ty, 90 * this.speedK, dt, 2);
    this.facing = Math.sign(p.x - this.x) || 1;
    if (this.cd < this.teleTime) this.tele = 1 - Math.max(0, this.cd) / this.teleTime;
    if (this.cd <= 0 && d < 380) {
      const n = 3;
      for (let i = 0; i < n; i++) this.shoot(w, a + (i - 1) * 0.22, 230 * (1 + this.menace * 0.3), { color: 0x2a1a3a, r: 7 });
      sfx.enemyShoot();
      this.state = 'jet';
      this.t = 0.5;
      this.tele = 0;
      this.vx = -Math.cos(a) * 320;
      this.vy = -Math.sin(a) * 320;
      w.fx.burst(this.x, this.y, 'ink', 0x2a1a3a, 12);
      this.cd = 2.2 - this.menace;
    }
  }
}

// ── Coral Carnival ───────────────────────────────────────────────

class ClownAnemone extends Enemy {
  constructor(...a: ConstructorParameters<typeof Enemy>) {
    super(...a);
    this.swimmer = false;
    if (this.attach === 'none') this.attach = 'floor';
    this.r = 18;
    this.cd = R.range(1, 2.5);
  }
  override knock() {}
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    this.cd -= dt;
    if (this.cd < this.teleTime) this.tele = 1 - Math.max(0, this.cd) / this.teleTime;
    if (this.cd <= 0) {
      this.tele = 0;
      this.cd = 2.8 - this.menace;
      const up = this.attach === 'ceil' ? 1 : -1;
      for (const s of [-1, 1]) {
        const vx = clamp((p.x - this.x) * 0.9, -260, 260) + s * 70;
        w.shots.push(new EnemyShot(this.x, this.y + up * 16, vx, up * R.range(260, 360), {
          color: R.pick([0xff5cae, 0xffe14d, 0x5cf2ff]), r: 9, gravity: 420 * -up, life: 6, bounce: 3, dmg: this.shotDmg,
        }));
      }
      w.fx.text(this.x, this.y + up * 30, 'HONK!', 0xff5cae, 18);
      sfx.enemyShoot();
    }
  }
}

class Seahorse extends Enemy {
  burst = 0;
  constructor(...a: ConstructorParameters<typeof Enemy>) {
    super(...a);
    this.r = 15;
    this.hw = 10;
    this.hh = 16;
  }
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    const a = Math.atan2(p.y - this.y, p.x - this.x);
    const keep = 260;
    this.steer(p.x - Math.cos(a) * keep, p.y - Math.sin(a) * keep + Math.sin(this.anim * 2) * 30, 70 * this.speedK, dt, 1.5);
    this.facing = Math.sign(p.x - this.x) || 1;
    this.cd -= dt;
    if (this.burst > 0) {
      this.t -= dt;
      if (this.t <= 0) {
        this.burst--;
        this.t = 0.14;
        this.shoot(w, a, 300 * (1 + this.menace * 0.3), { color: 0xffb347, r: 6 });
        sfx.enemyShoot();
      }
      return;
    }
    if (this.cd < this.teleTime) this.tele = 1 - Math.max(0, this.cd) / this.teleTime;
    if (this.cd <= 0 && dist(p.x, p.y, this.x, this.y) < 460) {
      this.tele = 0;
      this.burst = 3;
      this.t = 0;
      this.cd = 2.4 - this.menace;
    }
  }
}

class Nettle extends Enemy {
  constructor(...a: ConstructorParameters<typeof Enemy>) {
    super(...a);
    this.r = 14;
  }
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    // Slow, pulsing drift toward her; the curtain of threads below stings.
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 1.1;
      const a = Math.atan2(p.y - 60 - this.y, p.x - this.x);
      this.vx += Math.cos(a) * 70 * this.speedK;
      this.vy += Math.sin(a) * 70 * this.speedK;
      this.anim = 0;
    }
    this.vx *= Math.exp(-1.6 * dt);
    this.vy *= Math.exp(-1.6 * dt);
    const dx = p.x - this.x, dy = p.y - this.y;
    if (dy > 0 && dy < 80 && Math.abs(dx) < 16 + dy * 0.15) w.hurtPlayer(this.contactDmg * 0.8, this.display);
  }
}

class Stingray extends Enemy {
  constructor(...a: ConstructorParameters<typeof Enemy>) {
    super(...a);
    this.r = 18;
    this.hw = 24;
    this.hh = 8;
    this.facing = R.chance(0.5) ? 1 : -1;
  }
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    this.cd -= dt;
    if (this.state === 'lash') {
      this.t -= dt;
      this.tele = 1 - this.t / this.teleTime;
      this.vx *= 0.9;
      this.vy *= 0.9;
      if (this.t <= 0) {
        this.tele = 0;
        this.state = 'idle';
        this.cd = 2 - this.menace;
        const a = Math.atan2(p.y - this.y, p.x - this.x);
        for (const o of [-0.12, 0, 0.12]) this.shoot(w, a + o, 380, { color: 0xc8d0e0, r: 5 });
        sfx.enemyShoot();
      }
      return;
    }
    // Glide back and forth just above the floor.
    let floor = this.y;
    for (let i = 0; i < 12 && !w.solidAt(this.x, floor + 20); i++) floor += 16;
    const ty = floor - 10;
    this.vx += (this.facing * 150 * this.speedK - this.vx) * Math.min(1, 2 * dt);
    this.vy += ((ty - this.y) * 2 - this.vy) * Math.min(1, 3 * dt);
    if (w.solidAt(this.x + this.facing * 30, this.y)) this.facing = -this.facing as 1 | -1;
    if (this.cd <= 0 && Math.abs(p.x - this.x) < 220 && p.y < this.y) {
      this.state = 'lash';
      this.t = this.teleTime;
    }
  }
  override onWall() {
    this.facing = -this.facing as 1 | -1;
  }
}

// ── Twilight Trench ──────────────────────────────────────────────

class Lanternfish extends Enemy {
  constructor(...a: ConstructorParameters<typeof Enemy>) {
    super(...a);
    this.r = 14;
    this.cd = R.range(1, 2);
  }
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    const a = Math.atan2(p.y - this.y, p.x - this.x);
    this.steer(p.x - Math.cos(a) * 300, p.y - Math.sin(a) * 300, 60 * this.speedK, dt, 1.2);
    this.facing = Math.sign(p.x - this.x) || 1;
    this.cd -= dt;
    if (this.cd < this.teleTime) this.tele = 1 - Math.max(0, this.cd) / this.teleTime;
    if (this.cd <= 0) {
      this.tele = 0;
      this.cd = 2.8 - this.menace;
      this.shoot(w, a, 150, { color: 0x6ab8ff, r: 9, homing: 1.6 + this.menace, life: 5 });
      sfx.enemyShoot();
    }
  }
}

class GhostShrimp extends Enemy {
  fade = 0;
  constructor(...a: ConstructorParameters<typeof Enemy>) {
    super(...a);
    this.r = 13;
  }
  override hittable() {
    return this.fade > 0.35;
  }
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    const d = dist(p.x, p.y, this.x, this.y);
    this.fade += ((d < 190 || this.state === 'dash' ? 1 : 0.08) - this.fade) * Math.min(1, dt * 4);
    this.cd -= dt;
    if (this.state === 'dash') {
      this.t -= dt;
      if (this.t <= 0) {
        this.state = 'idle';
        this.cd = 1.4 - this.menace * 0.5;
      }
      return;
    }
    this.steer(p.x + Math.sin(this.anim) * 80, p.y + Math.cos(this.anim * 0.7) * 50, 90 * this.speedK, dt, 2);
    this.facing = Math.sign(p.x - this.x) || 1;
    if (this.cd <= 0 && d < 200) {
      const a = Math.atan2(p.y - this.y, p.x - this.x);
      this.vx = Math.cos(a) * 420;
      this.vy = Math.sin(a) * 420;
      this.state = 'dash';
      this.t = 0.4;
    }
  }
}

class Anglerling extends Enemy {
  constructor(...a: ConstructorParameters<typeof Enemy>) {
    super(...a);
    this.r = 20;
    this.hw = this.hh = 16;
  }
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    const d = dist(p.x, p.y, this.x, this.y);
    this.cd -= dt;
    this.facing = Math.sign(p.x - this.x) || this.facing;
    if (this.state === 'aim') {
      this.t -= dt;
      this.tele = 1 - this.t / this.teleTime;
      this.vx *= 0.8;
      this.vy *= 0.8;
      if (this.t <= 0) {
        const a = Math.atan2(p.y - this.y, p.x - this.x);
        this.vx = Math.cos(a) * 520;
        this.vy = Math.sin(a) * 520;
        this.state = 'bite';
        this.t = 0.45;
        this.tele = 0;
        w.fx.text(this.x, this.y - 28, 'CHOMP!', 0xff3d5a, 20);
      }
    } else if (this.state === 'bite') {
      this.t -= dt;
      if (this.t <= 0) {
        this.state = 'lurk';
        this.cd = 2 - this.menace;
      }
    } else {
      // Lurk: hang almost still, letting the lure do the work.
      this.vx *= Math.exp(-2 * dt);
      this.vy += (Math.sin(this.anim * 1.4) * 12 - this.vy) * Math.min(1, dt);
      if (this.cd <= 0 && d < 230) {
        this.state = 'aim';
        this.t = this.teleTime;
      }
    }
  }
}

class Hatchetfish extends Enemy {
  side = R.chance(0.5) ? 1 : -1;
  constructor(...a: ConstructorParameters<typeof Enemy>) {
    super(...a);
    this.r = 9;
    this.hw = this.hh = 8;
  }
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    // Flank: circle in from the side, then cut through.
    const a = this.anim * 1.4 + this.id;
    const close = dist(p.x, p.y, this.x, this.y) < 120;
    const tx = close ? p.x : p.x + this.side * 140 + Math.cos(a) * 40;
    const ty = close ? p.y : p.y + Math.sin(a) * 60;
    this.steer(tx, ty, (close ? 210 : 150) * this.speedK, dt, 3);
  }
}

// ── The Abyss ────────────────────────────────────────────────────

class Viperfish extends Enemy {
  constructor(...a: ConstructorParameters<typeof Enemy>) {
    super(...a);
    this.r = 15;
    this.hw = 20;
    this.hh = 10;
  }
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    this.cd -= dt;
    if (this.state === 'lunge') {
      this.t -= dt;
      if (this.t <= 0) {
        this.state = 'idle';
        this.cd = 1.1;
      }
      return;
    }
    this.steer(p.x, p.y, 135 * this.speedK, dt, 2.5);
    if (this.cd <= 0 && dist(p.x, p.y, this.x, this.y) < 200) {
      const a = Math.atan2(p.y - this.y, p.x - this.x);
      this.vx = Math.cos(a) * 480;
      this.vy = Math.sin(a) * 480;
      this.state = 'lunge';
      this.t = 0.3;
    }
  }
}

class Gulper extends Enemy {
  open = 0;
  constructor(...a: ConstructorParameters<typeof Enemy>) {
    super(...a);
    this.r = 24;
    this.hw = this.hh = 20;
    this.cd = 2;
  }
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    const d = dist(p.x, p.y, this.x, this.y);
    this.facing = Math.sign(p.x - this.x) || this.facing;
    this.cd -= dt;
    if (this.state === 'inhale') {
      this.t -= dt;
      this.open = Math.min(1, this.open + dt * 3);
      this.vx *= 0.9;
      this.vy *= 0.9;
      // Suck Clementine (and the water) into the mouth.
      if (d < 360 && d > 1) {
        const k = (1 - d / 360) * 520 * dt;
        p.vx += ((this.x - p.x) / d) * k * 4;
        p.vy += ((this.y - p.y) / d) * k * 4;
        w.fluid.splat(p.x, p.y, (this.x - p.x) * 0.6, (this.y - p.y) * 0.6, 40);
      }
      if (this.t <= 0) {
        this.state = 'snap';
        this.t = 0.3;
        if (d < this.r + 40) w.hurtPlayer(this.contactDmg * 1.2, this.display);
        w.fx.text(this.x, this.y - 30, 'GULP!', 0xb06bff, 24);
        sfx.hit();
      }
      return;
    }
    if (this.state === 'snap') {
      this.t -= dt;
      this.open = Math.max(0, this.open - dt * 6);
      if (this.t <= 0) {
        this.state = 'idle';
        this.cd = 3 - this.menace;
      }
      return;
    }
    this.open = Math.max(0, this.open - dt);
    this.steer(p.x, p.y, 50 * this.speedK, dt, 1);
    if (this.cd < this.teleTime) this.tele = 1 - Math.max(0, this.cd) / this.teleTime;
    if (this.cd <= 0 && d < 340) {
      this.tele = 0;
      this.state = 'inhale';
      this.t = 1.5;
      sfx.splash();
    }
  }
}

class Isopod extends Crabby {
  rolling = 0;
  constructor(...a: ConstructorParameters<typeof Enemy>) {
    super(...a);
    this.hw = 20;
    this.hh = 11;
    this.r = 18;
    this.cd = 3;
  }
  override hurt(w: RoomWorld, dmg: number, src: Bubble | null, silent = false) {
    // Hits on the armored front glance off.
    const front = src && Math.sign(src.vx) === -this.facing && this.rolling <= 0;
    if (front) {
      dmg *= 0.25;
      if (!silent) w.fx.burst(this.x + this.facing * 18, this.y, 'pop', 0xffffff, 2);
    }
    super.hurt(w, dmg, src, silent);
  }
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    this.cd -= dt;
    if (this.rolling > 0) {
      this.rolling -= dt;
      this.vx = this.facing * 360;
      return;
    }
    if (this.grounded) {
      const dx = p.x - this.x;
      this.facing = Math.sign(dx) || this.facing;
      this.vx += (this.facing * 55 * this.speedK - this.vx) * Math.min(1, 3 * dt);
      if (this.cd < this.teleTime) this.tele = 1 - Math.max(0, this.cd) / this.teleTime;
      if (this.cd <= 0 && Math.abs(dx) < 420 && Math.abs(p.y - this.y) < 120) {
        this.tele = 0;
        this.rolling = 1.2;
        this.cd = 3.2 - this.menace;
        w.fx.text(this.x, this.y - 26, 'ROLL!', 0xb8a8a0, 18);
      }
    }
  }
  override onWall(w: RoomWorld) {
    if (this.rolling > 0) {
      this.rolling = 0;
      this.stun = 0.8;
      w.fx.shake(3);
    }
  }
}

// ── The Tank ─────────────────────────────────────────────────────

class ToyDiver extends Crabby {
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    this.cd -= dt;
    if (this.grounded) {
      const dx = p.x - this.x;
      this.facing = Math.sign(dx) || 1;
      // Stiff little hops, like a wind-up toy.
      if (this.cd < this.teleTime) this.tele = 1 - Math.max(0, this.cd) / this.teleTime;
      if (this.cd <= 0) {
        this.tele = 0;
        this.cd = 1.8 - this.menace * 0.5;
        this.vy = -360;
        this.vx = this.facing * 120;
        for (let i = 0; i < 4; i++) this.shoot(w, -Math.PI / 2 + this.facing * (0.35 + i * 0.15), 200 + i * 30, { color: 0xe8fbff, r: 6, gravity: -60, life: 3 });
        sfx.enemyShoot();
      } else this.vx *= 0.8;
    }
  }
}

class Snail extends Enemy {
  shell = 0;
  constructor(...a: ConstructorParameters<typeof Enemy>) {
    super(...a);
    this.swimmer = false;
    if (this.attach === 'none') this.attach = 'floor';
    this.r = 16;
  }
  override knock() {}
  override invulnerable() {
    return this.shell > 0;
  }
  override hurt(w: RoomWorld, dmg: number, src: Bubble | null, silent = false) {
    super.hurt(w, dmg, src, silent);
    if (!this.dead && this.shell <= 0) this.shell = 1.4;
  }
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    this.shell = Math.max(0, this.shell - dt);
    if (this.shell > 0) return;
    // Creep along the surface it clings to, toward Clementine.
    const horiz = this.attach === 'floor' || this.attach === 'ceil';
    const dir = horiz ? Math.sign(p.x - this.x) : Math.sign(p.y - this.y);
    const nx = this.x + (horiz ? dir * 22 * dt * this.speedK : 0);
    const ny = this.y + (horiz ? 0 : dir * 22 * dt * this.speedK);
    const below = this.attach === 'floor' ? 1 : this.attach === 'ceil' ? -1 : 0;
    const side = this.attach === 'left' ? -1 : this.attach === 'right' ? 1 : 0;
    // Only move while still hugging the surface.
    if (w.solidAt(nx + side * 20, ny + below * 20) && !w.solidAt(nx, ny)) {
      this.x = nx;
      this.y = ny;
    }
    if (horiz) this.facing = dir || this.facing;
  }
}

export function createEnemy(kind: EnemyKind, x: number, y: number, menace: number, attach: Attach): Enemy {
  switch (kind) {
    case 'blob': return new Blob(kind, x, y, menace, attach);
    case 'jelly': return new Jelly(kind, x, y, menace, attach);
    case 'crabby': return new Crabby(kind, x, y, menace, attach);
    case 'urchin': return new Urchin(kind, x, y, menace, attach);
    case 'pufferling': return new Pufferling(kind, x, y, menace, attach);
    case 'moray': return new Moray(kind, x, y, menace, attach);
    case 'barracuda': return new Barracuda(kind, x, y, menace, attach);
    case 'splitter': return new Splitter(kind, x, y, menace, attach);
    case 'flounder': return new Flounder(kind, x, y, menace, attach);
    case 'cannoncrab': return new CannonCrab(kind, x, y, menace, attach);
    case 'mimic': return new Mimic(kind, x, y, menace, attach);
    case 'squidling': return new Squidling(kind, x, y, menace, attach);
    case 'clownanemone': return new ClownAnemone(kind, x, y, menace, attach);
    case 'seahorse': return new Seahorse(kind, x, y, menace, attach);
    case 'nettle': return new Nettle(kind, x, y, menace, attach);
    case 'stingray': return new Stingray(kind, x, y, menace, attach);
    case 'lanternfish': return new Lanternfish(kind, x, y, menace, attach);
    case 'ghostshrimp': return new GhostShrimp(kind, x, y, menace, attach);
    case 'anglerling': return new Anglerling(kind, x, y, menace, attach);
    case 'hatchetfish': return new Hatchetfish(kind, x, y, menace, attach);
    case 'viperfish': return new Viperfish(kind, x, y, menace, attach);
    case 'gulper': return new Gulper(kind, x, y, menace, attach);
    case 'isopod': return new Isopod(kind, x, y, menace, attach);
    case 'toydiver': return new ToyDiver(kind, x, y, menace, attach);
    case 'snail': return new Snail(kind, x, y, menace, attach);
  }
}

export { Crabby as CrabbyEnemy, Blob as BlobEnemy, Jelly as JellyEnemy };
