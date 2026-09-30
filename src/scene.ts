// GameScene: owns the Pixi layer stack, the live RoomWorld, transitions,
// ambient simulation (water, fish, plants, snow), lighting and bloom.

import {
  Application,
  BlurFilter,
  Container,
  DisplacementFilter,
  Graphics,
  RenderTexture,
  Sprite,
  Text,
  Texture,
  TilingSprite,
} from 'pixi.js';
import { DT, FONT_UI, VIEW_H, VIEW_W } from './config';
import { clamp, darken, lighten, mixColor } from './core/math';
import { cosmetic as R } from './core/rng';
import { input } from './core/input';
import { setPitchShift, sfx } from './core/audio';
import type { Options } from './core/save';
import { FishSchools } from './ambient/boids';
import { ParticleSystem } from './ambient/particles';
import { INK, PlantSystem } from './ambient/plants';
import { biomeFor, type Biome } from './gen/biomes';
import { type FloorRoom, type Side } from './gen/floor';
import { createBoss, type Boss } from './game/bosses';
import { createEnemy } from './game/enemies';
import { ITEM_BY_ID } from './game/items';
import type { Run } from './game/run';
import { GROTTO_ID, RoomWorld, type WorldEvent } from './game/room';
import { drawBoss, drawEnemy, drawEnemyGlow } from './render/creatures';
import { FxSystem } from './render/fxsys';
import { Hud } from './render/hud';
import { drawItemIcon, drawPedestal, drawPickup } from './render/icons';
import { JellyView } from './render/jelly';
import { TerrainView } from './render/terrain';
import { tex } from './render/textures';
import { drawBubble, drawDoor, drawProp, drawShot, drawWorldExtras } from './render/worldart';

export interface SceneHooks {
  onEvent(ev: WorldEvent): void;
  onDeath(by: string): void;
  onVictory(): void;
  onPause(): void;
  onRestart(): void;
  onAutosave(): void;
  onFloorStart(depth: number): void;
  onBossIntro(boss: Boss): Promise<void>;
}

type Mode = 'idle' | 'attract' | 'play' | 'paused' | 'transition' | 'dead' | 'splash';

interface Transition {
  t: number;
  dir: Side | 'down' | 'fade';
  swapped: boolean;
  swap: () => void;
}

const bgCache = new Map<number, Texture>();
function waterTexture(b: Biome): Texture {
  let t = bgCache.get(b.depth);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  gr.addColorStop(0, hex(lighten(b.waterTop, 0.12)));
  gr.addColorStop(0.55, hex(b.waterTop));
  gr.addColorStop(1, hex(b.waterBottom));
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  t = Texture.from(c);
  bgCache.set(b.depth, t);
  return t;
}
const ambCache = new Map<number, Texture>();
function ambientTexture(b: Biome): Texture {
  let t = ambCache.get(b.depth);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  const v = (x: number) => Math.round(clamp(x, 0, 1) * 255);
  gr.addColorStop(0, `rgb(${v(b.lightTop)},${v(b.lightTop)},${v(b.lightTop * 0.98)})`);
  gr.addColorStop(1, `rgb(${v(b.lightBottom * 0.92)},${v(b.lightBottom * 0.96)},${v(b.lightBottom)})`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  t = Texture.from(c);
  ambCache.set(b.depth, t);
  return t;
}

export class GameScene {
  app: Application;
  hooks: SceneHooks;
  options: Options;
  run: Run | null = null;
  world: RoomWorld | null = null;
  mode: Mode = 'idle';
  time = 0;
  private acc = 0;

  // Layers.
  root = new Container();
  worldView = new Container();
  bg = new Container();
  bgWater: Sprite;
  bgCaustic: TilingSprite;
  bgSil = new Graphics();
  fishFar = new Container();
  rays = new Container();
  fishNear = new Container();
  cam = new Container();
  terrain = new TerrainView();
  plantsLayer = new Container();
  doorsG = new Graphics();
  propsG = new Graphics();
  itemsG = new Graphics();
  enemiesG = new Graphics();
  projG = new Graphics();
  jellyLayer = new Container();
  labels = new Container();
  hintLayer = new Container();
  glowRoot = new Container();
  glowCam = new Container();
  glowG = new Graphics();
  fgLayer = new Container();
  fgG = new Graphics();
  overlay = new Container();
  frameG = new Graphics();
  transG = new Graphics();
  flashLayer = new Container();
  hud = new Hud();

  fx: FxSystem;
  jelly: JellyView | null = null;
  plants: PlantSystem | null = null;
  schools: FishSchools[] = [];
  snow: ParticleSystem;
  fgSnow: ParticleSystem;
  raySprites: Sprite[] = [];
  vents: { x: number; y: number; t: number }[] = [];
  pedLabels = new Map<object, Text>();

  // Lighting.
  lightRT: RenderTexture;
  lightRoot = new Container();
  ambient: Sprite;
  lightPool: Sprite[] = [];
  lightSprite: Sprite;
  // Water refraction.
  dispCanvas: HTMLCanvasElement;
  dispCtx: CanvasRenderingContext2D;
  dispTex: Texture | null = null;
  dispSprite: Sprite | null = null;
  dispFilter: DisplacementFilter | null = null;
  blur: BlurFilter;

  transition: Transition | null = null;
  camX = 0;
  camY = 0;
  restartHold = 0;
  frameTimes: number[] = [];
  qualityLevel = 2;
  private lastQualityCheck = 0;

  constructor(app: Application, hooks: SceneHooks, options: Options) {
    this.app = app;
    this.hooks = hooks;
    this.options = options;
    const T = tex();

    this.bgWater = new Sprite(Texture.WHITE);
    this.bgWater.width = VIEW_W;
    this.bgWater.height = VIEW_H;
    this.bgCaustic = new TilingSprite({ texture: T.caustic, width: VIEW_W, height: VIEW_H });
    this.bgCaustic.blendMode = 'add';
    this.bgCaustic.alpha = 0.05;
    this.bg.addChild(this.bgWater, this.bgSil, this.bgCaustic);
    this.rays.blendMode = 'add';

    this.fx = new FxSystem(this.flashLayer);
    this.snow = new ParticleSystem({ snow: T.dot, dot: T.dot }, 400);
    this.fgSnow = new ParticleSystem({ snow: T.soft, dot: T.soft }, 60);

    this.cam.addChild(
      this.hintLayer,
      this.terrain.container,
      this.plantsLayer,
      this.doorsG,
      this.propsG,
      this.snow.container,
      this.itemsG,
      this.enemiesG,
      this.jellyLayer,
      this.projG,
      this.fx.world.container,
      this.labels,
      this.fx.textLayer,
    );
    this.worldView.addChild(this.bg, this.fishFar, this.rays, this.fishNear, this.cam);

    // Lightmap (multiplied over the world).
    this.lightRT = RenderTexture.create({ width: VIEW_W / 2, height: VIEW_H / 2 });
    this.ambient = new Sprite(Texture.WHITE);
    this.ambient.width = VIEW_W;
    this.ambient.height = VIEW_H;
    this.lightRoot.addChild(this.ambient);
    this.lightRoot.scale.set(0.5);
    this.lightSprite = new Sprite(this.lightRT);
    this.lightSprite.scale.set(2);
    this.lightSprite.blendMode = 'multiply';

    // Bloom.
    this.blur = new BlurFilter({ strength: 10, quality: 3 });
    this.blur.blendMode = 'add';
    this.glowRoot.filters = [this.blur];
    this.glowCam.addChild(this.glowG, this.fx.glow.container);
    this.glowRoot.addChild(this.glowCam);

    this.fgLayer.addChild(this.fgSnow.container, this.fgG);

    // Overlays.
    const half = new Sprite(T.halftone);
    half.alpha = 0.07;
    half.blendMode = 'multiply';
    const vig = new Sprite(T.vignette);
    vig.scale.set(2);
    this.overlay.addChild(half, vig, this.frameG);

    this.root.addChild(this.worldView, this.lightSprite, this.glowRoot, this.fgLayer, this.overlay, this.flashLayer, this.transG);
    app.stage.addChild(this.root, this.hud.container);
    this.hud.container.visible = false;

    // Refraction map.
    this.dispCanvas = document.createElement('canvas');
    this.dispCtx = this.dispCanvas.getContext('2d')!;

    this.fx.onExplosion = (x, y) => {
      for (const s of this.schools) s.scare(x, y, 400, 1.2);
    };
    this.applyOptions(options);
    this.drawFrame();
  }

  applyOptions(o: Options) {
    this.options = o;
    this.fx.shakeScale = o.screenShake ? 1 : 0;
    this.fx.flashScale = o.reducedFlash ? 0.25 : 1;
    this.blur.strength = o.reducedFlash ? 6 : 10;
    this.glowRoot.alpha = o.reducedFlash ? 0.6 : 1;
    if (o.quality === 'low') this.qualityLevel = 0;
    else if (o.quality === 'medium') this.qualityLevel = 1;
    else this.qualityLevel = 2;
    this.drawFrame();
    this.updateRefractionFilter();
  }

  private drawFrame() {
    const g = this.frameG;
    g.clear();
    if (!this.options.tankFrame) return;
    // Aquarium glass edge + comic panel border.
    g.rect(0, 0, VIEW_W, VIEW_H).stroke({ width: 10, color: INK });
    g.roundRect(5, 5, VIEW_W - 10, VIEW_H - 10, 14).stroke({ width: 3, color: 0xbfefff, alpha: 0.35 });
    g.poly([VIEW_W * 0.62, 5, VIEW_W * 0.7, 5, VIEW_W * 0.52, VIEW_H - 5, VIEW_W * 0.44, VIEW_H - 5]).fill({ color: 0xffffff, alpha: 0.035 });
    g.poly([VIEW_W * 0.73, 5, VIEW_W * 0.745, 5, VIEW_W * 0.565, VIEW_H - 5, VIEW_W * 0.55, VIEW_H - 5]).fill({ color: 0xffffff, alpha: 0.05 });
  }

  // ── Run control ──────────────────────────────────────────
  startRun(run: Run, fresh: boolean) {
    this.run = run;
    const d = run.data;
    const room = this.roomById(d.currentRoom);
    this.buildWorld(room, { side: d.entrySide, from: d.entryFrom });
    this.mode = 'play';
    this.hud.container.visible = true;
    input.clear();
    if (fresh || d.entrySide === null) this.hooks.onFloorStart(d.depth);
    this.checkBossIntro();
  }

  attractPending = false;
  startAttract(run: Run) {
    this.run = run;
    this.attractPending = true;
    this.buildWorld(run.floor.rooms[run.floor.startId], { side: null, from: -1 });
    this.attractPending = false;
    this.mode = 'attract';
    this.hud.container.visible = false;
  }

  stop() {
    this.mode = 'idle';
    this.hud.container.visible = false;
  }

  pause() {
    if (this.mode === 'play') {
      this.mode = 'paused';
      this.world?.persist();
    }
  }
  resume() {
    if (this.mode === 'paused') this.mode = 'play';
    input.clear();
  }

  /** Debug helper: jump straight to a room of the current floor. */
  debugWarp(id: number) {
    this.buildWorld(this.roomById(id), { side: null, from: -1 });
    this.mode = 'play';
    this.checkBossIntro();
  }

  private roomById(id: number): FloorRoom {
    const run = this.run!;
    if (id === GROTTO_ID) {
      const boss = run.floor.rooms[run.floor.bossId];
      return { id: GROTTO_ID, type: 'grotto', x: -1, y: -1, w: 1, h: 1, dist: 99, doors: [], seed: boss.seed ^ 0x9e37, grottoItems: boss.grottoItems };
    }
    return run.floor.rooms[id];
  }

  private buildWorld(room: FloorRoom, entry: { side: Side | null; from: number; door?: import('./gen/floor').DoorSpec }) {
    const run = this.run!;
    const old = this.world;
    if (old) old.persist();
    const w = new RoomWorld(run, room, this.fx, this.options, entry);
    this.world = w;
    run.data.currentRoom = room.id;
    run.data.entrySide = entry.side;
    run.data.entryFrom = entry.from;
    const b = w.biome;
    setPitchShift(1 - b.menace * 0.25);

    // Visual rebuild.
    this.fx.clear();
    this.fx.sandColor = b.sand;
    this.terrain.build(w);
    w.terrainDirty = false;
    this.plantsLayer.removeChildren();
    this.plants = new PlantSystem(w.layout.decor, b.menace);
    this.plantsLayer.addChild(this.plants.container);
    this.jellyLayer.removeChildren();
    const size = run.data.seedCode === 'HUGEJELL' ? 1.7 : run.data.seedCode === 'TEENYJEL' ? 0.6 : 1;
    this.jelly = new JellyView(w.player.x, w.player.y, size);
    this.jellyLayer.addChild(this.jelly.container);
    for (const [, l] of this.pedLabels) l.destroy();
    this.pedLabels.clear();
    this.hintLayer.removeChildren().forEach((c) => c.destroy());
    if (w.layout.hintText && this.mode !== 'attract' && !this.attractPending) this.drawHints(w);

    this.bgWater.texture = waterTexture(b);
    this.bgWater.width = VIEW_W;
    this.bgWater.height = VIEW_H;
    this.ambient.texture = ambientTexture(b);
    this.ambient.width = VIEW_W;
    this.ambient.height = VIEW_H;
    this.drawSilhouettes(b, room.seed);

    this.fishFar.removeChildren();
    this.fishNear.removeChildren();
    const q = this.qualityLevel;
    const fishCount = Math.round(b.fishCount * (q === 0 ? 0.4 : q === 1 ? 0.7 : 1));
    const colors = b.decoColors;
    this.schools = [
      new FishSchools(VIEW_W, VIEW_H * 0.9, Math.round(fishCount * 0.55), 0.35, tex().fish, colors, b.waterBottom),
      new FishSchools(VIEW_W, VIEW_H * 0.9, Math.round(fishCount * 0.45), 0.7, tex().fish, colors, b.waterTop),
    ];
    this.fishFar.addChild(this.schools[0].container);
    this.fishNear.addChild(this.schools[1].container);

    // God rays.
    this.rays.removeChildren();
    this.raySprites = [];
    const nRays = Math.round(2 + b.godRays * 4);
    for (let i = 0; i < nRays; i++) {
      const s = new Sprite(tex().ray);
      s.anchor.set(0.5, 0);
      s.x = R.range(0, VIEW_W);
      s.y = -20;
      s.width = R.range(60, 170);
      s.height = VIEW_H * R.range(0.9, 1.3);
      s.rotation = -0.35 + R.range(-0.05, 0.05);
      s.tint = mixColor(0xffffff, b.waterTop, 0.2);
      (s as any).base = b.godRays * R.range(0.12, 0.3);
      (s as any).ph = R.range(0, 10);
      this.rays.addChild(s);
      this.raySprites.push(s);
    }

    // Marine snow.
    this.snow.clear();
    this.snow.bounds = { w: w.widthPx, h: w.heightPx };
    const snowN = Math.round(b.snowCount * (q === 0 ? 0.35 : q === 1 ? 0.7 : 1));
    for (let i = 0; i < snowN; i++) {
      this.snow.spawn({
        kind: 'snow', x: R.range(0, w.widthPx), y: R.range(0, w.heightPx), size: R.range(1.5, 4.2),
        alpha: R.range(0.25, 0.7), color: mixColor(0xffffff, b.waterTop, 0.25), wrap: true, gravity: 6, drag: 0.8, fluid: 0.9, life: 1,
      });
    }
    this.fgSnow.clear();
    this.fgSnow.bounds = { w: VIEW_W, h: VIEW_H };
    for (let i = 0; i < (q === 0 ? 6 : 16); i++) {
      this.fgSnow.spawn({ kind: 'snow', x: R.range(0, VIEW_W), y: R.range(0, VIEW_H), size: R.range(14, 34), alpha: R.range(0.06, 0.16), wrap: true, vx: R.range(-8, 8), vy: R.range(2, 8), drag: 0, fluid: 0, life: 1 });
    }
    this.drawForeground(b, room.seed);

    // Bubble vents on the floor.
    this.vents = [];
    for (const d of w.layout.decor) if ((d.kind === 'rockling' || d.kind === 'shell') && R.chance(0.4)) this.vents.push({ x: d.x, y: d.y - 6, t: R.range(0, 3) });

    this.setupRefraction(w);
    this.updateCamera(true);
  }

  /** Tutorial doodles on the back wall of the very first room. */
  private drawHints(w: RoomWorld) {
    const lines: [string, number, number][] = [
      ['W A S D  to swim', 0.26, 0.3],
      ['ARROWS  to shoot', 0.26, 0.42],
      ['E  ink bomb   ·   SPACE  active   ·   Q  snack', 0.5, 0.62],
      ['Let go and you slowly sink~', 0.74, 0.3],
    ];
    for (const [txt, fx, fy] of lines) {
      const t = new Text({
        text: txt,
        style: { fontFamily: FONT_UI, fontSize: 20, fontWeight: '700', fill: 0xffffff, stroke: { color: INK, width: 5 }, align: 'center' },
      });
      t.anchor.set(0.5);
      t.alpha = 0.55;
      t.rotation = (fx - 0.5) * 0.08;
      t.position.set(w.widthPx * fx, w.heightPx * fy);
      this.hintLayer.addChild(t);
    }
  }

  private drawSilhouettes(b: Biome, seed: number) {
    const g = this.bgSil;
    g.clear();
    const far = mixColor(b.waterBottom, b.waterTop, 0.35);
    const near = darken(b.waterBottom, 0.15);
    let s = seed;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (const [col, base, amp, alpha] of [[far, VIEW_H * 0.72, 70, 0.55], [near, VIEW_H * 0.85, 50, 0.6]] as const) {
      g.moveTo(0, VIEW_H);
      const off = rnd() * 100;
      for (let x = 0; x <= VIEW_W; x += 20) g.lineTo(x, base - Math.abs(Math.sin(x * 0.012 + off)) * amp - Math.sin(x * 0.041 + off) * 12);
      g.lineTo(VIEW_W, VIEW_H).closePath().fill({ color: col, alpha });
    }
    if (b.depth === 2) {
      for (let i = 0; i < 9; i++) {
        const x = rnd() * VIEW_W, h = 200 + rnd() * 250;
        g.moveTo(x, VIEW_H).quadraticCurveTo(x + 30, VIEW_H - h / 2, x + (rnd() - 0.5) * 60, VIEW_H - h).stroke({ width: 10 + rnd() * 8, color: far, alpha: 0.45 });
      }
    }
    if (b.depth === 3) {
      // Sunken ship silhouette.
      const x = VIEW_W * (0.3 + rnd() * 0.4), y = VIEW_H * 0.72;
      g.moveTo(x - 220, y).lineTo(x + 180, y - 40).lineTo(x + 150, y + 60).lineTo(x - 180, y + 80).closePath().fill({ color: near, alpha: 0.7 });
      g.moveTo(x - 30, y - 10).lineTo(x - 60, y - 230).stroke({ width: 10, color: near, alpha: 0.7 });
      g.moveTo(x + 90, y - 30).lineTo(x + 110, y - 190).stroke({ width: 8, color: near, alpha: 0.7 });
      g.moveTo(x - 60, y - 200).lineTo(x + 40, y - 190).stroke({ width: 5, color: near, alpha: 0.6 });
    }
    if (b.depth === 1) {
      for (let i = 0; i < 6; i++) {
        const x = rnd() * VIEW_W, y = VIEW_H * (0.72 + rnd() * 0.1);
        g.circle(x, y, 20 + rnd() * 30).fill({ color: far, alpha: 0.5 });
      }
    }
  }

  private drawForeground(b: Biome, seed: number) {
    const g = this.fgG;
    g.clear();
    let s = seed ^ 0xabc;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const col = darken(b.waterBottom, 0.55);
    // Out-of-focus plants in front of the glass, only at the bottom corners.
    for (const side of [0, 1]) {
      const bx = side ? VIEW_W - 30 - rnd() * 60 : 30 + rnd() * 60;
      for (let i = 0; i < 3; i++) {
        const x = bx + (rnd() - 0.5) * 70, h = 60 + rnd() * 90;
        g.moveTo(x - 10, VIEW_H + 10).quadraticCurveTo(x + (rnd() - 0.5) * 40, VIEW_H - h / 2, x + (rnd() - 0.5) * 30, VIEW_H - h)
          .quadraticCurveTo(x + 18, VIEW_H - h / 2, x + 10, VIEW_H + 10).fill({ color: col, alpha: 0.8 });
      }
    }
    g.filters = [new BlurFilter({ strength: 6, quality: 2 })];
  }

  // ── Refraction (displacement from the fluid field) ─────────
  private setupRefraction(w: RoomWorld) {
    const f = w.fluid;
    this.dispCanvas = document.createElement('canvas');
    this.dispCanvas.width = f.nx;
    this.dispCanvas.height = f.ny;
    this.dispCtx = this.dispCanvas.getContext('2d')!;
    const oldTex = this.dispTex;
    this.dispTex = Texture.from(this.dispCanvas);
    if (oldTex) setTimeout(() => oldTex.destroy(true), 500);
    if (!this.dispSprite) {
      this.dispSprite = new Sprite(this.dispTex);
      this.dispSprite.renderable = false;
      this.cam.addChild(this.dispSprite);
    } else this.dispSprite.texture = this.dispTex;
    this.dispSprite.scale.set(f.cell);
    this.updateRefractionFilter();
  }

  private updateRefractionFilter() {
    if (!this.dispSprite) return;
    const on = this.qualityLevel >= 2 && !this.options.calmWater;
    if (on) {
      if (!this.dispFilter) this.dispFilter = new DisplacementFilter({ sprite: this.dispSprite, scale: 10 });
      this.worldView.filters = [this.dispFilter];
    } else this.worldView.filters = [];
  }

  private updateRefractionMap(w: RoomWorld) {
    if (!this.dispFilter || !this.worldView.filters?.length) return;
    const f = w.fluid;
    const img = this.dispCtx.createImageData(f.nx, f.ny);
    const d = img.data;
    const t = this.time;
    for (let j = 0; j < f.ny; j++)
      for (let i = 0; i < f.nx; i++) {
        const k = j * f.nx + i;
        const amb = Math.sin(i * 0.5 + t * 1.6) * 5 + Math.cos(j * 0.6 - t * 1.2) * 5;
        d[k * 4] = clamp(128 + f.u[k] * 0.35 + amb, 0, 255);
        d[k * 4 + 1] = clamp(128 + f.v[k] * 0.35 + amb * 0.6, 0, 255);
        d[k * 4 + 2] = 128;
        d[k * 4 + 3] = 255;
      }
    this.dispCtx.putImageData(img, 0, 0);
    this.dispTex!.source.update();
  }

  // ── Frame ──────────────────────────────────────────────────
  update(frameDt: number) {
    const dt = Math.min(frameDt, 0.1);
    this.time += dt;
    this.trackPerformance(frameDt);
    const w = this.world;
    if (!w) return;

    if (this.mode === 'play') {
      if (input.wasPressed('Escape') || input.wasPressed('KeyP')) {
        this.pause();
        this.hooks.onPause();
        input.endFrame();
        return;
      }
      if (input.isDown('KeyR')) {
        this.restartHold += dt;
        if (this.restartHold > 1.2) {
          this.restartHold = 0;
          this.hooks.onRestart();
          return;
        }
      } else this.restartHold = 0;
      this.acc += dt;
      let steps = 0;
      while (this.acc >= DT && steps < 5) {
        this.acc -= DT;
        steps++;
        if (this.fx.hitstopFrames > 0) {
          this.fx.hitstopFrames--;
          continue;
        }
        w.step(DT);
        input.endFrame();
        this.drainEvents();
        if (this.mode !== 'play' || this.world !== w) break;
      }
    } else if (this.mode === 'attract') {
      this.attractStep(w, dt);
    } else if (this.mode === 'transition' && this.transition) {
      const tr = this.transition;
      tr.t += dt / 0.28;
      if (tr.t >= 1 && !tr.swapped) {
        tr.swapped = true;
        tr.swap();
      }
      if (tr.t >= 2) {
        this.transition = null;
        this.mode = 'play';
        this.checkBossIntro();
      }
      w.fluid.step(dt);
    } else if (this.mode === 'dead' || this.mode === 'splash' || this.mode === 'paused') {
      w.fluid.step(dt * 0.3);
    }
    this.render(dt);
  }

  private attractStep(w: RoomWorld, dt: number) {
    const p = w.player;
    const t = this.time;
    const tx = w.widthPx * 0.62 + Math.sin(t * 0.35) * 170;
    const ty = w.heightPx * 0.42 + Math.sin(t * 0.61) * 70;
    const vx = (tx - p.x) * 1.5, vy = (ty - p.y) * 1.5;
    p.vx = vx;
    p.vy = vy;
    p.x += vx * dt;
    p.y += vy * dt;
    p.moving = true;
    p.pulse += dt * 1.6;
    if (p.pulse > 1) {
      p.pulse = 0;
      p.kick();
    }
    p.pulseKick = Math.max(0, p.pulseKick - dt * 3);
    if (R.chance(dt * 2)) w.fluid.splat(p.x, p.y + 20, -vx * 0.5, 60, 30);
    w.fluid.step(dt);
  }

  private drainEvents() {
    const w = this.world!;
    const evs = w.events.splice(0);
    for (const ev of evs) {
      switch (ev.type) {
        case 'exit':
          this.beginTransition(ev.door.side, () => {
            this.buildWorld(this.roomById(ev.door.to), { side: ev.door.side, from: w.room.id, door: ev.door });
            this.hooks.onAutosave();
          });
          sfx.splash();
          break;
        case 'descend':
          sfx.descend();
          this.beginTransition('down', () => {
            this.run!.nextFloor();
            this.buildWorld(this.roomById(this.run!.floor.startId), { side: null, from: -1 });
            this.hooks.onAutosave();
            this.hooks.onFloorStart(this.run!.data.depth);
          });
          break;
        case 'surface':
          this.mode = 'dead';
          this.hooks.onVictory();
          break;
        case 'grotto':
          this.beginTransition('fade', () => {
            this.buildWorld(this.roomById(GROTTO_ID), { side: null, from: this.run!.floor.bossId });
            this.hooks.onAutosave();
          });
          break;
        case 'grottoExit':
          this.beginTransition('fade', () => {
            this.buildWorld(this.roomById(this.run!.floor.bossId), { side: null, from: GROTTO_ID });
            const bw = this.world!;
            const gp = bw.props.find((p) => p.kind === 'grotto');
            if (gp) {
              bw.player.x = gp.x - 70;
              bw.player.y = gp.y - 20;
            }
            this.hooks.onAutosave();
          });
          break;
        case 'died':
          this.mode = 'dead';
          this.fx.shake(20);
          this.hooks.onDeath(ev.by);
          break;
        default:
          this.hooks.onEvent(ev);
      }
    }
  }

  private beginTransition(dir: Side | 'down' | 'fade', swap: () => void) {
    this.mode = 'transition';
    this.transition = { t: 0, dir, swapped: false, swap };
  }

  private async checkBossIntro() {
    const w = this.world;
    if (!w || !w.bossPending || this.mode !== 'play') return;
    this.mode = 'splash';
    const kind = w.room.boss ?? 'barnacle';
    const dummy = createBoss(kind, 0, 0, w.menace, w.depth);
    await this.hooks.onBossIntro(dummy);
    if (this.world === w && this.mode === 'splash') {
      w.spawnBoss();
      this.mode = 'play';
      input.clear();
    }
  }

  private updateCamera(snap = false) {
    const w = this.world!;
    const p = w.player;
    const tx = w.widthPx <= VIEW_W ? (w.widthPx - VIEW_W) / 2 : clamp(p.x - VIEW_W / 2, 0, w.widthPx - VIEW_W);
    const ty = w.heightPx <= VIEW_H ? (w.heightPx - VIEW_H) / 2 : clamp(p.y - VIEW_H / 2, 0, w.heightPx - VIEW_H);
    if (snap) {
      this.camX = tx;
      this.camY = ty;
    } else {
      this.camX += (tx - this.camX) * 0.12;
      this.camY += (ty - this.camY) * 0.12;
    }
  }

  private render(dt: number) {
    const w = this.world!;
    const t = this.time;
    const run = this.run!;
    if (w.terrainDirty) {
      this.terrain.build(w);
      w.terrainDirty = false;
    }
    this.updateCamera();
    const sh = this.fx.shakeAmt;
    this.root.x = sh ? R.range(-sh, sh) : 0;
    this.root.y = sh ? R.range(-sh, sh) : 0;
    this.cam.x = -Math.round(this.camX);
    this.cam.y = -Math.round(this.camY);
    this.glowCam.position.copyFrom(this.cam.position);
    // Parallax.
    this.fishFar.x = -this.camX * 0.3;
    this.fishNear.x = -this.camX * 0.6;
    this.bgSil.x = -this.camX * 0.15;
    this.fgLayer.x = -this.camX * 0.2;

    const neon = run.stats.transformations.has('neonrave');
    const p = w.player;

    // Ambient systems.
    const live = this.mode !== 'paused';
    const adt = live ? dt : 0;
    const pushers = [{ x: p.x, y: p.y, r: 34 }, ...w.enemies.filter((e) => !e.hidden).map((e) => ({ x: e.x, y: e.y, r: e.r + 10 }))];
    this.plants?.update(adt, w.fluid, pushers, t);
    for (const s of this.schools) s.update(adt, p.x - this.camX * (1 - s.depthFactor), p.y, t);
    const solid = (x: number, y: number) => w.solidAt(x, y);
    this.snow.update(adt, w.fluid, solid);
    this.fgSnow.update(adt, null, () => false);
    this.fx.world.update(adt, w.fluid, solid, (pp) => {
      if (pp.size0 > 6) this.fx.world.spawn({ kind: 'ring', x: pp.x, y: pp.y - 4, life: 0.25, size: 4, size1: pp.size0 * 1.4, color: 0xeaffff, alpha: 0.8, fluid: 0 });
    });
    this.fx.glow.update(adt, w.fluid, solid);
    this.fx.update(adt);
    this.terrain.update(t, w);
    this.bgCaustic.tilePosition.set(t * 5, t * 3);
    for (const r of this.raySprites) {
      const k = (r as any).base * (0.6 + 0.4 * Math.sin(t * 0.4 + (r as any).ph));
      r.alpha = k;
      r.skew.x = Math.sin(t * 0.2 + (r as any).ph) * 0.05;
    }
    if (live) {
      for (const v of this.vents) {
        v.t -= dt;
        if (v.t <= 0) {
          v.t = R.range(0.8, 3.5);
          for (let i = 0; i < R.int(1, 4); i++)
            this.fx.world.spawn({ kind: 'bubble', x: v.x + R.range(-4, 4), y: v.y - i * 8, vx: R.range(-10, 10), vy: R.range(-60, -30), life: 6, size: R.range(4, 10), gravity: -50, wobble: 10, fluid: 0.7, drag: 0.8 });
        }
      }
      // Clementine's pulses release a few tiny bubbles.
      if (p.pulseKick > 0.95 && R.chance(0.5)) this.fx.world.spawn({ kind: 'bubble', x: p.x + R.range(-10, 10), y: p.y + 14, vx: -p.vx * 0.2, vy: -40, life: 3, size: R.range(3, 6), gravity: -60, wobble: 8, fluid: 0.7 });
    }

    // Jelly.
    if (this.jelly) {
      this.jelly.update(adt, p, w.fluid, t);
      const costumes = new Set<string>();
      for (const id of run.p.items) {
        const c = ITEM_BY_ID[id]?.costume;
        if (c) costumes.add(c);
      }
      this.jelly.draw(p, t, costumes);
    }

    // Dynamic world drawing.
    const glow = this.glowG;
    glow.clear();
    this.jelly?.drawGlow(glow, p, t, neon);
    const dg = this.doorsG;
    dg.clear();
    for (const d of w.doors) drawDoor(dg, d, w, t);
    const pg = this.propsG;
    pg.clear();
    for (const pr of w.props) drawProp(pg, glow, pr, w, t);
    const ig = this.itemsG;
    ig.clear();
    const seen = new Set<object>();
    for (const pd of w.pedestals) {
      seen.add(pd);
      const kind = pd.hearts !== undefined ? 'grotto' : pd.price !== undefined ? 'shop' : 'rock';
      drawPedestal(ig, pd.x, pd.y, kind);
      const by = pd.y - 8 + Math.sin(pd.bob * 2.2) * 4;
      if (pd.itemId) {
        drawItemIcon(ig, pd.itemId, pd.x, by, 16, t);
        glow.circle(pd.x, by, 26).fill({ color: ITEM_BY_ID[pd.itemId]?.color ?? 0xffffff, alpha: 0.35 + Math.sin(t * 2) * 0.1 });
      } else if (pd.pickup) drawPickup(ig, pd.pickup, pd.x, by + 6, t);
      let label = this.pedLabels.get(pd);
      const txt = pd.price !== undefined ? `${pd.price}¢` : pd.hearts !== undefined ? '♥'.repeat(pd.hearts) : '';
      if (txt && !label) {
        label = new Text({ text: txt, style: { fontFamily: FONT_UI, fontSize: 16, fontWeight: '700', fill: pd.hearts ? 0xff4d6d : 0xffe14d, stroke: { color: INK, width: 4 } } });
        label.anchor.set(0.5);
        this.labels.addChild(label);
        this.pedLabels.set(pd, label);
      }
      if (label) {
        label.text = txt;
        label.visible = !!txt;
        label.position.set(pd.x, pd.y + 42);
      }
    }
    for (const [k, l] of this.pedLabels) if (!seen.has(k)) {
      l.destroy();
      this.pedLabels.delete(k);
    }
    for (const pk of w.pickups) {
      const bob = pk.settled ? 0 : Math.sin(pk.bob * 3) * 1.5;
      drawPickup(ig, pk.kind, pk.x, pk.y + bob, t + pk.bob, pk.opened, pk.snack);
      if (pk.kind === 'coin' || pk.kind === 'coin5' || pk.kind === 'glowjelly' || pk.kind === 'container')
        glow.circle(pk.x, pk.y, 16).fill({ color: pk.kind === 'container' ? 0xff4d6d : 0xfff27a, alpha: 0.25 });
    }
    const eg = this.enemiesG;
    eg.clear();
    for (const e of w.enemies) {
      if (e.boss) drawBoss(eg, e as Boss, t);
      else drawEnemy(eg, e, t);
      drawEnemyGlow(glow, e, t);
    }
    const prj = this.projG;
    prj.clear();
    for (const b of w.bubbles) drawBubble(prj, glow, b, t, neon);
    for (const s of w.shots) drawShot(prj, glow, s, t);
    drawWorldExtras(prj, glow, w, t);
    this.fx.drawGlow(glow);

    this.renderLights(w, neon);
    if (live && Math.floor(t * 60) % 2 === 0) this.updateRefractionMap(w);
    this.renderTransition();
    if (this.mode !== 'attract') this.hud.update(run, w, t);
  }

  private renderLights(w: RoomWorld, neon: boolean) {
    const lights: { x: number; y: number; r: number; c: number; a: number }[] = [];
    const p = w.player;
    const m = w.menace;
    lights.push({ x: p.x, y: p.y, r: 260 + m * 120, c: neon ? 0xffc8ff : 0xffd8a8, a: 0.55 + m * 0.6 });
    for (const b of w.bubbles) if (lights.length < 70) lights.push({ x: b.x, y: b.y, r: 70 + b.r * 3, c: b.color, a: 0.5 });
    for (const s of w.shots) if (lights.length < 110) lights.push({ x: s.x, y: s.y, r: 50, c: s.color, a: 0.35 });
    for (const pd of w.pedestals) if (pd.itemId) lights.push({ x: pd.x, y: pd.y, r: 150, c: ITEM_BY_ID[pd.itemId]?.color ?? 0xffffff, a: 0.5 });
    for (const pr of w.props) if (pr.active && pr.kind === 'crack') lights.push({ x: pr.x, y: pr.y - 40, r: 320, c: 0x9ef0ff, a: 0.9 });
    for (const bm of w.beams) for (let s = 0; s < bm.len; s += 120) lights.push({ x: bm.x + bm.dx * s, y: bm.y + bm.dy * s, r: 160, c: bm.color, a: 0.8 });
    for (const l of this.fx.lights) lights.push({ x: l.x, y: l.y, r: l.r, c: l.color, a: l.intensity * (1 - l.age / l.life) });
    const T = tex().soft;
    while (this.lightPool.length < lights.length) {
      const s = new Sprite(T);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      this.lightRoot.addChild(s);
      this.lightPool.push(s);
    }
    for (let i = 0; i < this.lightPool.length; i++) {
      const s = this.lightPool[i];
      const l = lights[i];
      if (!l) {
        s.visible = false;
        continue;
      }
      s.visible = true;
      s.x = l.x - this.camX;
      s.y = l.y - this.camY;
      s.scale.set((l.r * 2) / 128);
      s.tint = l.c;
      s.alpha = l.a;
    }
    this.app.renderer.render({ container: this.lightRoot, target: this.lightRT, clear: true });
  }

  private renderTransition() {
    const g = this.transG;
    g.clear();
    const tr = this.transition;
    if (!tr) return;
    // Comic panel wipe: a slab with a thick ink edge sweeps across.
    const k = tr.t < 1 ? tr.t : 2 - tr.t;
    const e = k * k * (3 - 2 * k);
    const col = 0x0b1a2e;
    if (tr.dir === 'fade' || tr.dir === 'down') {
      if (tr.dir === 'down') {
        const h = VIEW_H * e;
        g.rect(0, 0, VIEW_W, h).fill(col);
        g.moveTo(0, h).lineTo(VIEW_W, h).stroke({ width: 10, color: INK });
      } else g.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0xff5cae, alpha: e });
      return;
    }
    const d = tr.dir;
    const into = tr.t < 1;
    const W = VIEW_W, H = VIEW_H;
    if (d === 'L' || d === 'R') {
      const w = W * e;
      const fromLeft = (d === 'L') !== into;
      const x = fromLeft ? 0 : W - w;
      g.rect(x, 0, w, H).fill(col);
      g.moveTo(fromLeft ? w : W - w, 0).lineTo(fromLeft ? w : W - w, H).stroke({ width: 10, color: INK });
    } else {
      const h = H * e;
      const fromTop = (d === 'U') !== into;
      const y = fromTop ? 0 : H - h;
      g.rect(0, y, W, h).fill(col);
      g.moveTo(0, fromTop ? h : H - h).lineTo(W, fromTop ? h : H - h).stroke({ width: 10, color: INK });
    }
  }

  private trackPerformance(frameDt: number) {
    if (this.options.quality !== 'auto') return;
    this.frameTimes.push(frameDt);
    if (this.frameTimes.length > 120) this.frameTimes.shift();
    if (this.time - this.lastQualityCheck < 3 || this.frameTimes.length < 120) return;
    this.lastQualityCheck = this.time;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    if (avg > 0.024 && this.qualityLevel > 0) {
      this.qualityLevel--;
      if (this.qualityLevel < 2) this.updateRefractionFilter();
      if (this.qualityLevel < 1) this.blur.quality = 1;
      this.frameTimes = [];
    }
  }

  /** Render a boss to a data URL for the comic cover. */
  async bossPortrait(b: Boss): Promise<string> {
    const g = new Graphics();
    b.x = 110;
    b.y = 110;
    b.facing = -1;
    b.intro = 0;
    b.tele = 0;
    drawBoss(g, b, 0);
    g.scale.set(1.6);
    const c = new Container();
    c.addChild(g);
    try {
      return await this.app.renderer.extract.base64({ target: c, frame: undefined as any });
    } catch {
      return '';
    } finally {
      c.destroy({ children: true });
    }
  }

  /** Render an item icon to a data URL (Sea-pedia, run summaries). */
  iconCache = new Map<string, string>();
  async itemIcon(id: string): Promise<string> {
    const cached = this.iconCache.get(id);
    if (cached) return cached;
    const g = new Graphics();
    g.rect(0, 0, 48, 48).fill({ color: 0xffffff, alpha: 0 });
    drawItemIcon(g, id, 24, 24, 17, 0);
    try {
      const url = await this.app.renderer.extract.base64({ target: g });
      this.iconCache.set(id, url);
      return url;
    } catch {
      return '';
    } finally {
      g.destroy();
    }
  }
  async enemyIcon(kind: string): Promise<string> {
    const key = 'enemy:' + kind;
    const cached = this.iconCache.get(key);
    if (cached) return cached;
    const e = createEnemy(kind as any, 32, 32, 0, 'none');
    e.hidden = false;
    e.state = 'awake';
    const g = new Graphics();
    g.rect(0, 0, 64, 64).fill({ color: 0xffffff, alpha: 0 });
    drawEnemy(g, e, 0);
    try {
      const url = await this.app.renderer.extract.base64({ target: g });
      this.iconCache.set(key, url);
      return url;
    } catch {
      return '';
    } finally {
      g.destroy();
    }
  }
}
