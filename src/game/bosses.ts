// Bosses. Each guards The Crack and runs 3 phases by HP.

import { clamp, dist } from '../core/math';
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
    if (hit) w.hurtPlayer(15, 'Kelpie the Tangler');
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
    this.contactDmg = depth >= 3 ? 25 : depth === 2 ? 22 : 18;
    this.shotDmg = depth >= 3 ? 16 : depth === 2 ? 14 : 12;
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

export function createBoss(kind: BossKind, x: number, y: number, menace: number, depth: number): Boss {
  switch (kind) {
    case 'barnacle': return new BarnacleBill(x, y, menace, depth);
    case 'queenclam': return new QueenClam(x, y, menace, depth);
    case 'kelpie': return new Kelpie(x, y, menace, depth);
    case 'sirurchin': return new SirUrchin(x, y, menace, depth);
    case 'admiral': return new Admiral(x, y, menace, depth);
    case 'treasuremimic': return new TreasureMimic(x, y, menace, depth);
  }
}
