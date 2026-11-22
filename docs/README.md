# Skyhaven — City Builder

An isometric city-building game for the browser. Every graphic (buildings, roads, water, trees, cars, clouds, effects) is drawn procedurally at startup — there are no image assets.

## Play

```bash
npm install
npm run dev      # http://localhost:5173
```

### How to build a city
1. **Roads** — everything needs road access (within 3 tiles). Roads over water become bridges.
2. **Zones** — drag out Residential (green), Commercial (blue) and Industrial (amber) land.
3. **Power** — place a plant touching your network. Roads carry power to lots within 3 tiles.
4. **Water** — water towers let buildings grow past level 1.
5. **Services** — police (crime), fire (fires!), schools (dense industry, land value), hospitals, parks.
6. **Balance** — watch RCI demand, the budget, approval, and your advisor's tips.

Milestones (Village → Town → City → Metropolis → Megalopolis) award grants and unlock buildings and taller growth. The Goals panel gives guided objectives with cash rewards.

### Controls
| Action | Input |
| --- | --- |
| Build / zone / bulldoze | Left-drag |
| Pan | Right-drag, Space+drag, WASD/arrows, or drag in Inspect mode |
| Zoom | Mouse wheel |
| Tools | `R` road, `X` bulldoze, `1`–`3` zones, `4`–`8` building groups, `Esc` inspect |
| Speed | `P` pause, `+`/`-` |
| Other | `B` budget, `N` day/night cycle, `M` mute |

Autosaves every 3 in-game months and on page close (localStorage).

## Architecture
- `src/sim/` — pure-JS simulation (no Phaser): terrain generation, power grid flood-fill, service coverage, pollution/crime/land value, RCI demand, zone growth, fires, budget, milestones, goals, save/load (RLE-compressed).
- `src/render/` — canvas-2D procedural art packed into texture atlases; iso projection; ambient light curve.
- `src/scenes/GameScene.js` — Phaser scene: tile sprites, depth sorting, traffic agents, particles, clouds, overlays, input.
- `src/ui/` — HTML/CSS HUD over the canvas.
- `src/audio.js` — WebAudio-synthesized SFX and ambience.

## Tests
```bash
npm test           # simulation unit tests
npm run sim:bench  # 10-year headless simulation benchmark
```
