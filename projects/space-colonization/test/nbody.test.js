import test from "node:test";
import assert from "node:assert/strict";

import { leapfrogStep, totalLinearMomentum } from "../src/core/nbody.js";

test("leapfrog preserves total linear momentum for an isolated pair", () => {
  const bodies = [
    { mass: 1, radius: 0.01, position: [-0.5, 0, 0], velocity: [0, 0.1, 0] },
    { mass: 1, radius: 0.01, position: [0.5, 0, 0], velocity: [0, -0.1, 0] },
  ];
  const before = totalLinearMomentum(bodies);
  leapfrogStep(bodies, 0.001, 1);
  const after = totalLinearMomentum(bodies);
  assert.ok(after.every((value, index) => Math.abs(value - before[index]) < 1e-12));
});
