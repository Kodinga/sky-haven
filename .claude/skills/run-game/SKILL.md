---
name: run-game
description: Launch Skyhaven locally and verify it renders (dev server or production preview + headless screenshot).
---

# Run Skyhaven

1. `npm install` (first time only).
2. Dev: `npm run dev` → http://localhost:5173.
3. Production check: `npm run build && npx vite preview --port 4173`.
4. Automated check: with Playwright, load the page, click `#btnNew`, wait ~1s, screenshot.
   `window.skyhaven.hud.sim` exposes the live `Simulation` (e.g. `sim.applyTool(...)`, `sim.step()`),
   and `window.skyhaven.hud.scene` the Phaser `GameScene` (`scene.tod` sets time of day, `scene.zoomTarget` zoom).
5. Run `npm test` for simulation logic.
