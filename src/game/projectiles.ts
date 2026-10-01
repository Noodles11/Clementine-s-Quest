// Player ink shots (composable flags), enemy shots, beams, ink bombs, zones.

import { TILE } from '../config';
import { clamp, dist, mixColor } from '../core/math';
import { cosmetic as R } from '../core/rng';
import { sfx } from '../core/audio';
import { Entity } from './entity';
import type { ShotFlag } from './items';
import type { SynergyId, TransformationId } from './synergies';
import type { RoomWorld } from './room';
import type { Enemy } from './enemies';

export interface BubbleSpec {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  radius: number;
  range: number;
  flags: Set<ShotFlag>;
  synergies: Set<SynergyId>;
  transformations: Set<TransformationId>;
  luck: number;
  gen?: number;
  pearl?: number;
  mini?: boolean;
  wavePhase?: number;
  spiralDir?: number;
  color?: number;
}

export class Bubble extends Entity {
  dmg: number;
  baseDmg: number;
  radius0: number;
  range: number;
  traveled = 0;
  flags: Set<ShotFlag>;
  syn: Set<SynergyId>;
  trans: Set<TransformationId>;
  luck: number;
  gen: number;
  pearl: number;
  mini: boolean;
  hit = new Set<number>();
  bounces = 0;
  returning = false;
  // Path parameters for spiral / wave movement.
  bx: number;
  by: number;
  ox = 0;
  oy = 0;
  dirx: number;
  diry: number;
  speed: number;
  wavePhase: number;
  spiralDir: number;
  spiralAngle: number;
  color: number;
  popped = false;
  hue = R.next();

  constructor(s: BubbleSpec) {
    super();
    this.x = this.bx = s.x;
    this.y = this.by = s.y;
    this.vx = s.vx;
    this.vy = s.vy;
    this.dmg = this.baseDmg = s.dmg;
    this.r = this.radius0 = s.radius;
    this.range = s.range;
    this.flags = s.flags;
    this.syn = s.synergies;
    this.trans = s.transformations;
    this.luck = s.luck;
    this.gen = s.gen ?? 0;
    this.pearl = s.pearl ?? 0;
    this.mini = s.mini ?? false;
    this.speed = Math.hypot(s.vx, s.vy) || 1;
    this.dirx = s.vx / this.speed;
    this.diry = s.vy / this.speed;
    this.wavePhase = s.wavePhase ?? 0;
    this.spiralDir = s.spiralDir ?? 1;
    this.spiralAngle = Math.atan2(s.vy, s.vx);
    this.color = s.color ?? 0xffb347;
    this.ghost = this.flags.has('spectral');
    this.hw = this.hh = 3;
    this.ink = mixColor(0x120a1a, this.color, 0.2);
  }

  /** Clementine's shots are blobs of ink, tinted by her items. */
  ink: number;

  /** Leave an ink stain where the shot hits rock (n = surface normal). */
  private stain(w: RoomWorld, nx: number, ny: number, scale = 1) {
    if (this.pearl > 0) return;
    w.addInkMark(this.x, this.y, nx, ny, this.r * scale, this.ink);
  }

  private surfaceNormal(w: RoomWorld, nx: number, ny: number): [number, number] {
    const hx = w.solidAt(nx, this.y), hy = w.solidAt(this.x, ny);
    if (hy && (!hx || Math.abs(this.vy) >= Math.abs(this.vx))) return [0, -Math.sign(this.vy) || -1];
    return [-Math.sign(this.vx) || -1, 0];
  }

  has(f: ShotFlag) {
    return this.flags.has(f);
  }

  update(w: RoomWorld, dt: number) {
    this.age += dt;
    const p = w.player;
    // Homing: steer toward the nearest enemy.
    if (this.has('homing') && !this.returning) {
      const wisp = this.syn.has('wisp');
      const t = w.nearestEnemy(this.x, this.y, wisp ? 520 : 340);
      if (t) {
        const a = Math.atan2(t.y - this.y, t.x - this.x);
        const cur = Math.atan2(this.vy, this.vx);
        let da = a - cur;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        const turn = (wisp ? 9 : 5) * dt;
        const na = cur + clamp(da, -turn, turn);
        const sp = Math.hypot(this.vx, this.vy);
        this.vx = Math.cos(na) * sp;
        this.vy = Math.sin(na) * sp;
        this.dirx = Math.cos(na);
        this.diry = Math.sin(na);
      }
    }
    // Boomerang: head back after most of the range.
    if (this.has('boomerang')) {
      if (!this.returning && this.traveled > this.range * 0.55) {
        this.returning = true;
        this.hit.clear();
      }
      if (this.returning) {
        const a = Math.atan2(p.y - this.by, p.x - this.bx);
        const sp = this.speed * 1.1;
        this.vx += (Math.cos(a) * sp - this.vx) * Math.min(1, dt * 6);
        this.vy += (Math.sin(a) * sp - this.vy) * Math.min(1, dt * 6);
        if (this.syn.has('tunarang')) this.r = Math.min(this.radius0 * 2.2, this.r + dt * 20);
        if (dist(this.x, this.y, p.x, p.y) < 22) {
          this.dead = true;
          return;
        }
      }
    }
    // Growth.
    if (this.has('grow')) {
      const k = this.syn.has('cellbloom') ? 1.3 : 1;
      this.r = Math.min(this.radius0 * 3.2, this.r + dt * 14 * k);
      this.dmg = this.baseDmg * (0.8 + (this.r / this.radius0) * 0.45);
    }

    const stepX = this.vx * dt, stepY = this.vy * dt;
    this.traveled += Math.hypot(stepX, stepY);

    if (this.has('spiral')) {
      // Outward spiral around the launch point.
      this.spiralAngle += this.spiralDir * dt * Math.max(1.2, 5 - this.age * 3);
      const sp = this.speed * 0.9;
      this.vx = Math.cos(this.spiralAngle) * sp * 0.55 + this.dirx * sp * 0.6;
      this.vy = Math.sin(this.spiralAngle) * sp * 0.55 + this.diry * sp * 0.6;
    }
    let nbx = this.bx + stepX, nby = this.by + stepY;
    if (this.has('wave')) {
      const amp = 16;
      const off = Math.sin(this.age * 13 + this.wavePhase) * amp;
      this.ox = -this.diry * off;
      this.oy = this.dirx * off;
    }
    const nx = nbx + this.ox, ny = nby + this.oy;

    // Terrain.
    if (!this.ghost && w.solidAt(nx, ny)) {
      if (this.has('bounce') && this.bounces < 6) {
        this.bounces++;
        this.stain(w, ...this.surfaceNormal(w, nx, ny), 0.6);
        const hx = w.solidAt(nx, this.y), hy = w.solidAt(this.x, ny);
        if (hx || !hy) this.vx = -this.vx;
        if (hy || !hx) this.vy = -this.vy;
        this.dirx = Math.sign(this.vx) * Math.abs(this.dirx);
        this.diry = Math.sign(this.vy) * Math.abs(this.diry);
        this.spiralAngle = Math.atan2(this.vy, this.vx);
        w.fx.burst(this.x, this.y, 'pop', this.color, 3);
        if (this.syn.has('pinball')) {
          const t = w.nearestEnemy(this.x, this.y, 280);
          if (t) {
            w.fx.lightning(this.x, this.y, t.x, t.y, 0x6ff0ff);
            t.hurt(w, this.dmg * 0.8, this);
            sfx.zap();
          }
        }
        return;
      }
      w.damageTileAt(nx, ny, this.dmg);
      this.stain(w, ...this.surfaceNormal(w, nx, ny));
      // A well-charged pearl punches a small crater.
      if (this.pearl >= 0.5) w.carve(nx, ny, 10 + this.pearl * 14);
      this.pop(w);
      return;
    }
    this.bx = nbx;
    this.by = nby;
    this.x = nx;
    this.y = ny;
    if (this.x < -40 || this.y < -40 || this.x > w.widthPx + 40 || this.y > w.heightPx + 40) {
      this.dead = true;
      return;
    }

    // Enemies.
    for (const e of w.enemies) {
      if (e.dead || !e.hittable() || this.hit.has(e.id)) continue;
      const rr = e.r + this.r;
      const dx = e.x - this.x, dy = e.y - this.y;
      if (dx * dx + dy * dy > rr * rr) continue;
      this.hit.add(e.id);
      this.onHitEnemy(w, e);
      if (!(this.has('piercing') || this.pearl > 0) || this.dead) {
        this.pop(w, e);
        return;
      }
    }

    if (this.traveled >= this.range && !(this.has('boomerang') && this.returning)) this.pop(w);
    // Cosmetic wake in the water and a thin trail of ink.
    const frame = (this.age * 60) | 0;
    if (frame % 3 === 0) w.fluid.splat(this.x, this.y, this.vx * 0.25, this.vy * 0.25, 22);
    if (frame % 4 === 0 && this.pearl <= 0 && !this.mini) w.fx.burst(this.x - this.vx * 0.02, this.y - this.vy * 0.02, 'inktrail', this.ink, 1);
  }

  onHitEnemy(w: RoomWorld, e: Enemy) {
    let dmg = this.dmg;
    const luck = this.luck;
    // Steam Vent: fire on a frozen foe.
    if (this.has('burn') && e.frozen > 0 && this.syn.has('steamvent')) {
      e.frozen = 0;
      w.explode(e.x, e.y, 95, dmg * 3, { steam: true, hurtsPlayer: false });
    }
    if (this.has('crit') && R.chance(0.1 + luck * 0.02)) {
      dmg *= 3;
      w.fx.text(e.x, e.y - e.r - 18, 'CRIT!', 0xfff27a, 22);
    }
    e.hurt(w, dmg, this);
    e.knock(this.vx, this.vy, (this.pearl ? 220 : 90) * (this.has('knockback') ? 3.5 : 1));
    if (this.has('poison')) e.poisonUp(4, this.baseDmg * (this.syn.has('toxicbloom') ? 0.6 : 0.3) + 1);
    if (this.has('slow')) e.slow = Math.max(e.slow, 2.2);
    if (this.has('freeze') && R.chance(0.2 + luck * 0.03)) e.freeze(1.6);
    if (this.has('burn') && R.chance(0.3 + luck * 0.03)) e.ignite(3, dmg * 0.45 + 1.5);
    if (this.has('charm') && !e.boss && R.chance(0.15 + luck * 0.03)) e.charmed = 4;
    if (this.has('chain')) {
      let from: { x: number; y: number } = e;
      const done = new Set([e.id]);
      for (let i = 0; i < 2; i++) {
        let best: Enemy | null = null, bd = 190;
        for (const o of w.enemies) {
          if (o.dead || done.has(o.id) || !o.hittable()) continue;
          const d = dist(from.x, from.y, o.x, o.y);
          if (d < bd) { bd = d; best = o; }
        }
        if (!best) break;
        done.add(best.id);
        w.fx.lightning(from.x, from.y, best.x, best.y, 0x6ff0ff);
        best.hurt(w, dmg * 0.5, this);
        from = best;
      }
      sfx.zap();
    }
    if (this.has('split') && this.gen < (this.syn.has('cellbloom') ? 2 : 1) && !this.mini) {
      const a = Math.atan2(this.vy, this.vx);
      for (const s of [-0.7, 0.7]) {
        const na = a + s;
        const sp = this.speed * 0.9;
        const flags = new Set(this.flags);
        flags.delete('boomerang');
        flags.delete('spiral');
        w.addBubble(new Bubble({
          x: this.x + Math.cos(na) * (e.r + 8), y: this.y + Math.sin(na) * (e.r + 8),
          vx: Math.cos(na) * sp, vy: Math.sin(na) * sp, dmg: this.baseDmg * 0.5,
          radius: Math.max(4, this.radius0 * 0.75), range: this.range * 0.45, flags,
          synergies: this.syn, transformations: this.trans, luck: this.luck, gen: this.gen + 1, color: this.color,
        }));
        this.hit.add(e.id);
      }
    }
  }

  pop(w: RoomWorld, _hitEnemy?: Enemy) {
    if (this.popped) return;
    this.popped = true;
    this.dead = true;
    if (this.pearl > 0) w.fx.burst(this.x, this.y, 'pop', this.color, 10);
    else w.fx.burst(this.x, this.y, 'ink', this.ink, this.mini ? 1 : 2);
    sfx.pop();
    w.fluid.blast(this.x, this.y, 60 + this.r * 3, 40 + this.r * 2);
    if (this.has('explosive')) {
      w.explode(this.x, this.y, 58 + this.r, this.dmg * 1.5 + 8, { hurtsPlayer: false, ink: this.syn.has('inkfish'), carve: 16 + this.r * 0.5 });
    }
    if (this.syn.has('bigmadpuff') && this.r > this.radius0 * 1.6 && !this.mini) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        w.addBubble(new Bubble({
          x: this.x, y: this.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, dmg: this.baseDmg * 0.5, radius: 5,
          range: 130, flags: new Set(['piercing']), synergies: new Set(), transformations: new Set(), luck: 0,
          mini: true, color: 0xffc23d,
        }));
      }
    }
    if (this.pearl > 0.5) {
      if (this.syn.has('necklace')) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          w.addBubble(new Bubble({
            x: this.x, y: this.y, vx: Math.cos(a) * 360, vy: Math.sin(a) * 360, dmg: this.baseDmg * 0.6, radius: 7,
            range: 220, flags: new Set(), synergies: new Set(), transformations: new Set(), luck: 0, mini: true, color: 0xfff6e8,
          }));
        }
      }
      if (this.syn.has('prism')) {
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          w.beams.push(new Beam(this.x, this.y, Math.cos(a), Math.sin(a), this.baseDmg * 0.6, 0.35, false, 14, 0xc8a0ff));
        }
        sfx.laser();
      }
    }
  }
}

export class EnemyShot extends Entity {
  color: number;
  gravity: number;
  life: number;
  dmg: number;
  homing: number;
  /** Bounces left before it pops on rock (Clown Anemone balls). */
  bounce: number;
  constructor(x: number, y: number, vx: number, vy: number, opts: { r?: number; color?: number; gravity?: number; life?: number; dmg?: number; homing?: number; ghost?: boolean; bounce?: number } = {}) {
    super();
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.r = opts.r ?? 7;
    this.color = opts.color ?? 0xff4d6d;
    this.gravity = opts.gravity ?? 0;
    this.life = opts.life ?? 4;
    this.dmg = opts.dmg ?? 10;
    this.homing = opts.homing ?? 0;
    this.ghost = opts.ghost ?? false;
    this.bounce = opts.bounce ?? 0;
  }
  update(w: RoomWorld, dt: number) {
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) {
      this.dead = true;
      return;
    }
    if (this.homing > 0) {
      const p = w.player;
      const a = Math.atan2(p.y - this.y, p.x - this.x);
      const sp = Math.hypot(this.vx, this.vy);
      this.vx += (Math.cos(a) * sp - this.vx) * this.homing * dt;
      this.vy += (Math.sin(a) * sp - this.vy) * this.homing * dt;
    }
    this.vy += this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (!this.ghost && w.solidAt(this.x, this.y) && this.bounce > 0) {
      this.bounce--;
      const hx = w.solidAt(this.x, this.y - this.vy * dt), hy = w.solidAt(this.x - this.vx * dt, this.y);
      this.x -= this.vx * dt;
      this.y -= this.vy * dt;
      if (hy || !hx) this.vy = -this.vy * 0.85;
      if (hx || !hy) this.vx = -this.vx * 0.85;
      w.fx.burst(this.x, this.y, 'pop', this.color, 2);
      return;
    }
    if (!this.ghost && w.solidAt(this.x, this.y)) {
      this.dead = true;
      w.fx.burst(this.x, this.y, 'pop', this.color, 4);
      if (this.gravity > 0) w.fx.burst(this.x, this.y, 'sand', undefined, 5);
      return;
    }
    if (this.x < -60 || this.y < -60 || this.x > w.widthPx + 60 || this.y > w.heightPx + 60) this.dead = true;
  }
}

/** Charged light beam (Sunbeam). Follows its owner if `follow` is set. */
export class Beam {
  dead = false;
  age = 0;
  tick = 0;
  burn = 0.1;
  angle: number;
  len = 0;
  constructor(
    public x: number,
    public y: number,
    public dx: number,
    public dy: number,
    public dmg: number,
    public dur: number,
    public follow: boolean,
    public width = 26,
    public color = 0xfff27a,
    public spin = 0,
  ) {
    this.angle = Math.atan2(dy, dx);
  }
  update(w: RoomWorld, dt: number) {
    this.age += dt;
    if (this.age >= this.dur) {
      this.dead = true;
      return;
    }
    if (this.follow) {
      this.x = w.player.x;
      this.y = w.player.y - 4;
    }
    if (this.spin) this.angle += this.spin * dt;
    this.dx = Math.cos(this.angle);
    this.dy = Math.sin(this.angle);
    // Length until the room edge (beams pass through rocks).
    let L = 0;
    const maxL = 1600;
    while (L < maxL) {
      const px = this.x + this.dx * L, py = this.y + this.dy * L;
      if (px < 0 || py < 0 || px > w.widthPx || py > w.heightPx) break;
      L += 12;
    }
    this.len = L;
    // The beam slowly burns a hole where it first meets rock.
    this.burn -= dt;
    if (this.burn <= 0) {
      this.burn = 0.18;
      for (let s = 20; s < L; s += 8) {
        const px = this.x + this.dx * s, py = this.y + this.dy * s;
        if (w.solidAt(px, py)) {
          w.carve(px + this.dx * 6, py + this.dy * 6, 13);
          break;
        }
      }
    }
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 0.07;
      for (const e of w.enemies) {
        if (e.dead || !e.hittable()) continue;
        const rx = e.x - this.x, ry = e.y - this.y;
        const t = rx * this.dx + ry * this.dy;
        if (t < 0 || t > this.len) continue;
        const perp = Math.abs(rx * this.dy - ry * this.dx);
        if (perp < e.r + this.width / 2) {
          e.hurt(w, this.dmg, null);
          if (w.player.stats.flags.has('burn') && R.chance(0.15)) e.ignite(2, this.dmg * 0.3 + 1);
        }
      }
      // Beams also break pots along the way.
      for (let s = 0; s < this.len; s += TILE / 2) w.damageTileAt(this.x + this.dx * s, this.y + this.dy * s, 999, true);
    }
    if (((this.age * 60) | 0) % 2 === 0) {
      const s = R.range(0, this.len);
      w.fluid.splat(this.x + this.dx * s, this.y + this.dy * s, this.dx * 200, this.dy * 200, 30);
    }
  }
}

export class InkBomb extends Entity {
  fuse = 1.6;
  constructor(x: number, y: number, vx: number, vy: number) {
    super();
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.r = 14;
    this.hw = this.hh = 11;
  }
}

/** Lingering area: ink puddles (slow enemies), steam clouds (damage). */
export class Zone {
  dead = false;
  age = 0;
  constructor(
    public x: number,
    public y: number,
    public r: number,
    public life: number,
    public kind: 'ink' | 'steam' | 'cloud',
    public dps = 0,
  ) {}
  update(w: RoomWorld, dt: number) {
    this.age += dt;
    if (this.age >= this.life) {
      this.dead = true;
      return;
    }
    for (const e of w.enemies) {
      if (e.dead) continue;
      if (dist(e.x, e.y, this.x, this.y) < this.r + e.r) {
        if (this.kind !== 'steam') e.slow = Math.max(e.slow, 0.3);
        if (this.dps > 0) e.hurt(w, this.dps * dt, null, true);
      }
    }
  }
}
