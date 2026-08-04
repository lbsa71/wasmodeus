import test from "node:test";
import assert from "node:assert/strict";

import { rotateGalacticPosition, SOLAR_ORBIT_DAYS } from "../src/core/galactic-orbit.js";

test("galactic tracer rotation advances a solar-circle star by a quarter orbit", () => {
  const position = rotateGalacticPosition([8_000, 0, 0], SOLAR_ORBIT_DAYS / 4);
  assert.ok(Math.abs(position[0]) < 1e-8);
  assert.ok(Math.abs(position[1] - 8_000) < 1e-8);
});
