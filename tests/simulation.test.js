import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/World.js';
import { Simulation } from '../src/sim/Simulation.js';
import { encode, decode } from '../src/sim/save.js';
import { KIND, TERRAIN, ZONE } from '../src/config.js';

// Flat, all-grass world so tests are deterministic.
function flatWorld(w = 30, h = 30) {
  const world = new World(w, h);
  world.terrain.fill(TERRAIN.GRASS);
  return world;
}

function buildTown(sim) {
  const road = [];
  for (let x = 2; x < 26; x++) road.push([x, 10]);
  sim.applyTool({ type: 'road' }, road);
  const res = [], ind = [], com = [];
  for (let x = 2; x < 14; x++) { res.push([x, 9], [x, 11]); }
  for (let x = 14; x < 20; x++) { com.push([x, 9], [x, 11]); }
  for (let x = 20; x < 26; x++) { ind.push([x, 9], [x, 11]); }
  sim.applyTool({ type: 'zone', zone: ZONE.R }, res);
  sim.applyTool({ type: 'zone', zone: ZONE.C }, com);
  sim.applyTool({ type: 'zone', zone: ZONE.I }, ind);
  sim.applyTool({ type: 'building', key: 'coal' }, [[22, 12]]);
  sim.applyTool({ type: 'building', key: 'watertower' }, [[12, 12]]);
}

describe('World', () => {
  it('generates terrain with water and land', () => {
    const w = new World(48, 48).generate(42);
    let water = 0, grass = 0;
    for (let i = 0; i < w.n; i++) {
      if (w.terrain[i] === TERRAIN.WATER) water++;
      if (w.terrain[i] === TERRAIN.GRASS) grass++;
    }
    expect(water).toBeGreaterThan(0);
    expect(grass).toBeGreaterThan(w.n * 0.4);
  });

  it('computes road auto-tile masks', () => {
    const w = flatWorld();
    w.setRoad(5, 5); w.setRoad(6, 5); w.setRoad(5, 6);
    expect(w.roadMask(5, 5)).toBe(1 | 2);
    expect(w.roadMask(6, 5)).toBe(4);
  });

  it('places and clears multi-tile buildings', () => {
    const w = flatWorld();
    expect(w.canPlaceBuilding('coal', 3, 3)).toBe(true);
    w.placeBuilding('coal', 3, 3);
    expect(w.kind[w.idx(4, 4)]).toBe(KIND.BUILDING);
    expect(w.canPlaceBuilding('coal', 4, 4)).toBe(false);
    const cleared = w.clear(4, 4);
    expect(cleared.length).toBe(4);
    expect(w.kind[w.idx(3, 3)]).toBe(KIND.EMPTY);
  });
});

describe('Simulation', () => {
  it('charges money for tools and refuses when broke', () => {
    const sim = new Simulation(flatWorld(), { money: 100 });
    const r = sim.applyTool({ type: 'road' }, [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1]]);
    expect(r.count).toBe(8);
    expect(sim.money).toBe(4);
  });

  it('propagates power through connected tiles', () => {
    const sim = new Simulation(flatWorld());
    buildTown(sim);
    const w = sim.world;
    expect(w.power[w.idx(3, 9)]).toBe(1);
    expect(w.power[w.idx(28, 28)]).toBe(0);
    expect(sim.stats.powerCap).toBeGreaterThan(0);
  });

  it('grows a population over time', () => {
    const sim = new Simulation(flatWorld(), { seed: 7 });
    buildTown(sim);
    for (let d = 0; d < 360; d++) sim.step();
    expect(sim.stats.pop).toBeGreaterThan(50);
    expect(sim.stats.jobsI + sim.stats.jobsC).toBeGreaterThan(0);
    expect(sim.history.length).toBe(12);
  });

  it('does not grow without power', () => {
    const sim = new Simulation(flatWorld(), { seed: 3 });
    const road = [];
    for (let x = 2; x < 20; x++) road.push([x, 10]);
    sim.applyTool({ type: 'road' }, road);
    sim.applyTool({ type: 'zone', zone: ZONE.R }, road.map(([x]) => [x, 9]));
    for (let d = 0; d < 120; d++) sim.step();
    expect(sim.stats.pop).toBe(0);
  });

  it('save/load round-trips', () => {
    const sim = new Simulation(flatWorld(), { seed: 9, cityName: 'Testville' });
    buildTown(sim);
    for (let d = 0; d < 90; d++) sim.step();
    const copy = decode(encode(sim));
    expect(copy.cityName).toBe('Testville');
    expect(copy.money).toBe(sim.money);
    expect(Array.from(copy.world.level)).toEqual(Array.from(sim.world.level));
    expect(copy.stats.pop).toBe(sim.stats.pop);
  });

  it('higher taxes reduce demand', () => {
    const sim = new Simulation(flatWorld());
    sim.tax = 9; sim.computeStats();
    const base = sim.demand.R;
    sim.tax = 18; sim.computeStats();
    expect(sim.demand.R).toBeLessThan(base);
  });
});

describe('Power reach', () => {
  it('powers lots a couple of tiles away from a powered road', () => {
    const world = new World(30, 30);
    world.terrain.fill(TERRAIN.GRASS);
    const sim = new Simulation(world);
    const road = [];
    for (let x = 2; x < 20; x++) road.push([x, 10]);
    sim.applyTool({ type: 'road' }, road);
    sim.applyTool({ type: 'building', key: 'coal' }, [[2, 11]]);
    sim.applyTool({ type: 'zone', zone: ZONE.R }, [[12, 12]]); // gap row at y=11
    expect(world.power[world.idx(12, 12)]).toBe(1);
  });
});
