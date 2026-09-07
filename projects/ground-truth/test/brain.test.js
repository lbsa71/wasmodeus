import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTION_DIG,
  ACTION_DIG_DOWN,
  ACTION_TURN,
  ACTION_WALK,
  BRAIN_B1,
  BRAIN_B2,
  BRAIN_FLOATS,
  BRAIN_W1,
  BRAIN_W2,
  HIDDEN,
  INPUTS,
  INPUT_BIAS,
  INPUT_GOLD_BELOW,
  INPUT_HARDNESS_BELOW,
  OUTPUTS,
  TOPOLOGY_V1,
  TOPOLOGY_V2,
  layoutFor,
  migrateBrain,
  WEIGHT_SPREAD,
  crossover,
  decide,
  forward,
  mutate,
  nextGeneration,
  randomBrain,
  rankByScore,
} from "../src/core/brain.js";

test("the weight layout tiles the brain exactly, with nothing left over", () => {
  assert.equal(BRAIN_W1, 0);
  assert.equal(BRAIN_B1, HIDDEN * INPUTS);
  assert.equal(BRAIN_W2, BRAIN_B1 + HIDDEN);
  assert.equal(BRAIN_B2, BRAIN_W2 + OUTPUTS * HIDDEN);
  assert.equal(BRAIN_FLOATS, BRAIN_B2 + OUTPUTS);
  assert.equal(INPUT_BIAS, 0);
  assert.equal(INPUT_GOLD_BELOW, INPUTS - 1, "every sense has a slot and the last one is the last");
  assert.deepEqual([ACTION_WALK, ACTION_DIG, ACTION_TURN, ACTION_DIG_DOWN], [0, 1, 2, 3]);
});

test("a forward pass is what the arithmetic says it is", () => {
  // One hidden unit wired to one input with weight 2 and bias 0, feeding
  // output 1 with weight 3 and bias -1: tanh(2 * 0.5) * 3 - 1.
  const weights = new Float32Array(BRAIN_FLOATS);
  weights[BRAIN_W1 + 0 * INPUTS + 4] = 2;
  weights[BRAIN_W2 + 1 * HIDDEN + 0] = 3;
  weights[BRAIN_B2 + 1] = -1;
  const inputs = new Float32Array(INPUTS);
  inputs[4] = 0.5;
  const outputs = forward(weights, inputs);
  assert.ok(Math.abs(outputs[1] - (Math.tanh(1) * 3 - 1)) < 1e-6);
  assert.equal(outputs[0], 0);
  assert.equal(outputs[2], 0);
});

test("a brain can be read at an offset inside a bigger array", () => {
  const two = new Float32Array(BRAIN_FLOATS * 2);
  two[BRAIN_FLOATS + BRAIN_B2 + 2] = 7;
  assert.equal(forward(two, new Float32Array(INPUTS), BRAIN_FLOATS)[2], 7);
  assert.equal(forward(two, new Float32Array(INPUTS), 0)[2], 0);
});

test("the decision is the largest output, the first on a tie", () => {
  assert.equal(decide([0.1, 0.9, 0.3]), ACTION_DIG);
  assert.equal(decide([0.5, 0.5, 0.5]), ACTION_WALK);
  assert.equal(decide([-3, -2, -1]), ACTION_TURN);
});

test("a random brain is bounded, full, and a pure function of its seed", () => {
  const a = randomBrain(11);
  const b = randomBrain(11);
  const c = randomBrain(12);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.equal(a.length, BRAIN_FLOATS);
  assert.ok(a.every((w) => Math.abs(w) <= WEIGHT_SPREAD));
  assert.ok(new Set(a).size > BRAIN_FLOATS / 2, "the weights are not all the same few values");
});

test("mutation touches about the asked-for fraction and leaves the rest bit-exact", () => {
  const parent = randomBrain(3);
  let changed = 0;
  const trials = 200;
  for (let seed = 0; seed < trials; seed += 1) {
    const child = mutate(parent, seed, { rate: 0.1, strength: 0.5 });
    for (let k = 0; k < BRAIN_FLOATS; k += 1) {
      if (child[k] !== parent[k]) {
        changed += 1;
        assert.ok(Math.abs(child[k] - parent[k]) <= 0.5, "a nudge is bounded by the strength");
      }
    }
  }
  const fraction = changed / (trials * BRAIN_FLOATS);
  assert.ok(fraction > 0.07 && fraction < 0.13, `mutated ${(fraction * 100).toFixed(1)}% of weights`);
});

test("crossover takes every weight from one parent or the other", () => {
  const a = new Float32Array(BRAIN_FLOATS).fill(1);
  const b = new Float32Array(BRAIN_FLOATS).fill(-1);
  const child = crossover(a, b, 5);
  const fromA = child.filter((w) => w === 1).length;
  assert.equal(fromA + child.filter((w) => w === -1).length, BRAIN_FLOATS);
  assert.ok(fromA > BRAIN_FLOATS * 0.3 && fromA < BRAIN_FLOATS * 0.7, `${fromA} from one parent`);
  assert.deepEqual(crossover(a, b, 5), child, "and is repeatable");
});

test("ranking is best first, ties in slot order", () => {
  assert.deepEqual(rankByScore([3, 9, 9, 1]), [1, 2, 0, 3]);
});

test("the elite keep their slots untouched and everyone else is bred from them", () => {
  const count = 20;
  const brains = new Float32Array(count * BRAIN_FLOATS);
  for (let i = 0; i < count; i += 1) randomBrain(100 + i, brains, i * BRAIN_FLOATS);
  const scores = Array.from({ length: count }, (_, i) => (i * 7) % count);
  const { brains: next, elites } = nextGeneration(brains, scores, 1, {
    eliteFraction: 0.2, mutationRate: 0.5, mutationStrength: 1,
  });
  assert.equal(next.length, brains.length);
  assert.equal(elites.length, 4);
  assert.deepEqual([...elites], rankByScore(scores).slice(0, 4), "the elite are the top scorers");
  for (const slot of elites) {
    assert.deepEqual(
      next.subarray(slot * BRAIN_FLOATS, (slot + 1) * BRAIN_FLOATS),
      brains.subarray(slot * BRAIN_FLOATS, (slot + 1) * BRAIN_FLOATS),
      `elite ${slot} must survive in place, or the GPU's elite list points at strangers`,
    );
  }
  // A child is made of its parents' weights, nudged: every child weight is
  // within the mutation strength of some elite's weight at that position.
  const eliteBrains = [...elites].map((slot) => brains.subarray(slot * BRAIN_FLOATS, (slot + 1) * BRAIN_FLOATS));
  for (let slot = 0; slot < count; slot += 1) {
    if (elites.includes(slot)) continue;
    for (let k = 0; k < BRAIN_FLOATS; k += 1) {
      const w = next[slot * BRAIN_FLOATS + k];
      assert.ok(eliteBrains.some((e) => Math.abs(e[k] - w) <= 1 + 1e-6), `slot ${slot} weight ${k} came from nowhere`);
    }
  }
});

test("a generation is a pure function of its seed", () => {
  const brains = randomBrain(1, new Float32Array(6 * BRAIN_FLOATS));
  for (let i = 1; i < 6; i += 1) randomBrain(i, brains, i * BRAIN_FLOATS);
  const scores = [5, 1, 4, 2, 3, 0];
  const options = { eliteFraction: 0.34, mutationRate: 0.2, mutationStrength: 0.3 };
  assert.deepEqual(nextGeneration(brains, scores, 9, options), nextGeneration(brains, scores, 9, options));
  assert.notDeepEqual(nextGeneration(brains, scores, 9, options).brains, nextGeneration(brains, scores, 10, options).brains);
});

test("at least one elite survives however small the fraction", () => {
  const brains = randomBrain(1, new Float32Array(3 * BRAIN_FLOATS));
  const { elites } = nextGeneration(brains, [0, 0, 1], 1, { eliteFraction: 0, mutationRate: 0.1, mutationStrength: 0.1 });
  assert.deepEqual([...elites], [2]);
});

test("a brains array of the wrong size is an error, not a silent misread", () => {
  assert.throws(() => nextGeneration(new Float32Array(5), [1, 2], 1, { eliteFraction: 0.5, mutationRate: 0, mutationStrength: 0 }), /Expected/);
});

test("the current layout is the general one applied to the current shape", () => {
  assert.deepEqual(layoutFor({ inputs: INPUTS, hidden: HIDDEN, outputs: OUTPUTS }),
    { w1: BRAIN_W1, b1: BRAIN_B1, w2: BRAIN_W2, b2: BRAIN_B2, floats: BRAIN_FLOATS });
  assert.equal(layoutFor(TOPOLOGY_V1).floats, 131, "what the first populations were bred with");
  assert.equal(layoutFor(TOPOLOGY_V2).floats, 148, "and the ones bred with dig-down");
});

test("a brain bred before dig-down existed behaves exactly as it did, and can now learn more", () => {
  // Every old weight lands where it was; the new sense is wired with zeros and
  // the new action scores zero. On the twelve old senses the three old
  // outputs are bit-identical to what the old brain would have produced.
  const old = new Float32Array(layoutFor(TOPOLOGY_V1).floats);
  for (let k = 0; k < old.length; k += 1) old[k] = Math.sin(k) * 0.7;
  const migrated = migrateBrain(old, TOPOLOGY_V1);
  assert.equal(migrated.length, BRAIN_FLOATS);
  const v1 = layoutFor(TOPOLOGY_V1);
  for (let h = 0; h < HIDDEN; h += 1) {
    for (let k = 0; k < TOPOLOGY_V1.inputs; k += 1) {
      assert.equal(migrated[BRAIN_W1 + h * INPUTS + k], old[v1.w1 + h * TOPOLOGY_V1.inputs + k], `W1[${h}][${k}]`);
    }
    assert.equal(migrated[BRAIN_W1 + h * INPUTS + INPUT_HARDNESS_BELOW], 0, "the new sense changes nothing yet");
    assert.equal(migrated[BRAIN_B1 + h], old[v1.b1 + h]);
  }
  for (let o = 0; o < TOPOLOGY_V1.outputs; o += 1) {
    for (let h = 0; h < HIDDEN; h += 1) assert.equal(migrated[BRAIN_W2 + o * HIDDEN + h], old[v1.w2 + o * HIDDEN + h]);
    assert.equal(migrated[BRAIN_B2 + o], old[v1.b2 + o]);
  }
  for (let h = 0; h < HIDDEN; h += 1) assert.equal(migrated[BRAIN_W2 + ACTION_DIG_DOWN * HIDDEN + h], 0);
  assert.equal(migrated[BRAIN_B2 + ACTION_DIG_DOWN], 0, "the new action scores nothing until mutation finds it");

  // And the old forward pass, done by hand on the old layout, agrees.
  const inputs = new Float32Array(INPUTS);
  for (let k = 0; k < TOPOLOGY_V1.inputs; k += 1) inputs[k] = Math.cos(k);
  const hidden = Array.from({ length: HIDDEN }, (_, h) => {
    let sum = old[v1.b1 + h];
    for (let k = 0; k < TOPOLOGY_V1.inputs; k += 1) sum += old[v1.w1 + h * TOPOLOGY_V1.inputs + k] * inputs[k];
    return Math.tanh(sum);
  });
  const outputs = forward(migrated, inputs);
  for (let o = 0; o < TOPOLOGY_V1.outputs; o += 1) {
    let sum = old[v1.b2 + o];
    for (let h = 0; h < HIDDEN; h += 1) sum += old[v1.w2 + o * HIDDEN + h] * hidden[h];
    assert.ok(Math.abs(outputs[o] - sum) < 1e-5, `output ${o}`);
  }
  assert.throws(() => migrateBrain(new Float32Array(10)), /weights/);
});

test("a version-2 brain migrates too: the two new senses are wired with zeros", () => {
  const v2 = layoutFor(TOPOLOGY_V2);
  const old = new Float32Array(v2.floats);
  for (let k = 0; k < old.length; k += 1) old[k] = Math.cos(k);
  const migrated = migrateBrain(old, TOPOLOGY_V2);
  for (let h = 0; h < HIDDEN; h += 1) {
    for (let k = 0; k < TOPOLOGY_V2.inputs; k += 1) assert.equal(migrated[BRAIN_W1 + h * INPUTS + k], old[v2.w1 + h * TOPOLOGY_V2.inputs + k]);
    for (let k = TOPOLOGY_V2.inputs; k < INPUTS; k += 1) assert.equal(migrated[BRAIN_W1 + h * INPUTS + k], 0);
  }
  for (let o = 0; o < OUTPUTS; o += 1) {
    for (let h = 0; h < HIDDEN; h += 1) assert.equal(migrated[BRAIN_W2 + o * HIDDEN + h], old[v2.w2 + o * HIDDEN + h]);
    assert.equal(migrated[BRAIN_B2 + o], old[v2.b2 + o]);
  }
});
