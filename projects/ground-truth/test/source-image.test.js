import test from "node:test";
import assert from "node:assert/strict";

import { createSourceField, fieldFromImageData } from "../src/core/source-image.js";
import { cellIndex } from "../src/core/geometry.js";
import { isOccupied, unpackCell } from "../src/core/field-format.js";

const WORLD = { width: 64, height: 64 };

test("the generated scene is deterministic for a seed", () => {
  assert.deepEqual(createSourceField({ ...WORLD, seed: 7 }), createSourceField({ ...WORLD, seed: 7 }));
  assert.notDeepEqual(createSourceField({ ...WORLD, seed: 7 }), createSourceField({ ...WORLD, seed: 8 }));
});

test("nothing in the starting scene is unsupported", () => {
  // Otherwise the whole image avalanches on frame one and the fountain never
  // gets a chance to be the thing that starts the erosion.
  const field = createSourceField({ ...WORLD, seed: 3 });
  for (let y = 1; y < WORLD.height; y += 1) {
    for (let x = 0; x < WORLD.width; x += 1) {
      if (!isOccupied(field[cellIndex(x, y, WORLD.width)])) continue;
      assert.ok(
        isOccupied(field[cellIndex(x, y - 1, WORLD.width)]),
        `cell ${x},${y} has nothing underneath it`,
      );
    }
  }
});

test("the ground fills the bottom rows the fountain draws from", () => {
  const field = createSourceField({ ...WORLD, seed: 1 });
  for (let x = 0; x < WORLD.width; x += 1) {
    assert.ok(isOccupied(field[cellIndex(x, 0, WORLD.width)]), `column ${x} has no floor`);
  }
});

test("the scene leaves sky for the fountain to arc through", () => {
  const field = createSourceField({ ...WORLD, seed: 1 });
  const filled = field.reduce((count, word) => count + (word === 0 ? 0 : 1), 0);
  assert.ok(filled < field.length * 0.75, "the world is not packed solid");
  assert.ok(filled > field.length * 0.2, "there is something to erode");
});

/**
 * @param {number} width @param {number} height
 * @param {(x: number, y: number) => [number, number, number, number]} shade
 */
function image(width, height, shade) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) data.set(shade(x, y), (y * width + x) * 4);
  }
  return { width, height, data };
}

test("a loaded image is flipped so its top row ends up highest in the world", () => {
  const source = image(2, 2, (_x, y) => (y === 0 ? [255, 0, 0, 255] : [0, 0, 255, 255]));
  const field = fieldFromImageData(source, { width: 4, height: 4, offsetX: 1, offsetY: 0 });
  assert.deepEqual(unpackCell(field[cellIndex(1, 1, 4)]), { r: 255, g: 0, b: 0 }, "image top row is world row 1");
  assert.deepEqual(unpackCell(field[cellIndex(1, 0, 4)]), { r: 0, g: 0, b: 255 }, "image bottom row is world row 0");
});

test("transparent pixels are absent rather than black — alpha is not stored", () => {
  const source = image(2, 1, (x) => (x === 0 ? [10, 20, 30, 255] : [10, 20, 30, 0]));
  const field = fieldFromImageData(source, { width: 2, height: 1 });
  assert.ok(isOccupied(field[cellIndex(0, 0, 2)]));
  assert.equal(isOccupied(field[cellIndex(1, 0, 2)]), false);
});

test("pixels placed outside the world are dropped, not wrapped", () => {
  const source = image(4, 1, () => [1, 2, 3, 255]);
  const field = fieldFromImageData(source, { width: 2, height: 1, offsetX: 1 });
  assert.equal(field.length, 2);
  assert.equal(isOccupied(field[0]), false);
  assert.ok(isOccupied(field[1]));
});
