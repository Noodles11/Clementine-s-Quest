// Mobile twin-stick controls: floating move stick (left half), floating
// aim stick (right half), and action buttons. Feeds the shared input module.

import { input } from './input';

const RADIUS = 56; // CSS px the knob can travel
const DEAD = 0.2;

interface Stick {
  id: number | null;
  ox: number;
  oy: number;
  base: HTMLElement;
  knob: HTMLElement;
}

export function isTouchDevice() {
  return (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
}

export class TouchControls {
  root: HTMLElement;
  private move: Stick;
  private aim: Stick;
  private visible = false;
  enabled: boolean;

  constructor() {
    this.enabled = isTouchDevice();
    this.root = document.createElement('div');
    this.root.id = 'touch';
    this.root.innerHTML = `
      <div class="tzone left"></div><div class="tzone right"></div>
      <div class="tstick move"><div class="tknob"></div></div>
      <div class="tstick aim"><div class="tknob"></div></div>
      <div class="tbtns">
        <button class="tbtn" data-code="KeyQ" aria-label="Eat snack">🍬</button>
        <button class="tbtn" data-code="Space" aria-label="Use active item">★</button>
        <button class="tbtn bomb" data-code="KeyE" aria-label="Drop ink bomb">💣</button>
        <button class="tbtn" data-code="ShiftLeft" aria-label="Ink dash">💨</button>
      </div>
      <button class="tbtn pause" data-code="Escape" aria-label="Pause">❚❚</button>
      <button class="tbtn map" data-hold="Tab" aria-label="Map">▦</button>`;
    document.body.appendChild(this.root);
    const q = (s: string) => this.root.querySelector(s) as HTMLElement;
    this.move = { id: null, ox: 0, oy: 0, base: q('.tstick.move'), knob: q('.tstick.move .tknob') };
    this.aim = { id: null, ox: 0, oy: 0, base: q('.tstick.aim'), knob: q('.tstick.aim .tknob') };
    this.bindZone(q('.tzone.left'), this.move, (x, y) => input.setTouchMove(x, y), () => input.setTouchMove(0, 0));
    this.bindZone(q('.tzone.right'), this.aim, (x, y) => input.setTouchAim(Math.hypot(x, y) > DEAD ? [x, y] : null), () => input.setTouchAim(null));
    this.root.querySelectorAll<HTMLElement>('[data-code]').forEach((b) =>
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        input.press(b.dataset.code!);
        b.classList.add('on');
        setTimeout(() => b.classList.remove('on'), 120);
      }),
    );
    const mapBtn = q('.tbtn.map');
    mapBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      input.setHeld('Tab', true);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) mapBtn.addEventListener(ev, () => input.setHeld('Tab', false));
    // Any real touch turns the controls on (e.g. touch laptops).
    window.addEventListener('touchstart', () => (this.enabled = true), { passive: true, once: true });
    this.root.style.display = 'none';
  }

  private bindZone(zone: HTMLElement, s: Stick, onMove: (x: number, y: number) => void, onEnd: () => void) {
    const place = (el: HTMLElement, x: number, y: number) => {
      el.style.transform = `translate(${x}px, ${y}px)`;
    };
    zone.addEventListener('pointerdown', (e) => {
      if (s.id !== null) return;
      e.preventDefault();
      s.id = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      s.ox = e.clientX;
      s.oy = e.clientY;
      s.base.style.left = `${e.clientX}px`;
      s.base.style.top = `${e.clientY}px`;
      s.base.classList.add('active');
      place(s.knob, 0, 0);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== s.id) return;
      let dx = e.clientX - s.ox, dy = e.clientY - s.oy;
      const d = Math.hypot(dx, dy);
      if (d > RADIUS) {
        // Drag the base along so the stick never "runs out".
        const k = (d - RADIUS) / d;
        s.ox += dx * k;
        s.oy += dy * k;
        s.base.style.left = `${s.ox}px`;
        s.base.style.top = `${s.oy}px`;
        dx = e.clientX - s.ox;
        dy = e.clientY - s.oy;
      }
      place(s.knob, dx, dy);
      const m = Math.min(1, Math.hypot(dx, dy) / RADIUS);
      const a = Math.atan2(dy, dx);
      onMove(m < DEAD ? 0 : Math.cos(a) * m, m < DEAD ? 0 : Math.sin(a) * m);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== s.id) return;
      s.id = null;
      s.base.classList.remove('active');
      place(s.knob, 0, 0);
      onEnd();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  setVisible(v: boolean) {
    v = v && this.enabled;
    if (v === this.visible) return;
    this.visible = v;
    this.root.style.display = v ? 'block' : 'none';
    if (!v) {
      this.move.id = this.aim.id = null;
      this.move.base.classList.remove('active');
      this.aim.base.classList.remove('active');
      input.setTouchMove(0, 0);
      input.setTouchAim(null);
      input.setHeld('Tab', false);
    }
  }
}
