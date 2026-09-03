import assert from "node:assert/strict";
import test from "node:test";

import { headingFromDelta } from "../src/simulation/ship-heading.js";

test("ship heading follows its positional delta", () => {
  assert.ok(Math.abs(headingFromDelta({ x: 3, y: 4 }, { x: 0, y: 0 }, 0) - Math.atan2(4, 3)) < 1e-12);
});

test("ship heading retains its fallback when stationary", () => {
  assert.equal(headingFromDelta({ x: 2, y: 2 }, { x: 2, y: 2 }, 0.75), 0.75);
});
