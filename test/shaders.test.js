import assert from "node:assert/strict";
import test from "node:test";

import { WORLD_SHADER } from "../src/shaders.js";

test("non-buildable WebGPU tiles do not render road centers", () => {
  assert.match(
    WORLD_SHADER,
    /let center = connectivity != 0u && centeredX && centeredY;/,
  );
  assert.match(WORLD_SHADER, /let buildable = \(tileData & 16u\) != 0u;/);
});
