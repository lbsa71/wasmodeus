import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_CAPACITY,
  MAX_EXPONENT,
  MIN_EXPONENT,
  capacityFromExponent,
  exponentFromCapacity,
  formatCount,
  nextPowerOfTwo,
  ringMask,
  ringSize,
} from "../src/core/capacity.js";

test("the slider is exponential: one step up doubles the pool", () => {
  assert.equal(capacityFromExponent(10), 1024);
  assert.equal(capacityFromExponent(11), 2048);
  assert.equal(capacityFromExponent(20), 1_048_576);
});

test("the slider clamps rather than producing an unallocatable pool", () => {
  assert.equal(capacityFromExponent(-5), capacityFromExponent(MIN_EXPONENT));
  assert.equal(capacityFromExponent(99), capacityFromExponent(MAX_EXPONENT));
});

test("a capacity round-trips back to the slider position that produced it", () => {
  // The exponent itself cannot survive exactly — 2 ** 12.5 is not an integer —
  // but restoring the slider from a saved capacity must rebuild the same pool.
  for (const exponent of [10, 12.5, 17.125, 21]) {
    const capacity = capacityFromExponent(exponent);
    assert.equal(capacityFromExponent(exponentFromCapacity(capacity)), capacity);
  }
});

test("the default pool is the brief's one million pixels and is reachable", () => {
  assert.equal(DEFAULT_CAPACITY, 1_000_000);
  const exponent = exponentFromCapacity(DEFAULT_CAPACITY);
  assert.ok(exponent > MIN_EXPONENT && exponent < MAX_EXPONENT);
});

test("the free-slot ring is padded to a power of two large enough to hold the pool", () => {
  assert.equal(nextPowerOfTwo(1), 1);
  assert.equal(nextPowerOfTwo(1000), 1024);
  assert.equal(ringSize(1_000_000), 1_048_576);
  assert.ok(ringSize(DEFAULT_CAPACITY) >= DEFAULT_CAPACITY);
});

test("the ring mask is all ones so index wrapping is a single AND", () => {
  const mask = ringMask(1_000_000);
  assert.equal(mask, 1_048_575);
  assert.equal(mask & (mask + 1), 0);
});

test("counts are formatted compactly for the debug panel", () => {
  assert.equal(formatCount(1_048_576), "1.05 M");
  assert.equal(formatCount(4096), "4.1 k");
  assert.equal(formatCount(37), "37");
  assert.equal(formatCount(Number.NaN), "—");
});
