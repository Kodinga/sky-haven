import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/World.js';
import { soundMix } from '../src/sim/soundMix.js';
import { KIND, TERRAIN, ZONE } from '../src/config.js';

function world() {
  const w = new World(40, 40);
  w.terrain.fill(TERRAIN.GRASS);
  // Left half of the map (x < 10) is sea, a block of industry around (30, 30).
  for (let y = 0; y < 40; y++) for (let x = 0; x < 10; x++) w.terrain[w.idx(x, y)] = TERRAIN.WATER;
  for (let y = 26; y < 34; y++) {
    for (let x = 26; x < 34; x++) {
      const i = w.idx(x, y);
      w.kind[i] = KIND.ZONE;
      w.zone[i] = ZONE.I;
      w.level[i] = 2;
    }
  }
  return w;
}

describe('soundMix', () => {
  it('is dominated by water over the sea', () => {
    const m = soundMix(world(), 3, 20, 5);
    expect(m.water).toBeGreaterThan(0.8);
    expect(m.ind).toBe(0);
  });

  it('is dominated by industry over a factory district', () => {
    const m = soundMix(world(), 30, 30, 4);
    expect(m.ind).toBeGreaterThan(0.6);
    expect(m.water).toBeLessThan(0.1);
  });

  it('pans sounds toward where they are on screen', () => {
    // Centre at (20, 20): sea lies at low x, which is screen-left/up in iso.
    const m = soundMix(world(), 14, 20, 8);
    expect(m.pan.water).toBeLessThan(0);
  });

  it('counts nearby cars as traffic', () => {
    const w = world();
    const quiet = soundMix(w, 20, 20, 6).traffic;
    const cars = Array.from({ length: 12 }, (_, k) => ({ x: 18 + (k % 4), y: 19 + (k % 3) }));
    expect(soundMix(w, 20, 20, 6, cars).traffic).toBeGreaterThan(quiet + 0.3);
  });

  it('treats off-map as open sea', () => {
    expect(soundMix(world(), 20, -20, 5).water).toBeGreaterThan(0.9);
  });
});
