// GameScene: owns the Pixi layer stack, the live RoomWorld, transitions,
// ambient simulation (water, fish, plants, snow), lighting and bloom.

import {
  Application,
  Rectangle,
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
import { DT, FONT_UI, TILE, VIEW_H, VIEW_W, ZOOM } from './config';

/** Close-up camera used on the title screen. */
const TITLE_ZOOM = 1.55;
import { clamp, darken, hsl, lighten, mixColor } from './core/math';
import { cosmetic as R } from './core/rng';
import { input } from './core/input';
import { setPitchShift, sfx } from './core/audio';
import type { Options } from './core/save';
import { FishSchools } from './ambient/boids';
import { ParticleSystem } from './ambient/particles';
import { INK, PlantSystem } from './ambient/plants';
import { biomeFor, type Biome } from './gen/biomes';
import { generateTitleLevel, type LevelSpec } from './gen/level';
import { createBoss, type Boss } from './game/bosses';
import { createEnemy } from './game/enemies';
import { ITEM_BY_ID } from './game/items';
import type { Run } from './game/run';
import { GROTTO_ID, LEVEL_ID, RoomWorld, TITLE_ID, type WorldEvent } from './game/room';
import { drawBoss, drawEnemy, drawEnemyGlow } from './render/creatures';
import { FxSystem } from './render/fxsys';
import { Hud } from './render/hud';
import { drawItemIcon, drawPedestal, drawPickup } from './render/icons';
import { OctopusView } from './render/octopus';
import { TerrainView } from './render/terrain';
import { tex } from './render/textures';
import { CameraFilter } from './render/camera';
import { drawBubble, drawFeatures, drawGate, drawInkMark, drawProp, drawShot, drawWorldExtras } from './render/worldart';

export interface SceneHooks {
  onEvent(ev: WorldEvent): void;
  onDeath(by: string): void;
  onVictory(): void;
  onPause(): void;
  onRestart(): void;
  onDebugMenu(): void;
  onAutosave(): void;
  onFloorStart(depth: number, stage: number): void;
  onBossIntro(boss: Boss): Promise<void>;
}

type Mode = 'idle' | 'attract' | 'intro' | 'play' | 'paused' | 'transition' | 'dead' | 'splash';

interface Transition {
  t: number;
  dir: 'down' | 'fade';
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
  /** Ink stains on the rock. */
  inkG = new Graphics();
  private inkDrawn = -1;
  /** Faint X marks over buried coins. */
  xG = new Graphics();
  private xDrawn = -1;
  /** Growth in front of Clementine and the creatures. */
  frontPlants = new Container();
  doorsG = new Graphics();
  propsG = new Graphics();
  itemsG = new Graphics();
  enemiesG = new Graphics();
  projG = new Graphics();
  trophyG = new Graphics();
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
  lens = new Container();
  camera = new CameraFilter();
  haze!: Sprite;
  farBlur = new BlurFilter({ strength: 5, quality: 2 });
  midBlur = new BlurFilter({ strength: 2, quality: 1 });

  fx: FxSystem;
  jelly: OctopusView | null = null;
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
  /** Current camera zoom (world → screen). */
  zoom = ZOOM;
  /** 0 = only open water visible (title), 1 = full scene. */
  sceneAlpha = 1;
  private intro: { t: number; fade: number; onDone: () => void } | null = null;
  private attractClock = 0;
  private attractTarget = { x: 0, y: 0 };
  camX = 0;
  camY = 0;
  restartHold = 0;
  private autosaveClock = 0;
  private lastCam = { x: 0, y: 0 };
  /** 0 at the surface … 1 at the bottom of the level (for light falloff). */
  depthFrac = 0;
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
    this.bgCaustic.alpha = 0.015;
    this.bg.addChild(this.bgWater, this.bgSil, this.bgCaustic);
    this.rays.blendMode = 'add';
    this.trophyG.scale.set(0.55);

    this.fx = new FxSystem(this.flashLayer);
    this.snow = new ParticleSystem({ snow: T.dot, dot: T.dot }, 400);
    this.fgSnow = new ParticleSystem({ snow: T.soft, dot: T.soft }, 60);

    this.cam.addChild(
      this.hintLayer,
      this.terrain.container,
      this.plantsLayer,
      this.inkG,
      this.xG,
      this.doorsG,
      this.propsG,
      this.snow.container,
      this.itemsG,
      this.trophyG,
      this.enemiesG,
      this.jellyLayer,
      this.frontPlants,
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
    this.blur = new BlurFilter({ strength: 14, quality: 3 });
    this.blur.blendMode = 'add';
    // Bloom doesn't need full resolution; half-res is cheaper and softer.
    this.blur.resolution = 0.5;
    this.glowRoot.filters = [this.blur];
    this.glowCam.addChild(this.glowG, this.fx.glow.container);
    this.glowRoot.addChild(this.glowCam);

    this.fgLayer.addChild(this.fgSnow.container, this.fgG);

    // Atmospheric haze between the camera and the scene (murky water).
    this.haze = new Sprite(Texture.WHITE);
    this.haze.width = VIEW_W;
    this.haze.height = VIEW_H;
    this.worldView.addChild(this.haze);

    this.root.addChild(this.worldView, this.lightSprite, this.glowRoot, this.fgLayer, this.overlay, this.flashLayer);
    // The whole view is shot through an underwater camera lens.
    this.root.pivot.set(VIEW_W / 2, VIEW_H / 2);
    this.root.scale.set(1.03);
    this.lens.addChild(this.root, this.transG);
    this.lens.filterArea = new Rectangle(0, 0, VIEW_W, VIEW_H);
    this.lens.filters = [this.camera];
    app.stage.addChild(this.lens, this.hud.container);
    this.hud.container.visible = false;

    // Refraction map.
    this.dispCanvas = document.createElement('canvas');
    this.dispCtx = this.dispCanvas.getContext('2d')!;

    this.hud.rockAt = (x, y) => this.terrain.visualRockAt(x, y);
    this.fx.onExplosion = (x, y) => {
      for (const s of this.schools) s.scare(x, y, 400, 1.2);
    };
    this.fx.onImpact = (x, y, k) => this.plants?.impulse(x, y, k, 60 + k * 50);
    this.applyOptions(options);
  }

  applyOptions(o: Options) {
    this.options = o;
    this.fx.shakeScale = o.screenShake ? 1 : 0;
    this.fx.flashScale = o.reducedFlash ? 0.25 : 1;
    this.blur.strength = o.reducedFlash ? 8 : 14;
    this.glowRoot.alpha = o.reducedFlash ? 0.6 : 1;
    this.camera.setStrength(o.reducedFlash);
    if (o.quality === 'low') this.qualityLevel = 0;
    else if (o.quality === 'medium') this.qualityLevel = 1;
    else this.qualityLevel = 2;
    this.applyDepthOfField();
    this.updateRefractionFilter();
  }

  /** Depth of field: distant layers are out of focus. */
  private applyDepthOfField() {
    const on = this.qualityLevel > 0;
    this.bgSil.filters = on ? [this.farBlur] : [];
    this.fishFar.filters = on ? [this.farBlur] : [];
    this.fishNear.filters = on && this.qualityLevel > 1 ? [this.midBlur] : [];
  }

  // ── Run control ──────────────────────────────────────────
  startRun(run: Run, fresh: boolean) {
    this.zoom = ZOOM;
    this.sceneAlpha = 1;
    this.intro = null;
    this.transG.clear();
    this.run = run;
    const d = run.data;
    this.buildWorld(this.areaSpec(d.currentRoom), d.currentRoom);
    this.mode = 'play';
    this.hud.container.visible = true;
    input.clear();
    if (fresh) this.hooks.onFloorStart(d.depth, run.stage);
  }

  attractPending = false;
  trophies: Boss[] = [];
  startAttract(run: Run, _beaten: string[] = []) {
    this.trophies = [];
    this.run = run;
    this.attractPending = true;
    // A quiet stretch of open water above a sandy floor with one opening in it.
    this.mode = 'attract';
    this.zoom = TITLE_ZOOM;
    this.sceneAlpha = 0;
    this.buildWorld(generateTitleLevel(run.seed), TITLE_ID);
    this.attractPending = false;
    const w = this.world!;
    w.player.x = w.widthPx * 0.5;
    w.player.y = w.heightPx * 0.35;
    this.attractTarget = { x: w.player.x, y: w.player.y };
    this.attractHover = 1.2;
    this.updateCamera(true);
    this.hud.container.visible = false;
  }

  /** New dive: Clementine dives, the camera pulls back and she enters the opening in the floor. */
  playIntro(onDone: () => void) {
    if (this.mode !== 'attract' || !this.world) {
      onDone();
      return;
    }
    this.mode = 'intro';
    this.intro = { t: 0, fade: 0, onDone };
  }

  stop() {
    this.trophies = [];
    this.mode = 'idle';
    this.hud.container.visible = false;
  }

  /** A pause requested mid-transition takes effect when the transition ends. */
  private pauseAfterTransition = false;

  pause() {
    if (this.mode === 'transition') this.pauseAfterTransition = true;
    if (this.mode === 'play') {
      this.mode = 'paused';
      this.world?.persist();
    }
  }
  resume() {
    this.pauseAfterTransition = false;
    if (this.mode === 'paused') this.mode = 'play';
    input.clear();
  }

  /** Debug helper: teleport Clementine (e.g. to the boss arena). */
  debugTeleport(x: number, y: number) {
    const w = this.world;
    if (!w) return;
    w.player.x = x;
    w.player.y = y;
    w.player.vx = w.player.vy = 0;
    w.fluid.follow(x, y, true);
    this.updateCamera(true);
  }

  private areaSpec(id: number): LevelSpec {
    const run = this.run!;
    return id === GROTTO_ID ? run.grottoSpec() : run.level;
  }

  private buildWorld(spec: LevelSpec, areaId: number) {
    const run = this.run!;
    const old = this.world;
    // A world from the floor above must not leak its map or position into this one.
    if (old && old.floorKey === run.floorKey) old.persist();
    const w = new RoomWorld(run, spec, areaId, this.fx, this.options);
    this.world = w;
    if (areaId !== TITLE_ID) run.data.currentRoom = areaId;
    const seed = (run.floorSeed ^ (run.data.depth * 0x9e37) ^ areaId) >>> 0;
    const b = w.biome;
    setPitchShift(1 - b.menace * 0.25);

    // Visual rebuild.
    this.fx.clear();
    this.fx.sandColor = b.sand;
    this.terrain.build(w);
    w.terrainDirty = false;
    this.plantsLayer.removeChildren();
    this.frontPlants.removeChildren();
    this.inkG.clear();
    this.inkDrawn = -1;
    this.xG.clear();
    this.xDrawn = -1;
    // Growth that stood where craters were blown is gone.
    const inHole = (x: number, y: number) => w.holes.some((ho) => (x - ho.x) ** 2 + (y - ho.y) ** 2 < (ho.r + 8) ** 2);
    this.plants = new PlantSystem(spec.decor.filter((d) => !inHole(d.x, d.y)), b.menace);
    this.plantsLayer.addChild(this.plants.container);
    this.frontPlants.addChild(this.plants.front);
    this.jellyLayer.removeChildren();
    const size = run.data.seedCode === 'HUGEJELL' ? 1.7 : run.data.seedCode === 'TEENYJEL' ? 0.6 : 1;
    this.jelly = new OctopusView(w.player.x, w.player.y, size);
    this.jellyLayer.addChild(this.jelly.container);
    for (const [, l] of this.pedLabels) l.destroy();
    this.pedLabels.clear();
    this.hintLayer.removeChildren().forEach((c) => c.destroy());
    if (areaId === LEVEL_ID && w.depth === 1 && w.stage === 1 && this.mode !== 'attract' && !this.attractPending) this.drawHints(w);

    this.bgWater.texture = waterTexture(b);
    this.bgWater.width = VIEW_W;
    this.bgWater.height = VIEW_H;
    this.ambient.texture = run.data.seedCode === 'DARKDEEP' ? ambientTexture({ ...b, depth: 99, lightTop: 0.28, lightBottom: 0.12 }) : ambientTexture(b);
    this.ambient.width = VIEW_W;
    this.ambient.height = VIEW_H;
    this.drawSilhouettes(b, seed);
    this.camera.setGrade(b.grade);
    this.haze.texture = waterTexture(b);
    this.haze.width = VIEW_W;
    this.haze.height = VIEW_H;
    this.haze.alpha = 0.1 + b.menace * 0.2;

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
      (s as any).base = b.godRays * R.range(0.16, 0.34);
      (s as any).ph = R.range(0, 10);
      this.rays.addChild(s);
      this.raySprites.push(s);
    }

    // Marine snow.
    this.snow.clear();
    // Marine snow lives in a box around the camera and wraps as it moves.
    const vw = VIEW_W / ZOOM + 200, vh = VIEW_H / ZOOM + 200;
    this.snow.bounds = { x: w.player.x - vw / 2, y: w.player.y - vh / 2, w: vw, h: vh };
    const snowN = Math.round(b.snowCount * 0.8 * (q === 0 ? 0.35 : q === 1 ? 0.7 : 1));
    for (let i = 0; i < snowN; i++) {
      this.snow.spawn({
        kind: 'snow', x: this.snow.bounds.x + R.range(0, vw), y: this.snow.bounds.y + R.range(0, vh), size: R.range(1.5, 4.2),
        alpha: R.range(0.25, 0.7), color: mixColor(0xffffff, b.waterTop, 0.25), wrap: true, gravity: 6, drag: 0.8, fluid: 0.9, life: 1,
      });
    }
    this.fgSnow.clear();
    this.fgSnow.bounds = { x: 0, y: 0, w: VIEW_W, h: VIEW_H };
    for (let i = 0; i < (q === 0 ? 6 : 16); i++) {
      this.fgSnow.spawn({ kind: 'snow', x: R.range(0, VIEW_W), y: R.range(0, VIEW_H), size: R.range(14, 34), alpha: R.range(0.06, 0.16), wrap: true, vx: R.range(-8, 8), vy: R.range(2, 8), drag: 0, fluid: 0, life: 1 });
    }
    this.drawForeground(b, seed);

    // Bubble vents on the floor.
    this.vents = [];
    for (const d of spec.decor) if ((d.kind === 'rockling' || d.kind === 'shell' || d.kind === 'boulder') && R.chance(0.35)) this.vents.push({ x: d.x, y: d.y - 6, t: R.range(0, 3) });

    this.setupRefraction(w);
    this.updateCamera(true);
    this.lastCam = { x: this.camX, y: this.camY };
    this.autosaveClock = 0;
  }

  /** Tutorial doodles on the back wall of the very first room. */
  private drawHints(w: RoomWorld) {
    const lines: [string, number, number][] = [
      ['W A S D  to swim', 0.26, 0.3],
      ['ARROWS  to shoot', 0.26, 0.42],
      ['SHIFT  ink dash   ·   E  ink bomb   ·   SPACE  active   ·   Q  snack', 0.5, 0.62],
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
      t.position.set(w.spec.start.x + (fx - 0.5) * 900, w.spec.start.y + TILE * 3 + (fy - 0.4) * 420);
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
    if (b.feature === 'tank') {
      // Outside the glass: a giant, blurry living room.
      g.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x6a5a4a, alpha: 0.55 });
      g.rect(0, VIEW_H * 0.7, VIEW_W, VIEW_H * 0.3).fill({ color: 0x3a2a22, alpha: 0.6 }); // floor
      g.roundRect(VIEW_W * 0.08, VIEW_H * 0.45, VIEW_W * 0.42, VIEW_H * 0.3, 40).fill({ color: 0x8a3a3a, alpha: 0.6 }); // sofa
      g.roundRect(VIEW_W * 0.6, VIEW_H * 0.2, VIEW_W * 0.3, VIEW_H * 0.28, 8).fill({ color: 0x101820, alpha: 0.75 }); // TV
      g.roundRect(VIEW_W * 0.62, VIEW_H * 0.22, VIEW_W * 0.26, VIEW_H * 0.24, 6).fill({ color: 0x4a8aff, alpha: 0.35 });
      g.moveTo(VIEW_W * 0.5, VIEW_H * 0.05).lineTo(VIEW_W * 0.5, VIEW_H * 0.3).stroke({ width: 6, color: 0x2a2a2a, alpha: 0.6 }); // lamp
      g.poly([VIEW_W * 0.44, VIEW_H * 0.05, VIEW_W * 0.56, VIEW_H * 0.05, VIEW_W * 0.53, VIEW_H * -0.05, VIEW_W * 0.47, VIEW_H * -0.05]).fill({ color: 0xffe0a0, alpha: 0.8 });
      g.circle(VIEW_W * 0.5, VIEW_H * 0.08, 120).fill({ color: 0xffd890, alpha: 0.18 });
      return;
    }
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
    if (b.depth === 4) {
      // Distant big-top tents and strings of bulbs.
      for (let i = 0; i < 3; i++) {
        const x = rnd() * VIEW_W, w = 160 + rnd() * 120, y = VIEW_H * 0.74;
        g.poly([x - w / 2, y, x, y - w * 0.8, x + w / 2, y]).fill({ color: near, alpha: 0.6 });
        g.moveTo(x, y - w * 0.8).lineTo(x, y - w * 0.95).stroke({ width: 3, color: near, alpha: 0.6 });
      }
      for (let i = 0; i < 18; i++) g.circle((i / 18) * VIEW_W + 20, VIEW_H * 0.35 + Math.sin(i * 0.8) * 20, 3).fill({ color: [0xff5cae, 0xffe14d, 0x5cf2ff][i % 3], alpha: 0.5 });
    }
    if (b.depth === 5) {
      for (let i = 0; i < 40; i++) g.circle(rnd() * VIEW_W, rnd() * VIEW_H * 0.8, 1 + rnd() * 2).fill({ color: rnd() < 0.5 ? 0x5cf2ff : 0x9dffd8, alpha: 0.35 + rnd() * 0.3 });
    }
    if (b.depth === 6) {
      // Distant glowing eyes.
      for (let i = 0; i < 7; i++) {
        const x = rnd() * VIEW_W, y = rnd() * VIEW_H * 0.7, d = 6 + rnd() * 8;
        g.circle(x, y, 2.2).fill({ color: 0xff3d6a, alpha: 0.55 });
        g.circle(x + d, y, 2.2).fill({ color: 0xff3d6a, alpha: 0.55 });
      }
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
    // Old maps are tiny; they are left to GC rather than destroyed while a
    // filter may still have them bound.
    this.dispTex = Texture.from(this.dispCanvas);
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
    this.dispSprite!.position.set(f.ox, f.oy);
  }

  // ── Frame ──────────────────────────────────────────────────
  update(frameDt: number) {
    const dt = Math.min(frameDt, 0.1);
    this.time += dt;
    this.trackPerformance(frameDt);
    const w = this.world;
    if (!w) return;

    if (this.mode === 'play') {
      if (this.run?.data.debug && input.wasPressed('Backquote')) {
        this.pause();
        this.hooks.onDebugMenu();
        input.endFrame();
        return;
      }
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
      if (this.mode === 'play' && this.world === w && w.bossPending) this.checkBossIntro();
      this.autosaveClock += dt;
      if (this.autosaveClock > 30 && this.mode === 'play') {
        this.autosaveClock = 0;
        this.hooks.onAutosave();
      }
    } else if (this.mode === 'attract') {
      this.attractStep(w, dt);
    } else if (this.mode === 'intro') {
      this.introStep(w, dt);
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
        if (this.pauseAfterTransition) {
          this.pauseAfterTransition = false;
          this.pause();
        }
      }
      w.fluid.step(dt);
    } else if (this.mode === 'dead' || this.mode === 'splash' || this.mode === 'paused') {
      w.fluid.step(dt * 0.3);
    }
    this.render(dt);
  }

  private attractHover = 1.5;

  /**
   * Title screen: Clementine hovers upright, then sets off with a jet toward a
   * new spot, cruises there and hovers again — exactly as she swims in game.
   */
  private attractStep(w: RoomWorld, dt: number) {
    const p = w.player;
    const tx = this.attractTarget.x - p.x, ty = this.attractTarget.y - p.y;
    const d = Math.hypot(tx, ty);
    let ix = 0, iy = 0;
    if (this.attractHover > 0) {
      this.attractHover -= dt;
      if (this.attractHover <= 0)
        this.attractTarget = { x: w.widthPx * R.range(0.3, 0.7), y: w.heightPx * R.range(0.2, 0.5) };
    } else if (d < 30) {
      this.attractHover = R.range(1.8, 3.5);
    } else {
      // Ease off on arrival; cruise at a relaxed pace.
      const effort = Math.min(0.45, d / 200);
      ix = (tx / d) * effort;
      iy = (ty / d) * effort;
    }
    p.swim(w, ix, iy, dt);
    this.glide(p, dt);
    w.fluid.step(dt);
  }

  /** Move without terrain collision (cinematic moments only). */
  private glide(p: RoomWorld['player'], dt: number) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  private introStep(w: RoomWorld, dt: number) {
    const it = this.intro!;
    const p = w.player;
    it.t += dt;
    const c = w.spec.boss.crack;
    const goalX = (c.x0 + c.x1) / 2;
    const goalY = w.heightPx + TILE * 2;
    // Camera pulls back and the reef fades in around her.
    const k = Math.min(1, it.t / 2.2);
    const e = k * k * (3 - 2 * k);
    this.zoom = TITLE_ZOOM + (ZOOM - TITLE_ZOOM) * e;
    this.sceneAlpha = Math.min(1, it.t / 1.4);
    // One jet to set off, then a smooth dive straight for the opening.
    const dx = goalX - p.x, dy = goalY - p.y, dl = Math.hypot(dx, dy) || 1;
    p.swim(w, dx / dl, dy / dl, dt);
    // Keep her lined up with the hole as she approaches it.
    p.vx += (goalX - p.x) * dt * 2.5;
    this.glide(p, dt);
    w.fluid.step(dt);
    if (p.y > w.heightPx - TILE * 0.6 || it.t > 6) it.fade = Math.min(1, it.fade + dt / 0.5);
    if (it.fade >= 1) {
      this.intro = null;
      this.zoom = ZOOM;
      this.sceneAlpha = 1;
      it.onDone();
    }
  }

  private drainEvents() {
    const w = this.world!;
    const evs = w.events.splice(0);
    for (const ev of evs) {
      switch (ev.type) {
        case 'descend':
          sfx.descend();
          if (this.run!.atBottom) {
            // The rift leads nowhere new yet: the dive ends here.
            this.beginTransition('down', () => {
              this.mode = 'dead';
              this.transition = null;
              this.hooks.onVictory();
            });
            break;
          }
          this.beginTransition('down', () => {
            this.run!.nextFloor();
            this.buildWorld(this.run!.level, LEVEL_ID);
            this.hooks.onAutosave();
            this.hooks.onFloorStart(this.run!.data.depth, this.run!.stage);
          });
          break;
        case 'grotto':
          this.beginTransition('fade', () => {
            const lw = this.world!;
            const gp = lw.props.find((p) => p.kind === 'grotto');
            if (gp) {
              // Come back out beside the portal, not inside it.
              lw.player.x = gp.x - 80;
              lw.player.y = gp.y - 20;
            }
            this.buildWorld(this.run!.grottoSpec(), GROTTO_ID);
            this.hooks.onAutosave();
          });
          break;
        case 'grottoExit':
          this.beginTransition('fade', () => {
            this.buildWorld(this.run!.level, LEVEL_ID);
            this.hooks.onAutosave();
          });
          break;
        case 'autosave':
          this.hooks.onAutosave();
          break;
        case 'finale':
          // Let the final K.O. land, then roll the ending.
          this.hooks.onEvent(ev);
          setTimeout(() => {
            if (this.world === w && this.mode === 'play') {
              this.mode = 'dead';
              this.hooks.onVictory();
            }
          }, 2500);
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

  private beginTransition(dir: 'down' | 'fade', swap: () => void) {
    this.mode = 'transition';
    this.transition = { t: 0, dir, swapped: false, swap };
  }

  private async checkBossIntro() {
    const w = this.world;
    if (!w || !w.bossPending || this.mode !== 'play') return;
    this.mode = 'splash';
    const kind = w.spec.boss.kind;
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
    const vw = VIEW_W / this.zoom, vh = VIEW_H / this.zoom;
    if (this.mode === 'attract' || this.mode === 'intro') {
      // Close-up: keep Clementine framed (blending to the full-room framing during the dive).
      const fit = this.mode === 'intro' ? Math.min(1, (TITLE_ZOOM - this.zoom) / (TITLE_ZOOM - ZOOM)) : 0;
      // Title framing keeps her to the right of the menu.
      const fx = p.x - vw * 0.66, fy = p.y - vh * 0.45;
      const rx = w.widthPx <= vw ? (w.widthPx - vw) / 2 : clamp(p.x - vw / 2, 0, w.widthPx - vw);
      const ry = w.heightPx <= vh ? (w.heightPx - vh) / 2 : clamp(p.y - vh / 2, 0, w.heightPx - vh);
      const tx = fx + (rx - fx) * fit, ty = fy + (ry - fy) * fit;
      if (snap) {
        this.camX = tx;
        this.camY = ty;
      } else {
        this.camX += (tx - this.camX) * 0.08;
        this.camY += (ty - this.camY) * 0.08;
      }
      return;
    }
    // Follow Clementine with a little look-ahead in the direction she swims.
    const lx = clamp(p.vx * 0.28, -140, 140), ly = clamp(p.vy * 0.2, -90, 90);
    const tx = w.widthPx <= vw ? (w.widthPx - vw) / 2 : clamp(p.x + lx - vw / 2, 0, w.widthPx - vw);
    const ty = w.heightPx <= vh ? (w.heightPx - vh) / 2 : clamp(p.y + ly - vh / 2, 0, w.heightPx - vh);
    if (snap) {
      this.camX = tx;
      this.camY = ty;
    } else {
      this.camX += (tx - this.camX) * 0.08;
      this.camY += (ty - this.camY) * 0.08;
    }
  }

  /** The world rectangle the camera currently shows. */
  viewRect(margin = 0) {
    const vw = VIEW_W / this.zoom, vh = VIEW_H / this.zoom;
    return { x0: this.camX - margin, y0: this.camY - margin, x1: this.camX + vw + margin, y1: this.camY + vh + margin };
  }

  private render(dt: number) {
    const w = this.world!;
    const t = this.time;
    const run = this.run!;
    if (w.terrainDirty) {
      this.terrain.rebuildDirty(w);
      w.terrainDirty = false;
    }
    if (w.newHoles.length) {
      for (const ho of w.newHoles.splice(0)) {
        this.plants?.removeNear(ho.x, ho.y, ho.r);
        this.vents = this.vents.filter((v) => (v.x - ho.x) ** 2 + (v.y - ho.y) ** 2 > (ho.r + 8) ** 2);
      }
    }
    this.updateCamera();
    const sh = this.fx.shakeAmt;
    // Handheld / ROV camera drift plus impact shake.
    const calm = this.options.calmWater ? 0.3 : 1;
    const swayX = (Math.sin(t * 0.37) * 3 + Math.sin(t * 0.91) * 1.2) * calm;
    const swayY = (Math.sin(t * 0.29 + 1) * 2.4 + Math.sin(t * 0.77) * 1) * calm;
    this.root.position.set(VIEW_W / 2 + swayX + (sh ? R.range(-sh, sh) : 0), VIEW_H / 2 + swayY + (sh ? R.range(-sh, sh) : 0));
    this.root.rotation = Math.sin(t * 0.21) * 0.0025 * calm;
    this.camera.time = t;
    this.cam.scale.set(this.zoom);
    for (const layer of [this.terrain.container, this.plantsLayer, this.frontPlants, this.doorsG, this.propsG, this.itemsG, this.trophyG, this.fgG])
      layer.alpha = this.sceneAlpha;
    // Light falls off with depth inside the level.
    const vh = VIEW_H / this.zoom;
    this.depthFrac = w.areaId === LEVEL_ID ? clamp((this.camY + vh / 2) / w.heightPx, 0, 1) : w.areaId === GROTTO_ID ? 0.5 : 0;
    const df = this.depthFrac;
    const lightK = 1 - df * (0.3 + w.menace * 0.1);
    const gray = (k: number) => {
      const v = Math.round(clamp(k, 0, 1) * 255);
      return (v << 16) | (v << 8) | v;
    };
    this.ambient.tint = gray(lightK * (1 - w.bossDark * 0.7));
    this.bgWater.tint = gray(1 - df * (0.55 - w.menace * 0.5));
    this.bgSil.alpha = this.sceneAlpha * (w.biome.feature === 'tank' ? 1 : clamp(1 - df * 1.6, 0, 1));
    this.rays.alpha = clamp(1.1 - df * 1.8, 0, 1);
    this.glowCam.scale.set(this.zoom);
    this.cam.x = -Math.round(this.camX * this.zoom);
    this.cam.y = -Math.round(this.camY * this.zoom);
    this.glowCam.position.copyFrom(this.cam.position);
    // Parallax: distant fish drift against the camera's motion.
    const dcx = (this.camX - this.lastCam.x) * this.zoom, dcy = (this.camY - this.lastCam.y) * this.zoom;
    this.lastCam = { x: this.camX, y: this.camY };
    if (this.schools[0]) this.schools[0].pan(dcx * 0.3, dcy * 0.3);
    if (this.schools[1]) this.schools[1].pan(dcx * 0.6, dcy * 0.6);
    const view = this.viewRect();
    const sv = this.viewRect(100);
    this.snow.bounds = { x: sv.x0, y: sv.y0, w: sv.x1 - sv.x0, h: sv.y1 - sv.y0 };

    const neon = run.stats.transformations.has('neonrave') || run.data.seedCode === 'PARTYFSH';
    const p = w.player;

    // Ambient systems.
    const live = this.mode !== 'paused';
    const adt = live ? dt : 0;
    const pushers = [{ x: p.x, y: p.y, r: 34 }, ...w.enemies.filter((e) => !e.hidden).map((e) => ({ x: e.x, y: e.y, r: e.r + 10 }))];
    this.plants?.update(adt, w.fluid, pushers, t, view);
    for (const s of this.schools) s.update(adt, (p.x - this.camX) * this.zoom, (p.y - this.camY) * this.zoom, t);
    if (run.data.seedCode === 'PARTYFSH') for (const s of this.schools) for (const f of s.fish) f.s.tint = hsl(t * 0.5 + f.school * 0.2, 0.9, 0.6);
    const solid = (x: number, y: number) => w.solidAt(x, y);
    this.snow.update(adt, w.fluid, solid);
    this.fgSnow.update(adt, null, () => false);
    this.fx.world.update(adt, w.fluid, solid, (pp) => {
      if (pp.size0 > 6) this.fx.world.spawn({ kind: 'ring', x: pp.x, y: pp.y - 4, life: 0.25, size: 4, size1: pp.size0 * 1.4, color: 0xeaffff, alpha: 0.8, fluid: 0 });
    });
    this.fx.glow.update(adt, w.fluid, solid);
    this.fx.update(adt);
    this.terrain.update(t, w, view);
    this.bgCaustic.tilePosition.set(t * 5, t * 3);
    for (const r of this.raySprites) {
      const k = (r as any).base * (0.6 + 0.4 * Math.sin(t * 0.4 + (r as any).ph));
      r.alpha = k;
      r.skew.x = Math.sin(t * 0.2 + (r as any).ph) * 0.05;
    }
    if (live && this.qualityLevel > 0 && !this.options.calmWater) {
      const f = w.fluid;
      const tmp = { x: 0, y: 0 };
      for (let i = 0; i < 6; i++) {
        const sx = this.camX + R.range(0, VIEW_W / this.zoom), sy = this.camY + R.range(0, VIEW_H / this.zoom);
        f.sample(sx, sy, tmp);
        const sp = Math.hypot(tmp.x, tmp.y);
        if (sp > 70 && !w.solidAt(sx, sy))
          this.fx.world.spawn({ kind: 'spark', x: sx, y: sy, vx: tmp.x, vy: tmp.y, life: 0.5, size: 10 + sp * 0.12, alpha: Math.min(0.28, sp / 900), color: 0xeaffff, stretch: true, fluid: 1, drag: 0.5 });
      }
    }
    if (live) {
      for (const v of this.vents) {
        if (v.x < view.x0 || v.x > view.x1 || v.y < view.y0 || v.y > view.y1 + 60) continue;
        v.t -= dt;
        if (v.t <= 0) {
          v.t = R.range(0.8, 3.5);
          for (let i = 0; i < R.int(1, 4); i++)
            this.fx.world.spawn({ kind: 'bubble', x: v.x + R.range(-4, 4), y: v.y - i * 8, vx: R.range(-10, 10), vy: R.range(-60, -30), life: 6, size: R.range(4, 10), gravity: -50, wobble: 10, fluid: 0.7, drag: 0.8 });
        }
      }
      // Each jet releases a few tiny bubbles.
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
    if (this.inkDrawn !== w.inkVersion) {
      this.inkDrawn = w.inkVersion;
      this.inkG.clear();
      for (const m of w.inkMarks) {
        // Seat the stain on the rock as drawn (its outline wanders a little off the tiles).
        const rock = (x: number, y: number) => this.terrain.visualRockAt(x, y);
        let { x, y } = m;
        if (!m.seated) {
          for (let i = 0; i < 10 && !rock(x - m.nx * 3, y - m.ny * 3); i++) {
            x -= m.nx * 3;
            y -= m.ny * 3;
          }
          for (let i = 0; i < 10 && rock(x + m.nx * 3, y + m.ny * 3); i++) {
            x += m.nx * 3;
            y += m.ny * 3;
          }
          // The face's real orientation: away from where the rock is.
          let sx = 0, sy = 0;
          for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2;
            if (rock(x + Math.cos(a) * 12, y + Math.sin(a) * 12)) {
              sx += Math.cos(a);
              sy += Math.sin(a);
            }
          }
          const l = Math.hypot(sx, sy);
          if (l > 0.5) {
            m.nx = -sx / l;
            m.ny = -sy / l;
          }
          m.x = x;
          m.y = y;
          m.seated = true;
        }
        drawInkMark(this.inkG, m);
      }
    }
    if (this.xDrawn !== w.buriedVersion) {
      this.xDrawn = w.buriedVersion;
      const g = this.xG;
      g.clear();
      const sand = lighten(w.biome.sand, 0.15);
      for (const b of w.buried) {
        // Sit the mark on the rock face as drawn.
        let y = b.my - 20;
        for (let i = 0; i < 20 && !this.terrain.visualRockAt(b.mx, y + 3); i++) y += 3;
        y += 7;
        const s = 7;
        for (const [col, a, wd, off] of [[0x000000, 0.25, 3.2, 1], [sand, 0.4, 2.2, 0]] as const) {
          g.moveTo(b.mx - s, y - s * 0.6 + off).lineTo(b.mx + s, y + s * 0.6 + off)
            .moveTo(b.mx + s, y - s * 0.6 + off).lineTo(b.mx - s, y + s * 0.6 + off)
            .stroke({ width: wd, color: col, alpha: a, cap: 'round' });
        }
      }
    }
    const dg = this.doorsG;
    dg.clear();
    if (w.bossFight) for (const gate of w.gates) drawGate(dg, gate, t, glow);
    const inV = (x: number, y: number, m: number) => x > view.x0 - m && x < view.x1 + m && y > view.y0 - m && y < view.y1 + m;
    const pg = this.propsG;
    pg.clear();
    for (const pr of w.props) drawProp(pg, glow, pr, w, t);
    const ig = this.itemsG;
    ig.clear();
    const seen = new Set<object>();
    for (const pd of w.pedestals) {
      if (!inV(pd.x, pd.y, 80)) continue;
      seen.add(pd);
      const kind = pd.hearts !== undefined ? 'grotto' : pd.price !== undefined ? 'shop' : 'rock';
      drawPedestal(ig, pd.x, pd.y, kind);
      const by = pd.y - 8 + Math.sin(pd.bob * 2.2) * 4;
      if (pd.itemId) {
        drawItemIcon(ig, pd.itemId, pd.x, by, 16, t);
        glow.circle(pd.x, by, 26).fill({ color: ITEM_BY_ID[pd.itemId]?.color ?? 0xffffff, alpha: 0.35 + Math.sin(t * 2) * 0.1 });
      } else if (pd.pickup) drawPickup(ig, pd.pickup, pd.x, by + 6, t);
      let label = this.pedLabels.get(pd);
      const txt = pd.price !== undefined ? `${pd.price}¢` : pd.hearts !== undefined ? `−${pd.hearts * 20} MAX HP` : '';
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
      if (!inV(pk.x, pk.y, 40)) continue;
      const bob = pk.settled ? 0 : Math.sin(pk.bob * 3) * 1.5;
      drawPickup(ig, pk.kind, pk.x, pk.y + bob, t + pk.bob, pk.opened, pk.snack);
      if (pk.kind === 'coin' || pk.kind === 'coin5' || pk.kind === 'glowjelly' || pk.kind === 'container')
        glow.circle(pk.x, pk.y, 16).fill({ color: pk.kind === 'container' ? 0xff4d6d : 0xfff27a, alpha: 0.25 });
    }
    const eg = this.enemiesG;
    eg.clear();
    const tg = this.trophyG;
    tg.clear();
    if (this.mode === 'attract')
      for (const b of this.trophies) {
        b.anim += dt;
        b.age += dt;
        drawBoss(tg, b, t);
      }
    for (const e of w.enemies) {
      if (!inV(e.x, e.y, e.boss ? 300 : 120)) continue;
      if (e.boss) drawBoss(eg, e as Boss, t);
      else drawEnemy(eg, e, t);
      drawEnemyGlow(glow, e, t);
    }
    const prj = this.projG;
    prj.clear();
    for (const b of w.bubbles) drawBubble(prj, glow, b, t, neon);
    for (const s of w.shots) drawShot(prj, glow, s, t);
    drawWorldExtras(prj, glow, w, t);
    drawFeatures(this.propsG, glow, w, t, view);
    this.fx.drawGlow(glow);

    this.renderLights(w, neon);
    if (live && Math.floor(t * 60) % 2 === 0) this.updateRefractionMap(w);
    this.renderTransition();
    if (this.mode !== 'attract') {
      this.hud.bigMap = input.isDown('Tab');
      this.hud.update(run, w, t);
    }
  }

  private renderLights(w: RoomWorld, neon: boolean) {
    const lights: { x: number; y: number; r: number; c: number; a: number }[] = [];
    const p = w.player;
    const v = this.viewRect(200);
    const vis = (x: number, y: number, r: number) => x > v.x0 - r && x < v.x1 + r && y > v.y0 - r && y < v.y1 + r;
    const m = w.menace;
    // Clementine is the key practical light: warm, breathing bioluminescence.
    const breathe = 0.85 + Math.sin(this.time * 2.2) * 0.15 + p.shootFlash * 0.25;
    const reach = (w.biome.glowRadius ?? 1) * (p.stats.flags.has('lantern') ? 1.5 : 1);
    lights.push({ x: p.x, y: p.y, r: (230 + m * 120) * breathe * reach, c: neon ? 0xffc8ff : 0xffc890, a: Math.min(1, 0.5 + m * 0.5) });
    for (const b of w.bubbles) if (lights.length < 70) lights.push({ x: b.x, y: b.y, r: 60 + b.r * 3, c: b.color, a: 0.4 });
    for (const s of w.shots) if (lights.length < 110) lights.push({ x: s.x, y: s.y, r: 44, c: s.color, a: 0.3 });
    for (const pd of w.pedestals) if (pd.itemId && vis(pd.x, pd.y, 150)) lights.push({ x: pd.x, y: pd.y, r: 150, c: ITEM_BY_ID[pd.itemId]?.color ?? 0xffffff, a: 0.5 });
    for (const pr of w.props) if (pr.active && pr.kind === 'crack' && vis(pr.x, pr.y, 320)) lights.push({ x: pr.x, y: pr.y - 40, r: 320, c: 0x9ef0ff, a: 0.9 });
    for (const bm of w.beams) for (let s = 0; s < bm.len; s += 120) lights.push({ x: bm.x + bm.dx * s, y: bm.y + bm.dy * s, r: 160, c: bm.color, a: 0.8 });
    for (const l of this.fx.lights) if (vis(l.x, l.y, l.r)) lights.push({ x: l.x, y: l.y, r: l.r, c: l.color, a: l.intensity * (1 - l.age / l.life) });
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
      s.x = (l.x - this.camX) * this.zoom;
      s.y = (l.y - this.camY) * this.zoom;
      s.scale.set((l.r * 2 * this.zoom) / 128);
      s.tint = l.c;
      s.alpha = l.a;
    }
    this.app.renderer.render({ container: this.lightRoot, target: this.lightRT, clear: true });
  }

  private renderTransition() {
    const g = this.transG;
    g.clear();
    if (this.intro && this.intro.fade > 0) g.rect(-20, -20, VIEW_W + 40, VIEW_H + 40).fill({ color: 0x010204, alpha: this.intro.fade });
    const tr = this.transition;
    if (!tr) return;
    // Camera cut: a quick fade through black (longer and deeper when descending).
    const k = tr.t < 1 ? tr.t : 2 - tr.t;
    const e = k * k * (3 - 2 * k);
    g.rect(-20, -20, VIEW_W + 40, VIEW_H + 40).fill({ color: 0x010204, alpha: tr.dir === 'fade' ? e * 0.9 : e });
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
