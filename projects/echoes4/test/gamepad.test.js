import assert from 'node:assert/strict';
import test from 'node:test';
import { GamepadReader, stickVector } from '../src/input/gamepad.js';
const pad = (axes = [0, 0], pressed = [], index = 0) => ({ id: 'Xbox Wireless Controller (USB)', mapping: 'standard', connected: true,
  index, axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })) });

test('radial dead zone suppresses drift and preserves analog direction and strength', () => {
  assert.deepEqual(stickVector(.1, -.1), { x: 0, y: 0 });
  assert.deepEqual(stickVector(1, 0), { x: 1, y: 0 });
  const half = stickVector(.59, 0);
  assert.ok(Math.abs(half.x - .5) < 1e-12);
  const diagonal = stickVector(1, 1);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-12);
  assert.deepEqual(stickVector(NaN, Infinity), { x: 0, y: 0 });
});
test('Xbox buttons generate one action per press, not once per rendering frame', () => {
  const reader = new GamepadReader();
  assert.deepEqual(reader.poll([null, pad([0, 0], [0, 9])]).actions, ['confirm', 'pause']);
  assert.deepEqual(reader.poll([pad([0, 0], [0, 9])]).actions, []);
  reader.poll([pad()]);
  assert.deepEqual(reader.poll([pad([0, 0], [8, 3, 12, 15])]).actions, ['links', 'tuning', 'up', 'right']);
});
test('disconnection produces one pause signal and reconnected controllers are usable', () => {
  const reader = new GamepadReader();
  assert.equal(reader.poll([pad()]).connected, true);
  assert.equal(reader.poll([]).lost, true);
  assert.equal(reader.poll([]).lost, false);
  const reconnected = reader.poll([null, pad([-.8, 0], [0], 1)]);
  assert.equal(reconnected.connected, true);
  assert.ok(reconnected.direction.x < 0);
  assert.deepEqual(reconnected.actions, ['confirm']);
});
test('the active controller stays selected when another controller connects', () => {
  const reader = new GamepadReader(); reader.poll([pad([1, 0], [], 1)]);
  assert.equal(reader.poll([pad([-1, 0], [], 0), pad([1, 0], [], 1)]).direction.x, 1);
});
