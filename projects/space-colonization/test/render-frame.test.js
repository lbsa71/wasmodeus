import test from "node:test";
import assert from "node:assert/strict";

import { cameraDeltaParsecs, worldPositionFromSnapshot } from "../src/render/render-frame.js";

test("a snapshot remains correctly positioned while the camera moves locally", () => {
  const origin = [100, 50, 0];
  const camera = [110, 45, 0];
  assert.deepEqual(cameraDeltaParsecs(origin, camera), [10, -5, 0]);
  assert.deepEqual(worldPositionFromSnapshot([2, 3, 0], origin), [102, 53, 0]);
});
