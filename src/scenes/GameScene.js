import Phaser from 'phaser';
import { TW, TH, RES, KIND, TERRAIN, ZONE_KEYS, BUILDINGS, CAPACITY } from '../config.js';
import { bKey, DIRS } from '../sim/World.js';
import { generateTextures, setTex, texArgs, ATLAS_OF, META, VARIANTS, CAR_COLORS } from '../render/textures.js';
import { toWorld, toTile, depthOf, ambientAt, rgbInt } from '../render/iso.js';
import { soundMix } from '../sim/soundMix.js';
import { audio } from '../audio.js';

const SCALE = 1 / RES;
const DAY_LENGTH = 300; // real seconds per visual day/night cycle

const OVERLAYS = {
  power: { label: 'Power grid', fn: (w, i) => (w.kind[i] === 0 ? null : w.power[i] ? 0.0 : 1.0), colors: [0x34d399, 0xef4444] },
  water: { label: 'Water', fn: (w, i) => (w.terrain[i] === TERRAIN.WATER ? null : w.water[i] ? 0 : (w.kind[i] === KIND.ZONE ? 1 : null)), colors: [0x38bdf8, 0xf97316] },
  landValue: { label: 'Land value', fn: (w, i) => (w.terrain[i] === TERRAIN.WATER ? null : 1 - w.landValue[i]) },
  pollution: { label: 'Pollution', fn: (w, i) => (w.pollution[i] < 0.03 ? null : w.pollution[i]) },
  crime: { label: 'Crime', fn: (w, i) => (w.crime[i] < 0.02 ? null : Math.min(1, w.crime[i] * 2)) },
  fire: { label: 'Fire coverage', fn: (w, i) => (w.terrain[i] === TERRAIN.WATER ? null : 1 - w.fireCover[i]) },
  police: { label: 'Police coverage', fn: (w, i) => (w.terrain[i] === TERRAIN.WATER ? null : 1 - w.police[i]) },
  education: { label: 'Education', fn: (w, i) => (w.terrain[i] === TERRAIN.WATER ? null : 1 - w.education[i]) },
  health: { label: 'Health', fn: (w, i) => (w.terrain[i] === TERRAIN.WATER ? null : 1 - w.health[i]) },
};
export { OVERLAYS };

function heat(t) {
  // 0 = good (green) .. 1 = bad (red)
  const stops = [[0, [52, 211, 153]], [0.5, [250, 204, 21]], [1, [239, 68, 68]]];
  for (let k = 0; k < stops.length - 1; k++) {
    const [a, ca] = stops[k], [b, cb] = stops[k + 1];
    if (t <= b) {
      const f = (t - a) / (b - a);
      const c = ca.map((v, j) => Math.round(v + (cb[j] - v) * f));
      return (c[0] << 16) | (c[1] << 8) | c[2];
    }
  }
  return 0xef4444;
}

export class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  init(data) {
    this.sim = data.sim;
    this.world = this.sim.world;
    this.hud = data.hud;
  }

  create() {
    if (!this.textures.exists('atlas0')) generateTextures(this);
    const w = this.world;
    this.tool = { type: 'inspect' };
    this.overlay = null;
    this.tod = 0.3;
    this.cycle = true;
    this.waterFrame = 0;
    this.ambientKey = -1;
    this.ground = new Array(w.n);
    this.objs = new Array(w.n).fill(null);
    this.lights = new Array(w.n).fill(null);
    this.objKey = new Array(w.n).fill(null);
    this.extras = new Map(); // idx -> [gameObjects]
    this.fires = new Map();
    this.glows = new Map();
    this.icons = new Map();
    this.cars = [];
    this.roadTiles = [];

    this.cameras.main.setBackgroundColor('#2a6d96');
    this.skirt = this.add.graphics().setDepth(-10);
    this.waves = this.add.graphics().setDepth(-11);
    for (let i = 0; i < w.n; i++) {
      const [x, y] = w.xy(i);
      const [cx, cy] = toWorld(x + 0.5, y + 0.5);
      this.ground[i] = this.add.image(cx, cy, ...texArgs('grass_0')).setScale(SCALE).setDepth(0);
    }
    for (let i = 0; i < w.n; i++) this.refreshTile(i);
    w.dirty.clear();
    this.rebuildRoadList();

    this.overlayG = this.add.graphics().setDepth(9000);
    this.previewG = this.add.graphics().setDepth(9500);
    this.ghost = this.add.image(0, 0, ...texArgs('park')).setScale(SCALE).setOrigin(0.5, 1).setAlpha(0.65).setVisible(false).setDepth(9600);

    this.dust = this.add.particles(0, 0, ATLAS_OF.smoke, {
      frame: 'smoke', speed: { min: 10, max: 40 }, scale: { start: 0.2, end: 0.7 }, alpha: { start: 0.6, end: 0 },
      lifespan: 700, tint: 0xd9c7a3, emitting: false,
    }).setDepth(9400);
    this.sparkles = this.add.particles(0, 0, ATLAS_OF.spark, {
      frame: 'spark', speed: { min: 20, max: 60 }, scale: { start: 1, end: 0 }, lifespan: 600, gravityY: 40,
      tint: [0xfff3b0, 0xffffff, 0xa7f3d0], emitting: false,
    }).setDepth(9400);
    this.fireworks = this.add.particles(0, 0, ATLAS_OF.spark, {
      frame: 'spark', speed: { min: 60, max: 180 }, scale: { start: 1.6, end: 0 }, lifespan: 1400, gravityY: 60,
      tint: [0xff5a5f, 0xffd23f, 0x3ec1d3, 0xa78bfa, 0x34d399], blendMode: 'ADD', emitting: false,
    }).setDepth(30001);

    this.makeClouds();
    this.setupCamera();
    this.setupInput();
    this.applyAmbient(true);

    this.time.addEvent({ delay: 550, loop: true, callback: () => this.animateWater() });
    this.time.addEvent({ delay: 700, loop: true, callback: () => this.refreshIcons() });

    const sim = this.sim;
    sim.on('changed', () => { if (this.overlay) this.drawOverlay(); });
    sim.on('day', () => { if (this.overlay && sim.day % 5 === 0) this.drawOverlay(); });
    sim.on('burned', (i) => {
      const [x, y] = w.xy(i);
      const [cx, cy] = toWorld(x + 0.5, y + 0.5);
      this.dust.explode(24, cx, cy - 6);
    });
    sim.on('milestone', () => this.celebrate());
    this.events.once('shutdown', () => this.input.keyboard.removeAllListeners());
  }

  // --- tiles ---------------------------------------------------------------
  isShallow(x, y) {
    const w = this.world;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (w.inBounds(nx, ny) && w.terrain[w.idx(nx, ny)] !== TERRAIN.WATER) return true;
      }
    }
    return false;
  }

  groundKey(i) {
    const w = this.world;
    const [x, y] = w.xy(i);
    const t = w.terrain[i], k = w.kind[i];
    if (k === KIND.ROAD) return (t === TERRAIN.WATER ? 'bridge_' : 'road_') + w.roadMask(x, y);
    if (t === TERRAIN.WATER) {
      const f = (this.waterFrame + w.variant[i]) % 3;
      if (!this.isShallow(x, y)) return `water_d_${f}`;
      let m = 0;
      for (const d of DIRS) {
        const nx = x + d.dx, ny = y + d.dy;
        if (w.inBounds(nx, ny) && w.terrain[w.idx(nx, ny)] !== TERRAIN.WATER) m |= d.bit;
      }
      return `water_s_${m}_${f}`;
    }
    if (k === KIND.ZONE && !w.level[i] && !w.build[i]) return `zone_${ZONE_KEYS[w.zone[i]]}`;
    if (k === KIND.BUILDING) return 'pave';
    if (t === TERRAIN.SAND) return 'sand';
    return `grass_${w.variant[i] % 4}`;
  }

  objectKey(i) {
    const w = this.world;
    const k = w.kind[i];
    if (k === KIND.ZONE && (w.level[i] || w.build[i])) {
      if (w.build[i]) return `cons_${w.level[i] >= 2 ? 1 : 0}`;
      const z = ZONE_KEYS[w.zone[i]] + w.level[i];
      return `${z}_${w.variant[i] % VARIANTS[z]}`;
    }
    if (k === KIND.BUILDING && w.root[i] === i) return bKey(w.btype[i]);
    if (k === KIND.EMPTY && w.trees[i]) return `trees_${w.trees[i]}`;
    return null;
  }

  refreshTile(i) {
    const w = this.world;
    const [x, y] = w.xy(i);
    setTex(this.ground[i], this.groundKey(i));

    const key = this.objectKey(i);
    const prev = this.objKey[i];
    if (key !== prev) {
      this.clearObj(i);
      if (key) {
        const s = w.kind[i] === KIND.BUILDING ? BUILDINGS[key].size : 1;
        const [bx, by] = toWorld(x + s, y + s);
        const d = depthOf(x, y, s);
        const img = this.add.image(bx, by, ...texArgs(key)).setOrigin(0.5, 1).setScale(SCALE).setDepth(d);
        img.setTint(this.ambientInt ?? 0xffffff);
        if (this.overlay) img.setAlpha(0.3);
        this.objs[i] = img;
        if (!key.startsWith('trees')) {
          this.lights[i] = this.add.image(bx, by, ...texArgs(key + '_n')).setOrigin(0.5, 1).setScale(SCALE)
            .setDepth(d + 0.5).setAlpha(this.night ?? 0);
          if (this.overlay) this.lights[i].setVisible(false);
          this.addExtras(i, key, img, d);
        }
        if (prev && prev.startsWith('cons') && !key.startsWith('cons')) {
          img.setScale(SCALE, SCALE * 0.7);
          this.tweens.add({ targets: img, scaleY: SCALE, duration: 420, ease: 'Back.easeOut' });
          this.sparkles.explode(10, bx, by - 20);
        }
      }
      this.objKey[i] = key;
    }

    // Burning
    if (w.fire[i] && !this.fires.has(i)) {
      const [cx, cy] = toWorld(x + 0.5, y + 0.5);
      const flame = this.add.particles(cx, cy - 6, ATLAS_OF.flame, {
        frame: 'flame', speedY: { min: -50, max: -20 }, speedX: { min: -8, max: 8 }, x: { min: -10, max: 10 },
        scale: { start: 1.1, end: 0.2 }, alpha: { start: 1, end: 0 }, lifespan: 700, frequency: 40, blendMode: 'ADD',
      }).setDepth(depthOf(x, y) + 1);
      const smoke = this.add.particles(cx, cy - 20, ATLAS_OF.smoke, {
        frame: 'smoke', speedY: { min: -40, max: -20 }, speedX: { min: 0, max: 14 }, scale: { start: 0.5, end: 1.8 },
        alpha: { start: 0.6, end: 0 }, lifespan: 2600, frequency: 140, tint: 0x3a3a3a,
      }).setDepth(20000);
      this.fires.set(i, [flame, smoke]);
    } else if (!w.fire[i] && this.fires.has(i)) {
      this.fires.get(i).forEach((o) => o.destroy());
      this.fires.delete(i);
    }

    // Street light glow at night
    const wantsGlow = w.kind[i] === KIND.ROAD && (x + y) % 2 === 0;
    if (wantsGlow && !this.glows.has(i)) {
      const [cx, cy] = toWorld(x + 0.5, y + 0.5);
      const g = this.add.image(cx, cy, ...texArgs('glow')).setScale(0.9, 0.5).setTint(0xffc46b)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(depthOf(x, y) - 1).setAlpha((this.night ?? 0) * 0.55);
      this.glows.set(i, g);
    } else if (!wantsGlow && this.glows.has(i)) {
      this.glows.get(i).destroy();
      this.glows.delete(i);
    }
  }

  clearObj(i) {
    if (this.objs[i]) { this.objs[i].destroy(); this.objs[i] = null; }
    if (this.lights[i]) { this.lights[i].destroy(); this.lights[i] = null; }
    if (this.extras.has(i)) { this.extras.get(i).forEach((o) => o.destroy()); this.extras.delete(i); }
  }

  addExtras(i, key, img, d) {
    const meta = META[key];
    if (!meta) return;
    const list = [];
    for (const [ox, oy] of meta.smoke || []) {
      const big = key === 'coal';
      list.push(this.add.particles(img.x + ox, img.y + oy, ATLAS_OF.smoke, {
        frame: 'smoke', speedY: { min: -24, max: -12 }, speedX: { min: 4, max: 12 },
        scale: { start: big ? 0.5 : 0.25, end: big ? 2.2 : 1.1 }, alpha: { start: big ? 0.7 : 0.5, end: 0 },
        lifespan: big ? 4200 : 3000, frequency: big ? 160 : 300, rotate: { min: 0, max: 360 },
      }).setDepth(20000));
    }
    if (meta.hub) {
      const [ox, oy] = meta.hub;
      const blades = this.add.image(img.x + ox, img.y + oy, ...texArgs('wind_blades')).setScale(SCALE * 1.1, SCALE * 1.05)
        .setDepth(d + 0.6).setRotation(Math.random() * 6);
      blades.spin = 1.6 + Math.random() * 0.8;
      blades.setTint(this.ambientInt ?? 0xffffff);
      list.push(blades);
    }
    if (meta.fountain) {
      const [ox, oy] = meta.fountain;
      list.push(this.add.particles(img.x + ox, img.y + oy, ATLAS_OF.drop, {
        frame: 'drop', speedY: { min: -50, max: -35 }, speedX: { min: -12, max: 12 }, gravityY: 110,
        lifespan: 800, frequency: 30, scale: { start: 1, end: 0.5 }, alpha: { start: 0.9, end: 0.2 },
      }).setDepth(d + 0.7));
    }
    if (list.length) this.extras.set(i, list);
  }

  rebuildRoadList() {
    const w = this.world;
    this.roadTiles = [];
    for (let i = 0; i < w.n; i++) if (w.kind[i] === KIND.ROAD) this.roadTiles.push(i);
  }

  animateWater() {
    const w = this.world;
    this.waterFrame = (this.waterFrame + 1) % 3;
    for (let i = 0; i < w.n; i++) {
      if (w.terrain[i] === TERRAIN.WATER && w.kind[i] !== KIND.ROAD) setTex(this.ground[i], this.groundKey(i));
    }
  }

  refreshIcons() {
    const w = this.world;
    const want = new Set();
    const showRoad = this.tool.type === 'zone' || this.tool.type === 'road';
    for (let i = 0; i < w.n; i++) {
      if (w.kind[i] !== KIND.ZONE) continue;
      if (w.level[i] && !w.build[i] && !w.power[i]) want.add(i);
      else if (showRoad && !w.level[i] && !w.access[i]) want.add(-i - 1);
    }
    for (const [k, icon] of this.icons) if (!want.has(k)) { icon.destroy(); this.icons.delete(k); }
    for (const k of want) {
      if (this.icons.has(k)) continue;
      const i = k >= 0 ? k : -k - 1;
      const [x, y] = w.xy(i);
      const [cx, cy] = toWorld(x + 0.5, y + 0.5);
      const lift = k >= 0 ? 30 + w.level[i] * 16 : 10;
      const icon = this.add.image(cx, cy - lift, ...texArgs(k >= 0 ? 'icon_power' : 'icon_road')).setScale(SCALE * (k >= 0 ? 1.2 : 0.9)).setDepth(9300);
      this.tweens.add({ targets: icon, y: cy - lift - 4, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.inOut' });
      this.icons.set(k, icon);
    }
  }

  // --- ambient / day-night ---------------------------------------------------
  applyAmbient(force = false) {
    const { color, night } = ambientAt(this.cycle ? this.tod : 0.5);
    const key = Math.round(color[0] * 60) * 10000 + Math.round(color[1] * 60) * 100 + Math.round(night * 60);
    if (!force && key === this.ambientKey) return;
    this.ambientKey = key;
    const c = rgbInt(color);
    this.ambientInt = c;
    this.night = night;
    const w = this.world;
    for (let i = 0; i < w.n; i++) {
      this.ground[i].setTint(c);
      if (this.objs[i]) this.objs[i].setTint(c);
      if (this.lights[i]) this.lights[i].setAlpha(night);
    }
    for (const list of this.extras.values()) for (const o of list) if (o.spin) o.setTint(c);
    for (const g of this.glows.values()) g.setAlpha(night * 0.55);
    const carTint = rgbInt(color.map((v) => v + (1 - v) * 0.35));
    for (const car of this.cars) { car.img.setTint(carTint); car.light.setAlpha(night); }
    this.carTint = carTint;
    const ocean = [0x2a / 255, 0x6d / 255, 0x96 / 255].map((v, k) => v * color[k]);
    this.cameras.main.setBackgroundColor(rgbInt(ocean));
    for (const cl of this.clouds || []) cl.img.setTint(c);
    this.drawSkirt(color);
    this.events.emit('ambient', { tod: this.tod, night });
  }

  drawSkirt(color) {
    const w = this.world;
    const g = this.skirt;
    g.clear();
    const tint = (hex) => {
      const r = ((hex >> 16) & 255) * color[0], gg = ((hex >> 8) & 255) * color[1], b = (hex & 255) * color[2];
      return (r << 16) | (gg << 8) | b;
    };
    const D = 46;
    const face = (x0, y0, x1, y1, i, light) => {
      const water = w.terrain[i] === TERRAIN.WATER;
      const top = water ? 0x2f86bb : 0x6fa64c;
      const mid = water ? 0x1f5f8a : 0x8a6a48;
      const bot = water ? 0x174a6c : 0x5d4630;
      const f = light ? 1 : 0.8;
      const sh = (h) => tint(((((h >> 16) & 255) * f) << 16) | ((((h >> 8) & 255) * f) << 8) | ((h & 255) * f));
      g.fillStyle(sh(top), 1);
      g.fillPoints([{ x: x0, y: y0 }, { x: x1, y: y1 }, { x: x1, y: y1 + 5 }, { x: x0, y: y0 + 5 }], true);
      g.fillStyle(sh(mid), 1);
      g.fillPoints([{ x: x0, y: y0 + 5 }, { x: x1, y: y1 + 5 }, { x: x1, y: y1 + D * 0.55 }, { x: x0, y: y0 + D * 0.55 }], true);
      g.fillStyle(sh(bot), 1);
      g.fillPoints([{ x: x0, y: y0 + D * 0.55 }, { x: x1, y: y1 + D * 0.55 }, { x: x1, y: y1 + D }, { x: x0, y: y0 + D }], true);
    };
    for (let x = 0; x < w.w; x++) {
      const [x0, y0] = toWorld(x, w.h), [x1, y1] = toWorld(x + 1, w.h);
      face(x0, y0, x1, y1, w.idx(x, w.h - 1), true);
    }
    for (let y = 0; y < w.h; y++) {
      const [x0, y0] = toWorld(w.w, y), [x1, y1] = toWorld(w.w, y + 1);
      face(x0, y0, x1, y1, w.idx(w.w - 1, y), false);
    }
  }

  // --- clouds ------------------------------------------------------------------
  makeClouds() {
    const w = this.world;
    const [minX] = toWorld(0, w.h), [maxX] = toWorld(w.w, 0);
    const [, maxY] = toWorld(w.w, w.h);
    this.cloudBounds = { minX: minX - 400, maxX: maxX + 400, maxY };
    this.clouds = [];
    for (let k = 0; k < 9; k++) {
      const x = Phaser.Math.Between(minX, maxX), y = Phaser.Math.Between(0, maxY);
      const s = 0.9 + Math.random() * 1.2;
      const img = this.add.image(x, y, ...texArgs(`cloud_${k % 3}`)).setScale(s * SCALE * 2).setDepth(30000).setAlpha(0.8);
      const shadow = this.add.image(x + 160, y + 260, ...texArgs(`cloud_${k % 3}`)).setScale(s * SCALE * 2, s * SCALE * 1.2)
        .setDepth(8999).setTint(0x000000).setAlpha(0.08);
      this.clouds.push({ img, shadow, speed: 6 + Math.random() * 8 });
    }
  }

  updateClouds(dt) {
    const z = this.cameras.main.zoom / this.dpr;
    const a = Phaser.Math.Clamp((0.95 - z) * 1.6, 0, 0.85);
    for (const c of this.clouds) {
      c.img.x += c.speed * dt;
      c.shadow.x += c.speed * dt;
      if (c.img.x > this.cloudBounds.maxX) { c.img.x = this.cloudBounds.minX; c.shadow.x = c.img.x + 160; }
      c.img.setAlpha(a);
      c.shadow.setAlpha(this.overlay ? 0 : 0.07 * (1 - (this.night || 0)));
    }
  }

  // --- cars --------------------------------------------------------------------
  targetCars() {
    const s = this.sim.stats;
    return Math.floor(Math.min(this.roadTiles.length * 0.4, 6 + s.pop / 14 + (s.jobsC + s.jobsI) / 30, 260));
  }

  spawnCar() {
    const w = this.world;
    if (!this.roadTiles.length) return;
    const i = this.roadTiles[Math.floor(Math.random() * this.roadTiles.length)];
    const [x, y] = w.xy(i);
    const opts = DIRS.filter((d) => w.isRoad(x + d.dx, y + d.dy));
    if (!opts.length) return;
    const d = opts[Math.floor(Math.random() * opts.length)];
    const variant = Math.random() < 0.08 ? CAR_COLORS.length + (Math.random() < 0.5 ? 0 : 1) : Math.floor(Math.random() * CAR_COLORS.length);
    const img = this.add.image(0, 0, ...texArgs(`car_${variant}`)).setScale(SCALE).setOrigin(0.5, 30 / 46).setTint(this.carTint ?? 0xffffff);
    const light = this.add.image(0, 0, ...texArgs('carlight_f')).setScale(SCALE).setOrigin(0.5, 30 / 46).setAlpha(this.night ?? 0);
    if (this.overlay) { img.setVisible(false); light.setVisible(false); }
    const car = { img, light, x, y, dx: d.dx, dy: d.dy, t: Math.random(), speed: 0.9 + Math.random() * 0.6 };
    img.setAlpha(0);
    this.tweens.add({ targets: img, alpha: 1, duration: 400 });
    this.orientCar(car);
    this.cars.push(car);
  }

  orientCar(car) {
    const alongV = car.dy !== 0;
    const fwd = alongV ? car.dy > 0 : car.dx > 0;
    car.img.setFlipX(alongV);
    setTex(car.light, fwd ? 'carlight_f' : 'carlight_b');
    car.light.setFlipX(alongV);
  }

  updateCars(dt) {
    const w = this.world;
    const target = this.targetCars();
    if (this.cars.length < target && Math.random() < 0.3) this.spawnCar();
    const moving = this.sim.speed > 0;
    const sp = moving ? [0, 1, 1.6, 2.4][this.sim.speed] : 0;
    for (let k = this.cars.length - 1; k >= 0; k--) {
      const c = this.cars[k];
      const here = w.isRoad(c.x, c.y), next = w.isRoad(c.x + c.dx, c.y + c.dy);
      if (!here || (this.cars.length > target + 4 && Math.random() < 0.01)) {
        c.img.destroy(); c.light.destroy(); this.cars.splice(k, 1); continue;
      }
      c.t += dt * c.speed * sp;
      if (c.t >= 1 || !next) {
        if (next) { c.x += c.dx; c.y += c.dy; }
        c.t = next ? c.t - 1 : 0;
        const opts = DIRS.filter((d) => w.isRoad(c.x + d.dx, c.y + d.dy) && !(d.dx === -c.dx && d.dy === -c.dy));
        let d;
        if (opts.length) {
          const straight = opts.find((o) => o.dx === c.dx && o.dy === c.dy);
          d = straight && Math.random() < 0.6 ? straight : opts[Math.floor(Math.random() * opts.length)];
        } else d = { dx: -c.dx, dy: -c.dy }; // U-turn at dead end
        c.dx = d.dx; c.dy = d.dy;
        this.orientCar(c);
      }
      const fx = c.x + 0.5 + c.dx * (c.t - 0.5) + -c.dy * 0.14;
      const fy = c.y + 0.5 + c.dy * (c.t - 0.5) + c.dx * 0.14;
      const [px, py] = toWorld(fx, fy);
      c.img.setPosition(px, py);
      c.light.setPosition(px, py);
      const depth = 100 + (fx + fy - 1) * 4 + 1.5;
      c.img.setDepth(depth);
      c.light.setDepth(depth + 0.1);
    }
  }

  // --- overlays ----------------------------------------------------------------
  setOverlay(mode) {
    this.overlay = mode;
    const a = mode ? 0.28 : 1;
    for (let i = 0; i < this.world.n; i++) {
      if (this.objs[i]) this.objs[i].setAlpha(a);
      if (this.lights[i]) this.lights[i].setVisible(!mode);
    }
    for (const c of this.cars) { c.img.setVisible(!mode); c.light.setVisible(!mode); }
    this.drawOverlay();
  }

  drawOverlay() {
    const g = this.overlayG;
    g.clear();
    if (!this.overlay) return;
    const w = this.world;
    const ov = OVERLAYS[this.overlay];
    for (let i = 0; i < w.n; i++) {
      const v = ov.fn(w, i);
      if (v === null || v === undefined) continue;
      const color = ov.colors ? ov.colors[v > 0.5 ? 1 : 0] : heat(v);
      const [x, y] = w.xy(i);
      const p = [toWorld(x, y), toWorld(x + 1, y), toWorld(x + 1, y + 1), toWorld(x, y + 1)];
      g.fillStyle(color, 0.55);
      g.fillPoints(p.map(([a, b]) => ({ x: a, y: b })), true);
    }
  }

  // --- camera & input ------------------------------------------------------------
  setupCamera() {
    const w = this.world;
    const cam = this.cameras.main;
    const [cx, cy] = toWorld(w.w / 2, w.h / 2);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    cam.centerOn(cx, cy);
    cam.setZoom(0.85 * this.dpr);
    this.zoomTarget = 0.85 * this.dpr;
    const [minX] = toWorld(0, w.h), [maxX] = toWorld(w.w, 0);
    const [, maxY] = toWorld(w.w, w.h);
    cam.setBounds(minX - 600, -600, maxX - minX + 1200, maxY + 1200);
  }

  setupInput() {
    const input = this.input;
    input.mouse?.disableContextMenu();
    this.keys = input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,Q,E');
    this.drag = null;
    this.pan = null;

    input.on('pointerdown', (p) => {
      if (p.rightButtonDown() || p.middleButtonDown() || this.keys.SPACE.isDown || this.tool.type === 'inspect') {
        this.pan = { x: p.x, y: p.y, sx: this.cameras.main.scrollX, sy: this.cameras.main.scrollY, moved: 0 };
        return;
      }
      const t = this.pointerTile(p);
      this.drag = { a: t, b: t };
      this.updatePreview(p);
    });
    input.on('pointermove', (p) => {
      if (this.pan) {
        const cam = this.cameras.main;
        cam.scrollX = this.pan.sx - (p.x - this.pan.x) / cam.zoom;
        cam.scrollY = this.pan.sy - (p.y - this.pan.y) / cam.zoom;
        this.pan.moved = Math.max(this.pan.moved, Math.abs(p.x - this.pan.x) + Math.abs(p.y - this.pan.y));
      }
      if (this.drag) this.drag.b = this.pointerTile(p);
      this.updatePreview(p);
    });
    input.on('pointerup', (p) => {
      if (this.pan) {
        if (this.pan.moved < 6 && this.tool.type === 'inspect' && p.leftButtonReleased()) {
          const [x, y] = this.pointerTile(p);
          this.events.emit('inspect', this.sim.inspect(x, y));
          this.flashTile(x, y);
        }
        this.pan = null;
        return;
      }
      if (this.drag) {
        const cells = this.cellsFor(this.drag.a, this.drag.b);
        const res = this.sim.applyTool(this.tool, cells);
        if (res.count) {
          this.events.emit('applied', { tool: this.tool, ...res });
          for (const [x, y] of cells.slice(0, 40)) {
            const [cx, cy] = toWorld(x + 0.5, y + 0.5);
            this.dust.explode(this.tool.type === 'bulldoze' ? 6 : 2, cx, cy);
          }
        } else this.events.emit('failed', this.tool);
        this.drag = null;
        this.updatePreview(p);
      }
    });
    input.on('wheel', (p, objs, dx, dy) => {
      this.zoomTarget = Phaser.Math.Clamp(this.zoomTarget * (dy > 0 ? 0.88 : 1.13), 0.3 * this.dpr, 3 * this.dpr);
      this.zoomAnchor = { x: p.x, y: p.y };
    });
    input.on('gameout', () => { this.previewG.clear(); this.ghost.setVisible(false); this.events.emit('preview', null); });
  }

  pointerTile(p) {
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    return toTile(wp.x, wp.y);
  }

  setTool(tool) {
    this.tool = tool;
    this.drag = null;
    this.previewG.clear();
    this.ghost.setVisible(false);
    this.refreshIcons();
    const p = this.input.activePointer;
    if (p) this.updatePreview(p);
  }

  cellsFor(a, b) {
    const t = this.tool;
    if (t.type === 'building') {
      const s = BUILDINGS[t.key].size;
      const off = Math.floor((s - 1) / 2);
      return [[b[0] - off, b[1] - off]];
    }
    const cells = [];
    if (t.type === 'road') {
      const [ax, ay] = a, [bx, by] = b;
      if (Math.abs(bx - ax) >= Math.abs(by - ay)) {
        for (let x = ax; x !== bx + Math.sign(bx - ax || 1); x += Math.sign(bx - ax || 1)) cells.push([x, ay]);
        for (let y = ay + Math.sign(by - ay); by !== ay && y !== by + Math.sign(by - ay); y += Math.sign(by - ay)) cells.push([bx, y]);
      } else {
        for (let y = ay; y !== by + Math.sign(by - ay || 1); y += Math.sign(by - ay || 1)) cells.push([ax, y]);
        for (let x = ax + Math.sign(bx - ax); bx !== ax && x !== bx + Math.sign(bx - ax); x += Math.sign(bx - ax)) cells.push([x, by]);
      }
      return cells;
    }
    const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
    const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.push([x, y]);
    return cells;
  }

  diamond(g, x, y, s = 1) {
    const p = [toWorld(x, y), toWorld(x + s, y), toWorld(x + s, y + s), toWorld(x, y + s)].map(([a, b]) => ({ x: a, y: b }));
    return p;
  }

  updatePreview(p) {
    const g = this.previewG;
    g.clear();
    this.ghost.setVisible(false);
    if (this.pan && this.pan.moved > 6) { this.events.emit('preview', null); return; }
    const w = this.world;
    const tile = this.pointerTile(p);
    const t = this.tool;
    if (t.type === 'inspect') {
      if (w.inBounds(...tile)) {
        g.lineStyle(2, 0xffffff, 0.8);
        g.strokePoints(this.diamond(g, ...tile), true);
      }
      this.events.emit('preview', null);
      return;
    }
    const cells = this.cellsFor(this.drag ? this.drag.a : tile, this.drag ? this.drag.b : tile);
    const cost = this.sim.toolCost(t, cells);
    const affordable = cost.cost <= this.sim.money;
    if (t.type === 'building') {
      const [x, y] = cells[0];
      const s = BUILDINGS[t.key].size;
      const ok = cost.count > 0 && affordable && this.sim.isUnlocked(t.key);
      const [bx, by] = toWorld(x + s, y + s);
      setTex(this.ghost, t.key);
      this.ghost.setPosition(bx, by).setVisible(true).setTint(ok ? 0xc8ffd8 : 0xff8080);
      g.fillStyle(ok ? 0x4ade80 : 0xef4444, 0.35);
      g.fillPoints(this.diamond(g, x, y, s), true);
      const r = BUILDINGS[t.key].radius;
      if (r && ok) {
        const [cx, cy] = toWorld(x + s / 2, y + s / 2);
        g.lineStyle(2, 0xffffff, 0.5);
        g.strokeEllipse(cx, cy, r * TW * Math.SQRT2, r * TH * Math.SQRT2);
      }
    } else {
      const color = t.type === 'bulldoze' ? 0xf87171 : t.type === 'zone' ? [0, 0x43c463, 0x3d9bf0, 0xf0b429][t.zone] : 0xe5e7eb;
      for (const [x, y] of cells) {
        if (!w.inBounds(x, y)) continue;
        const ok = this.sim.toolCost(t, [[x, y]]).count > 0;
        g.fillStyle(ok ? color : 0x6b7280, ok ? 0.45 : 0.2);
        g.fillPoints(this.diamond(g, x, y), true);
      }
      g.lineStyle(1.5, 0xffffff, 0.7);
      if (cells.length === 1) g.strokePoints(this.diamond(g, ...cells[0]), true);
    }
    this.events.emit('preview', { cost: cost.cost, count: cost.count, affordable, x: p.x / this.dpr, y: p.y / this.dpr, cells: cells.length, tool: t });
  }

  flashTile(x, y) {
    const w = this.world;
    if (!w.inBounds(x, y)) return;
    let i = w.idx(x, y);
    if (w.kind[i] === KIND.BUILDING) i = w.root[i];
    const o = this.objs[i];
    if (o) this.tweens.add({ targets: o, scaleY: SCALE * 1.06, yoyo: true, duration: 120 });
  }

  focusTile(x, y) {
    const [cx, cy] = toWorld(x + 0.5, y + 0.5);
    this.cameras.main.pan(cx, cy, 600, 'Sine.easeInOut');
  }

  celebrate() {
    const cam = this.cameras.main;
    const v = cam.worldView;
    for (let k = 0; k < 8; k++) {
      this.time.delayedCall(k * 260, () => {
        this.fireworks.explode(40, v.x + v.width * (0.2 + Math.random() * 0.6), v.y + v.height * (0.15 + Math.random() * 0.35));
      });
    }
  }

  // --- loop ----------------------------------------------------------------------
  update(time, deltaMs) {
    const dt = Math.min(deltaMs / 1000, 0.1);
    this.sim.advance(dt);

    const w = this.world;
    if (w.dirty.size) {
      let roads = false;
      for (const i of w.dirty) {
        if (w.kind[i] === KIND.ROAD || this.glows.has(i)) roads = true;
        this.refreshTile(i);
      }
      w.dirty.clear();
      if (roads) this.rebuildRoadList();
    }

    if (this.cycle) this.tod = (this.tod + dt / DAY_LENGTH) % 1;
    if (this.hud && !this.hud.started) this.cameras.main.scrollX += 14 * dt; // attract mode drift
    this.applyAmbient();

    // camera keys + smooth zoom
    const cam = this.cameras.main;
    const k = this.keys;
    const spd = (700 * dt) / cam.zoom;
    if (k.A.isDown || k.LEFT.isDown) cam.scrollX -= spd;
    if (k.D.isDown || k.RIGHT.isDown) cam.scrollX += spd;
    if (k.W.isDown || k.UP.isDown) cam.scrollY -= spd;
    if (k.S.isDown || k.DOWN.isDown) cam.scrollY += spd;
    if (Math.abs(cam.zoom - this.zoomTarget) > 0.001) {
      const a = this.zoomAnchor || { x: cam.width / 2, y: cam.height / 2 };
      const before = cam.getWorldPoint(a.x, a.y);
      const z = cam.zoom + (this.zoomTarget - cam.zoom) * Math.min(1, dt * 12);
      cam.setZoom(z);
      cam.preRender();
      const after = cam.getWorldPoint(a.x, a.y);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    }

    for (const list of this.extras.values()) for (const o of list) if (o.spin) o.rotation += o.spin * dt;
    this.updateCars(dt);
    this.updateClouds(dt);
    this.updateSoundscape(dt);
  }

  // Feed the soundscape with whatever sits at the centre of the screen.
  updateSoundscape(dt) {
    this.soundT = (this.soundT || 0) + dt;
    if (this.soundT < 0.2 || !audio.ctx) return;
    const step = this.soundT;
    this.soundT = 0;
    const cam = this.cameras.main;
    const v = cam.worldView;
    const a = v.centerX / (TW / 2), b = v.centerY / (TH / 2);
    const cx = (b + a) / 2, cy = (b - a) / 2;
    const radius = Phaser.Math.Clamp((v.width / TW) * 0.5, 4, 36);
    const cars = this.cars.map((c) => ({ x: c.x + c.dx * c.t, y: c.y + c.dy * c.t }));
    this.soundState = soundMix(this.world, cx, cy, radius, cars);
    audio.updateScape(this.soundState, this.night ?? 0, cam.zoom / this.dpr, step);
  }
}
