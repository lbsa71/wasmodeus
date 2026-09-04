import test from "node:test";
import assert from "node:assert/strict";

import {
  F_BLAST_X,
  F_CAMERA_SCALE,
  F_CAMERA_X,

  F_DRAG_X,
  F_DT,
  F_GRAVITY,
  F_SLUMP_CHANCE,
  F_VIEWPORT_X,
  MAX_WORKGROUPS_PER_DIMENSION,
  PARAMS_BYTES,
  STATE_BYTES,
  maxCapacityFor,
  PARTICLE_STRIDE_BYTES,
  U_CAPACITY,
  U_FRAME,
  U_WORLD_X,
  WORKGROUP_SIZE,
  dispatchGrid,
  workgroupCount,
  writeParams,
} from "../src/core/layout.js";

/** @type {import("../src/core/layout.js").SimulationParams} */
const PARAMS = {
  world: { width: 1024, height: 768 },
  capacity: 1_000_000,
  ringMask: 1_048_575,
  gravity: 500,
  dt: 1 / 240,
  damping: 0.999,
  restitution: 0.25,
  restThreshold: 2,
  frame: 77,
  slumpChance: 0.25,
  slideSpeed: 60,
  dislodgeSpeed: 90,
  blast: { x: 12, y: 34, radius: 28, strength: 320 },
  viewport: { width: 1920, height: 1080 },
  camera: { x: 2048, y: 1024, scale: 0.5 },
  rubbleBond: 5,
  drag: { x: 0.6, y: -0.8 },
  agents: { count: 600, speed: 26, bombChance: 0.25, blastRadius: 22 },
  frameSeconds: 1 / 60,
};

test("the params block is a whole number of 16-byte chunks", () => {
  assert.equal(PARAMS_BYTES % 16, 0);
});

test("the particle is twenty bytes, which is what puts 100M within reach", () => {
  // A vec2f would align the struct to eight and pad it back to 24, costing a
  // fifth of the ceiling. Per-pixel state lives in its own four-byte array.
  assert.equal(PARTICLE_STRIDE_BYTES, 20);
  assert.equal(STATE_BYTES, 4);
});

test("the pool ceiling comes from the largest buffer the device will bind", () => {
  const twoGigabytes = { maxStorageBufferBindingSize: 2_147_483_644, maxBufferSize: 2_147_483_648 };
  assert.equal(maxCapacityFor(twoGigabytes), 107_374_182);
  assert.ok(maxCapacityFor(twoGigabytes) > 100_000_000, "nine figures must fit");
  // A modest device gets a proportionally smaller ceiling rather than a crash.
  assert.equal(maxCapacityFor({ maxStorageBufferBindingSize: 134_217_728, maxBufferSize: 268_435_456 }), 6_710_886);
});

test("vec4f blast lands on a 16-byte boundary as WGSL requires", () => {
  assert.equal((F_BLAST_X * 4) % 16, 0);
});

test("params are written into the words the shader reads them from", () => {
  const buffer = writeParams(new ArrayBuffer(PARAMS_BYTES), PARAMS);
  const u = new Uint32Array(buffer);
  const f = new Float32Array(buffer);
  assert.equal(u[U_WORLD_X], 1024);
  assert.equal(u[U_WORLD_X + 1], 768);
  assert.equal(u[U_CAPACITY], 1_000_000);
  assert.equal(u[U_FRAME], 77);
  assert.equal(f[F_GRAVITY], 500);
  assert.ok(Math.abs(f[F_DT] - 1 / 240) < 1e-9);
  assert.equal(f[F_SLUMP_CHANCE], 0.25);
  assert.equal(f[F_BLAST_X], 12);
  assert.equal(f[F_VIEWPORT_X], 1920);
  assert.equal(f[F_VIEWPORT_X + 1], 1080);
  assert.equal(f[F_CAMERA_X], 2048);
  assert.equal(f[F_CAMERA_X + 1], 1024);
  assert.equal(f[F_CAMERA_SCALE], 0.5);
  // Which way the pointer brush drags material; zero means a radial blast.
  assert.ok(Math.abs(f[F_DRAG_X] - 0.6) < 1e-6);
  assert.ok(Math.abs(f[F_DRAG_X + 1] + 0.8) < 1e-6);
});

test("the drag lands on an 8-byte boundary as a vec2f requires", () => {
  assert.equal((F_DRAG_X * 4) % 8, 0);
  assert.ok((F_DRAG_X + 2) * 4 <= PARAMS_BYTES, "and inside the block");
});

test("a params buffer that is too small is rejected rather than truncated", () => {
  assert.throws(() => writeParams(new ArrayBuffer(PARAMS_BYTES - 4), PARAMS), /at least/);
});

test("dispatch counts round up so the tail of the pool is never skipped", () => {
  assert.equal(workgroupCount(WORKGROUP_SIZE), 1);
  assert.equal(workgroupCount(WORKGROUP_SIZE + 1), 2);
  assert.equal(workgroupCount(0), 1);
  assert.ok(workgroupCount(1_000_000) * WORKGROUP_SIZE >= 1_000_000);
});

test("a dispatch that fits in one dimension is left alone", () => {
  assert.deepEqual(dispatchGrid(WORKGROUP_SIZE * 100), { x: 100, y: 1 });
  assert.deepEqual(dispatchGrid(1), { x: 1, y: 1 });
});

test("an oversized dispatch folds into two legal dimensions", () => {
  // A 6144 x 3456 world needs 82,944 workgroups, which a single dimension
  // cannot express: the dispatch is rejected, the command buffer with it, and
  // the frame renders nothing at all.
  const grid = dispatchGrid(6144 * 3456);
  assert.ok(grid.x <= MAX_WORKGROUPS_PER_DIMENSION, "x is within the cap");
  assert.ok(grid.y <= MAX_WORKGROUPS_PER_DIMENSION, "y is within the cap");
  assert.ok(grid.x * grid.y * WORKGROUP_SIZE >= 6144 * 3456, "every cell is covered");
});

test("folding launches barely more invocations than are needed", () => {
  for (const items of [6144 * 3456, 100_000_000, WORKGROUP_SIZE * 65_536]) {
    const grid = dispatchGrid(items);
    const launched = grid.x * grid.y * WORKGROUP_SIZE;
    assert.ok(launched >= items);
    assert.ok(launched < items + WORKGROUP_SIZE * (grid.x + grid.y), `${launched} for ${items} is wasteful`);
  }
});

test("the fold respects a device that allows fewer workgroups", () => {
  const grid = dispatchGrid(WORKGROUP_SIZE * 1000, 100);
  assert.ok(grid.x <= 100 && grid.y <= 100);
  assert.ok(grid.x * grid.y * WORKGROUP_SIZE >= WORKGROUP_SIZE * 1000);
});
