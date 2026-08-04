import test from "node:test";
import assert from "node:assert/strict";

import { createGalaxyCamera, panCamera, zoomCamera, zoomCameraAt } from "../src/render/camera.js";

test("galaxy camera pans in world units and clamps zoom", () => {
  const camera = createGalaxyCamera(16 / 9);
  const moved = panCamera(camera, 100, -50);
  assert.deepEqual(moved.positionParsecs, [-100, 50, 0]);
  assert.equal(zoomCamera(camera, 1e9).zoomParsecs, 1e-12);
  assert.equal(zoomCamera(camera, -1e9).zoomParsecs, 128_000);
});

test("a normal outward wheel gesture leaves the sector layer", () => {
  const sectorCamera = createGalaxyCamera(16 / 9, 450);
  assert.ok(zoomCamera(sectorCamera, -100).zoomParsecs > 500);
});

test("zooming at a cursor keeps its world position fixed", () => {
  const camera = createGalaxyCamera(2, 1_000);
  const cursor = { x: 0.5, y: -0.25 };
  const worldBefore = [camera.positionParsecs[0] + (cursor.x * camera.zoomParsecs * camera.aspect), camera.positionParsecs[1] + (cursor.y * camera.zoomParsecs)];
  const zoomed = zoomCameraAt(camera, 100, cursor.x, cursor.y);
  const worldAfter = [zoomed.positionParsecs[0] + (cursor.x * zoomed.zoomParsecs * zoomed.aspect), zoomed.positionParsecs[1] + (cursor.y * zoomed.zoomParsecs)];
  assert.deepEqual(worldAfter, worldBefore);
});
