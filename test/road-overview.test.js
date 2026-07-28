import assert from "node:assert/strict";
import test from "node:test";

import { createRoadOverviewPixels } from "../src/road-overview.js";

test("road overview pixels distinguish blocked terrain, land, and roads", () => {
  const pixels = createRoadOverviewPixels(
    new Uint8Array([0, 16, 16 | 10, 16 | 15]),
    2,
  );

  assert.equal(pixels.length, 16);
  assert.deepEqual(Array.from(pixels.slice(0, 4)), [4, 17, 15, 255]);
  assert.deepEqual(Array.from(pixels.slice(4, 8)), [11, 31, 25, 255]);
  assert.notDeepEqual(
    Array.from(pixels.slice(8, 12)),
    Array.from(pixels.slice(4, 8)),
  );
  assert.ok(pixels[12] > pixels[8]);
  assert.equal(pixels[15], 255);
});
