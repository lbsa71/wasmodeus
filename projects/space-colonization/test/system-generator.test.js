import test from "node:test";
import assert from "node:assert/strict";

import { generateSystem, minimumMutualHillSpacing } from "../src/core/system-generator.js";

test("lazy systems are deterministic and begin with separated planetary orbits", () => {
  const system = generateSystem(77n, { sectorPathHi: 1, sectorPathLo: 2, ordinal: 3, bodyPath: 0 }, 1);
  assert.deepEqual(generateSystem(77n, { sectorPathHi: 1, sectorPathLo: 2, ordinal: 3, bodyPath: 0 }, 1), system);
  assert.ok(system.planets.length > 0);
  for (let index = 1; index < system.planets.length; index += 1) {
    assert.ok(minimumMutualHillSpacing(system.planets[index - 1], system.planets[index], 1) >= 10);
  }
  assert.ok(system.planets.every((planet) => planet.moons.every((moon) => moon.semiMajorAxisAu < planet.hillRadiusAu * 0.5)));
});
