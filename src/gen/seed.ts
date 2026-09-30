import { hashString } from '../core/rng';

// Isaac-style 8 character seeds, e.g. "KELP 7Q2Z". Ambiguous glyphs removed.
export const SEED_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomSeedCode(): string {
  let s = '';
  const buf = new Uint32Array(8);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 8; i++) s += SEED_ALPHABET[buf[i] % SEED_ALPHABET.length];
  return s;
}

/** Normalize user input: uppercase, strip spaces, map lookalikes. */
export function normalizeSeedCode(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, '');
  if (cleaned.length !== 8) return null;
  for (const ch of cleaned) if (!SEED_ALPHABET.includes(ch)) return null;
  return cleaned;
}

export function formatSeed(code: string): string {
  return `${code.slice(0, 4)} ${code.slice(4)}`;
}

export function seedToNumber(code: string): number {
  return hashString('clementine:' + code);
}

/** Easter-egg seeds. */
export const SPECIAL_SEEDS: Record<string, string> = {
  HUGEJELL: 'Clementine is HUGE',
  TEENYJEL: 'Clementine is teeny',
  DARKDEEP: 'The lights are out',
  PARTYFSH: 'Everyone is dancing',
};
