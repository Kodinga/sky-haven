import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene.js';
import { HUD } from './ui/HUD.js';
import { World } from './sim/World.js';
import { Simulation } from './sim/Simulation.js';
import { loadGame, hasSave } from './sim/save.js';
import { audio } from './audio.js';

window.addEventListener('unhandledrejection', (e) => console.error('Unhandled Rejection:', e.reason));

const dpr = Math.min(window.devicePixelRatio || 1, 2);
let hud;

function newSim(cityName) {
  const seed = Math.floor(Math.random() * 1e9);
  return new Simulation(new World().generate(seed), { cityName, seed });
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#2a6d96',
  scale: { mode: Phaser.Scale.NONE, width: window.innerWidth * dpr, height: window.innerHeight * dpr, zoom: 1 / dpr },
  render: { antialias: true, powerPreference: 'high-performance' },
  disableContextMenu: true,
  audio: { noAudio: true },
  scene: [],
});

window.addEventListener('resize', () => {
  game.scale.resize(window.innerWidth * dpr, window.innerHeight * dpr);
  game.scale.setZoom(1 / dpr);
});

function startCity(sim) {
  const existing = game.scene.getScene('game');
  const attach = (scene) => scene.events.once('create', () => hud.attach(scene, sim));
  if (existing) {
    attach(existing);
    existing.scene.restart({ sim, hud });
  } else {
    game.scene.add('game', GameScene, false);
    const scene = game.scene.getScene('game');
    attach(scene);
    game.scene.start('game', { sim, hud });
  }
}

hud = new HUD(document.getElementById('ui'), {
  newCity(name) {
    const sim = newSim(name);
    startCity(sim);
    setTimeout(() => hud.toast(`Welcome to ${name}, Mayor! Start with a road.`, 'good'), 400);
  },
  continueCity() {
    if (hud.backdropIsSave) {
      hud.setSpeed(1, true);
      hud.toast(`Welcome back to ${hud.sim.cityName}.`, 'good');
      return;
    }
    const sim = loadGame();
    if (sim) startCity(sim);
  },
});

// Backdrop for the title screen: the saved city if any, otherwise a fresh landscape.
const saved = hasSave() ? loadGame() : null;
hud.backdropIsSave = !!saved;
const backdrop = saved || newSim('Skyhaven');
backdrop.speed = 0;
game.events.once('ready', () => startCity(backdrop));
hud.showStart();

window.addEventListener('pointerdown', () => audio.ensure()?.resume?.(), { capture: true });
window.addEventListener('beforeunload', () => { if (hud.started) hud.save(false); });

// Debug handle (handy for console tinkering and automated screenshots).
window.skyhaven = { game, hud };
