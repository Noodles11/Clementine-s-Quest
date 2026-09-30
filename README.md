# Clementine's Quest 🪼

A funky, comic-style underwater roguelite for the browser — *The Binding of Isaac*
seen through the glass of a fish tank. You are **Clementine**, a tiny jellyfish who
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

- Clear rooms to open doors. Find the treasure room, Barnaby's shop, secrets and the boss.
- Every boss guards **The Crack**. Your first dives end at Depth 1; each new boss you
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
  gen/       seeds, biomes, floor layout, room interiors
  game/      run state, room simulation, player, enemies, bosses, items, synergies
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
