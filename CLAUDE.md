# Skyhaven — City Builder

Browser isometric city-building game. Phaser 3 (rendering) + vanilla JS simulation + HTML/CSS HUD overlay. Built with Vite.

## Commands
- `npm run dev` — dev server (http://localhost:5173)
- `npm run build` — production build to `dist/`
- `npm test` — Vitest unit tests for the simulation (`tests/`)
- `npm run sim:bench` — headless simulation benchmark (Node)

## Layout
- `src/main.js` — bootstraps Phaser + HUD
- `src/config.js` — tile types, tool/building definitions, costs, balance constants
- `src/sim/` — pure game logic, **no Phaser imports** (testable in Node)
  - `noise.js` terrain noise, `World.js` grid + terrain gen, `Simulation.js` economy/growth/services, `save.js`
- `src/render/` — procedural texture generation (no image assets) and iso math
- `src/scenes/` — Phaser scenes (`GameScene` renders the world, cars, day/night, input)
- `src/ui/` — HTML HUD (toolbar, stats, advisor, overlays)
- `docs/` — design notes

## Conventions
- Simulation must stay deterministic-ish and Phaser-free.
- All art is generated at runtime in `src/render/textures.js`.
- Commit at every checkpoint.
