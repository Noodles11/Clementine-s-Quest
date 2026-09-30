// In-game HUD: hearts, counters, active item, snack, stats, minimap, boss bar.

import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { EA, EW } from './style';
import { FONT_TITLE, FONT_UI, VIEW_W, VIEW_H } from '../config';
import { INK } from '../ambient/plants';
import { ITEM_BY_ID } from '../game/items';
import type { Run } from '../game/run';
import type { RoomWorld } from '../game/room';
import { TILE } from '../config';
import { isSolidTile } from '../gen/tiles';
import { LEVEL_ID } from '../game/room';
import { heart } from './creatures';
import { drawItemIcon, drawPickup } from './icons';

function label(size: number, color = 0xffffff, font = FONT_UI) {
  return new Text({
    text: '',
    style: {
      fontFamily: font, fontSize: size, fill: color, fontWeight: '600', letterSpacing: 1,
      dropShadow: { color: 0x000000, distance: 1, angle: Math.PI / 2, alpha: 0.9, blur: 3 },
    },
  });
}

export class Hud {
  container = new Container();
  private g = new Graphics();
  private coins = label(18);
  private bombs = label(18);
  private keys = label(18);
  private stats = label(12, 0xe8f4ff);
  private snack = label(12);
  private bossName = label(18, 0xffffff, FONT_TITLE);
  private depthLabel = label(13, 0xe8f4ff);
  private charge = label(11);
  private osd = label(13, 0xe8f4ff);
  private osdRec = label(13, 0xff4d4d);
  private osdG = new Graphics();
  // Explored map (fog of war): one pixel per tile.
  private mapCanvas = document.createElement('canvas');
  private mapTex: Texture | null = null;
  private mapSprite = new Sprite();
  private mapMask = new Graphics();
  private mapFrame = new Graphics();
  private mapMarks = new Graphics();
  private mapLayer = new Container();
  private mapVersion = -1;
  private mapWorld: RoomWorld | null = null;

  constructor() {
    this.mapLayer.addChild(this.mapFrame, this.mapSprite, this.mapMarks, this.mapMask);
    this.mapSprite.mask = this.mapMask;
    this.container.addChild(this.osdG, this.g, this.coins, this.bombs, this.keys, this.stats, this.snack, this.bossName, this.depthLabel, this.charge, this.osd, this.osdRec, this.mapLayer);
    this.osd.anchor.set(0, 0);
    this.osdRec.anchor.set(1, 0);
    this.stats.alpha = 0.75;
    this.coins.position.set(104, 58);
    this.bombs.position.set(104, 82);
    this.keys.position.set(104, 106);
    this.stats.position.set(18, 138);
    this.stats.style.lineHeight = 17;
    this.snack.anchor.set(1, 1);
    this.snack.position.set(VIEW_W - 72, VIEW_H - 16);
    this.bossName.anchor.set(0.5, 1);
    this.bossName.position.set(VIEW_W / 2, VIEW_H - 30);
    this.depthLabel.anchor.set(0, 1);
    this.depthLabel.position.set(16, VIEW_H - 12);
  }

  bigMap = false;

  update(run: Run, world: RoomWorld, t: number) {
    const g = this.g;
    g.clear();
    const d = run.data.player;

    // Active item slot.
    g.roundRect(14, 14, 60, 60, 12).fill({ color: 0x0b1a2e, alpha: 0.55 }).stroke({ width: (3) * EW, color: INK, alpha: EA });
    if (d.active) {
      const def = ITEM_BY_ID[d.active.id];
      const full = d.active.charge >= (def?.charge ?? 0);
      if (full) g.roundRect(14, 14, 60, 60, 12).stroke({ width: 3, color: 0xfff27a, alpha: 0.6 + Math.sin(t * 6) * 0.4 });
      drawItemIcon(g, d.active.id, 44, 44, 17, t);
      // Charge bar.
      const max = def?.charge ?? 1;
      g.roundRect(78, 14, 10, 60, 4).fill({ color: 0x0b1a2e, alpha: 0.7 }).stroke({ width: (2.5) * EW, color: INK, alpha: EA });
      const h = (56 * Math.min(max, d.active.charge)) / max;
      g.roundRect(80, 72 - h, 6, h, 3).fill(full ? 0xfff27a : 0x5cf2ff);
      for (let i = 1; i < max; i++) g.moveTo(79, 72 - (56 * i) / max).lineTo(87, 72 - (56 * i) / max).stroke({ width: (1.5) * EW, color: INK, alpha: EA });
    }

    // Hearts.
    const hx0 = 104, hy0 = 26;
    const containers = Math.ceil(d.maxHp / 2);
    let i = 0;
    const perRow = 8;
    for (let c = 0; c < containers; c++, i++) {
      const x = hx0 + (i % perRow) * 24, y = hy0 + Math.floor(i / perRow) * 22;
      const fill = Math.max(0, Math.min(2, d.hp - c * 2));
      heart(g, x, y, 9, 0x3a1a2a);
      if (fill === 2) heart(g, x, y, 9, 0xff4d6d);
      else if (fill === 1) {
        heart(g, x, y, 9, 0x3a1a2a);
        g.moveTo(x, y + 8).bezierCurveTo(x - 14, y - 2, x - 7, y - 13, x, y - 4.5).closePath().fill(0xff4d6d);
      }
    }
    const foamHearts = Math.ceil(d.foam / 2);
    for (let c = 0; c < foamHearts; c++, i++) {
      const x = hx0 + (i % perRow) * 24, y = hy0 + Math.floor(i / perRow) * 22;
      const half = c === foamHearts - 1 && d.foam % 2 === 1;
      if (half) g.moveTo(x, y + 8).bezierCurveTo(x - 14, y - 2, x - 7, y - 13, x, y - 4.5).closePath().fill(0xd8f4ff).stroke({ width: (2) * EW, color: INK, alpha: EA });
      else heart(g, x, y, 9, 0xd8f4ff);
    }
    if (d.hp <= 2 && d.foam === 0 && Math.floor(t * 3) % 2 === 0) heart(g, hx0, hy0, 11, 0xff2d5a);

    // Counters.
    drawPickup(g, 'coin', 92, 70, 0);
    drawPickup(g, 'bomb', 92, 94, 0);
    drawPickup(g, 'key', 92, 118, 0);
    this.coins.text = String(d.coins).padStart(2, '0');
    this.bombs.text = String(d.bombs).padStart(2, '0');
    this.keys.text = String(d.keys).padStart(2, '0');
    this.coins.position.set(104, 58);

    // Stats column.
    const s = run.stats;
    this.stats.text =
      `DMG ${s.damage.toFixed(1)}\nRATE ${s.fireRate.toFixed(1)}\nSPD ${s.speed.toFixed(2)}\nRNG ${s.range.toFixed(1)}\nSHOT ${s.shotSpeed.toFixed(1)}\nLUCK ${s.luck.toFixed(0)}`;

    // Snack slot.
    if (d.snack) {
      g.roundRect(VIEW_W - 62, VIEW_H - 62, 48, 48, 10).fill({ color: 0x0b1a2e, alpha: 0.55 }).stroke({ width: (3) * EW, color: INK, alpha: EA });
      drawPickup(g, 'snack', VIEW_W - 38, VIEW_H - 38, t, false, d.snack);
      const known = run.data.identified.includes(d.snack);
      this.snack.text = `${d.snack}${known ? '' : ' ???'}  [Q]`;
    } else this.snack.text = '';

    // Boss bar.
    const b = world.boss;
    if (b && !b.dead && b.intro <= 0) {
      const W = 420;
      const x = VIEW_W / 2 - W / 2, y = VIEW_H - 26;
      g.roundRect(x, y, W, 16, 8).fill({ color: 0x1a0a14, alpha: 0.8 }).stroke({ width: (3) * EW, color: INK, alpha: EA });
      g.roundRect(x + 3, y + 3, (W - 6) * Math.max(0, b.hp / b.maxHp), 10, 5).fill(0xff4d6d);
      this.bossName.text = b.display;
    } else this.bossName.text = '';

    this.depthLabel.text = world.biome.name.toUpperCase();
    this.drawMap(run, world, t);
  }

  /** Repaint the fog-of-war map: open water that has been seen, outlined by its rock. */
  private paintMap(w: RoomWorld) {
    let c = this.mapCanvas;
    if (c.width !== w.tw || c.height !== w.th) {
      // Textures are cached per canvas, so a new size needs a new canvas.
      c = this.mapCanvas = document.createElement('canvas');
      c.width = w.tw;
      c.height = w.th;
      this.mapTex = null;
    }
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(w.tw, w.th);
    const d = img.data;
    const { tw, th, tiles, explored } = w;
    for (let y = 0; y < th; y++)
      for (let x = 0; x < tw; x++) {
        const i = y * tw + x;
        if (!explored[i]) continue;
        const solid = isSolidTile(tiles[i]);
        let r = 0, g = 0, b = 0, a = 0;
        if (!solid) {
          r = 40; g = 78; b = 118; a = 200;
        } else {
          const edge = (x > 0 && !isSolidTile(tiles[i - 1]) && explored[i - 1]) || (x < tw - 1 && !isSolidTile(tiles[i + 1]) && explored[i + 1]) ||
            (y > 0 && !isSolidTile(tiles[i - tw]) && explored[i - tw]) || (y < th - 1 && !isSolidTile(tiles[i + tw]) && explored[i + tw]);
          if (edge) {
            r = 190; g = 214; b = 236; a = 235;
          }
        }
        d[i * 4] = r;
        d[i * 4 + 1] = g;
        d[i * 4 + 2] = b;
        d[i * 4 + 3] = a;
      }
    ctx.putImageData(img, 0, 0);
    if (!this.mapTex) {
      this.mapTex = Texture.from(c);
      this.mapTex.source.scaleMode = 'nearest';
      this.mapSprite.texture = this.mapTex;
    } else this.mapTex.source.update();
  }

  private drawMap(run: Run, w: RoomWorld, t: number) {
    const fr = this.mapFrame, mk = this.mapMarks, mask = this.mapMask;
    fr.clear();
    mk.clear();
    mask.clear();
    if (this.mapWorld !== w || this.mapVersion !== w.exploredVersion) {
      this.mapWorld = w;
      this.mapVersion = w.exploredVersion;
      this.paintMap(w);
    }
    const p = w.player;
    const big = this.bigMap;
    let k: number, ox: number, oy: number, bx: number, by: number, bw: number, bh: number;
    if (big) {
      // Whole level, fitted to the screen.
      k = Math.min((VIEW_W - 120) / w.tw, (VIEW_H - 110) / w.th);
      bw = w.tw * k + 16;
      bh = w.th * k + 16;
      bx = (VIEW_W - bw) / 2;
      by = (VIEW_H - bh) / 2 + 10;
      ox = bx + 8;
      oy = by + 8;
    } else {
      k = 3;
      bw = 190;
      bh = 116;
      bx = VIEW_W - bw - 12;
      by = 12;
      ox = bx + bw / 2 - (p.x / TILE) * k;
      oy = by + bh / 2 - (p.y / TILE) * k;
    }
    fr.roundRect(bx, by, bw, bh, 10).fill({ color: 0x06101c, alpha: big ? 0.88 : 0.55 }).stroke({ width: 2.5 * EW, color: INK, alpha: EA });
    mask.roundRect(bx + 3, by + 3, bw - 6, bh - 6, 8).fill(0xffffff);
    this.mapSprite.position.set(ox, oy);
    this.mapSprite.scale.set(k);
    const at = (x: number, y: number) => [ox + (x / TILE) * k, oy + (y / TILE) * k] as const;
    const inBox = (x: number, y: number) => x > bx + 4 && x < bx + bw - 4 && y > by + 4 && y < by + bh - 4;
    const seen = (x: number, y: number) => {
      const i = Math.floor(y / TILE) * w.tw + Math.floor(x / TILE);
      return !!w.explored[i];
    };
    // Points of interest once seen.
    for (const pd of w.pedestals) {
      if (!seen(pd.x, pd.y)) continue;
      const [x, y] = at(pd.x, pd.y);
      if (inBox(x, y)) mk.circle(x, y, big ? 4 : 3).fill(pd.price !== undefined ? 0x5cf2a0 : pd.hearts !== undefined ? 0xff5cae : 0xffd23d).stroke({ width: 1, color: INK });
    }
    if (w.areaId === LEVEL_ID) {
      const c = w.spec.boss.crack;
      const cx = (c.x0 + c.x1) / 2;
      if (seen(cx, c.y - TILE) || run.data.mapRevealed) {
        const [x, y] = at(cx, c.y - TILE * 2);
        if (inBox(x, y)) mk.circle(x, y, big ? 6 : 4).fill(w.bossDead ? 0x9ef0ff : 0xff4d6d).stroke({ width: 1.5, color: INK });
      }
    }
    const [px, py] = at(p.x, p.y);
    mk.circle(px, py, (big ? 4.5 : 3.5) + Math.sin(t * 6) * 0.8).fill(0xff9a2e).stroke({ width: 1.5, color: 0xffffff });
    void run;
  }
}
