import assert from "node:assert/strict";
import test from "node:test";

import { advanceOrbitCamera, createOrbitCamera } from "../src/render/orbit-camera.js";

test("the camera stays fixed on the ship while retaining planet context", () => {
  const camera = createOrbitCamera();
  const updated = advanceOrbitCamera(camera, { x: 560, y: 0 }, 0.2);

  assert.equal(camera.x, 0);
  assert.equal(updated.y, 0);
  assert.equal(updated.x, 560);
  assert.equal(updated.viewRadius, 300);
});

test("the camera rotates the ship's movement heading onto the horizontal axis", () => {
  const updated = advanceOrbitCamera(createOrbitCamera(), { x: 0, y: 0, heading: Math.PI / 3 }, 0.016);

  assert.equal(updated.rotation, Math.PI / 3);
});
