// Keyboard input. Movement: WASD. Shooting: arrow keys.

const down = new Set<string>();
const pressed = new Set<string>();
const released = new Set<string>();
/** Order in which shoot keys were pressed; latest wins (Isaac behavior). */
const shootOrder: string[] = [];

const SHOOT_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const PREVENT = new Set([...SHOOT_KEYS, 'Space', 'Tab']);

let enabled = true;

export function initInput() {
  window.addEventListener('keydown', (e) => {
    if (!enabled) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (PREVENT.has(e.code)) e.preventDefault();
    if (!down.has(e.code)) {
      pressed.add(e.code);
      if (SHOOT_KEYS.includes(e.code)) {
        const i = shootOrder.indexOf(e.code);
        if (i >= 0) shootOrder.splice(i, 1);
        shootOrder.push(e.code);
      }
    }
    down.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    down.delete(e.code);
    released.add(e.code);
    const i = shootOrder.indexOf(e.code);
    if (i >= 0) shootOrder.splice(i, 1);
  });
  window.addEventListener('blur', () => {
    down.clear();
    shootOrder.length = 0;
  });
}

export const input = {
  isDown: (code: string) => down.has(code),
  wasPressed: (code: string) => pressed.has(code),
  wasReleased: (code: string) => released.has(code),
  /** Call once per simulation step, after game logic consumed the events. */
  endFrame() {
    pressed.clear();
    released.clear();
  },
  moveAxis(): [number, number] {
    let x = 0, y = 0;
    if (down.has('KeyA')) x -= 1;
    if (down.has('KeyD')) x += 1;
    if (down.has('KeyW')) y -= 1;
    if (down.has('KeyS')) y += 1;
    return [x, y];
  },
  /** Shoot direction; diagonal only when allowed. */
  shootAxis(allowDiagonal: boolean): [number, number] {
    if (shootOrder.length === 0) return [0, 0];
    const dir = (k: string): [number, number] =>
      k === 'ArrowUp' ? [0, -1] : k === 'ArrowDown' ? [0, 1] : k === 'ArrowLeft' ? [-1, 0] : [1, 0];
    const last = dir(shootOrder[shootOrder.length - 1]);
    if (!allowDiagonal || shootOrder.length < 2) return last;
    const prev = dir(shootOrder[shootOrder.length - 2]);
    if (prev[0] !== 0 && last[0] === 0) return [prev[0], last[1]];
    if (prev[1] !== 0 && last[1] === 0) return [last[0], prev[1]];
    return last;
  },
  anyShootDown: () => shootOrder.length > 0,
  setEnabled(v: boolean) {
    enabled = v;
    if (!v) {
      down.clear();
      shootOrder.length = 0;
    }
  },
  clear() {
    down.clear();
    pressed.clear();
    released.clear();
    shootOrder.length = 0;
  },
};
