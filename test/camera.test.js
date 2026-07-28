import assert from "node:assert/strict";
import test from "node:test";

import { Camera } from "../src/camera.js";

test("camera converts between world and screen coordinates", () => {
  const camera = new Camera(800, 600);
  camera.centerOn(500, 500);

  const screen = camera.worldToScreen(500, 500);
  assert.deepEqual(screen, { x: 400, y: 300 });
  assert.deepEqual(camera.screenToWorld(screen.x, screen.y), {
    x: 500,
    y: 500,
  });
});

test("zoom keeps the world point under the cursor fixed", () => {
  const camera = new Camera(800, 600);
  camera.centerOn(500, 500);
  const cursor = { x: 175, y: 220 };
  const before = camera.screenToWorld(cursor.x, cursor.y);

  camera.zoomAt(2, cursor.x, cursor.y);

  assert.deepEqual(camera.screenToWorld(cursor.x, cursor.y), before);
  assert.equal(camera.zoom, 2);
});

test("camera clamps zoom and navigation to the world", () => {
  const camera = new Camera(800, 600, {
    minZoom: 0.25,
    maxZoom: 20,
    worldSize: 1_000,
  });

  camera.zoomAt(10_000, 400, 300);
  assert.equal(camera.zoom, 20);
  camera.zoomAt(0.00001, 400, 300);
  assert.equal(camera.zoom, 0.25);

  camera.panBy(100_000, 100_000);
  const center = camera.screenToWorld(400, 300);
  assert.ok(center.x >= 0 && center.x <= 1_000);
  assert.ok(center.y >= 0 && center.y <= 1_000);
});
