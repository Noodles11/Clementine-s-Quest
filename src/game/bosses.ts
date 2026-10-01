// Bosses. Each guards The Crack and runs 3 phases by HP.

import { clamp, dist, wrapAngle } from '../core/math';
import { cosmetic as R } from '../core/rng';
import { sfx } from '../core/audio';
import { BOSS_NAMES, type BossKind } from '../gen/biomes';
import { createEnemy, Enemy } from './enemies';
import { EnemyShot } from './projectiles';
import type { RoomWorld } from './room';

/** Telegraphed area attack (e.g. Kelpie's vine lash). */
export class Hazard {
  dead = false;
  age = 0;
  hitDone = false;
  constructor(
    public kind: 'hline' | 'vline' | 'circle',
    public x: number,
    public y: number,
    public size: number,
    public warn: number,
    public active: number,
    public color = 0x2e9e4f,
    public by = 'Kelpie the Tangler',
    public dmg = 15,
  ) {}
  get warning() {
    return this.age < this.warn;
  }
  update(w: RoomWorld, dt: number) {
    this.age += dt;
    if (this.age > this.warn + this.active) {
      this.dead = true;
      return;
    }
    if (this.warning) return;
    const p = w.player;
    let hit = false;
    const a = w.arena;
    if (this.kind === 'hline') hit = Math.abs(p.y - this.y) < this.size / 2 + 8 && p.x > a.x0 && p.x < a.x1;
    else if (this.kind === 'vline') hit = Math.abs(p.x - this.x) < this.size / 2 + 8 && p.y > a.y0 - 100 && p.y < a.y1;
    else hit = dist(p.x, p.y, this.x, this.y) < this.size + 8;
    if (hit) w.hurtPlayer(this.dmg, this.by);
    if (!this.hitDone) {
      this.hitDone = true;
      w.fx.shake(4);
      sfx.hit();
      if (this.kind === 'hline') for (let x = w.arena.x0 + 40; x < w.arena.x1; x += 60) w.fluid.splat(x, this.y, R.range(-200, 200), 0, 40);
    }
  }
}

export abstract class Boss extends Enemy {
  bossKind: BossKind;
  intro = 1.2;
  phaseN = 1;
  depth: number;
  constructor(kind: BossKind, x: number, y: number, menace: number, depth: number, hp: number) {
    super(kind, x, y, menace, 'none');
    this.bossKind = kind;
    this.boss = true;
    this.depth = depth;
    this.hp = this.maxHp = hp;
    this.contactDmg = [18, 18, 22, 25, 28, 30, 34, 30][Math.min(7, depth)];
    this.shotDmg = [12, 12, 14, 16, 18, 20, 22, 20][Math.min(7, depth)];
    this.display = BOSS_NAMES[kind].name;
  }
  get phase() {
    const f = this.hp / this.maxHp;
    return f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
  }
  override invulnerable() {
    return this.intro > 0;
  }
  override update(w: RoomWorld, dt: number) {
    if (this.intro > 0) {
      this.intro -= dt;
      this.age += dt;
      this.anim += dt;
      this.introMove(w, dt);
      return;
    }
    const ph = this.phase;
    if (ph !== this.phaseN) {
      this.phaseN = ph;
      w.fx.text(this.x, this.y - this.r - 30, ph === 2 ? 'GRRR!' : 'RAAAAH!', 0xff4d6d, 34);
      w.fx.shake(8);
      sfx.bossRoar();
    }
    super.update(w, dt);
  }
  introMove(_w: RoomWorld, _dt: number) {}
  override die(w: RoomWorld) {
    if (this.dead) return;
    this.dead = true;
    w.onBossKilled(this);
  }
  livingMinions(w: RoomWorld) {
    return w.enemies.filter((e) => !e.boss && !e.dead).length;
  }
}

class BarnacleBill extends Boss {
  constructor(x: number, y: number, m: number, d: number) {
    super('barnacle', x, y, m, d, 190);
    this.swimmer = false;
    this.gravity = 900;
    this.r = 46;
    this.hw = 48;
    this.hh = 36;
    this.cd = 1.5;
    this.t = 4;
  }
  override introMove(w: RoomWorld, dt: number) {
    this.vy += this.gravity * dt;
    this.applyPhysics(w, dt, false);
  }
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    const ph = this.phase;
    this.cd -= dt;
    this.t -= dt;
    if (this.grounded) {
      if (this.state === 'air') {
        this.state = 'walk';
        w.fx.shake(10);
        w.fx.burst(this.x, this.y + this.hh, 'sand', undefined, 24);
        w.fx.text(this.x, this.y - 60, 'KA-THOOM!', 0xffc23d, 30);
        for (const s of [-1, 1]) for (let i = 0; i < 2 + ph; i++) this.shoot(w, s > 0 ? -0.08 * i : Math.PI + 0.08 * i, 260 + i * 40, { color: 0xb8a58a, r: 9 });
        if (ph === 3) for (let i = 0; i < 8; i++) this.shoot(w, (i / 8) * Math.PI * 2, 200, { color: 0xb8a58a });
        sfx.explosion();
      }
      const dx = p.x - this.x;
      this.vx += (Math.sign(dx) * (35 + ph * 15) * this.speedK - this.vx) * Math.min(1, 3 * dt);
      this.facing = Math.sign(dx) || 1;
    }
    if (this.cd < this.teleTime) this.tele = 1 - Math.max(0, this.cd) / this.teleTime;
    if (this.cd <= 0) {
      this.tele = 0;
      this.cd = 2.4 - ph * 0.3;
      const n = ph === 3 ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const tx = p.x + (i - (n - 1) / 2) * 90;
        const T = 1.0 + i * 0.08, g = 500;
        const vx = (tx - this.x) / T;
        const vy = (p.y - (this.y - 40) - 0.5 * g * T * T) / T;
        w.shots.push(new EnemyShot(this.x, this.y - 40, vx, vy, { color: 0xb8a58a, r: 9, gravity: g }));
      }
      sfx.enemyShoot();
    }
    if (ph >= 2 && this.t <= 0 && this.grounded) {
      this.t = 5.5 - ph;
      if (R.chance(0.5) && this.livingMinions(w) < 4) {
        for (const s of [-1, 1]) w.addEnemy(createEnemy('blob', this.x + s * 50, this.y - 50, this.menace, 'none'));
        w.fx.text(this.x, this.y - 70, 'BABIES!', 0x7ee0a0, 24);
      } else {
        this.vy = -620;
        this.vx = clamp(p.x - this.x, -300, 300);
        this.state = 'air';
      }
    }
  }
}

class QueenClam extends Boss {
  open = 0;
  emitA = 0;
  constructor(x: number, y: number, m: number, d: number) {
    super('queenclam', x, y, m, d, 210);
    this.swimmer = false;
    this.gravity = 900;
    this.r = 50;
    this.hw = 56;
    this.hh = 34;
    this.state = 'closed';
    this.t = 1.5;
  }
  override introMove(w: RoomWorld, dt: number) {
    this.vy += this.gravity * dt;
    this.applyPhysics(w, dt, false);
  }
  override invulnerable() {
    return this.intro > 0 || this.open < 0.5;
  }
  override knock() {}
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    const ph = this.phase;
    this.t -= dt;
    this.vx = 0;
    if (this.state === 'closed') {
      this.open = Math.max(0, this.open - dt * 4);
      if (this.t < this.teleTime) this.tele = 1 - Math.max(0, this.t) / this.teleTime;
      if (this.t <= 0) {
        this.state = 'open';
        this.t = 2.6 + ph * 0.4;
        this.cd = 0.3;
        this.tele = 0;
        sfx.splash();
      }
    } else {
      this.open = Math.min(1, this.open + dt * 5);
      this.cd -= dt;
      if (this.cd <= 0) {
        const a = Math.atan2(p.y - (this.y - 20), p.x - this.x);
        if (ph === 1 || ph === 3) {
          for (let i = -2; i <= 2; i++) this.shoot(w, a + i * 0.2, 210, { color: 0xfff6e8, r: 8 });
          this.cd = ph === 3 ? 0.9 : 0.7;
        }
        if (ph >= 2) {
          for (let i = 0; i < 3; i++) this.shoot(w, this.emitA + (i / 3) * Math.PI * 2, 170, { color: 0xffd6f0, r: 7 });
          this.emitA += 0.35;
          if (ph === 2) this.cd = 0.16;
        }
        if (ph === 3 && R.chance(0.25)) this.shoot(w, a, 140, { color: 0xff9ae0, r: 12, homing: 1.4, life: 5 });
        sfx.enemyShoot();
      }
      if (this.t <= 0) {
        this.state = 'closed';
        this.t = 2.1 - ph * 0.3;
      }
    }
  }
}

class Kelpie extends Boss {
  base: { x: number; y: number };
  constructor(x: number, y: number, m: number, d: number) {
    super('kelpie', x, y, m, d, 270);
    this.r = 42;
    this.hw = this.hh = 36;
    this.base = { x, y: y - 200 };
    this.t = 3;
    this.ghost = true;
  }
  override introMove(_w: RoomWorld, dt: number) {
    this.y += (this.base.y - this.y) * Math.min(1, dt * 2);
  }
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    const ph = this.phase;
    const a = w.arena;
    const cx = (a.x0 + a.x1) / 2;
    const tx = cx + Math.sin(this.age * 0.6) * (a.x1 - a.x0) * 0.32;
    const ty = a.y0 + (a.y1 - a.y0) * 0.32 + Math.sin(this.age * 1.3) * 60;
    this.steer(tx, ty, 120 + ph * 20, dt, 1.5);
    this.facing = Math.sign(p.x - this.x) || 1;
    this.cd -= dt;
    this.t -= dt;
    if (this.cd <= 0) {
      const a = Math.atan2(p.y - this.y, p.x - this.x);
      for (let i = -1; i <= 1; i++) this.shoot(w, a + i * 0.25, 200 + ph * 20, { color: 0x5cd65c, r: 8 });
      this.cd = 1.5 - ph * 0.25;
      sfx.enemyShoot();
    }
    if (ph >= 2 && this.t <= 0) {
      this.t = 3.2 - ph * 0.5;
      const warn = this.teleTime * 1.6;
      w.hazards.push(new Hazard('hline', 0, p.y, 34, warn, 0.35));
      if (ph === 3) w.hazards.push(new Hazard('vline', p.x + R.range(-60, 60), 0, 34, warn + 0.4, 0.35));
      if (ph === 3 && this.livingMinions(w) < 5) {
        for (let i = 0; i < 3; i++) w.addEnemy(createEnemy('jelly', this.x + R.range(-40, 40), this.y + 40, this.menace, 'none'));
      }
      w.fx.text(this.x, this.y - 60, 'TANGLE!', 0x5cd65c, 26);
    }
  }
  override applyPhysics(w: RoomWorld, dt: number) {
    const a = w.arena;
    this.x = clamp(this.x + this.vx * dt, a.x0 + 80, a.x1 - 80);
    this.y = clamp(this.y + this.vy * dt, a.y0 + 80, a.y1 - 140);
  }
}

class SirUrchin extends Boss {
  constructor(x: number, y: number, m: number, d: number) {
    super('sirurchin', x, y, m, d, 270);
    this.r = 40;
    this.hw = this.hh = 36;
    this.cd = 3;
    this.state = 'roll';
  }
  override introMove(_w: RoomWorld, dt: number) {
    this.y -= 120 * dt;
  }
  override knock() {}
  override think(w: RoomWorld, dt: number) {
    const ph = this.phase;
    const sp = 150 + ph * 50;
    this.cd -= dt;
    if (this.state === 'roll') {
      if (Math.hypot(this.vx, this.vy) < sp * 0.5) {
        const a = R.chance(0.5) ? -Math.PI / 4 : (-3 * Math.PI) / 4;
        this.vx = Math.cos(a) * sp;
        this.vy = Math.sin(a) * sp;
      }
      const l = Math.hypot(this.vx, this.vy);
      this.vx = (this.vx / l) * sp;
      this.vy = (this.vy / l) * sp;
      if (ph === 3 && R.chance(dt * 3)) w.shots.push(new EnemyShot(this.x, this.y, 0, 0, { color: 0x7a4dff, r: 8, life: 2.5 }));
      if (this.cd <= 0) {
        this.state = 'brace';
        this.t = this.teleTime;
        this.saved = [this.vx, this.vy];
      }
    } else if (this.state === 'brace') {
      this.t -= dt;
      this.tele = 1 - this.t / this.teleTime;
      this.vx *= 0.8;
      this.vy *= 0.8;
      if (this.t <= 0) {
        const n = 10 + ph * 3;
        for (let wave = 0; wave < (ph >= 2 ? 2 : 1); wave++)
          for (let i = 0; i < n; i++) this.shoot(w, (i / n) * Math.PI * 2 + wave * (Math.PI / n), 190 + wave * 70, { color: 0x7a4dff });
        w.fx.text(this.x, this.y - 60, 'SHING!', 0xb06bff, 28);
        sfx.enemyShoot();
        this.state = 'roll';
        this.tele = 0;
        this.cd = 3 - ph * 0.5;
        this.vx = this.saved[0];
        this.vy = this.saved[1];
      }
    }
  }
  saved: [number, number] = [0, 0];
  override applyPhysics(w: RoomWorld, dt: number) {
    const res = { x: this.x + this.vx * dt, y: this.y + this.vy * dt };
    if (w.solidAt(res.x + Math.sign(this.vx) * this.hw, this.y)) {
      this.vx = -this.vx;
      w.fx.shake(3);
      w.fluid.blast(this.x, this.y, 150, 80);
    } else this.x = res.x;
    if (w.solidAt(this.x, res.y + Math.sign(this.vy) * this.hh)) {
      this.vy = -this.vy;
      w.fx.shake(3);
    } else this.y = res.y;
  }
}

class Admiral extends Boss {
  constructor(x: number, y: number, m: number, d: number) {
    super('admiral', x, y, m, d, 350);
    this.swimmer = false;
    this.gravity = 900;
    this.r = 48;
    this.hw = 50;
    this.hh = 36;
    this.cd = 1.8;
    this.t = 5;
  }
  override introMove(w: RoomWorld, dt: number) {
    this.vy += this.gravity * dt;
    this.applyPhysics(w, dt, false);
  }
  override knock() {}
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    const ph = this.phase;
    this.cd -= dt;
    this.t -= dt;
    if (this.state === 'windup') {
      this.t -= dt;
      this.tele = Math.min(1, this.tele + dt / this.teleTime);
      this.vx = 0;
      if (this.tele >= 1) {
        this.state = 'charge';
        this.vx = this.facing * (420 + ph * 40);
        this.tele = 0;
        w.fx.text(this.x, this.y - 60, 'CHAAARGE!', 0xd9583b, 28);
      }
      return;
    }
    if (this.state === 'charge') return;
    if (this.grounded) {
      const dx = p.x - this.x;
      this.vx += (Math.sign(dx) * 50 * this.speedK - this.vx) * Math.min(1, 3 * dt);
      this.facing = Math.sign(dx) || 1;
    }
    if (this.cd <= 0) {
      this.cd = 2.6 - ph * 0.35;
      for (let i = 0; i < 3; i++) {
        const tx = p.x + (i - 1) * 110;
        const T = 1.1, g = 440;
        const vx = (tx - this.x) / T;
        const vy = (p.y - (this.y - 50) - 0.5 * g * T * T) / T;
        w.shots.push(new EnemyShot(this.x + this.facing * 30, this.y - 50, vx, vy, { color: 0x2a2a38, r: 12, gravity: g }));
      }
      w.fx.text(this.x, this.y - 80, 'FIRE!', 0xffc43d, 26);
      sfx.explosion();
    }
    if (ph >= 2 && this.t <= 0 && this.grounded) {
      this.t = 5 - ph * 0.6;
      if (ph === 3 && R.chance(0.5)) {
        if (this.livingMinions(w) < 3) for (const s of [-1, 1]) w.addEnemy(createEnemy('crabby', this.x + s * 70, this.y - 30, this.menace, 'floor'));
        // Broadside volley.
        for (let i = 0; i < 5; i++) {
          const a = w.arena, mid = (a.x0 + a.x1) / 2;
          const y = a.y0 + 60 + i * ((a.y1 - a.y0 - 120) / 4);
          w.shots.push(new EnemyShot(p.x > mid ? a.x0 + 20 : a.x1 - 20, y, p.x > mid ? 240 : -240, 0, { color: 0x2a2a38, r: 10, ghost: true, life: 6 }));
        }
        w.fx.text((w.arena.x0 + w.arena.x1) / 2, w.arena.y0 + 80, 'BROADSIDE!', 0xffc43d, 34);
      } else {
        this.state = 'windup';
        this.tele = 0;
      }
    }
  }
  override onWall(w: RoomWorld) {
    if (this.state === 'charge') {
      this.state = 'walk';
      this.stun = 1.1;
      w.fx.shake(12);
      w.fx.text(this.x, this.y - 60, 'CLANG!', 0xffffff, 30);
      sfx.explosion();
      for (let i = 0; i < 6; i++) {
        w.shots.push(new EnemyShot(R.range(w.arena.x0 + 60, w.arena.x1 - 60), w.arena.y0 + 30, 0, 40, { color: 0x6a5a4a, r: 9, gravity: 260, life: 5 }));
      }
    }
  }
}

class TreasureMimic extends Boss {
  constructor(x: number, y: number, m: number, d: number) {
    super('treasuremimic', x, y, m, d, 350);
    this.swimmer = false;
    this.gravity = 1000;
    this.r = 46;
    this.hw = 48;
    this.hh = 38;
    this.cd = 1.2;
  }
  override introMove(w: RoomWorld, dt: number) {
    this.vy += this.gravity * dt;
    this.applyPhysics(w, dt, false);
  }
  override knock() {}
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    const ph = this.phase;
    this.cd -= dt;
    if (this.grounded) {
      this.vx *= 0.7;
      if (this.state === 'air') {
        this.state = 'ground';
        w.fx.shake(ph === 3 ? 10 : 5);
        w.fx.burst(this.x, this.y + this.hh, 'sand', undefined, 16);
        const n = 7;
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.28;
          this.shoot(w, a, 330, { color: 0xffc43d, r: 8, gravity: 380, life: 5 });
        }
        if (ph === 3) for (let i = 0; i < 12; i++) this.shoot(w, (i / 12) * Math.PI * 2, 190, { color: 0xffe14d });
        if (ph >= 2 && R.chance(0.6)) {
          // Fake coins: sit on the floor then burst.
          for (let i = 0; i < 3; i++) {
            const s = new EnemyShot(this.x + R.range(-200, 200), this.y - 80, R.range(-60, 60), 0, { color: 0xffe14d, r: 9, gravity: 500, life: 1.6 });
            (s as any).burst = true;
            w.shots.push(s);
          }
        }
        sfx.coin();
      }
      if (this.cd < this.teleTime) this.tele = 1 - Math.max(0, this.cd) / this.teleTime;
      if (this.cd <= 0) {
        this.state = 'air';
        this.tele = 0;
        this.vy = ph === 3 ? -700 : -520;
        this.vx = clamp(p.x - this.x, -1, 1) * (180 + ph * 40);
        this.facing = Math.sign(this.vx) || 1;
        this.cd = 1.3 - ph * 0.2;
      }
    }
  }
}

// ── Coral Carnival ───────────────────────────────────────────────

/** A big octopus in a top hat who juggles bouncing balls and calls in the act. */
class Ringmaster extends Boss {
  base = { x: 0, y: 0 };
  constructor(x: number, y: number, m: number, d: number) {
    super('ringmaster', x, y, m, d, 430);
    this.r = 44;
    this.hw = this.hh = 38;
    this.cd = 1.5;
    this.t = 4;
    this.base = { x, y: y - 160 };
  }
  override introMove(_w: RoomWorld, dt: number) {
    this.y += (this.base.y - this.y) * Math.min(1, dt * 2);
  }
  override knock() {}
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    const a = w.arena;
    const ph = this.phase;
    const cx = (a.x0 + a.x1) / 2;
    this.steer(cx + Math.sin(this.age * 0.5) * (a.x1 - a.x0) * 0.3, a.y0 + (a.y1 - a.y0) * 0.35 + Math.sin(this.age * 1.7) * 30, 110 + ph * 20, dt, 1.5);
    this.facing = Math.sign(p.x - this.x) || 1;
    this.cd -= dt;
    this.t -= dt;
    if (this.cd < this.teleTime) this.tele = 1 - Math.max(0, this.cd) / this.teleTime;
    if (this.cd <= 0) {
      this.tele = 0;
      this.cd = 2 - ph * 0.3;
      // Juggle: bouncing balls lobbed at her.
      const n = 2 + ph;
      for (let i = 0; i < n; i++) {
        const vx = clamp(p.x - this.x, -300, 300) + (i - (n - 1) / 2) * 90;
        w.shots.push(new EnemyShot(this.x, this.y - 20, vx, -R.range(200, 320), { color: R.pick([0xff5cae, 0xffe14d, 0x5cf2ff, 0x9dff5c]), r: 11, gravity: 420, life: 7, bounce: 4, dmg: this.shotDmg }));
      }
      w.fx.text(this.x, this.y - 70, 'ALLEZ-OOP!', 0xff5cae, 24);
      sfx.enemyShoot();
    }
    if (this.t <= 0) {
      this.t = 5.5 - ph * 0.8;
      if (ph >= 2 && this.livingMinions(w) < 3) {
        // Bring on the next act.
        for (const s of [-1, 1]) w.addEnemy(createEnemy(ph === 3 ? 'seahorse' : 'nettle', this.x + s * 90, this.y + 40, this.menace, 'none'));
        w.fx.text(this.x, this.y - 70, 'AND NOW...!', 0xffe14d, 26);
      } else {
        // Ring of fire with one gap to slip through.
        const gap = Math.atan2(p.y - this.y, p.x - this.x) + R.range(-0.6, 0.6);
        const k = 22 + ph * 4;
        for (let i = 0; i < k; i++) {
          const ang = (i / k) * Math.PI * 2;
          if (Math.abs(wrapAngle(ang - gap)) < 0.35) continue;
          this.shoot(w, ang, 170, { color: 0xff7a3d, r: 8 });
        }
        sfx.explosion();
      }
    }
  }
}

/** Three jester jellies bound together, spinning, tumbling and firing in turn. */
class Jesters extends Boss {
  spin = 0;
  turn = 0;
  constructor(x: number, y: number, m: number, d: number) {
    super('jesters', x, y, m, d, 420);
    this.r = 40;
    this.hw = this.hh = 34;
    this.cd = 1.2;
    this.t = 3;
  }
  override introMove(_w: RoomWorld, dt: number) {
    this.y -= 110 * dt;
    this.spin += dt * 2;
  }
  override knock() {}
  /** World position of head i. */
  head(i: number) {
    const a = this.spin + (i / 3) * Math.PI * 2;
    return { x: this.x + Math.cos(a) * 30, y: this.y + Math.sin(a) * 30 };
  }
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    const ph = this.phase;
    this.spin += dt * (1.5 + ph * 1.2);
    this.cd -= dt;
    this.t -= dt;
    if (this.state === 'tumble') {
      if (this.t <= 0) {
        this.state = 'idle';
        this.t = 4 - ph * 0.6;
      }
      return;
    }
    this.steer(p.x + Math.sin(this.age * 0.7) * 200, p.y - 140, 100 + ph * 25, dt, 1.2);
    if (this.cd <= 0) {
      this.cd = (ph === 3 ? 0.35 : 0.7) - this.menace * 0.1;
      const h = this.head(this.turn++ % 3);
      const a = Math.atan2(p.y - h.y, p.x - h.x);
      const c = [0xff5cae, 0xffe14d, 0x5cf2ff][this.turn % 3];
      if (ph === 3) for (let i = 0; i < 3; i++) this.shoot(w, this.spin * 2 + (i / 3) * Math.PI * 2, 200, { color: c });
      else for (const o of ph === 2 ? [-0.18, 0.18] : [0]) this.shoot(w, a + o, 240, { color: c, r: 8 });
      sfx.enemyShoot();
    }
    if (this.t <= 0 && ph >= 2) {
      // Tumble straight through the arena.
      const a = Math.atan2(p.y - this.y, p.x - this.x);
      this.vx = Math.cos(a) * 520;
      this.vy = Math.sin(a) * 520;
      this.state = 'tumble';
      this.t = 0.8;
      w.fx.text(this.x, this.y - 60, 'HA-HA-HA!', 0xffe14d, 26);
    }
  }
  override onWall() {
    if (this.state === 'tumble') {
      this.vx = -this.vx;
      this.vy = -this.vy;
    }
  }
}

// ── Twilight Trench ──────────────────────────────────────────────

/** A huge anglerfish: in the dark only her lure shines. */
class MotherAngler extends Boss {
  dark = 0;
  constructor(x: number, y: number, m: number, d: number) {
    super('motherangler', x, y, m, d, 520);
    this.r = 52;
    this.hw = this.hh = 44;
    this.cd = 2;
    this.t = 6;
  }
  override introMove(_w: RoomWorld, dt: number) {
    this.y -= 80 * dt;
  }
  override knock() {}
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    const ph = this.phase;
    this.facing = Math.sign(p.x - this.x) || this.facing;
    this.t -= dt;
    this.cd -= dt;
    // Lights out / lights on.
    const wantDark = this.state === 'dark' ? 1 : 0;
    this.dark += (wantDark - this.dark) * Math.min(1, dt * 2);
    w.bossDark = this.dark;
    if (this.state === 'dark') {
      // Stalk, then lunge.
      if (this.cd < this.teleTime) this.tele = 1 - Math.max(0, this.cd) / this.teleTime;
      if (this.cd <= 0) {
        this.tele = 0;
        const a = Math.atan2(p.y - this.y, p.x - this.x);
        this.vx = Math.cos(a) * (480 + ph * 60);
        this.vy = Math.sin(a) * (480 + ph * 60);
        this.cd = 1.6 - ph * 0.2;
        w.fx.text(this.x, this.y - 70, 'SNAP!', 0xff3d5a, 28);
        sfx.bossRoar();
      } else this.steer(p.x, p.y, 70, dt, 1);
      this.vx *= Math.exp(-1.2 * dt);
      this.vy *= Math.exp(-1.2 * dt);
      if (this.t <= 0) {
        this.state = 'light';
        this.t = 6;
      }
      return;
    }
    const a = w.arena;
    this.steer((a.x0 + a.x1) / 2 + Math.sin(this.age * 0.4) * 260, a.y0 + (a.y1 - a.y0) * 0.4, 80, dt, 1);
    if (this.cd <= 0) {
      this.cd = 1.8 - ph * 0.25;
      const lure = { x: this.x + this.facing * 70, y: this.y - 64 };
      for (let i = 0; i < 2 + ph; i++) {
        const s = new EnemyShot(lure.x, lure.y, R.range(-120, 120), R.range(-120, 40), { color: 0x9ef0ff, r: 9, homing: 1.2 + this.menace, life: 5, dmg: this.shotDmg });
        w.shots.push(s);
      }
      sfx.enemyShoot();
    }
    if (this.t <= 0) {
      this.state = 'dark';
      this.t = 5 + ph;
      this.cd = 1.4;
      if (ph >= 2 && this.livingMinions(w) < 3) for (let i = 0; i < ph; i++) w.addEnemy(createEnemy('lanternfish', this.x + R.range(-120, 120), this.y - 60, this.menace, 'none'));
      w.fx.text(this.x, this.y - 70, 'LIGHTS OUT', 0x9ef0ff, 26);
    }
  }
  override die(w: RoomWorld) {
    w.bossDark = 0;
    super.die(w);
  }
}

/** A long colonial chain: the head steers, every segment can sting. */
class Siphonophore extends Boss {
  segs: { x: number; y: number }[] = [];
  trail: { x: number; y: number }[] = [];
  constructor(x: number, y: number, m: number, d: number) {
    super('siphonophore', x, y, m, d, 520);
    this.r = 26;
    this.hw = this.hh = 22;
    this.cd = 1;
    for (let i = 0; i < 14; i++) this.segs.push({ x, y: y + i * 4 });
  }
  override introMove(w: RoomWorld, dt: number) {
    this.y -= 100 * dt;
    this.follow(w);
  }
  override knock() {}
  private follow(_w: RoomWorld) {
    this.trail.unshift({ x: this.x, y: this.y });
    if (this.trail.length > 400) this.trail.length = 400;
    const gap = 9;
    for (let i = 0; i < this.segs.length; i++) {
      const t = this.trail[Math.min(this.trail.length - 1, (i + 1) * gap)];
      if (t) this.segs[i] = { x: t.x, y: t.y };
    }
  }
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    const ph = this.phase;
    const a = w.arena;
    // Sweep the arena in a lazy figure eight, snaking toward her more as it angers.
    const cx = (a.x0 + a.x1) / 2, cy = (a.y0 + a.y1) / 2;
    const fx = cx + Math.sin(this.age * 0.6) * (a.x1 - a.x0) * 0.38;
    const fy = cy + Math.sin(this.age * 1.2) * (a.y1 - a.y0) * 0.28;
    const k = ph === 1 ? 0.15 : ph === 2 ? 0.35 : 0.55;
    this.steer(fx + (p.x - fx) * k, fy + (p.y - fy) * k, 170 + ph * 30, dt, 2);
    this.follow(w);
    this.cd -= dt;
    if (this.cd <= 0) {
      this.cd = 1.6 - ph * 0.3;
      // A ripple of stinging shots runs down the colony.
      const step = ph === 3 ? 2 : 3;
      for (let i = 1; i < this.segs.length; i += step) {
        const s = this.segs[i];
        const ang = Math.atan2(p.y - s.y, p.x - s.x);
        this.shoot(w, ang, 150 + ph * 20, { color: 0xb06bff, r: 6 });
      }
      sfx.enemyShoot();
    }
    // The whole colony stings on contact.
    for (const s of this.segs) if ((s.x - p.x) ** 2 + (s.y - p.y) ** 2 < 26 * 26) {
      w.hurtPlayer(this.contactDmg * 0.6, this.display);
      break;
    }
  }
  override applyPhysics(w: RoomWorld, dt: number) {
    this.x = clamp(this.x + this.vx * dt, w.arena.x0 + 40, w.arena.x1 - 40);
    this.y = clamp(this.y + this.vy * dt, w.arena.y0 + 40, w.arena.y1 - 40);
  }
}

// ── The Abyss ────────────────────────────────────────────────────

/** The thing at the bottom: a ring of teeth in the floor that swallows the current. */
class HollowMaw extends Boss {
  open = 0;
  constructor(x: number, y: number, m: number, d: number) {
    super('hollowmaw', x, y + 20, m, d, 760);
    this.r = 64;
    this.hw = 70;
    this.hh = 40;
    this.cd = 2;
    this.t = 3;
    this.state = 'wait';
  }
  override knock() {}
  override introMove(_w: RoomWorld, dt: number) {
    this.open = Math.min(0.6, this.open + dt * 0.4);
  }
  override applyPhysics() {}
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    const ph = this.phase;
    const a = w.arena;
    this.t -= dt;
    this.cd -= dt;
    if (this.state === 'inhale') {
      this.open = Math.min(1, this.open + dt * 2);
      const d = Math.max(1, dist(p.x, p.y, this.x, this.y));
      const pull = (360 + ph * 120) * dt;
      p.vx += ((this.x - p.x) / d) * pull * 4;
      p.vy += ((this.y - p.y) / d) * pull * 4;
      if (R.chance(dt * 30)) w.fluid.splat(p.x, p.y, (this.x - p.x), (this.y - p.y), 60);
      if (d < this.r + 20) w.hurtPlayer(this.contactDmg, this.display);
      if (this.t <= 0) {
        this.state = 'spit';
        this.t = 0.4;
      }
      return;
    }
    if (this.state === 'spit') {
      this.t -= 0;
      if (this.t <= 0) {
        // Spit teeth in a fan.
        const n = 9 + ph * 3;
        for (let i = 0; i < n; i++) this.shoot(w, -Math.PI + 0.15 + (i / (n - 1)) * (Math.PI - 0.3), 260 + ph * 30, { color: 0xe8e4d8, r: 7 });
        w.fx.shake(8);
        sfx.explosion();
        this.state = 'wait';
        this.t = 4 - ph * 0.6;
      }
      return;
    }
    this.open = Math.max(0.35, this.open - dt * 0.5);
    if (this.cd <= 0) {
      this.cd = 2.2 - ph * 0.4;
      // Tongue lashes: telegraphed columns rising from the floor.
      const n = ph;
      for (let i = 0; i < n; i++) w.hazards.push(new Hazard('vline', clamp(p.x + R.range(-80, 80) * i, a.x0 + 40, a.x1 - 40), 0, 40, this.teleTime * 1.5 + i * 0.2, 0.4, 0x8a1a3a, this.display, this.shotDmg));
      if (ph === 3) for (let i = 0; i < 10; i++) this.shoot(w, (i / 10) * Math.PI * 2 + this.age, 180, { color: 0xff3d6a });
    }
    if (this.t <= 0) {
      if (ph >= 2 && this.livingMinions(w) < 2 && R.chance(0.4)) {
        for (const s of [-1, 1]) w.addEnemy(createEnemy('viperfish', this.x + s * 120, this.y - 140, this.menace, 'none'));
        this.t = 3;
      } else {
        this.state = 'inhale';
        this.t = 2 + ph * 0.4;
        w.fx.text(this.x, this.y - 90, 'HHHHHHHH...', 0xb06bff, 28);
        sfx.bossRoar();
      }
    }
  }
}

// ── The Tank ─────────────────────────────────────────────────────

/** The final boss: a giant human hand reaching down from above the water. */
class TheHand extends Boss {
  home = { x: 0, y: 0 };
  reach = 0;
  target = { x: 0, y: 0 };
  slosh = 0;
  constructor(x: number, y: number, m: number, d: number) {
    super('hand', x, y, m, d, 900);
    this.r = 56;
    this.hw = this.hh = 48;
    this.cd = 2;
    this.t = 3;
    this.state = 'hover';
  }
  override knock() {}
  override applyPhysics() {}
  override introMove(w: RoomWorld, dt: number) {
    this.home = { x: (w.arena.x0 + w.arena.x1) / 2, y: w.arena.y0 + 90 };
    this.x += (this.home.x - this.x) * Math.min(1, dt * 2);
    this.y += (this.home.y - this.y) * Math.min(1, dt * 2);
  }
  override think(w: RoomWorld, dt: number) {
    const p = w.player;
    const a = w.arena;
    const ph = this.phase;
    this.home = { x: clamp(p.x, a.x0 + 120, a.x1 - 120), y: a.y0 + 90 };
    this.t -= dt;
    // The tank sloshes when slapped: a strong current swings left and right.
    if (this.slosh > 0) {
      this.slosh -= dt;
      const push = Math.sin(this.slosh * 2.4) * 420;
      p.vx += push * dt * 3;
      if (R.chance(dt * 20)) w.fluid.splat(p.x, p.y, push, 0, 120);
    }
    switch (this.state) {
      case 'hover':
        this.x += (this.home.x - this.x) * Math.min(1, dt * 2);
        this.y += (this.home.y - this.y) * Math.min(1, dt * 3);
        if (this.t <= 0) this.pickAttack(w, ph);
        break;
      case 'poke': {
        // Shadow telegraph, then a fast jab straight down.
        this.reach = Math.min(1, this.reach + dt / this.teleTime);
        this.tele = this.reach;
        this.x += (this.target.x - this.x) * Math.min(1, dt * 6);
        if (this.reach >= 1) {
          this.state = 'jab';
          this.t = 0.5;
          this.tele = 0;
        }
        break;
      }
      case 'jab':
        this.y += (this.target.y - this.y) * Math.min(1, dt * 14);
        if (this.t <= 0) this.retreat();
        break;
      case 'grab':
        this.y += (this.target.y - this.y) * Math.min(1, dt * 4);
        this.x += (this.target.x - this.x) * Math.min(1, dt * 4);
        if (this.t <= 0) this.retreat();
        break;
      default:
        if (this.t <= 0) this.retreat();
    }
  }
  private retreat() {
    this.state = 'hover';
    this.t = 1.6 - this.phase * 0.25;
    this.reach = 0;
    this.tele = 0;
  }
  private pickAttack(w: RoomWorld, ph: number) {
    const p = w.player;
    const a = w.arena;
    const opts = ph === 1 ? ['poke', 'tap', 'food'] : ph === 2 ? ['poke', 'grab', 'net', 'tap'] : ['poke', 'grab', 'drop', 'slosh', 'net'];
    const pick = R.pick(opts);
    if (pick === 'poke') {
      this.state = 'poke';
      this.target = { x: p.x, y: clamp(p.y + 30, a.y0 + 140, a.y1 - 60) };
      this.reach = 0;
      w.hazards.push(new Hazard('vline', p.x, 0, 70, this.teleTime + 0.1, 0.45, 0xffc8a0, 'The Hand', this.shotDmg + 6));
      w.fx.text(p.x, a.y0 + 40, 'poke?', 0xffffff, 22);
    } else if (pick === 'grab') {
      this.state = 'grab';
      this.target = { x: p.x, y: clamp(p.y - 20, a.y0 + 120, a.y1 - 60) };
      this.t = 1.4;
      w.hazards.push(new Hazard('circle', p.x, p.y, 90, 1.0, 0.4, 0xffc8a0, 'The Hand', this.shotDmg + 10));
      w.fx.text(p.x, p.y - 100, 'GOTCHA!', 0xffc8a0, 26);
    } else if (pick === 'tap') {
      this.state = 'tap';
      this.t = 1.2;
      // Knuckles on the glass: shockwave rings roll in from the wall.
      const side = p.x < (a.x0 + a.x1) / 2 ? a.x0 + 30 : a.x1 - 30;
      for (let ring = 0; ring < 2 + ph; ring++)
        for (let i = 0; i < 9; i++) {
          const ang = (side < p.x ? 0 : Math.PI) + ((i - 4) / 8) * 1.8;
          const s = new EnemyShot(side, p.y + R.range(-60, 60), Math.cos(ang) * (180 + ring * 50), Math.sin(ang) * (180 + ring * 50), { color: 0xe8fbff, r: 7, dmg: this.shotDmg, life: 4 });
          w.shots.push(s);
        }
      w.fx.shake(10);
      w.fx.text(side, p.y - 80, 'TAP TAP TAP', 0xffffff, 26);
      sfx.explosion();
    } else if (pick === 'food') {
      this.state = 'food';
      this.t = 1.5;
      for (let i = 0; i < 12; i++) w.shots.push(new EnemyShot(R.range(a.x0 + 60, a.x1 - 60), a.y0 + 40, R.range(-20, 20), 40, { color: 0xffb347, r: 6, gravity: 60, life: 9, dmg: this.shotDmg * 0.6 }));
      w.fx.text(this.x, this.y + 60, 'Fish food!', 0xffb347, 22);
    } else if (pick === 'net') {
      this.state = 'net';
      this.t = 1.6;
      w.hazards.push(new Hazard('hline', 0, p.y, 60, this.teleTime * 1.8, 0.5, 0x3dd85c, 'the net', this.shotDmg + 8));
      w.fx.text(p.x, p.y - 70, 'NET!', 0x3dd85c, 26);
    } else if (pick === 'drop') {
      this.state = 'drop';
      this.t = 1.6;
      for (let i = 0; i < 5; i++)
        w.shots.push(new EnemyShot(clamp(p.x + R.range(-260, 260), a.x0 + 40, a.x1 - 40), a.y0 + 30, 0, 60, { color: R.pick([0xffe14d, 0xdff6ff, 0xff7a3d]), r: 16, gravity: 300, life: 6, dmg: this.shotDmg + 4 }));
      w.fx.text(this.x, this.y + 60, 'Here, have a duck!', 0xffe14d, 22);
    } else {
      this.state = 'slosh';
      this.t = 1;
      this.slosh = 4;
      w.fx.shake(14);
      w.fx.text(this.x, this.y + 70, 'SLAP!', 0xffc8a0, 34);
      sfx.bossRoar();
    }
  }
}

export function createBoss(kind: BossKind, x: number, y: number, menace: number, depth: number): Boss {
  switch (kind) {
    case 'barnacle': return new BarnacleBill(x, y, menace, depth);
    case 'queenclam': return new QueenClam(x, y, menace, depth);
    case 'kelpie': return new Kelpie(x, y, menace, depth);
    case 'sirurchin': return new SirUrchin(x, y, menace, depth);
    case 'admiral': return new Admiral(x, y, menace, depth);
    case 'treasuremimic': return new TreasureMimic(x, y, menace, depth);
    case 'ringmaster': return new Ringmaster(x, y, menace, depth);
    case 'jesters': return new Jesters(x, y, menace, depth);
    case 'motherangler': return new MotherAngler(x, y, menace, depth);
    case 'siphonophore': return new Siphonophore(x, y, menace, depth);
    case 'hollowmaw': return new HollowMaw(x, y, menace, depth);
    case 'hand': return new TheHand(x, y, menace, depth);
  }
}
