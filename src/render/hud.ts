// In-game HUD: health bar, counters, active item, snack, stats, minimap, boss bar.

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

type Landmark = 'shop' | 'treasure' | 'secret' | 'curse' | 'boss' | 'rift';

/** Map icons for whole chambers. */
function drawLandmark(g: Graphics, k: Landmark, x: number, y: number, s: number, t: number) {
  const ring = { width: 1.5, color: 0x06101c, alpha: 0.9 };
  switch (k) {
    case 'shop': // a coin pouch
      g.circle(x, y + s * 0.15, s).fill(0x3fbf86).stroke(ring);
      g.rect(x - s * 0.35, y - s * 1.05, s * 0.7, s * 0.4).fill(0x3fbf86);
      g.circle(x, y + s * 0.15, s * 0.42).fill(0xffe14d);
      break;
    case 'treasure': // a gem
      g.poly([x, y - s, x + s, y - s * 0.2, x, y + s, x - s, y - s * 0.2]).fill(0xffd23d).stroke(ring);
      g.poly([x, y - s, x + s * 0.4, y - s * 0.2, x, y + s * 0.5, x - s * 0.4, y - s * 0.2]).fill({ color: 0xffffff, alpha: 0.35 });
      break;
    case 'secret':
      g.circle(x, y, s * 0.9).fill(0x9a6bff).stroke(ring);
      g.circle(x, y - s * 0.15, s * 0.32).fill(0xffffff);
      break;
    case 'curse':
      g.poly([x, y - s, x + s, y + s * 0.8, x - s, y + s * 0.8]).fill(0xd93b3b).stroke(ring);
      break;
    case 'boss': // a skull
      g.circle(x, y - s * 0.1, s).fill(0xff4d6d).stroke(ring);
      g.rect(x - s * 0.55, y + s * 0.5, s * 1.1, s * 0.5).fill(0xff4d6d);
      g.circle(x - s * 0.38, y - s * 0.15, s * 0.28).fill(0x1a0a14);
      g.circle(x + s * 0.38, y - s * 0.15, s * 0.28).fill(0x1a0a14);
      break;
    case 'rift':
      g.ellipse(x, y, s * 1.1, s * 0.5).fill({ color: 0x9ef0ff, alpha: 0.6 + Math.sin(t * 3) * 0.3 }).stroke(ring);
      break;
  }
}

/** Map samples per tile. */
const MAP_SUB = 3;

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
    this.hpText.anchor.set(0, 0.5);
    this.container.addChild(this.osdG, this.g, this.hpText, this.coins, this.bombs, this.stats, this.snack, this.bossName, this.depthLabel, this.charge, this.osd, this.osdRec, this.mapLayer);
    this.osd.anchor.set(0, 0);
    this.osdRec.anchor.set(1, 0);
    this.stats.alpha = 0.75;
    this.coins.position.set(104, 58);
    this.bombs.position.set(104, 82);
    this.stats.position.set(18, 114);
    this.stats.style.lineHeight = 17;
    this.snack.anchor.set(1, 1);
    this.snack.position.set(VIEW_W - 72, VIEW_H - 16);
    this.bossName.anchor.set(0.5, 1);
    this.bossName.position.set(VIEW_W / 2, VIEW_H - 30);
    this.depthLabel.anchor.set(0, 1);
    this.depthLabel.position.set(16, VIEW_H - 12);
  }

  bigMap = false;
  private trail = 1;
  private hpText = label(13);

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

    // Health bar: 100 HP base, foam extends it in pale blue.
    const bx = 104, by = 18;
    const bw = Math.min(440, d.maxHp * 2);
    const scale = bw / Math.max(1, d.maxHp); // px per HP
    const fw = Math.min(600 - bw, d.foam * scale);
    const bh = 16;
    g.roundRect(bx - 3, by - 3, bw + fw + 6, bh + 6, 6).fill({ color: 0x06101c, alpha: 0.6 }).stroke({ width: 2.5 * EW, color: INK, alpha: EA });
    // Recent damage drains slowly behind the bar.
    const frac = d.maxHp > 0 ? d.hp / d.maxHp : 0;
    this.trail = Math.max(frac, this.trail - 0.004);
    if (this.trail > frac) g.roundRect(bx, by, bw * this.trail, bh, 4).fill({ color: 0xffe0a0, alpha: 0.6 });
    const low = frac <= 0.25;
    const col = low ? (Math.floor(t * 3) % 2 === 0 ? 0xff2d4a : 0xd9283e) : frac <= 0.5 ? 0xe8723a : 0xd94a5a;
    if (d.hp > 0) g.roundRect(bx, by, Math.max(4, bw * frac), bh, 4).fill(col);
    g.roundRect(bx, by, Math.max(4, bw * frac), bh * 0.4, 3).fill({ color: 0xffffff, alpha: 0.18 });
    if (fw > 0) g.roundRect(bx + bw, by, fw, bh, 4).fill(0xbfeaff).stroke({ width: 1, color: 0x6ab8d8, alpha: 0.8 });
    // Ticks every 25 HP.
    for (let v = 25; v < d.maxHp && d.maxHp <= 300; v += 25) g.moveTo(bx + v * scale, by + 2).lineTo(bx + v * scale, by + bh - 2).stroke({ width: 1, color: 0x000000, alpha: 0.25 });
    this.hpText.text = d.foam > 0 ? `${d.hp} / ${d.maxHp}  +${d.foam}` : `${d.hp} / ${d.maxHp}`;
    this.hpText.position.set(bx + 6, by + bh / 2);

    // Counters.
    drawPickup(g, 'coin', 92, 70, 0);
    drawPickup(g, 'bomb', 92, 94, 0);
    this.coins.text = String(d.coins).padStart(2, '0');
    this.bombs.text = String(d.bombs).padStart(2, '0');
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

    this.depthLabel.text = world.biome.name.toUpperCase() + (world.depth < 7 && world.areaId === LEVEL_ID ? `  ·  ${world.stage}/3` : '');
    this.depthLabel.visible = !this.bigMap;
    this.drawMap(run, world, t);
  }

  /** Repaint the fog-of-war map: open water that has been seen, outlined by its rock. */
  /** Samples of the drawn rock (true = rock), 3 per tile, so the map matches the reef and its craters. */
  rockAt: (x: number, y: number) => boolean = () => false;
  private rockBits = new Uint8Array(0);
  private rockWorld: RoomWorld | null = null;
  private rockHoles = 0;

  private sampleRock(w: RoomWorld, x0: number, y0: number, x1: number, y1: number) {
    const W = w.tw * MAP_SUB, H = w.th * MAP_SUB;
    const step = TILE / MAP_SUB;
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++)
      for (let x = Math.max(0, x0); x < Math.min(W, x1); x++)
        this.rockBits[y * W + x] = this.rockAt((x + 0.5) * step, (y + 0.5) * step) ? 1 : 0;
  }

  private updateRock(w: RoomWorld) {
    const W = w.tw * MAP_SUB, H = w.th * MAP_SUB;
    if (this.rockWorld !== w) {
      this.rockWorld = w;
      this.rockBits = new Uint8Array(W * H);
      this.sampleRock(w, 0, 0, W, H);
      this.rockHoles = w.holes.length;
      return true;
    }
    if (w.holes.length === this.rockHoles) return false;
    const step = TILE / MAP_SUB;
    for (const ho of w.holes.slice(this.rockHoles)) {
      const m = ho.r + TILE;
      this.sampleRock(w, Math.floor((ho.x - m) / step), Math.floor((ho.y - m) / step), Math.ceil((ho.x + m) / step), Math.ceil((ho.y + m) / step));
    }
    this.rockHoles = w.holes.length;
    return true;
  }

  /** Repaint the fog-of-war map: open water that has been seen, outlined by its rock. */
  private legendLabels = new Map<string, Text>();
  private legend(k: string) {
    let l = this.legendLabels.get(k);
    if (!l) {
      l = label(12, 0xe8f4ff);
      l.anchor.set(0, 0.5);
      this.mapLayer.addChild(l);
      this.legendLabels.set(k, l);
    }
    return l;
  }

  private paintMap(w: RoomWorld) {
    const W = w.tw * MAP_SUB, H = w.th * MAP_SUB;
    let c = this.mapCanvas;
    if (c.width !== W || c.height !== H) {
      // Textures are cached per canvas, so a new size needs a new canvas.
      c = this.mapCanvas = document.createElement('canvas');
      c.width = W;
      c.height = H;
      this.mapTex = null;
    }
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(W, H);
    const d = img.data;
    const rock = this.rockBits;
    const { tw, explored } = w;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!explored[Math.floor(y / MAP_SUB) * tw + Math.floor(x / MAP_SUB)]) continue;
        const i = y * W + x;
        let r = 0, g = 0, b = 0, a = 0;
        if (!rock[i]) {
          r = 40; g = 78; b = 118; a = 200;
        } else {
          const edge = (x > 0 && !rock[i - 1]) || (x < W - 1 && !rock[i + 1]) || (y > 0 && !rock[i - W]) || (y < H - 1 && !rock[i + W]);
          if (edge) {
            r = 190; g = 214; b = 236; a = 235;
          } else {
            // Seen rock: a dark, solid silhouette so passages read clearly.
            r = 14; g = 26; b = 38; a = 170;
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
      this.mapTex.source.scaleMode = 'linear';
      this.mapSprite.texture = this.mapTex;
    } else this.mapTex.source.update();
  }

  private drawMap(run: Run, w: RoomWorld, t: number) {
    const fr = this.mapFrame, mk = this.mapMarks, mask = this.mapMask;
    fr.clear();
    mk.clear();
    mask.clear();
    const rockChanged = this.updateRock(w);
    if (rockChanged || this.mapWorld !== w || this.mapVersion !== w.exploredVersion) {
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
    this.mapSprite.scale.set(k / MAP_SUB);
    const at = (x: number, y: number) => [ox + (x / TILE) * k, oy + (y / TILE) * k] as const;
    const inBox = (x: number, y: number) => x > bx + 4 && x < bx + bw - 4 && y > by + 4 && y < by + bh - 4;
    const seen = (x: number, y: number) => {
      const i = Math.floor(y / TILE) * w.tw + Math.floor(x / TILE);
      return !!w.explored[i];
    };
    // Landmarks: whole chambers are marked once any part of them has been seen.
    const sz = big ? 7 : 5;
    const marks: { kind: Landmark; x: number; y: number }[] = [];
    if (w.areaId === LEVEL_ID) {
      for (const ch of w.spec.chambers) {
        const kind: Landmark | null = ch.kind === 'boss' ? 'boss' : ch.cave === 'shop' ? 'shop' : ch.cave === 'treasure' ? 'treasure' : ch.cave === 'secret' ? 'secret' : ch.cave === 'curse' ? 'curse' : null;
        if (!kind) continue;
        const cx = ch.cx * TILE, cy = ch.cy * TILE;
        const known = seen(cx, cy) || seen(cx - ch.rx * TILE * 0.6, cy) || seen(cx + ch.rx * TILE * 0.6, cy) ||
          ((run.data.mapRevealed || run.stats.flags.has('compass')) && kind !== 'secret');
        if (known) marks.push({ kind, x: cx, y: cy });
      }
      if (w.bossDead) {
        const c = w.spec.boss.crack;
        marks.push({ kind: 'rift', x: (c.x0 + c.x1) / 2, y: c.y - TILE });
      }
    }
    for (const m of marks) {
      const [x, y] = at(m.x, m.y);
      if (inBox(x, y)) drawLandmark(mk, m.kind, x, y, sz, t);
    }
    if (big) {
      // Legend under the map.
      const items: [Landmark, string][] = [['shop', 'Shop'], ['treasure', 'Treasure'], ['secret', 'Secret'], ['curse', 'Curse den'], ['boss', 'Boss'], ['rift', 'Rift']];
      let lx = bx + 16;
      const ly = by + bh + 14;
      for (const [k, txt] of items) {
        drawLandmark(mk, k, lx, ly, 6, t);
        const lab = this.legend(k);
        lab.text = txt;
        lab.position.set(lx + 11, ly);
        lab.visible = true;
        lx += 30 + txt.length * 7.5;
      }
    } else for (const lab of this.legendLabels.values()) lab.visible = false;
    const [px, py] = at(p.x, p.y);
    mk.circle(px, py, (big ? 4.5 : 3.5) + Math.sin(t * 6) * 0.8).fill(0xff9a2e).stroke({ width: 1.5, color: 0xffffff });
    void run;
  }
}
