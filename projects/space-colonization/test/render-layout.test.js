import test from "node:test";
import assert from "node:assert/strict";

import { CAMERA_UNIFORM_BYTES } from "../src/render/render-layout.js";

test("the camera uniform accounts for WGSL vec3 alignment", () => {
  assert.equal(CAMERA_UNIFORM_BYTES, 96);
});
