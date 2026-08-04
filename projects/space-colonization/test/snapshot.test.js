import test from "node:test";
import assert from "node:assert/strict";

import { encodeStarSnapshot, packStarColor, SECTOR_GRID_FLAG, shouldSubdivideOctreeNode } from "../src/simulation/snapshot.js";

test("snapshot LOD threshold and star colors are deterministic", () => {
  assert.equal(shouldSubdivideOctreeNode(4), false);
  assert.equal(shouldSubdivideOctreeNode(4.01), true);
  assert.equal(packStarColor(5_800), packStarColor(5_800));
  assert.equal(encodeStarSnapshot([{ position: [0, 0, 0], apparentFlux: 1, color: 1, pickHandle: 1 }]).byteLength, 32);
});

test("sector grid records preserve their outline render flag", () => {
  const buffer = encodeStarSnapshot([{ position: [0, 0, 0], apparentFlux: 1, color: 1, pickHandle: 0, flags: SECTOR_GRID_FLAG, radius: 15.625 }]);
  assert.equal(new Uint32Array(buffer, 16, 4)[2], SECTOR_GRID_FLAG);
});
