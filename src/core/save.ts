// Persistent profile (meta progression) and suspended-run storage.

export const PROFILE_KEY = 'clementine.profile';
export const RUN_KEY = 'clementine.run';
export const PROFILE_VERSION = 2;

export interface Options {
  screenShake: boolean;
  reducedFlash: boolean;
  calmWater: boolean;
  diagonalShooting: boolean;
  quality: 'auto' | 'low' | 'medium' | 'high';
  volume: number;
  tankFrame: boolean;
}

export interface Profile {
  version: number;
  achievements: string[];
  counters: Record<string, number>;
  seenItems: string[];
  seenEnemies: string[];
  seenBosses: string[];
  stats: {
    runs: number;
    wins: number;
    deaths: number;
    bestDepth: number;
    deathsBy: Record<string, number>;
    itemsTaken: Record<string, number>;
    bestTimeSec: number;
  };
  options: Options;
}

export const DEFAULT_OPTIONS: Options = {
  screenShake: true,
  reducedFlash: false,
  calmWater: false,
  diagonalShooting: false,
  quality: 'auto',
  volume: 0.7,
  tankFrame: true,
};

export function newProfile(): Profile {
  return {
    version: PROFILE_VERSION,
    achievements: [],
    counters: {},
    seenItems: [],
    seenEnemies: [],
    seenBosses: [],
    stats: { runs: 0, wins: 0, deaths: 0, bestDepth: 0, deathsBy: {}, itemsTaken: {}, bestTimeSec: 0 },
    options: { ...DEFAULT_OPTIONS },
  };
}

/** Upgrade any older profile shape to the current version. */
export function migrateProfile(raw: any): Profile {
  const base = newProfile();
  if (!raw || typeof raw !== 'object') return base;
  const p: Profile = {
    ...base,
    ...raw,
    stats: { ...base.stats, ...(raw.stats ?? {}) },
    options: { ...base.options, ...(raw.options ?? {}) },
    counters: { ...(raw.counters ?? {}) },
  };
  // v1 stored unlocks under "unlocks"; merge them into achievements.
  if (Array.isArray(raw.unlocks)) p.achievements = [...new Set([...(p.achievements ?? []), ...raw.unlocks])];
  for (const k of ['achievements', 'seenItems', 'seenEnemies', 'seenBosses'] as const) {
    if (!Array.isArray(p[k])) p[k] = [];
  }
  delete (p as any).unlocks;
  p.version = PROFILE_VERSION;
  return p;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadProfile(): Profile {
  try {
    const s = storage()?.getItem(PROFILE_KEY);
    return migrateProfile(s ? JSON.parse(s) : null);
  } catch {
    return newProfile();
  }
}

export function saveProfile(p: Profile) {
  try {
    storage()?.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* storage full or blocked */
  }
}

export function loadRun<T>(): T | null {
  try {
    const s = storage()?.getItem(RUN_KEY);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}
export function saveRun(run: unknown) {
  try {
    storage()?.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    /* ignore */
  }
}
export function clearRun() {
  try {
    storage()?.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}

// ── Export / import codes ────────────────────────────────────────

const EXPORT_PREFIX = 'CQ1:';

function toBase64(str: string) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function fromBase64(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function exportProfile(p: Profile): string {
  return EXPORT_PREFIX + toBase64(JSON.stringify(p));
}

export function importProfile(code: string): Profile | null {
  const trimmed = code.trim();
  if (!trimmed.startsWith(EXPORT_PREFIX)) return null;
  try {
    return migrateProfile(JSON.parse(fromBase64(trimmed.slice(EXPORT_PREFIX.length))));
  } catch {
    return null;
  }
}
