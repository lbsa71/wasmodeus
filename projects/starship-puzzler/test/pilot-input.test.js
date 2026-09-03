import assert from "node:assert/strict";
import test from "node:test";

import { keyboardControls, radialIntent } from "../src/input/pilot-input.js";

test("a centered analogue stick produces no radial intent", () => {
  assert.equal(radialIntent(0.08), 0);
});

test("stick up pushes outward and stick down pushes inward", () => {
  assert.equal(radialIntent(-0.3), 1);
  assert.equal(radialIntent(0.3), -1);
});

test("keyboard controls map acceleration and braking to radial intent", () => {
  assert.deepEqual(keyboardControls(new Set(["KeyW"])), { radial: 1 });
  assert.deepEqual(keyboardControls(new Set(["ArrowDown"])), { radial: -1 });
});
