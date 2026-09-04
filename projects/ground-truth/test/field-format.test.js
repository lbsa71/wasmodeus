import test from "node:test";
import assert from "node:assert/strict";

import {
  COLOR_MASK,
  DISLODGE_BIT,
  EMPTY,
  OCCUPIED_BIT,
  cellColor,
  clearDislodged,
  isDislodged,
  isOccupied,
  markDislodged,
  packCell,
  settledCell,
  unpackCell,
} from "../src/core/field-format.js";

test("a packed cell round-trips its colour channels", () => {
  const word = packCell(12, 200, 255);
  assert.deepEqual(unpackCell(word), { r: 12, g: 200, b: 255 });
});

test("pure black is still distinguishable from an empty cell", () => {
  const black = packCell(0, 0, 0);
  assert.notEqual(black, EMPTY);
  assert.equal(black, OCCUPIED_BIT);
  assert.equal(isOccupied(black), true);
  assert.equal(isOccupied(EMPTY), false);
});

test("the dislodge mark sets and clears without disturbing the colour", () => {
  const word = packCell(31, 62, 93);
  const marked = markDislodged(word);
  assert.equal(isDislodged(word), false);
  assert.equal(isDislodged(marked), true);
  assert.equal(cellColor(marked), cellColor(word));
  assert.equal(clearDislodged(marked), word);
});

test("a marked cell still reads as occupied so a hit never empties it", () => {
  assert.equal(isOccupied(markDislodged(packCell(0, 0, 0))), true);
});

test("settling re-adds occupancy to a bare colour payload", () => {
  const word = packCell(9, 8, 7);
  assert.equal(settledCell(cellColor(markDislodged(word))), word);
});

test("the colour mask leaves the bookkeeping bits alone", () => {
  assert.equal(COLOR_MASK & OCCUPIED_BIT, 0);
  assert.equal(COLOR_MASK & DISLODGE_BIT, 0);
});
