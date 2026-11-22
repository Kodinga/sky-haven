import {
  KIND, ZONE, ZONE_KEYS, TERRAIN, BUILDINGS, CAPACITY, POWER_USE, COSTS, ROAD_UPKEEP, START_MONEY,
  DEFAULT_TAX, DAYS_PER_MONTH, SPEEDS, MILESTONES, LEVEL_UNLOCK, MONTHS, START_YEAR,
} from '../config.js';
import { World, bKey } from './World.js';
import { mulberry32 } from './noise.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const NEWS = [
  'Local bakery wins regional croissant award.',
  'Residents report record number of dogs in parks.',
  'City council debates the official city bird. Pigeon leads polls.',
  'New coffee shop opens; line already around the block.',
  'Weekend farmers market draws big crowds.',
  'Commuters praise the sunrise view over the bay.',
  'Mayor spotted jogging at 6am. Approval of mornings rises.',
  'Indie band from the east side signs a record deal.',
  'Survey: 87% of citizens can name at least one street.',
  'Food truck rally declared "a delicious success".',
  'Lost cat found safe after three days on a rooftop.',
  'Library launches late-night reading club.',
  'Startup promises "Uber for lawn gnomes". Investors intrigued.',
  'Sunset photos from the waterfront go viral.',
];

export class Simulation {
  constructor(world, opts = {}) {
    this.world = world || new World().generate(opts.seed);
    this.cityName = opts.cityName || 'Skyhaven';
    this.money = opts.money ?? START_MONEY;
    this.day = opts.day ?? 0;
    this.tax = opts.tax ?? DEFAULT_TAX;
    this.milestone = opts.milestone ?? 0;
    this.history = opts.history ?? [];
    this.speed = 1;
    this.acc = 0;
    this.rand = mulberry32((opts.seed ?? 1) ^ 0x9e3779b9);
    this.listeners = {};
    this.demand = { R: 1, C: 0.2, I: 0.8 };
    this.stats = {
      pop: 0, jobsC: 0, jobsI: 0, workers: 0, unemployment: 0, powerCap: 0, powerUse: 0,
      approval: 60, roads: 0, buildings: 0,
    };
    this.budget = { income: {}, expense: {}, net: 0 };
    this.advice = [];
    this.lastFireToast = -999;
    this.precompute();
    this.recompute();
    this.computeStats();
    this.estimateBudget();
  }

  // --- events -------------------------------------------------------------
  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); }
  emit(evt, data) { (this.listeners[evt] || []).forEach((fn) => fn(data)); }
  toast(text, kind = 'info') { this.emit('toast', { text, kind }); }

  // --- time ---------------------------------------------------------------
  get dateLabel() {
    const m = Math.floor(this.day / DAYS_PER_MONTH);
    return `${MONTHS[m % 12]} ${START_YEAR + Math.floor(m / 12)}`;
  }
  get dayOfMonth() { return (this.day % DAYS_PER_MONTH) + 1; }

  advance(dt) {
    if (!this.speed) return;
    const per = SPEEDS[this.speed];
    this.acc += dt;
    let steps = 0;
    while (this.acc >= per && steps < 30) {
      this.acc -= per;
      this.step();
      steps++;
    }
    if (steps >= 30) this.acc = 0;
  }

  step() {
    this.day++;
    this.grow();
    this.fires();
    this.computeStats();
    if (this.day % 5 === 0) this.recompute();
    if (this.day % DAYS_PER_MONTH === 0) this.endMonth();
    this.emit('day');
  }

  // --- tools --------------------------------------------------------------
  isUnlocked(key) {
    const u = BUILDINGS[key]?.unlock;
    if (!u) return true;
    return this.milestone >= MILESTONES.findIndex((m) => m.name === u);
  }

  toolCost(tool, cells) {
    const w = this.world;
    let cost = 0, count = 0;
    for (const [x, y] of cells) {
      if (!w.inBounds(x, y)) continue;
      const i = w.idx(x, y);
      if (tool.type === 'road') {
        if (!w.canRoad(x, y) || w.kind[i] === KIND.ROAD) continue;
        cost += w.terrain[i] === TERRAIN.WATER ? COSTS.bridge : COSTS.road;
      } else if (tool.type === 'zone') {
        if (!w.canZone(x, y)) continue;
        if (w.kind[i] === KIND.ZONE && (w.zone[i] === tool.zone || w.level[i] > 0 || w.build[i] > 0)) continue;
        cost += COSTS.zone;
      } else if (tool.type === 'bulldoze') {
        if (w.kind[i] === KIND.EMPTY && !w.trees[i]) continue;
        cost += COSTS.bulldoze;
      } else if (tool.type === 'building') {
        if (!w.canPlaceBuilding(tool.key, x, y)) continue;
        cost += BUILDINGS[tool.key].cost;
      }
      count++;
    }
    return { cost, count };
  }

  applyTool(tool, cells) {
    const w = this.world;
    if (tool.type === 'building' && !this.isUnlocked(tool.key)) {
      this.toast(`${BUILDINGS[tool.key].name} unlocks at ${BUILDINGS[tool.key].unlock}.`, 'warn');
      return { spent: 0, count: 0 };
    }
    let spent = 0, count = 0, broke = false;
    for (const [x, y] of cells) {
      if (!w.inBounds(x, y)) continue;
      const { cost, count: c } = this.toolCost(tool, [[x, y]]);
      if (!c) continue;
      if (cost > this.money) { broke = true; break; }
      const i = w.idx(x, y);
      if (tool.type === 'road') w.setRoad(x, y);
      else if (tool.type === 'zone') w.setZone(x, y, tool.zone);
      else if (tool.type === 'bulldoze') {
        if (w.kind[i] === KIND.EMPTY && !w.trees[i]) continue;
        w.clear(x, y);
      } else if (tool.type === 'building') w.placeBuilding(tool.key, x, y);
      this.money -= cost;
      spent += cost;
      count++;
    }
    if (broke) this.toast('Not enough funds for that.', 'warn');
    if (count) {
      this.recompute();
      this.computeStats();
      this.estimateBudget();
      this.emit('changed', { tool, spent, count });
    }
    return { spent, count };
  }

  // --- derived maps -------------------------------------------------------
  precompute() {
    const w = this.world;
    this.waterNear = new Float32Array(w.n);
    for (let y = 0; y < w.h; y++) {
      for (let x = 0; x < w.w; x++) {
        let best = 99;
        for (let dy = -4; dy <= 4; dy++) {
          for (let dx = -4; dx <= 4; dx++) {
            const nx = x + dx, ny = y + dy;
            if (w.inBounds(nx, ny) && w.terrain[w.idx(nx, ny)] === TERRAIN.WATER) {
              best = Math.min(best, Math.hypot(dx, dy));
            }
          }
        }
        this.waterNear[w.idx(x, y)] = best > 4.5 ? 0 : 1 - best / 4.5;
      }
    }
  }

  // Iterate tiles within radius r of the footprint center of root tile.
  forRadius(rootIdx, size, r, fn) {
    const w = this.world;
    const [rx, ry] = w.xy(rootIdx);
    const cx = rx + size / 2 - 0.5, cy = ry + size / 2 - 0.5;
    const R = Math.ceil(r);
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
      for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
        if (!w.inBounds(x, y)) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r) fn(w.idx(x, y), d);
      }
    }
  }

  recompute() {
    const w = this.world;
    const n = w.n;
    w.access.fill(0);
    w.power.fill(0);
    w.water.fill(0);
    for (const k of ['pollution', 'crime', 'fireCover', 'police', 'health', 'education', 'fun', 'landValue', 'traffic']) {
      w[k].fill(0);
    }

    // Road access (within 2 tiles, manhattan).
    let roads = 0;
    for (let i = 0; i < n; i++) {
      if (w.kind[i] !== KIND.ROAD) continue;
      roads++;
      const [x, y] = w.xy(i);
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > 2) continue;
          const nx = x + dx, ny = y + dy;
          if (w.inBounds(nx, ny)) w.access[w.idx(nx, ny)] = 1;
        }
      }
    }
    this.stats.roads = roads;

    // Collect building roots.
    const roots = [];
    for (let i = 0; i < n; i++) if (w.kind[i] === KIND.BUILDING && w.root[i] === i) roots.push(i);

    // Power grid: components of conductive tiles, seeded from plants.
    const visited = new Uint8Array(n);
    const queue = new Int32Array(n);
    let totalCap = 0, totalUse = 0;
    const plants = roots.filter((r) => BUILDINGS[bKey(w.btype[r])].power);
    for (const p of plants) {
      if (visited[p]) continue;
      let head = 0, tail = 0;
      queue[tail++] = p;
      visited[p] = 1;
      while (head < tail) {
        const i = queue[head++];
        const [x, y] = w.xy(i);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (!w.inBounds(nx, ny)) continue;
          const j = w.idx(nx, ny);
          if (visited[j] || w.kind[j] === KIND.EMPTY) continue;
          visited[j] = 1;
          queue[tail++] = j;
        }
      }
      let cap = 0;
      for (let q = 0; q < tail; q++) {
        const i = queue[q];
        if (w.kind[i] === KIND.BUILDING && w.root[i] === i) cap += BUILDINGS[bKey(w.btype[i])].power || 0;
      }
      totalCap += cap;
      let left = cap;
      for (let q = 0; q < tail; q++) {
        const i = queue[q];
        let use = 0;
        if (w.kind[i] === KIND.ZONE) use = POWER_USE[w.level[i]];
        else if (w.kind[i] === KIND.BUILDING && !BUILDINGS[bKey(w.btype[i])].power) use = 1;
        if (w.kind[i] === KIND.ROAD) { w.power[i] = left > 0 ? 1 : 0; continue; }
        if (left >= use && left > 0) {
          left -= use;
          totalUse += use;
          w.power[i] = 1;
        } else totalUse += use;
      }
    }
    this.stats.powerCap = totalCap;
    this.stats.powerUse = totalUse;

    // Services & coverage.
    for (const r of roots) {
      const key = bKey(w.btype[r]);
      const b = BUILDINGS[key];
      const on = w.power[r] || b.cat === 'park' || b.power;
      if (!on) continue;
      const apply = (map, rad) => this.forRadius(r, b.size, rad, (i, d) => {
        map[i] = Math.max(map[i], 1 - d / rad);
      });
      if (key === 'watertower') this.forRadius(r, 1, b.radius, (i) => { w.water[i] = 1; });
      if (key === 'police') apply(w.police, b.radius);
      if (key === 'fire') apply(w.fireCover, b.radius);
      if (key === 'school') apply(w.education, b.radius);
      if (key === 'hospital') apply(w.health, b.radius);
      if (b.cat === 'park' || b.cat === 'landmark') apply(w.fun, b.radius);
      if (b.pollution) {
        this.forRadius(r, b.size, b.pollutionRadius, (i, d) => {
          w.pollution[i] += b.pollution * (1 - d / b.pollutionRadius);
        });
      }
    }

    // Industrial pollution + density-driven crime.
    for (let i = 0; i < n; i++) {
      if (w.kind[i] !== KIND.ZONE || !w.level[i]) continue;
      const lvl = w.level[i];
      if (w.zone[i] === ZONE.I) {
        const rad = 3 + lvl;
        this.forRadius(i, 1, rad, (j, d) => { w.pollution[j] += 0.16 * lvl * (1 - d / rad); });
      } else {
        this.forRadius(i, 1, 4, (j, d) => { w.crime[j] += 0.035 * lvl * (1 - d / 4); });
      }
    }

    // Land value.
    for (let i = 0; i < n; i++) {
      w.pollution[i] = clamp(w.pollution[i], 0, 1);
      w.crime[i] = clamp(w.crime[i] * (1 - w.police[i] * 0.85), 0, 1);
      let lv = 0.3 + this.waterNear[i] * 0.18 + w.fun[i] * 0.35 + w.education[i] * 0.1 +
        w.health[i] * 0.08 + w.police[i] * 0.06 - w.pollution[i] * 0.75 - w.crime[i] * 0.35;
      if (w.terrain[i] === TERRAIN.SAND) lv += 0.04;
      w.landValue[i] = clamp(lv, 0, 1);
    }
  }

  computeStats() {
    const w = this.world;
    let pop = 0, jobsC = 0, jobsI = 0, buildings = 0, unpowered = 0, developed = 0;
    let resPol = 0, resCrime = 0, resServ = 0, resFun = 0, resTiles = 0;
    for (let i = 0; i < w.n; i++) {
      if (w.kind[i] !== KIND.ZONE) continue;
      const lvl = w.level[i];
      if (!lvl || w.build[i]) continue;
      buildings++;
      developed++;
      if (!w.power[i]) unpowered++;
      const z = w.zone[i];
      if (z === ZONE.R) {
        pop += CAPACITY.R[lvl];
        resTiles++;
        resPol += w.pollution[i];
        resCrime += w.crime[i];
        resFun += w.fun[i];
        resServ += (w.police[i] + w.fireCover[i] + w.health[i] + w.education[i]) / 4;
      } else if (z === ZONE.C) jobsC += CAPACITY.C[lvl];
      else if (z === ZONE.I) jobsI += CAPACITY.I[lvl];
    }
    const workers = pop * 0.55;
    const jobs = jobsC + jobsI;
    const s = this.stats;
    Object.assign(s, { pop, jobsC, jobsI, workers, buildings });
    s.unemployment = workers > 0 ? clamp((workers - jobs) / workers, 0, 1) : 0;

    // Approval
    const rt = Math.max(1, resTiles);
    let approval = 62 + (DEFAULT_TAX - this.tax) * 3.2 - s.unemployment * 45
      - (resPol / rt) * 40 - (resCrime / rt) * 30 + (resServ / rt) * 28 + (resFun / rt) * 14
      - (developed ? unpowered / developed : 0) * 35;
    if (this.money < 0) approval -= 10;
    s.approval = Math.round(clamp(approval, 0, 100));

    // RCI demand
    const taxAdj = (DEFAULT_TAX - this.tax) * 0.05;
    const appAdj = (s.approval - 55) / 250;
    const dR = (jobs * 1.15 + 60 - workers) / (workers * 0.4 + 60);
    const desiredC = pop * 0.18 + 4;
    const desiredI = pop * 0.24 + 25;
    const dC = (desiredC - jobsC) / (desiredC * 0.5 + 15);
    const dI = (desiredI - jobsI) / (desiredI * 0.5 + 15);
    this.demand.R = clamp(dR + taxAdj + appAdj, -1, 1);
    this.demand.C = clamp(dC + taxAdj, -1, 1);
    this.demand.I = clamp(dI + taxAdj, -1, 1);
  }

  // --- growth -------------------------------------------------------------
  grow() {
    const w = this.world;
    const rand = this.rand;
    for (let i = 0; i < w.n; i++) {
      if (w.kind[i] !== KIND.ZONE) continue;
      if (w.build[i] > 0) {
        w.build[i]--;
        if (w.build[i] === 0) w.markDirty(i);
        continue;
      }
      if (w.fire[i]) continue;
      const lvl = w.level[i];
      if (!w.power[i] || !w.access[i]) {
        if (lvl > 0 && w.noPowerDays[i] < 255) w.noPowerDays[i]++;
        if (lvl > 0 && w.noPowerDays[i] > 45 && rand() < 0.02) this.setLevel(i, lvl - 1);
        continue;
      }
      w.noPowerDays[i] = 0;
      if (rand() > 0.1) continue;
      const zk = ZONE_KEYS[w.zone[i]];
      const dem = this.demand[zk];
      const lv = w.landValue[i];
      let des;
      if (zk === 'R') des = lv + dem * 0.5 - w.pollution[i] * 0.9 - w.crime[i] * 0.5 + w.fun[i] * 0.2;
      else if (zk === 'C') des = lv * 0.8 + dem * 0.5 - w.crime[i] * 0.4 + w.education[i] * 0.1;
      else des = 0.45 + dem * 0.5 - lv * 0.25 + w.education[i] * 0.15;

      let maxLvl = 1;
      if (w.water[i] && this.milestone >= LEVEL_UNLOCK[2]) maxLvl = 2;
      const l3ok = zk === 'I' ? w.education[i] > 0.15 : lv > 0.5;
      if (maxLvl === 2 && l3ok && this.milestone >= LEVEL_UNLOCK[3]) maxLvl = 3;

      const thresh = [0.05, 0.42, 0.62][lvl] ?? 9;
      if (dem > 0.02 && lvl < maxLvl && des > thresh && rand() < 0.12 + dem * 0.35) {
        this.setLevel(i, lvl + 1, true);
      } else if (lvl > 0 && (lvl > maxLvl || dem < -0.45 || des < -0.15) && rand() < 0.05) {
        this.setLevel(i, lvl - 1);
      }
    }
  }

  setLevel(i, lvl, construct = false) {
    const w = this.world;
    w.level[i] = lvl;
    w.variant[i] = Math.floor(this.rand() * 256);
    w.build[i] = construct ? 3 + Math.floor(this.rand() * 4) : 0;
    w.markDirty(i);
  }

  // --- fires --------------------------------------------------------------
  fires() {
    const w = this.world;
    const rand = this.rand;
    const allowIgnite = this.stats.pop > 300;
    for (let i = 0; i < w.n; i++) {
      const developed = (w.kind[i] === KIND.ZONE && w.level[i] > 0 && !w.build[i]) ||
        (w.kind[i] === KIND.BUILDING && w.root[i] === i && BUILDINGS[bKey(w.btype[i])].cat !== 'park');
      if (!developed) continue;
      if (w.fire[i]) {
        const covered = w.fireCover[i] > 0.2;
        w.fire[i] = Math.max(0, w.fire[i] - (covered ? 3 : 1));
        if (w.fire[i] === 0) {
          w.markDirty(i);
          if (covered) this.emit('extinguished', i);
          else this.burnDown(i);
        } else if (!covered && rand() < 0.04) {
          const [x, y] = w.xy(i);
          const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rand() * 4)];
          if (w.inBounds(x + d[0], y + d[1])) {
            const j = w.idx(x + d[0], y + d[1]);
            if (w.kind[j] === KIND.ZONE && w.level[j] && !w.fire[j]) { w.fire[j] = 14; w.markDirty(j); }
          }
        }
      } else if (allowIgnite && w.kind[i] === KIND.ZONE) {
        const risk = 0.000025 * w.level[i] * (1 - w.fireCover[i]) * (w.zone[i] === ZONE.I ? 2 : 1);
        if (rand() < risk) {
          w.fire[i] = 14;
          w.markDirty(i);
          if (this.day - this.lastFireToast > 10) {
            this.lastFireToast = this.day;
            const [x, y] = w.xy(i);
            this.emit('alert', { text: 'Fire! A building is burning. Fire stations put fires out.', kind: 'danger', x, y });
          }
        }
      }
    }
  }

  burnDown(i) {
    const w = this.world;
    if (w.kind[i] === KIND.ZONE) {
      w.level[i] = 0;
      w.build[i] = 0;
      w.markDirty(i);
    }
    this.emit('burned', i);
  }

  // --- budget -------------------------------------------------------------
  estimateBudget() {
    const w = this.world;
    const s = this.stats;
    const t = this.tax / 100;
    const income = {
      Residential: Math.round(s.pop * t * 10),
      Commercial: Math.round(s.jobsC * t * 15),
      Industrial: Math.round(s.jobsI * t * 13),
    };
    const expense = { Roads: Math.round(s.roads * ROAD_UPKEEP), Power: 0, Water: 0, Services: 0, Parks: 0 };
    for (let i = 0; i < w.n; i++) {
      if (w.kind[i] !== KIND.BUILDING || w.root[i] !== i) continue;
      const b = BUILDINGS[bKey(w.btype[i])];
      const cat = { power: 'Power', water: 'Water', service: 'Services', park: 'Parks', landmark: 'Parks' }[b.cat];
      expense[cat] += b.upkeep;
    }
    const inc = Object.values(income).reduce((a, b) => a + b, 0);
    const exp = Object.values(expense).reduce((a, b) => a + b, 0);
    this.budget = { income, expense, totalIncome: inc, totalExpense: exp, net: inc - exp };
    return this.budget;
  }

  endMonth() {
    const b = this.estimateBudget();
    this.money += b.net;
    this.history.push({ m: Math.floor(this.day / DAYS_PER_MONTH), money: Math.round(this.money), pop: this.stats.pop, net: b.net });
    if (this.history.length > 120) this.history.shift();
    this.checkMilestones();
    this.computeAdvice();
    if (this.money < 0) this.toast('The treasury is in the red! Raise taxes or cut costs.', 'danger');
    if (this.rand() < 0.35 && this.stats.pop > 40) this.emit('news', NEWS[Math.floor(this.rand() * NEWS.length)]);
    this.emit('month', b);
  }

  checkMilestones() {
    while (this.milestone + 1 < MILESTONES.length && this.stats.pop >= MILESTONES[this.milestone + 1].pop) {
      this.milestone++;
      const m = MILESTONES[this.milestone];
      this.money += m.bonus;
      const unlocks = Object.entries(BUILDINGS).filter(([, b]) => b.unlock === m.name).map(([, b]) => b.name);
      this.emit('milestone', { ...m, unlocks });
    }
  }

  computeAdvice() {
    const w = this.world;
    const s = this.stats;
    const out = [];
    let zones = 0, lvl1 = 0, waterTowers = 0, plants = 0, police = 0, fire = 0, resPol = 0, resN = 0;
    for (let i = 0; i < w.n; i++) {
      if (w.kind[i] === KIND.ZONE) {
        zones++;
        if (w.level[i] === 1) lvl1++;
        if (w.zone[i] === ZONE.R && w.level[i]) { resPol += w.pollution[i]; resN++; }
      }
      if (w.kind[i] === KIND.BUILDING && w.root[i] === i) {
        const k = bKey(w.btype[i]);
        if (BUILDINGS[k].power) plants++;
        if (k === 'watertower') waterTowers++;
        if (k === 'police') police++;
        if (k === 'fire') fire++;
      }
    }
    if (zones && !plants) out.push({ kind: 'danger', text: 'Nothing grows without electricity. Build a power plant connected to your zones.' });
    if (s.powerCap && s.powerUse > s.powerCap * 0.9) out.push({ kind: 'warn', text: `The power grid is at ${Math.round(s.powerUse / s.powerCap * 100)}% capacity. Add another plant.` });
    if (lvl1 > 12 && !waterTowers) out.push({ kind: 'warn', text: 'Buildings can’t grow past level 1 without water. Place water towers.' });
    if (s.unemployment > 0.15) out.push({ kind: 'warn', text: 'Unemployment is rising. Zone more commercial and industrial areas.' });
    if (this.demand.R > 0.5 && s.pop > 0) out.push({ kind: 'info', text: 'People want to move here! Zone more residential land.' });
    if (resN && resPol / resN > 0.25) out.push({ kind: 'warn', text: 'Residents are breathing polluted air. Keep industry away from homes.' });
    if (s.pop > 500 && !police) out.push({ kind: 'warn', text: 'Crime is creeping in. A police station would help.' });
    if (s.pop > 400 && !fire) out.push({ kind: 'warn', text: 'No fire protection! One spark could take a block.' });
    if (this.budget.net < 0 && this.money < 15000) out.push({ kind: 'danger', text: 'You’re losing money each month. Consider raising taxes slightly.' });
    if (!out.length) out.push({ kind: 'good', text: 'Things are running smoothly, Mayor. Keep it up!' });
    this.advice = out;
    this.emit('advice', out);
  }

  // --- inspection ---------------------------------------------------------
  inspect(x, y) {
    const w = this.world;
    if (!w.inBounds(x, y)) return null;
    let i = w.idx(x, y);
    const base = {
      x, y,
      power: !!w.power[i], water: !!w.water[i], access: !!w.access[i],
      landValue: w.landValue[i], pollution: w.pollution[i], crime: w.crime[i],
      fire: w.fire[i] > 0,
    };
    const k = w.kind[i];
    if (k === KIND.ROAD) return { ...base, title: w.terrain[i] === TERRAIN.WATER ? 'Bridge' : 'Road', sub: 'Transport' };
    if (k === KIND.BUILDING) {
      i = w.root[i];
      const b = BUILDINGS[bKey(w.btype[i])];
      return { ...base, power: !!w.power[i] || !!b.power, title: b.name, sub: b.desc, upkeep: b.upkeep, output: b.power };
    }
    if (k === KIND.ZONE) {
      const zk = ZONE_KEYS[w.zone[i]];
      const names = { R: 'Residential', C: 'Commercial', I: 'Industrial' };
      const lvl = w.level[i];
      const cap = CAPACITY[zk][lvl];
      const titles = {
        R: ['Empty lot', 'Family homes', 'Apartments', 'Residential tower'],
        C: ['Empty lot', 'Corner shops', 'Office block', 'Corporate tower'],
        I: ['Empty lot', 'Workshops', 'Factory', 'Heavy industry'],
      };
      let status = 'Thriving';
      if (w.build[i]) status = 'Under construction';
      else if (!w.access[i]) status = 'Needs road access';
      else if (!w.power[i]) status = 'No power';
      else if (!lvl) status = this.demand[zk] > 0 ? 'Waiting for development' : 'No demand';
      else if (lvl === 1 && !w.water[i]) status = 'Needs water to grow';
      return {
        ...base, title: titles[zk][lvl], sub: `${names[zk]} · Level ${lvl}`, status,
        occupants: lvl ? `${cap} ${zk === 'R' ? 'residents' : 'jobs'}` : null,
      };
    }
    const t = w.terrain[i];
    return { ...base, title: t === TERRAIN.WATER ? 'Water' : t === TERRAIN.SAND ? 'Beach' : w.trees[i] ? 'Woodland' : 'Open land', sub: 'Undeveloped' };
  }

  // --- persistence --------------------------------------------------------
  serialize() {
    return {
      v: 1, cityName: this.cityName, money: this.money, day: this.day, tax: this.tax,
      milestone: this.milestone, history: this.history, world: this.world.serialize(),
    };
  }

  static deserialize(data) {
    const world = World.deserialize(data.world);
    return new Simulation(world, { ...data, seed: world.seed });
  }
}
