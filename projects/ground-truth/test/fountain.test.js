import test from "node:test";
import assert from "node:assert/strict";

import { intakeChance, nozzleLaunch } from "../src/core/fountain.js";

const NOZZLE = { x: 512, spread: 20, speed: 560, jetSpread: 0.55, baseY: 1, baseSpread: 2 };

test("a full pool draws nothing out of the image", () => {
  assert.equal(intakeChance(0, 6144, 30), 0);
});

test("intake scales with how much of the pool is idle", () => {
  const slack = intakeChance(2000, 6144, 30);
  const less = intakeChance(1000, 6144, 30);
  assert.ok(slack > less);
  assert.ok(less > 0);
  assert.ok(Math.abs(slack / less - 2) < 1e-9, "the servo is proportional below saturation");
});

test("a mostly empty pool runs the intake flat out", () => {
  // A 6-row intake band cannot refill a million slots in 30 frames on its own,
  // so the servo saturates and leaves the rest to undermining. That is the
  // intended division of labour, not a miscalculation.
  assert.equal(intakeChance(500_000, 6144, 30), 1);
});

test("intake saturates at one rather than overdrawing a cell", () => {
  assert.equal(intakeChance(10_000_000, 100, 1), 1);
});

test("a degenerate intake band cannot divide by zero", () => {
  assert.equal(intakeChance(1000, 0, 30), 0);
  assert.equal(intakeChance(1000, 6144, 0), 0);
});

test("the nozzle launches upward from the bottom of the world", () => {
  for (let seed = 0; seed < 64; seed += 1) {
    const launch = nozzleLaunch(seed, NOZZLE);
    assert.ok(launch.vel[1] > 0, `seed ${seed} must be launched upwards`);
    assert.ok(launch.pos[1] >= NOZZLE.baseY, `seed ${seed} starts at the nozzle`);
    assert.ok(launch.pos[1] <= NOZZLE.baseY + NOZZLE.baseSpread);
    assert.ok(Math.abs(launch.pos[0] - NOZZLE.x) <= NOZZLE.spread / 2);
  }
});

test("the jet spreads sideways but stays a jet", () => {
  const angles = Array.from({ length: 256 }, (_, seed) => {
    const { vel } = nozzleLaunch(seed, NOZZLE);
    return Math.atan2(vel[0], vel[1]);
  });
  assert.ok(Math.max(...angles) > 0.1, "some pixels lean right");
  assert.ok(Math.min(...angles) < -0.1, "some pixels lean left");
  assert.ok(Math.max(...angles.map(Math.abs)) <= NOZZLE.jetSpread / 2 + 1e-9);
});

test("launches are deterministic for a given seed", () => {
  assert.deepEqual(nozzleLaunch(12345, NOZZLE), nozzleLaunch(12345, NOZZLE));
});
