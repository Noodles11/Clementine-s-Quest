export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (t: number) => t * t * (3 - 2 * t);
export const TAU = Math.PI * 2;

export function len(x: number, y: number) {
  return Math.sqrt(x * x + y * y);
}
export function dist(ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}
export function dist2(ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}
export function angleTo(ax: number, ay: number, bx: number, by: number) {
  return Math.atan2(by - ay, bx - ax);
}
export function wrapAngle(a: number) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
/** Exponential approach, frame-rate independent. */
export function approach(cur: number, target: number, rate: number, dt: number) {
  return target + (cur - target) * Math.exp(-rate * dt);
}

/** Linear blend of two 0xRRGGBB colors. */
export function mixColor(a: number, b: number, t: number) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (
    (Math.round(lerp(ar, br, t)) << 16) |
    (Math.round(lerp(ag, bg, t)) << 8) |
    Math.round(lerp(ab, bb, t))
  );
}
export function darken(c: number, t: number) {
  return mixColor(c, 0x000000, t);
}
export function lighten(c: number, t: number) {
  return mixColor(c, 0xffffff, t);
}
/** Desaturate toward gray by t. */
export function desaturate(c: number, t: number) {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const l = Math.round(r * 0.3 + g * 0.59 + b * 0.11);
  return mixColor(c, (l << 16) | (l << 8) | l, t);
}
export function hsl(h: number, s: number, l: number) {
  h = ((h % 1) + 1) % 1;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}

/** Cheap deterministic 2D value noise (for cosmetics and terrain shaping). */
export function hash2(x: number, y: number, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function valueNoise1(x: number, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash2(i, 0, seed);
  const b = hash2(i + 1, 0, seed);
  return lerp(a, b, smoothstep(f));
}
export function valueNoise2(x: number, y: number, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smoothstep(x - ix), fy = smoothstep(y - iy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}
