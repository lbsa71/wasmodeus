import test from "node:test";
import assert from "node:assert/strict";

import { hashU32, random01 } from "../src/core/prng.js";

test("the hash stays inside 32 unsigned bits", () => {
  for (const seed of [0, 1, 0x7fffffff, 0xffffffff, 123456789]) {
    const hashed = hashU32(seed);
    assert.ok(Number.isInteger(hashed));
    assert.ok(hashed >= 0 && hashed <= 0xffffffff, `${seed} hashed out of range`);
  }
});

test("neighbouring seeds do not produce neighbouring values", () => {
  // Adjacent cell indices are hashed constantly, so a weak avalanche would
  // show up as visible banding in the fountain intake.
  const deltas = Array.from({ length: 64 }, (_, i) => Math.abs(hashU32(i) - hashU32(i + 1)));
  assert.ok(Math.min(...deltas) > 1000);
});

test("random01 spans the unit interval without reaching one", () => {
  const samples = Array.from({ length: 4096 }, (_, i) => random01(i));
  assert.ok(Math.min(...samples) < 0.01);
  assert.ok(Math.max(...samples) > 0.99);
  assert.ok(samples.every((value) => value >= 0 && value < 1));
});

test("the mean of many samples is close to a half", () => {
  const total = Array.from({ length: 8192 }, (_, i) => random01(i * 2654435761)).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total / 8192 - 0.5) < 0.02);
});

test("hashing is pure", () => {
  assert.equal(hashU32(9001), hashU32(9001));
});
