import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_REST_THRESHOLD,
  MAX_REST_THRESHOLD,
  MIN_REST_THRESHOLD,
  advanceRest,
  clampRestThreshold,
  shouldDeposit,
} from "../src/core/rest.js";
import { SKY_CELL } from "../src/core/geometry.js";

test("staying in one cell accumulates rest frames", () => {
  let state = { lastCell: 42, restFrames: 0 };
  state = advanceRest(state, 42);
  assert.equal(state.restFrames, 1);
  state = advanceRest(state, 42);
  assert.equal(state.restFrames, 2);
});

test("changing cell resets rest and adopts the new cell", () => {
  const state = advanceRest({ lastCell: 42, restFrames: 5 }, 43);
  assert.deepEqual(state, { lastCell: 43, restFrames: 0 });
});

test("a pixel at its ballistic apex never counts as at rest", () => {
  // Two frames in the sky would otherwise look identical to two frames still.
  let state = { lastCell: SKY_CELL, restFrames: 0 };
  state = advanceRest(state, SKY_CELL);
  state = advanceRest(state, SKY_CELL);
  assert.equal(state.restFrames, 0);
  assert.equal(shouldDeposit(state.restFrames, DEFAULT_REST_THRESHOLD), false);
});

test("the deposit threshold is inclusive", () => {
  assert.equal(shouldDeposit(1, 2), false);
  assert.equal(shouldDeposit(2, 2), true);
  assert.equal(shouldDeposit(9, 2), true);
});

test("a threshold of zero would settle every pixel instantly, so it is clamped", () => {
  assert.equal(clampRestThreshold(0), MIN_REST_THRESHOLD);
  assert.equal(clampRestThreshold(999), MAX_REST_THRESHOLD);
  assert.equal(clampRestThreshold(3.4), 3);
  assert.equal(shouldDeposit(0, 0), false);
});
