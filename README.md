# Clementine's Quest 🐙

A funky, comic-style underwater roguelite for the browser — *The Binding of Isaac*
seen through the glass of a fish tank. You are **Clementine**, a tiny bioluminescent octopus who
glows a little too much, diving deeper and deeper to find out why the Great Current
went silent.

Full design: [`docs/DESIGN.md`](docs/DESIGN.md).

## Play

| Action | Keys |
|---|---|
| Swim | **W A S D** (let go and you slowly sink) |
| Shoot | **Arrow keys** |
| Ink bomb (sinks!) | **E** |
| Active item | **Space** |
| Eat sea snack | **Q** |
| Pause | **Esc** / **P** |
| Restart run | hold **R** |

**Touch (phones/tablets, landscape):** drag on the left half to swim, drag on the right
half to aim and shoot (free-angle twin-stick). Buttons: 💣 bomb, ★ active, 🍬 snack,
❚❚ pause, ▦ map.

- Each depth is one big reef labyrinth. The camera follows Clementine; explore the tunnels
  to find treasure caves, Barnaby's shop, bomb-able secret caves and — always somewhere at
  the bottom — the boss. Hold **Tab** for the map (it fills in as you explore).
- Clementine has 100 HP (health bar, top left). Hearts heal 15 HP, containers add max HP.
- The reef is destructible: ink bombs blow round craters into rock, and stronger shots
  (explosive ink, charged pearls, beams) chip small holes. Plain ink only leaves stains.
- Creatures ambush you in their chambers; clearing an encounter drops a reward and charges
  your active item. Plants and boulders in front can hide you and them from view.
- Every boss guards **The Crack** (the rift). After the fight only rewards and the rift remain;
  if the next depth is still locked, entering the rift ends the dive.
- Debug: enter `DEBUG` as a seed for 999 HP, stocked pockets and an item picker (press **`**).
- Your first dives end at Depth 1; each new boss you
  defeat unlocks the next depth (Kelp Jungle, then the Sunken Galleon).
- Items stack: bubble effects combine, 10 named **synergies** add special effects, and
  three related items trigger a **transformation**.
- The deeper you go, the darker the water and the meaner the sea gets.
- Runs are **seeded** (8-character codes like `KELP 7Q2Z`); seeded dives never unlock achievements.
- Progress saves automatically (browser storage). Use **Save Code** on the title screen to back it up.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + soak tests (Vitest)
npm run build      # static build in dist/
```

Tech: TypeScript, Vite, PixiJS v8 (WebGL). Everything — levels, creatures, items, textures
and sound effects — is generated in code; there are no image or audio assets.

```
src/
  core/      rng, input, audio (WebAudio synth), save/profile, math
  gen/       seeds, biomes, whole-level reef generation (level.ts), tiles
  game/      run state, level simulation (room.ts), player, enemies, bosses, items, synergies
  ambient/   water velocity field, particles, fish boids, kelp & plants
  render/    terrain, Clementine soft body, creatures, icons, FX, HUD
  scene.ts   layer stack, lighting, bloom, refraction, transitions
  ui.ts      DOM menus and comic overlays
  main.ts    boot + meta progression
```

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes
`dist/` to GitHub Pages. One-time setup: **Settings → Pages → Build and deployment →
Source: GitHub Actions**.
