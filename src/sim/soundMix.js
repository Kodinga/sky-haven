// Analyses what is around a point on the map and returns a soundscape mix.
// Pure + Phaser-free so it can be unit-tested. Every channel is 0..1; `pan`
// holds the stereo position (-1 left .. 1 right, in screen space) of each channel.
import { KIND, TERRAIN, ZONE } from '../config.js';
import { bKey } from './World.js';

export const CHANNELS = ['water', 'nature', 'res', 'com', 'ind', 'park', 'traffic', 'build', 'fire', 'crowd', 'wind'];

const BUILDING_CHANNEL = {
  coal: 'ind', wind: 'wind', solar: 'nature', watertower: 'res', police: 'com', fire: 'com',
  school: 'park', hospital: 'com', park: 'park', plaza: 'park', stadium: 'crowd', spire: 'com',
};

/**
 * @param {World} w
 * @param {number} cx centre tile x (float)
 * @param {number} cy centre tile y (float)
 * @param {number} radius sample radius in tiles
 * @param {{x:number,y:number}[]} cars positions in tile space
 */
export function soundMix(w, cx, cy, radius, cars = []) {
  const R = Math.max(2, radius);
  const sum = {}, panSum = {};
  for (const c of CHANNELS) { sum[c] = 0; panSum[c] = 0; }
  let total = 0;
  const add = (ch, v, wt, sx) => { sum[ch] += v * wt; panSum[ch] += v * wt * sx; };

  const step = R > 24 ? 2 : 1; // subsample when zoomed far out
  for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y += step) {
    for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x += step) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) continue;
      const wt = (1 - d / R) ** 1.5;
      const sx = Math.max(-1, Math.min(1, (dx - dy) / (R * 1.2))); // iso screen-x
      total += wt;
      if (!w.inBounds(x, y)) { add('water', 1, wt, sx); continue; }
      const i = w.idx(x, y);
      const kind = w.kind[i];
      if (w.fire[i] > 0) add('fire', 1, wt, sx);
      if (w.build[i] > 0) add('build', 1, wt, sx);
      if (kind === KIND.EMPTY) {
        const t = w.terrain[i];
        if (t === TERRAIN.WATER) add('water', 1, wt, sx);
        else if (t === TERRAIN.SAND) { add('water', 0.55, wt, sx); add('nature', 0.25, wt, sx); }
        else add('nature', w.trees[i] ? 1 : 0.55, wt, sx);
      } else if (kind === KIND.ZONE) {
        const lvl = w.level[i];
        const dens = lvl ? 0.45 + lvl * 0.2 : 0.1;
        const ch = w.zone[i] === ZONE.R ? 'res' : w.zone[i] === ZONE.C ? 'com' : w.zone[i] === ZONE.I ? 'ind' : null;
        if (ch) add(ch, dens, wt, sx);
        if (!lvl) add('nature', 0.4, wt, sx);
      } else if (kind === KIND.BUILDING) {
        const ch = BUILDING_CHANNEL[bKey(w.btype[i])] || 'com';
        add(ch, 1, wt, sx);
        if (ch === 'crowd') add('com', 0.5, wt, sx);
      } else if (kind === KIND.ROAD) {
        add('traffic', 0.08, wt, sx); // empty roads still carry a little hum
      }
    }
  }

  // Visible cars dominate the traffic channel.
  let carW = 0, carPan = 0;
  for (const c of cars) {
    const dx = c.x + 0.5 - cx, dy = c.y + 0.5 - cy;
    const d = Math.hypot(dx, dy);
    if (d > R) continue;
    const wt = 1 - d / R;
    carW += wt;
    carPan += wt * Math.max(-1, Math.min(1, (dx - dy) / (R * 1.2)));
  }

  const out = { pan: {} };
  const norm = total > 0 ? 1 / total : 0;
  for (const c of CHANNELS) {
    out[c] = Math.min(1, sum[c] * norm * (c === 'fire' || c === 'build' || c === 'wind' || c === 'crowd' ? 6 : 1.4));
    out.pan[c] = sum[c] > 0 ? panSum[c] / sum[c] : 0;
  }
  const carLevel = Math.min(1, carW / (4 + R * 0.6));
  out.traffic = Math.min(1, out.traffic + carLevel);
  out.pan.traffic = carW > 0 ? (carPan / carW) * 0.8 + out.pan.traffic * 0.2 : out.pan.traffic;
  out.cars = carW;
  return out;
}
