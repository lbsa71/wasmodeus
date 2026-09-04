import test from "node:test";
import assert from "node:assert/strict";

import {
  SKY_CELL,
  cellBelow,
  cellIndex,
  cellOfPosition,
  cellX,
  cellY,
  inBounds,
  isBlocked,
} from "../src/core/geometry.js";
import { packCell } from "../src/core/field-format.js";

const WIDTH = 8;
const HEIGHT = 4;

test("cell indices round-trip through their coordinates", () => {
  const index = cellIndex(5, 3, WIDTH);
  assert.equal(cellX(index, WIDTH), 5);
  assert.equal(cellY(index, WIDTH), 3);
});

test("the cell below is one row towards the floor", () => {
  assert.equal(cellBelow(cellIndex(2, 2, WIDTH), WIDTH), cellIndex(2, 1, WIDTH));
});

test("bounds exclude the row above and the row below the world", () => {
  assert.equal(inBounds(0, 0, WIDTH, HEIGHT), true);
  assert.equal(inBounds(0, -1, WIDTH, HEIGHT), false);
  assert.equal(inBounds(0, HEIGHT, WIDTH, HEIGHT), false);
  assert.equal(inBounds(WIDTH, 0, WIDTH, HEIGHT), false);
});

test("the side walls and the floor block, but the sky does not", () => {
  const field = new Uint32Array(WIDTH * HEIGHT);
  assert.equal(isBlocked(field, -1, 1, WIDTH, HEIGHT), true, "left wall");
  assert.equal(isBlocked(field, WIDTH, 1, WIDTH, HEIGHT), true, "right wall");
  assert.equal(isBlocked(field, 1, -1, WIDTH, HEIGHT), true, "floor");
  assert.equal(isBlocked(field, 1, HEIGHT, WIDTH, HEIGHT), false, "open sky");
});

test("an occupied cell blocks and an empty one does not", () => {
  const field = new Uint32Array(WIDTH * HEIGHT);
  field[cellIndex(3, 2, WIDTH)] = packCell(1, 2, 3);
  assert.equal(isBlocked(field, 3, 2, WIDTH, HEIGHT), true);
  assert.equal(isBlocked(field, 3, 1, WIDTH, HEIGHT), false);
});

test("a pixel above the world reports the sky sentinel, not a wrapped cell", () => {
  assert.equal(cellOfPosition(2.5, 1.5, WIDTH, HEIGHT), cellIndex(2, 1, WIDTH));
  assert.equal(cellOfPosition(2.5, HEIGHT + 3.5, WIDTH, HEIGHT), SKY_CELL);
});
