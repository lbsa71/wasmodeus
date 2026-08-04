import test from "node:test";
import assert from "node:assert/strict";

import { loadWasm } from "../test-support/wasm-helper.js";

const wasm = await loadWasm(new URL("../public/galaxy-core.wasm", import.meta.url));

test("Wasm owns the exact root population and deterministic star properties", () => {
  const children = Array.from({ length: 8 }, (_, child) => wasm.getRootChildStarCount(child));
  assert.equal(wasm.getGalaxyStarCount(), 100_000_000_000);
  assert.equal(children.reduce((sum, count) => sum + count, 0), wasm.getGalaxyStarCount());
  assert.equal(wasm.getSeededMass(0, 123, 17), wasm.getSeededMass(0, 123, 17));
});

test("Wasm's galaxy model stays normalized at the solar circle", () => {
  assert.ok(Math.abs(wasm.getCircularVelocityKmPerSecond(8) - 220) < 0.5);
});
