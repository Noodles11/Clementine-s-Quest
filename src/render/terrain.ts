// Comic-style terrain: thick ink outlines via an expanded dark pass under
// the fill pass, sand caps on top surfaces, halftone under overhangs.

import { Container, FillGradient, Graphics, TilingSprite } from 'pixi.js';
import { TILE } from '../config';
import { darken, lighten, mixColor } from '../core/math';
import { Rng } from '../core/rng';
import { isSolidTile, T_BREAK, T_SECRET, T_SPIKE } from '../gen/roomgen';
import type { RoomWorld } from '../game/room';
import { INK } from '../ambient/plants';
import { tex } from './textures';
import { natural, shade } from './style';

function roundedTile(g: Graphics, x: number, y: number, w: number, h: number, r: [number, number, number, number]) {
  const [tl, tr, br, bl] = r;
  g.moveTo(x + tl, y);
  g.lineTo(x + w - tr, y);
  if (tr) g.arcTo(x + w, y, x + w, y + tr, tr);
  g.lineTo(x + w, y + h - br);
  if (br) g.arcTo(x + w, y + h, x + w - br, y + h, br);
  g.lineTo(x + bl, y + h);
  if (bl) g.arcTo(x, y + h, x, y + h - bl, bl);
  g.lineTo(x, y + tl);
  if (tl) g.arcTo(x, y, x + tl, y, tl);
  g.closePath();
}

export class TerrainView {
  container = new Container();
  private g = new Graphics();
  private mask = new Graphics();
  private rockMask = new Graphics();
  private rock: TilingSprite;
  private caustic: TilingSprite;
  private caustic2: TilingSprite;
  private detail = new Graphics();
  surfaceG = new Graphics();

  constructor() {
    this.rock = new TilingSprite({ texture: tex().rock, width: 100, height: 100 });
    this.rock.blendMode = 'multiply';
    this.rock.mask = this.rockMask;
    this.caustic = new TilingSprite({ texture: tex().caustic, width: 100, height: 100 });
    this.caustic2 = new TilingSprite({ texture: tex().caustic, width: 100, height: 100 });
    for (const c of [this.caustic, this.caustic2]) {
      c.blendMode = 'add';
      c.mask = this.mask;
    }
    this.container.addChild(this.g, this.rockMask, this.rock, this.detail, this.mask, this.caustic, this.caustic2, this.surfaceG);
  }

  build(w: RoomWorld) {
    const g = this.g;
    const m = this.mask;
    const rm = this.rockMask;
    const d = this.detail;
    g.clear();
    m.clear();
    rm.clear();
    d.clear();
    const b = w.biome;
    const { tw, th } = w;
    const solid = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= tw || y >= th) return true;
      return isSolidTile(w.tiles[y * tw + x]) && !(w.layout.surface && y === 0 && x > 0 && x < tw - 1);
    };
    const kind = (x: number, y: number) => w.tiles[y * tw + x];
    const R = 18;
    const corners = (x: number, y: number): [number, number, number, number] => {
      const L = solid(x - 1, y), Rt = solid(x + 1, y), U = solid(x, y - 1), D = solid(x, y + 1);
      return [!L && !U ? R : 0, !Rt && !U ? R : 0, !Rt && !D ? R : 0, !L && !D ? R : 0];
    };
    const rng = new Rng(w.room.seed ^ 0x5eed);
    const rockBase = mixColor(b.rock, b.rockDark, 0.35);

    // Contact shadow: a soft dark rim hugging the rock silhouette.
    for (let y = 0; y < th; y++)
      for (let x = 0; x < tw; x++) {
        if (!solid(x, y) || kind(x, y) === T_BREAK) continue;
        const c = corners(x, y).map((v) => (v ? v + 2 : 0)) as [number, number, number, number];
        roundedTile(g, x * TILE - 2, y * TILE - 2, TILE + 4, TILE + 4, c);
        g.fill({ color: 0x05080c, alpha: 0.55 });
      }
    // Rock body, darker and colder deeper in the room.
    for (let y = 0; y < th; y++)
      for (let x = 0; x < tw; x++) {
        if (!solid(x, y) || kind(x, y) === T_BREAK) continue;
        const t = y / th;
        const col = mixColor(rockBase, darken(b.rockDark, 0.3), t * 0.6 + rng.range(-0.04, 0.04));
        roundedTile(g, x * TILE - 0.5, y * TILE - 0.5, TILE + 1, TILE + 1, corners(x, y));
        g.fill(col);
        roundedTile(m, x * TILE, y * TILE, TILE, TILE, corners(x, y));
        m.fill(0xffffff);
        roundedTile(rm, x * TILE - 0.5, y * TILE - 0.5, TILE + 1, TILE + 1, corners(x, y));
        rm.fill(0xffffff);
      }
    // Lighting on the rock: silt/sand settles and catches light on top faces,
    // undersides fall into deep shadow.
    for (let y = 0; y < th; y++)
      for (let x = 0; x < tw; x++) {
        if (!solid(x, y) || kind(x, y) === T_BREAK) continue;
        const px = x * TILE, py = y * TILE;
        const [tl, tr] = corners(x, y);
        if (!solid(x, y - 1)) {
          const sand = b.sand;
          d.moveTo(px + tl * 0.5, py);
          d.lineTo(px + TILE - tr * 0.5, py);
          for (let i = 4; i >= 0; i--) {
            const sx = px + (i / 4) * TILE;
            const sy = py + 7 + Math.sin(x * 2.1 + i * 1.7) * 2.5;
            d.lineTo(Math.min(px + TILE - tr * 0.4, Math.max(px + tl * 0.4, sx)), sy);
          }
          d.closePath().fill(shade(darken(sand, 0.1), 0.6));
          d.rect(px + tl * 0.3, py + 6, TILE - (tl + tr) * 0.3, 16).fill(vertFade(sand, 0.35));
        }
        if (!solid(x, y + 1) && y < th - 1) d.rect(px, py + TILE - 22, TILE, 22).fill(vertFade(0x000000, 0.55, true));
        if (!solid(x - 1, y)) d.rect(px, py, 10, TILE).fill({ color: 0x000000, alpha: 0.12 });
        if (!solid(x + 1, y)) d.rect(px + TILE - 10, py, 10, TILE).fill({ color: 0x000000, alpha: 0.18 });
        if (rng.chance(0.3)) {
          // Encrusting growth: sponges, tube worms, algae specks.
          const ex = px + rng.range(8, TILE - 8), ey = py + rng.range(10, TILE - 8);
          const c2 = rng.pick([mixColor(b.plantColor, rockBase, 0.5), mixColor(b.accent, rockBase, 0.6), darken(rockBase, 0.3)]);
          d.ellipse(ex, ey, rng.range(2, 5), rng.range(1.5, 3.5)).fill({ color: c2, alpha: 0.8 });
        }
        if (kind(x, y) === T_SECRET) {
          const cx = px + TILE / 2, cy = py + TILE / 2;
          d.moveTo(cx - 14, cy - 12).lineTo(cx - 3, cy - 2).lineTo(cx - 8, cy + 8).lineTo(cx + 4, cy + 15)
            .moveTo(cx - 3, cy - 2).lineTo(cx + 12, cy - 8)
            .stroke({ width: 1.6, color: 0x000000, alpha: 0.6 });
        }
      }
    // Breakables: old clay amphorae.
    for (let y = 0; y < th; y++)
      for (let x = 0; x < tw; x++) {
        if (kind(x, y) !== T_BREAK) continue;
        const cx = x * TILE + TILE / 2, by = y * TILE + TILE;
        const col = natural(w.depth === 3 ? 0x9a6b45 : rng.pick([0xb8703a, 0xa8603a, 0x8a5a3a]));
        d.ellipse(cx, by - 1, 16, 4).fill({ color: 0x000000, alpha: 0.35 });
        d.moveTo(cx - 13, by - 2).quadraticCurveTo(cx - 23, by - 26, cx - 8, by - 38).lineTo(cx + 8, by - 38)
          .quadraticCurveTo(cx + 23, by - 26, cx + 13, by - 2).closePath().fill(shade(col, 1.2));
        d.rect(cx - 8, by - 44, 16, 7).fill(shade(darken(col, 0.15)));
        d.ellipse(cx - 7, by - 26, 2.5, 7).fill({ color: 0xffffff, alpha: 0.18 });
        for (let i = 0; i < 3; i++) d.circle(cx + rng.range(-10, 10), by - rng.range(6, 30), rng.range(1, 2.5)).fill({ color: mixColor(b.plantColor, col, 0.4), alpha: 0.7 });
      }
    // Urchin beds: dark spiny tests.
    for (let y = 0; y < th; y++)
      for (let x = 0; x < tw; x++) {
        if (kind(x, y) !== T_SPIKE) continue;
        for (let k = 0; k < 2; k++) {
          const cx = x * TILE + 12 + k * 24, cy = y * TILE + TILE - 9;
          for (let i = 0; i < 15; i++) {
            const a = Math.PI + 0.1 + (i / 14) * (Math.PI - 0.2);
            const L = 14 + ((i * 7) % 5);
            d.moveTo(cx, cy).lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L).stroke({ width: 1.2, color: 0x2a1838, alpha: 0.95 });
          }
          d.circle(cx, cy, 8).fill(shade(0x3a2250, 1.2));
        }
      }

    for (const c of [this.caustic, this.caustic2, this.rock]) {
      c.width = w.widthPx;
      c.height = w.heightPx;
    }
    this.rock.tileScale.set(1.4);
    this.rock.tilePosition.set(w.room.seed % 256, (w.room.seed >> 8) % 256);
    this.caustic.alpha = 0.2 * b.lightTop;
    this.caustic2.alpha = 0.1 * b.lightTop;
    this.caustic2.tileScale.set(1.6);
  }

  update(t: number, w: RoomWorld) {
    this.caustic.tilePosition.set(t * 9, t * 4);
    this.caustic2.tilePosition.set(-t * 6, t * 7);
    // Snell's window: the bright, rippling underside of the surface.
    const sg = this.surfaceG;
    sg.clear();
    if (!w.layout.surface) return;
    const W = w.widthPx;
    const yAt = (x: number) => TILE * 0.75 + Math.sin(x * 0.03 + t * 1.6) * 5 + Math.sin(x * 0.07 - t * 2.4) * 2;
    sg.moveTo(0, 0);
    for (let x = 0; x <= W; x += 16) sg.lineTo(x, yAt(x));
    sg.lineTo(W, 0).closePath().fill(vertFade(0xdffcff, 0.75));
    sg.moveTo(0, yAt(0));
    for (let x = 16; x <= W; x += 16) sg.lineTo(x, yAt(x));
    sg.stroke({ width: 1.5, color: 0xffffff, alpha: 0.7 });
    for (let i = 0; i < 14; i++) {
      const x = (i * 137 + t * 24) % W;
      sg.ellipse(x, TILE * 0.45 + Math.sin(t + i) * 4, 22, 2.5).fill({ color: 0xffffff, alpha: 0.25 + Math.sin(t * 3 + i) * 0.15 });
    }
  }
}

const fadeCache = new Map<string, FillGradient>();
/** Vertical fade from a color (top) to transparent (bottom), or reversed. */
function vertFade(color: number, alpha: number, reverse = false) {
  const key = `${color}:${alpha}:${reverse}`;
  let f = fadeCache.get(key);
  if (f) return f;
  const hex = '#' + color.toString(16).padStart(6, '0');
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  f = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    textureSpace: 'local',
    colorStops: reverse
      ? [{ offset: 0, color: hex + '00' }, { offset: 1, color: hex + a }]
      : [{ offset: 0, color: hex + a }, { offset: 1, color: hex + '00' }],
  });
  fadeCache.set(key, f);
  return f;
}
