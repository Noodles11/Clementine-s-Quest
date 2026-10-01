// Boot + game controller: profile, meta progression, screens, run lifecycle.

import { Application } from 'pixi.js';
import { VIEW_H, VIEW_W } from './config';
import { initInput, input } from './core/input';
import { TouchControls } from './core/touch';
import { setVolume, sfx, unlockAudio } from './core/audio';
import {
  clearRun, exportProfile, importProfile, loadProfile, loadRun, saveProfile, saveRun, type Options, type Profile,
} from './core/save';
import { ACH_BY_ID, grant, maxDepthFor } from './game/achievements';
import { ITEM_BY_ID } from './game/items';
import { itemEffects } from './game/itemtext';
import { HP_PER_CONTAINER, Run, type RunData } from './game/run';
import { SYNERGIES, TRANSFORMATIONS } from './game/synergies';
import { BOSS_NAMES, biomeFor, stagesAt, type BossKind } from './gen/biomes';
import { normalizeSeedCode, randomSeedCode, SPECIAL_SEEDS } from './gen/seed';
import { GameScene } from './scene';
import { UI, type RunSummary } from './ui';
import type { WorldEvent } from './game/room';
import type { Boss } from './game/bosses';

class Game {
  profile: Profile;
  ui: UI;
  scene!: GameScene;
  app!: Application;
  run: Run | null = null;
  pendingUnlocks: string[] = [];
  touch!: TouchControls;

  constructor() {
    this.profile = loadProfile();
    this.ui = new UI(document.getElementById('ui')!);
  }

  async boot() {
    const app = new Application();
    await app.init({
      width: VIEW_W,
      height: VIEW_H,
      background: '#06101d',
      antialias: true,
      autoDensity: false,
      resolution: 1,
      preference: 'webgl',
    });
    this.app = app;
    document.getElementById('canvas-host')!.appendChild(app.canvas);
    this.fit();
    window.addEventListener('resize', () => this.fit());
    initInput();
    setVolume(this.profile.options.volume);
    await Promise.race([
      Promise.all([document.fonts.load('32px Bangers'), document.fonts.load('16px Fredoka'), document.fonts.load('bold 16px Fredoka')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]).catch(() => {});

    this.scene = new GameScene(app, {
      onEvent: (ev) => this.onWorldEvent(ev),
      onDeath: (by) => this.onDeath(by),
      onVictory: () => this.onVictory(),
      onPause: () => this.showPause(),
      onRestart: () => (this.run?.data.debug ? this.newRun(undefined, true, true) : this.newRun()),
      onDebugMenu: () => this.showDebugItems(() => this.resumePlay()),
      onAutosave: () => this.autosave(),
      onFloorStart: (d, s) => this.onFloorStart(d, s),
      onBossIntro: (b) => this.bossIntro(b),
    }, this.profile.options);
    this.ui.iconFor = (id) => this.scene.itemIcon(id);
    this.ui.enemyIconFor = (k) => this.scene.enemyIcon(k);
    this.touch = new TouchControls();
    this.ui.touch = this.touch.enabled;
    app.ticker.add((tk) => {
      this.scene.update(tk.deltaMS / 1000);
      this.touch.setVisible(this.scene.mode === 'play' && !this.ui.open);
    });
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    window.addEventListener('beforeunload', () => this.autosave());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.scene.mode === 'play') {
        this.scene.pause();
        this.showPause();
      }
    });

    const loading = document.getElementById('loading')!;
    loading.style.opacity = '0';
    setTimeout(() => loading.remove(), 450);
    this.showTitle();
  }

  fit() {
    const s = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
    const stage = document.getElementById('stage')!;
    stage.style.transform = `scale(${s})`;
    stage.style.left = `${(window.innerWidth - VIEW_W * s) / 2}px`;
    stage.style.top = `${(window.innerHeight - VIEW_H * s) / 2}px`;
    if (this.app) {
      const res = Math.min(2, Math.max(1, s * (window.devicePixelRatio || 1)));
      this.app.renderer.resolution = res;
      this.app.renderer.resize(VIEW_W, VIEW_H);
      this.app.canvas.style.width = `${VIEW_W}px`;
      this.app.canvas.style.height = `${VIEW_H}px`;
    }
  }

  // ── Screens ────────────────────────────────────────────
  showTitle() {
    this.run = null;
    input.setEnabled(false);
    const saved = loadRun<RunData>();
    const demo = Run.create(randomSeedCode(), true, [], 1);
    const beaten = ['barnacle', 'queenclam', 'kelpie', 'sirurchin', 'admiral', 'treasuremimic'].filter((k) => this.profile.achievements.includes(`beat_${k}`));
    this.scene.startAttract(demo, beaten);
    this.ui.showTitle(this.profile, !!saved, {
      continueRun: () => this.continueRun(),
      newRun: () => this.newRun(),
      seeded: () =>
        this.ui.showSeedEntry(
          (v) => {
            if (v.trim().toUpperCase() === 'DEBUG') {
              this.newRun(undefined, true, true);
              return true;
            }
            const code = normalizeSeedCode(v);
            if (!code) return false;
            this.newRun(code, true);
            return true;
          },
          () => this.showTitle(),
        ),
      dex: () => this.ui.showDex(this.profile, () => this.showTitle()),
      options: () => this.ui.showOptions(this.profile.options, (o) => this.setOptions(o), () => this.showTitle()),
      save: () =>
        this.ui.showSaveCode(exportProfile(this.profile), (code) => {
          const p = importProfile(code);
          if (!p) return false;
          this.profile = p;
          saveProfile(p);
          this.setOptions(p.options);
          return true;
        }, () => this.showTitle()),
      help: () => this.ui.showHelp(() => this.showTitle()),
    });
  }

  setOptions(o: Options) {
    this.profile.options = o;
    saveProfile(this.profile);
    setVolume(o.volume);
    this.scene.applyOptions(o);
  }

  showPause() {
    const run = this.run;
    if (!run) return;
    input.setEnabled(false);
    const w = this.scene.world!;
    this.ui.showPause(
      {
        seed: run.data.seedCode, custom: run.data.custom, depth: run.data.depth, biome: w.biome.name,
        items: [...run.p.items, ...(run.p.active ? [run.p.active.id] : [])],
        synergies: [...run.data.synergies, ...run.data.transformations],
      },
      {
        resume: () => this.resumePlay(),
        debugItems: run.data.debug ? () => this.showDebugItems(() => this.showPause()) : undefined,
        options: () => this.ui.showOptions(this.profile.options, (o) => this.setOptions(o), () => this.showPause()),
        saveQuit: () => {
          this.autosave();
          this.scene.stop();
          this.showTitle();
        },
        abandon: () => {
          clearRun();
          this.recordDeath('Abandoned the dive');
          this.scene.stop();
          this.showTitle();
        },
      },
    );
  }

  resumePlay() {
    this.ui.clear();
    input.setEnabled(true);
    this.scene.resume();
  }

  /** Debug dives: pick any item. */
  showDebugItems(onClose: () => void) {
    input.setEnabled(false);
    const run = this.run!;
    const owned = [...new Set([...run.p.items, ...(run.p.active ? [run.p.active.id] : [])])];
    this.ui.showItemPicker(owned, (sel) => {
      this.scene.world?.debugSetItems(sel);
      onClose();
    }, onClose);
  }

  // ── Runs ───────────────────────────────────────────────
  newRun(code?: string, custom = false, debug = false) {
    unlockAudio();
    const seed = code ?? randomSeedCode();
    const isCustom = custom || !!SPECIAL_SEEDS[seed];
    this.pendingUnlocks = [];
    const run = Run.create(seed, isCustom, this.profile.achievements, maxDepthFor(this.profile));
    if (debug) run.makeDebug();
    this.run = run;
    this.profile.stats.runs++;
    saveProfile(this.profile);
    clearRun();
    const begin = () => {
      input.setEnabled(true);
      this.scene.startRun(run, true);
      if (SPECIAL_SEEDS[seed]) this.ui.toast('SPECIAL SEED!', SPECIAL_SEEDS[seed]);
      if (debug) this.ui.toast('DEBUG DIVE', 'Press ` or open the pause menu to pick any item');
      this.autosave();
    };
    if (this.scene.mode === 'attract') {
      // From the title: the menu fades while Clementine dives into the opening.
      this.ui.fadeOut();
      input.setEnabled(false);
      this.scene.playIntro(begin);
    } else {
      this.ui.clear();
      begin();
    }
  }

  continueRun() {
    const data = loadRun<RunData>();
    if (!data) return this.newRun();
    try {
      const run = new Run(data);
      this.run = run;
      this.ui.clear();
      input.setEnabled(true);
      this.scene.startRun(run, false);
    } catch (e) {
      console.warn('Could not restore run', e);
      clearRun();
      this.newRun();
    }
  }

  autosave() {
    if (!this.run || this.scene.mode === 'dead') return;
    this.scene.world?.persist();
    saveRun(this.run.data);
  }

  onFloorStart(depth: number, stage = 1) {
    const b = biomeFor(depth);
    const label = depth >= 7 ? 'THE BOTTOM' : `DEPTH ${depth} · REEF ${stage} OF ${stagesAt(depth)}`;
    if (depth >= 7) {
      // Sucked down the pipe.
      input.setEnabled(false);
      this.scene.pause();
      this.ui.showCutscene(
        [
          { cap: 'The grate gave way. The Crack was never a crack: it was a pipe, and it was pulling.', sfx: 'SHLUUURP!', bg: 'linear-gradient(#3a4a6a,#05040a)' },
          { cap: 'Round and round, up and up... and out into fluorescent light.', sfx: 'BLOOP!', bg: 'linear-gradient(#dff6ff,#3a8ab8)' },
        ],
        () => {
          this.ui.clear();
          this.resumePlay();
          this.ui.floorTitle(label, b.name, b.subtitle);
        },
      );
    } else this.ui.floorTitle(label, b.name, b.subtitle);
    const p = this.profile;
    p.stats.bestDepth = Math.max(p.stats.bestDepth, depth);
    saveProfile(p);
  }

  async bossIntro(b: Boss) {
    const kind = b.bossKind as BossKind;
    if (!this.profile.seenBosses.includes(kind)) this.profile.seenBosses.push(kind);
    saveProfile(this.profile);
    const img = await this.scene.bossPortrait(b);
    sfx.bossRoar();
    await this.ui.showBossCover(kind, img, this.run?.data.depth ?? 1);
  }

  private achieve(id: string) {
    if (!this.run || this.run.data.custom) return;
    if (grant(this.profile, id)) {
      const a = ACH_BY_ID[id];
      this.ui.toast(`★ ${a.name}`, `Unlocked: ${a.reward}`);
      sfx.unlock();
      if (id === 'tank') this.pendingUnlocks.push(id);
      saveProfile(this.profile);
    }
  }

  onWorldEvent(ev: WorldEvent) {
    const p = this.profile;
    switch (ev.type) {
      case 'item': {
        const def = ITEM_BY_ID[ev.id];
        if (def) {
          this.ui.banner(def.name, def.tagline, '#' + def.color.toString(16).padStart(6, '0'), itemEffects(def));
          if (!p.seenItems.includes(ev.id)) p.seenItems.push(ev.id);
          p.stats.itemsTaken[ev.id] = (p.stats.itemsTaken[ev.id] ?? 0) + 1;
        } else this.ui.banner('Heart Container', 'Health up', '#ff4d6d', [`+${HP_PER_CONTAINER} max HP`]);
        saveProfile(p);
        break;
      }
      case 'synergy': {
        const s = SYNERGIES.find((x) => x.id === ev.id)!;
        setTimeout(() => this.ui.banner(s.name, `Synergy · ${s.desc}`, '#ff5cae'), 900);
        p.counters['syn_' + ev.id] = (p.counters['syn_' + ev.id] ?? 0) + 1;
        this.achieve('first_synergy');
        saveProfile(p);
        break;
      }
      case 'transformation': {
        const t = TRANSFORMATIONS.find((x) => x.id === ev.id)!;
        setTimeout(() => this.ui.banner(t.name.charAt(0) + t.name.slice(1).toLowerCase(), `Transformation · ${t.desc}`, '#9a6bff'), 1000);
        p.counters['tf_' + ev.id] = (p.counters['tf_' + ev.id] ?? 0) + 1;
        this.achieve('transformation');
        saveProfile(p);
        break;
      }
      case 'bossDefeated': {
        const run = this.run!;
        const kind = ev.kind as BossKind;
        run.data.bossesBeaten.push(kind);
        this.ui.banner(BOSS_NAMES[kind].name, 'Defeated · colour floods back into the reef', '#ff9a2e');
        this.achieve(`beat_${kind}`);
        if (run.data.depth <= 5 && run.stage >= stagesAt(run.data.depth)) this.achieve(`dive${run.data.depth + 1}`);
        if (kind === 'hollowmaw' && !run.data.custom) {
          // The first time the grate only rattles; the second time it gives way.
          p.counters.hollowmaw = (p.counters.hollowmaw ?? 0) + 1;
          if (p.counters.hollowmaw >= 2) {
            this.achieve('tank');
            run.data.maxDepth = Math.max(run.data.maxDepth, 7);
            setTimeout(() => this.ui.banner('The grate gives way', 'The pipe is open · take the rift down', '#dff6ff'), 1500);
          } else setTimeout(() => this.ui.banner('A rusty grate rattles', 'Something is behind it… beat the Hollow Maw once more', '#dff6ff'), 1500);
        }
        if (!run.data.custom) {
          if (kind === 'admiral') {
            p.counters.admiral = (p.counters.admiral ?? 0) + 1;
            if (p.counters.admiral >= 3) this.achieve('admiral_key');
          }
          if (!run.data.floorDamaged) this.achieve('flawless_floor');
        }
        saveProfile(p);
        this.autosave();
        break;
      }
      case 'enemySeen':
        if (!p.seenEnemies.includes(ev.kind) && !(ev.kind in BOSS_NAMES)) {
          p.seenEnemies.push(ev.kind);
          saveProfile(p);
        }
        break;
      case 'snack':
        this.ui.banner(ev.name, 'Sea snack', '#1b1030');
        break;
      default:
        break;
    }
  }

  private summary(killer?: string): RunSummary {
    const r = this.run!;
    return {
      seed: r.data.seedCode, custom: r.data.custom, depth: r.data.depth, time: r.data.time, kills: r.data.kills,
      items: [...r.p.items, ...(r.p.active ? [r.p.active.id] : [])], killer, synergies: r.data.synergies,
    };
  }

  private recordDeath(by: string) {
    const p = this.profile;
    p.stats.deaths++;
    p.stats.deathsBy[by] = (p.stats.deathsBy[by] ?? 0) + 1;
    if (p.stats.deaths >= 5 && this.run && !this.run.data.custom) this.achieve('die_5');
    saveProfile(p);
  }

  onDeath(by: string) {
    clearRun();
    this.recordDeath(by);
    sfx.hurt();
    input.setEnabled(false);
    const s = this.summary(by);
    setTimeout(() => {
      this.ui.showGameOver(s, {
        again: () => this.newRun(),
        sameSeed: () => this.newRun(s.seed, true),
        title: () => {
          this.scene.stop();
          this.showTitle();
        },
      });
    }, 900);
  }

  onVictory() {
    clearRun();
    const p = this.profile;
    const run = this.run!;
    if (!run.data.custom) {
      p.stats.wins++;
      if (!p.stats.bestTimeSec || run.data.time < p.stats.bestTimeSec) p.stats.bestTimeSec = run.data.time;
      this.achieve('win');
    }
    saveProfile(p);
    sfx.unlock();
    input.setEnabled(false);
    const s = this.summary();
    const unlocks = this.pendingUnlocks.splice(0);
    const showEnd = () =>
      this.ui.showVictory(s, unlocks.map((u) => ACH_BY_ID[u].reward), {
        title: () => {
          this.scene.stop();
          this.showTitle();
        },
      });
    if (run.data.depth >= 7) {
      // The true ending.
      this.ui.showCutscene(
        [
          { cap: 'The Hand jerked back. "OW! It stings!" A net clattered into the gravel.', sfx: 'YOWCH!', bg: 'linear-gradient(#bfe8ff,#3a8ab8)' },
          { cap: 'The tank was carried to the shore... and tipped back into the sea.', sfx: 'SPLOOSH!', bg: 'linear-gradient(#ffd8a0,#2a7ab8)' },
          { cap: 'Clementine and every rescued creature poured out. The pipe was sealed.', sfx: 'BLUB BLUB', bg: 'linear-gradient(#46a9ba,#0d4a66)' },
          { cap: 'And the Great Current began to sing again.', sfx: '~♪~', bg: 'linear-gradient(#ff9a5c,#5a3f8a)' },
        ],
        showEnd,
      );
    } else if (run.data.depth >= 6 && (this.profile.counters.hollowmaw ?? 0) === 1 && !run.data.custom) {
      this.ui.showCutscene(
        [
          { cap: 'The Hollow Maw coughed up something hard: a rusty metal grate, bolted over the Crack.', sfx: 'KLANK!', bg: 'linear-gradient(#2a2236,#05040a)' },
          { cap: 'Behind it, water rushed somewhere far away. The grate rattled… and held.', sfx: 'RATTLE', bg: 'linear-gradient(#3a4a6a,#05040a)' },
          { cap: 'Beat the Hollow Maw once more, and it might give way.', sfx: '???', bg: 'linear-gradient(#14243a,#03060e)' },
        ],
        showEnd,
      );
    } else showEnd();
  }
}

const game = new Game();
(window as any).__game = game;
game.boot().catch((e) => {
  console.error(e);
  const l = document.getElementById('loading');
  if (l) l.querySelector('.loading-sub')!.textContent = 'Could not start the game: ' + (e?.message ?? e);
});
