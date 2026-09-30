// In-game HUD: hearts, counters, active item, snack, stats, minimap, boss bar.

import { Container, Graphics, Text } from 'pixi.js';
import { EA, EW } from './style';
import { FONT_TITLE, FONT_UI, VIEW_W, VIEW_H } from '../config';
import { INK } from '../ambient/plants';
import { ITEM_BY_ID } from '../game/items';
import type { Run } from '../game/run';
import type { RoomWorld } from '../game/room';
import type { RoomType } from '../gen/floor';
import { heart } from './creatures';
import { drawItemIcon, drawPickup } from './icons';

const ROOM_ICON_COL: Partial<Record<RoomType, number>> = {
  treasure: 0xffd23d,
  shop: 0x5cf2a0,
  boss: 0xff4d6d,
  secret: 0xb06bff,
  curse: 0xd93b3b,
};

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
  private map = new Graphics();
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

  constructor() {
    this.container.addChild(this.osdG, this.g, this.map, this.coins, this.bombs, this.keys, this.stats, this.snack, this.bossName, this.depthLabel, this.charge, this.osd, this.osdRec);
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
    this.drawOSD(run, world, t);
    this.drawMap(run, world, t);
    // Hold Tab for a big map.
    const k = this.bigMap ? 2.2 : 1;
    this.map.scale.set(k);
    this.map.pivot.set(VIEW_W - 12, 12);
    this.map.position.set(this.bigMap ? VIEW_W - 40 : VIEW_W - 12, this.bigMap ? 50 : 12);
    this.map.alpha = this.bigMap ? 0.95 : 1;
  }

  /** Underwater-camera on-screen display: viewfinder, REC, timecode, depth, temperature. */
  private drawOSD(run: Run, world: RoomWorld, t: number) {
    const g = this.osdG;
    g.clear();
    const c = { color: 0xe8f4ff, alpha: 0.55, width: 1.5 };
    const m = 26, L = 22;
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [VIEW_W - m, m, -1, 1], [m, VIEW_H - m, 1, -1], [VIEW_W - m, VIEW_H - m, -1, -1]]) {
      g.moveTo(x, y + sy * L).lineTo(x, y).lineTo(x + sx * L, y).stroke(c);
    }
    // Centre crosshair ticks.
    g.moveTo(VIEW_W / 2 - 8, VIEW_H / 2).lineTo(VIEW_W / 2 - 3, VIEW_H / 2).moveTo(VIEW_W / 2 + 3, VIEW_H / 2).lineTo(VIEW_W / 2 + 8, VIEW_H / 2)
      .moveTo(VIEW_W / 2, VIEW_H / 2 - 8).lineTo(VIEW_W / 2, VIEW_H / 2 - 3).moveTo(VIEW_W / 2, VIEW_H / 2 + 3).lineTo(VIEW_W / 2, VIEW_H / 2 + 8)
      .stroke({ color: 0xe8f4ff, alpha: 0.2, width: 1 });
    const sec = run.data.time;
    const hh = Math.floor(sec / 3600), mm = Math.floor(sec / 60) % 60, ss = Math.floor(sec) % 60, ff = Math.floor((sec % 1) * 24);
    const tc = [hh, mm, ss, ff].map((v) => String(v).padStart(2, '0')).join(':');
    const depthBase = [0, 6, 28, 62][run.data.depth] ?? 60;
    const meters = depthBase + Math.max(0, world.room.y) * 4 + (world.player.y / world.heightPx) * 4;
    const temp = 24 - run.data.depth * 4.5 - (meters - depthBase) * 0.05;
    const rec = Math.floor(t * 1.2) % 2 === 0;
    this.osdRec.text = rec ? '● REC' : '  REC';
    this.osdRec.position.set(VIEW_W / 2 - 14, 30);
    this.osd.text = `${tc}   ${meters.toFixed(1)} m   ${temp.toFixed(1)}°C   ISO 3200`;
    this.osd.position.set(VIEW_W / 2 + 4, 30);
  }

  private drawMap(run: Run, world: RoomWorld, t: number) {
    const m = this.map;
    m.clear();
    const f = run.floor;
    const cs = 14, gap = 2;
    const oy = 12;
    // Crop to the explored bounding box for a compact map.
    const shown = new Set<number>();
    for (const r of f.rooms) {
      const st = run.data.rooms[String(r.id)];
      const visited = st?.visited;
      if (visited) shown.add(r.id);
      if (visited)
        for (const d of r.doors) {
          const key = d.to < r.id ? `${d.to}-${r.id}` : `${r.id}-${d.to}`;
          if (!d.hidden || run.data.openedDoors.includes(key)) shown.add(d.to);
        }
      if (run.data.mapRevealed && r.type !== 'secret') shown.add(r.id);
    }
    // Hide still-secret rooms unless opened or revealed.
    for (const r of f.rooms) {
      if (r.type !== 'secret') continue;
      const opened = r.doors.some((d) => run.data.openedDoors.includes(d.to < r.id ? `${d.to}-${r.id}` : `${r.id}-${d.to}`));
      if (!opened && !run.data.mapRevealed) shown.delete(r.id);
    }
    let minX = 13, minY = 13, maxX = 0, maxY = 0;
    for (const id of shown) {
      const r = f.rooms[id];
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w - 1);
      maxY = Math.max(maxY, r.y + r.h - 1);
    }
    if (!shown.size) return;
    const bw = (maxX - minX + 1) * (cs + gap) + 8, bh = (maxY - minY + 1) * (cs + gap) + 8;
    const bx = VIEW_W - bw - 12;
    m.roundRect(bx, oy, bw, bh, 8).fill({ color: 0x0b1a2e, alpha: 0.5 }).stroke({ width: (2.5) * EW, color: INK, alpha: EA });
    for (const id of shown) {
      const r = f.rooms[id];
      const st = run.data.rooms[String(r.id)];
      const x = bx + 4 + (r.x - minX) * (cs + gap), y = oy + 4 + (r.y - minY) * (cs + gap);
      const w = r.w * cs + (r.w - 1) * gap, h = r.h * cs + (r.h - 1) * gap;
      const cur = r.id === world.room.id || (world.room.id < 0 && r.type === 'boss');
      const col = cur ? 0xffffff : st?.visited ? 0xa8c8e8 : 0x4a6a8a;
      m.roundRect(x, y, w, h, 3).fill({ color: col, alpha: cur ? 1 : 0.9 }).stroke({ width: (1.5) * EW, color: INK, alpha: EA });
      const ic = ROOM_ICON_COL[r.type];
      if (ic) m.circle(x + w / 2, y + h / 2, 3.5).fill(ic).stroke({ width: (1) * EW, color: INK, alpha: EA });
      if (cur) m.circle(x + w / 2, y + h / 2, 2.5 + Math.sin(t * 6)).fill(0xff9a2e);
    }
  }
}
