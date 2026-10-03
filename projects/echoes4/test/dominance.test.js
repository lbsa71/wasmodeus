import assert from 'node:assert/strict';
import test from 'node:test';
import { predatorFor } from '../src/core/dominance.js';
const fish = (id, mass, state = 'active', effort = 1) => ({ id, mass, state, effort, bornTick: 0 });
test('equal-size passive food is edible and cannot consume an active swimmer', () => {
  const player = fish('you', 5), food = fish('food', 5, 'passive');
  assert.equal(predatorFor(player, food), player);
  assert.equal(predatorFor(food, player), player);
  assert.equal(predatorFor(fish('small', 4), food), null);
});
test('any genuine mass advantage counts, without an eight-percent neutral band', () => {
  const a = fish('a', 5.01), b = fish('b', 5);
  assert.equal(predatorFor(a, b), a);
});
test('equal active swimmers resolve by swimming effort then a stable identity', () => {
  const a = fish('a', 5, 'active', .5), b = fish('b', 5, 'active', 1);
  assert.equal(predatorFor(a, b), b);
  a.effort = 1;
  assert.equal(predatorFor(a, b), a);
  assert.equal(predatorFor(b, a), a);
});
