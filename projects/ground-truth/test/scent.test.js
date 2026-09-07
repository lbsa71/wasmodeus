import test from "node:test";
import assert from "node:assert/strict";

import { MAX_SCENT_CELLS, NO_SCENT, SCENT_BYTES, bakeScent, scentAt, scentCellSize } from "../src/core/scent.js";

test("the scent grid always fits the 64 KB uniform, whatever the world size", () => {
  assert.equal(SCENT_BYTES, 65536);
  for (const world of [{ width: 512, height: 288 }, { width: 6144, height: 3456 }, { width: 40000, height: 20000 }]) {
    const size = scentCellSize(world);
    assert.ok(Math.ceil(world.width / size) * Math.ceil(world.height / size) <= MAX_SCENT_CELLS, `${size} for ${world.width}`);
    assert.equal(size & (size - 1), 0, "a power of two");
    const scent = bakeScent([], world);
    assert.ok(scent.data.byteLength <= SCENT_BYTES);
  }
  assert.equal(scentCellSize({ width: 6144, height: 3456 }), 64);
});

test("every coarse cell points at the nugget nearest to it", () => {
  const world = { width: 256, height: 128 };
  const nuggets = [{ x: 20, y: 20 }, { x: 230, y: 100 }];
  const scent = bakeScent(nuggets, world, 16);
  assert.deepEqual(scentAt(scent, 5, 5), nuggets[0]);
  assert.deepEqual(scentAt(scent, 250, 120), nuggets[1]);
  assert.deepEqual(scentAt(scent, 40, 30), nuggets[0], "nearer the first");
  assert.deepEqual(scentAt(scent, 200, 90), nuggets[1], "nearer the second");
});

test("a world with no gold in it smells of nothing, from anywhere", () => {
  const scent = bakeScent([], { width: 100, height: 100 }, 16);
  assert.deepEqual(scentAt(scent, 50, 50), { x: NO_SCENT, y: NO_SCENT });
  assert.ok(Math.hypot(50 - NO_SCENT, 50 - NO_SCENT) > 1e5, "far beyond any range a lemming has");
});

test("looking outside the world reads the edge cell rather than garbage", () => {
  const scent = bakeScent([{ x: 1, y: 1 }], { width: 64, height: 64 }, 16);
  assert.deepEqual(scentAt(scent, -10, 999), { x: 1, y: 1 });
});

test("the grid is laid out the way the shader indexes it: row-major, two floats a cell", () => {
  const scent = bakeScent([{ x: 3, y: 4 }], { width: 48, height: 32 }, 16);
  assert.equal(scent.cols, 3);
  assert.equal(scent.rows, 2);
  assert.equal(scent.data.length, 3 * 2 * 2);
  assert.deepEqual([...scent.data.slice(0, 2)], [3, 4]);
});
