import test from "node:test";
import assert from "node:assert/strict";

import {
  GALAXY_STAR_COUNT,
  OctreeCatalog,
  sectorPathForPoint,
} from "../src/core/octree.js";

test("the octree conserves the exact galaxy population at every split", () => {
  const catalog = new OctreeCatalog(0x1234n);
  const root = catalog.root();
  const children = catalog.children(root);

  assert.equal(root.starCount, GALAXY_STAR_COUNT);
  assert.equal(children.reduce((sum, child) => sum + child.starCount, 0n), root.starCount);

  for (const child of children) {
    assert.equal(
      catalog.children(child).reduce((sum, grandchild) => sum + grandchild.starCount, 0n),
      child.starCount,
    );
  }
});

test("sector paths and generated stars are independent of access order", () => {
  const catalog = new OctreeCatalog(42n);
  const path = sectorPathForPoint(8_000, 0, 0);
  const reverse = new OctreeCatalog(42n);

  reverse.starAt(path, 19);
  const first = catalog.starAt(path, 19);
  catalog.starAt(sectorPathForPoint(-1_000, 400, 5), 2);
  const second = catalog.starAt(path, 19);

  assert.deepEqual(second, first);
  assert.deepEqual(reverse.starAt(path, 19), first);
});
