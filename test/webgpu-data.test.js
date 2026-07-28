import assert from "node:assert/strict";
import test from "node:test";

import {
  SCENE_UNIFORM_BYTES,
  carStorageByteLength,
  createSceneUniform,
  preferredCanvasSize,
  tileStorageByteLength,
} from "../src/webgpu-data.js";

test("scene uniforms match the WGSL-aligned 48-byte layout", () => {
  const uniform = createSceneUniform({
    centerX: 500,
    centerY: 450,
    pixelRatio: 2,
    roadHalfWidth: 0.18,
    roadTileCount: 1_000_000,
    viewportHeight: 600,
    viewportWidth: 800,
    worldSize: 1_000,
    zoom: 4,
  });

  assert.equal(SCENE_UNIFORM_BYTES, 48);
  assert.equal(uniform.byteLength, SCENE_UNIFORM_BYTES);
  assert.deepEqual(Array.from(uniform), [
    1_600,
    1_200,
    500,
    450,
    8,
    1_000,
    0.18000000715255737,
    1_000_000,
    2,
    4,
    0,
    0,
  ]);
});

test("car storage buffers are tightly packed and never zero-sized", () => {
  assert.equal(carStorageByteLength(100_000), 400_000);
  assert.equal(carStorageByteLength(1), 4);
  assert.equal(carStorageByteLength(0), 4);
});

test("four compact tile masks fit in each shader-visible word", () => {
  assert.equal(tileStorageByteLength(1_000_000), 1_000_000);
  assert.equal(tileStorageByteLength(3), 4);
  assert.equal(tileStorageByteLength(0), 4);
});

test("canvas resolution honors pixel density and device limits", () => {
  assert.deepEqual(preferredCanvasSize(800, 600, 2, 8_192), {
    height: 1_200,
    pixelRatio: 2,
    width: 1_600,
  });
  assert.deepEqual(preferredCanvasSize(5_000, 3_000, 2, 8_192), {
    height: 4_915,
    pixelRatio: 1.6384,
    width: 8_192,
  });
});
