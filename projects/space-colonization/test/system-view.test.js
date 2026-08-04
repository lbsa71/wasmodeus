import test from "node:test";
import assert from "node:assert/strict";

import { AU_IN_PARSECS, planetIndexFromBodyPath, planetZoomParsecs, systemZoomParsecs } from "../src/core/system-view.js";

test("system framing encloses the outermost planet and its moon envelope", () => {
  const system = {
    planets: [
      { semiMajorAxisAu: 1, eccentricity: 0, moons: [] },
      { semiMajorAxisAu: 20, eccentricity: 0.1, moons: [{ semiMajorAxisAu: 2, eccentricity: 0.1 }] },
    ],
  };
  assert.equal(systemZoomParsecs(system), 29.04 * AU_IN_PARSECS);
});

test("planet focus identifies its parent planet and frames its moons", () => {
  const planet = { radiusEarth: 1, moons: [{ semiMajorAxisAu: 0.3, eccentricity: 0.1 }] };
  assert.equal(planetIndexFromBodyPath(0x03010000), 2);
  assert.equal(planetZoomParsecs(planet), 0.495 * AU_IN_PARSECS);
});

test("a moonless planet starts as a near full-frame physical disk", () => {
  const planet = { radiusEarth: 1, moons: [] };
  assert.ok(planetZoomParsecs(planet) < 1e-8);
});
