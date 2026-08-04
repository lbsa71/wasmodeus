import test from "node:test";
import assert from "node:assert/strict";

import {
  STAR_RECORD_BYTES,
  createStarRenderBuffer,
  writeStarRecord,
} from "../src/render/star-data.js";

test("star render records have a stable GPU-friendly 32-byte layout", () => {
  const buffer = createStarRenderBuffer(1);
  writeStarRecord(buffer, 0, {
    position: [1, 2, 3],
    apparentFlux: 4,
    color: 0xaabbccdd,
    pickHandle: 9,
    flags: 3,
    radius: 0.5,
  });

  assert.equal(STAR_RECORD_BYTES, 32);
  assert.equal(new Float32Array(buffer, 0, 4)[3], 4);
  assert.equal(new Uint32Array(buffer, 16, 3)[0], 0xaabbccdd);
  assert.equal(new Uint32Array(buffer, 16, 3)[1], 9);
});
