// Building catalog: renders every procedural texture with its game stats.
import { renderAllCanvases, META, VARIANTS, CAR_COLORS } from '../render/textures.js';
import { BUILDINGS, CAPACITY, POWER_USE, COSTS, MILESTONES, RES } from '../config.js';

const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const range = (prefix, n) => Array.from({ length: n }, (_, k) => `${prefix}_${k}`);

const ZONE_INFO = {
  R: { name: 'Residential', color: 'var(--r)', unit: 'residents', titles: ['Family homes', 'Apartments', 'Residential tower'],
    blurb: 'Where your citizens live. Grows denser with water, high land value and low pollution.' },
  C: { name: 'Commercial', color: 'var(--c)', unit: 'jobs', titles: ['Corner shops', 'Office block', 'Corporate tower'],
    blurb: 'Shops and offices. Thrives on population, land value and safe streets.' },
  I: { name: 'Industrial', color: 'var(--i)', unit: 'jobs', titles: ['Workshops', 'Factory', 'Heavy industry'],
    blurb: 'Factories that create jobs — and pollution. Educated workers unlock heavy industry.' },
};
const LEVEL_REQ = [
  'Road access + power',
  `Water + ${MILESTONES[1].name} milestone`,
  `Water + ${MILESTONES[2].name} milestone + high land value`,
];
const L3_REQ = { R: LEVEL_REQ[2], C: LEVEL_REQ[2], I: `Water + ${MILESTONES[2].name} milestone + school nearby` };

function zoneSection(z) {
  const info = ZONE_INFO[z];
  return {
    id: z, title: info.name, accent: info.color, blurb: info.blurb,
    items: [1, 2, 3].map((lvl) => ({
      name: info.titles[lvl - 1],
      tag: `Level ${lvl}`,
      keys: range(`${z}${lvl}`, VARIANTS[`${z}${lvl}`]),
      desc: lvl === 1 ? 'Appears on zoned lots when there is demand.' : lvl === 2 ? 'Upgrades once water arrives and the town grows.' : 'The tallest form this zone can take.',
      stats: [
        [info.unit[0].toUpperCase() + info.unit.slice(1), CAPACITY[z][lvl]],
        ['Power use', `${POWER_USE[lvl]} MW`],
        ['Zoning cost', `${money(COSTS.zone)}/tile`],
      ],
      req: lvl === 3 ? L3_REQ[z] : LEVEL_REQ[lvl - 1],
    })),
  };
}

function buildingItem(key) {
  const b = BUILDINGS[key];
  const stats = [['Cost', money(b.cost)], ['Upkeep', `${money(b.upkeep)}/mo`], ['Footprint', `${b.size}×${b.size}`]];
  if (b.power) stats.push(['Output', `${b.power.toLocaleString()} MW`]);
  if (b.radius) stats.push(['Radius', `${b.radius} tiles`]);
  if (b.pollution) stats.push(['Pollution', 'High']);
  return { name: b.name, tag: b.unlock ? `Unlocks at ${b.unlock}` : 'Available from start', locked: !!b.unlock, keys: [key], desc: b.desc, stats };
}

const SECTIONS = [
  zoneSection('R'),
  zoneSection('C'),
  zoneSection('I'),
  { id: 'utilities', title: 'Utilities', accent: '#facc15', blurb: 'Power reaches tiles connected to the plant; roads deliver it to lots within 3 tiles. Water towers serve their radius.',
    items: ['wind', 'coal', 'solar', 'watertower'].map(buildingItem) },
  { id: 'services', title: 'Services', accent: '#38bdf8', blurb: 'Coverage raises land value and approval. Services need power to operate.',
    items: ['police', 'fire', 'school', 'hospital'].map(buildingItem) },
  { id: 'parks', title: 'Parks & Landmarks', accent: '#34d399', blurb: 'Green space and icons that make neighborhoods desirable.',
    items: ['park', 'plaza', 'stadium', 'spire'].map(buildingItem) },
  { id: 'infra', title: 'Infrastructure', accent: '#cbd5e1', blurb: 'Roads auto-connect; intersections get crosswalks. Roads over water become bridges.',
    items: [
      { name: 'Road', tag: 'Auto-tiling', keys: ['road_5', 'road_10', 'road_3', 'road_7', 'road_15', 'road_1'], desc: 'Straights, corners, T-junctions, crossroads and dead ends.', stats: [['Cost', `${money(COSTS.road)}/tile`], ['Upkeep', '$0.35/tile/mo']] },
      { name: 'Bridge', tag: 'Over water', keys: ['bridge_5', 'bridge_10', 'bridge_15'], desc: 'Drag a road across rivers and lakes.', stats: [['Cost', `${money(COSTS.bridge)}/tile`]] },
      { name: 'Construction site', tag: 'Temporary', keys: ['cons_0', 'cons_1'], desc: 'Shown for a few days while a building goes up.', stats: [['Duration', '3–6 days']] },
      { name: 'Zoned lots', tag: 'Empty', keys: ['zone_R', 'zone_C', 'zone_I'], desc: 'Dashed borders mark land waiting to develop.', stats: [['Cost', `${money(COSTS.zone)}/tile`]] },
    ] },
  { id: 'nature', title: 'Terrain & Nature', accent: '#86c063', blurb: 'Generated landscapes: coasts, rivers, beaches and forests. Water and trees raise land value.',
    items: [
      { name: 'Woodland', tag: 'Bulldoze to clear', keys: range('trees', 6).map((k, i) => `trees_${i + 1}`), desc: 'Deciduous and pine clusters.', stats: [['Clear cost', money(COSTS.bulldoze)]] },
      { name: 'Ground', tag: 'Terrain', keys: ['grass_0', 'grass_1', 'grass_3', 'sand'], desc: 'Grass meadows (some with wildflowers) and sandy beaches.', stats: [] },
      { name: 'Water', tag: 'Animated', keys: ['water_d_0', 'water_s_0_0', 'water_s_3_1', 'water_s_12_2'], desc: 'Deep water, shallows and foamy shorelines.', stats: [] },
    ] },
  { id: 'vehicles', title: 'Vehicles', accent: '#f472b6', blurb: 'Traffic grows with population and jobs. Headlights come on at night.',
    items: [
      { name: 'Cars', tag: 'Traffic', keys: range('car', CAR_COLORS.length), desc: 'Ten paint colors cruising your streets.', stats: [] },
      { name: 'Bus & truck', tag: 'Traffic', keys: [`car_${CAR_COLORS.length}`, `car_${CAR_COLORS.length + 1}`], desc: 'Occasional larger vehicles.', stats: [] },
    ] },
];

// --- rendering --------------------------------------------------------------
let canvases;
let night = false;

function composite(key) {
  const src = canvases.get(key);
  const meta = META[key];
  if (!meta?.hub) return src;
  // Add the wind turbine rotor at its hub.
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const blades = canvases.get('wind_blades');
  const [hx, hy] = meta.hub;
  const x = (src.width / RES / 2 + hx) * RES, y = (src.height / RES + hy) * RES;
  const size = blades.width * 1.1;
  ctx.drawImage(blades, x - size / 2, y - size / 2, size, size);
  return c;
}

function preview(key, maxW, maxH) {
  const base = composite(key);
  const lights = canvases.get(key + '_n');
  const w = base.width / RES, h = base.height / RES;
  const s = Math.min(2.2, maxW / w, maxH / h);
  const wrap = document.createElement('div');
  wrap.className = 'pv';
  wrap.style.width = `${w * s}px`;
  wrap.style.height = `${h * s}px`;
  const img = cloneCanvas(base);
  img.className = 'base';
  wrap.appendChild(img);
  if (lights && !key.startsWith('trees')) {
    const l = cloneCanvas(lights);
    l.className = 'lights';
    wrap.appendChild(l);
  }
  return wrap;
}

function cloneCanvas(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

function card(item, accent) {
  const el = document.createElement('article');
  el.className = 'card';
  el.style.setProperty('--accent', accent);
  const stage = document.createElement('div');
  stage.className = 'stage';
  const show = (k) => { stage.replaceChildren(preview(k, 250, 230)); };
  show(item.keys[0]);
  el.appendChild(stage);

  if (item.keys.length > 1) {
    const strip = document.createElement('div');
    strip.className = 'strip';
    item.keys.forEach((k, idx) => {
      const b = document.createElement('button');
      b.className = 'thumb' + (idx === 0 ? ' active' : '');
      b.title = `Variant ${idx + 1}`;
      b.appendChild(preview(k, 44, 44));
      b.addEventListener('click', () => {
        strip.querySelectorAll('.thumb').forEach((t) => t.classList.remove('active'));
        b.classList.add('active');
        show(k);
      });
      strip.appendChild(b);
    });
    el.appendChild(strip);
  }

  const body = document.createElement('div');
  body.className = 'body';
  body.innerHTML = `
    <div class="head"><h3>${item.name}</h3><span class="tag ${item.locked ? 'locked' : ''}">${item.tag}</span></div>
    <p>${item.desc}</p>
    ${item.stats.length ? `<dl>${item.stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}
    ${item.req ? `<div class="req"><span>Requires</span>${item.req}</div>` : ''}
    ${item.keys.length > 1 ? `<div class="count">${item.keys.length} variants</div>` : ''}`;
  el.appendChild(body);
  return el;
}

function render() {
  const app = document.getElementById('app');
  app.replaceChildren();
  const nav = document.getElementById('nav');
  nav.innerHTML = SECTIONS.map((s) => `<a href="#${s.id}" style="--accent:${s.accent}">${s.title.split(' &')[0]}</a>`).join('');

  const total = SECTIONS.reduce((n, s) => n + s.items.reduce((m, it) => m + it.keys.length, 0), 0);
  const hero = document.createElement('section');
  hero.className = 'hero';
  hero.innerHTML = `
    <h1>Everything you can build in Skyhaven</h1>
    <p>${total} sprites, every one drawn procedurally in your browser — no image files. Click thumbnails to see variants, and switch to night to see the lights.</p>`;
  app.appendChild(hero);

  for (const s of SECTIONS) {
    const sec = document.createElement('section');
    sec.className = 'section';
    sec.id = s.id;
    sec.innerHTML = `<div class="sec-head" style="--accent:${s.accent}"><h2>${s.title}</h2><p>${s.blurb}</p></div>`;
    const grid = document.createElement('div');
    grid.className = 'grid';
    s.items.forEach((it) => grid.appendChild(card(it, s.accent)));
    sec.appendChild(grid);
    app.appendChild(sec);
  }
}

function setNight(v) {
  night = v;
  document.body.classList.toggle('night', v);
  document.querySelectorAll('#timeSeg button').forEach((b) => b.classList.toggle('active', (b.dataset.t === 'night') === v));
}

document.querySelectorAll('#timeSeg button').forEach((b) => b.addEventListener('click', () => setNight(b.dataset.t === 'night')));

// Let the loading message paint before the (synchronous) drawing work.
requestAnimationFrame(() => setTimeout(() => {
  canvases = renderAllCanvases();
  render();
}, 30));
