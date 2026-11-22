import { TW, TH } from '../config.js';

// Tile-space (u, v) -> world pixels. Tile (x, y) spans u in [x, x+1].
export const toWorld = (u, v) => [(u - v) * TW / 2, (u + v) * TH / 2];

export function toTile(wx, wy) {
  const a = wx / (TW / 2), b = wy / (TH / 2);
  return [Math.floor((b + a) / 2), Math.floor((b - a) / 2)];
}

export const depthOf = (x, y, s = 1) => 100 + (x + y + 2 * (s - 1)) * 4;

// Ambient light keyframes over a day (0..1).
const KEYS = [
  [0.0, [0.25, 0.3, 0.5], 1],
  [0.2, [0.34, 0.36, 0.56], 1],
  [0.25, [1.0, 0.72, 0.58], 0.35],
  [0.32, [1, 1, 1], 0],
  [0.7, [1, 1, 1], 0],
  [0.77, [1.0, 0.7, 0.5], 0.3],
  [0.84, [0.48, 0.42, 0.62], 0.9],
  [0.9, [0.25, 0.3, 0.5], 1],
  [1.0, [0.25, 0.3, 0.5], 1],
];

export function ambientAt(t) {
  for (let k = 0; k < KEYS.length - 1; k++) {
    const [t0, c0, n0] = KEYS[k];
    const [t1, c1, n1] = KEYS[k + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0);
      const c = c0.map((v, i) => v + (c1[i] - v) * f);
      return { color: c, night: n0 + (n1 - n0) * f };
    }
  }
  return { color: [1, 1, 1], night: 0 };
}

export const rgbInt = ([r, g, b]) => (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
