// Procedural texture factory: every piece of art in Skyhaven is drawn here at boot.
import { TW, TH, RES } from '../config.js';
import { mulberry32 } from '../sim/noise.js';
import {
  projector, poly, quad, ground, box, windowsLeft, windowsRight, cylinder, blob, tree, bush,
  shade, mix, rgba, grad,
} from './draw.js';

export const META = {}; // per-texture metadata: { smoke: [[dx,dy]], hub: [dx,dy] } relative to sprite origin
export const VARIANTS = { R1: 6, R2: 5, R3: 4, C1: 5, C2: 4, C3: 3, I1: 3, I2: 3, I3: 2 };
export const CAR_COLORS = ['#d94b3d', '#f2f2ef', '#2f3b4c', '#3f7fd1', '#e8b640', '#9aa3ad', '#5c9e6e', '#1d1f23', '#c2c7cc', '#8e3b5f'];

const WALLS = ['#f3eee4', '#e8dcc6', '#dfe6ea', '#f0dccb', '#e6e1ef', '#d9e4d4', '#f4e7c8'];
const ROOFS = ['#b4553c', '#8a4b38', '#5b6672', '#3f5e7f', '#9b6b45', '#6d3f3a', '#4c5a48'];
const BRICK = ['#b5583f', '#a3523d', '#c3734e', '#8e4a3a', '#c9a27c', '#9fb0bf', '#d6c3a5'];
const GLASS = ['#5d8db5', '#4a7aa0', '#6aa3b8', '#3f6b8f', '#7aa6c2', '#4f8a8a'];
const WIN = '#3e5468';

let scene;
function hashStr(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];

// All canvases are collected then packed into atlas textures (few draw calls).
let pending = [];
export const ATLAS_OF = {};
function canvasTex(key, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * RES);
  canvas.height = Math.ceil(h * RES);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  ctx.lineJoin = 'round';
  pending.push({ key, canvas });
  return { tex: { refresh() {} }, ctx };
}

function packAtlases() {
  const MAX = 4096, PAD = 2;
  pending.sort((a, b) => b.canvas.height - a.canvas.height);
  const sheets = [];
  let cur = null;
  for (const item of pending) {
    const { width: w, height: h } = item.canvas;
    if (!cur) { cur = { items: [], x: 0, y: 0, rowH: 0 }; sheets.push(cur); }
    if (cur.x + w > MAX) { cur.x = 0; cur.y += cur.rowH + PAD; cur.rowH = 0; }
    if (cur.y + h > MAX) { cur = { items: [], x: 0, y: 0, rowH: 0 }; sheets.push(cur); }
    cur.items.push({ ...item, x: cur.x, y: cur.y });
    cur.x += w + PAD;
    cur.rowH = Math.max(cur.rowH, h);
  }
  sheets.forEach((sheet, n) => {
    const key = `atlas${n}`;
    const height = sheet.y + sheet.rowH;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const tex = scene.textures.createCanvas(key, MAX, height);
    const ctx = tex.getContext();
    for (const it of sheet.items) {
      ctx.drawImage(it.canvas, it.x, it.y);
      tex.add(it.key, 0, it.x, it.y, it.canvas.width, it.canvas.height);
      ATLAS_OF[it.key] = key;
    }
    tex.refresh();
  });
  pending = [];
  return sheets.length;
}

// Point an image/sprite at a generated frame.
export function setTex(obj, key) {
  obj.setTexture(ATLAS_OF[key], key);
  return obj;
}
export const texArgs = (key) => [ATLAS_OF[key], key];

// Create a building texture (and its night-light twin `${key}_n`).
function building(key, s, H, fn) {
  const P = projector(s, H);
  const rand = mulberry32(hashStr(key));
  const a = canvasTex(key, P.W, P.H);
  const b = canvasTex(key + '_n', P.W, P.H);
  const meta = { smoke: [], s };
  const toOrigin = (u, v, z) => { const [x, y] = P(u, v, z); return [x - P.W / 2, y - P.H]; };
  fn(a.ctx, b.ctx, P, rand, meta, toOrigin);
  a.tex.refresh();
  b.tex.refresh();
  META[key] = meta;
}

// --- ground ---------------------------------------------------------------
const P1 = projector(1, 0);
function groundTex(key, fn) {
  const { tex, ctx } = canvasTex(key, TW + 2, TH + 2);
  ctx.translate(1, 1);
  fn(ctx, mulberry32(hashStr(key)));
  tex.refresh();
}
function diamond(ctx, fill) {
  quad(ctx, P1, [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], fill, fill, 1.4);
}
function speckle(ctx, rand, n, colors, size = 1) {
  for (let k = 0; k < n; k++) {
    const u = rand(), v = rand();
    const [x, y] = P1(u, v);
    ctx.fillStyle = pick(rand, colors);
    ctx.fillRect(x, y, size * (0.6 + rand()), size * 0.6);
  }
}

function makeGround() {
  const grassBase = ['#79b456', '#78b355', '#7ab557', '#78b456'];
  for (let k = 0; k < 4; k++) {
    groundTex(`grass_${k}`, (ctx, rand) => {
      diamond(ctx, grad(ctx, P1(0, 0), P1(1, 1), [[0, shade(grassBase[k], 1.02)], [1, shade(grassBase[k], 0.985)]]));
      speckle(ctx, rand, 70, ['#6aa149', '#88c264', '#659b45', '#8fc76b']);
      if (k === 1) speckle(ctx, rand, 6, ['#f5f1c9', '#f0d34a', '#ffffff'], 1.2);
      if (k === 3) speckle(ctx, rand, 5, ['#e98bb0', '#f5f1c9'], 1.2);
    });
  }
  groundTex('sand', (ctx, rand) => {
    diamond(ctx, grad(ctx, P1(0, 0), P1(1, 1), [[0, '#efdfb0'], [1, '#e3cf98']]));
    speckle(ctx, rand, 50, ['#d8c38c', '#f6ead0', '#cdb57c']);
  });
  groundTex('pave', (ctx, rand) => {
    diamond(ctx, '#c9c5bb');
    speckle(ctx, rand, 30, ['#bdb9af', '#d3cfc6']);
  });
  // Animated water: deep and shallow, 3 frames each.
  const shoreEdges = [
    [1, [[0.88, 0], [1, 0], [1, 1], [0.88, 1]], (t) => [[t, 0.05], [t, 0.95]]],
    [2, [[0, 0.88], [1, 0.88], [1, 1], [0, 1]], (t) => [[0.05, t], [0.95, t]]],
    [4, [[0, 0], [0.12, 0], [0.12, 1], [0, 1]], (t) => [[1 - t, 0.05], [1 - t, 0.95]]],
    [8, [[0, 0], [1, 0], [1, 0.12], [0, 0.12]], (t) => [[0.05, 1 - t], [0.95, 1 - t]]],
  ];
  for (const [kind, c0, c1, foam] of [['d', '#2c7bb5', '#3a8cc6', 0.22], ['s', '#46aec4', '#5cc0cf', 0.35]]) {
    for (let f = 0; f < 3; f++) for (let mask = 0; mask < (kind === 's' ? 16 : 1); mask++) {
      groundTex(kind === 's' ? `water_s_${mask}_${f}` : `water_d_${f}`, (ctx) => {
        const rand = mulberry32(77 + (kind === 'd' ? 0 : 5));
        diamond(ctx, grad(ctx, P1(0, 0), P1(1, 1), [[0, c1], [1, c0]]));
        ctx.strokeStyle = `rgba(255,255,255,${foam})`;
        ctx.lineWidth = 0.8;
        for (let k = 0; k < 5; k++) {
          const u = (rand() + f * 0.11) % 1, v = (rand() + f * 0.07) % 1;
          if (u < 0.1 || v < 0.1 || u > 0.85 || v > 0.85) continue;
          const [x, y] = P1(u, v);
          ctx.beginPath();
          ctx.moveTo(x - 4, y);
          ctx.quadraticCurveTo(x, y - 1.6, x + 4, y);
          ctx.stroke();
        }
        for (const [bit, rim, line] of shoreEdges) {
          if (!(mask & bit)) continue;
          quad(ctx, P1, rim.map(([u, v]) => [u, v, 0]), 'rgba(233,217,166,0.95)');
          const t = 0.8 - f * 0.025;
          const [a, b] = line(t);
          ctx.strokeStyle = `rgba(255,255,255,${0.75 - f * 0.15})`;
          ctx.lineWidth = 1.3;
          ctx.beginPath(); ctx.moveTo(...P1(a[0], a[1])); ctx.lineTo(...P1(b[0], b[1])); ctx.stroke();
        }
      });
    }
  }
  // Zoned lots.
  const zc = { R: '#43c463', C: '#3d9bf0', I: '#f0b429' };
  for (const [z, c] of Object.entries(zc)) {
    groundTex(`zone_${z}`, (ctx, rand) => {
      diamond(ctx, '#7ab457');
      speckle(ctx, rand, 50, ['#6aa149', '#88c264']);
      quad(ctx, P1, [[0.08, 0.08, 0], [0.92, 0.08, 0], [0.92, 0.92, 0], [0.08, 0.92, 0]], rgba(c, 0.28));
      ctx.setLineDash([3, 2]);
      quad(ctx, P1, [[0.08, 0.08, 0], [0.92, 0.08, 0], [0.92, 0.92, 0], [0.08, 0.92, 0]], null, rgba(c, 0.95), 1);
      ctx.setLineDash([]);
    });
  }
}

// --- roads ----------------------------------------------------------------
function roadShape(ctx, mask, inner, color, z = 0) {
  const a = 0.5 - inner, b = 0.5 + inner;
  ground(ctx, P1, a, a, b, b, color, z);
  if (mask & 1) ground(ctx, P1, b - 0.01, a, 1, b, color, z);
  if (mask & 4) ground(ctx, P1, 0, a, a + 0.01, b, color, z);
  if (mask & 2) ground(ctx, P1, a, b - 0.01, b, 1, color, z);
  if (mask & 8) ground(ctx, P1, a, 0, b, a + 0.01, color, z);
}

function drawRoad(ctx, rand, mask, bridge) {
  const count = [1, 2, 4, 8].filter((b) => mask & b).length;
  if (bridge) {
    // deck shadow on water then deck
    ctx.save();
    ctx.translate(2, 3);
    roadShape(ctx, mask, 0.4, 'rgba(0,30,50,0.35)');
    ctx.restore();
    roadShape(ctx, mask, 0.4, '#b9b4aa');
  } else {
    roadShape(ctx, mask, 0.42, '#cfcac1');
    // sidewalk paving joints
    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
  }
  roadShape(ctx, mask, 0.3, '#4c4f55');
  // asphalt texture
  for (let k = 0; k < 40; k++) {
    const u = 0.2 + rand() * 0.6, v = 0.2 + rand() * 0.6;
    const [x, y] = P1(u, v);
    ctx.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(x, y, 1.2, 0.7);
  }
  const line = (pts, color, w, dash) => {
    ctx.beginPath();
    ctx.setLineDash(dash || []);
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    const p0 = P1(...pts[0]), p1 = P1(...pts[1]);
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  if (count <= 2) {
    // lane lines
    const ends = [];
    if (mask & 1) ends.push([1, 0.5, 0]);
    if (mask & 4) ends.push([0, 0.5, 0]);
    if (mask & 2) ends.push([0.5, 1, 0]);
    if (mask & 8) ends.push([0.5, 0, 0]);
    for (const e of ends) line([[0.5, 0.5, 0], e], '#f1d36b', 0.9, [3, 2.5]);
  } else {
    // crosswalks at each arm
    const stripes = (u0, v0, du, dv, alongU) => {
      for (let k = 0; k < 5; k++) {
        const t = -0.24 + k * 0.12;
        const a = alongU ? [u0, 0.5 + t, 0] : [0.5 + t, v0, 0];
        const b = alongU ? [u0 + du, 0.5 + t, 0] : [0.5 + t, v0 + dv, 0];
        line([a, b], 'rgba(240,240,235,0.85)', 1.6);
      }
    };
    if (mask & 1) stripes(0.82, 0, 0.1, 0, true);
    if (mask & 4) stripes(0.08, 0, 0.1, 0, true);
    if (mask & 2) stripes(0, 0.82, 0, 0.1, false);
    if (mask & 8) stripes(0, 0.08, 0, 0.1, false);
  }
  if (bridge) {
    // railings
    const rail = (pts) => line(pts, '#e9e5dc', 1.1);
    if (mask & 5 && !(mask & 10)) { rail([[0, 0.12, 0], [1, 0.12, 0]]); rail([[0, 0.88, 0], [1, 0.88, 0]]); }
    if (mask & 10 && !(mask & 5)) { rail([[0.12, 0, 0], [0.12, 1, 0]]); rail([[0.88, 0, 0], [0.88, 1, 0]]); }
  }
}

function makeRoads() {
  for (let m = 0; m < 16; m++) {
    groundTex(`road_${m}`, (ctx, rand) => {
      diamond(ctx, '#7ab457');
      speckle(ctx, rand, 40, ['#6aa149', '#88c264']);
      drawRoad(ctx, rand, m, false);
    });
    groundTex(`bridge_${m}`, (ctx, rand) => {
      diamond(ctx, grad(ctx, P1(0, 0), P1(1, 1), [[0, '#3a8cc6'], [1, '#2c7bb5']]));
      drawRoad(ctx, rand, m, true);
    });
  }
}

// --- trees ----------------------------------------------------------------
function makeTrees() {
  const greens = ['#4f8f3a', '#5a9a3f', '#3f7f37', '#6a9f3c', '#477a35', '#5e8f2f'];
  for (let k = 1; k <= 6; k++) {
    building(`trees_${k}`, 1, 34, (ctx, l, P, rand) => {
      const n = 1 + Math.floor(rand() * 3);
      const spots = [];
      for (let t = 0; t < n; t++) spots.push([0.2 + rand() * 0.6, 0.2 + rand() * 0.6]);
      spots.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
      for (const [u, v] of spots) {
        const pine = k >= 5 ? rand() < 0.8 : rand() < 0.15;
        tree(ctx, P, u, v, { size: 0.8 + rand() * 0.45, color: pick(rand, greens), rand, type: pine ? 'pine' : 'round' });
      }
      if (rand() < 0.6) bush(ctx, P, 0.15 + rand() * 0.7, 0.75 + rand() * 0.2, '#5b9a3e', 0.8);
    });
  }
}

// --- roofs ----------------------------------------------------------------
function gable(ctx, P, u0, v0, u1, v1, zt, rise, color, wall, alongU) {
  const ridge = shade(color, 1.2);
  if (alongU) {
    const vm = (v0 + v1) / 2;
    quad(ctx, P, [[u0, v0, zt], [u1, v0, zt], [u1, vm, zt + rise], [u0, vm, zt + rise]], shade(color, 1.08));
    quad(ctx, P, [[u0, vm, zt + rise], [u1, vm, zt + rise], [u1, v1, zt], [u0, v1, zt]], shade(color, 0.85), rgba('#000', 0.15));
    quad(ctx, P, [[u1, v0, zt], [u1, v1, zt], [u1, vm, zt + rise]], shade(wall, 0.66), rgba('#000', 0.15));
    quad(ctx, P, [[u0, vm, zt + rise], [u1, vm, zt + rise]], null, ridge, 1);
    // roof tile lines
    for (let k = 1; k < 4; k++) {
      const t = k / 4;
      quad(ctx, P, [[u0, vm + (v1 - vm) * t, zt + rise * (1 - t)], [u1, vm + (v1 - vm) * t, zt + rise * (1 - t)]], null, rgba('#000', 0.12), 0.5);
    }
  } else {
    const um = (u0 + u1) / 2;
    quad(ctx, P, [[u0, v0, zt], [um, v0, zt + rise], [um, v1, zt + rise], [u0, v1, zt]], shade(color, 1.05));
    quad(ctx, P, [[um, v0, zt + rise], [u1, v0, zt], [u1, v1, zt], [um, v1, zt + rise]], shade(color, 0.76), rgba('#000', 0.15));
    quad(ctx, P, [[u0, v1, zt], [u1, v1, zt], [um, v1, zt + rise]], shade(wall, 0.88), rgba('#000', 0.15));
    quad(ctx, P, [[um, v0, zt + rise], [um, v1, zt + rise]], null, ridge, 1);
    for (let k = 1; k < 4; k++) {
      const t = k / 4;
      quad(ctx, P, [[um + (u1 - um) * t, v0, zt + rise * (1 - t)], [um + (u1 - um) * t, v1, zt + rise * (1 - t)]], null, rgba('#000', 0.12), 0.5);
    }
  }
}

function flatRoof(ctx, P, u0, v0, u1, v1, z, color, rand, opts = {}) {
  const inset = 0.035;
  quad(ctx, P, [[u0 + inset, v0 + inset, z], [u1 - inset, v0 + inset, z], [u1 - inset, v1 - inset, z], [u0 + inset, v1 - inset, z]], shade(color, 0.9));
  if (opts.units !== false) {
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const uu = u0 + 0.08 + rand() * (u1 - u0 - 0.25), vv = v0 + 0.08 + rand() * (v1 - v0 - 0.25);
      box(ctx, P, { u0: uu, v0: vv, u1: uu + 0.1, v1: vv + 0.08, z0: z, z1: z + 3, color: '#b9bec4' });
    }
  }
}

function lawn(ctx, P, s = 1, c = '#86c063') {
  ground(ctx, P, 0, 0, s, s, grad(ctx, P(0, 0), P(s, s), [[0, shade(c, 1.05)], [1, shade(c, 0.93)]]));
  const rand = mulberry32(s * 31 + c.length);
  for (let k = 0; k < 50 * s * s; k++) {
    const [x, y] = P(rand() * s, rand() * s);
    ctx.fillStyle = rand() < 0.5 ? rgba('#ffffff', 0.08) : rgba('#000000', 0.06);
    ctx.fillRect(x, y, 1, 0.6);
  }
}
function paved(ctx, P, s = 1, c = '#d2cec5') {
  ground(ctx, P, 0, 0, s, s, c);
  ctx.lineWidth = 0.4;
  for (let k = 1; k < 6 * s; k++) {
    const t = k / (6 * s) * s;
    quad(ctx, P, [[t, 0, 0], [t, s, 0]], null, rgba('#000', 0.05));
    quad(ctx, P, [[0, t, 0], [s, t, 0]], null, rgba('#000', 0.05));
  }
}

// --- zone buildings ---------------------------------------------------------
function makeResidential() {
  for (let k = 0; k < VARIANTS.R1; k++) {
    building(`R1_${k}`, 1, 36, (ctx, l, P, rand) => {
      lawn(ctx, P);
      const wall = pick(rand, WALLS), roof = pick(rand, ROOFS);
      const alongU = rand() < 0.5;
      // driveway & path
      ground(ctx, P, 0.74, 0.5, 0.88, 1, '#bdb8ad');
      ground(ctx, P, 0.42, 0.7, 0.5, 1, '#d8d2c4');
      if (rand() < 0.7) tree(ctx, P, 0.14, 0.18, { size: 0.75, color: '#4f8f3a', rand });
      const u0 = 0.2, v0 = 0.25, u1 = 0.7, v1 = 0.7, zt = 11 + Math.floor(rand() * 3);
      box(ctx, P, { u0, v0, u1, v1, z1: zt, color: wall, noTop: true });
      windowsLeft(ctx, l, P, { u0, u1, v: v1, z0: 0, z1: zt, cols: 3, rows: 1, color: WIN, rand, lit: 0.7, my: 0.3 });
      quad(ctx, P, [[0.42, v1, 0], [0.5, v1, 0], [0.5, v1, 7], [0.42, v1, 7]], '#6b4a34');
      windowsRight(ctx, l, P, { v0, v1, u: u1, z0: 0, z1: zt, cols: 2, rows: 1, color: WIN, rand, lit: 0.6 });
      gable(ctx, P, u0 - 0.03, v0 - 0.03, u1 + 0.03, v1 + 0.03, zt, 8 + rand() * 3, roof, wall, alongU);
      if (rand() < 0.6) box(ctx, P, { u0: 0.3, v0: 0.32, u1: 0.36, v1: 0.38, z0: zt + 4, z1: zt + 12, color: '#9a5b45' });
      bush(ctx, P, 0.25, 0.86, '#5b9a3e', 0.7);
      if (rand() < 0.5) bush(ctx, P, 0.92, 0.3, '#4e8c39', 0.7);
      if (rand() < 0.5) carOnLot(ctx, P, 0.81, 0.8, pick(rand, CAR_COLORS), false);
    });
  }
  for (let k = 0; k < VARIANTS.R2; k++) {
    const floors = 3 + (k % 3);
    building(`R2_${k}`, 1, floors * 9 + 18, (ctx, l, P, rand) => {
      paved(ctx, P, 1, '#cfcac0');
      ground(ctx, P, 0.02, 0.02, 0.98, 0.14, '#86c063');
      const c = pick(rand, BRICK);
      const u0 = 0.14, v0 = 0.18, u1 = 0.86, v1 = 0.84, z1 = floors * 9 + 2;
      box(ctx, P, { u0, v0, u1, v1, z1, color: c });
      windowsLeft(ctx, l, P, { u0, u1, v: v1, z0: 2, z1, cols: 4, rows: floors, color: WIN, rand, lit: 0.55 });
      windowsRight(ctx, l, P, { v0, v1, u: u1, z0: 2, z1, cols: 4, rows: floors, color: WIN, rand, lit: 0.55 });
      for (let f = 1; f < floors; f++) {
        quad(ctx, P, [[u0, v1, f * 9 + 2], [u1, v1, f * 9 + 2]], null, rgba('#ffffff', 0.25), 0.7);
        quad(ctx, P, [[u1, v1, f * 9 + 2], [u1, v0, f * 9 + 2]], null, rgba('#ffffff', 0.18), 0.7);
      }
      quad(ctx, P, [[0.44, v1, 0], [0.56, v1, 0], [0.56, v1, 7], [0.44, v1, 7]], '#3a2e26');
      flatRoof(ctx, P, u0, v0, u1, v1, z1, c, rand);
      if (rand() < 0.4) {
        // rooftop garden
        ground(ctx, P, 0.5, 0.25, 0.8, 0.5, '#7fb35a', z1 + 0.2);
      }
      bush(ctx, P, 0.08, 0.9, '#5b9a3e', 0.7);
      bush(ctx, P, 0.94, 0.4, '#5b9a3e', 0.7);
    });
  }
  for (let k = 0; k < VARIANTS.R3; k++) {
    const floors = 10 + k * 2;
    building(`R3_${k}`, 1, floors * 8 + 30, (ctx, l, P, rand) => {
      paved(ctx, P, 1, '#d6d1c7');
      ground(ctx, P, 0.04, 0.04, 0.3, 0.3, '#86c063');
      tree(ctx, P, 0.16, 0.16, { size: 0.8, rand });
      const c = pick(rand, ['#e8e4dc', '#d4dbe0', '#ece2d0', '#c9d3cf']);
      const u0 = 0.2, v0 = 0.2, u1 = 0.8, v1 = 0.8, z1 = floors * 8 + 4;
      box(ctx, P, { u0, v0, u1, v1, z1, color: c, gradient: true });
      const glass = pick(rand, GLASS);
      windowsLeft(ctx, l, P, { u0, u1, v: v1, z0: 4, z1, cols: 5, rows: floors, color: shade(glass, 0.8), rand, lit: 0.5, mx: 0.15, my: 0.22 });
      windowsRight(ctx, l, P, { v0, v1, u: u1, z0: 4, z1, cols: 5, rows: floors, color: shade(glass, 0.7), rand, lit: 0.5, mx: 0.15, my: 0.22 });
      // vertical accent
      quad(ctx, P, [[0.48, v1, 0], [0.52, v1, 0], [0.52, v1, z1], [0.48, v1, z1]], shade(c, 0.95));
      flatRoof(ctx, P, u0, v0, u1, v1, z1, c, rand, { units: false });
      box(ctx, P, { u0: 0.32, v0: 0.32, u1: 0.6, v1: 0.6, z0: z1, z1: z1 + 7, color: '#c9ccd0' });
      if (rand() < 0.5) cylinder(ctx, P, { u: 0.68, v: 0.35, r: 0.07, z0: z1, z1: z1 + 8, color: '#9aa1a8' });
      quad(ctx, P, [[0.44, v1, 0], [0.56, v1, 0], [0.56, v1, 6], [0.44, v1, 6]], '#2b3540');
    });
  }
}

function carOnLot(ctx, P, u, v, color, alongV) {
  const L = 0.13, W = 0.07;
  const o = alongV ? { u0: u - W, v0: v - L, u1: u + W, v1: v + L } : { u0: u - L, v0: v - W, u1: u + L, v1: v + W };
  const [x, y] = P(u, v);
  blob(ctx, x, y + 1, 7, 3, 0.25);
  box(ctx, P, { ...o, z0: 0.8, z1: 3.2, color, edge: rgba('#000', 0.25) });
  const c = alongV ? { u0: u - W * 0.85, v0: v - L * 0.5, u1: u + W * 0.85, v1: v + L * 0.4 } : { u0: u - L * 0.5, v0: v - W * 0.85, u1: u + L * 0.4, v1: v + W * 0.85 };
  box(ctx, P, { ...c, z0: 3.2, z1: 5, color: '#2f3d4b', top: shade(color, 1.05), edge: null });
}

function makeCommercial() {
  for (let k = 0; k < VARIANTS.C1; k++) {
    building(`C1_${k}`, 1, 40, (ctx, l, P, rand) => {
      paved(ctx, P, 1, '#d6d2c8');
      const c = pick(rand, ['#e9e4da', '#f2d7b6', '#d0dde6', '#e8c9c9', '#d7e3c8', '#efe2a8']);
      const awn = pick(rand, ['#d9483b', '#2f7dd1', '#2e9e6a', '#e39b2b', '#8c4fc2', '#1f6f74']);
      const u0 = 0.12, v0 = 0.14, u1 = 0.88, v1 = 0.74, z1 = 14 + Math.floor(rand() * 5);
      box(ctx, P, { u0, v0, u1, v1, z1, color: c });
      // shopfront glass
      const front = [[0.18, v1, 1], [0.82, v1, 1], [0.82, v1, 9], [0.18, v1, 9]];
      quad(ctx, P, front, grad(ctx, P(0.18, v1, 9), P(0.82, v1, 1), [[0, '#a8d4e6'], [1, '#5c8ea6']]));
      quad(l, P, front, '#ffcf7a');
      for (let m = 1; m < 4; m++) {
        const uu = 0.18 + 0.16 * m;
        quad(ctx, P, [[uu, v1, 1], [uu, v1, 9]], null, '#e8e8e8', 0.6);
      }
      windowsRight(ctx, l, P, { v0, v1, u: u1, z0: 0, z1, cols: 2, rows: 1, color: '#8fb8cc', rand, lit: 0.8 });
      // striped awning
      const seg = 6;
      for (let s = 0; s < seg; s++) {
        const a = 0.15 + (0.7 / seg) * s, b = a + 0.7 / seg;
        quad(ctx, P, [[a, v1, 12], [b, v1, 12], [b, v1 + 0.1, 9], [a, v1 + 0.1, 9]], s % 2 ? '#f5f3ee' : awn);
      }
      flatRoof(ctx, P, u0, v0, u1, v1, z1, c, rand);
      // roof sign
      const sc = pick(rand, ['#ff5a5f', '#ffd23f', '#3ec1d3', '#ffffff']);
      box(ctx, P, { u0: 0.3, v0: 0.62, u1: 0.7, v1: 0.66, z0: z1, z1: z1 + 6, color: sc });
      quad(l, P, [[0.3, 0.66, z1 + 1], [0.7, 0.66, z1 + 1], [0.7, 0.66, z1 + 5], [0.3, 0.66, z1 + 5]], rgba(sc === '#ffffff' ? '#ffe9a8' : sc, 0.95));
      if (rand() < 0.6) carOnLot(ctx, P, 0.7, 0.9, pick(rand, CAR_COLORS), false);
      bush(ctx, P, 0.08, 0.9, '#5b9a3e', 0.6);
    });
  }
  for (let k = 0; k < VARIANTS.C2; k++) {
    const floors = 6 + k;
    building(`C2_${k}`, 1, floors * 7 + 26, (ctx, l, P, rand) => {
      paved(ctx, P, 1, '#cdc9c0');
      const glass = pick(rand, GLASS);
      const u0 = 0.14, v0 = 0.14, u1 = 0.86, v1 = 0.86, z1 = floors * 7 + 6;
      box(ctx, P, { u0, v0, u1, v1, z1: 6, color: '#5a5f66' });
      quad(ctx, P, [[0.3, v1, 0], [0.7, v1, 0], [0.7, v1, 5], [0.3, v1, 5]], '#cfe6f0');
      quad(l, P, [[0.3, v1, 0], [0.7, v1, 0], [0.7, v1, 5], [0.3, v1, 5]], '#ffe2a6');
      box(ctx, P, { u0, v0, u1, v1, z0: 6, z1, color: glass, gradient: true });
      windowsLeft(ctx, l, P, { u0, u1, v: v1, z0: 6, z1, cols: 6, rows: floors, color: shade(glass, 0.78), rand, lit: 0.45, mx: 0.08, my: 0.18, litColor: '#fff0c4' });
      windowsRight(ctx, l, P, { v0, v1, u: u1, z0: 6, z1, cols: 6, rows: floors, color: shade(glass, 0.62), rand, lit: 0.45, mx: 0.08, my: 0.18, litColor: '#fff0c4' });
      // reflection streak
      quad(ctx, P, [[0.2, v1, z1 - 4], [0.34, v1, z1 - 4], [0.6, v1, 8], [0.46, v1, 8]], rgba('#ffffff', 0.12));
      flatRoof(ctx, P, u0, v0, u1, v1, z1, '#8a9098', rand);
      box(ctx, P, { u0: 0.3, v0: 0.3, u1: 0.62, v1: 0.6, z0: z1, z1: z1 + 6, color: '#a5abb2' });
      tree(ctx, P, 0.06, 0.94, { size: 0.6, rand });
    });
  }
  for (let k = 0; k < VARIANTS.C3; k++) {
    building(`C3_${k}`, 1, 235, (ctx, l, P, rand, meta, O) => {
      paved(ctx, P, 1, '#c8c4bb');
      const glass = pick(rand, ['#355c86', '#2e6f86', '#46607e']);
      const tiers = [[0.1, 0, 52], [0.18, 52, 128], [0.27, 128, 178]];
      if (k === 1) { tiers[1][2] = 150; tiers[2] = [0.3, 150, 196]; }
      for (const [m, z0, z1] of tiers) {
        const u0 = m, v0 = m, u1 = 1 - m, v1 = 1 - m;
        box(ctx, P, { u0, v0, u1, v1, z0, z1, color: glass, gradient: true, edge: rgba('#0a1a2a', 0.4) });
        const rows = Math.round((z1 - z0) / 6);
        windowsLeft(ctx, l, P, { u0, u1, v: v1, z0: z0 + 1, z1, cols: 6, rows, color: shade(glass, 0.8), rand, lit: 0.4, mx: 0.1, my: 0.2, litColor: '#fff2cc' });
        windowsRight(ctx, l, P, { v0, v1, u: u1, z0: z0 + 1, z1, cols: 6, rows, color: shade(glass, 0.62), rand, lit: 0.4, mx: 0.1, my: 0.2, litColor: '#fff2cc' });
        quad(ctx, P, [[u0, v1, z1], [u1, v1, z1]], null, rgba('#e8f2ff', 0.6), 1);
        quad(ctx, P, [[u1, v1, z1], [u1, v0, z1]], null, rgba('#e8f2ff', 0.4), 1);
        quad(ctx, P, [[u0, v0, z1], [u1, v0, z1], [u1, v1, z1], [u0, v1, z1]], shade(glass, 0.8));
      }
      const top = tiers[2][2];
      // reflection
      quad(ctx, P, [[0.12, 0.9, 50], [0.3, 0.9, 50], [0.5, 0.9, 4], [0.32, 0.9, 4]], rgba('#ffffff', 0.1));
      if (k === 2) {
        // pyramid crown
        const m = 0.27, z = top, h = 26;
        quad(ctx, P, [[m, 1 - m, z], [1 - m, 1 - m, z], [0.5, 0.5, z + h]], '#c9d2db');
        quad(ctx, P, [[1 - m, 1 - m, z], [1 - m, m, z], [0.5, 0.5, z + h]], '#8f9aa6');
      } else {
        box(ctx, P, { u0: 0.38, v0: 0.38, u1: 0.62, v1: 0.62, z0: top, z1: top + 8, color: '#9aa4ae' });
      }
      const [ax, ay] = P(0.5, 0.5, top + 8);
      ctx.strokeStyle = '#d0d6dc';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, ay - 24); ctx.stroke();
      l.fillStyle = '#ff3b30';
      l.beginPath(); l.arc(ax, ay - 24, 1.8, 0, Math.PI * 2); l.fill();
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(ax - 1, ay - 25, 2, 2);
      // lobby
      quad(ctx, P, [[0.3, 0.9, 0], [0.7, 0.9, 0], [0.7, 0.9, 7], [0.3, 0.9, 7]], '#d8ecf5');
      quad(l, P, [[0.3, 0.9, 0], [0.7, 0.9, 0], [0.7, 0.9, 7], [0.3, 0.9, 7]], '#ffe2a6');
    });
  }
}

function makeIndustrial() {
  for (let k = 0; k < VARIANTS.I1; k++) {
    building(`I1_${k}`, 1, 34, (ctx, l, P, rand) => {
      paved(ctx, P, 1, '#b3b1aa');
      for (let m = 0; m < 3; m++) quad(ctx, P, [[0.15 + m * 0.25, 0.86, 0], [0.15 + m * 0.25, 0.98, 0]], null, '#f1c84b', 0.8);
      const c = pick(rand, ['#a7b1b8', '#c2b49a', '#8fa3a0', '#b7a07e', '#9db0c4']);
      const u0 = 0.1, v0 = 0.12, u1 = 0.9, v1 = 0.76, z1 = 13;
      box(ctx, P, { u0, v0, u1, v1, z1, color: c });
      for (let m = 0; m < 3; m++) {
        const a = 0.16 + m * 0.24;
        quad(ctx, P, [[a, v1, 0], [a + 0.16, v1, 0], [a + 0.16, v1, 9], [a, v1, 9]], '#5e646b');
        for (let s = 1; s < 5; s++) quad(ctx, P, [[a, v1, s * 1.8], [a + 0.16, v1, s * 1.8]], null, rgba('#000', 0.2), 0.4);
      }
      quad(l, P, [[0.16, v1, 0], [0.32, v1, 0], [0.32, v1, 9], [0.16, v1, 9]], rgba('#ffd98a', 0.8));
      // ribbed roof
      for (let m = 1; m < 10; m++) {
        const uu = u0 + (u1 - u0) * m / 10;
        quad(ctx, P, [[uu, v0, z1], [uu, v1, z1]], null, rgba('#000', 0.15), 0.5);
      }
      windowsRight(ctx, l, P, { v0, v1, u: u1, z0: 6, z1: 12, cols: 3, rows: 1, color: '#7f99a8', rand, lit: 0.5 });
      // crates
      for (let m = 0; m < 3; m++) {
        const uu = 0.6 + rand() * 0.25, vv = 0.82 + rand() * 0.08;
        box(ctx, P, { u0: uu, v0: vv, u1: uu + 0.06, v1: vv + 0.06, z1: 3, color: '#b07d45' });
      }
    });
  }
  for (let k = 0; k < VARIANTS.I2; k++) {
    building(`I2_${k}`, 1, 92, (ctx, l, P, rand, meta, O) => {
      paved(ctx, P, 1, '#aaa79f');
      const c = pick(rand, ['#9c5a43', '#8d9399', '#b07a52', '#7d8b80']);
      const u0 = 0.08, v0 = 0.14, u1 = 0.64, v1 = 0.88, z1 = 20;
      box(ctx, P, { u0, v0, u1, v1, z1, color: c });
      windowsLeft(ctx, l, P, { u0, u1, v: v1, z0: 4, z1: 18, cols: 4, rows: 1, color: '#6d8796', rand, lit: 0.8 });
      windowsRight(ctx, l, P, { v0, v1, u: u1, z0: 4, z1: 18, cols: 5, rows: 1, color: '#5c7482', rand, lit: 0.8 });
      // sawtooth roof
      for (let m = 0; m < 4; m++) {
        const a = v0 + (v1 - v0) * m / 4, b = v0 + (v1 - v0) * (m + 1) / 4;
        quad(ctx, P, [[u0, a, z1], [u1, a, z1], [u1, b, z1 + 6], [u0, b, z1 + 6]], shade(c, 1.12));
        quad(ctx, P, [[u0, b, z1], [u1, b, z1], [u1, b, z1 + 6], [u0, b, z1 + 6]], '#7c97a5');
        quad(ctx, P, [[u1, a, z1], [u1, b, z1], [u1, b, z1 + 6]], shade(c, 0.66));
      }
      // tank
      cylinder(ctx, P, { u: 0.82, v: 0.72, r: 0.12, z1: 18, color: '#c4cad0' });
      // striped chimney
      const cu = 0.82, cv = 0.3, top = 64 + k * 6;
      const seg = 6;
      for (let s = 0; s < seg; s++) {
        cylinder(ctx, P, { u: cu, v: cv, r: 0.065 - s * 0.004, z0: (top / seg) * s, z1: (top / seg) * (s + 1), color: s % 2 ? '#e9e6df' : '#c0392b' });
      }
      meta.smoke.push(O(cu, cv, top + 2));
      l.fillStyle = '#ff3b30';
      const [x, y] = P(cu, cv, top);
      l.beginPath(); l.arc(x, y - 1, 1.4, 0, Math.PI * 2); l.fill();
    });
  }
  for (let k = 0; k < VARIANTS.I3; k++) {
    building(`I3_${k}`, 1, 108, (ctx, l, P, rand, meta, O) => {
      paved(ctx, P, 1, '#9c9a93');
      const c = pick(rand, ['#7d8790', '#8a7f72']);
      box(ctx, P, { u0: 0.08, v0: 0.08, u1: 0.55, v1: 0.58, z1: 28, color: c });
      windowsLeft(ctx, l, P, { u0: 0.08, u1: 0.55, v: 0.58, z0: 4, z1: 26, cols: 3, rows: 2, color: '#61798a', rand, lit: 0.8 });
      windowsRight(ctx, l, P, { v0: 0.08, v1: 0.58, u: 0.55, z0: 4, z1: 26, cols: 3, rows: 2, color: '#4f6573', rand, lit: 0.8 });
      flatRoof(ctx, P, 0.08, 0.08, 0.55, 0.58, 28, c, rand);
      for (const [u, v, r] of [[0.25, 0.8, 0.13], [0.55, 0.82, 0.12], [0.8, 0.6, 0.13]]) {
        cylinder(ctx, P, { u, v, r, z1: 22, color: '#dde1e4' });
        quad(ctx, P, [[u - r, v, 22], [u + r, v, 22]], null, rgba('#000', 0.1));
      }
      // pipes
      ctx.strokeStyle = '#a8adb2'; ctx.lineWidth = 1.4;
      const p1 = P(0.55, 0.5, 14), p2 = P(0.8, 0.6, 14);
      ctx.beginPath(); ctx.moveTo(...p1); ctx.lineTo(...p2); ctx.stroke();
      for (const [u, v, h] of [[0.7, 0.22, 88], [0.86, 0.32, 76]]) {
        cylinder(ctx, P, { u, v, r: 0.06, z1: h, color: '#8e959b' });
        cylinder(ctx, P, { u, v, r: 0.062, z0: h - 8, z1: h - 4, color: '#c0392b' });
        meta.smoke.push(O(u, v, h + 2));
        const [x, y] = P(u, v, h);
        l.fillStyle = '#ff3b30'; l.beginPath(); l.arc(x, y - 1, 1.4, 0, Math.PI * 2); l.fill();
      }
    });
  }
}

function makeConstruction() {
  for (let k = 0; k < 2; k++) {
    building(`cons_${k}`, 1, k ? 82 : 40, (ctx, l, P, rand) => {
      ground(ctx, P, 0, 0, 1, 1, '#a98d66');
      for (let m = 0; m < 80; m++) {
        const [x, y] = P(rand(), rand());
        ctx.fillStyle = rand() < 0.5 ? '#8f7553' : '#c4a87e';
        ctx.fillRect(x, y, 1, 0.7);
      }
      // fence
      ctx.setLineDash([2, 1]);
      quad(ctx, P, [[0.04, 0.96, 3], [0.96, 0.96, 3], [0.96, 0.04, 3]], null, '#f39c12', 0.8);
      ctx.setLineDash([]);
      const floors = k ? 3 : 1;
      for (let f = 0; f <= floors; f++) {
        box(ctx, P, { u0: 0.2, v0: 0.22, u1: 0.78, v1: 0.78, z0: f * 9, z1: f * 9 + 1.5, color: '#bdbab3' });
      }
      ctx.strokeStyle = '#8a8780'; ctx.lineWidth = 1;
      for (const [u, v] of [[0.2, 0.78], [0.78, 0.78], [0.78, 0.22], [0.49, 0.78], [0.78, 0.5]]) {
        const a = P(u, v, 0), b = P(u, v, floors * 9);
        ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
      }
      // scaffold
      ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 0.6;
      for (let f = 0; f <= floors * 2; f++) quad(ctx, P, [[0.18, 0.82, f * 4.5], [0.82, 0.82, f * 4.5], [0.82, 0.18, f * 4.5]], null, '#e67e22', 0.6);
      if (k) {
        // tower crane
        const [mx, my] = P(0.88, 0.14, 0);
        const top = my - 76;
        ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(mx - 1.2, my); ctx.lineTo(mx - 1.2, top); ctx.moveTo(mx + 1.2, my); ctx.lineTo(mx + 1.2, top); ctx.stroke();
        ctx.lineWidth = 0.5;
        for (let y = my; y > top; y -= 3) { ctx.beginPath(); ctx.moveTo(mx - 1.2, y); ctx.lineTo(mx + 1.2, y - 3); ctx.stroke(); }
        ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(mx + 10, top + 2); ctx.lineTo(mx - 30, top + 2); ctx.stroke();
        ctx.fillStyle = '#7f8c8d'; ctx.fillRect(mx + 6, top + 2, 5, 4);
        ctx.strokeStyle = '#555'; ctx.lineWidth = 0.4;
        ctx.beginPath(); ctx.moveTo(mx - 22, top + 2); ctx.lineTo(mx - 22, top + 38); ctx.stroke();
        ctx.fillStyle = '#c0392b'; ctx.fillRect(mx - 24, top + 38, 4, 2);
        l.fillStyle = '#ff3b30'; l.beginPath(); l.arc(mx - 30, top + 2, 1.3, 0, Math.PI * 2); l.fill();
      }
      box(ctx, P, { u0: 0.05, v0: 0.6, u1: 0.15, v1: 0.75, z1: 4, color: '#2f80b8' });
    });
  }
}

// --- service & utility buildings --------------------------------------------
function makeServices() {
  building('wind', 1, 96, (ctx, l, P, rand, meta, O) => {
    lawn(ctx, P, 1, '#82bb5f');
    box(ctx, P, { u0: 0.38, v0: 0.38, u1: 0.62, v1: 0.62, z1: 2, color: '#c9c6be' });
    const [bx, by] = P(0.5, 0.5, 0);
    const [, ty] = P(0.5, 0.5, 70);
    ctx.fillStyle = grad(ctx, [bx - 3, 0], [bx + 3, 0], [[0, '#ffffff'], [1, '#b9bec4']]);
    ctx.beginPath(); ctx.moveTo(bx - 2.6, by); ctx.lineTo(bx - 1.2, ty); ctx.lineTo(bx + 1.2, ty); ctx.lineTo(bx + 2.6, by); ctx.closePath(); ctx.fill();
    box(ctx, P, { u0: 0.44, v0: 0.47, u1: 0.62, v1: 0.53, z0: 68, z1: 73, color: '#eef0f2' });
    meta.hub = O(0.45, 0.5, 71);
    l.fillStyle = '#ff3b30'; l.beginPath(); l.arc(bx, ty - 4, 1.4, 0, Math.PI * 2); l.fill();
  });
  // rotor
  {
    const { tex, ctx } = canvasTex('wind_blades', 64, 64);
    ctx.translate(32, 32);
    for (let k = 0; k < 3; k++) {
      ctx.save();
      ctx.rotate((k * Math.PI * 2) / 3);
      ctx.fillStyle = grad(ctx, [-2, 0], [2, 0], [[0, '#ffffff'], [1, '#c6ccd2']]);
      ctx.beginPath(); ctx.moveTo(-1.6, 0); ctx.quadraticCurveTo(-2.4, -14, -0.4, -30); ctx.lineTo(0.6, -30); ctx.quadraticCurveTo(1.6, -12, 1.6, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#e9ecef'; ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, Math.PI * 2); ctx.fill();
    tex.refresh();
  }

  building('coal', 2, 118, (ctx, l, P, rand, meta, O) => {
    paved(ctx, P, 2, '#a6a39b');
    // coal piles
    for (const [u, v] of [[1.55, 1.7], [1.8, 1.45]]) {
      const [x, y] = P(u, v);
      ctx.fillStyle = '#2b2b2b'; ctx.beginPath(); ctx.ellipse(x, y - 2, 9, 4.5, 0, Math.PI, 0); ctx.fill();
    }
    box(ctx, P, { u0: 0.1, v0: 0.95, u1: 1.3, v1: 1.85, z1: 26, color: '#8b8f94' });
    windowsLeft(ctx, l, P, { u0: 0.1, u1: 1.3, v: 1.85, z0: 4, z1: 24, cols: 6, rows: 2, color: '#5d7383', rand, lit: 0.8 });
    windowsRight(ctx, l, P, { v0: 0.95, v1: 1.85, u: 1.3, z0: 4, z1: 24, cols: 4, rows: 2, color: '#4d6170', rand, lit: 0.8 });
    flatRoof(ctx, P, 0.1, 0.95, 1.3, 1.85, 26, '#8b8f94', rand);
    // cooling towers
    for (const [u, v] of [[0.55, 0.45], [1.45, 0.6]]) {
      const H = 64, r0 = 0.4, rw = 0.27, rt = 0.31;
      const pts = [];
      for (let t = 0; t <= 1.0001; t += 0.1) {
        const r = t < 0.7 ? r0 + (rw - r0) * Math.sin((t / 0.7) * Math.PI / 2) : rw + (rt - rw) * ((t - 0.7) / 0.3);
        pts.push([t * H, r]);
      }
      const [cx] = P(u, v, 0);
      const ell = (z, r) => { const [, cy] = P(u, v, z); return [cy, (r * 64) / Math.SQRT2, (r * 32) / Math.SQRT2]; };
      ctx.beginPath();
      const [cy0, a0, b0] = ell(0, r0);
      ctx.ellipse(cx, cy0, a0, b0, 0, 0, Math.PI);
      for (const [z, r] of pts) { const [cy, a] = ell(z, r); ctx.lineTo(cx - a, cy); }
      const [cyt, at, bt] = ell(H, rt);
      ctx.ellipse(cx, cyt, at, bt, 0, Math.PI, 0, true);
      for (let q = pts.length - 1; q >= 0; q--) { const [z, r] = pts[q]; const [cy, a] = ell(z, r); ctx.lineTo(cx + a, cy); }
      ctx.closePath();
      ctx.fillStyle = grad(ctx, [cx - a0, 0], [cx + a0, 0], [[0, '#d9d6cf'], [0.35, '#f1eee8'], [1, '#9c9890']]);
      ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx, cyt, at, bt, 0, 0, Math.PI * 2); ctx.fillStyle = '#5b5852'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx, cyt + 1, at * 0.85, bt * 0.75, 0, 0, Math.PI * 2); ctx.fillStyle = '#3c3a36'; ctx.fill();
      meta.smoke.push(O(u, v, H + 2));
    }
    // chimney
    cylinder(ctx, P, { u: 1.15, v: 1.2, r: 0.07, z0: 26, z1: 96, color: '#a4a8ab' });
    for (let s = 0; s < 3; s++) cylinder(ctx, P, { u: 1.15, v: 1.2, r: 0.072, z0: 80 + s * 6, z1: 83 + s * 6, color: '#c0392b' });
    meta.smoke.push(O(1.15, 1.2, 98));
  });

  building('solar', 2, 24, (ctx, l, P, rand) => {
    ground(ctx, P, 0, 0, 2, 2, '#b7b39f');
    for (let m = 0; m < 80; m++) { const [x, y] = P(rand() * 2, rand() * 2); ctx.fillStyle = '#a8a48f'; ctx.fillRect(x, y, 1, 0.6); }
    for (let r = 0; r < 6; r++) {
      const v = 0.12 + r * 0.3;
      for (let c = 0; c < 2; c++) {
        const u0 = 0.1 + c * 0.92, u1 = u0 + 0.84;
        quad(ctx, P, [[u0, v + 0.2, 1], [u1, v + 0.2, 1], [u1, v + 0.2, 4]], null, '#777', 0.6);
        const pts = [[u0, v, 7], [u1, v, 7], [u1, v + 0.2, 2], [u0, v + 0.2, 2]];
        quad(ctx, P, pts, grad(ctx, P(u0, v, 7), P(u1, v + 0.2, 2), [[0, '#3f6fa8'], [0.5, '#1f3c66'], [1, '#2b4f82']]), '#cfd8e2', 0.5);
        for (let g = 1; g < 6; g++) {
          const uu = u0 + (u1 - u0) * g / 6;
          quad(ctx, P, [[uu, v, 7], [uu, v + 0.2, 2]], null, rgba('#c8d6e8', 0.35), 0.4);
        }
      }
    }
  });

  building('watertower', 1, 70, (ctx, l, P, rand) => {
    lawn(ctx, P, 1, '#82bb5f');
    ctx.strokeStyle = '#8d949b'; ctx.lineWidth = 1.2;
    for (const [u, v] of [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7]]) {
      const a = P(u, v, 0), b = P(0.5 + (u - 0.5) * 0.6, 0.5 + (v - 0.5) * 0.6, 42);
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
    }
    ctx.lineWidth = 0.5;
    quad(ctx, P, [[0.35, 0.65, 20], [0.65, 0.65, 20], [0.65, 0.35, 20]], null, '#8d949b', 0.6);
    cylinder(ctx, P, { u: 0.5, v: 0.5, r: 0.3, z0: 40, z1: 58, color: '#7fb6d9' });
    const [cx, cy] = P(0.5, 0.5, 58);
    ctx.beginPath(); ctx.ellipse(cx, cy, 13.6, 6.8, 0, Math.PI, 0); ctx.quadraticCurveTo(cx, cy - 14, cx - 13.6, cy); ctx.fillStyle = '#a5cfe8'; ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 5px Inter, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('SKY', cx - 2, cy + 11);
    l.fillStyle = '#ff3b30'; l.beginPath(); l.arc(cx, cy - 7, 1.3, 0, Math.PI * 2); l.fill();
  });

  building('police', 1, 46, (ctx, l, P, rand) => {
    paved(ctx, P, 1, '#cfcbc2');
    box(ctx, P, { u0: 0.14, v0: 0.14, u1: 0.86, v1: 0.72, z1: 20, color: '#eef1f4' });
    quad(ctx, P, [[0.14, 0.72, 13], [0.86, 0.72, 13], [0.86, 0.72, 16], [0.14, 0.72, 16]], '#2557a7');
    quad(ctx, P, [[0.86, 0.72, 13], [0.86, 0.14, 13], [0.86, 0.14, 16], [0.86, 0.72, 16]], '#1d4789');
    windowsLeft(ctx, l, P, { u0: 0.14, u1: 0.86, v: 0.72, z0: 2, z1: 12, cols: 4, rows: 1, color: WIN, rand, lit: 0.9 });
    windowsRight(ctx, l, P, { v0: 0.14, v1: 0.72, u: 0.86, z0: 2, z1: 12, cols: 3, rows: 1, color: WIN, rand, lit: 0.9 });
    flatRoof(ctx, P, 0.14, 0.14, 0.86, 0.72, 20, '#d9dde2', rand, { units: false });
    box(ctx, P, { u0: 0.35, v0: 0.3, u1: 0.65, v1: 0.5, z0: 20, z1: 26, color: '#2557a7' });
    ctx.fillStyle = '#fff'; const [sx, sy] = P(0.5, 0.5, 22); ctx.font = 'bold 4px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('POLICE', sx - 4, sy + 2);
    carOnLot(ctx, P, 0.35, 0.86, '#f4f6f8', false);
    carOnLot(ctx, P, 0.7, 0.86, '#1f3f7a', false);
    l.fillStyle = '#4da3ff'; const [lx, ly] = P(0.35, 0.86, 5.5); l.fillRect(lx - 1.5, ly - 1, 1.5, 1); l.fillStyle = '#ff3b30'; l.fillRect(lx, ly - 1, 1.5, 1);
  });

  building('fire', 1, 52, (ctx, l, P, rand) => {
    paved(ctx, P, 1, '#cfcbc2');
    const c = '#b8412f';
    box(ctx, P, { u0: 0.12, v0: 0.14, u1: 0.74, v1: 0.78, z1: 22, color: c });
    for (let m = 0; m < 2; m++) {
      const a = 0.18 + m * 0.28;
      quad(ctx, P, [[a, 0.78, 0], [a + 0.22, 0.78, 0], [a + 0.22, 0.78, 12], [a, 0.78, 12]], '#ecebe6');
      for (let s = 1; s < 6; s++) quad(ctx, P, [[a, 0.78, s * 2], [a + 0.22, 0.78, s * 2]], null, rgba('#000', 0.15), 0.4);
    }
    quad(l, P, [[0.18, 0.78, 0], [0.4, 0.78, 0], [0.4, 0.78, 12], [0.18, 0.78, 12]], rgba('#ffd98a', 0.7));
    windowsLeft(ctx, l, P, { u0: 0.12, u1: 0.74, v: 0.78, z0: 14, z1: 21, cols: 4, rows: 1, color: WIN, rand, lit: 0.8 });
    windowsRight(ctx, l, P, { v0: 0.14, v1: 0.78, u: 0.74, z0: 4, z1: 21, cols: 3, rows: 2, color: WIN, rand, lit: 0.8 });
    flatRoof(ctx, P, 0.12, 0.14, 0.74, 0.78, 22, c, rand, { units: false });
    box(ctx, P, { u0: 0.76, v0: 0.18, u1: 0.92, v1: 0.36, z1: 36, color: '#a83a2a' });
    windowsLeft(ctx, l, P, { u0: 0.76, u1: 0.92, v: 0.36, z0: 24, z1: 34, cols: 1, rows: 2, color: WIN, rand, lit: 0.8 });
    // fire truck
    box(ctx, P, { u0: 0.2, v0: 0.84, u1: 0.5, v1: 0.94, z0: 1, z1: 5, color: '#d92b1f' });
    box(ctx, P, { u0: 0.42, v0: 0.84, u1: 0.5, v1: 0.94, z0: 5, z1: 7, color: '#2c3e50', top: '#d92b1f' });
  });

  building('school', 2, 50, (ctx, l, P, rand) => {
    lawn(ctx, P, 2, '#86c063');
    // sports field
    ground(ctx, P, 0.15, 1.05, 1.15, 1.85, '#5fa84a');
    quad(ctx, P, [[0.2, 1.1, 0], [1.1, 1.1, 0], [1.1, 1.8, 0], [0.2, 1.8, 0]], null, rgba('#ffffff', 0.85), 0.8);
    quad(ctx, P, [[0.65, 1.1, 0], [0.65, 1.8, 0]], null, rgba('#ffffff', 0.85), 0.8);
    // track
    ground(ctx, P, 1.3, 1.05, 1.9, 1.9, '#c2694a');
    const c = '#c06b4a';
    box(ctx, P, { u0: 0.1, v0: 0.12, u1: 1.85, v1: 0.75, z1: 20, color: c });
    windowsLeft(ctx, l, P, { u0: 0.1, u1: 1.85, v: 0.75, z0: 2, z1: 19, cols: 10, rows: 2, color: '#d9e6ee', rand, lit: 0.6 });
    windowsRight(ctx, l, P, { v0: 0.12, v1: 0.75, u: 1.85, z0: 2, z1: 19, cols: 3, rows: 2, color: '#c3d3dd', rand, lit: 0.6 });
    flatRoof(ctx, P, 0.1, 0.12, 1.85, 0.75, 20, c, rand);
    box(ctx, P, { u0: 0.8, v0: 0.6, u1: 1.1, v1: 0.9, z1: 24, color: '#e6dccb' });
    quad(ctx, P, [[0.88, 0.9, 0], [1.02, 0.9, 0], [1.02, 0.9, 9], [0.88, 0.9, 9]], '#3b2c22');
    const [fx, fy] = P(1.5, 0.9, 0);
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 34); ctx.stroke();
    ctx.fillStyle = '#2f7dd1'; ctx.fillRect(fx, fy - 34, 7, 4.5);
    tree(ctx, P, 0.08, 0.95, { size: 0.8, rand });
    // school bus
    box(ctx, P, { u0: 1.4, v0: 0.84, u1: 1.85, v1: 0.96, z0: 1, z1: 6, color: '#f5c22b' });
  });

  building('hospital', 2, 92, (ctx, l, P, rand) => {
    paved(ctx, P, 2, '#d3cfc6');
    ground(ctx, P, 0.02, 1.55, 0.6, 1.98, '#86c063');
    const c = '#eef0f2';
    box(ctx, P, { u0: 0.15, v0: 0.15, u1: 1.85, v1: 1.5, z1: 24, color: c });
    windowsLeft(ctx, l, P, { u0: 0.15, u1: 1.85, v: 1.5, z0: 2, z1: 23, cols: 10, rows: 3, color: '#7fa7c4', rand, lit: 0.7 });
    windowsRight(ctx, l, P, { v0: 0.15, v1: 1.5, u: 1.85, z0: 2, z1: 23, cols: 8, rows: 3, color: '#6b93b0', rand, lit: 0.7 });
    flatRoof(ctx, P, 0.15, 0.15, 1.85, 1.5, 24, c, rand, { units: false });
    box(ctx, P, { u0: 0.3, v0: 0.25, u1: 1.0, v1: 0.95, z0: 24, z1: 62, color: c, gradient: true });
    windowsLeft(ctx, l, P, { u0: 0.3, u1: 1.0, v: 0.95, z0: 25, z1: 61, cols: 5, rows: 5, color: '#7fa7c4', rand, lit: 0.7 });
    windowsRight(ctx, l, P, { v0: 0.25, v1: 0.95, u: 1.0, z0: 25, z1: 61, cols: 5, rows: 5, color: '#6b93b0', rand, lit: 0.7 });
    // red cross on tower top
    const z = 62;
    ground(ctx, P, 0.55, 0.4, 0.75, 0.8, '#e23b3b', z);
    ground(ctx, P, 0.45, 0.5, 0.85, 0.7, '#e23b3b', z);
    // helipad on lower roof
    const [hx, hy] = P(1.45, 0.85, 24);
    ctx.beginPath(); ctx.ellipse(hx, hy, 11, 5.5, 0, 0, Math.PI * 2); ctx.fillStyle = '#5b6168'; ctx.fill();
    ctx.strokeStyle = '#f5f5f5'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 6px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('H', hx, hy + 2);
    l.fillStyle = '#ff6b6b'; l.beginPath(); l.ellipse(hx, hy, 11, 5.5, 0, 0, Math.PI * 2); l.lineWidth = 0.8; l.strokeStyle = '#ff9f43'; l.stroke();
    // ambulance
    box(ctx, P, { u0: 0.7, v0: 1.62, u1: 0.95, v1: 1.74, z0: 1, z1: 6, color: '#ffffff' });
    quad(ctx, P, [[0.7, 1.74, 3], [0.95, 1.74, 3], [0.95, 1.74, 4], [0.7, 1.74, 4]], '#e23b3b');
    tree(ctx, P, 0.2, 1.8, { size: 0.8, rand });
    tree(ctx, P, 0.45, 1.85, { size: 0.7, rand });
  });

  building('park', 1, 34, (ctx, l, P, rand) => {
    lawn(ctx, P, 1, '#6fb04d');
    // path
    ctx.strokeStyle = '#e3d6b5'; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(...P(0, 0.55)); ctx.bezierCurveTo(...P(0.4, 0.3), ...P(0.6, 0.8), ...P(1, 0.45)); ctx.stroke();
    // pond
    const [px, py] = P(0.7, 0.25);
    ctx.beginPath(); ctx.ellipse(px, py, 8, 3.8, 0, 0, Math.PI * 2);
    ctx.fillStyle = grad(ctx, [px, py - 4], [px, py + 4], [[0, '#69c2df'], [1, '#3b93c0']]); ctx.fill();
    ctx.strokeStyle = '#d8cfa9'; ctx.lineWidth = 0.8; ctx.stroke();
    tree(ctx, P, 0.25, 0.22, { size: 0.9, rand });
    tree(ctx, P, 0.78, 0.78, { size: 0.85, rand, color: '#5a9a3f' });
    bush(ctx, P, 0.25, 0.85, '#d16b8c', 0.6);
    bush(ctx, P, 0.5, 0.92, '#5b9a3e', 0.6);
    // bench
    box(ctx, P, { u0: 0.42, v0: 0.6, u1: 0.56, v1: 0.64, z0: 1.5, z1: 2.5, color: '#8b5a3c' });
    // lamp light
    const [lx, ly] = P(0.5, 0.5, 0);
    ctx.strokeStyle = '#3a3f44'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly - 10); ctx.stroke();
    l.fillStyle = '#ffe1a0'; l.beginPath(); l.arc(lx, ly - 10.5, 1.5, 0, Math.PI * 2); l.fill();
  });

  building('plaza', 2, 50, (ctx, l, P, rand, meta, O) => {
    paved(ctx, P, 2, '#e2dccd');
    ground(ctx, P, 0.3, 0.3, 1.7, 1.7, '#d4ccb8');
    // flower beds
    for (const [u, v] of [[0.15, 0.15], [1.85, 0.15], [0.15, 1.85], [1.85, 1.85]]) {
      ground(ctx, P, u - 0.12, v - 0.12, u + 0.12, v + 0.12, '#5d9b45');
    }
    for (const [u, v] of [[0.15, 0.15], [1.85, 0.15], [0.15, 1.85], [1.85, 1.85]]) tree(ctx, P, u, v, { size: 0.9, rand });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      bush(ctx, P, 1 + Math.cos(a) * 0.62, 1 + Math.sin(a) * 0.62, k % 2 ? '#e8739a' : '#f2c14e', 0.5);
    }
    // fountain
    const [fx, fy] = P(1, 1, 0);
    ctx.beginPath(); ctx.ellipse(fx, fy, 22, 11, 0, 0, Math.PI * 2); ctx.fillStyle = '#bdb6a5'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(fx, fy - 1, 19, 9.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = grad(ctx, [fx, fy - 10], [fx, fy + 10], [[0, '#7fd0ea'], [1, '#3d98c8']]); ctx.fill();
    cylinder(ctx, P, { u: 1, v: 1, r: 0.1, z0: 0, z1: 6, color: '#cfc8b8' });
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(fx + Math.cos(a) * 8, fy - 6 + Math.sin(a) * 4 - 4 * Math.abs(Math.cos(a * 0.5)), 0.9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(fx, fy - 6); ctx.lineTo(fx, fy - 16); ctx.stroke();
    l.fillStyle = 'rgba(120,200,255,0.55)'; l.beginPath(); l.ellipse(fx, fy - 1, 19, 9.5, 0, 0, Math.PI * 2); l.fill();
    meta.fountain = O(1, 1, 16);
  });

  building('stadium', 3, 70, (ctx, l, P, rand) => {
    paved(ctx, P, 3, '#c9c5bb');
    const [cx, cy] = P(1.5, 1.5, 0);
    const A = 1.25 * 64 / Math.SQRT2, B = 1.25 * 32 / Math.SQRT2, H = 24;
    // outer wall
    ctx.beginPath(); ctx.ellipse(cx, cy, A, B, 0, 0, Math.PI); ctx.lineTo(cx - A, cy - H); ctx.ellipse(cx, cy - H, A, B, 0, Math.PI, 0, true); ctx.closePath();
    ctx.fillStyle = grad(ctx, [cx - A, 0], [cx + A, 0], [[0, '#d8dde2'], [0.4, '#f2f4f6'], [1, '#9aa1a8']]); ctx.fill();
    for (let k = 1; k < 4; k++) {
      ctx.beginPath(); ctx.ellipse(cx, cy - k * 6, A, B, 0, 0.1, Math.PI - 0.1); ctx.strokeStyle = rgba('#2557a7', 0.55); ctx.lineWidth = 1.2; ctx.stroke();
    }
    // stands (concentric rings)
    const rings = ['#2557a7', '#e9ecef', '#2f6fd1', '#d9483b', '#2557a7'];
    for (let k = 0; k < rings.length; k++) {
      const s = 1 - k * 0.07;
      ctx.beginPath(); ctx.ellipse(cx, cy - H + k * 2.6, A * s, B * s, 0, 0, Math.PI * 2); ctx.fillStyle = rings[k]; ctx.fill();
    }
    // field
    ctx.beginPath(); ctx.ellipse(cx, cy - H + 14, A * 0.6, B * 0.6, 0, 0, Math.PI * 2); ctx.fillStyle = '#4fa63f'; ctx.fill();
    for (let k = -3; k <= 3; k++) {
      ctx.beginPath(); ctx.ellipse(cx + k * 6, cy - H + 14, 2.5, B * 0.55 * Math.sqrt(1 - (k / 4) ** 2), 0, 0, Math.PI * 2); ctx.fillStyle = k % 2 ? '#5bb34a' : '#4fa63f'; ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.ellipse(cx, cy - H + 14, 6, 3, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - H + 14 - B * 0.55); ctx.lineTo(cx, cy - H + 14 + B * 0.55); ctx.stroke();
    l.fillStyle = 'rgba(255,250,220,0.45)'; l.beginPath(); l.ellipse(cx, cy - H + 14, A * 0.6, B * 0.6, 0, 0, Math.PI * 2); l.fill();
    // floodlights
    for (const [u, v] of [[0.2, 0.2], [2.8, 0.2], [0.2, 2.8], [2.8, 2.8]]) {
      const [x, y] = P(u, v, 0);
      ctx.strokeStyle = '#7f8790'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 56); ctx.stroke();
      ctx.fillStyle = '#dfe4e8'; ctx.fillRect(x - 4, y - 60, 8, 4);
      l.fillStyle = '#fffbe0'; l.fillRect(x - 4, y - 60, 8, 4);
    }
  });

  building('spire', 2, 330, (ctx, l, P, rand) => {
    paved(ctx, P, 2, '#d8d3c8');
    ground(ctx, P, 0.1, 0.1, 1.9, 1.9, '#c9c3b6');
    tree(ctx, P, 0.15, 1.85, { size: 0.9, rand });
    tree(ctx, P, 1.85, 0.15, { size: 0.9, rand });
    const glass = '#3b6b96';
    let z = 0;
    const tiers = [[0.25, 40], [0.33, 70], [0.42, 70], [0.52, 50], [0.62, 30]];
    for (const [m, h] of tiers) {
      const u0 = m, v0 = m, u1 = 2 - m, v1 = 2 - m;
      box(ctx, P, { u0, v0, u1, v1, z0: z, z1: z + h, color: glass, gradient: true, edge: rgba('#0a1a2a', 0.4) });
      const rows = Math.round(h / 6);
      windowsLeft(ctx, l, P, { u0, u1, v: v1, z0: z + 1, z1: z + h, cols: 8, rows, color: shade(glass, 0.8), rand, lit: 0.45, mx: 0.1, my: 0.2, litColor: '#fff2cc' });
      windowsRight(ctx, l, P, { v0, v1, u: u1, z0: z + 1, z1: z + h, cols: 8, rows, color: shade(glass, 0.62), rand, lit: 0.45, mx: 0.1, my: 0.2, litColor: '#fff2cc' });
      z += h;
      box(ctx, P, { u0: u0 - 0.02, v0: v0 - 0.02, u1: u1 + 0.02, v1: v1 + 0.02, z0: z - 2, z1: z, color: '#d4af37', edge: null });
      quad(l, P, [[u0, v1, z - 2], [u1, v1, z - 2], [u1, v1, z], [u0, v1, z]], '#ffe29a');
    }
    const [sx, sy] = P(1, 1, z);
    ctx.fillStyle = grad(ctx, [sx - 3, 0], [sx + 3, 0], [[0, '#f6e7a8'], [1, '#b8912a']]);
    ctx.beginPath(); ctx.moveTo(sx - 4, sy); ctx.lineTo(sx, sy - 60); ctx.lineTo(sx + 4, sy); ctx.closePath(); ctx.fill();
    l.fillStyle = '#ffffff'; l.beginPath(); l.arc(sx, sy - 60, 2, 0, Math.PI * 2); l.fill();
  });
}

// --- vehicles ---------------------------------------------------------------
function makeCars() {
  const variants = CAR_COLORS.map((c) => ({ color: c, L: 0.15, bus: false }));
  variants.push({ color: '#f5c22b', L: 0.24, bus: true }, { color: '#e9ecef', L: 0.26, bus: true, truck: true });
  variants.forEach((cv, k) => {
    const P = projector(1, 14);
    const W = 0.075;
    const o = { u0: 0.5 - cv.L, v0: 0.5 - W, u1: 0.5 + cv.L, v1: 0.5 + W };
    const draw = (ctx) => {
      const [x, y] = P(0.5, 0.5);
      blob(ctx, x, y + 1, cv.L * 50, 3.5, 0.3);
      if (cv.truck) {
        box(ctx, P, { u0: o.u0, v0: o.v0, u1: o.u1 - 0.08, v1: o.v1, z0: 1, z1: 8, color: '#e9ecef' });
        box(ctx, P, { u0: o.u1 - 0.07, v0: o.v0, u1: o.u1, v1: o.v1, z0: 1, z1: 6, color: '#2f6fd1' });
        return;
      }
      box(ctx, P, { ...o, z0: 1, z1: cv.bus ? 7.5 : 3.4, color: cv.color, edge: rgba('#000', 0.3) });
      if (cv.bus) {
        windowsLeft(ctx, null, P, { u0: o.u0, u1: o.u1, v: o.v1, z0: 4, z1: 7, cols: 5, rows: 1, color: '#2c3e50', rand: Math.random, mx: 0.1, my: 0.1 });
      } else {
        box(ctx, P, { u0: 0.5 - cv.L * 0.55, v0: 0.5 - W * 0.85, u1: 0.5 + cv.L * 0.35, v1: 0.5 + W * 0.85, z0: 3.4, z1: 5.6, color: '#2a3a4a', top: shade(cv.color, 1.05), edge: null });
      }
    };
    const { tex, ctx } = canvasTex(`car_${k}`, P.W, P.H);
    draw(ctx);
    tex.refresh();
  });
  // light overlays: forward (+u) and backward (-u)
  for (const dir of [1, -1]) {
    const P = projector(1, 14);
    const { tex, ctx } = canvasTex(`carlight_${dir > 0 ? 'f' : 'b'}`, P.W, P.H);
    const fu = dir > 0 ? 0.66 : 0.34;
    const [hx, hy] = P(fu, 0.5, 2.5);
    const [ex, ey] = P(fu + dir * 0.32, 0.5, 0);
    const g = ctx.createRadialGradient(hx, hy, 0, ex, ey, 14);
    g.addColorStop(0, 'rgba(255,244,200,0.75)');
    g.addColorStop(1, 'rgba(255,244,200,0)');
    ctx.fillStyle = g;
    poly(ctx, [P(fu, 0.44, 1), P(fu + dir * 0.34, 0.36, 0), P(fu + dir * 0.34, 0.64, 0), P(fu, 0.56, 1)], g);
    ctx.fillStyle = '#fff6d0';
    ctx.beginPath(); ctx.arc(hx, hy, 1.2, 0, Math.PI * 2); ctx.fill();
    const [tx, ty] = P(dir > 0 ? 0.34 : 0.66, 0.575, 2.5);
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath(); ctx.arc(tx, ty, 1, 0, Math.PI * 2); ctx.fill();
    tex.refresh();
  }
}

// --- effects ----------------------------------------------------------------
function radial(key, size, stops) {
  const { tex, ctx } = canvasTex(key, size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
}

function makeEffects() {
  radial('smoke', 32, [[0, 'rgba(235,235,235,0.9)'], [0.5, 'rgba(210,210,210,0.45)'], [1, 'rgba(200,200,200,0)']]);
  radial('flame', 24, [[0, 'rgba(255,250,200,1)'], [0.35, 'rgba(255,170,40,0.9)'], [1, 'rgba(255,60,0,0)']]);
  radial('glow', 48, [[0, 'rgba(255,255,255,0.9)'], [0.4, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
  radial('spark', 8, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
  radial('drop', 6, [[0, 'rgba(230,248,255,1)'], [1, 'rgba(200,235,255,0)']]);
  for (let k = 0; k < 3; k++) {
    const { tex, ctx } = canvasTex(`cloud_${k}`, 300, 140);
    const rand = mulberry32(500 + k);
    for (let p = 0; p < 16; p++) {
      const x = 50 + rand() * 200, y = 50 + rand() * 45, r = 22 + rand() * 32;
      const g = ctx.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.6, 'rgba(250,251,253,0.7)');
      g.addColorStop(1, 'rgba(240,244,250,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    tex.refresh();
  }
  // "no power" icon
  {
    const { tex, ctx } = canvasTex('icon_power', 18, 18);
    ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(9, 9, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = '#ffe14d';
    poly(ctx, [[10, 2.5], [5, 10], [8.5, 10], [7.5, 15.5], [13, 7.5], [9.5, 7.5]], '#ffe14d');
    tex.refresh();
  }
  {
    const { tex, ctx } = canvasTex('icon_road', 18, 18);
    ctx.fillStyle = '#f39c12'; ctx.beginPath(); ctx.arc(9, 9, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', 9, 13);
    tex.refresh();
  }
}

export function generateTextures(s) {
  scene = s;
  makeGround();
  makeRoads();
  makeTrees();
  makeResidential();
  makeCommercial();
  makeIndustrial();
  makeConstruction();
  makeServices();
  makeCars();
  makeEffects();
  return packAtlases();
}

// Render every texture to standalone canvases (no Phaser needed) — used by the catalog page.
export function renderAllCanvases() {
  pending = [];
  makeGround();
  makeRoads();
  makeTrees();
  makeResidential();
  makeCommercial();
  makeIndustrial();
  makeConstruction();
  makeServices();
  makeCars();
  makeEffects();
  const out = new Map(pending.map((p) => [p.key, p.canvas]));
  pending = [];
  return out;
}
