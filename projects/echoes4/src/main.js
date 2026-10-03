import { Checkpoints } from './checkpoints.js';
import { SimulationClock } from './clock.js';
import { getPlayer, stepWorld } from './core/simulation.js';
import { GamepadReader } from './input/gamepad.js';
import { beginDive, completeDive } from './session.js';
import { LocalDatabase } from './storage/client.js';
import { drawAquarium, viewportFor } from './ui/renderer.js';
import { wasmPhysics } from './wasm-physics.js';
/** @typedef {import('./core/types.js').Database} Database */
/** @typedef {import('./core/types.js').Config} Config */
/** @typedef {import('./core/types.js').Vector} Vector */

/** @param {string} id */
function element(id) { const node = document.getElementById(id); if (!node) throw new Error(`Missing aquarium control: ${id}`); return node; }
/** @param {string} id @param {string} value */
function text(id, value) { if (element(id).textContent !== value) element(id).textContent = value; }
const canvas = /** @type {HTMLCanvasElement} */ (element('aquarium'));
const startButton = /** @type {HTMLButtonElement} */ (element('start-button'));
const pauseButton = /** @type {HTMLButtonElement} */ (element('pause'));
const tuningPanel = /** @type {HTMLDetailsElement} */ (element('tuning-panel'));
const showLinks = /** @type {HTMLInputElement} */ (element('show-links'));
const reader = new GamepadReader();
const keys = new Set();
/** @type {Vector} */ let pointer = { x: 0, y: 0 };
/** @type {Database|null} */ let database = null;
/** @type {Checkpoints|null} */ let checkpoints = null;
/** @type {import('./core/types.js').MathPort|undefined} */ let physics;
let paused = true, failed = false, finishing = false, ready = false;
/** @type {number|null} */ let nextDiveAt = null;
let lastFrame = performance.now(), tuneIndex = 0;
const clock = new SimulationClock(30);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
/** @type {{id:string,key:keyof Config,format:(n:number)=>string}[]} */
const tuning = [
  { id: 'speed', key: 'baseSpeed', format: n => `${n}` },
  { id: 'turning', key: 'turnRate', format: n => `${n}` },
  { id: 'growth', key: 'growthEfficiency', format: n => `${Math.round(n * 100)}%` },
  { id: 'echo-delay', key: 'echoDelaySeconds', format: n => `${n}s` },
  { id: 'duration', key: 'durationSeconds', format: n => `${n}s` },
];

/** @param {unknown} error */
function fail(error) {
  failed = true; paused = true; nextDiveAt = null;
  text('error', `${error instanceof Error ? error.message : String(error)} Export the current database or reload the saved aquarium to recover.`);
  element('error').hidden = false;
  startButton.disabled = true; pauseButton.disabled = true;
  text('save-status', 'Progress could not be saved. Swimming paused.');
}
function save() { if (!checkpoints || failed) return Promise.resolve(); return checkpoints.request().catch(fail); }

/** @param {string} [message] */
function pauseGame(message) {
  if (!ready || failed) return;
  paused = true; keys.clear(); pointer = { x: 0, y: 0 }; nextDiveAt = null;
  element('start-panel').hidden = false; element('result-panel').hidden = true;
  text('start-detail', message ?? 'The shared clock is paused. All fish continue together when you resume.');
  text('start-button', database?.active?.status === 'playing' ? 'A · Resume dive' : 'A · Next dive');
  text('pause', 'Resume · A'); void save();
}
function startGame() {
  if (!database || !ready || failed || finishing) return;
  beginDive(database, crypto.randomUUID(), (Math.random() * 0xffffffff) >>> 0);
  paused = false; nextDiveAt = null; pointer = { x: 0, y: 0 };
  element('start-panel').hidden = true; element('result-panel').hidden = true;
  tuningPanel.open = false;
  text('pause', 'Pause · Menu');
  canvas.focus({ preventScroll: true }); void save();
}
/** @param {string} [reason] */
async function finishDive(reason) {
  if (!database?.active || finishing) return;
  finishing = true; paused = false;
  const run = completeDive(database, reason);
  element('start-panel').hidden = true; element('result-panel').hidden = false;
  text('result-title', run.reason === 'eaten' ? 'You became part of the food chain.' : 'Your dive joins the aquarium.');
  const meals = run.events.filter(event => event.type === 'eat' && event.actorId === `${run.id}:player`).length;
  text('result-detail', `${meals} ${meals === 1 ? 'meal' : 'meals'} · final mass ${getPlayer(database.active).mass.toFixed(1)} · ${run.tracks.length} recorded swimmers`);
  await save();
  finishing = false;
  if (!failed) nextDiveAt = performance.now() + 1800;
}
function showTuning() {
  pauseGame(); element('start-panel').hidden = true; tuningPanel.open = true;
  text('event-detail', 'D-pad up/down selects a setting; left/right changes it. A resumes. X records this dive.');
  focusTuning();
}
function focusTuning() {
  const item = tuning[tuneIndex];
  for (const other of tuning) element(other.id).closest('label')?.classList.toggle('controller-selected', other.id === item.id);
  element(item.id).focus({ preventScroll: true });
}
/** @param {string} action */
function controllerAction(action) {
  if (!ready || failed || document.hidden) return;
  if (action === 'pause') { if (paused) startGame(); else pauseGame(); }
  else if (action === 'confirm' && paused) startGame();
  else if (action === 'tuning') { if (tuningPanel.open) { tuningPanel.open = false; pauseGame(); } else showTuning(); }
  else if (action === 'links') showLinks.checked = !showLinks.checked;
  else if (action === 'back' && tuningPanel.open) { tuningPanel.open = false; pauseGame(); }
  else if (action === 'bank' && paused) { tuningPanel.open = false; void finishDive('banked'); }
  else if (paused && tuningPanel.open) {
    if (action === 'up' || action === 'down') { tuneIndex = (tuneIndex + (action === 'down' ? 1 : tuning.length - 1)) % tuning.length; focusTuning(); }
    if (action === 'left' || action === 'right') {
      const input = /** @type {HTMLInputElement} */ (element(tuning[tuneIndex].id));
      if (action === 'right') input.stepUp(); else input.stepDown(); input.dispatchEvent(new Event('input'));
    }
  }
}

/** @param {number} now */
function frame(now) {
  const elapsed = (now - lastFrame) / 1000; lastFrame = now;
  try {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const controller = reader.poll(pads);
    text('controller-status', controller.connected ? `${controller.mapping === 'standard' ? 'Xbox / controller ready' : 'Xbox controller · default mapping'}`
      : typeof navigator.getGamepads === 'function' ? 'Connect controller, then press A' : 'Gamepad unavailable here · open in Chrome');
    if (controller.lost) pauseGame('Controller disconnected. Reconnect it and press A to resume, or use pointer / keyboard.');
    for (const action of controller.actions) controllerAction(action);
    if (database?.active) {
      if (nextDiveAt !== null && now >= nextDiveAt && !paused && !document.hidden && !failed) { startGame(); }
      const live = database.active;
      const keyboard = { x: Number(keys.has('ArrowRight') || keys.has('d')) - Number(keys.has('ArrowLeft') || keys.has('a')),
        y: Number(keys.has('ArrowDown') || keys.has('s')) - Number(keys.has('ArrowUp') || keys.has('w')) };
      const control = controller.connected ? controller.direction : (keyboard.x || keyboard.y) ? keyboard : pointer;
      const steps = clock.advance(elapsed, !paused && !failed && !finishing && !document.hidden && live.status === 'playing');
      for (let step = 0; step < steps && live.status === 'playing'; step++) {
        const previousEvents = live.events.length;
        stepWorld(live, control, viewportFor(canvas, live), physics);
        if (live.events.length !== previousEvents || live.tick % live.config.tickRate === 0) void save();
      }
      if (live.status !== 'playing' && nextDiveAt === null && !finishing && !paused && !failed) void finishDive(live.status);
      drawAquarium(canvas, live, now / 1000, { paused: paused || finishing, showLinks: showLinks.checked, reducedMotion: reducedMotion.matches });
      const player = getPlayer(live);
      text('mass-value', player.mass.toFixed(1));
      text('time-value', `${Math.max(0, Math.ceil(live.config.durationSeconds - live.tick / live.config.tickRate))}s`);
      text('dive-value', String(database.runs.length + (database.runs.some(run => run.id === live.id) ? 0 : 1)));
      text('eaten-value', String(live.events.filter(event => event.type === 'eat' && event.actorId === player.id).length));
      text('archive-value', `${database.runs.length} ${database.runs.length === 1 ? 'dive' : 'dives'}`);
      if (!failed) text('save-status', checkpoints?.busy ? 'Saving full aquarium…' : `Saved locally · revision ${database.revision}`);
      if (!paused) {
        const recent = live.events.findLast(event => event.type !== 'birth');
        const label = recent?.actorId === player.id ? 'You' : 'A ghost';
        text('event-detail', recent ? recent.type === 'eat' ? `${label} ate ${recent.preyId === player.id ? 'you' : 'a fish'}. Every meal changes the food chain.`
          : `${label} became passive: ${recent.reason?.toLowerCase()}.` : live.source ? 'Your past swims beside you. Steal a meal to change its future.' : 'Follow the food indicator to catch your smaller self-echo.');
      }
    }
  } catch (error) { fail(error); }
  requestAnimationFrame(frame);
}

startButton.addEventListener('click', startGame);
element('start-tuning').addEventListener('click', showTuning);
pauseButton.addEventListener('click', () => paused ? startGame() : pauseGame());
element('bank').addEventListener('click', () => { tuningPanel.open = false; void finishDive('banked'); });
element('reload').addEventListener('click', () => location.reload());
element('export').addEventListener('click', () => {
  if (!database) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(database, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `echoes4-aquarium-r${database.revision}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
canvas.addEventListener('pointermove', event => {
  const bounds = canvas.getBoundingClientRect();
  const x = event.clientX - bounds.left - bounds.width / 2, y = event.clientY - bounds.top - bounds.height / 2;
  const length = Math.hypot(x, y); pointer = length < 20 ? { x: 0, y: 0 } : { x: x / length, y: y / length };
});
canvas.addEventListener('pointerdown', event => canvas.setPointerCapture(event.pointerId));
canvas.addEventListener('pointerup', event => { if (event.pointerType !== 'mouse') pointer = { x: 0, y: 0 }; });
window.addEventListener('keydown', event => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (event.target instanceof HTMLInputElement) return;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(key)) { keys.add(key); event.preventDefault(); }
  if (!event.repeat && (key === 'Escape' || key === 'p')) paused ? startGame() : pauseGame();
  if (!event.repeat && (key === 'Enter' || key === ' ') && paused) { event.preventDefault(); startGame(); }
});
window.addEventListener('keyup', event => keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key));
window.addEventListener('blur', () => { keys.clear(); if (!paused) pauseGame('Aquarium paused while this window is inactive.'); });
document.addEventListener('visibilitychange', () => { if (document.hidden && !paused) pauseGame(); });
tuningPanel.addEventListener('toggle', () => { if (tuningPanel.open && !paused) { pauseGame(); element('start-panel').hidden = true; } });
for (const item of tuning) element(item.id).addEventListener('input', () => {
  if (!database) return;
  const value = Number(/** @type {HTMLInputElement} */ (element(item.id)).value);
  database.config[item.key] = value; text(`${item.id}-output`, item.format(value)); void save();
});

requestAnimationFrame(frame);
try {
  const store = new LocalDatabase(); database = await store.load();
  const response = await fetch('/echoes4.wasm'); if (!response.ok) throw new Error('Aquarium physics could not load. Rebuild Echoes 4.');
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer()); physics = wasmPhysics(instance.exports);
  checkpoints = new Checkpoints(database, store);
  beginDive(database, crypto.randomUUID(), (Math.random() * 0xffffffff) >>> 0);
  for (const item of tuning) { /** @type {HTMLInputElement} */ (element(item.id)).value = String(database.config[item.key]); text(`${item.id}-output`, item.format(database.config[item.key])); }
  await save(); ready = !failed; startButton.disabled = failed; pauseButton.disabled = failed;
  text('start-button', 'A · Start / resume dive'); text('pause', 'Resume · A');
  text('start-detail', database.runs.length ? 'Your recorded ecosystem is ready. All histories share the same clock.' : 'Your first dive records a swimming pattern. A smaller echo arrives after five seconds.');
} catch (error) { fail(error); }
