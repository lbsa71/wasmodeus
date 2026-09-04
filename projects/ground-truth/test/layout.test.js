import test from "node:test";
import assert from "node:assert/strict";

import {
  F_BLAST_X,
  F_DT,
  F_GRAVITY,
  F_VIEWPORT_X,
  PARAMS_BYTES,
  PARTICLE_STRIDE_BYTES,
  U_CAPACITY,
  U_FRAME,
  U_WORLD_X,
  WORKGROUP_SIZE,
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
  intakeChance: 0.5,
  intakeRows: 6,
  fountain: { x: 512, spread: 20, speed: 560 },
  dislodgeSpeed: 90,
  blast: { x: 12, y: 34, radius: 28, strength: 320 },
  viewport: { width: 1920, height: 1080 },
};

test("the params block is a whole number of 16-byte chunks", () => {
  assert.equal(PARAMS_BYTES % 16, 0);
  assert.equal(PARTICLE_STRIDE_BYTES, 32);
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
  assert.equal(f[F_BLAST_X], 12);
  assert.equal(f[F_VIEWPORT_X], 1920);
  assert.equal(f[F_VIEWPORT_X + 1], 1080);
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
