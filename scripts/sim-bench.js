// Headless simulation benchmark: builds a small town and runs 10 years.
// Usage: npm run sim:bench
import { World } from '../src/sim/World.js';
import { Simulation } from '../src/sim/Simulation.js';
import { TERRAIN, ZONE } from '../src/config.js';

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

async function main() {
  const world = new World();
  world.terrain.fill(TERRAIN.GRASS);
  const sim = new Simulation(world, { seed: 1, money: 1e6 });
  sim.toast = () => {};
  for (let y = 4; y < 68; y += 6) {
    const road = [];
    for (let x = 4; x < 68; x++) road.push([x, y]);
    sim.applyTool({ type: 'road' }, road);
    const k = (y - 4) / 6;
    const zone = [ZONE.R, ZONE.R, ZONE.C, ZONE.R, ZONE.I][k % 5];
    const cells = [];
    for (let x = 4; x < 68; x++) cells.push([x, y + 1], [x, y + 2], [x, y - 1]);
    sim.applyTool({ type: 'zone', zone }, cells);
  }
  for (let y = 4; y < 68; y += 6) sim.applyTool({ type: 'building', key: 'coal' }, [[2, y]]);
  for (let y = 7; y < 68; y += 18) for (let x = 10; x < 68; x += 16) sim.applyTool({ type: 'building', key: 'watertower' }, [[x, y]]);

  const t0 = performance.now();
  for (let d = 0; d < 3600; d++) sim.step();
  const ms = performance.now() - t0;
  console.log(`10 years simulated in ${ms.toFixed(0)}ms (${(ms / 3600).toFixed(2)}ms/day)`);
  console.log('Stats:', sim.stats, 'Demand:', sim.demand, 'Money:', sim.money, 'Milestone:', sim.milestone);
}

main();
