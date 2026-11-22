import { MAP_W, MAP_H, TERRAIN, KIND, ZONE, BUILDINGS } from '../config.js';
import { fbm, mulberry32 } from './noise.js';

export const BUILDING_KEYS = Object.keys(BUILDINGS);
export const bKey = (id) => (id > 0 ? BUILDING_KEYS[id - 1] : null);
export const bId = (key) => BUILDING_KEYS.indexOf(key) + 1;

// Direction bits for road auto-tiling: +x, +y, -x, -y.
export const DIRS = [
  { dx: 1, dy: 0, bit: 1 },
  { dx: 0, dy: 1, bit: 2 },
  { dx: -1, dy: 0, bit: 4 },
  { dx: 0, dy: -1, bit: 8 },
];

const ARRAYS = {
  terrain: Uint8Array, trees: Uint8Array, kind: Uint8Array, zone: Uint8Array, level: Uint8Array,
  variant: Uint8Array, btype: Uint8Array, build: Uint8Array, fire: Uint8Array, root: Int32Array,
  // derived maps (recomputed, not saved)
  power: Uint8Array, water: Uint8Array, access: Uint8Array,
  landValue: Float32Array, pollution: Float32Array, crime: Float32Array,
  fireCover: Float32Array, police: Float32Array, health: Float32Array, education: Float32Array,
  fun: Float32Array, traffic: Float32Array, noPowerDays: Uint8Array,
};
const SAVED = ['terrain', 'trees', 'kind', 'zone', 'level', 'variant', 'btype', 'build', 'fire', 'root'];

export class World {
  constructor(w = MAP_W, h = MAP_H) {
    this.w = w;
    this.h = h;
    this.n = w * h;
    for (const [k, T] of Object.entries(ARRAYS)) this[k] = new T(this.n);
    this.root.fill(-1);
    this.dirty = new Set();
    this.seed = 1;
  }

  idx(x, y) { return y * this.w + x; }
  xy(i) { return [i % this.w, Math.floor(i / this.w)]; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  markDirty(i) {
    this.dirty.add(i);
    const [x, y] = this.xy(i);
    for (const d of DIRS) {
      const nx = x + d.dx, ny = y + d.dy;
      if (this.inBounds(nx, ny)) this.dirty.add(this.idx(nx, ny));
    }
  }

  generate(seed = Math.floor(Math.random() * 1e9)) {
    this.seed = seed;
    const rand = mulberry32(seed);
    const { w, h } = this;
    const riverPhase = rand() * Math.PI * 2;
    const riverX = w * (0.5 + (rand() - 0.5) * 0.25);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = this.idx(x, y);
        let e = fbm(x / 20, y / 20, seed, 5);
        // Sea along the far (y = 0) edge with a wavy coastline.
        const coast = 4 + fbm(x / 9, 3.3, seed + 7, 3) * 7;
        if (y < coast) e -= (coast - y) / coast * 0.55;
        // Meandering river flowing to the sea.
        const rx = riverX + Math.sin(y * 0.09 + riverPhase) * 7 + (fbm(y / 10, 1.7, seed + 3, 2) - 0.5) * 8;
        const dist = Math.abs(x - rx);
        if (dist < 1.6) e = Math.min(e, 0.2);
        else if (dist < 2.6) e = Math.min(e, 0.33);
        this.variant[i] = Math.floor(rand() * 256);
        if (e < 0.29) this.terrain[i] = TERRAIN.WATER;
        else if (e < 0.335) this.terrain[i] = TERRAIN.SAND;
        else this.terrain[i] = TERRAIN.GRASS;
      }
    }
    // Sand only next to water, everything else grass; trees in forest noise.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = this.idx(x, y);
        if (this.terrain[i] === TERRAIN.SAND && !this.nearTerrain(x, y, TERRAIN.WATER, 2)) {
          this.terrain[i] = TERRAIN.GRASS;
        }
        if (this.terrain[i] === TERRAIN.GRASS) {
          const f = fbm(x / 8, y / 8, seed + 99, 3);
          if (f > 0.6 || (f > 0.5 && rand() < 0.12) || rand() < 0.015) {
            this.trees[i] = 1 + Math.floor(rand() * 6);
          }
        }
      }
    }
    for (let i = 0; i < this.n; i++) this.dirty.add(i);
    return this;
  }

  nearTerrain(x, y, t, r) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx, ny = y + dy;
        if (this.inBounds(nx, ny) && this.terrain[this.idx(nx, ny)] === t) return true;
      }
    }
    return false;
  }

  isRoad(x, y) {
    return this.inBounds(x, y) && this.kind[this.idx(x, y)] === KIND.ROAD;
  }

  roadMask(x, y) {
    let m = 0;
    for (const d of DIRS) if (this.isRoad(x + d.dx, y + d.dy)) m |= d.bit;
    return m;
  }

  // --- placement checks ---------------------------------------------------
  canRoad(x, y) {
    if (!this.inBounds(x, y)) return false;
    const i = this.idx(x, y);
    return this.kind[i] === KIND.EMPTY || (this.kind[i] === KIND.ZONE && this.level[i] === 0 && this.build[i] === 0);
  }

  canZone(x, y) {
    if (!this.inBounds(x, y)) return false;
    const i = this.idx(x, y);
    if (this.terrain[i] === TERRAIN.WATER) return false;
    return this.kind[i] === KIND.EMPTY || this.kind[i] === KIND.ZONE;
  }

  canPlaceBuilding(key, x, y) {
    const s = BUILDINGS[key].size;
    for (let dy = 0; dy < s; dy++) {
      for (let dx = 0; dx < s; dx++) {
        const nx = x + dx, ny = y + dy;
        if (!this.inBounds(nx, ny)) return false;
        const i = this.idx(nx, ny);
        if (this.terrain[i] === TERRAIN.WATER) return false;
        if (this.kind[i] === KIND.ROAD || this.kind[i] === KIND.BUILDING) return false;
        if (this.kind[i] === KIND.ZONE && (this.level[i] > 0 || this.build[i] > 0)) return false;
      }
    }
    return true;
  }

  // --- mutations ----------------------------------------------------------
  setRoad(x, y) {
    const i = this.idx(x, y);
    this.kind[i] = KIND.ROAD;
    this.zone[i] = ZONE.NONE;
    this.level[i] = 0;
    this.trees[i] = 0;
    this.markDirty(i);
  }

  setZone(x, y, z) {
    const i = this.idx(x, y);
    if (this.kind[i] === KIND.ZONE && this.zone[i] === z) return false;
    this.kind[i] = KIND.ZONE;
    this.zone[i] = z;
    this.level[i] = 0;
    this.build[i] = 0;
    this.trees[i] = 0;
    this.markDirty(i);
    return true;
  }

  placeBuilding(key, x, y) {
    const s = BUILDINGS[key].size;
    const r = this.idx(x, y);
    for (let dy = 0; dy < s; dy++) {
      for (let dx = 0; dx < s; dx++) {
        const i = this.idx(x + dx, y + dy);
        this.kind[i] = KIND.BUILDING;
        this.zone[i] = ZONE.NONE;
        this.level[i] = 0;
        this.build[i] = 0;
        this.trees[i] = 0;
        this.btype[i] = bId(key);
        this.root[i] = r;
        this.markDirty(i);
      }
    }
  }

  // Returns the tile indices that were cleared.
  clear(x, y) {
    if (!this.inBounds(x, y)) return [];
    let i = this.idx(x, y);
    const cleared = [];
    if (this.kind[i] === KIND.BUILDING) {
      const r = this.root[i];
      const s = BUILDINGS[bKey(this.btype[r])].size;
      const [rx, ry] = this.xy(r);
      for (let dy = 0; dy < s; dy++) {
        for (let dx = 0; dx < s; dx++) {
          const j = this.idx(rx + dx, ry + dy);
          this.resetTile(j);
          cleared.push(j);
        }
      }
      return cleared;
    }
    if (this.kind[i] !== KIND.EMPTY || this.trees[i]) {
      this.resetTile(i);
      cleared.push(i);
    }
    return cleared;
  }

  resetTile(i) {
    this.kind[i] = KIND.EMPTY;
    this.zone[i] = ZONE.NONE;
    this.level[i] = 0;
    this.build[i] = 0;
    this.btype[i] = 0;
    this.fire[i] = 0;
    this.trees[i] = 0;
    this.root[i] = -1;
    this.markDirty(i);
  }

  // --- persistence --------------------------------------------------------
  serialize() {
    const out = { w: this.w, h: this.h, seed: this.seed };
    for (const k of SAVED) out[k] = Array.from(this[k]);
    return out;
  }

  static deserialize(data) {
    const world = new World(data.w, data.h);
    world.seed = data.seed;
    for (const k of SAVED) world[k].set(data[k]);
    for (let i = 0; i < world.n; i++) world.dirty.add(i);
    return world;
  }
}
