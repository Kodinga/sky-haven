import { Simulation } from './Simulation.js';

const KEY = 'skyhaven.save.v1';

// Run-length encode the numeric arrays to keep saves small.
function rle(arr) {
  const out = [];
  for (let i = 0; i < arr.length;) {
    let j = i;
    while (j < arr.length && arr[j] === arr[i]) j++;
    out.push(arr[i], j - i);
    i = j;
  }
  return out;
}
function unrle(enc) {
  const out = [];
  for (let i = 0; i < enc.length; i += 2) for (let k = 0; k < enc[i + 1]; k++) out.push(enc[i]);
  return out;
}

export function encode(sim) {
  const data = sim.serialize();
  for (const [k, v] of Object.entries(data.world)) if (Array.isArray(v)) data.world[k] = rle(v);
  return JSON.stringify(data);
}

export function decode(str) {
  const data = JSON.parse(str);
  for (const [k, v] of Object.entries(data.world)) if (Array.isArray(v)) data.world[k] = unrle(v);
  return Simulation.deserialize(data);
}

export function saveGame(sim, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, encode(sim));
    return true;
  } catch (e) {
    console.warn('Save failed', e);
    return false;
  }
}

export function hasSave(storage = globalThis.localStorage) {
  try { return !!storage?.getItem(KEY); } catch { return false; }
}

export function loadGame(storage = globalThis.localStorage) {
  try {
    const s = storage.getItem(KEY);
    return s ? decode(s) : null;
  } catch (e) {
    console.warn('Load failed', e);
    return null;
  }
}

export function clearSave(storage = globalThis.localStorage) {
  try { storage.removeItem(KEY); } catch { /* ignore */ }
}
