import test from "node:test";
import assert from "node:assert/strict";

import {
  SUPPORT_FALL,
  SUPPORT_FIRM,
  SUPPORT_SLUMP,
  chooseDirection,
  releases,
  slideDirection,
  supportAt,
} from "../src/core/sand.js";
import { cellIndex } from "../src/core/geometry.js";
import { packCell } from "../src/core/field-format.js";

const WORLD = { width: 8, height: 8 };

/** @param {[number, number][]} occupied */
function fieldWith(occupied) {
  const field = new Uint32Array(WORLD.width * WORLD.height);
  for (const [x, y] of occupied) field[cellIndex(x, y, WORLD.width)] = packCell(9, 9, 9);
  return field;
}

test("nothing underneath means it falls, diagonals irrelevant", () => {
  const field = fieldWith([[3, 2], [5, 2]]);
  assert.equal(supportAt(field, 4, 3, WORLD, 0).support, SUPPORT_FALL);
});

test("solid all the way under means it stays put", () => {
  const field = fieldWith([[3, 2], [4, 2], [5, 2]]);
  assert.equal(supportAt(field, 4, 3, WORLD, 0).support, SUPPORT_FIRM);
});

test("an open diagonal is what turns a stack into a slope", () => {
  // Directly below is solid, so the old below-only rule called this supported
  // and the pixel would sit on the shoulder of a heap forever.
  const left = supportAt(fieldWith([[4, 2], [5, 2]]), 4, 3, WORLD, 0);
  assert.equal(left.support, SUPPORT_SLUMP);
  assert.equal(left.direction, -1);

  const right = supportAt(fieldWith([[3, 2], [4, 2]]), 4, 3, WORLD, 0);
  assert.equal(right.support, SUPPORT_SLUMP);
  assert.equal(right.direction, 1);
});

test("with both diagonals open the direction is decided by the seed, not a bias", () => {
  const field = fieldWith([[4, 2]]);
  const directions = Array.from({ length: 400 }, (_, seed) => supportAt(field, 4, 3, WORLD, seed).direction);
  const lefts = directions.filter((d) => d === -1).length;
  assert.ok(directions.every((d) => d === -1 || d === 1));
  assert.ok(lefts > 150 && lefts < 250, `expected a roughly even split, got ${lefts}/400`);
});

test("the world edges hold material in rather than letting it drain away", () => {
  // Below-left of column 0 is outside the world, which is not somewhere to fall.
  const field = fieldWith([[0, 2], [1, 2]]);
  assert.equal(supportAt(field, 0, 3, WORLD, 0).support, SUPPORT_FIRM);
  const floor = supportAt(fieldWith([]), 4, 0, WORLD, 0);
  assert.equal(floor.support, SUPPORT_FIRM, "the floor of the world is solid");
});

test("falling is not optional but slumping is", () => {
  assert.equal(releases(SUPPORT_FALL, 0, 7), true, "gravity does not negotiate");
  assert.equal(releases(SUPPORT_FIRM, 1, 7), false);
});

test("the slump chance is the knob that sets the angle of repose", () => {
  const trials = 2000;
  const held = (chance) => Array.from({ length: trials }, (_, seed) => releases(SUPPORT_SLUMP, chance, seed))
    .filter(Boolean).length / trials;
  assert.equal(held(0), 0, "zero holds every overhang the world starts with");
  assert.equal(held(1), 1, "one liquefies");
  assert.ok(Math.abs(held(0.25) - 0.25) < 0.03);
});

test("choosing a direction with nothing open is a no-op", () => {
  assert.equal(chooseDirection(false, false, 3), 0);
});

test("a landing pixel rolls off a shoulder but not off flat ground", () => {
  assert.equal(slideDirection(fieldWith([[3, 2], [4, 2], [5, 2]]), 4, 3, WORLD, 0), 0, "flat ground");
  assert.equal(slideDirection(fieldWith([[4, 2], [5, 2]]), 4, 3, WORLD, 0), -1, "shoulder to the left");
});

test("a pixel in mid-air is not sliding anywhere", () => {
  assert.equal(slideDirection(fieldWith([]), 4, 4, WORLD, 0), 0);
});
