import assert from "node:assert/strict";
import test from "node:test";

import {
  constructionValue,
  selectFrugalUpgrade,
} from "../src/road-adaptation-policy.js";

test("construction value rewards pressure relief and penalizes new asphalt", () => {
  assert.equal(
    constructionValue({ peakDemand: 1, pressure: 200, newTiles: 4 }),
    0,
  );
  assert.ok(
    constructionValue({ peakDemand: 2, pressure: 200, newTiles: 4 }) > 0,
  );
  assert.ok(
    constructionValue({ peakDemand: 5, pressure: 200, newTiles: 2 }) >
      constructionValue({ peakDemand: 5, pressure: 200, newTiles: 4 }),
  );
});

test("the frugal selector chooses the most relief per constructed tile", () => {
  const selected = selectFrugalUpgrade(
    [
      { tile: 90, peakDemand: 7, pressure: 300, newTiles: 4 },
      { tile: 42, peakDemand: 5, pressure: 260, newTiles: 2 },
      { tile: 12, peakDemand: 9, pressure: 500, newTiles: 8 },
    ],
    4,
  );

  assert.equal(selected?.tile, 42);
});

test("the selector respects the remaining construction budget", () => {
  assert.equal(
    selectFrugalUpgrade(
      [{ tile: 12, peakDemand: 9, pressure: 500, newTiles: 5 }],
      4,
    ),
    undefined,
  );
});
