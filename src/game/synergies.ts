import { ITEM_BY_ID, type ItemTag } from './items';

export type SynergyId =
  | 'pinball'
  | 'lighthouse'
  | 'cellbloom'
  | 'inkfish'
  | 'steamvent'
  | 'tunarang'
  | 'necklace'
  | 'prism'
  | 'bigmadpuff'
  | 'wisp'
  | 'blacktide'
  | 'toxicbloom'
  | 'frenzy'
  | 'broadside';

export interface SynergyDef {
  id: SynergyId;
  name: string;
  needs: [string, string];
  desc: string;
  color: number;
}

export const SYNERGIES: SynergyDef[] = [
  { id: 'pinball', name: 'Pinball Storm', needs: ['eeltail', 'mirrorscale'], desc: 'Every wall bounce throws a lightning arc', color: 0x6ff0ff },
  { id: 'lighthouse', name: 'Lighthouse', needs: ['sunbeam', 'nautilus'], desc: 'Your beam sweeps in a rotating spiral', color: 0xfff27a },
  { id: 'cellbloom', name: 'Cell Bloom', needs: ['mitosis', 'starfish'], desc: 'Split ink keeps growing and splitting', color: 0xff8ae0 },
  { id: 'inkfish', name: 'Guided Inkfish', needs: ['inksac', 'lure'], desc: 'Homing ink bombs leave sticky puddles', color: 0x9a6bff },
  { id: 'steamvent', name: 'Steam Vent', needs: ['frostkelp', 'firecoral'], desc: 'Burning a frozen foe makes it explode in steam', color: 0xe8f4ff },
  { id: 'tunarang', name: 'Tuna Rang', needs: ['boomerang', 'swordfish'], desc: 'Piercing boomerangs grow on the way back', color: 0xff9a5c },
  { id: 'necklace', name: 'Pearl Necklace', needs: ['pearldiver', 'mitosis'], desc: 'Charged pearls burst into a ring of 8', color: 0xfff6e8 },
  { id: 'prism', name: 'Prism Pearl', needs: ['sunbeam', 'pearldiver'], desc: 'Charged pearls fire beams in 4 directions', color: 0xc8a0ff },
  { id: 'bigmadpuff', name: 'Big Mad Puff', needs: ['pout', 'starfish'], desc: 'Grown ink bursts into spikes', color: 0xffc23d },
  { id: 'wisp', name: "Will-o'-Wisp", needs: ['ghostjelly', 'lure'], desc: 'Spectral homing wisps hunt hard', color: 0xc8d8ff },
  { id: 'blacktide', name: 'Black Tide', needs: ['tidalwave', 'inksac'], desc: 'The wave drags ink bombs along and sets them off', color: 0x3a2a6a },
  { id: 'toxicbloom', name: 'Toxic Bloom', needs: ['seanettle', 'mitosis'], desc: 'Split ink carries a double dose of poison', color: 0x9dff5c },
  { id: 'frenzy', name: 'Feeding Frenzy', needs: ['sharktooth', 'lamprey'], desc: 'Every kill sends you into a fast-firing frenzy', color: 0xff3d5a },
  { id: 'broadside', name: 'Broadside', needs: ['cannonball', 'rearfin'], desc: 'Shots out of the back explode', color: 0xd9583b },
];

export function activeSynergies(items: readonly string[]): Set<SynergyId> {
  const have = new Set(items);
  const out = new Set<SynergyId>();
  for (const s of SYNERGIES) if (have.has(s.needs[0]) && have.has(s.needs[1])) out.add(s.id);
  return out;
}

export type TransformationId = 'kraken' | 'neonrave' | 'shark' | 'pirate' | 'coralreef';

export interface TransformationDef {
  id: TransformationId;
  name: string;
  tag: ItemTag;
  desc: string;
  color: number;
}

export const TRANSFORMATIONS: TransformationDef[] = [
  { id: 'kraken', name: 'KRAKEN FORM', tag: 'tentacle', desc: '8-way shooting, +1 damage, ink trail slows foes', color: 0x9a6bff },
  { id: 'neonrave', name: 'NEON RAVE', tag: 'glow', desc: 'Rainbow ink, +damage, the reef pulses', color: 0xff5cf0 },
  { id: 'shark', name: 'SHARK MODE', tag: 'predator', desc: 'Faster and fiercer; every kill heals a little', color: 0x7a8aa0 },
  { id: 'pirate', name: 'PIRATE', tag: 'galleon', desc: '+1 damage, +2 luck, foes drop more coins', color: 0xffd23d },
  { id: 'coralreef', name: 'CORAL REEF', tag: 'coral', desc: 'The reef mends you: slowly regain health', color: 0xff8a6a },
];

export function activeTransformations(items: readonly string[]): Set<TransformationId> {
  const counts: Record<string, number> = {};
  for (const id of new Set(items)) {
    const def = ITEM_BY_ID[id];
    if (!def?.tags) continue;
    for (const t of def.tags) counts[t] = (counts[t] ?? 0) + 1;
  }
  const out = new Set<TransformationId>();
  for (const t of TRANSFORMATIONS) if ((counts[t.tag] ?? 0) >= 3) out.add(t.id);
  return out;
}
