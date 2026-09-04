import test from "node:test";
import assert from "node:assert/strict";

import { COUNTERS_BYTES, COUNTER_WORDS, counterIndex, decodeCounters } from "../src/core/counters.js";

/** @param {Record<string, number>} values */
function block(values) {
  const words = new Uint32Array(COUNTERS_BYTES / 4);
  for (const [name, value] of Object.entries(values)) words[counterIndex(name)] = value;
  return words;
}

test("the counter block stays 16-byte aligned for buffer copies", () => {
  assert.equal(COUNTERS_BYTES % 16, 0);
  assert.ok(COUNTERS_BYTES >= COUNTER_WORDS.length * 4);
});

test("an untouched pool reads as fully free and nothing moving", () => {
  const stats = decodeCounters(block({ head: 0, tail: 1_000_000 }), 1_000_000);
  assert.equal(stats.free, 1_000_000);
  assert.equal(stats.moving, 0);
  assert.equal(stats.utilisation, 0);
});

test("moving pixels are the slots the ring has handed out", () => {
  const stats = decodeCounters(block({ head: 750_000, tail: 1_000_000 }), 1_000_000);
  assert.equal(stats.free, 250_000);
  assert.equal(stats.moving, 750_000);
  assert.equal(stats.utilisation, 0.75);
});

test("ring indices that have wrapped past 2^32 still subtract correctly", () => {
  // head has wrapped, tail has not: unsigned arithmetic keeps the gap exact.
  const stats = decodeCounters(block({ head: 0xfffffff0, tail: 0x0000000a }), 1_000_000);
  assert.equal(stats.free, 26);
  assert.equal(stats.moving, 1_000_000 - 26);
});

test("pop budget is read as signed because the emit pass drives it negative", () => {
  const stats = decodeCounters(block({ popBudget: 0xffffffff }), 1024);
  assert.equal(stats.popBudget, -1);
});

test("per-frame counters come through untouched", () => {
  const stats = decodeCounters(
    block({ emitted: 12, deposited: 34, dislodged: 56, undermined: 78, denied: 90 }),
    2048,
  );
  assert.equal(stats.emitted, 12);
  assert.equal(stats.deposited, 34);
  assert.equal(stats.dislodged, 56);
  assert.equal(stats.undermined, 78);
  assert.equal(stats.denied, 90);
});

test("an unknown counter name is a programming error, not a silent zero", () => {
  assert.throws(() => counterIndex("nope"), /Unknown counter/);
});
