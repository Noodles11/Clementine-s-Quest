// Shared tile constants and level content types.

import type { EnemyKind } from './biomes';

export const T_EMPTY = 0;
export const T_ROCK = 1;
export const T_BREAK = 2;
export const T_SPIKE = 3;
export const T_SECRET = 4;

export const isSolidTile = (t: number) => t === T_ROCK || t === T_BREAK || t === T_SECRET;

export type Attach = 'floor' | 'ceil' | 'left' | 'right' | 'none';

export interface Spawn {
  kind: EnemyKind;
  x: number;
  y: number;
  attach: Attach;
}

export type DecorKind =
  | 'kelp'
  | 'grass'
  | 'coral'
  | 'fan'
  | 'shell'
  | 'anemone'
  | 'rockling'
  | 'boulder'
  | 'sponge'
  | 'starfish'
  | 'pot'
  | 'chain'
  | 'barrel';

export interface Decor {
  kind: DecorKind;
  x: number;
  y: number;
  size: number;
  color: number;
  seed: number;
  /** Where it is anchored. */
  attach: Attach;
  /** Drawn in front of Clementine and the creatures (visual cover only). */
  front?: boolean;
}
