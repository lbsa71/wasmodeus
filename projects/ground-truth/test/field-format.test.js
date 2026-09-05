import test from "node:test";
import assert from "node:assert/strict";

import {
  COLOR_MASK,
  DISLODGE_BIT,
  EMPTY,
  OCCUPIED_BIT,
  BOND_MASK,
  MATERIAL_MASK,
  MAX_BOND,
  VOID_BIT,
  VOID_CELL,
  WATER_BOND,
  blocks,
  isVoid,
  cellBond,
  cellColor,
  clearDislodged,
  isDislodged,
  isOccupied,
  material,
  withBond,
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

test("the bond is part of the material, not of the colour", () => {
  const sand = packCell(9, 8, 7, 5);
  const rock = packCell(9, 8, 7, 2);
  assert.equal(cellBond(sand), 5);
  assert.equal(cellBond(rock), 2);
  assert.equal(cellColor(sand), cellColor(rock), "the two look identical");
  assert.notEqual(sand, rock);
});

test("a bond of zero is bedrock and survives a round trip", () => {
  const bedrock = packCell(9, 8, 7, 0);
  assert.equal(cellBond(bedrock), 0);
  assert.equal(cellBond(withBond(bedrock, MAX_BOND)), MAX_BOND);
  assert.equal(cellBond(withBond(withBond(bedrock, 7), 0)), 0);
});

test("changing the bond disturbs nothing else about the cell", () => {
  const word = packCell(31, 62, 93, 4);
  const rebonded = withBond(word, 6);
  assert.equal(cellColor(rebonded), cellColor(word));
  assert.equal(isOccupied(rebonded), true);
  assert.equal(cellBond(rebonded), 6);
});

test("a bond beyond the four bits it has is clamped, not wrapped", () => {
  assert.equal(cellBond(packCell(1, 2, 3, 99)), MAX_BOND);
  assert.equal(cellBond(withBond(packCell(1, 2, 3, 4), -5)), 0);
});

test("a pixel lands as rubble whatever it was before", () => {
  // Blasted stone must not re-freeze into cliff face that holds a ceiling up.
  const rock = packCell(9, 8, 7, 2);
  const settled = settledCell(material(markDislodged(rock)), 5);
  assert.equal(cellColor(settled), cellColor(rock));
  assert.equal(cellBond(settled), 5);
  assert.equal(isOccupied(settled), true);
  assert.equal(isDislodged(settled), false);
});

test("the material mask keeps the colour and the bond and nothing else", () => {
  assert.equal(MATERIAL_MASK & DISLODGE_BIT, 0);
  assert.equal(MATERIAL_MASK & OCCUPIED_BIT, 0);
  assert.equal(MATERIAL_MASK & BOND_MASK, BOND_MASK);
  assert.equal(MATERIAL_MASK & COLOR_MASK, COLOR_MASK);
});

test("the colour mask leaves the bookkeeping bits alone", () => {
  assert.equal(COLOR_MASK & OCCUPIED_BIT, 0);
  assert.equal(COLOR_MASK & DISLODGE_BIT, 0);
});

test("the placeholder is a real cell that is nothing", () => {
  // Underground emptiness is not absence. It is a cell that is present — so
  // a tunnel keeps its shape and holds its own roof up — but black, with no
  // colour and no bond, and never carried anywhere: it is what a moving pixel
  // replaces when it comes to rest.
  assert.equal(isOccupied(VOID_CELL), true, "present, so it counts as a neighbour");
  assert.equal(isVoid(VOID_CELL), true);
  assert.equal(cellColor(VOID_CELL), 0, "and black");
  assert.equal(cellBond(VOID_CELL), 0);
  assert.equal(MATERIAL_MASK & VOID_BIT, 0, "a pixel never carries it");
  assert.equal(VOID_BIT & (OCCUPIED_BIT | BOND_MASK | COLOR_MASK | DISLODGE_BIT), 0, "it has a bit of its own");
});

test("what blocks a pixel is anything present except the placeholder", () => {
  assert.equal(blocks(EMPTY), false);
  assert.equal(blocks(VOID_CELL), false, "a pixel falls straight through a tunnel");
  assert.equal(blocks(packCell(1, 2, 3, 2)), true);
  assert.equal(blocks(packCell(1, 2, 3, WATER_BOND)), true, "water blocks even though it holds nothing up");
  assert.equal(isVoid(packCell(0, 0, 0, 0)), false, "black bedrock is not the placeholder");
});
