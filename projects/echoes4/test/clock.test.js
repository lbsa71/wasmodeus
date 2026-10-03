import assert from 'node:assert/strict';
import test from 'node:test';
import { SimulationClock } from '../src/clock.js';
test('rendering at different rates advances the same fixed timeline', () => {
  for (const fps of [30, 60, 144]) {
    const clock = new SimulationClock(30); let ticks = 0;
    for (let frame = 0; frame < fps * 5; frame++) ticks += clock.advance(1 / fps, true);
    assert.equal(ticks, 150);
  }
});
test('pausing never banks elapsed time and frame gaps cannot fast-forward a dive', () => {
  const clock = new SimulationClock(30);
  assert.equal(clock.advance(30, false), 0);
  assert.equal(clock.advance(1 / 60, true), 0);
  assert.equal(clock.advance(1 / 60, true), 1);
  assert.ok(clock.advance(30, true) <= 6);
});
