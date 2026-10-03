import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, DEFAULT_CONFIG, finishWorld, getPlayer, stepWorld } from '../src/core/simulation.js';

const still = { x: 0, y: 0 };
const config = { baseSpeed: 0, durationSeconds: 60, echoDelaySeconds: 100 };
function track(id, mass, x, endTick = 30, bornTick = 0) {
  return { id, kind: 'player', bornTick, initial: { x, y: 0, mass, heading: 0 },
    controls: Array.from({ length: endTick - bornTick }, (_, index) => ({ tick: index + bornTick + 1, ...still })), frames: [], endTick };
}
function meal(actorId, preyId, tick) {
  return { id: `old:${actorId}:${preyId}`, type: 'eat', tick, actorId, preyId, x: 0, y: 0 };
}
function blueprint(tracks, events = []) {
  return { id: 'previous', startedAt: '2026-10-03T00:00:00.000Z', finishedAt: '2026-10-03T00:01:00.000Z', reason: 'complete',
    durationTicks: 1800, config: { ...DEFAULT_CONFIG, ...config }, tracks, events };
}
function fixture(tracks, events = [], overrides = {}) {
  const world = createWorld({ id: 'current', source: blueprint(tracks, events), config: { ...config, ...overrides }, seed: 42 });
  getPlayer(world).x = 10000;
  return world;
}
const fish = (world, id) => world.fish.find((entry) => entry.id === id);

test('a missing later meal preserves earlier meals and freezes only at the dead end', () => {
  const world = fixture([track('C', 12, 0), track('D', 1, 0), track('E', 1, 300), track('A', 2, 600)],
    [meal('C', 'D', 1), meal('C', 'E', 2), meal('C', 'A', 4)]);
  stepWorld(world, still);
  assert.equal(fish(world, 'C').mass, 13);
  assert.equal(fish(world, 'C').state, 'active');
  fish(world, 'E').x = 0;
  getPlayer(world).mass = 30;
  getPlayer(world).x = 600;
  stepWorld(world, still);
  assert.equal(fish(world, 'A').state, 'eaten');
  assert.equal(fish(world, 'C').mass, 14);
  stepWorld(world, still);
  assert.equal(fish(world, 'C').state, 'active');
  stepWorld(world, still);
  assert.equal(fish(world, 'C').state, 'passive');
  assert.equal(fish(world, 'C').mass, 14);
  assert.equal(world.events.find((event) => event.actorId === 'C' && event.type === 'passive').tick, 4);
});

test('rescued prey survive their missing predator until their tape ends', () => {
  const world = fixture([track('A', 8, 0, 6), track('B', 2, 200, 3)], [meal('A', 'B', 2)]);
  getPlayer(world).mass = 20;
  getPlayer(world).x = 0;
  stepWorld(world, still);
  assert.equal(fish(world, 'A').state, 'eaten');
  stepWorld(world, still);
  assert.equal(fish(world, 'B').state, 'active');
  stepWorld(world, still);
  assert.equal(fish(world, 'B').state, 'passive');
  assert.equal(fish(world, 'B').mass, 2);
});

test('incidental ghost meals change mass and are recorded without replacing a required meal', () => {
  const world = fixture([track('C', 8, 0), track('F', 2, 0), track('A', 1, 500)], [meal('C', 'A', 3)]);
  stepWorld(world, still);
  assert.equal(fish(world, 'F').state, 'eaten');
  assert.equal(fish(world, 'C').mass, 10);
  assert.ok(world.events.some((event) => event.actorId === 'C' && event.preyId === 'F'));
  stepWorld(world, still);
  stepWorld(world, still);
  assert.equal(fish(world, 'C').state, 'passive');
});

test('a required prey eaten early by its intended predator fulfills the later dependency', () => {
  const world = fixture([track('C', 8, 0), track('A', 2, 0)], [meal('C', 'A', 4)]);
  for (let tick = 0; tick < 4; tick += 1) stepWorld(world, still);
  assert.equal(fish(world, 'C').state, 'active');
  assert.equal(fish(world, 'C').mass, 10);
  assert.equal(world.events.filter((event) => event.type === 'eat').length, 1);
});

test('passive food keeps its mass, cannot eat, and still requires a larger predator', () => {
  const world = fixture([track('large', 12, 0, 1), track('small', 1, 300)]);
  stepWorld(world, still);
  fish(world, 'small').x = 0;
  stepWorld(world, still);
  assert.equal(fish(world, 'large').state, 'passive');
  assert.equal(fish(world, 'small').state, 'active');
  getPlayer(world).mass = 20;
  getPlayer(world).x = 0;
  stepWorld(world, still);
  assert.equal(fish(world, 'large').state, 'eaten');
  assert.equal(getPlayer(world).mass, 33);
});

test('same-size contacts resolve deterministically and collision mass is conserved', () => {
  const world = fixture([track('one', 4, 0), track('two', 4, 0)]);
  stepWorld(world, still);
  assert.equal(world.events.filter((event) => event.type === 'eat').length, 1);
  getPlayer(world).mass = 12;
  getPlayer(world).x = 0;
  stepWorld(world, still);
  assert.equal(getPlayer(world).mass, 20);
  assert.equal(world.events.filter((event) => event.type === 'eat').length, 2);
});

test('a dive remains playing past its former duration and ends only on death or banking', () => {
  const world = createWorld({ id: 'endless', source: null, config: { durationSeconds: 1, baseSpeed: 0, echoDelaySeconds: 100 } });
  for (let i = 0; i < 300; i++) stepWorld(world, still);
  assert.equal(world.tick, 300);
  assert.equal(world.status, 'playing');
});

test('late source births use the global clock and archived fish never respawn', () => {
  const world = fixture([track('late', 1, 0, 8, 3)]);
  stepWorld(world, still);
  stepWorld(world, still);
  assert.equal(fish(world, 'late'), undefined);
  getPlayer(world).x = 0;
  stepWorld(world, still);
  assert.equal(fish(world, 'late').bornTick, 3);
  assert.equal(fish(world, 'late').state, 'eaten');
  for (let tick = 0; tick < 8; tick += 1) stepWorld(world, still);
  assert.equal(world.fish.filter((entry) => entry.id === 'late').length, 1);
});

test('one delayed self echo spawns outside the player view and replenishes after consumption', () => {
  const world = createWorld({ id: 'first', source: null, config: { ...config, echoDelaySeconds: 1 }, seed: 3 });
  for (let tick = 0; tick < 30; tick += 1) stepWorld(world, { x: 1, y: 0 }, { width: 800, height: 500 });
  const echo = world.fish.find((entry) => entry.kind === 'echo');
  assert.ok(echo);
  assert.equal(echo.bornTick, 30);
  assert.equal(echo.mass, 1);
  const player = getPlayer(world);
  assert.ok(Math.abs(echo.x - player.x) > 410 || Math.abs(echo.y - player.y) > 260);
  echo.x = player.x;
  echo.y = player.y;
  stepWorld(world, still, { width: 800, height: 500 });
  assert.equal(echo.state, 'eaten');
  stepWorld(world, still, { width: 800, height: 500 });
  assert.equal(world.fish.filter((entry) => entry.kind === 'echo' && entry.state !== 'eaten').length, 1);
  assert.equal(world.fish.filter((entry) => entry.kind === 'echo').length, 2);
});

test('saving and restoring a playing world preserves deterministic future simulation', () => {
  const world = createWorld({ id: 'restore', source: null, config: { echoDelaySeconds: 1 }, seed: 8 });
  for (let tick = 0; tick < 40; tick += 1) stepWorld(world, { x: 1, y: 0.2 });
  const restored = JSON.parse(JSON.stringify(world));
  for (let tick = 0; tick < 120; tick += 1) {
    const control = { x: Math.cos(tick / 20), y: Math.sin(tick / 20) };
    stepWorld(world, control);
    stepWorld(restored, control);
  }
  assert.deepEqual(restored, world);
});

test('finishing records all participants and events without mutating the source', () => {
  const source = blueprint([track('old', 1, 0)]);
  const original = structuredClone(source);
  const world = createWorld({ id: 'new', source, config, seed: 1 });
  getPlayer(world).x = 0;
  stepWorld(world, still);
  const run = finishWorld(world, 'banked');
  assert.equal(run.reason, 'banked');
  assert.equal(run.tracks.length, 2);
  assert.equal(run.events.filter((event) => event.type === 'eat').length, 1);
  assert.deepEqual(source, original);
  assert.ok(run.tracks.every((entry) => entry.frames.length > 0));
});

test('eaten recordings end at actual death, while passive recordings retain their stop event', () => {
  const world = fixture([track('C', 8, 0, 5), track('A', 1, 0, 10)]);
  for (let tick = 0; tick < 12; tick++) stepWorld(world, still);
  const run = finishWorld(world);
  assert.equal(run.tracks.find(entry => entry.id === 'A').endTick, 1);
  assert.equal(run.events.find(entry => entry.actorId === 'C' && entry.type === 'passive').tick, 5);
  const replay = createWorld({ id: 'replay', source: run, config });
  getPlayer(replay).x = 10000;
  for (let tick = 0; tick < 5; tick++) stepWorld(replay, still);
  assert.equal(fish(replay, 'C').state, 'passive');
});

test('swept contacts prevent fast swimmers passing through their prey', () => {
  const world = fixture([track('target', 1, 0)], [], { baseSpeed: 6000, turnRate: 100 });
  const player = getPlayer(world);
  player.x = -100; player.heading = 0;
  stepWorld(world, { x: 1, y: 0 });
  assert.equal(fish(world, 'target').state, 'eaten');
  assert.equal(player.mass, 5);
});

test('unchanged inputs and motion frames are compacted without changing replay', () => {
  const world = createWorld({ id: 'compact', source: null, config: { echoDelaySeconds: 100 } });
  for (let tick = 0; tick < 30; tick++) stepWorld(world, { x: 1, y: 0 });
  const run = finishWorld(world), recorded = run.tracks[0];
  assert.equal(recorded.controls.length, 1);
  assert.ok(recorded.frames.length <= 11);
  assert.equal(recorded.endTick, 30);
  const replay = createWorld({ id: 'replay', source: run, config: { echoDelaySeconds: 100 } });
  getPlayer(replay).x = 10000;
  for (let tick = 0; tick < 30; tick++) stepWorld(replay, still);
  const ghost = fish(replay, recorded.id);
  assert.equal(ghost.x, getPlayer(world).x);
  assert.equal(ghost.y, getPlayer(world).y);
  assert.equal(ghost.mass, getPlayer(world).mass);
});
