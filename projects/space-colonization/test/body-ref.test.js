import test from "node:test";
import assert from "node:assert/strict";

import {
  bodyRefEquals,
  formatBodyRef,
  planetBodyPath,
  starBodyRef,
} from "../src/core/body-ref.js";

test("body references retain a stable 128-bit identity", () => {
  const star = starBodyRef(0x123, 0x456789ab, 17);
  const planet = { ...star, bodyPath: planetBodyPath(3) };

  assert.equal(formatBodyRef(star), "00000123:456789ab:00000011:00000000");
  assert.equal(formatBodyRef(planet), "00000123:456789ab:00000011:03000000");
  assert.equal(bodyRefEquals(star, { ...star }), true);
  assert.equal(bodyRefEquals(star, planet), false);
});
