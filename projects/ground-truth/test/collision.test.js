import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_RESTITUTION,
  MIN_RESTITUTION,
  clampRestitution,
  energyRatio,
  reflect,
  transfer,
} from "../src/core/collision.js";

test("momentum is exactly conserved by a transfer, at every elasticity", () => {
  // The whole point: an impact hands momentum over rather than destroying it.
  for (const e of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
    for (const v of [-900, -12, 7, 100, 1400]) {
      const { striker, target } = transfer(v, e);
      assert.ok(Math.abs((striker + target) - v) < 1e-9, `e=${e} v=${v} lost momentum`);
    }
  }
});

test("a striker that knocks something loose slows rather than reversing", () => {
  // Reversing here would invent momentum: a rebound plus a departing target is
  // more than arrived. Reversal is for immovable things only.
  const { striker, target } = transfer(100, 0.25);
  assert.ok(striker > 0, "the striker keeps going, slower");
  assert.ok(target > striker, "and the target leaves faster than the striker remains");
});

test("perfectly elastic is Newton's cradle: the striker stops dead", () => {
  const { striker, target } = transfer(100, 1);
  assert.equal(striker, 0);
  assert.equal(target, 100);
  assert.equal(energyRatio(1), 1, "and no energy leaves the system");
});

test("perfectly inelastic shares the velocity evenly", () => {
  const { striker, target } = transfer(100, 0);
  assert.equal(striker, 50);
  assert.equal(target, 50);
});

test("every elasticity below one bleeds energy, which is what stops the bouncing", () => {
  let previous = 0;
  for (const e of [0, 0.25, 0.5, 0.75]) {
    const kept = energyRatio(e);
    assert.ok(kept < 1, `e=${e} keeps all its energy, so a pile would never settle`);
    assert.ok(kept > previous, "a springier collision must keep more energy");
    previous = kept;
  }
});

test("reflecting off something immovable reverses and shrinks", () => {
  assert.equal(reflect(100, 0.25), -25);
  assert.equal(reflect(-40, 0.5), 20);
  // -0 is what the arithmetic yields, and strict equality distinguishes it.
  assert.equal(Math.abs(reflect(100, 0)), 0, "a dead bounce stops the pixel");
  assert.equal(reflect(100, 1), -100, "a perfect bounce loses nothing");
});

test("a reflection can never come back faster than it arrived", () => {
  // Otherwise a pixel trapped against bedrock would accelerate every frame.
  for (const e of [0, 0.25, 0.5, 1]) {
    assert.ok(Math.abs(reflect(250, e)) <= 250);
  }
});

test("restitution is clamped to a physical range", () => {
  assert.equal(clampRestitution(-1), MIN_RESTITUTION);
  assert.equal(clampRestitution(4), MAX_RESTITUTION);
  assert.equal(clampRestitution(0.3), 0.3);
});
