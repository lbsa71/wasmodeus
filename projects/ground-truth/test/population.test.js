import test from "node:test";
import assert from "node:assert/strict";

import { BRAIN_FLOATS, TOPOLOGY_V1, layoutFor, migrateBrain, randomBrain } from "../src/core/brain.js";
import { POPULATION_VERSION, packPopulation, resizePopulation, unpackPopulation } from "../src/core/population.js";

/** @param {number} count @returns {Float32Array} */
function population(count) {
  const brains = new Float32Array(count * BRAIN_FLOATS);
  for (let i = 0; i < count; i += 1) randomBrain(50 + i, brains, i * BRAIN_FLOATS);
  return brains;
}

test("a population round-trips through its record", () => {
  const brains = population(5);
  const elites = Uint32Array.from([3, 1]);
  const record = packPopulation({ generation: 12, count: 5, brains, elites, best: 400, mean: 31.5 }, 1234);
  assert.equal(record.version, POPULATION_VERSION);
  assert.equal(record.savedAt, 1234);
  const back = unpackPopulation(record);
  assert.deepEqual(back.brains, brains);
  assert.deepEqual(back.elites, elites);
  assert.equal(back.generation, 12);
  assert.equal(back.best, 400);
});

test("a record from storage may come back as plain arrays and still be a population", () => {
  // Structured clone keeps typed arrays, but nothing here should depend on it.
  const brains = population(2);
  const back = unpackPopulation({
    version: POPULATION_VERSION, generation: 3, count: 2, brains: [...brains], elites: [1], best: 1, mean: 1, savedAt: 0,
  });
  assert.ok(back.brains instanceof Float32Array);
  assert.deepEqual(back.brains, brains);
});

test("a record that cannot be trusted is refused, not loaded", () => {
  const brains = population(2);
  const good = { version: POPULATION_VERSION, generation: 1, count: 2, brains, elites: new Uint32Array([0]), best: 0, mean: 0, savedAt: 0 };
  assert.throws(() => unpackPopulation(null), /No population/);
  assert.throws(() => unpackPopulation({ ...good, version: POPULATION_VERSION + 1 }), /version/);
  assert.throws(() => unpackPopulation({ ...good, version: 1 }), /version-1 population/, "a version-1 record of the wrong size");
  assert.throws(() => unpackPopulation({ ...good, count: 3 }), /weights/);
  assert.throws(() => unpackPopulation({ ...good, elites: new Uint32Array([7]) }), /outside/);
  const poisoned = new Float32Array(brains);
  poisoned[5] = Number.NaN;
  assert.throws(() => unpackPopulation({ ...good, brains: poisoned }), /not a number/);
  assert.throws(() => packPopulation({ generation: 0, count: 3, brains, elites: new Uint32Array(), best: 0, mean: 0 }), /Expected/);
});

test("shrinking keeps the first brains and drops elites beyond the end", () => {
  const brains = population(6);
  const { brains: fewer, elites } = resizePopulation(brains, Uint32Array.from([5, 2, 4]), 3, 1);
  assert.equal(fewer.length, 3 * BRAIN_FLOATS);
  assert.deepEqual(fewer, brains.subarray(0, 3 * BRAIN_FLOATS));
  assert.deepEqual([...elites], [2]);
});

test("growing fills the new slots with mutated copies of what was learned", () => {
  const brains = population(2);
  const { brains: more, elites } = resizePopulation(brains, Uint32Array.from([1]), 5, 9, { rate: 0.5, strength: 0.25 });
  assert.equal(more.length, 5 * BRAIN_FLOATS);
  assert.deepEqual(more.subarray(0, 2 * BRAIN_FLOATS), brains, "the originals are untouched");
  for (let slot = 2; slot < 5; slot += 1) {
    const parent = brains.subarray((slot % 2) * BRAIN_FLOATS, (slot % 2 + 1) * BRAIN_FLOATS);
    const child = more.subarray(slot * BRAIN_FLOATS, (slot + 1) * BRAIN_FLOATS);
    let differs = 0;
    for (let k = 0; k < BRAIN_FLOATS; k += 1) {
      assert.ok(Math.abs(child[k] - parent[k]) <= 0.25 + 1e-6, `slot ${slot} weight ${k} is not a nudge of its parent`);
      if (child[k] !== parent[k]) differs += 1;
    }
    assert.ok(differs > 0, `slot ${slot} is an exact copy, which is no diversity at all`);
  }
  assert.deepEqual([...elites], [1], "the elite list is still valid");
});

test("when no elite survives a cut, everyone is elite until the next selection", () => {
  const { elites } = resizePopulation(population(4), Uint32Array.from([3]), 2, 1);
  assert.deepEqual([...elites], [0, 1]);
});

test("resizing is a pure function of its seed", () => {
  const brains = population(1);
  assert.deepEqual(resizePopulation(brains, new Uint32Array([0]), 4, 3), resizePopulation(brains, new Uint32Array([0]), 4, 3));
  assert.throws(() => resizePopulation(new Float32Array(0), new Uint32Array(0), 2, 1), /empty/);
});

test("a version-1 population is migrated on the way in, not refused", () => {
  // Twenty generations bred before dig-down existed are worth keeping.
  const old = layoutFor(TOPOLOGY_V1).floats;
  const brains = new Float32Array(3 * old);
  for (let k = 0; k < brains.length; k += 1) brains[k] = (k % 17) / 17 - 0.5;
  const back = unpackPopulation({ version: 1, generation: 20, count: 3, brains, elites: [2], best: 9, mean: 4, savedAt: 1 });
  assert.equal(back.version, POPULATION_VERSION);
  assert.equal(back.generation, 20);
  assert.equal(back.brains.length, 3 * BRAIN_FLOATS);
  for (let i = 0; i < 3; i += 1) {
    assert.deepEqual(back.brains.subarray(i * BRAIN_FLOATS, (i + 1) * BRAIN_FLOATS), migrateBrain(brains.subarray(i * old, (i + 1) * old)));
  }
});
