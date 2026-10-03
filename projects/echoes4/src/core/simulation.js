import { moveFish, normalizeAngle, referencePhysics } from './physics.js';
import { resolveCollisions } from './collisions.js';
import { makePassive, recordFish, registerFish } from './recording.js';
/** @typedef {import('./types.js').World} World */
/** @typedef {import('./types.js').Fish} Fish */
/** @typedef {import('./types.js').Run} Run */
/** @typedef {import('./types.js').Config} Config */
/** @typedef {import('./types.js').Vector} Vector */

/** @type {Readonly<Config>} */
export const DEFAULT_CONFIG = Object.freeze({ tickRate: 30, baseRadius: 20, startMass: 4, baseSpeed: 180,
  turnRate: 3, durationSeconds: 0, echoDelaySeconds: 5, growthEfficiency: 1,
  speedExponent: 0.35, turnExponent: 0.3, eatRatio: 1, spawnPadding: 80 });

/** @param {{id:string,source:Run|null,config?:Partial<Config>,seed?:number}} options @returns {World} */
export function createWorld({ id, source, config = {}, seed = 1 }) {
  const settings = { ...DEFAULT_CONFIG, ...config };
  /** @type {World} */ const world = { id, tick: 0, status: 'playing', config: settings, seed: seed >>> 0,
    startedAt: new Date().toISOString(), fish: [], events: [], source: structuredClone(source),
    recording: { tracks: [] }, nextEcho: 0, nextEchoTick: Math.ceil(settings.echoDelaySeconds * settings.tickRate) };
  const lastPlayer = source?.tracks.find(track => track.kind === 'player');
  registerFish(world, { id: `${id}:player`, kind: 'player', state: 'active',
    x: (lastPlayer?.initial.x ?? -400) + 400, y: lastPlayer?.initial.y ?? 0, heading: Math.PI, mass: settings.startMass,
    bornTick: 0, controlIndex: 0, expectedMeals: [], expectedMealIndex: 0 });
  admitArchives(world);
  return world;
}

/** @param {World} world */
export function getPlayer(world) {
  const player = world.fish.find(fish => fish.kind === 'player');
  if (!player) throw new Error('Aquarium has no player.');
  return player;
}

/** @param {World} world */
function admitArchives(world) {
  for (const track of world.source?.tracks ?? []) {
    if (track.bornTick > world.tick || world.fish.some(fish => fish.id === track.id)) continue;
    registerFish(world, { id: track.id, kind: 'ghost', state: 'active', ...track.initial,
      bornTick: track.bornTick, source: { trackId: track.id, mode: 'archive' }, controlIndex: 0,
      expectedMeals: (world.source?.events ?? []).filter(event => event.type === 'eat' && event.actorId === track.id), expectedMealIndex: 0 });
  }
}

/** @param {World} world */
function random(world) {
  world.seed = (Math.imul(world.seed, 1664525) + 1013904223) >>> 0;
  return world.seed / 4294967296;
}

/** @param {World} world @param {import('./types.js').Viewport} viewport */
function spawnEcho(world, viewport) {
  if (world.tick < world.nextEchoTick || world.fish.some(fish => fish.kind === 'echo' && fish.state !== 'eaten')) return;
  const player = getPlayer(world);
  if (player.state !== 'active') return;
  const delay = Math.ceil(world.config.echoDelaySeconds * world.config.tickRate), pastTick = world.tick - delay;
  const track = world.recording.tracks.find(track => track.id === player.id);
  const past = track?.frames.findLast(frame => frame.tick <= pastTick);
  if (!past) return;
  const mass = past.mass * 0.25, radius = referencePhysics.radius(mass, world.config.baseRadius, world.config.startMass);
  for (let attempt = 0; attempt < 16; attempt++) {
    const angle = player.heading + (random(world) - 0.5) * Math.PI;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const distance = Math.min((viewport.width / 2 + radius + world.config.spawnPadding) / Math.max(0.001, Math.abs(dx)),
      (viewport.height / 2 + radius + world.config.spawnPadding) / Math.max(0.001, Math.abs(dy)));
    const x = player.x + dx * distance, y = player.y + dy * distance;
    if (world.fish.some(fish => fish.state !== 'eaten' && Math.hypot(fish.x - x, fish.y - y)
      < radius + referencePhysics.radius(fish.mass, world.config.baseRadius, world.config.startMass) + 20)) continue;
    const rotation = normalizeAngle(angle + Math.PI - past.heading);
    registerFish(world, { id: `${world.id}:echo:${world.nextEcho++}`, kind: 'echo', state: 'active', x, y,
      heading: normalizeAngle(past.heading + rotation), mass, bornTick: world.tick,
      source: { trackId: player.id, mode: 'delay', delayTicks: delay, rotation }, controlIndex: 0, expectedMeals: [], expectedMealIndex: 0 });
    return;
  }
}

/** @param {World} world @param {Fish} fish @param {Vector} playerControl @returns {Vector} */
function controlFor(world, fish, playerControl) {
  if (fish.kind === 'player') return playerControl;
  const source = fish.source;
  if (!source) return { x: 0, y: 0 };
  const track = source.mode === 'archive' ? world.source?.tracks.find(track => track.id === source.trackId)
    : world.recording.tracks.find(track => track.id === source.trackId);
  const targetTick = source.mode === 'delay' ? world.tick - (source.delayTicks ?? 0) : world.tick;
  if (!track) return { x: 0, y: 0 };
  while (fish.controlIndex + 1 < track.controls.length && track.controls[fish.controlIndex + 1].tick <= targetTick) fish.controlIndex++;
  const input = track.controls[fish.controlIndex];
  if (!input || input.tick > targetTick) return { x: Math.cos(fish.heading), y: Math.sin(fish.heading) };
  const rotation = source.rotation ?? 0;
  return { x: input.x * Math.cos(rotation) - input.y * Math.sin(rotation), y: input.x * Math.sin(rotation) + input.y * Math.cos(rotation) };
}

/** @param {World} world @param {Fish} fish */
function checkContinuation(world, fish) {
  if (fish.state !== 'active' || fish.source?.mode !== 'archive') return;
  while (fish.expectedMealIndex < fish.expectedMeals.length && fish.expectedMeals[fish.expectedMealIndex].tick <= world.tick) {
    const meal = fish.expectedMeals[fish.expectedMealIndex++];
    if (!world.events.some(event => event.type === 'eat' && event.actorId === fish.id && event.preyId === meal.preyId)) {
      makePassive(world, fish, 'Missing recorded meal');
      return;
    }
  }
  const track = world.source?.tracks.find(track => track.id === fish.source?.trackId);
  const stopped = world.source?.events.find(event => event.actorId === fish.id && event.type === 'passive');
  if (track && world.tick >= (stopped?.tick ?? track.endTick)) makePassive(world, fish, 'Recording ended');
}

/** @param {World} world @param {Vector} control @param {import('./types.js').Viewport} [viewport] @param {import('./types.js').MathPort} [math] */
export function stepWorld(world, control, viewport = { width: 1000, height: 650 }, math = referencePhysics) {
  if (world.status !== 'playing') return;
  world.tick++;
  admitArchives(world);
  spawnEcho(world, viewport);
  const before = new Map(world.fish.filter(fish => fish.state !== 'eaten').map(fish => [fish.id, { x: fish.x, y: fish.y }]));
  /** @type {Map<string,Vector>} */ const controls = new Map();
  for (const fish of world.fish) if (fish.state === 'active') {
    const input = controlFor(world, fish, control);
    controls.set(fish.id, input);
    moveFish(fish, input, world.config, math);
  }
  resolveCollisions(world, before, math);
  for (const fish of world.fish) {
    checkContinuation(world, fish);
    recordFish(world, fish, controls.get(fish.id) ?? null);
  }
}

/** @param {World} world @param {string} [reason] @returns {Run} */
export function finishWorld(world, reason = world.status) {
  return { id: world.id, startedAt: world.startedAt, finishedAt: new Date().toISOString(), reason, durationTicks: world.tick,
    config: structuredClone(world.config), tracks: structuredClone(world.recording.tracks), events: structuredClone(world.events) };
}
