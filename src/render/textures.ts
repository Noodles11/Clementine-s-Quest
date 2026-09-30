// Procedurally generated textures (drawn once into canvases).

import { Texture } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../config';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

export interface TextureSet {
  soft: Texture;
  bubble: Texture;
  dot: Texture;
  ring: Texture;
  caustic: Texture;
  halftone: Texture;
  vignette: Texture;
  ray: Texture;
  fish: Texture[];
  spark: Texture;
  gradient: Texture;
  star: Texture;
  rock: Texture;
  grain: Texture;
}

let TEX: TextureSet | null = null;
export function tex(): TextureSet {
  if (!TEX) TEX = build();
  return TEX;
}

function build(): TextureSet {
  // Soft radial glow.
  const [sc, s] = canvas(128, 128);
  const g = s.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  s.fillStyle = g;
  s.fillRect(0, 0, 128, 128);

  // Ambient bubble: translucent with outline and highlight.
  const [bc, b] = canvas(64, 64);
  const bg = b.createRadialGradient(26, 24, 2, 32, 32, 30);
  bg.addColorStop(0, 'rgba(255,255,255,0.35)');
  bg.addColorStop(0.7, 'rgba(200,245,255,0.12)');
  bg.addColorStop(1, 'rgba(200,245,255,0.3)');
  b.fillStyle = bg;
  b.beginPath();
  b.arc(32, 32, 29, 0, Math.PI * 2);
  b.fill();
  b.lineWidth = 3;
  b.strokeStyle = 'rgba(235,255,255,0.85)';
  b.stroke();
  b.fillStyle = 'rgba(255,255,255,0.95)';
  b.beginPath();
  b.ellipse(22, 20, 7, 4.5, -0.6, 0, Math.PI * 2);
  b.fill();

  const [dc, d] = canvas(16, 16);
  const dg = d.createRadialGradient(8, 8, 0, 8, 8, 8);
  dg.addColorStop(0, 'rgba(255,255,255,1)');
  dg.addColorStop(0.5, 'rgba(255,255,255,0.7)');
  dg.addColorStop(1, 'rgba(255,255,255,0)');
  d.fillStyle = dg;
  d.fillRect(0, 0, 16, 16);

  const [rc, r] = canvas(64, 64);
  r.lineWidth = 4;
  r.strokeStyle = 'white';
  r.beginPath();
  r.arc(32, 32, 28, 0, Math.PI * 2);
  r.stroke();

  // Tileable caustics: layered warped cells.
  const CS = 256;
  const [cc, c] = canvas(CS, CS);
  const img = c.createImageData(CS, CS);
  const pts: [number, number][] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) pts.push([rnd() * CS, rnd() * CS]);
  for (let y = 0; y < CS; y++)
    for (let x = 0; x < CS; x++) {
      let d1 = 1e9, d2 = 1e9;
      for (const [px, py] of pts)
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            const dx = x - (px + ox * CS), dy = y - (py + oy * CS);
            const dd = dx * dx + dy * dy;
            if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
          }
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      const v = Math.max(0, 1 - edge / 7);
      const a = Math.pow(v, 2.2) * 255;
      const k = (y * CS + x) * 4;
      img.data[k] = 255; img.data[k + 1] = 255; img.data[k + 2] = 255; img.data[k + 3] = a;
    }
  c.putImageData(img, 0, 0);

  // Halftone dot overlay: denser toward the bottom (comic shading).
  const [hc, h] = canvas(VIEW_W, VIEW_H);
  h.fillStyle = 'rgba(0,0,0,1)';
  const step = 9;
  for (let y = 0; y < VIEW_H; y += step)
    for (let x = (y / step) % 2 ? step / 2 : 0; x < VIEW_W; x += step) {
      const t = y / VIEW_H;
      const edge = Math.min(1, Math.abs(x - VIEW_W / 2) / (VIEW_W / 2));
      const rad = Math.max(0, (t * t * 1.9 + edge * edge * 0.6) * 1.8);
      if (rad < 0.35) continue;
      h.beginPath();
      h.arc(x, y, rad, 0, Math.PI * 2);
      h.fill();
    }

  const [vc, v] = canvas(VIEW_W / 2, VIEW_H / 2);
  const vg = v.createRadialGradient(VIEW_W / 4, VIEW_H / 4, VIEW_H * 0.2, VIEW_W / 4, VIEW_H / 4, VIEW_W * 0.32);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  v.fillStyle = vg;
  v.fillRect(0, 0, VIEW_W / 2, VIEW_H / 2);

  // God ray: vertical fade, soft sides.
  const [yc, y] = canvas(64, 256);
  const yg = y.createLinearGradient(0, 0, 0, 256);
  yg.addColorStop(0, 'rgba(255,255,255,0.9)');
  yg.addColorStop(1, 'rgba(255,255,255,0)');
  y.fillStyle = yg;
  y.fillRect(0, 0, 64, 256);
  y.globalCompositeOperation = 'destination-in';
  const xg = y.createLinearGradient(0, 0, 64, 0);
  xg.addColorStop(0, 'rgba(0,0,0,0)');
  xg.addColorStop(0.5, 'rgba(0,0,0,1)');
  xg.addColorStop(1, 'rgba(0,0,0,0)');
  y.fillStyle = xg;
  y.fillRect(0, 0, 64, 256);

  // Fish silhouettes (white; tinted at runtime), facing right.
  const fish: Texture[] = [];
  const shapes: [number, number, number][] = [
    [40, 16, 0.5],
    [34, 20, 0.7],
    [48, 12, 0.35],
  ];
  for (const [w, hh, tail] of shapes) {
    const [fc, f] = canvas(64, 32);
    f.fillStyle = 'white';
    f.beginPath();
    f.ellipse(34, 16, w / 2, hh / 2, 0, 0, Math.PI * 2);
    f.fill();
    f.beginPath();
    f.moveTo(34 - w / 2 + 4, 16);
    f.lineTo(34 - w / 2 - 10, 16 - hh * tail);
    f.lineTo(34 - w / 2 - 10, 16 + hh * tail);
    f.closePath();
    f.fill();
    f.globalCompositeOperation = 'destination-out';
    f.beginPath();
    f.arc(34 + w / 2 - 7, 14, 2, 0, Math.PI * 2);
    f.fill();
    fish.push(Texture.from(fc));
  }

  const [pc, p] = canvas(32, 8);
  const pg = p.createLinearGradient(0, 0, 32, 0);
  pg.addColorStop(0, 'rgba(255,255,255,0)');
  pg.addColorStop(1, 'rgba(255,255,255,1)');
  p.fillStyle = pg;
  p.fillRect(0, 2, 32, 4);

  // Vertical gradient (white→black) used for ambient light.
  const [gc, gg] = canvas(4, 256);
  const lg = gg.createLinearGradient(0, 0, 0, 256);
  lg.addColorStop(0, 'white');
  lg.addColorStop(1, 'black');
  gg.fillStyle = lg;
  gg.fillRect(0, 0, 4, 256);

  const [stc, st] = canvas(32, 32);
  st.fillStyle = 'white';
  st.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rr = i % 2 ? 4 : 15;
    st.lineTo(16 + Math.cos(a) * rr, 16 + Math.sin(a) * rr);
  }
  st.closePath();
  st.fill();

  // Rock surface: multi-octave value noise with fine pores and cracks (multiply-blended).
  const RS = 256;
  const [rkc, rk] = canvas(RS, RS);
  const rimg = rk.createImageData(RS, RS);
  const hashN = (x: number, y: number, s0: number) => {
    let h = (x * 374761393 + y * 668265263 + s0 * 1442695) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const vnoise = (x: number, y: number, f: number, s0: number) => {
    const px = (x / RS) * f, py = (y / RS) * f;
    const ix = Math.floor(px), iy = Math.floor(py);
    const fx = px - ix, fy = py - iy;
    const w = (a: number) => ((a % f) + f) % f;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hashN(w(ix), w(iy), s0), b = hashN(w(ix + 1), w(iy), s0), c2 = hashN(w(ix), w(iy + 1), s0), d2 = hashN(w(ix + 1), w(iy + 1), s0);
    return (a * (1 - u) + b * u) * (1 - v) + (c2 * (1 - u) + d2 * u) * v;
  };
  for (let y = 0; y < RS; y++)
    for (let x = 0; x < RS; x++) {
      let n = vnoise(x, y, 4, 1) * 0.5 + vnoise(x, y, 8, 2) * 0.25 + vnoise(x, y, 16, 3) * 0.15 + vnoise(x, y, 64, 4) * 0.1;
      const ridge = Math.abs(vnoise(x, y, 6, 9) - 0.5);
      if (ridge < 0.015) n -= 0.12; // cracks
      const v = Math.max(0, Math.min(255, 165 + n * 90));
      const k = (y * RS + x) * 4;
      rimg.data[k] = v;
      rimg.data[k + 1] = v * 0.98;
      rimg.data[k + 2] = v * 0.95;
      rimg.data[k + 3] = 255;
    }
  rk.putImageData(rimg, 0, 0);

  // Film grain tile.
  const GS = 128;
  const [gnc, gn] = canvas(GS, GS);
  const gimg = gn.createImageData(GS, GS);
  for (let i = 0; i < GS * GS; i++) {
    const v = 128 + (Math.random() - 0.5) * 120;
    gimg.data[i * 4] = gimg.data[i * 4 + 1] = gimg.data[i * 4 + 2] = v;
    gimg.data[i * 4 + 3] = 255;
  }
  gn.putImageData(gimg, 0, 0);

  const caustic = Texture.from(cc);
  caustic.source.addressMode = 'repeat';
  return {
    soft: Texture.from(sc),
    bubble: Texture.from(bc),
    dot: Texture.from(dc),
    ring: Texture.from(rc),
    caustic,
    halftone: Texture.from(hc),
    vignette: Texture.from(vc),
    ray: Texture.from(yc),
    fish,
    spark: Texture.from(pc),
    gradient: Texture.from(gc),
    star: Texture.from(stc),
    rock: (() => {
      const t = Texture.from(rkc);
      t.source.addressMode = 'repeat';
      return t;
    })(),
    grain: (() => {
      const t = Texture.from(gnc);
      t.source.addressMode = 'repeat';
      return t;
    })(),
  };
}
