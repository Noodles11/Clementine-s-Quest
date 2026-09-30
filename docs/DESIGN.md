# Clementine's Quest — Game Design Document (v0.1, draft for approval)

> A twin-stick roguelite dungeon crawler in the spirit of *The Binding of Isaac*,
> set in a funky, comic-book underwater realm. You play **Clementine**, a small
> orange jellyfish on a quest to the bottom of the ocean.

Status: **v0.2 — questions answered, awaiting final approval. No code yet.**
Decisions are recorded in §0. Sections marked *(post-v1)* are future content.

---

## 0. Decisions (from Q&A)

| Topic | Decision |
|---|---|
| v1 scope | **Vertical slice**: Depths 1–3, ~30 items, 6 bosses, ~12 enemies, ~12 synergies, 2 transformations. All core systems complete. |
| Run length | **Progressive, Isaac-style.** First runs end after Depth 1. Each first boss kill / goal unlocks the next depth (§5.1). |
| Resolution | **Smooth HD 960×540** logical, scaled to window. |
| Audio | **Synth SFX only** (WebAudio). Music post-v1. |
| Meta | **Pure unlocks** (achievements). No Pearls / hub currency. |
| Characters | **Clementine only** in v1. Roster post-v1. |
| Seeded runs | Custom seeds **do not** grant unlocks (Isaac rule). |
| Saves | **1 profile** + copyable export/import code. |
| Input | **Keyboard only.** |
| Deploy | **GitHub Pages** via GitHub Actions. |

---

## 1. Pitch & Lore

The **Great Current** — the warm song that keeps the reef alive — has gone
silent. Something at the bottom of the Abyss is swallowing it. The grown-up sea
creatures are too scared to dive. Clementine, a tiny tangerine-colored jellyfish
who "glows a little too much," drifts down to find out why.

- **Tone:** upbeat, cheeky, Saturday-morning cartoon. Danger is silly-scary, not grim.
  (Deliberate contrast to Isaac's dark tone.)
- **The villain:** **The Hollow Maw**, an ancient anglerfish-thing that eats sound
  and color. Every boss is a creature it has "drained" (washed-out palette), and
  defeating them restores their color — a visual reward.
- **Clementine's power:** she fires **Glow Bubbles** — little pulses of bioluminescence.
  Items are "gifts of the sea" that change her glow, body, and tentacles.
- **Meta-lore:** the **Tide Pool Hub** between runs fills with rescued friends
  (unlocks), each adding NPCs, decorations, and dialogue.

## 2. Core Loop

```
Title / Tide Pool ──> new run (random or seed) ──> Run: unlocked depths only
      ^                                               │
      │      achievements → unlocks (meta)            │ die or win
      └───────────────────────────────────────────┘
```

**Run:** clear rooms → collect pickups & items → find boss room → beat boss →
descend. Death is permanent for the run; meta progress persists.

## 3. Controls

| Action | Keyboard | Gamepad (stretch) |
|---|---|---|
| Move | **W A S D** | — |
| Shoot (4-dir, like Isaac) | **Arrow keys** | — |
| Use active item | **Space** | — |
| Drop Ink Bomb | **E** | — |
| Use consumable (Shell card/pill) | **Q** | — |
| Map (hold) | **Tab** | — |
| Pause | **Esc / P** | — |
| Restart run (hold) | **R** | — |

Gamepad column intentionally empty: keyboard only in v1.

Shots inherit a portion of movement velocity (Isaac-style). Diagonal shooting via
two arrows is **off by default** (faithful to Isaac) — toggle in options.

## 4. Player: Clementine

Isaac-style stat block (all modified by items):

| Stat | Base | Notes |
|---|---|---|
| Health | 3 hearts (6 half-hearts) | Heart types below |
| Damage | 3.5 | |
| Fire rate | 2.7 shots/s | "Tears" → **Bubbles** |
| Shot speed | 1.0 | |
| Range | 6.5 tiles | Bubbles pop at end of range |
| Speed | 1.0 | Floaty acceleration — she's a jellyfish |
| Luck | 0 | Proc chances |

**Movement feel:** slight inertia and a "pulse" squash-and-stretch animation on
every direction change (jellyfish propulsion). Not slippery — responsive first.

### Health types
- **Coral Hearts** (red) — normal, refillable containers.
- **Foam Hearts** (blue/white) — temporary shield hearts, lost when depleted.
- **Abyss Hearts** (black/purple) — temporary; on loss, deal damage to all enemies in room.
- **Golden Scale** — overlays a heart; drops coins on hit.

### Unlockable characters *(post-v1)*
1. **Clementine** — balanced.
2. **Barnaby the Hermit Crab** — low speed, high HP, starts with a shell-shield active.
3. **Pip the Seahorse** — fast, fragile, shots curve.
4. **Nori the Octopus** — shoots ink that slows, 8-way shooting.
5. **The Glowless** (hard mode Clementine) — 1 heart, all hearts are Foam.

## 5. World Structure

6 **Depths** (floors), each with a biome, palette, enemy pool, and boss pool.
Each depth is **one** generated floor. v1 ships Depths 1–3; 4–6 are post-v1.

| # | Depth | Palette / vibe | Hazards |
|---|---|---|---|
| 1 | **Sunlit Shallows** | Turquoise, sand, pink coral | Sea urchins (spike tiles) |
| 2 | **Kelp Jungle** | Greens, yellow light shafts | Tangling kelp (slow tiles) |
| 3 | **Sunken Galleon** | Browns, gold, rust | Cannonball turrets, loose barrels |
| 4 | **Coral Carnival** | Hot pink, purple, neon | Bounce anemones |
| 5 | **Twilight Trench** | Deep blue, glowing dots | Darkness (limited light radius around Clementine) |
| 6 | **The Abyss** | Black + neon outlines | Currents that push you |

Beating Depth 6 boss (**The Hollow Maw**) = true ending. Post-win unlock:
**Alt path / "Volcanic Vents"** loop for harder runs (post-v1).

### 5.1 Progressive depth unlocks ("The Dive Gets Deeper")

Like Isaac's Mom → Womb → Cathedral progression, the run's end point moves
deeper as the player proves themselves:

| Unlock | Requirement | Effect on runs |
|---|---|---|
| Start | — | Run = Depth 1 only. Boss kill → "Clementine surfaces" ending, run won. |
| **Dive 2** | Beat any Depth 1 boss once | Boss room now shows a **Whirlpool** down to Kelp Jungle. Run ends at Depth 2 boss. |
| **Dive 3** | Beat any Depth 2 boss once | Whirlpool to Sunken Galleon. Run ends at Depth 3 boss. |
| **The Admiral's Key** | Beat Rusty Admiral 3× | Adds a Key item; post-v1 it opens Depth 4. |
| *Dive 4–6 (post-v1)* | Boss kills + item gates | e.g. carry **The Lantern Pearl** into Depth 5 to light the Trench. |

After each new unlock: a short comic-panel cutscene (3–4 panels, procedurally
composed from existing sprites + captions) — "The current pulls deeper…".

Each ending also unlocks content (items into pools), so early short runs
already feed meta progress. The **surface choice**: when the next depth is
unlocked, beating a boss shows both the Whirlpool (continue) and a **Surface
Bubble** (end run as a win now) — like Isaac's chest vs. trapdoor.

## 6. Procedural Generation

Everything derived from a single **run seed** (see §10).

### 6.1 Floor layout (Isaac-style grid)
- Floor = 13×13 grid of room slots. Start room in center.
- Room count: `min(20, round(3.33 * depth + rand(5,6)))`.
- Breadth-first expansion from start: a neighbor cell is added only if it has
  ≤1 filled neighbor (keeps a branching, maze-like shape), with random rejection.
- **Dead ends** (1 neighbor) are assigned special rooms, farthest first:
  **Boss** (farthest), **Treasure**, **Shop**, then optional **Secret**, **Curse**,
  **Challenge**, **Sacrifice**, **Library (Shipwreck Archive)**.
- **Secret room:** placed in an empty cell with the most (≥3) room neighbors;
  opened by bombing a wall.
- **Big rooms** (2×1, 1×2, 2×2, L-shapes) from depth 2+.
- Regenerate if constraints fail (not enough dead ends) — deterministic retry with sub-seed.

### 6.2 Room interiors
- Room size: 13×7 tiles (Isaac standard), 15×9 for big rooms scaled.
- Interiors come from a **library of hand-authored templates** (JSON tile patterns:
  rocks/coral, pits/trenches, spikes, enemy spawn slots) **plus** procedural
  mutation: mirroring, rotation where symmetric, rock → biome variant swap,
  random decoration scatter.
- A small **template-grammar generator** also produces fully procedural rooms
  (symmetric noise with a guaranteed flood-fill path between all doors) so the
  pool never feels exhausted.
- Enemy slots are filled from the depth's weighted **enemy pool** with a
  difficulty budget per room.

### 6.3 Everything else procedural
- Item pools per room type, shop inventory/prices, chest contents, pickup drops
  on room clear (Isaac-like reward table with luck bonus), boss choice, curses.
- **Art is procedural too:** all sprites drawn at runtime with Canvas vector
  shapes (see §11) — no bitmap assets needed.
- **SFX** generated with WebAudio synth. Music post-v1.

## 7. Rooms & Special Rooms

| Room | Icon | Content |
|---|---|---|
| Normal | — | Enemies, reward on clear |
| Treasure | 🏆 | 1 item from Treasure pool (Shells-key locked from depth 2) |
| Shop | 💰 | 2–5 items/pickups, paid with **Sand Dollars** |
| Boss | 💀 | Boss → item + Heart Container + trapdoor ("Whirlpool") down |
| Secret | ❓ | Bombable; rare items / big pickups |
| Curse (Urchin Den) | ☠ | Enter costs damage; Abyss item pool |
| Sacrifice (Anemone Altar) | ⚱ | Step on spikes for escalating rewards |
| Challenge (Arena) | ⚔ | Waves of enemies for an item |
| Shipwreck Archive | 📜 | Scrolls (consumables) |
| **Mermaid's Grotto** (Devil/Angel equivalent) | 🧜 | After boss, chance-based: trade heart containers for powerful items (**Siren deal**) or free holy item (**Whale Song**) |

## 8. Pickups & Economy

| Isaac | Clementine's Quest | Use |
|---|---|---|
| Coins | **Sand Dollars** (1/5/10) | Shops, beggars |
| Keys | **Shell Keys** | Treasure rooms, locked chests |
| Bombs | **Ink Bombs** | Break rocks, secret walls, damage |
| Pills | **Sea Snacks** (unidentified until eaten) | Random effect, randomized per seed |
| Cards/Runes | **Tarot Shells** | One-use effects |
| Batteries | **Glow Jellies** | Recharge active item |
| Chests | **Clams** (normal/golden/cursed) | Loot |
| Trinkets | **Trinkets** (sea glass, bottle caps…) | Passive, one slot |

Per-seed randomized **Sea Snack** identities (e.g. "Purple Krill" = +speed this
run) — a nice seed-memory mechanic.

## 9. Items

### 9.1 Item system architecture (important for synergies)
Items are **data + modifiers**, not bespoke code:
- **Stat modifiers** (flat/multiplier, applied in fixed order).
- **Bubble (projectile) modifiers** — composable flags & behaviors:
  `homing, piercing, spectral, splitting, bouncing, orbiting, boomerang, chain,
  explosive, poisoning, freezing, charm, burn, growing, wave-motion, trail,
  multishot(n), charge-shot, laser, bomb-shot`.
- **Triggers** — `onHit, onKill, onRoomClear, onDamaged, onShoot, onPickup, onFloorStart`.
- **Familiars** — orbiters & followers with their own simple AI.
- **Transform tags** — collecting 3 items with the same tag grants a
  **Transformation** (Isaac-style, e.g. "Guppy").

Because shot behaviors compose, most synergies emerge naturally. A small
**explicit synergy table** adds bespoke visuals/bonuses on top (§9.4).

### 9.2 Item pools
Treasure · Shop · Boss · Secret · Mermaid (Siren) · Whale Song (Angel) · Curse ·
Golden Clam · Beggar. Each item has `quality 0–4`, weight, pool list, unlock condition.

### 9.3 Item list (full target ~60, then 100+)

**v1 vertical slice ships ~30:** marked ★ below; rest post-v1.

**Passive — stats**
| Item | Effect | Lore flavor |
|---|---|---|
| ★ Coral Crown | +1 heart, +0.3 dmg | A reef princess's lost tiara |
| ★ Squid Ink Espresso | +0.3 speed, +fire rate | "The Galleon's cook swore by it" |
| ★ Whale Lung | +1 range, bubbles are bigger | Deep breath! |
| ★ Pufferfish Pout | ×1.5 damage, −shot speed | Angry and proud of it |
| ★ Lucky Sea Glass | +2 luck | Found only on moonlit tides |
| Plankton Swarm | +0.5 fire rate ×3 small bubbles | Tiny friends |
| ★ Barnacle Armor | +2 Foam hearts, −0.1 speed | Clingy but protective |

**Passive — bubble modifiers**
| Item | Effect |
|---|---|
| ★ Electric Eel Tail | Bubbles **chain lightning** to 2 nearby enemies |
| ★ Nautilus Spiral | Bubbles **spiral outward** |
| ★ Mirror Scale | Bubbles **bounce** off walls |
| ★ Anglerfish Lure | Bubbles **home** onto enemies |
| ★ Swordfish Bill | Bubbles **pierce** enemies |
| ★ Ghost Jelly | Bubbles are **spectral** (pass rocks) |
| ★ Mitosis | Bubbles **split in 2** on hit |
| ★ Frost Kelp | Chance to **freeze**; frozen enemies shatter into shards |
| ★ Fire Coral | Bubbles **burn** |
| Sea Nettle Sting | **Poison** damage over time |
| ★ Boomerang Shrimp | Bubbles **return** to Clementine |
| ★ Pearl Diver | **Charge shot** — hold to fire a large pearl |
| ★ Sunbeam | Replaces bubbles with a **laser beam** (charge) |
| Double Helix | **Wave motion** + 2 shots |
| ★ Triple Tentacle | **Triple shot** (−damage) |
| ★ Starfish Arm | Bubbles **grow** with distance |
| ★ Ink Sac | Bubbles become **ink bombs** (explosive) |
| Siren Song | Chance to **charm** enemies |

**Familiars**
| Item | Effect |
|---|---|
| ★ Baby Clementine | Mini jelly that copies your shots at 35% damage |
| Remora Buddy | Follows, picks up coins |
| ★ Orbiting Krill | 3 krill orbit, block shots, contact damage |
| Hermit Guard | Blocks projectiles behind you |
| ★ Clownfish Pal | Shoots when you shoot, gains damage per room cleared |

**Active items (Space; charge by room clears)**
| Item | Charge | Effect |
|---|---|---|
| ★ Conch Horn | 3 | Stun + knock back all enemies |
| ★ Bubble Shield | 2 | Invulnerable bubble for 3s |
| Tidal Wave | 4 | Pushes & damages everything in a direction |
| ★ Treasure Map | 6 | Reveal floor + secret rooms |
| ★ Mimic Clam | 6 | Reroll room pedestals (Isaac's D6) |
| ★ Glow Burst | 1 | Your next 5s bubbles triple; screen flash |
| Sea Dice | 3 | Re-roll pickups in room |
| Kraken Summon | 6 | Tentacles slam random enemies |

**Trinkets (v1: Bottle Cap, Rusty Hook, Message in a Bottle):** Bottle Cap (+coin drops), Rusty Hook (hit enemies bleed),
Message in a Bottle (reveal a special room each floor), Sailor's Tooth (+range), …

### 9.4 Synergies (explicit, with special visuals)

Emergent combos + named synergies with unique effects:

| Combo | Name | Result |
|---|---|---|
| Electric Eel Tail + Mirror Scale | **Pinball Storm** | Each wall bounce emits a lightning arc |
| Sunbeam + Nautilus Spiral | **Lighthouse** | Laser sweeps in a rotating spiral |
| Mitosis + Starfish Arm | **Cell Bloom** | Split bubbles also grow — screen fills with glowing orbs |
| Ink Sac + Anglerfish Lure | **Guided Inkfish** | Homing bombs; explosions leave slowing ink puddles |
| Frost Kelp + Fire Coral | **Steam Vent** | Frozen enemies hit with fire explode into steam clouds (AoE, blinds) |
| Boomerang Shrimp + Swordfish Bill | **Tuna Rang** | Piercing boomerang that hits twice & grows on return |
| Pearl Diver + Mitosis | **Pearl Necklace** | Charged pearl bursts into a ring of 8 pearls |
| Siren Song + Baby Clementine | **Choir** *(post-v1)* | Charmed enemies become temporary familiars |
| Sunbeam + Pearl Diver | **Prism Pearl** | Charged pearl fires lasers in 4 directions when it pops |
| Tidal Wave + Ink Sac | **Black Tide** *(post-v1)* | Wave drags ink bombs along and detonates them |
| Orbiting Krill + Electric Eel Tail | **Krill Coil** | Krill are electrified, zap enemies nearby |
| Pufferfish Pout + Starfish Arm | **Big Mad Puff** | Bubbles inflate with spikes & shotgun burst on pop |
| Ghost Jelly + Anglerfish Lure | **Will-o'-Wisp** | Spectral homing wisps; phase through everything |
| Clownfish Pal + Coral Crown | **Royal Guard** | Clownfish gets a crown, doubles damage |

**Transformations (3 items with same tag; v1 ships Kraken Form + Neon Rave):**
- **Kraken Form** (tag: tentacle) — 8-way shooting, ink trail.
- **Neon Rave** (tag: glow) — bubbles cycle colors, +damage, screen pulses to music.
- **Shark Mode** (tag: predator) — contact damage, speed up, heal on kill (tiny).
- **Coral Reef** (tag: coral) — every room cleared grows a coral turret.
- **Pirate** (tag: galleon) — coins deal damage, cannonball active charge.

## 10. Seeded Runs

- **Seed format:** 8 characters, Isaac-style e.g. `KELP 7Q2Z` (A–Z, 0–9, no
  ambiguous chars). Shown on pause screen; copyable.
- **PRNG:** `sfc32` / `mulberry32` — fast, deterministic, pure JS.
- **Stream separation:** master seed → independent sub-streams:
  `layout[depth]`, `rooms[depth][room]`, `items`, `pickups`, `enemyAI`, `cosmetic`.
  Player actions (e.g. killing enemies in a different order) must not change
  what the next treasure room contains → item pool draws are seeded per room.
- Same seed + same choices ⇒ identical run layout & items.
- **Custom-seeded runs don't grant unlocks/achievements** (Isaac rule). The run
  still uses the player's currently-unlocked depths and item pools, so a seed
  reproduces identically for players with the same unlock state.
- **Daily Dive** *(post-v1)*: date-derived seed, one attempt per day, local best.
- **Special seeds** (easter eggs): e.g. `BIGG JELL` = Clementine is huge.

## 11. Visual Style — "Funky Comic Reef"

- **Rendering:** HTML5 Canvas 2D, fixed logical resolution (e.g. 480×270 or
  960×540) scaled to window with letterboxing.
- **Look:** thick black ink outlines (3px), flat bold fills, halftone dot
  shading, 1 highlight per shape, saturated tropical palette.
  All characters are **procedurally drawn vector shapes** (bezier bodies,
  animated tentacles via verlet/sine), so no art pipeline is needed and items
  can visually alter Clementine (e.g. Coral Crown literally appears on her head,
  like Isaac costumes).
- **Comic FX:** onomatopoeia pop-ups ("BLUB!", "ZAP!", "SPLOOSH!", "POP!") on hits/kills,
  speed-line bursts, screen shake, hit-stop (2–3 frames) on heavy hits,
  panel-style room transitions (wipe with a comic panel border).
- **Boss intros:** comic-cover splash screen ("ISSUE #3: THE RUSTY ADMIRAL!").
- **Ambient:** parallax caustic light, floating particles, rising bubbles, sways.
- **UI:** chunky rounded font (Google Font e.g. *Bangers* for titles, *Fredoka*
  for UI), speech-bubble tooltips for item pickups ("PUFFERFISH POUT — Big mad energy").
- Accessibility: color-blind-safe projectile outlines, screen-shake toggle,
  reduced-flash toggle.

## 12. Enemies & Bosses

### 12.1 Enemy archetypes (~25 at launch)
| Enemy | Behavior |
|---|---|
| Blubber Blob | Slow chase |
| Sea Urchin | Stationary, shoots 8-way |
| Crabby | Side-steps, charges when aligned |
| Pufferling | Inflates when close, bursts into spikes |
| Moray Pop-up | Hides in holes, lunges |
| Barracuda | Dashes in straight lines |
| Jelly Swarm | Tiny, erratic, in groups |
| Lanternfish | Shoots homing light orbs (darkness levels) |
| Cannon Crab | Galleon: lobbed cannonballs |
| Clown Anemone | Carnival: spawns bouncing balls |
| Ghost Shrimp | Invisible until close (Trench) |
| Mimic Clam | Looks like a chest |
| Splitter Slime | Splits into 2 smaller |
Champion variants (colored, with modifier) from depth 2+.

### 12.2 Bosses (2 per depth, pick 1 by seed)
| Depth | Bosses |
|---|---|
| 1 | **Big Barnacle Bill** (spawns barnacles) · **Queen Clam** (pearl barrage) |
| 2 | **Kelpie the Tangler** (vines across room) · **Sir Urchin** |
| 3 | **The Rusty Admiral** (crab in a cannon hat) · **Treasure Mimic** |
| 4 | **Ringmaster Octo** (juggles enemies) · **Jester Jellies** (trio) |
| 5 | **Mother Angler** (light/dark phases) · **The Siphonophore** (long chain enemy) |
| 6 | **The Hollow Maw** (3 phases, final) |

Boss structure: 2–3 phases with telegraphed bullet patterns (colorful, readable).

## 13. Save System & Meta Progression

### 13.1 Saving
- **Storage:** `localStorage` (JSON, versioned schema with migrations).
  Optional **export/import save** as a text code for backup / transferring.
- **Mid-run save:** "Save & Quit" from pause; on continue, restore at the start
  of the current room (seed + floor state + player state). One suspended run slot.
- **Profile:** 1 profile. **Export/Import** via a base64 save string in Options.

### 13.2 Meta progression
Pure Isaac-style: **achievements → unlocks**. No currency. e.g.:
  - Beat any Depth 1 / Depth 2 boss → unlock next Dive (§5.1).
  - Beat Rusty Admiral → *Admiral's Key* (post-v1: Barnaby the Hermit Crab).
  - Get 3 synergies in one run → *Mitosis* added to item pool.
  - Win without taking damage on a floor → *Golden Scale* hearts can drop.
  - Beat Hollow Maw → Abyss alternate endings / hard mode.
- The **Tide Pool** title screen visibly fills with rescued, re-colored
  bosses as trophies (visual progress, no currency).
- **Collection Log ("Sea-pedia")** — every item/enemy/boss seen, with lore text.
- **Stats:** runs, wins, deaths by cause, best time, favorite item.

## 14. Technical Architecture

| Concern | Choice |
|---|---|
| Language | **TypeScript** |
| Build | **Vite** (dev server + static build) |
| Rendering | Canvas 2D (custom, no engine) — full control over comic look |
| Audio | WebAudio synth SFX (music post-v1) |
| Physics | Custom AABB/circle collision, tile grid |
| Tests | **Vitest** for PRNG, generation determinism, item modifiers, save migration |
| Deploy | Static site → GitHub Pages via Actions workflow |

```
src/
  core/       loop, input, rng, events, time
  gen/        floor layout, room templates, pools, seed
  world/      room, tiles, doors, hazards
  entities/   player, enemies, bosses, projectiles, familiars, pickups
  items/      item defs (data), modifiers, synergies, transformations
  render/     draw primitives, comic FX, sprites (procedural), camera, UI
  audio/      synth, sfx, music
  meta/       save, unlocks, stats, hub
  scenes/     title, hub, run, pause, gameover, codex
```

Performance target: 60 FPS with ~300 projectiles on mid-range laptops.

## 15. v1 Delivery Plan (after approval)

1. **Skeleton** — Vite + TS, game loop, input, scaling canvas, scene manager, seeded RNG, Vitest, Pages workflow.
2. **Clementine** — movement, 4-dir bubbles, stats, procedural jelly sprite with tentacles.
3. **Floor gen** — layout, room templates + procedural rooms, doors, minimap, transitions.
4. **Combat** — 12 enemies (Depths 1–3), hit/knockback, pickups, room-clear rewards.
5. **Items** — modifier system, ~30 items, pools, pedestals, shop, actives, trinkets.
6. **Synergies & transformations** — explicit table + FX.
7. **Bosses** — 6 bosses with comic-cover intros.
8. **Meta** — save/continue, unlocks, progressive dives, Sea-pedia, export code.
9. **Juice** — comic FX, halftones, onomatopoeia, SFX, options (shake/flash).
10. **Polish & balance** — seed determinism tests, perf pass, deploy.

## 16. Remaining minor assumptions
- Diagonal shooting off by default (toggle in Options).
- No mobile/touch support.
- Difficulty: Normal only in v1; "Riptide" hard mode post-v1.
