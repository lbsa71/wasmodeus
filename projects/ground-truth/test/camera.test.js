import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_SCALE,
  clampCamera,
  createCamera,
  formatScale,
  minScale,
  panCamera,
  visibleWorldRect,
  worldFromScreen,
  zoomCameraAt,
} from "../src/core/camera.js";

const WORLD = { width: 6144, height: 3456 };
const VIEWPORT = { width: 1920, height: 1080 };

test("the world is far larger than the viewport, which is the point of panning", () => {
  const camera = createCamera(WORLD, VIEWPORT, { scale: 1 });
  const visible = visibleWorldRect(camera, VIEWPORT);
  assert.ok(visible.width < WORLD.width / 3);
  assert.ok(visible.height < WORLD.height / 3);
});

test("a new camera is centred on the point it is asked for", () => {
  const camera = createCamera(WORLD, VIEWPORT, { x: 3000, y: 2000, scale: 1 });
  const centre = worldFromScreen(camera, VIEWPORT, VIEWPORT.width / 2, VIEWPORT.height / 2);
  assert.ok(Math.abs(centre.x - 3000) < 1e-6);
  assert.ok(Math.abs(centre.y - 2000) < 1e-6);
});

test("dragging moves the world with the pointer", () => {
  const camera = createCamera(WORLD, VIEWPORT, { x: 3000, y: 2000, scale: 1 });
  const right = panCamera(camera, 100, 0, WORLD, VIEWPORT);
  assert.equal(right.x, camera.x - 100, "dragging right reveals what is to the left");
  const down = panCamera(camera, 0, 100, WORLD, VIEWPORT);
  assert.equal(down.y, camera.y + 100, "dragging down reveals what is above");
});

test("panning cannot walk off the edge of the world", () => {
  const camera = createCamera(WORLD, VIEWPORT, { x: 100, y: 100, scale: 1 });
  const far = panCamera(camera, 99_999, -99_999, WORLD, VIEWPORT);
  assert.equal(far.x, 0);
  assert.equal(far.y, 0);
  const other = panCamera(camera, -99_999, 99_999, WORLD, VIEWPORT);
  assert.equal(other.x, WORLD.width - VIEWPORT.width);
  assert.equal(other.y, WORLD.height - VIEWPORT.height);
});

test("zoom keeps the world pixel under the cursor pinned to the cursor", () => {
  const camera = createCamera(WORLD, VIEWPORT, { x: 3000, y: 2000, scale: 1 });
  const point = { x: 480, y: 270 };
  const before = worldFromScreen(camera, VIEWPORT, point.x, point.y);
  const zoomed = zoomCameraAt(camera, 2.5, point.x, point.y, WORLD, VIEWPORT);
  const after = worldFromScreen(zoomed, VIEWPORT, point.x, point.y);
  assert.ok(Math.abs(after.x - before.x) < 1e-3, `${after.x} vs ${before.x}`);
  assert.ok(Math.abs(after.y - before.y) < 1e-3, `${after.y} vs ${before.y}`);
  assert.equal(zoomed.scale, 2.5);
});

test("zoom stops at the limits instead of drifting past them", () => {
  const camera = createCamera(WORLD, VIEWPORT, { scale: 1 });
  let wide = camera;
  for (let step = 0; step < 40; step += 1) wide = zoomCameraAt(wide, 0.5, 960, 540, WORLD, VIEWPORT);
  assert.equal(wide.scale, minScale(WORLD, VIEWPORT));
  let close = camera;
  for (let step = 0; step < 40; step += 1) close = zoomCameraAt(close, 2, 960, 540, WORLD, VIEWPORT);
  assert.equal(close.scale, MAX_SCALE);
});

test("zoomed all the way out the whole world fits on screen", () => {
  const camera = clampCamera({ x: 0, y: 0, scale: 0 }, WORLD, VIEWPORT);
  const visible = visibleWorldRect(camera, VIEWPORT);
  assert.ok(visible.width >= WORLD.width - 1e-6);
  assert.ok(visible.height >= WORLD.height - 1e-6);
});

test("an axis with slack when zoomed out is centred, not pinned to a corner", () => {
  // The world is 16:9-ish and the viewport is 16:9, so squeeze the viewport to
  // force one axis to have room to spare.
  const tall = { width: 400, height: 1600 };
  const camera = clampCamera({ x: 0, y: 0, scale: minScale(WORLD, tall) }, WORLD, tall);
  const visible = visibleWorldRect(camera, tall);
  assert.ok(Math.abs((visible.x + visible.width / 2) - WORLD.width / 2) < 1e-6);
});

test("screen to world is y-flipped, because the world grows upwards", () => {
  const camera = { x: 0, y: 0, scale: 1 };
  const top = worldFromScreen(camera, VIEWPORT, 0, 0);
  const bottom = worldFromScreen(camera, VIEWPORT, 0, VIEWPORT.height);
  assert.equal(top.y, VIEWPORT.height);
  assert.equal(bottom.y, 0);
});

test("zoom is shown as a ratio when zoomed out and a multiple when zoomed in", () => {
  assert.equal(formatScale(2), "2.0x");
  assert.equal(formatScale(0.25), "1:4.0");
});
