// Boot + game controller: profile, meta progression, screens, run lifecycle.

import { Application } from 'pixi.js';
import { VIEW_H, VIEW_W } from './config';
import { initInput, input } from './core/input';
import { setVolume, sfx, unlockAudio } from './core/audio';
import {
  clearRun, exportProfile, importProfile, loadProfile, loadRun, saveProfile, saveRun, type Options, type Profile,
} from './core/save';
import { ACH_BY_ID, grant, maxDepthFor } from './game/achievements';
import { ITEM_BY_ID } from './game/items';
import { Run, type RunData } from './game/run';
import { SYNERGIES, TRANSFORMATIONS } from './game/synergies';
import { BIOMES, BOSS_NAMES, biomeFor, type BossKind } from './gen/biomes';
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
      onRestart: () => this.newRun(),
      onAutosave: () => this.autosave(),
      onFloorStart: (d) => this.onFloorStart(d),
      onBossIntro: (b) => this.bossIntro(b),
    }, this.profile.options);
    this.ui.iconFor = (id) => this.scene.itemIcon(id);
    this.ui.enemyIconFor = (k) => this.scene.enemyIcon(k);
    app.ticker.add((tk) => this.scene.update(tk.deltaMS / 1000));
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
        resume: () => {
          this.ui.clear();
          input.setEnabled(true);
          this.scene.resume();
        },
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

  // ── Runs ───────────────────────────────────────────────
  newRun(code?: string, custom = false) {
    unlockAudio();
    const seed = code ?? randomSeedCode();
    const isCustom = custom || !!SPECIAL_SEEDS[seed];
    this.pendingUnlocks = [];
    const run = Run.create(seed, isCustom, this.profile.achievements, maxDepthFor(this.profile));
    this.run = run;
    this.profile.stats.runs++;
    saveProfile(this.profile);
    clearRun();
    this.ui.clear();
    input.setEnabled(true);
    this.scene.startRun(run, true);
    if (SPECIAL_SEEDS[seed]) this.ui.toast('SPECIAL SEED!', SPECIAL_SEEDS[seed]);
    this.autosave();
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

  onFloorStart(depth: number) {
    const b = biomeFor(depth);
    this.ui.floorTitle(depth, b.name, b.subtitle);
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
      if (id === 'dive2' || id === 'dive3') this.pendingUnlocks.push(id);
      saveProfile(this.profile);
    }
  }

  onWorldEvent(ev: WorldEvent) {
    const p = this.profile;
    switch (ev.type) {
      case 'item': {
        const def = ITEM_BY_ID[ev.id];
        if (def) {
          this.ui.banner(def.name.toUpperCase(), def.tagline, '#' + def.color.toString(16).padStart(6, '0'));
          if (!p.seenItems.includes(ev.id)) p.seenItems.push(ev.id);
          p.stats.itemsTaken[ev.id] = (p.stats.itemsTaken[ev.id] ?? 0) + 1;
        } else this.ui.banner('HEART CONTAINER', 'Health up!', '#ff4d6d');
        saveProfile(p);
        break;
      }
      case 'synergy': {
        const s = SYNERGIES.find((x) => x.id === ev.id)!;
        setTimeout(() => this.ui.banner(`SYNERGY! ${s.name.toUpperCase()}`, s.desc, '#ff5cae'), 900);
        p.counters['syn_' + ev.id] = (p.counters['syn_' + ev.id] ?? 0) + 1;
        this.achieve('first_synergy');
        saveProfile(p);
        break;
      }
      case 'transformation': {
        const t = TRANSFORMATIONS.find((x) => x.id === ev.id)!;
        setTimeout(() => this.ui.banner(t.name, t.desc, '#9a6bff'), 1000);
        p.counters['tf_' + ev.id] = (p.counters['tf_' + ev.id] ?? 0) + 1;
        this.achieve('transformation');
        saveProfile(p);
        break;
      }
      case 'bossDefeated': {
        const run = this.run!;
        const kind = ev.kind as BossKind;
        run.data.bossesBeaten.push(kind);
        this.ui.banner(`${BOSS_NAMES[kind].name.toUpperCase()} DEFEATED!`, 'Color floods back into the reef', '#ff9a2e');
        this.achieve(`beat_${kind}`);
        if (run.data.depth === 1) this.achieve('dive2');
        if (run.data.depth === 2) this.achieve('dive3');
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
        this.ui.banner(ev.name.toUpperCase(), '', '#1b1030');
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
        again: () => this.newRun(),
        title: () => {
          this.scene.stop();
          this.showTitle();
        },
      });
    if (unlocks.length) {
      const d = unlocks.includes('dive3') ? 3 : 2;
      const b = BIOMES[d - 1];
      this.ui.showCutscene(
        [
          { cap: 'The boss fell... and the Crack beneath it began to glow.', sfx: 'KRRRAK!', bg: 'linear-gradient(#1a8fb8,#10283a)' },
          { cap: 'A warm current tugged at Clementine’s tentacles. Deeper. Deeper.', sfx: 'WHOOSH', bg: 'linear-gradient(#2a6f8a,#0b1a2e)' },
          { cap: `NEW DIVE UNLOCKED: ${b.name}! Next time, the Crack will stay open.`, sfx: 'BLUB!', bg: `linear-gradient(#${b.waterTop.toString(16).padStart(6, '0')},#${b.waterBottom.toString(16).padStart(6, '0')})` },
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
