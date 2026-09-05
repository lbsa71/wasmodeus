import test from "node:test";
import assert from "node:assert/strict";

import {
  SUPPORT_FALL,
  SUPPORT_FIRM,
  SUPPORT_SLUMP,
  chooseDirection,
  displacesWater,
  neighbourSupport,
  releases,
  slideDirection,
  supportAt,
  waterFlow,
} from "../src/core/sand.js";
import { cellIndex } from "../src/core/geometry.js";
import { WATER_BOND, packCell } from "../src/core/field-format.js";

const WORLD = { width: 8, height: 8 };

/** @param {[number, number][]} occupied */
function fieldWith(occupied) {
  const field = new Uint32Array(WORLD.width * WORLD.height);
  for (const [x, y] of occupied) field[cellIndex(x, y, WORLD.width)] = packCell(9, 9, 9);
  return field;
}

/**
 * @param {Uint32Array} field @param {[number, number][]} cells @param {number} bond
 * @returns {Uint32Array}
 */
function withBondAt(field, cells, bond) {
  for (const [x, y] of cells) field[cellIndex(x, y, WORLD.width)] = packCell(9, 9, 9, bond);
  return field;
}

/** @param {[number, number][]} cells @returns {Uint32Array} */
const water = (cells) => withBondAt(fieldWith([]), cells, WATER_BOND);

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

test("water falls before it does anything else", () => {
  const field = fieldWith([[3, 2], [5, 2]]);
  assert.deepEqual(waterFlow(field, 4, 3, WORLD, 0), { x: 0, y: -1 });
});

test("water takes a diagonal when it cannot go straight down", () => {
  const left = waterFlow(fieldWith([[4, 2], [5, 2]]), 4, 3, WORLD, 0);
  assert.deepEqual(left, { x: -1, y: -1 });
  const right = waterFlow(fieldWith([[3, 2], [4, 2]]), 4, 3, WORLD, 0);
  assert.deepEqual(right, { x: 1, y: -1 });
});

test("water spreads flat sideways where sand would stop", () => {
  // Solid all the way underneath. Sand calls this firm and stays; water walks
  // along it, and that is what makes a pool find its level.
  const field = fieldWith([[3, 2], [4, 2], [5, 2]]);
  assert.equal(supportAt(field, 4, 3, WORLD, 0).support, SUPPORT_FIRM, "sand would settle here");
  const flow = waterFlow(field, 4, 3, WORLD, 0);
  assert.equal(flow.y, 0);
  assert.ok(flow.x === -1 || flow.x === 1, "but water moves aside");
});

test("water with nowhere to go stays put, so a still pool is still", () => {
  // Boxed in below and to both sides — the inside of a pool. Anything else
  // would churn for ever.
  const field = fieldWith([[3, 2], [4, 2], [5, 2], [3, 3], [5, 3]]);
  assert.deepEqual(waterFlow(field, 4, 3, WORLD, 0), { x: 0, y: 0 });
});

test("the walls of the world hold water in", () => {
  const field = fieldWith([[0, 2], [1, 2]]);
  const flow = waterFlow(field, 0, 3, WORLD, 0);
  assert.ok(flow.x >= 0, "it must not flow out through the left wall");
});

test("a tie between two open sides is broken by the seed", () => {
  const field = fieldWith([[3, 2], [4, 2], [5, 2]]);
  const sides = Array.from({ length: 400 }, (_, seed) => waterFlow(field, 4, 3, WORLD, seed).x);
  const lefts = sides.filter((d) => d === -1).length;
  assert.ok(lefts > 150 && lefts < 250, `expected an even split, got ${lefts}/400`);
});

// --- Sinking ---------------------------------------------------------------

test("water holds nothing up, so it is not counted as a neighbour's support", () => {
  // The whole of sinking follows from this one line. A grain floating on a pool
  // has three water cells beneath it, and counting those as support is what
  // made sand sit on top of water like a raft.
  const drowned = water([[3, 2], [4, 2], [5, 2]]);
  assert.equal(neighbourSupport(drowned, 4, 3, WORLD).total, 0);
  const dry = fieldWith([[3, 2], [4, 2], [5, 2]]);
  assert.equal(neighbourSupport(dry, 4, 3, WORLD).total, 3);
});

test("sand trades places with the water directly beneath it", () => {
  const field = water([[4, 2]]);
  field[cellIndex(4, 3, WORLD.width)] = packCell(9, 9, 9, 3);
  assert.equal(displacesWater(field, 4, 3, WORLD), true);
});

test("water does not sink through itself, or a pool would churn for ever", () => {
  const field = water([[4, 2], [4, 3]]);
  assert.equal(displacesWater(field, 4, 3, WORLD), false);
});

test("nothing sinks into what is not water", () => {
  const field = fieldWith([[4, 2]]);
  field[cellIndex(4, 3, WORLD.width)] = packCell(9, 9, 9, 3);
  assert.equal(displacesWater(field, 4, 3, WORLD), false);
  assert.equal(displacesWater(fieldWith([]), 4, 3, WORLD), false, "and empty space is not water either");
});

test("bedrock stands in water rather than sinking through it", () => {
  const field = water([[4, 2]]);
  field[cellIndex(4, 3, WORLD.width)] = packCell(9, 9, 9, 0);
  assert.equal(displacesWater(field, 4, 3, WORLD), false);
});

test("a ledge its neighbours can hold does not dive into the water below it", () => {
  // Rock over a flooded pocket. Cohesion decides whether it sinks exactly as it
  // decides whether it falls: what is asked of a cell is unchanged, only the
  // fact that the water beneath it was never holding it up.
  const field = water([[3, 2], [4, 2], [5, 2]]);
  withBondAt(field, [[3, 3], [5, 3], [3, 4], [4, 4], [5, 4]], 2);
  withBondAt(field, [[4, 3]], 2);
  assert.equal(displacesWater(field, 4, 3, WORLD), false, "five rock neighbours is more than a bond of two");

  // Take its neighbours away and the same cell goes under.
  const lone = water([[3, 2], [4, 2], [5, 2]]);
  withBondAt(lone, [[4, 3]], 2);
  assert.equal(displacesWater(lone, 4, 3, WORLD), true);
});

test("a grain at the bottom of a pool rests on the floor and stays there", () => {
  const field = water([[3, 4], [4, 4], [5, 4], [3, 3], [5, 3]]);
  withBondAt(field, [[3, 2], [4, 2], [5, 2]], 2);
  withBondAt(field, [[4, 3]], 3);
  assert.equal(displacesWater(field, 4, 3, WORLD), false, "three cells of rock underneath is support enough");
});
