import test from "node:test";
import assert from "node:assert/strict";

import { FrameRateMeter, debugRows } from "../src/ui/debug-panel.js";
import { decodeCounters } from "../src/core/counters.js";

const CONTEXT = { fps: 60, frame: 120, restThreshold: 2, substeps: 4 };

/** @param {Partial<Record<string, number>>} overrides */
function stats(overrides = {}, capacity = 1_000_000) {
  return { ...decodeCounters(new Uint32Array(12), capacity), ...overrides };
}

/** @param {ReturnType<typeof debugRows>} rows @param {string} label */
function value(rows, label) {
  const row = rows.find((candidate) => candidate.label === label);
  assert.ok(row, `missing row: ${label}`);
  return row;
}

test("the panel reports the pool size and how much of it is moving", () => {
  const rows = debugRows(stats({ moving: 750_000, free: 250_000, utilisation: 0.75 }), CONTEXT);
  assert.equal(value(rows, "moving").value, "750.0 k");
  assert.equal(value(rows, "capacity").value, "1.00 M");
  assert.equal(value(rows, "pool used").value, "75.0 %");
});

test("a starved image is flagged: denied pixels wanted to move and could not", () => {
  assert.equal(value(debugRows(stats({ denied: 0 }), CONTEXT), "denied/f").warn, false);
  assert.equal(value(debugRows(stats({ denied: 400 }), CONTEXT), "denied/f").warn, true);
});

test("a saturated pool and a sluggish frame rate are both flagged", () => {
  assert.equal(value(debugRows(stats({ utilisation: 1 }), CONTEXT), "pool used").warn, true);
  assert.equal(value(debugRows(stats(), { ...CONTEXT, fps: 22 }), "fps").warn, true);
  assert.equal(value(debugRows(stats(), { ...CONTEXT, fps: 59 }), "fps").warn, false);
});

test("the frame rate meter needs two samples before it reports anything", () => {
  const meter = new FrameRateMeter(0);
  assert.equal(meter.sample(0), 0);
  assert.ok(Math.abs(meter.sample(1000 / 60) - 60) < 1e-9);
});

test("the frame rate meter smooths towards the true rate instead of jumping", () => {
  const meter = new FrameRateMeter(0.9);
  meter.sample(0);
  meter.sample(16);
  const first = meter.fps;
  for (let frame = 2; frame < 200; frame += 1) meter.sample(frame * 100);
  assert.ok(first > meter.fps, "a sudden slowdown pulls the reading down");
  assert.ok(Math.abs(meter.fps - 10) < 1, "and it converges on the new rate");
});

test("a duplicated timestamp does not produce an infinite frame rate", () => {
  const meter = new FrameRateMeter();
  meter.sample(100);
  meter.sample(100);
  assert.equal(meter.fps, 0);
});
