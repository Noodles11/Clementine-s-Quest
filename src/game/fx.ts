// Interface from simulation to presentation. The scene implements it;
// tests use NullFx. Everything here is cosmetic.

export type BurstKind =
  | 'pop'
  | 'hit'
  | 'kill'
  | 'sand'
  | 'bubbles'
  | 'ink'
  | 'steam'
  | 'shards'
  | 'sparkle'
  | 'blood'
  | 'explosion'
  | 'heal';

export interface Fx {
  burst(x: number, y: number, kind: BurstKind, color?: number, n?: number): void;
  text(x: number, y: number, str: string, color?: number, size?: number): void;
  shake(amount: number): void;
  flash(color: number, amount: number): void;
  hitstop(frames: number): void;
  lightning(x1: number, y1: number, x2: number, y2: number, color?: number): void;
  ring(x: number, y: number, r: number, color: number): void;
  light(x: number, y: number, r: number, color: number, intensity: number, life: number): void;
  banner(title: string, sub: string, color?: number): void;
  toast(title: string, sub: string): void;
}

export const NullFx: Fx = {
  burst() {},
  text() {},
  shake() {},
  flash() {},
  hitstop() {},
  lightning() {},
  ring() {},
  light() {},
  banner() {},
  toast() {},
};
