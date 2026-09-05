import test from "node:test";
import assert from "node:assert/strict";

import { MATERIALS, RUBBLE_BOND, isGold } from "../src/core/palette.js";
import { packCell } from "../src/core/field-format.js";

/** @param {[number, number, number]} rgb @param {number} jitter @returns {number} */
const shade = ([r, g, b], jitter) => packCell(
  Math.min(255, Math.max(0, r + jitter)),
  Math.min(255, Math.max(0, g + jitter)),
  Math.min(255, Math.max(0, b + jitter)),
);

test("gold is told apart by what it looks like, at either extreme of its grain", () => {
  // A pixel carries its colour everywhere it goes and nothing else, so a
  // nugget blown out of a wall and settled somewhere else is still gold. That
  // only works if no other material can ever look like it.
  const { rgb, grain } = MATERIALS.gold;
  for (const jitter of [-grain, 0, grain]) {
    assert.equal(isGold(shade(rgb, jitter)), true, `gold at jitter ${jitter}`);
  }
});

test("nothing else in the palette can be mistaken for gold", () => {
  for (const [name, { rgb, grain }] of Object.entries(MATERIALS)) {
    if (name === "gold") continue;
    for (const jitter of [-grain, grain]) {
      assert.equal(isGold(shade(rgb, jitter)), false, `${name} at jitter ${jitter} reads as gold`);
    }
  }
  assert.equal(isGold(0x00e8d0 | 0x01000000), false, "a lemming's pixels are not gold either");
});

test("gold is a solid, so a seam of it holds together until it is dug", () => {
  assert.ok(MATERIALS.gold.bond < RUBBLE_BOND);
  assert.ok(MATERIALS.gold.bond > 0, "but it is not bedrock: it can be dug");
});
