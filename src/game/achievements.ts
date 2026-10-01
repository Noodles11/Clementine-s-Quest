import { MAX_DEPTH_V1 } from '../config';
import type { Profile } from '../core/save';

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  reward: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'dive2', name: 'The Current Pulls Deeper', desc: 'Clear all three reefs of the Sunlit Shallows', reward: 'Bragging rights' },
  { id: 'dive3', name: 'Into the Wreck', desc: 'Clear all three reefs of the Kelp Jungle', reward: 'Bragging rights' },
  { id: 'dive4', name: 'Under the Big Top', desc: 'Clear all three reefs of the Sunken Galleon', reward: 'Bragging rights' },
  { id: 'dive5', name: 'Into the Dark', desc: 'Clear all three reefs of the Coral Carnival', reward: 'Bragging rights' },
  { id: 'dive6', name: 'Rock Bottom', desc: 'Clear all three reefs of the Twilight Trench', reward: 'Bragging rights' },
  { id: 'tank', name: 'Down the Drain', desc: 'Defeat the Hollow Maw twice', reward: 'The pipe opens: The Tank' },
  { id: 'beat_grouper', name: 'Too Big to Swallow', desc: 'Defeat Old Gus the Grouper', reward: 'Field journal entry' },
  { id: 'beat_otter', name: 'Rock Paper Otter', desc: 'Defeat Mama Otter', reward: 'Field journal entry' },
  { id: 'beat_sawfish', name: 'Blunted', desc: 'Defeat Captain Sawtooth', reward: 'Field journal entry' },
  { id: 'beat_mantis', name: 'Out-Punched', desc: 'Defeat Punchy the Mantis Shrimp', reward: 'Field journal entry' },
  { id: 'beat_giantsquid', name: 'Kraken Tamer', desc: 'Defeat the Giant Squid', reward: 'Field journal entry' },
  { id: 'beat_frillshark', name: 'Living Fossil', desc: 'Defeat the Frilled Shark', reward: 'Field journal entry' },
  { id: 'beat_seaspider', name: 'Leg Day', desc: 'Defeat the Sea Spider', reward: 'Field journal entry' },
  { id: 'beat_ringmaster', name: 'Show\'s Over', desc: 'Defeat Ringmaster Octo', reward: 'Hammerhead' },
  { id: 'beat_jesters', name: 'Last Laugh', desc: 'Defeat the Jester Jellies', reward: 'Fire Urchin Spine' },
  { id: 'beat_motherangler', name: 'Lure Breaker', desc: 'Defeat Mother Angler', reward: 'Giant Squid Eye' },
  { id: 'beat_siphonophore', name: 'Colony Collapse', desc: 'Defeat the Siphonophore', reward: 'Kraken Call' },
  { id: 'beat_hollowmaw', name: 'Song Restored', desc: 'Defeat the Hollow Maw', reward: 'Lamprey Mouth' },
  { id: 'beat_hand', name: 'Back to the Sea', desc: 'Defeat The Hand', reward: 'The Great Current sings again' },
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
  { id: 'win', name: 'Dive Complete', desc: 'Reach the bottom of your deepest dive', reward: 'Bragging rights' },
];

export const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

export function hasAch(p: Profile, id: string) {
  return p.achievements.includes(id);
}

/** Deepest depth a new run may reach: the whole reef down to the Abyss; The Tank once its pipe is open. */
export function maxDepthFor(p: Profile): number {
  return Math.min(hasAch(p, 'tank') ? 7 : 6, MAX_DEPTH_V1);
}

/** Grant; returns true if newly unlocked. */
export function grant(p: Profile, id: string): boolean {
  if (p.achievements.includes(id)) return false;
  p.achievements.push(id);
  return true;
}
