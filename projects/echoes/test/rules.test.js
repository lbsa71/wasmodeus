import test from "node:test";
import assert from "node:assert/strict";
import { opening, applyMove, legalMoves, isLegal } from "../src/core/rules.js";
import { canonicalKey, transformBoard, matchingTransforms, transformMove } from "../src/core/symmetry.js";

const Y = { from: { x: 1, y: 2 }, to: { x: 2, y: 1 } };
const Z = { from: { x: 0, y: 1 }, to: { x: 1, y: 2 } };
const W = { from: { x: 2, y: 0 }, to: { x: 3, y: 1 } };

test("the opening has eight connected stones and the designated resting stone", () => {
  assert.equal(opening().stones.length, 8);
  assert.deepEqual(opening().resting, { x: 1, y: 0 });
  assert.equal(isLegal(opening(), Y), true);
});
test("moves reject resting stones, occupied destinations, long jumps, and disconnections", () => {
  const board = opening();
  assert.equal(isLegal(board, { from: board.resting, to: { x: 1, y: -1 } }), false);
  assert.equal(isLegal(board, { from: { x: 1, y: 2 }, to: { x: 0, y: 2 } }), false);
  assert.equal(isLegal(board, { from: { x: 1, y: 2 }, to: { x: 4, y: 2 } }), false);
  assert.equal(isLegal(board, { from: { x: 0, y: 0 }, to: { x: -1, y: -1 } }), false);
  assert.throws(() => applyMove(board, { from: board.resting, to: { x: 1, y: -1 } }));
});
test("the recorded Y rotates into Z, preserving the resting marker and permitting escape W", () => {
  const before = opening();
  const afterY = applyMove(before, Y);
  assert.deepEqual(before, opening(), "movement must not mutate historical positions");
  assert.equal(canonicalKey(before), canonicalKey(afterY));
  const transforms = matchingTransforms(before, afterY);
  assert.ok(transforms.some(t => JSON.stringify(transformMove(Y, t)) === JSON.stringify(Z)));
  const afterZ = applyMove(afterY, Z);
  assert.equal(canonicalKey(before), canonicalKey(afterZ));
  assert.notEqual(canonicalKey(afterZ), canonicalKey(applyMove(afterZ, W)));
  assert.equal(isLegal(afterY, { from: Y.to, to: Y.from }), false, "the ghost cannot immediately undo");
});
test("canonical positions ignore all eight orientations and translations, but include the resting marker", () => {
  const board = applyMove(applyMove(opening(), Y), Z);
  for (let orientation = 0; orientation < 8; orientation++) {
    assert.equal(canonicalKey(transformBoard(board, { orientation, dx: -17, dy: 29 })), canonicalKey(board));
  }
  const changed = { ...board, resting: { x: 1, y: 1 } };
  assert.notEqual(canonicalKey(changed), canonicalKey(board));
});
test("every transformed legal move stays legal and has an equivalent result", () => {
  for (const move of legalMoves(opening())) {
    for (let orientation = 0; orientation < 8; orientation++) {
      const t = { orientation, dx: 4, dy: -5 };
      const mapped = transformMove(move, t);
      const transformed = transformBoard(opening(), t);
      assert.equal(isLegal(transformed, mapped), true);
      assert.equal(canonicalKey(applyMove(transformed, mapped)), canonicalKey(applyMove(opening(), move)));
    }
  }
});
