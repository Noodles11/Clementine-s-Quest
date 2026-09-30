// Documentary-realism art direction helpers.
// Every body is shaded with a soft vertical light falloff (lit from the surface),
// and outlines are reduced to faint contact edges instead of comic ink.

import { FillGradient } from 'pixi.js';
import { darken, lighten, mixColor } from '../core/math';

/** Edge width multiplier and alpha for former comic outlines. */
export const EW = 0.35;
export const EA = 0.35;

const hex = (c: number) => '#' + (c & 0xffffff).toString(16).padStart(6, '0');

const shadeCache = new Map<string, FillGradient>();

/** Top-lit body shading: highlight at the top, deep shadow underneath. */
export function shade(color: number, strength = 1): FillGradient {
  const key = `${color}:${strength}`;
  let g = shadeCache.get(key);
  if (g) return g;
  g = new FillGradient({
    type: 'linear',
    start: { x: 0.3, y: 0 },
    end: { x: 0.5, y: 1 },
    textureSpace: 'local',
    colorStops: [
      { offset: 0, color: hex(lighten(color, 0.28 * strength)) },
      { offset: 0.45, color: hex(color) },
      { offset: 1, color: hex(darken(color, 0.55 * strength)) },
    ],
  });
  shadeCache.set(key, g);
  return g;
}

const glowCache = new Map<number, FillGradient>();

/** Radial soft glow (bright core → transparent edge). */
export function glowFill(color: number): FillGradient {
  let g = glowCache.get(color);
  if (g) return g;
  g = new FillGradient({
    type: 'radial',
    center: { x: 0.5, y: 0.5 },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.5 },
    outerRadius: 0.5,
    textureSpace: 'local',
    colorStops: [
      { offset: 0, color: hex(color) + 'b0' },
      { offset: 0.3, color: hex(color) + '60' },
      { offset: 1, color: hex(color) + '00' },
    ],
  });
  glowCache.set(color, g);
  return g;
}

const transCache = new Map<string, FillGradient>();

/** Translucent gelatinous body: denser rim, clear centre (jellyfish bells). */
export function gelFill(color: number, rim: number): FillGradient {
  const key = `${color}:${rim}`;
  let g = transCache.get(key);
  if (g) return g;
  g = new FillGradient({
    type: 'radial',
    center: { x: 0.42, y: 0.35 },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.55 },
    outerRadius: 0.62,
    textureSpace: 'local',
    colorStops: [
      { offset: 0, color: hex(lighten(color, 0.25)) + '70' },
      { offset: 0.55, color: hex(color) + '66' },
      { offset: 0.85, color: hex(mixColor(color, rim, 0.4)) + 'bb' },
      { offset: 1, color: hex(rim) + 'e0' },
    ],
  });
  transCache.set(key, g);
  return g;
}

/** Natural-looking tone for creature base colors: less candy, more sea. */
export function natural(color: number) {
  return mixColor(color, 0x4a5a60, 0.28);
}
