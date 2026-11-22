// Low-level canvas helpers for procedural isometric art.
import { TW, TH } from '../config.js';

export function parse(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

export function shade(c, f) {
  const [r, g, b] = parse(c);
  if (f <= 1) return toHex(r * f, g * f, b * f);
  const t = f - 1;
  return toHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
}
export function mix(a, b, t) {
  const A = parse(a), B = parse(b);
  return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
export const rgba = (c, a) => { const [r, g, b] = parse(c); return `rgba(${r},${g},${b},${a})`; };

// Projector for a footprint of `s` tiles with `H` px of headroom above it.
export function projector(s, H) {
  const W = TW * s;
  const P = (u, v, z = 0) => [W / 2 + (u - v) * TW / 2, H + (u + v) * TH / 2 - z];
  P.W = W; P.H = H + TH * s; P.s = s; P.top = H;
  return P;
}

export function poly(ctx, pts, fill, stroke, lw = 0.6) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

export const quad = (ctx, P, pts, fill, stroke, lw) => poly(ctx, pts.map((p) => P(...p)), fill, stroke, lw);

// Ground diamond for the footprint region [u0,u1]x[v0,v1] at height z.
export function ground(ctx, P, u0, v0, u1, v1, fill, z = 0, stroke) {
  quad(ctx, P, [[u0, v0, z], [u1, v0, z], [u1, v1, z], [u0, v1, z]], fill, stroke);
}

// Gradient fill helper spanning two projected points.
export function grad(ctx, a, b, stops) {
  const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

// Axis-aligned iso box. Faces: left (v = v1), right (u = u1), top (z = z1).
export function box(ctx, P, o) {
  const { u0, v0, u1, v1, z0 = 0, z1, color } = o;
  const left = o.left || shade(color, 0.86);
  const right = o.right || shade(color, 0.66);
  const top = o.top || shade(color, 1.1);
  const edge = o.edge === undefined ? rgba('#000000', 0.18) : o.edge;
  // left face
  quad(ctx, P, [[u0, v1, z0], [u1, v1, z0], [u1, v1, z1], [u0, v1, z1]],
    o.gradient ? grad(ctx, P(u0, v1, z1), P(u1, v1, z0), [[0, shade(left, 1.08)], [1, shade(left, 0.92)]]) : left, edge);
  // right face
  quad(ctx, P, [[u1, v1, z0], [u1, v0, z0], [u1, v0, z1], [u1, v1, z1]],
    o.gradient ? grad(ctx, P(u1, v1, z1), P(u1, v0, z0), [[0, shade(right, 1.06)], [1, shade(right, 0.9)]]) : right, edge);
  if (!o.noTop) quad(ctx, P, [[u0, v0, z1], [u1, v0, z1], [u1, v1, z1], [u0, v1, z1]], top, edge);
}

// Windows on the left face (v = v) between u0..u1 and z0..z1.
export function windowsLeft(ctx, lctx, P, o) {
  const { u0, u1, v, z0, z1, cols, rows, color, lit = 0.6, rand, mx = 0.22, my = 0.28, litColor = '#ffd98a' } = o;
  const du = (u1 - u0) / cols, dz = (z1 - z0) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ua = u0 + du * c + du * mx, ub = u0 + du * (c + 1) - du * mx;
      const za = z0 + dz * r + dz * my, zb = z0 + dz * (r + 1) - dz * (my * 0.6);
      const pts = [[ua, v, za], [ub, v, za], [ub, v, zb], [ua, v, zb]];
      quad(ctx, P, pts, color);
      if (lctx && rand() < lit) quad(lctx, P, pts, rand() < 0.15 ? '#fff3d6' : litColor);
    }
  }
}

export function windowsRight(ctx, lctx, P, o) {
  const { v0, v1, u, z0, z1, cols, rows, color, lit = 0.6, rand, mx = 0.22, my = 0.28, litColor = '#ffd98a' } = o;
  const dv = (v1 - v0) / cols, dz = (z1 - z0) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const va = v1 - dv * c - dv * mx, vb = v1 - dv * (c + 1) + dv * mx;
      const za = z0 + dz * r + dz * my, zb = z0 + dz * (r + 1) - dz * (my * 0.6);
      const pts = [[u, va, za], [u, vb, za], [u, vb, zb], [u, va, zb]];
      quad(ctx, P, pts, color);
      if (lctx && rand() < lit) quad(lctx, P, pts, rand() < 0.15 ? '#fff3d6' : litColor);
    }
  }
}

// Vertical cylinder centered at (u, v) with radius r (tile units).
export function cylinder(ctx, P, o) {
  const { u, v, r, z0 = 0, z1, color, topColor } = o;
  const a = r * TW / Math.SQRT2, b = r * TH / Math.SQRT2;
  const [cx, cy0] = P(u, v, z0);
  const [, cy1] = P(u, v, z1);
  ctx.beginPath();
  ctx.ellipse(cx, cy0, a, b, 0, 0, Math.PI);
  ctx.lineTo(cx - a, cy1);
  ctx.ellipse(cx, cy1, a, b, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fillStyle = grad(ctx, [cx - a, 0], [cx + a, 0], [[0, shade(color, 1.05)], [0.35, shade(color, 1.18)], [1, shade(color, 0.62)]]);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx, cy1, a, b, 0, 0, Math.PI * 2);
  ctx.fillStyle = topColor || shade(color, 1.12);
  ctx.fill();
  ctx.strokeStyle = rgba('#000000', 0.15);
  ctx.lineWidth = 0.5;
  ctx.stroke();
  return { a, b, cx, cy1 };
}

// Soft elliptical shadow on the ground.
export function blob(ctx, x, y, rx, ry, alpha = 0.25) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  ctx.translate(-x, -y);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Leafy tree at ground point (u, v).
export function tree(ctx, P, u, v, o = {}) {
  const { size = 1, color = '#4f8f3a', rand = Math.random, type = 'round' } = o;
  const [x, y] = P(u, v, 0);
  blob(ctx, x + 2 * size, y, 9 * size, 4 * size, 0.28);
  if (type === 'pine') {
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(x - 0.8 * size, y - 5 * size, 1.6 * size, 5 * size);
    const tiers = 3;
    for (let t = 0; t < tiers; t++) {
      const w = (8 - t * 2) * size, base = y - (4 + t * 6) * size, h = 10 * size;
      poly(ctx, [[x - w, base], [x, base - h], [x + w, base]], shade(color, 0.85 + t * 0.08));
      poly(ctx, [[x, base], [x, base - h], [x + w, base]], rgba('#0b2a12', 0.25));
    }
    return;
  }
  ctx.fillStyle = '#6b4a2f';
  ctx.fillRect(x - 1 * size, y - 7 * size, 2 * size, 7 * size);
  const puffs = [[0, -14, 7], [-4.5, -10, 5.5], [4.5, -10.5, 5.5], [0, -8, 6], [-2, -17, 4.5], [3, -16, 4]];
  for (const [dx, dy, r] of puffs) {
    const px = x + dx * size, py = y + dy * size, pr = r * size * (0.9 + rand() * 0.2);
    const g = ctx.createRadialGradient(px - pr * 0.4, py - pr * 0.5, pr * 0.1, px, py, pr);
    g.addColorStop(0, shade(color, 1.35));
    g.addColorStop(0.6, color);
    g.addColorStop(1, shade(color, 0.7));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function bush(ctx, P, u, v, color = '#5b9a3e', s = 1) {
  const [x, y] = P(u, v, 0);
  blob(ctx, x + 1, y, 5 * s, 2.5 * s, 0.22);
  for (const [dx, dy, r] of [[-2, -2, 2.6], [2, -2, 2.6], [0, -3.5, 2.8]]) {
    const g = ctx.createRadialGradient(x + dx * s - 1, y + dy * s - 1, 0.3, x + dx * s, y + dy * s, r * s);
    g.addColorStop(0, shade(color, 1.3));
    g.addColorStop(1, shade(color, 0.75));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
    ctx.fill();
  }
}
