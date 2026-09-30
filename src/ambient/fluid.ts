// Cosmetic water velocity field: a small "Stable Fluids" solver.
// Anything that moves injects impulses; ambient elements sample it.
// Never feeds back into gameplay physics.

export class FluidField {
  readonly nx: number;
  readonly ny: number;
  readonly cell: number;
  u: Float32Array;
  v: Float32Array;
  private u0: Float32Array;
  private v0: Float32Array;
  private p: Float32Array;
  private div: Float32Array;
  solid: Uint8Array;
  /** Biome base current (px/s). */
  baseX = 0;
  baseY = 0;
  time = 0;
  iterations = 10;
  decay = 0.985;

  constructor(widthPx: number, heightPx: number, cell = 16) {
    this.cell = cell;
    this.nx = Math.ceil(widthPx / cell);
    this.ny = Math.ceil(heightPx / cell);
    const n = this.nx * this.ny;
    this.u = new Float32Array(n);
    this.v = new Float32Array(n);
    this.u0 = new Float32Array(n);
    this.v0 = new Float32Array(n);
    this.p = new Float32Array(n);
    this.div = new Float32Array(n);
    this.solid = new Uint8Array(n);
  }

  setSolid(isSolidPx: (x: number, y: number) => boolean) {
    for (let j = 0; j < this.ny; j++)
      for (let i = 0; i < this.nx; i++)
        this.solid[j * this.nx + i] = isSolidPx((i + 0.5) * this.cell, (j + 0.5) * this.cell) ? 1 : 0;
  }

  /** Add velocity (px/s) in a soft radius around (x, y). */
  splat(x: number, y: number, vx: number, vy: number, radius: number) {
    const c = this.cell;
    const r = Math.max(radius / c, 0.8);
    const ci = x / c - 0.5, cj = y / c - 0.5;
    const i0 = Math.max(0, Math.floor(ci - r)), i1 = Math.min(this.nx - 1, Math.ceil(ci + r));
    const j0 = Math.max(0, Math.floor(cj - r)), j1 = Math.min(this.ny - 1, Math.ceil(cj + r));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const dx = i - ci, dy = j - cj;
        const d2 = (dx * dx + dy * dy) / (r * r);
        if (d2 > 1) continue;
        const w = (1 - d2) * (1 - d2);
        const k = j * this.nx + i;
        if (this.solid[k]) continue;
        this.u[k] += vx * w;
        this.v[k] += vy * w;
      }
  }

  /** Radial push outward (explosions) or inward (negative strength). */
  blast(x: number, y: number, strength: number, radius: number) {
    const c = this.cell;
    const r = radius / c;
    const ci = x / c - 0.5, cj = y / c - 0.5;
    const i0 = Math.max(0, Math.floor(ci - r)), i1 = Math.min(this.nx - 1, Math.ceil(ci + r));
    const j0 = Math.max(0, Math.floor(cj - r)), j1 = Math.min(this.ny - 1, Math.ceil(cj + r));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const dx = i - ci, dy = j - cj;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > r || d < 0.001) continue;
        const k = j * this.nx + i;
        if (this.solid[k]) continue;
        const w = (1 - d / r) * strength;
        this.u[k] += (dx / d) * w;
        this.v[k] += (dy / d) * w;
      }
  }

  step(dt: number) {
    this.time += dt;
    const { nx, ny, u, v } = this;
    // Gentle, slowly varying ambient drift so the water is never still.
    const t = this.time;
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (this.solid[k]) continue;
        const ax = Math.sin(j * 0.23 + t * 0.35) * 0.9 + Math.sin(i * 0.11 - t * 0.2) * 0.5;
        const ay = Math.cos(i * 0.19 + t * 0.3) * 0.7;
        u[k] += (this.baseX + ax * 4) * dt * 0.6;
        v[k] += (this.baseY + ay * 3) * dt * 0.6;
      }
    this.advect(dt);
    this.project();
    const decay = Math.pow(this.decay, dt * 60);
    for (let k = 0; k < u.length; k++) {
      if (this.solid[k]) {
        u[k] = 0;
        v[k] = 0;
        continue;
      }
      u[k] *= decay;
      v[k] *= decay;
    }
  }

  private advect(dt: number) {
    const { nx, ny, u, v, u0, v0 } = this;
    u0.set(u);
    v0.set(v);
    const inv = 1 / this.cell;
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (this.solid[k]) continue;
        let x = i - dt * u0[k] * inv;
        let y = j - dt * v0[k] * inv;
        x = Math.max(0, Math.min(nx - 1.001, x));
        y = Math.max(0, Math.min(ny - 1.001, y));
        const i0 = x | 0, j0 = y | 0;
        const s = x - i0, tt = y - j0;
        const a = j0 * nx + i0, b = a + 1, c = a + nx, d = c + 1;
        u[k] = (u0[a] * (1 - s) + u0[b] * s) * (1 - tt) + (u0[c] * (1 - s) + u0[d] * s) * tt;
        v[k] = (v0[a] * (1 - s) + v0[b] * s) * (1 - tt) + (v0[c] * (1 - s) + v0[d] * s) * tt;
      }
  }

  private project() {
    const { nx, ny, u, v, p, div, solid } = this;
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const k = j * nx + i;
        div[k] = -0.5 * (u[k + 1] - u[k - 1] + v[k + nx] - v[k - nx]);
        p[k] = 0;
      }
    for (let it = 0; it < this.iterations; it++) {
      for (let j = 1; j < ny - 1; j++)
        for (let i = 1; i < nx - 1; i++) {
          const k = j * nx + i;
          if (solid[k]) continue;
          const pl = solid[k - 1] ? p[k] : p[k - 1];
          const pr = solid[k + 1] ? p[k] : p[k + 1];
          const pu = solid[k - nx] ? p[k] : p[k - nx];
          const pd = solid[k + nx] ? p[k] : p[k + nx];
          p[k] = (div[k] + pl + pr + pu + pd) * 0.25;
        }
    }
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const k = j * nx + i;
        if (solid[k]) continue;
        u[k] -= 0.5 * (p[k + 1] - p[k - 1]);
        v[k] -= 0.5 * (p[k + nx] - p[k - nx]);
      }
  }

  /** Bilinear sample of velocity at pixel position. */
  sample(x: number, y: number, out: { x: number; y: number }) {
    const { nx, ny } = this;
    let fx = x / this.cell - 0.5;
    let fy = y / this.cell - 0.5;
    fx = Math.max(0, Math.min(nx - 1.001, fx));
    fy = Math.max(0, Math.min(ny - 1.001, fy));
    const i0 = fx | 0, j0 = fy | 0;
    const s = fx - i0, t = fy - j0;
    const a = j0 * nx + i0, b = a + 1, c = a + nx, d = c + 1;
    out.x = (this.u[a] * (1 - s) + this.u[b] * s) * (1 - t) + (this.u[c] * (1 - s) + this.u[d] * s) * t;
    out.y = (this.v[a] * (1 - s) + this.v[b] * s) * (1 - t) + (this.v[c] * (1 - s) + this.v[d] * s) * t;
    return out;
  }
}
