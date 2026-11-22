import { ICONS } from './icons.js';
import { BUILDINGS, MILESTONES, ZONE, KIND, TERRAIN, CAPACITY, COSTS, MAP_W, MAP_H } from '../config.js';
import { OVERLAYS } from '../scenes/GameScene.js';
import { audio } from '../audio.js';
import { saveGame, hasSave } from '../sim/save.js';
import { bKey } from '../sim/World.js';

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const money = (n) => (n < 0 ? '-$' : '$') + fmt(Math.abs(n));
const pct = (v) => `${Math.round(v * 100)}%`;

const TOOLS = [
  { id: 'inspect', label: 'Inspect', icon: 'inspect', tool: { type: 'inspect' }, key: 'Esc' },
  { id: 'bulldoze', label: 'Bulldoze', icon: 'bulldoze', tool: { type: 'bulldoze' }, key: 'X', hint: `$${COSTS.bulldoze}/tile` },
  { id: 'road', label: 'Road', icon: 'road', tool: { type: 'road' }, key: 'R', hint: `$${COSTS.road}/tile · bridges $${COSTS.bridge}` },
  { sep: true },
  { id: 'R', label: 'Residential', icon: 'R', tool: { type: 'zone', zone: ZONE.R }, key: '1', cls: 'z-r', hint: 'Homes for your citizens' },
  { id: 'C', label: 'Commercial', icon: 'C', tool: { type: 'zone', zone: ZONE.C }, key: '2', cls: 'z-c', hint: 'Shops & offices' },
  { id: 'I', label: 'Industrial', icon: 'I', tool: { type: 'zone', zone: ZONE.I }, key: '3', cls: 'z-i', hint: 'Factories & jobs' },
  { sep: true },
  { id: 'power', label: 'Power', icon: 'power', group: ['wind', 'coal', 'solar'], key: '4' },
  { id: 'water', label: 'Water', icon: 'water', group: ['watertower'], key: '5' },
  { id: 'service', label: 'Services', icon: 'service', group: ['police', 'fire', 'school', 'hospital'], key: '6' },
  { id: 'park', label: 'Parks', icon: 'park', group: ['park', 'plaza'], key: '7' },
  { id: 'landmark', label: 'Landmarks', icon: 'landmark', group: ['stadium', 'spire'], key: '8' },
];

const OVERLAY_ICONS = {
  power: 'power', water: 'water', landValue: 'value', pollution: 'pollution', crime: 'crime',
  fire: 'fire', police: 'service', education: 'school', health: 'health',
};

const CITY_NAMES = ['Port Aurora', 'Maple Bay', 'Northwind', 'Silverlake', 'Cedar Falls', 'Brightwater', 'Harbor Vale',
  'Elmsworth', 'Sunhaven', 'Oak Ridge', 'Kestrel Point', 'Juniper Bay', 'Larkspur', 'New Avalon', 'Willow Creek'];
export const randomCityName = () => CITY_NAMES[Math.floor(Math.random() * CITY_NAMES.length)];

export class HUD {
  constructor(root, handlers) {
    this.root = root;
    this.handlers = handlers; // { newCity(name), continueCity() }
    this.activeTool = 'inspect';
    this.activeGroup = null;
    this.lastBuilding = {};
    this.render();
    this.bindKeys();
  }

  render() {
    this.root.innerHTML = `
      <div class="hud top-left panel" id="cityCard">
        <div class="city-name" id="cityName">Skyhaven</div>
        <div class="city-rank"><span class="chip" id="cityRank">Hamlet</span><span class="next" id="nextRank"></span></div>
        <div class="progress"><div id="rankBar"></div></div>
      </div>

      <div class="hud top-center panel" id="statsBar">
        <div class="stat" title="City funds"><span class="ico c-gold">${ICONS.coin}</span><div><b id="sMoney">$0</b><small id="sNet">+$0/mo</small></div></div>
        <div class="stat" title="Population"><span class="ico c-sky">${ICONS.people}</span><div><b id="sPop">0</b><small id="sJobs">0 jobs</small></div></div>
        <div class="stat" title="Citizen approval"><span class="ico c-pink">${ICONS.smile}</span><div><b id="sHappy">60%</b><small>approval</small></div></div>
        <div class="stat" title="Power grid"><span class="ico c-amber">${ICONS.power}</span><div><b id="sPower">0/0</b><small>MW used</small></div></div>
        <div class="stat" title="Date"><span class="ico c-mint">${ICONS.calendar}</span><div><b id="sDate">Jan 2030</b><small id="sDay">Day 1</small></div></div>
        <div class="speeds" id="speeds">
          <button data-speed="0" title="Pause (P)">${ICONS.pause}</button>
          <button data-speed="1" title="Normal (+/-)">${ICONS.play}</button>
          <button data-speed="2" title="Fast">${ICONS.fast}</button>
          <button data-speed="3" title="Ultra">${ICONS.faster}</button>
        </div>
      </div>

      <div class="hud top-right">
        <button class="round panel" id="btnBudget" title="Budget & taxes">${ICONS.budget}</button>
        <button class="round panel" id="btnLayers" title="Data overlays">${ICONS.layers}</button>
        <button class="round panel" id="btnCycle" title="Day/night cycle (N)">${ICONS.sun}</button>
        <button class="round panel" id="btnSound" title="Sound (M)">${ICONS.sound}</button>
        <button class="round panel" id="btnSave" title="Save city">${ICONS.save}</button>
        <button class="round panel" id="btnMenu" title="Main menu">${ICONS.menu}</button>
      </div>

      <div class="hud layers panel hidden" id="layers">
        <div class="panel-title">Data views</div>
        <div class="layer-list">
          <button data-ov="" class="active">${ICONS.close}<span>None</span></button>
          ${Object.entries(OVERLAYS).map(([k, o]) => `<button data-ov="${k}">${ICONS[OVERLAY_ICONS[k]]}<span>${o.label}</span></button>`).join('')}
        </div>
        <div class="legend"><span>Good</span><div class="legend-bar"></div><span>Poor</span></div>
      </div>

      <div class="hud demand panel" id="demand" title="Zone demand">
        <div class="panel-title">Demand</div>
        <div class="bars">
          <div class="bar"><div class="track"><div class="fill r" id="dR"></div></div><span>R</span></div>
          <div class="bar"><div class="track"><div class="fill c" id="dC"></div></div><span>C</span></div>
          <div class="bar"><div class="track"><div class="fill i" id="dI"></div></div><span>I</span></div>
        </div>
      </div>

      <div class="hud goals panel" id="goals">
        <div class="panel-title">Goals</div>
        <div id="goalList"></div>
      </div>

      <div class="hud advisor panel" id="advisor">
        <div class="avatar">${ICONS.advisor}</div>
        <div class="advisor-body">
          <div class="advisor-name">Ada, City Advisor</div>
          <div class="advisor-text" id="advisorText">Welcome, Mayor! Start by drawing a road, then zone some residential land next to it.</div>
        </div>
      </div>
      <div class="hud news" id="news"><span class="tag">SKYHAVEN NEWS</span><div class="ticker"><span id="newsText">Citizens eagerly await their new mayor.</span></div></div>

      <div class="hud dock panel" id="dock">
        ${TOOLS.map((t) => t.sep ? '<div class="sep"></div>' : `
          <button class="tool ${t.cls || ''}" data-tool="${t.id}" title="${t.label} (${t.key})">
            <span class="ico">${ICONS[t.icon]}</span><span class="lbl">${t.label}</span>${t.group ? '<span class="more"></span>' : ''}
          </button>`).join('')}
      </div>
      <div class="hud flyout panel hidden" id="flyout"></div>

      <div class="hud minimap panel" id="minimapWrap"><canvas id="minimap"></canvas></div>

      <div class="hud inspector panel hidden" id="inspector"></div>
      <div class="tooltip hidden" id="tooltip"></div>
      <div class="toasts" id="toasts"></div>

      <div class="modal hidden" id="budgetModal"><div class="card wide" id="budgetCard"></div></div>
      <div class="modal hidden" id="milestoneModal"><div class="card celebrate" id="milestoneCard"></div></div>
      <div class="modal start" id="startModal"><div class="card start-card" id="startCard"></div></div>
    `;
    const $ = (id) => this.root.querySelector('#' + id);
    this.$ = $;
    this.el = {
      money: $('sMoney'), net: $('sNet'), pop: $('sPop'), jobs: $('sJobs'), happy: $('sHappy'), power: $('sPower'),
      date: $('sDate'), day: $('sDay'), dR: $('dR'), dC: $('dC'), dI: $('dI'), cityName: $('cityName'), rank: $('cityRank'),
      nextRank: $('nextRank'), rankBar: $('rankBar'), advisor: $('advisorText'), news: $('newsText'), tooltip: $('tooltip'),
      inspector: $('inspector'), flyout: $('flyout'), toasts: $('toasts'), minimap: $('minimap'),
    };

    this.root.querySelectorAll('#dock .tool').forEach((b) => b.addEventListener('click', () => this.onToolButton(b.dataset.tool)));
    this.root.querySelectorAll('#speeds button').forEach((b) => b.addEventListener('click', () => this.setSpeed(+b.dataset.speed)));
    $('btnBudget').addEventListener('click', () => this.openBudget());
    $('btnLayers').addEventListener('click', () => { audio.click(); $('layers').classList.toggle('hidden'); });
    this.root.querySelectorAll('#layers button').forEach((b) => b.addEventListener('click', () => this.setOverlay(b.dataset.ov || null)));
    $('btnCycle').addEventListener('click', () => this.toggleCycle());
    $('btnSound').addEventListener('click', () => this.toggleSound());
    $('btnSave').addEventListener('click', () => this.save(true));
    $('btnMenu').addEventListener('click', () => this.showStart());
    $('budgetModal').addEventListener('click', (e) => { if (e.target.id === 'budgetModal') this.closeModal('budgetModal'); });
    $('milestoneModal').addEventListener('click', (e) => { if (e.target.id === 'milestoneModal') this.closeModal('milestoneModal'); });
    this.el.minimap.addEventListener('pointerdown', (e) => this.onMinimap(e));
    this.el.minimap.addEventListener('pointermove', (e) => { if (e.buttons) this.onMinimap(e); });
    this.updateSoundIcon();
  }

  // Called each time a new city/scene is started.
  attach(scene, sim) {
    this.scene = scene;
    this.sim = sim;
    ['inspect', 'preview', 'applied', 'failed', 'ambient'].forEach((e) => scene.events.removeAllListeners(e));
    this.el.cityName.textContent = sim.cityName;
    sim.on('toast', (t) => this.toast(t.text, t.kind));
    sim.on('alert', (a) => { audio.alert(); this.toast(a.text, a.kind, () => scene.focusTile(a.x, a.y)); });
    sim.on('milestone', (m) => this.milestone(m));
    sim.on('advice', (list) => this.setAdvice(list));
    sim.on('news', (n) => this.setNews(n));
    sim.on('month', (b) => {
      if (sim.day % 90 === 0) this.save(false);
      if (b.net > 0) this.floatMoney(b.net);
      if (!this.$('budgetModal').classList.contains('hidden')) this.renderBudget();
    });
    sim.on('day', () => this.scheduleStats());
    sim.on('goal', (g) => {
      audio.cash();
      this.toast(`Goal complete: ${g.text}  +${money(g.reward)}`, 'good');
      this.renderGoals(g.id);
    });
    sim.on('changed', () => this.scheduleStats());
    sim.on('extinguished', () => this.toast('Firefighters saved a building!', 'good'));
    sim.on('burned', () => this.toast('A building burned down. Fire stations help prevent this.', 'danger'));

    scene.events.on('inspect', (info) => this.showInspector(info));
    scene.events.on('preview', (p) => this.showTooltip(p));
    scene.events.on('applied', ({ tool }) => {
      if (tool.type === 'road') audio.road();
      else if (tool.type === 'zone') audio.zone();
      else if (tool.type === 'bulldoze') audio.bulldoze();
      else audio.place();
    });
    scene.events.on('failed', () => audio.error());
    scene.events.on('ambient', ({ night }) => {
      this.$('btnCycle').innerHTML = night > 0.5 ? ICONS.moon : ICONS.sun;
    });
    this.selectTool('inspect');
    this.renderGoals();
    this.setSpeed(sim.speed, true);
    this.updateStats();
    this.updateCycleButton();
    sim.computeAdvice();
    clearInterval(this.mmTimer);
    this.mmTimer = setInterval(() => this.drawMinimap(), 600);
    this.drawMinimap();
  }

  // --- stats -------------------------------------------------------------------
  scheduleStats() {
    if (this.statsQueued) return;
    this.statsQueued = true;
    requestAnimationFrame(() => { this.statsQueued = false; this.updateStats(); });
  }

  updateStats() {
    const sim = this.sim;
    if (!sim) return;
    const s = sim.stats;
    const b = sim.estimateBudget();
    const e = this.el;
    e.money.textContent = money(sim.money);
    e.money.classList.toggle('neg', sim.money < 0);
    e.net.textContent = `${b.net >= 0 ? '+' : ''}${money(b.net)}/mo`;
    e.net.className = b.net >= 0 ? 'pos' : 'neg';
    e.pop.textContent = fmt(s.pop);
    e.jobs.textContent = `${fmt(s.jobsC + s.jobsI)} jobs`;
    e.happy.textContent = `${s.approval}%`;
    e.happy.className = s.approval >= 60 ? 'pos' : s.approval < 40 ? 'neg' : '';
    e.power.textContent = `${fmt(s.powerUse)}/${fmt(s.powerCap)}`;
    e.power.className = s.powerCap && s.powerUse > s.powerCap ? 'neg' : '';
    e.date.textContent = sim.dateLabel;
    e.day.textContent = `Day ${sim.dayOfMonth}`;
    const bar = (el, v) => {
      const h = Math.abs(v) * 50;
      el.style.height = `${h}%`;
      el.style.bottom = v >= 0 ? '50%' : `${50 - h}%`;
      el.classList.toggle('neg', v < 0);
    };
    bar(e.dR, sim.demand.R); bar(e.dC, sim.demand.C); bar(e.dI, sim.demand.I);
    const m = MILESTONES[sim.milestone], next = MILESTONES[sim.milestone + 1];
    e.rank.textContent = m.name;
    if (next) {
      e.nextRank.textContent = `${fmt(s.pop)} / ${fmt(next.pop)} → ${next.name}`;
      e.rankBar.style.width = `${Math.min(100, ((s.pop - m.pop) / (next.pop - m.pop)) * 100)}%`;
    } else {
      e.nextRank.textContent = 'Legendary city';
      e.rankBar.style.width = '100%';
    }
    this.refreshLocks();
  }

  renderGoals(doneId) {
    const list = this.$('goalList');
    const goals = this.sim.activeGoals;
    if (!goals.length) { list.innerHTML = '<div class="goal done">All goals complete — legendary mayor!</div>'; return; }
    const html = goals.map((g) => `<div class="goal"><span class="dot"></span><span class="gt">${g.text}</span><span class="gr">+${money(g.reward)}</span></div>`).join('');
    if (doneId) {
      list.insertAdjacentHTML('afterbegin', '<div class="goal done flash"><span class="dot"></span><span class="gt">Completed!</span></div>');
      setTimeout(() => { list.innerHTML = html; }, 900);
    } else list.innerHTML = html;
  }

  floatMoney(n) {
    const d = document.createElement('div');
    d.className = 'float-money';
    d.textContent = `+${money(n)}`;
    this.$('statsBar').appendChild(d);
    setTimeout(() => d.remove(), 1600);
  }

  // --- tools -------------------------------------------------------------------
  onToolButton(id) {
    audio.click();
    const t = TOOLS.find((x) => x.id === id);
    if (t.group) {
      if (t.group.length === 1) { this.selectBuilding(t.group[0], id); return; }
      if (this.activeGroup === id && !this.el.flyout.classList.contains('hidden')) { this.closeFlyout(); return; }
      this.openFlyout(t);
      return;
    }
    this.closeFlyout();
    this.selectTool(id);
  }

  selectTool(id) {
    const t = TOOLS.find((x) => x.id === id);
    this.activeTool = id;
    this.scene?.setTool(t.tool);
    this.highlightDock(id);
    this.el.inspector.classList.add('hidden');
  }

  selectBuilding(key, groupId) {
    this.lastBuilding[groupId] = key;
    this.activeTool = groupId;
    this.scene?.setTool({ type: 'building', key });
    this.highlightDock(groupId);
    this.closeFlyout();
  }

  highlightDock(id) {
    this.root.querySelectorAll('#dock .tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === id));
  }

  openFlyout(t) {
    const fl = this.el.flyout;
    this.activeGroup = t.id;
    fl.innerHTML = `<div class="panel-title">${t.label}</div><div class="cards">${t.group.map((k) => {
      const b = BUILDINGS[k];
      const locked = !this.sim.isUnlocked(k);
      return `<button class="bcard ${locked ? 'locked' : ''}" data-b="${k}">
        <div class="bname">${b.name}${locked ? `<span class="lock">${ICONS.lock}${b.unlock}</span>` : ''}</div>
        <div class="bdesc">${b.desc}</div>
        <div class="bmeta"><span class="cost">${money(b.cost)}</span><span>${b.power ? `⚡ ${b.power} MW` : b.radius ? `◎ ${b.radius} tiles` : ''}</span><span>${money(b.upkeep)}/mo</span></div>
      </button>`;
    }).join('')}</div>`;
    const btn = this.root.querySelector(`#dock [data-tool="${t.id}"]`);
    const r = btn.getBoundingClientRect();
    fl.classList.remove('hidden');
    const fw = fl.offsetWidth;
    fl.style.left = `${Math.max(12, Math.min(window.innerWidth - fw - 12, r.left + r.width / 2 - fw / 2))}px`;
    fl.querySelectorAll('.bcard').forEach((c) => c.addEventListener('click', () => {
      if (c.classList.contains('locked')) { audio.error(); this.toast(`${BUILDINGS[c.dataset.b].name} unlocks when you reach ${BUILDINGS[c.dataset.b].unlock}.`, 'warn'); return; }
      audio.click();
      this.selectBuilding(c.dataset.b, t.id);
    }));
  }

  closeFlyout() { this.el.flyout.classList.add('hidden'); this.activeGroup = null; }

  refreshLocks() {
    if (this.activeGroup) {
      this.el.flyout.querySelectorAll('.bcard').forEach((c) => {
        const locked = !this.sim.isUnlocked(c.dataset.b);
        if (c.classList.contains('locked') !== locked) this.openFlyout(TOOLS.find((t) => t.id === this.activeGroup));
      });
    }
  }

  // --- tooltip & inspector -------------------------------------------------------
  showTooltip(p) {
    const tt = this.el.tooltip;
    if (!p || (!p.count && p.tool.type !== 'building')) { tt.classList.add('hidden'); return; }
    let txt;
    if (p.tool.type === 'building') {
      const b = BUILDINGS[p.tool.key];
      if (!this.sim.isUnlocked(p.tool.key)) txt = `<span class="neg">Unlocks at ${b.unlock}</span>`;
      else if (!p.count) txt = `<span class="neg">Can't build here</span>`;
      else txt = `<b>${b.name}</b> · <span class="${p.affordable ? '' : 'neg'}">${money(p.cost)}</span>`;
    } else {
      const unit = p.tool.type === 'bulldoze' ? 'demolish' : 'tiles';
      txt = `<span class="${p.affordable ? '' : 'neg'}">${money(p.cost)}</span> · ${p.count} ${unit}`;
      if (!p.affordable) txt += ` <span class="neg">(insufficient funds)</span>`;
    }
    tt.innerHTML = txt;
    tt.style.left = `${p.x + 18}px`;
    tt.style.top = `${p.y + 18}px`;
    tt.classList.remove('hidden');
  }

  showInspector(info) {
    const el = this.el.inspector;
    if (!info) { el.classList.add('hidden'); return; }
    audio.click();
    const yes = (v, a = 'Yes', b = 'No') => `<span class="${v ? 'pos' : 'neg'}">${v ? a : b}</span>`;
    const meter = (label, v, good) => `
      <div class="meter"><span>${label}</span><div class="mtrack"><div style="width:${Math.round(v * 100)}%;background:${good ? (v > 0.5 ? '#34d399' : v > 0.25 ? '#facc15' : '#f87171') : (v < 0.25 ? '#34d399' : v < 0.5 ? '#facc15' : '#f87171')}"></div></div><b>${pct(v)}</b></div>`;
    el.innerHTML = `
      <button class="x" id="insClose">${ICONS.close}</button>
      <div class="ins-title">${info.title}</div>
      <div class="ins-sub">${info.sub || ''}</div>
      ${info.status ? `<div class="status ${info.status === 'Thriving' ? 'good' : info.status.startsWith('Under') || info.status.startsWith('Waiting') ? 'info' : 'warn'}">${info.status}</div>` : ''}
      ${info.fire ? '<div class="status danger">On fire!</div>' : ''}
      <div class="rows">
        <div><span>Power</span>${yes(info.power, 'Connected', 'None')}</div>
        <div><span>Water</span>${yes(info.water, 'Supplied', 'None')}</div>
        <div><span>Road access</span>${yes(info.access)}</div>
        ${info.occupants ? `<div><span>Occupancy</span><b>${info.occupants}</b></div>` : ''}
        ${info.output ? `<div><span>Output</span><b>${info.output} MW</b></div>` : ''}
        ${info.upkeep ? `<div><span>Upkeep</span><b>${money(info.upkeep)}/mo</b></div>` : ''}
      </div>
      ${meter('Land value', info.landValue, true)}
      ${meter('Pollution', info.pollution, false)}
      ${meter('Crime', info.crime, false)}
      <div class="coords">Tile ${info.x}, ${info.y}</div>`;
    el.classList.remove('hidden');
    el.querySelector('#insClose').addEventListener('click', () => el.classList.add('hidden'));
  }

  // --- advisor/news/toasts -------------------------------------------------------
  setAdvice(list) {
    if (!list?.length) return;
    this.adviceList = list;
    this.adviceIdx = 0;
    this.showAdvice();
    clearInterval(this.adviceTimer);
    this.adviceTimer = setInterval(() => { this.adviceIdx = (this.adviceIdx + 1) % this.adviceList.length; this.showAdvice(); }, 7000);
  }
  showAdvice() {
    const a = this.adviceList[this.adviceIdx];
    const el = this.el.advisor;
    el.classList.remove('fade');
    void el.offsetWidth;
    el.classList.add('fade');
    el.textContent = a.text;
    this.$('advisor').dataset.kind = a.kind;
  }
  setNews(n) {
    const el = this.el.news;
    el.parentElement.classList.remove('run');
    void el.offsetWidth;
    el.textContent = n;
    el.parentElement.classList.add('run');
  }

  toast(text, kind = 'info', onClick) {
    const now = performance.now();
    this.recentToasts ||= new Map();
    if (now - (this.recentToasts.get(text) || -1e9) < 12000) return;
    this.recentToasts.set(text, now);
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = text;
    if (onClick) { t.classList.add('clickable'); t.addEventListener('click', onClick); }
    this.el.toasts.appendChild(t);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 4200);
  }

  milestone(m) {
    audio.milestone();
    const card = this.$('milestoneCard');
    card.innerHTML = `
      <div class="burst"></div>
      <div class="kicker">New milestone reached</div>
      <h2>${this.sim.cityName} is now a ${m.name}!</h2>
      <p>Population ${fmt(m.pop)}+. The council has awarded you a <b class="pos">${money(m.bonus)}</b> grant.</p>
      ${m.unlocks.length ? `<div class="unlocks">${m.unlocks.map((u) => `<span>${u}</span>`).join('')}</div>` : ''}
      ${m.name === 'Village' ? '<p class="small">Buildings can now grow to level 2 with water.</p>' : ''}
      ${m.name === 'Town' ? '<p class="small">Towers can now rise in high land value areas.</p>' : ''}
      <button class="primary" id="msOk">Wonderful</button>`;
    this.openModal('milestoneModal');
    card.querySelector('#msOk').addEventListener('click', () => this.closeModal('milestoneModal'));
  }

  // --- budget --------------------------------------------------------------------
  openBudget() {
    audio.click();
    this.renderBudget();
    this.openModal('budgetModal');
  }

  renderBudget() {
    const sim = this.sim;
    const b = sim.estimateBudget();
    const card = this.$('budgetCard');
    const rows = (obj) => Object.entries(obj).map(([k, v]) => `<div><span>${k}</span><b>${money(v)}</b></div>`).join('');
    card.innerHTML = `
      <button class="x" id="bClose">${ICONS.close}</button>
      <h2>City Budget</h2>
      <div class="budget-grid">
        <div class="col">
          <div class="panel-title">Income / month</div><div class="rows">${rows(b.income)}</div>
          <div class="total pos">${money(b.totalIncome)}</div>
        </div>
        <div class="col">
          <div class="panel-title">Expenses / month</div><div class="rows">${rows(b.expense)}</div>
          <div class="total neg">${money(-b.totalExpense)}</div>
        </div>
      </div>
      <div class="tax">
        <div class="tax-head"><span>Tax rate</span><b id="taxVal">${sim.tax}%</b></div>
        <input type="range" min="0" max="20" step="1" value="${sim.tax}" id="taxSlider" />
        <div class="tax-hint">Low taxes attract citizens and businesses. High taxes fill the treasury but lower approval.</div>
      </div>
      <div class="net ${b.net >= 0 ? 'pos' : 'neg'}">Projected: ${b.net >= 0 ? '+' : ''}${money(b.net)} per month</div>
      <div class="panel-title">History</div>
      <canvas id="chart" width="560" height="150"></canvas>
      <div class="chart-legend"><span class="l1">Funds</span><span class="l2">Population</span></div>`;
    card.querySelector('#bClose').addEventListener('click', () => this.closeModal('budgetModal'));
    const slider = card.querySelector('#taxSlider');
    slider.addEventListener('input', () => {
      sim.tax = +slider.value;
      sim.computeStats();
      this.renderBudget();
      this.updateStats();
    });
    this.drawChart(card.querySelector('#chart'));
  }

  drawChart(cv) {
    const h = this.sim.history.slice(-36);
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(0, (H / 4) * k); ctx.lineTo(W, (H / 4) * k); ctx.stroke(); }
    if (h.length < 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '13px Inter'; ctx.textAlign = 'center';
      ctx.fillText('History will appear after a couple of months.', W / 2, H / 2);
      return;
    }
    const line = (vals, color) => {
      const min = Math.min(...vals), max = Math.max(...vals);
      const rng = max - min || 1;
      ctx.beginPath();
      vals.forEach((v, k) => {
        const x = (k / (vals.length - 1)) * (W - 10) + 5;
        const y = H - 10 - ((v - min) / rng) * (H - 20);
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.stroke();
    };
    line(h.map((r) => r.money), '#fbbf24');
    line(h.map((r) => r.pop), '#38bdf8');
  }

  openModal(id) { this.$(id).classList.remove('hidden'); }
  closeModal(id) { this.$(id).classList.add('hidden'); }

  // --- top-right controls --------------------------------------------------------
  setSpeed(s, silent) {
    if (!this.sim) return;
    this.sim.speed = s;
    if (!silent) audio.click();
    this.root.querySelectorAll('#speeds button').forEach((b) => b.classList.toggle('active', +b.dataset.speed === s));
  }

  setOverlay(mode) {
    audio.click();
    this.scene.setOverlay(mode);
    this.root.querySelectorAll('#layers button').forEach((b) => b.classList.toggle('active', (b.dataset.ov || null) === mode));
    this.$('btnLayers').classList.toggle('active', !!mode);
  }

  toggleCycle() {
    audio.click();
    this.scene.cycle = !this.scene.cycle;
    this.scene.applyAmbient(true);
    this.updateCycleButton();
    this.toast(this.scene.cycle ? 'Day/night cycle on' : 'Day/night cycle paused (always day)', 'info');
  }
  updateCycleButton() { this.$('btnCycle').classList.toggle('active', !!this.scene?.cycle); }

  toggleSound() {
    audio.setMuted(!audio.muted);
    this.updateSoundIcon();
    audio.click();
  }
  updateSoundIcon() { this.$('btnSound').innerHTML = audio.muted ? ICONS.mute : ICONS.sound; }

  save(manual) {
    if (!this.sim) return;
    const ok = saveGame(this.sim);
    if (manual) { audio.cash(); this.toast(ok ? `${this.sim.cityName} saved.` : 'Could not save (storage full?)', ok ? 'good' : 'danger'); }
  }

  // --- minimap -------------------------------------------------------------------
  drawMinimap() {
    if (!this.sim || !this.scene?.cameras) return;
    const cv = this.el.minimap;
    const w = this.sim.world;
    const dpr = window.devicePixelRatio || 1;
    const CW = 220, CH = 110;
    if (cv.width !== CW * dpr) { cv.width = CW * dpr; cv.height = CH * dpr; cv.style.width = CW + 'px'; cv.style.height = CH + 'px'; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, CW, CH);
    const k = CW / (w.w + w.h);
    this.mm = { k, CW };
    const zc = ['', '#5bd174', '#4aa3f0', '#f0b429'];
    for (let y = 0; y < w.h; y++) {
      for (let x = 0; x < w.w; x++) {
        const i = w.idx(x, y);
        let c;
        const kind = w.kind[i];
        if (kind === KIND.ROAD) c = '#3b3f46';
        else if (kind === KIND.ZONE) c = w.level[i] ? zc[w.zone[i]] : 'rgba(255,255,255,0.35)';
        else if (kind === KIND.BUILDING) c = '#f1f5f9';
        else if (w.terrain[i] === TERRAIN.WATER) c = '#2c7bb5';
        else if (w.terrain[i] === TERRAIN.SAND) c = '#e3cf98';
        else c = w.trees[i] ? '#3f7f37' : '#74ad52';
        ctx.fillStyle = c;
        const mx = (x - y) * k + CW / 2, my = (x + y) * k / 2;
        ctx.beginPath();
        ctx.moveTo(mx, my); ctx.lineTo(mx + k, my + k / 2); ctx.lineTo(mx, my + k); ctx.lineTo(mx - k, my + k / 2);
        ctx.fill();
      }
    }
    const v = this.scene.cameras.main.worldView;
    const s = k / 32;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(v.x * s + CW / 2, v.y * s, v.width * s, v.height * s);
  }

  onMinimap(e) {
    if (!this.mm) return;
    const r = this.el.minimap.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const s = this.mm.k / 32;
    this.scene.cameras.main.centerOn((mx - this.mm.CW / 2) / s, my / s);
    this.drawMinimap();
  }

  // --- start screen -----------------------------------------------------------------
  showStart() {
    if (this.started) audio.click();
    if (this.sim) this.prevSpeed = this.sim.speed;
    if (this.sim) this.sim.speed = 0;
    const card = this.$('startCard');
    const saved = hasSave();
    const inGame = !!this.sim && this.started;
    card.innerHTML = `
      <div class="logo"><span class="mark">◆</span> Skyhaven</div>
      <div class="tagline">Design, grow and govern the city of your dreams.</div>
      <label class="field"><span>City name</span><input id="cityInput" maxlength="24" value="${randomCityName()}" /></label>
      <div class="actions">
        <button class="primary" id="btnNew">Found a new city</button>
        ${inGame ? '<button class="ghost" id="btnResume">Resume</button>' : ''}
        ${saved && !inGame ? '<button class="ghost" id="btnContinue">Continue saved city</button>' : ''}
      </div>
      <div class="howto">
        <div><b>1</b> Draw <i>roads</i> — everything needs road access.</div>
        <div><b>2</b> Zone <i class="r">residential</i>, <i class="c">commercial</i> & <i class="i">industrial</i> land.</div>
        <div><b>3</b> Build a <i>power plant</i> touching your network, then <i>water towers</i>.</div>
        <div><b>4</b> Add parks & services, balance the budget, watch it grow.</div>
      </div>
      <div class="controls">Left-drag to build · Right-drag or Space-drag to pan · Scroll to zoom · WASD to move · 1-8 tools · P pause</div>`;
    this.openModal('startModal');
    card.querySelector('#btnNew').addEventListener('click', () => {
      audio.ensure();
      audio.place();
      const name = card.querySelector('#cityInput').value.trim() || randomCityName();
      this.closeModal('startModal');
      this.started = true;
      this.handlers.newCity(name);
    });
    card.querySelector('#btnResume')?.addEventListener('click', () => {
      audio.ensure();
      this.closeModal('startModal');
      this.setSpeed(this.prevSpeed || 1, true);
    });
    card.querySelector('#btnContinue')?.addEventListener('click', () => {
      audio.ensure();
      this.closeModal('startModal');
      this.started = true;
      this.handlers.continueCity();
    });
  }

  // --- keyboard ------------------------------------------------------------------------
  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || !this.sim || !this.started) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        this.closeFlyout();
        ['budgetModal', 'milestoneModal'].forEach((m) => this.closeModal(m));
        this.$('layers').classList.add('hidden');
        this.selectTool('inspect');
      } else if (k === 'x') this.onToolButton('bulldoze');
      else if (k === 'r') this.onToolButton('road');
      else if (k >= '1' && k <= '8') {
        const id = ['R', 'C', 'I', 'power', 'water', 'service', 'park', 'landmark'][+k - 1];
        this.onToolButton(id);
      } else if (k === 'p') this.setSpeed(this.sim.speed ? 0 : 1);
      else if (k === '+' || k === '=') this.setSpeed(Math.min(3, this.sim.speed + 1));
      else if (k === '-') this.setSpeed(Math.max(0, this.sim.speed - 1));
      else if (k === 'n') this.toggleCycle();
      else if (k === 'm') this.toggleSound();
      else if (k === 'b') this.openBudget();
    });
  }
}
