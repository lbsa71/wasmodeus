import test from "node:test";
import assert from "node:assert/strict";

import {
  advanceKeplerOrbit,
  circularVelocityKmPerSecond,
  mergeBodies,
} from "../src/core/physics.js";

test("Kepler propagation closes a circular Earth-like orbit", () => {
  const earth = {
    positionAu: [1, 0, 0],
    velocityAuPerDay: [0, (2 * Math.PI) / 365.25, 0],
    primaryMassSolar: 1,
  };
  const result = advanceKeplerOrbit(earth, 365.25);

  assert.ok(Math.abs(result.positionAu[0] - 1) < 1e-9);
  assert.ok(Math.abs(result.positionAu[1]) < 1e-9);
  assert.ok(Math.abs(result.velocityAuPerDay[1] - earth.velocityAuPerDay[1]) < 1e-9);
});

test("the galactic potential has the configured solar-circle velocity", () => {
  assert.ok(Math.abs(circularVelocityKmPerSecond(8) - 220) < 0.5);
});

test("a collision merge conserves linear momentum", () => {
  const merged = mergeBodies(
    { mass: 2, radius: 1, velocity: [3, 0, 0] },
    { mass: 1, radius: 1, velocity: [-1, 0, 0] },
  );

  assert.deepEqual(merged.velocity, [5 / 3, 0, 0]);
  assert.equal(merged.mass, 3);
});
