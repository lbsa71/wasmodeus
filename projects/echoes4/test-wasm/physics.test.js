import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function physics() {
  const { instance } = await WebAssembly.instantiate(await readFile(new URL("../public/echoes4.wasm", import.meta.url)));
  return instance.exports;
}
test("mass maps to area and speed increases with size", async () => {
  const math = await physics();
  for (const mass of [0.25, 1, 4, 9, 16, 256]) {
    assert.equal(math.radius(mass, 20, 4), 20 * Math.sqrt(mass / 4));
    assert.ok(Math.abs(math.speed(mass, 4, 180, 0.35) - 180 * (mass / 4) ** 0.35) < 1e-8);
  }
});
test("equal fish cannot feed; contact includes the body edges", async () => {
  const math = await physics();
  assert.equal(math.canEat(4, 4, 1.08), 0);
  assert.equal(math.canEat(8, 4, 1.08), 1);
  assert.equal(math.canEat(4, 8, 1.08), 0);
  assert.equal(math.touches(0, 0, 10, 20, 0, 10), 1);
  assert.equal(math.touches(0, 0, 10, 20.001, 0, 10), 0);
});
