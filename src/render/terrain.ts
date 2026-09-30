// Comic-style terrain: thick ink outlines via an expanded dark pass under
// the fill pass, sand caps on top surfaces, halftone under overhangs.

import { Container, Graphics, TilingSprite } from 'pixi.js';
import { TILE } from '../config';
import { darken, lighten, mixColor } from '../core/math';
import { Rng } from '../core/rng';
import { isSolidTile, T_BREAK, T_SECRET, T_SPIKE } from '../gen/roomgen';
import type { RoomWorld } from '../game/room';
import { INK } from '../ambient/plants';
import { tex } from './textures';

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
  private caustic: TilingSprite;
  private caustic2: TilingSprite;
  surfaceG = new Graphics();

  constructor() {
    this.caustic = new TilingSprite({ texture: tex().caustic, width: 100, height: 100 });
    this.caustic2 = new TilingSprite({ texture: tex().caustic, width: 100, height: 100 });
    for (const c of [this.caustic, this.caustic2]) {
      c.blendMode = 'add';
      c.mask = this.mask;
    }
    this.container.addChild(this.g, this.mask, this.caustic, this.caustic2, this.surfaceG);
  }

  build(w: RoomWorld) {
    const g = this.g;
    const m = this.mask;
    g.clear();
    m.clear();
    const b = w.biome;
    const { tw, th } = w;
    const solid = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= tw || y >= th) return true;
      return isSolidTile(w.tiles[y * tw + x]) && !(w.layout.surface && y === 0 && x > 0 && x < tw - 1);
    };
    const kind = (x: number, y: number) => w.tiles[y * tw + x];
    const R = 16;
    const corners = (x: number, y: number): [number, number, number, number] => {
      const L = solid(x - 1, y), Rt = solid(x + 1, y), U = solid(x, y - 1), D = solid(x, y + 1);
      return [!L && !U ? R : 0, !Rt && !U ? R : 0, !Rt && !D ? R : 0, !L && !D ? R : 0];
    };
    const rng = new Rng(w.room.seed ^ 0x5eed);

    // Pass 1: ink outline.
    for (let y = 0; y < th; y++)
      for (let x = 0; x < tw; x++) {
        if (!solid(x, y) || kind(x, y) === T_BREAK) continue;
        const c = corners(x, y).map((v) => (v ? v + 3.5 : 0)) as [number, number, number, number];
        roundedTile(g, x * TILE - 3.5, y * TILE - 3.5, TILE + 7, TILE + 7, c);
        g.fill(INK);
      }
    // Pass 2: rock fill, darker with depth in the room.
    for (let y = 0; y < th; y++)
      for (let x = 0; x < tw; x++) {
        if (!solid(x, y) || kind(x, y) === T_BREAK) continue;
        const t = y / th;
        const col = mixColor(b.rock, b.rockDark, 0.25 + t * 0.55 + rng.range(-0.05, 0.05));
        roundedTile(g, x * TILE - 0.5, y * TILE - 0.5, TILE + 1, TILE + 1, corners(x, y));
        g.fill(col);
        roundedTile(m, x * TILE, y * TILE, TILE, TILE, corners(x, y));
        m.fill(0xffffff);
      }
    // Pass 3: surface details.
    for (let y = 0; y < th; y++)
      for (let x = 0; x < tw; x++) {
        if (!solid(x, y) || kind(x, y) === T_BREAK) continue;
        const px = x * TILE, py = y * TILE;
        const [tl, tr] = corners(x, y);
        if (!solid(x, y - 1)) {
          // Sand cap with a wavy lower edge.
          const sand = b.sand;
          g.moveTo(px + tl * 0.6, py);
          g.lineTo(px + TILE - tr * 0.6, py);
          for (let i = 4; i >= 0; i--) {
            const sx = px + (i / 4) * TILE;
            const sy = py + 9 + Math.sin(x * 2.1 + i * 1.7) * 3;
            g.lineTo(Math.min(px + TILE - tr * 0.4, Math.max(px + tl * 0.4, sx)), sy);
          }
          g.closePath().fill(sand);
          g.moveTo(px + tl * 0.7 + 2, py + 3).lineTo(px + TILE - tr * 0.7 - 2, py + 3).stroke({ width: 2, color: lighten(sand, 0.4), alpha: 0.8 });
        }
        if (!solid(x, y + 1) && y < th - 1) {
          // Halftone shade under overhangs.
          for (let i = 0; i < 6; i++)
            for (let j = 0; j < 2; j++) g.circle(px + 5 + i * 8 + j * 4, py + TILE - 6 - j * 7, 2.2 - j * 0.8).fill({ color: INK, alpha: 0.35 });
        }
        if (rng.chance(0.35)) {
          const ex = px + rng.range(8, TILE - 8), ey = py + rng.range(14, TILE - 8);
          g.ellipse(ex, ey, rng.range(3, 6), rng.range(2, 4)).fill(darken(b.rockDark, 0.15));
          g.ellipse(ex - 1, ey - 1, 1.5, 1).fill({ color: 0xffffff, alpha: 0.3 });
        }
        if (kind(x, y) === T_SECRET) {
          // Suspicious cracks.
          const cx = px + TILE / 2, cy = py + TILE / 2;
          g.moveTo(cx - 14, cy - 12).lineTo(cx - 3, cy - 2).lineTo(cx - 8, cy + 8).lineTo(cx + 4, cy + 15)
            .moveTo(cx - 3, cy - 2).lineTo(cx + 12, cy - 8)
            .stroke({ width: 2.5, color: INK, alpha: 0.85 });
        }
      }
    // Breakables: pots / coral lumps.
    for (let y = 0; y < th; y++)
      for (let x = 0; x < tw; x++) {
        if (kind(x, y) !== T_BREAK) continue;
        const cx = x * TILE + TILE / 2, by = y * TILE + TILE;
        const col = w.depth === 3 ? 0x9a6b45 : rng.pick([0xc8743a, 0xd98a4a, b.accent]);
        g.moveTo(cx - 14, by - 2).quadraticCurveTo(cx - 24, by - 26, cx - 9, by - 40).lineTo(cx + 9, by - 40)
          .quadraticCurveTo(cx + 24, by - 26, cx + 14, by - 2).closePath().fill(col).stroke({ width: 3, color: INK });
        g.rect(cx - 11, by - 44, 22, 6).fill(darken(col, 0.2)).stroke({ width: 2.5, color: INK });
        g.moveTo(cx - 16, by - 24).lineTo(cx + 16, by - 24).stroke({ width: 2, color: lighten(col, 0.35) });
        g.ellipse(cx - 7, by - 30, 3, 5).fill({ color: 0xffffff, alpha: 0.45 });
      }
    // Urchin spikes.
    for (let y = 0; y < th; y++)
      for (let x = 0; x < tw; x++) {
        if (kind(x, y) !== T_SPIKE) continue;
        for (let k = 0; k < 2; k++) {
          const cx = x * TILE + 12 + k * 24, cy = y * TILE + TILE - 10;
          for (let i = 0; i < 9; i++) {
            const a = Math.PI + (i / 8) * Math.PI;
            g.moveTo(cx, cy).lineTo(cx + Math.cos(a) * 17, cy + Math.sin(a) * 17).stroke({ width: 3.5, color: INK });
            g.moveTo(cx, cy).lineTo(cx + Math.cos(a) * 15, cy + Math.sin(a) * 15).stroke({ width: 1.8, color: 0x7a4dff });
          }
          g.circle(cx, cy, 9).fill(0x4a2d8a).stroke({ width: 2.5, color: INK });
          g.circle(cx - 3, cy - 3, 2.5).fill(0xb06bff);
        }
      }

    for (const c of [this.caustic, this.caustic2]) {
      c.width = w.widthPx;
      c.height = w.heightPx;
    }
    this.caustic.alpha = 0.22 * (0.4 + b.lightTop * 0.6);
    this.caustic2.alpha = 0.14 * (0.4 + b.lightTop * 0.6);
    this.caustic2.tileScale.set(1.6);
  }

  update(t: number, w: RoomWorld) {
    this.caustic.tilePosition.set(t * 9, t * 4);
    this.caustic2.tilePosition.set(-t * 6, t * 7);
    // Shimmering water surface.
    const sg = this.surfaceG;
    sg.clear();
    if (!w.layout.surface) return;
    const W = w.widthPx;
    sg.moveTo(0, 0);
    for (let x = 0; x <= W; x += 24) sg.lineTo(x, TILE * 0.75 + Math.sin(x * 0.03 + t * 2) * 5 + Math.sin(x * 0.07 - t * 3) * 2);
    sg.lineTo(W, 0).closePath().fill({ color: 0xcffaff, alpha: 0.55 });
    for (let x = 0; x <= W; x += 24) {
      const y = TILE * 0.75 + Math.sin(x * 0.03 + t * 2) * 5 + Math.sin(x * 0.07 - t * 3) * 2;
      if (x === 0) sg.moveTo(x, y);
      else sg.lineTo(x, y);
    }
    sg.stroke({ width: 3, color: 0xffffff, alpha: 0.9 });
    for (let i = 0; i < 10; i++) {
      const x = ((i * 137 + t * 30) % W);
      sg.ellipse(x, TILE * 0.4 + Math.sin(t + i) * 4, 18, 3).fill({ color: 0xffffff, alpha: 0.35 + Math.sin(t * 3 + i) * 0.2 });
    }
  }
}
