// DOM overlay UI: title, pause, game over, victory, covers, banners, toasts,
// Sea-pedia, options, save codes. Comic styling lives in style.css.

import { ACHIEVEMENTS } from './game/achievements';
import { BOSS_NAMES, BIOMES, type BossKind } from './gen/biomes';
import { ENEMY_INFO } from './game/enemies';
import { ITEMS, ITEM_BY_ID } from './game/items';
import { SYNERGIES, TRANSFORMATIONS } from './game/synergies';
import type { Options, Profile } from './core/save';
import { formatSeed } from './gen/seed';
import { MAX_DEPTH_V1 } from './config';

type Handler = () => void;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function btn(label: string, cls: string, onClick: Handler, disabled = false) {
  const b = el('button', `btn ${cls}`, label);
  b.disabled = disabled;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export interface RunSummary {
  seed: string;
  custom: boolean;
  depth: number;
  time: number;
  kills: number;
  items: string[];
  killer?: string;
  synergies: string[];
}

export class UI {
  root: HTMLElement;
  private layer: HTMLElement | null = null;
  private popups: HTMLElement;
  private toasts: HTMLElement;
  iconFor: (id: string) => Promise<string> = async () => '';
  /** Touch device: show touch control hints instead of keys. */
  touch = false;
  enemyIconFor: (kind: string) => Promise<string> = async () => '';

  constructor(root: HTMLElement) {
    this.root = root;
    this.popups = el('div');
    this.popups.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    this.toasts = el('div', 'toasts');
    root.append(this.popups, this.toasts);
    window.addEventListener('keydown', (e) => this.menuKeys(e));
  }

  get open() {
    return !!this.layer;
  }

  private menuKeys(e: KeyboardEvent) {
    if (!this.layer) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      if (e.key === 'Enter') (this.layer.querySelector('.btn.primary') as HTMLButtonElement | null)?.click();
      return;
    }
    const btns = Array.from(this.layer.querySelectorAll<HTMLButtonElement>('.btn:not(:disabled)'));
    if (!btns.length) return;
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 's' || e.key === 'd') {
      btns[(i + 1) % btns.length].focus();
      e.preventDefault();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'w' || e.key === 'a') {
      btns[(i - 1 + btns.length) % btns.length].focus();
      e.preventDefault();
    } else if (e.key === 'Escape') {
      const back = this.layer.querySelector<HTMLButtonElement>('.btn.back');
      if (back) {
        back.click();
        e.preventDefault();
      }
    }
  }

  clear() {
    this.layer?.remove();
    this.layer = null;
  }

  /** Fade the current screen out (e.g. the title menu when a dive starts). */
  fadeOut(ms = 700) {
    const l = this.layer;
    if (!l) return;
    this.layer = null;
    l.style.transition = `opacity ${ms}ms ease`;
    l.style.pointerEvents = 'none';
    requestAnimationFrame(() => (l.style.opacity = '0'));
    setTimeout(() => l.remove(), ms + 50);
  }

  private show(node: HTMLElement) {
    this.clear();
    // Modal screens replace transient popups (banners, floor titles).
    this.popups.querySelectorAll('.banner, .floor-title').forEach((b) => b.remove());
    this.layer = node;
    this.root.insertBefore(node, this.popups);
    requestAnimationFrame(() => (node.querySelector('.btn:not(:disabled)') as HTMLElement | null)?.focus({ preventScroll: true }));
  }

  // ── Title ────────────────────────────────────────────
  showTitle(p: Profile, canContinue: boolean, h: { continueRun: Handler; newRun: Handler; seeded: Handler; dex: Handler; options: Handler; save: Handler; help: Handler }) {
    const s = el('div', 'title-screen');
    const left = el('div');
    left.append(el('div', 'logo', `Clementine's<small>QUEST</small>`));
    left.append(el('div', 'tagline', 'The Great Current has gone silent. One tiny octopus who glows a little too much drifts down to find out why.'));
    const menu = el('div', 'menu');
    if (canContinue) menu.append(btn('Continue Dive', 'orange', h.continueRun));
    menu.append(btn('New Dive', canContinue ? '' : 'orange', h.newRun));
    menu.append(btn('Seeded Dive', 'teal small', h.seeded));
    const row = el('div', 'row');
    row.append(btn('Field journal', 'purple small', h.dex), btn('Options', 'gray small', h.options));
    menu.append(row);
    const row2 = el('div', 'row');
    row2.append(btn('Save Code', 'gray small', h.save), btn('How to Play', 'gray small', h.help));
    menu.append(row2);
    left.append(menu);
    const dives = el('div', 'dives');
    for (let d = 1; d <= MAX_DEPTH_V1; d++) {
      const unlocked = d === 1 || p.achievements.includes(`dive${d}`);
      dives.append(el('div', `dive ${unlocked ? '' : 'locked'}`, unlocked ? `${d} · ${BIOMES[d - 1].name}` : `${d} · ???`));
    }
    const prog = el('div', 'progress', `Runs ${p.stats.runs} · Wins ${p.stats.wins} · Achievements ${p.achievements.length}/${ACHIEVEMENTS.length}`);
    left.append(dives, prog);
    s.append(left);
    if (this.touch) s.append(el('div', 'controls-hint', 'Left thumb: swim · Right thumb: aim & shoot · 💣 bomb · ★ active · 🍬 snack'));
    else s.append(el('div', 'controls-hint', `<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> swim · <kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> shoot · <kbd>E</kbd> ink bomb · <kbd>Space</kbd> active · <kbd>Q</kbd> snack · <kbd>Esc</kbd> pause`));
    this.show(s);
  }

  showSeedEntry(onStart: (code: string) => boolean, onBack: Handler) {
    const o = el('div', 'overlay');
    const p = el('div', 'panel halftone');
    p.style.width = '420px';
    p.append(el('h1', 'title-text screen-title', 'Seeded dive'));
    p.append(el('p', 'muted', 'Enter an 8-character seed (e.g. KELP 7Q2Z). Seeded dives are for practice and sharing: they never unlock achievements.'));
    const inp = el('input') as HTMLInputElement;
    inp.type = 'text';
    inp.maxLength = 9;
    inp.placeholder = 'XXXX XXXX';
    const err = el('p', 'muted');
    p.append(inp, err);
    const go = btn('Dive!', 'orange primary', () => {
      if (!onStart(inp.value)) {
        err.textContent = 'That seed does not look right. Use letters A–Z (no I/O) and digits 2–9.';
        inp.focus();
      }
    });
    p.append(go, btn('Back', 'gray small back', onBack));
    o.append(p);
    this.show(o);
    setTimeout(() => inp.focus(), 50);
  }

  showHelp(onBack: Handler) {
    const o = el('div', 'overlay');
    const p = el('div', 'panel halftone help');
    p.style.width = '620px';
    p.append(el('h1', 'title-text screen-title', 'How to play'));
    p.append(el('div', '', `
      <p><b>Touch:</b> drag anywhere on the left half to swim, on the right half to aim and shoot.
      Buttons: 💣 ink bomb, ★ active item, 🍬 snack, ❚❚ pause, ▦ map.</p>
      <p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> swim. Let go and Clementine slowly sinks.<br/>
      <kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> squirt ink. <kbd>E</kbd> drop an ink bomb (it sinks!).<br/>
      <kbd>Space</kbd> use your active item. <kbd>Q</kbd> eat your sea snack. <kbd>Esc</kbd> pause. Hold <kbd>R</kbd> to restart.</p>
      <p>Clear rooms to open the doors. Find the <b>treasure room</b> (gold door), the <b>shop</b> (Barnaby the hermit crab) and the <b>boss</b>.
      Bosses guard <b>The Crack</b> — beat them to dive deeper. Your first dives end after one depth; every new boss you beat unlocks the next.</p>
      <p>Items combine: many ink effects stack, and some pairs trigger <b>synergies</b>. Collect three related items to <b>transform</b>.
      Bomb suspicious cracked walls for secrets. The deeper you go, the darker and meaner the sea gets.</p>`));
    p.append(btn('Got it!', 'orange back', onBack));
    o.append(p);
    this.show(o);
  }

  // ── Pause ────────────────────────────────────────────
  showPause(info: { seed: string; custom: boolean; depth: number; biome: string; items: string[]; synergies: string[] }, h: { resume: Handler; options: Handler; saveQuit: Handler; abandon: Handler }) {
    const o = el('div', 'overlay');
    const p = el('div', 'panel halftone');
    p.style.width = '520px';
    p.append(el('h1', 'title-text screen-title', 'Paused'));
    const seed = el('div', '', `<span class="seedline" title="Click to copy">${formatSeed(info.seed)}</span> ${info.custom ? '<span class="muted">(seeded — no unlocks)</span>' : ''}`);
    seed.querySelector('.seedline')!.addEventListener('click', () => navigator.clipboard?.writeText(formatSeed(info.seed)));
    p.append(seed);
    p.append(el('p', '', `<b>Depth ${info.depth}</b> · ${esc(info.biome)}`));
    const strip = el('div', 'itemstrip');
    this.fillStrip(strip, info.items);
    p.append(strip);
    if (info.synergies.length) p.append(el('p', 'muted', 'Synergies: ' + info.synergies.map((s) => SYNERGIES.find((x) => x.id === s)?.name ?? TRANSFORMATIONS.find((x) => x.id === s)?.name ?? s).join(', ')));
    p.append(btn('Resume', 'orange back', h.resume), btn('Options', 'gray small', h.options), btn('Save & Quit', 'teal small', h.saveQuit), btn('Abandon Dive', 'gray small', h.abandon));
    o.append(p);
    this.show(o);
  }

  private fillStrip(strip: HTMLElement, items: string[]) {
    for (const id of items) {
      const img = el('img') as HTMLImageElement;
      img.title = ITEM_BY_ID[id]?.name ?? id;
      strip.append(img);
      void this.iconFor(id).then((u) => (img.src = u));
    }
  }

  // ── End screens ──────────────────────────────────────
  showGameOver(s: RunSummary, h: { again: Handler; sameSeed: Handler; title: Handler }) {
    const o = el('div', 'overlay');
    const p = el('div', 'panel halftone');
    p.style.width = '540px';
    p.append(el('h1', 'title-text screen-title', 'Her light went out'));
    p.append(el('p', '', `Knocked out by <b>${esc(s.killer ?? 'the deep')}</b> on Depth ${s.depth}.`));
    p.append(this.summaryGrid(s));
    const strip = el('div', 'itemstrip');
    this.fillStrip(strip, s.items);
    p.append(strip);
    p.append(btn('Dive Again', 'orange', h.again), btn('Retry Same Seed', 'teal small', h.sameSeed), btn('Title', 'gray small back', h.title));
    o.append(p);
    this.show(o);
  }

  showVictory(s: RunSummary, unlocks: string[], h: { again: Handler; title: Handler }) {
    const o = el('div', 'overlay');
    const p = el('div', 'panel halftone');
    p.style.width = '560px';
    p.append(el('h1', 'title-text screen-title', 'Back to the surface'));
    p.append(el('p', '', `Clementine made it through Depth ${s.depth} and floated home, glowing proudly.`));
    p.append(this.summaryGrid(s));
    if (unlocks.length) p.append(el('p', '', '<b>New:</b> ' + unlocks.map(esc).join(' · ')));
    const strip = el('div', 'itemstrip');
    this.fillStrip(strip, s.items);
    p.append(strip);
    p.append(btn('Dive Again', 'orange', h.again), btn('Title', 'gray small back', h.title));
    o.append(p);
    this.show(o);
  }

  private summaryGrid(s: RunSummary) {
    const m = Math.floor(s.time / 60), sec = Math.floor(s.time % 60);
    return el('div', 'stat-grid', `
      <b>SEED</b><span>${formatSeed(s.seed)}${s.custom ? ' (seeded)' : ''}</span>
      <b>TIME</b><span>${m}:${String(sec).padStart(2, '0')}</span>
      <b>FOES POPPED</b><span>${s.kills}</span>
      <b>ITEMS</b><span>${s.items.length}</span>
      <b>SYNERGIES</b><span>${s.synergies.length}</span>`);
  }

  /** Comic cutscene when a new dive unlocks. */
  showCutscene(panels: { cap: string; sfx: string; img?: string; bg?: string }[], onDone: Handler) {
    const o = el('div', 'overlay');
    o.style.flexDirection = 'column';
    o.style.gap = '18px';
    const strip = el('div', 'comic-strip');
    panels.forEach((pn, i) => {
      const cp = el('div', 'comic-panel');
      if (pn.bg) cp.style.background = pn.bg;
      cp.style.animationDelay = `${i * 0.7}s`;
      if (pn.img) {
        const im = el('img') as HTMLImageElement;
        im.src = pn.img;
        cp.append(im);
      }
      cp.append(el('div', 'cap', esc(pn.cap)), el('div', 'sfx', esc(pn.sfx)));
      strip.append(cp);
    });
    o.append(strip);
    const b = btn('Continue', 'orange back', onDone);
    b.style.width = '240px';
    b.style.opacity = '0';
    b.style.transition = 'opacity .3s';
    setTimeout(() => (b.style.opacity = '1'), panels.length * 700);
    o.append(b);
    this.show(o);
  }

  // ── In-game popups ───────────────────────────────────
  showBossCover(kind: BossKind, img: string, depth: number): Promise<void> {
    return new Promise((resolve) => {
      const info = BOSS_NAMES[kind];
      const c = el('div', 'cover');
      const sheet = el('div', 'sheet');
      sheet.append(el('div', 'issue', `Specimen ${info.issue.replace('ISSUE #', '0')} · Depth ${depth}`), el('div', 'vs', 'VS. CLEMENTINE'));
      if (img) {
        const im = el('img') as HTMLImageElement;
        im.src = img;
        sheet.append(im);
      }
      sheet.append(el('div', 'boss-name', esc(info.name)), el('div', 'boss-tag', esc(info.tagline)));
      c.append(sheet);
      this.popups.append(c);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.removeEventListener('keydown', skip);
        c.style.transition = 'opacity .2s';
        c.style.opacity = '0';
        setTimeout(() => c.remove(), 220);
        resolve();
      };
      const skip = (e: KeyboardEvent) => {
        if (e.code === 'Enter' || e.code === 'Space') finish();
      };
      window.addEventListener('keydown', skip);
      setTimeout(finish, 2300);
    });
  }

  banner(title: string, sub: string, color = '#1b1030') {
    this.popups.querySelectorAll('.banner').forEach((b) => b.remove());
    const b = el('div', 'banner');
    const bub = el('div', 'bubble');
    const h = el('h2', '', esc(title));
    h.style.color = color;
    bub.append(h, el('p', '', esc(sub)));
    b.append(bub);
    this.popups.append(b);
    setTimeout(() => b.remove(), 3100);
  }

  floorTitle(depth: number, name: string, sub: string) {
    const f = el('div', 'floor-title');
    f.append(el('div', 'depth', `DEPTH ${depth}`), el('div', 'name', esc(name)), el('div', 'sub', esc(sub)));
    this.popups.append(f);
    setTimeout(() => f.remove(), 2900);
  }

  toast(title: string, sub: string) {
    const t = el('div', 'toast', `<b>${esc(title)}</b><span>${esc(sub)}</span>`);
    this.toasts.append(t);
    setTimeout(() => t.remove(), 4600);
  }

  // ── Options ──────────────────────────────────────────
  showOptions(o0: Options, onChange: (o: Options) => void, onBack: Handler) {
    const o = el('div', 'overlay');
    const p = el('div', 'panel halftone');
    p.style.width = '440px';
    p.append(el('h1', 'title-text screen-title', 'Options'));
    const opts = { ...o0 };
    const toggle = (label: string, key: keyof Options) => {
      const row = el('label', 'toggle');
      row.append(el('span', '', label));
      const cb = el('input') as HTMLInputElement;
      cb.type = 'checkbox';
      cb.checked = !!opts[key];
      cb.addEventListener('change', () => {
        (opts as any)[key] = cb.checked;
        onChange({ ...opts });
      });
      row.append(cb);
      p.append(row);
    };
    toggle('Screen shake', 'screenShake');
    toggle('Reduced flashing', 'reducedFlash');
    toggle('Calm water (less motion)', 'calmWater');
    toggle('Diagonal shooting', 'diagonalShooting');
    
    const q = el('label', 'toggle');
    q.append(el('span', '', 'Quality'));
    const sel = el('select') as HTMLSelectElement;
    for (const v of ['auto', 'high', 'medium', 'low']) sel.append(new Option(v[0].toUpperCase() + v.slice(1), v));
    sel.value = opts.quality;
    sel.addEventListener('change', () => {
      opts.quality = sel.value as Options['quality'];
      onChange({ ...opts });
    });
    q.append(sel);
    p.append(q);
    const v = el('label', 'toggle');
    v.append(el('span', '', 'Volume'));
    const rng = el('input') as HTMLInputElement;
    rng.type = 'range';
    rng.min = '0';
    rng.max = '1';
    rng.step = '0.05';
    rng.value = String(opts.volume);
    rng.addEventListener('input', () => {
      opts.volume = Number(rng.value);
      onChange({ ...opts });
    });
    v.append(rng);
    p.append(v);
    p.append(btn('Back', 'orange back', onBack));
    o.append(p);
    this.show(o);
  }

  showSaveCode(code: string, onImport: (code: string) => boolean, onBack: Handler) {
    const o = el('div', 'overlay');
    const p = el('div', 'panel halftone');
    p.style.width = '520px';
    p.append(el('h1', 'title-text screen-title', 'Save code'));
    p.append(el('p', 'muted', 'Copy this code to back up your progress, or paste a code to restore it. Importing replaces your current progress.'));
    const ta = el('textarea') as HTMLTextAreaElement;
    ta.value = code;
    p.append(ta);
    const msg = el('p', 'muted');
    const row = el('div', 'row');
    row.append(
      btn('Copy', 'teal small', () => {
        navigator.clipboard?.writeText(ta.value);
        msg.textContent = 'Copied!';
      }),
      btn('Import', 'purple small', () => {
        msg.textContent = onImport(ta.value) ? 'Progress restored!' : 'That code could not be read.';
      }),
    );
    p.append(row, msg, btn('Back', 'orange back', onBack));
    o.append(p);
    this.show(o);
  }

  // ── Sea-pedia ────────────────────────────────────────
  showDex(p: Profile, onBack: Handler) {
    const o = el('div', 'overlay');
    const panel = el('div', 'panel halftone');
    panel.style.width = '820px';
    panel.style.height = '480px';
    panel.append(el('h1', 'title-text', 'Field journal'));
    const tabs = el('div', 'tabs');
    const body = el('div');
    const tabDefs: [string, () => void][] = [
      ['Items', () => {
        const grid = el('div', 'dex');
        for (const it of ITEMS) {
          const seen = p.seenItems.includes(it.id);
          const card = el('div', `card ${seen ? '' : 'unknown'}`);
          const img = el('img') as HTMLImageElement;
          void this.iconFor(it.id).then((u) => (img.src = u));
          const lockTxt = it.unlock && !p.achievements.includes(it.unlock) ? '<br/><i>Locked</i>' : '';
          card.append(img, el('div', '', seen ? `<b>${esc(it.name)}</b>${esc(it.tagline)}<br/><span class="muted">${esc(it.lore)}</span>` : `<b>???</b>Not found yet${lockTxt}`));
          grid.append(card);
        }
        body.replaceChildren(grid);
      }],
      ['Creatures', () => {
        const grid = el('div', 'dex');
        for (const [kind, info] of Object.entries(ENEMY_INFO)) {
          const seen = p.seenEnemies.includes(kind);
          const card = el('div', `card ${seen ? '' : 'unknown'}`);
          const img = el('img') as HTMLImageElement;
          void this.enemyIconFor(kind).then((u) => (img.src = u));
          card.append(img, el('div', '', seen ? `<b>${esc(info.name)}</b><span class="muted">${esc(info.lore)}</span>` : '<b>???</b>Not met yet'));
          grid.append(card);
        }
        for (const [kind, info] of Object.entries(BOSS_NAMES)) {
          const seen = p.seenBosses.includes(kind);
          const beaten = p.achievements.includes(`beat_${kind}`);
          const card = el('div', `card ${seen ? '' : 'unknown'} ${beaten ? 'done' : ''}`);
          card.append(el('div', '', seen ? `<b>${esc(info.name)}</b>${esc(info.tagline)}<br/><span class="muted">${beaten ? 'Defeated — color restored!' : 'Still drained of color...'}</span>` : '<b>??? (Boss)</b>Not met yet'));
          grid.append(card);
        }
        body.replaceChildren(grid);
      }],
      ['Synergies', () => {
        const grid = el('div', 'dex');
        for (const s of SYNERGIES) {
          const seen = (p.counters['syn_' + s.id] ?? 0) > 0;
          grid.append(el('div', `card ${seen ? '' : 'unknown'}`, seen ? `<div><b>${esc(s.name)}</b>${esc(ITEM_BY_ID[s.needs[0]].name)} + ${esc(ITEM_BY_ID[s.needs[1]].name)}<br/><span class="muted">${esc(s.desc)}</span></div>` : '<div><b>???</b>Undiscovered synergy</div>'));
        }
        for (const t of TRANSFORMATIONS) {
          const seen = (p.counters['tf_' + t.id] ?? 0) > 0;
          grid.append(el('div', `card ${seen ? '' : 'unknown'}`, seen ? `<div><b>${esc(t.name)}</b><span class="muted">${esc(t.desc)}</span></div>` : '<div><b>???</b>Undiscovered transformation</div>'));
        }
        body.replaceChildren(grid);
      }],
      ['Achievements', () => {
        const grid = el('div', 'dex');
        for (const a of ACHIEVEMENTS) {
          const got = p.achievements.includes(a.id);
          grid.append(el('div', `card ${got ? 'done' : ''}`, `<div><b>${got ? '★ ' : ''}${esc(a.name)}</b>${esc(a.desc)}<br/><span class="muted">Unlocks: ${got ? esc(a.reward) : '???'}</span></div>`));
        }
        body.replaceChildren(grid);
      }],
      ['Stats', () => {
        const s = p.stats;
        const deaths = Object.entries(s.deathsBy).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${esc(k)} ×${v}`).join('<br/>') || '—';
        const fav = Object.entries(s.itemsTaken).sort((a, b) => b[1] - a[1])[0];
        body.replaceChildren(el('div', 'stat-grid', `
          <b>RUNS</b><span>${s.runs}</span><b>WINS</b><span>${s.wins}</span><b>DEATHS</b><span>${s.deaths}</span>
          <b>DEEPEST</b><span>${s.bestDepth}</span>
          <b>BEST WIN TIME</b><span>${s.bestTimeSec ? `${Math.floor(s.bestTimeSec / 60)}:${String(Math.floor(s.bestTimeSec % 60)).padStart(2, '0')}` : '—'}</span>
          <b>FAVORITE ITEM</b><span>${fav ? esc(ITEM_BY_ID[fav[0]]?.name ?? fav[0]) : '—'}</span>
          <b>TOP CULPRITS</b><span>${deaths}</span>`));
      }],
    ];
    const tabEls: HTMLElement[] = [];
    tabDefs.forEach(([name, fn], i) => {
      const t = el('div', `tab ${i === 0 ? 'on' : ''}`, name);
      t.addEventListener('click', () => {
        tabEls.forEach((x) => x.classList.remove('on'));
        t.classList.add('on');
        fn();
      });
      tabEls.push(t);
      tabs.append(t);
    });
    tabDefs[0][1]();
    panel.append(tabs, body, btn('Back', 'orange small back', onBack));
    o.append(panel);
    this.show(o);
  }
}
