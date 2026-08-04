import test from "node:test";
import assert from "node:assert/strict";

import { visibleSectorRange } from "../src/core/sector-viewport.js";

test("visible sector range includes every on-screen leaf-sector column", () => {
  const range = visibleSectorRange([0, 0, 0], 20, 1, 10);
  assert.deepEqual(range, { minX: 4, maxX: 5, minY: 4, maxY: 5, z: 5 });
});
