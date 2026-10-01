import { MAX_DEPTH_V1 } from '../config';
import type { Profile } from '../core/save';

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  reward: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'dive2', name: 'The Current Pulls Deeper', desc: 'Defeat a Sunlit Shallows boss', reward: 'Dive 2: Kelp Jungle' },
  { id: 'dive3', name: 'Into the Wreck', desc: 'Defeat a Kelp Jungle boss', reward: 'Dive 3: Sunken Galleon' },
  { id: 'beat_barnacle', name: 'Unstuck', desc: 'Defeat Big Barnacle Bill', reward: 'Electric Eel Tail' },
  { id: 'beat_queenclam', name: 'Pearl Snatcher', desc: 'Defeat Queen Clam', reward: 'Pearl Diver' },
  { id: 'beat_kelpie', name: 'Untangled', desc: 'Defeat Kelpie the Tangler', reward: 'Sunbeam' },
  { id: 'beat_sirurchin', name: 'Knighted', desc: 'Defeat Sir Urchin', reward: 'Starfish Arm' },
  { id: 'beat_admiral', name: 'Mutiny!', desc: 'Defeat the Rusty Admiral', reward: 'Ink Sac' },
  { id: 'beat_treasuremimic', name: 'Fool\'s Gold', desc: 'Defeat the Treasure Mimic', reward: 'Siren Song' },
  { id: 'admiral_key', name: "The Admiral's Chart", desc: 'Defeat the Rusty Admiral 3 times', reward: 'A chart to somewhere deeper...' },
  { id: 'first_synergy', name: 'Better Together', desc: 'Discover your first synergy', reward: 'Mitosis' },
  { id: 'transformation', name: 'Metamorphosis', desc: 'Transform for the first time', reward: 'Double Helix' },
  { id: 'die_5', name: 'Lights Out', desc: 'Lose 5 runs', reward: 'Glow Burst' },
  { id: 'flawless_floor', name: 'Untouchable', desc: 'Clear a whole depth without taking damage', reward: 'Lucky Sea Glass' },
  { id: 'win', name: 'Back to the Surface', desc: 'Win a run', reward: 'Bragging rights' },
];

export const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

export function hasAch(p: Profile, id: string) {
  return p.achievements.includes(id);
}

/** Deepest depth a new run may reach, given unlocked dives. */
export function maxDepthFor(p: Profile): number {
  let d = 1;
  if (hasAch(p, 'dive2')) d = 2;
  if (hasAch(p, 'dive3')) d = 3;
  return Math.min(d, MAX_DEPTH_V1);
}

/** Grant; returns true if newly unlocked. */
export function grant(p: Profile, id: string): boolean {
  if (p.achievements.includes(id)) return false;
  p.achievements.push(id);
  return true;
}
