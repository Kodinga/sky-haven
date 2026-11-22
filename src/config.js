// Global constants & game balance for Skyhaven.

export const MAP_W = 72;
export const MAP_H = 72;

// Isometric tile size in world units (textures are rendered at RES x for crispness).
export const TW = 64;
export const TH = 32;
export const RES = 2;

export const TERRAIN = { GRASS: 0, WATER: 1, SAND: 2 };
export const KIND = { EMPTY: 0, ROAD: 1, ZONE: 2, BUILDING: 3 };
export const ZONE = { NONE: 0, R: 1, C: 2, I: 3 };
export const ZONE_KEYS = ['', 'R', 'C', 'I'];

export const START_MONEY = 60000;
export const DEFAULT_TAX = 9;
export const DAYS_PER_MONTH = 30;
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const START_YEAR = 2030;

// Seconds of real time per simulated day for each speed setting (index 0 = paused).
export const SPEEDS = [0, 0.5, 0.18, 0.06];

// Capacity per zone level (residents for R, jobs for C/I).
export const CAPACITY = {
  R: [0, 14, 55, 180],
  C: [0, 8, 32, 110],
  I: [0, 16, 42, 90],
};

// Power consumed per developed tile per level.
export const POWER_USE = [0, 1, 2, 4];

export const COSTS = {
  road: 12,
  bridge: 60,
  zone: 20,
  bulldoze: 5,
};

export const ROAD_UPKEEP = 0.35; // per road tile per month

// Placeable buildings (utilities, services, parks, landmarks).
// radius: service coverage radius in tiles. power: capacity (producers). upkeep: $/month.
export const BUILDINGS = {
  wind: {
    name: 'Wind Turbine', cat: 'power', size: 1, cost: 900, upkeep: 25, power: 140,
    desc: 'Clean, modest power. Place a few near your neighborhoods.',
  },
  coal: {
    name: 'Coal Power Plant', cat: 'power', size: 2, cost: 4500, upkeep: 160, power: 1400,
    pollution: 1.0, pollutionRadius: 8,
    desc: 'Huge output, but it pollutes. Keep it away from homes.',
  },
  solar: {
    name: 'Solar Farm', cat: 'power', size: 2, cost: 6000, upkeep: 60, power: 800, unlock: 'Town',
    desc: 'Silent, zero-emission power for a growing town.',
  },
  watertower: {
    name: 'Water Tower', cat: 'water', size: 1, cost: 700, upkeep: 40, radius: 11,
    desc: 'Supplies water nearby. Needed for buildings to grow past level 1.',
  },
  police: {
    name: 'Police Station', cat: 'service', size: 1, cost: 900, upkeep: 90, radius: 13,
    desc: 'Reduces crime and raises land value in its district.',
  },
  fire: {
    name: 'Fire Station', cat: 'service', size: 1, cost: 900, upkeep: 90, radius: 13,
    desc: 'Prevents and fights fires.',
  },
  school: {
    name: 'School', cat: 'service', size: 2, cost: 2200, upkeep: 140, radius: 15, unlock: 'Village',
    desc: 'Educated citizens make denser, richer neighborhoods.',
  },
  hospital: {
    name: 'Hospital', cat: 'service', size: 2, cost: 3800, upkeep: 220, radius: 17, unlock: 'Town',
    desc: 'Healthy citizens are happy citizens.',
  },
  park: {
    name: 'Park', cat: 'park', size: 1, cost: 180, upkeep: 8, radius: 5,
    desc: 'A patch of green. Boosts land value around it.',
  },
  plaza: {
    name: 'Fountain Plaza', cat: 'park', size: 2, cost: 900, upkeep: 25, radius: 8, unlock: 'Village',
    desc: 'A lovely plaza with a fountain. Big land value boost.',
  },
  stadium: {
    name: 'Stadium', cat: 'landmark', size: 3, cost: 25000, upkeep: 400, radius: 22, unlock: 'City',
    desc: 'Home of the Skyhaven Comets. Massive happiness boost.',
  },
  spire: {
    name: 'Skyhaven Spire', cat: 'landmark', size: 2, cost: 60000, upkeep: 300, radius: 26, unlock: 'Metropolis',
    desc: 'The iconic tower that defines your skyline.',
  },
};

export const MILESTONES = [
  { name: 'Hamlet', pop: 0, bonus: 0 },
  { name: 'Village', pop: 150, bonus: 6000 },
  { name: 'Town', pop: 700, bonus: 12000 },
  { name: 'City', pop: 2500, bonus: 25000 },
  { name: 'Metropolis', pop: 9000, bonus: 60000 },
  { name: 'Megalopolis', pop: 25000, bonus: 100000 },
];

// Minimum milestone index required to grow zones to a given level.
export const LEVEL_UNLOCK = [0, 0, 1, 2];
