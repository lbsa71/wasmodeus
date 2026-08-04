import test from "node:test";
import assert from "node:assert/strict";

import { renderLayerFor } from "../src/core/render-layer.js";

test("zoom level reports an explicit render layer", () => {
  assert.equal(renderLayerFor(16_000, false), "GALAXY OVERVIEW");
  assert.equal(renderLayerFor(100, false), "SECTOR GRID");
  assert.equal(renderLayerFor(0.01, false), "STELLAR NEIGHBORHOOD");
  assert.equal(renderLayerFor(50, true), "STAR SYSTEM");
  assert.equal(renderLayerFor(63, true), "SECTOR GRID");
});
